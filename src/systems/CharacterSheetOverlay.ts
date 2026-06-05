import { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, TextBlock, Button, StackPanel, ScrollViewer, Control,
} from '@babylonjs/gui';
import {
  CharacterStats, AttributeId, ATTRIBUTES, SKILLS,
  PERK_TIERS, PERK_TIER_STEP, unlockedTierCount, perksForTier, chosenPerkAt, pickPerk,
  totalPerkPoints,
} from '@entities/CharacterStats';
import { t, type Locale } from '@systems/I18n';

/** Per-attribute neon accent — gives each attribute + its skills + perk tree a colour identity. */
const ATTR_COLOR: Record<AttributeId, string> = {
  forca: '#ff6b5e',        // red
  destreza: '#37c8ff',     // cyan-blue
  inteligencia: '#b98bff', // violet
  carisma: '#ffce4d',      // gold
};

// ─── Pure view-model ──────────────────────────────────────────────────────────

export interface AttrRow {
  id: AttributeId;
  label: string;
  description: string;
  value: number;
}

export interface SkillRow {
  id: string;
  label: string;
  description: string;
  attribute: AttributeId;
  value: number;
}

export type PerkState = 'locked' | 'available' | 'chosen' | 'pickable';

export interface PerkRow {
  id: string;
  label: string;
  description: string;
  tier: number;
  state: PerkState;
}

export interface TierGroup {
  tier: number;
  unlocked: boolean;
  requiredPct: number;
  perks: PerkRow[];
}

export interface AttrPerkTree {
  attrId: AttributeId;
  label: string;
  availablePoints: number;
  tiers: TierGroup[];
}

export interface SheetState {
  attributes: AttrRow[];
  skills: SkillRow[];
  perkTrees: AttrPerkTree[];
  totalPoints: number;
}

/** Build the pure view model for the character sheet. */
export function buildSheetState(stats: CharacterStats, _locale?: Locale): SheetState {
  const attributes: AttrRow[] = ATTRIBUTES.map((a) => ({
    id: a.id,
    label: t(`attr.${a.id}`),
    description: t(`attr.${a.id}.desc`),
    value: Math.round(stats.attributes[a.id]),
  }));

  const skills: SkillRow[] = SKILLS.map((s) => ({
    id: s.id,
    label: t(`skill.${s.id}`),
    description: t(`skill.${s.id}.desc`),
    attribute: s.attribute,
    value: Math.round(stats.skills[s.id] ?? 10),
  }));

  const perkTrees: AttrPerkTree[] = ATTRIBUTES.map((a) => {
    const attrVal = stats.attributes[a.id];
    const unlockedTiers = unlockedTierCount(attrVal);
    const availablePoints = stats.perkPoints?.[a.id] ?? 0;

    const tiers: TierGroup[] = [];
    for (let tier = 1; tier <= PERK_TIERS; tier++) {
      const unlocked = tier <= unlockedTiers;
      const perks = perksForTier(a.id, tier).map((p) => {
        const chosen = stats.perks.includes(p.id);
        const slotFilled = chosenPerkAt(stats, a.id, tier) !== null;
        let state: PerkState;
        if (!unlocked) {
          state = 'locked';
        } else if (chosen) {
          state = 'chosen';
        } else if (slotFilled) {
          state = 'available'; // slot already taken by the other perk in this tier
        } else if (availablePoints > 0) {
          state = 'pickable';
        } else {
          state = 'available';
        }
        return {
          id: p.id,
          label: t(`perk.${p.id}`),
          description: t(`perk.${p.id}.desc`),
          tier,
          state,
        };
      });
      tiers.push({ tier, unlocked, requiredPct: tier * PERK_TIER_STEP, perks });
    }

    return {
      attrId: a.id,
      label: t(`attr.${a.id}`),
      availablePoints,
      tiers,
    };
  });

  return { attributes, skills, perkTrees, totalPoints: totalPerkPoints(stats) };
}

// ─── Overlay ─────────────────────────────────────────────────────────────────

export interface CharacterSheetHandlers {
  /** Called when a perk was successfully picked — persist the new stats. */
  onPerkPick?: (updatedStats: CharacterStats) => void;
  /** Called when the overlay closes — unfreeze the world. */
  onClose?: () => void;
}

export class CharacterSheetOverlay {
  private scene: Scene;
  private open = false;
  private handlers: CharacterSheetHandlers = {};

  private playerStats: CharacterStats | null = null;
  private gui: AdvancedDynamicTexture | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  isOpen(): boolean { return this.open; }

  setHandlers(h: CharacterSheetHandlers): void { this.handlers = h; }

  /** Open the overlay for the given stats. */
  show(stats: CharacterStats): void {
    if (this.open) return;
    this.playerStats = stats;
    this.open = true;
    if (typeof document === 'undefined') return;
    /* istanbul ignore next */
    this.buildGui();
  }

  /** Close and dispose the overlay. */
  hide(): void {
    if (!this.open) return;
    this.open = false;
    /* istanbul ignore next */
    if (this.gui) { this.gui.dispose(); this.gui = null; }
    this.handlers.onClose?.();
  }

  /* istanbul ignore next — browser GUI */
  private buildGui(): void {
    const stats = this.playerStats!;
    const sheet = buildSheetState(stats);

    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('char-sheet-ui', true, this.scene);

    // Full-screen dim scrim behind the panel.
    const scrim = new Rectangle('cs-scrim');
    scrim.width = '100%'; scrim.height = '100%';
    scrim.background = 'rgba(2,5,11,0.86)';
    scrim.thickness = 0;
    this.gui.addControl(scrim);

    // Centred panel frame (responsive — % of the screen, capped sensibly).
    const frame = new Rectangle('cs-frame');
    frame.width = '92%'; frame.height = '90%';
    frame.background = 'rgba(7,14,24,0.98)';
    frame.color = '#0c4d57';
    frame.thickness = 2;
    frame.cornerRadius = 12;
    scrim.addControl(frame);

    // ── Header bar ──
    const header = new Rectangle('cs-header');
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.height = '56px';
    header.background = 'rgba(0,28,38,0.95)';
    header.thickness = 0;
    frame.addControl(header);

    const accentLine = new Rectangle('cs-accent');
    accentLine.verticalAlignment = Control.VERTICAL_ALIGNMENT_BOTTOM;
    accentLine.height = '2px';
    accentLine.background = '#00FFCC';
    accentLine.thickness = 0;
    header.addControl(accentLine);

    const title = new TextBlock('cs-title');
    title.text = t('sheet.title');
    title.color = '#00FFCC';
    title.fontSize = 22;
    title.fontFamily = '"Courier New", monospace';
    title.fontStyle = 'bold';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.left = '24px';
    header.addControl(title);

    // Total perk-points badge (gold) — only when the player has unspent points.
    if (sheet.totalPoints > 0) {
      const ptsBadge = new Rectangle('cs-pts-badge');
      ptsBadge.width = '150px'; ptsBadge.height = '28px';
      ptsBadge.cornerRadius = 14;
      ptsBadge.background = 'rgba(60,46,0,0.85)';
      ptsBadge.color = '#FFCE4D';
      ptsBadge.thickness = 1;
      ptsBadge.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      ptsBadge.left = '-140px';
      header.addControl(ptsBadge);
      const ptsTxt = new TextBlock('cs-pts-txt');
      ptsTxt.text = t('sheet.perkPoints', { n: sheet.totalPoints });
      ptsTxt.color = '#FFCE4D';
      ptsTxt.fontSize = 12;
      ptsTxt.fontFamily = 'monospace';
      ptsBadge.addControl(ptsTxt);
    }

    const closeBtn = Button.CreateSimpleButton('cs-close', t('sheet.close'));
    closeBtn.width = '116px'; closeBtn.height = '34px';
    closeBtn.color = '#00FFCC'; closeBtn.background = 'rgba(0,40,50,0.9)';
    closeBtn.cornerRadius = 6;
    closeBtn.fontSize = 13; closeBtn.fontFamily = 'monospace';
    closeBtn.thickness = 1;
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.left = '-16px';
    closeBtn.onPointerUpObservable.add(() => this.hide());
    header.addControl(closeBtn);

    // ── Left column — attributes + skills (scrollable).
    // (Babylon GUI dimensions accept only px/%, NOT calc(); use top offset + %.)
    const leftScroll = new ScrollViewer('cs-left-scroll');
    leftScroll.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    leftScroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    leftScroll.top = '64px';
    leftScroll.left = '14px';
    leftScroll.width = '44%';
    leftScroll.height = '84%';
    leftScroll.thickness = 0;
    leftScroll.barColor = '#00FFCC55';
    leftScroll.barBackground = 'rgba(255,255,255,0.05)';
    frame.addControl(leftScroll);

    const leftPanel = new StackPanel('cs-left');
    leftPanel.width = '100%';
    leftPanel.spacing = 3;
    leftPanel.paddingLeft = '14px';
    leftPanel.paddingRight = '14px';
    leftPanel.paddingTop = '6px';
    leftScroll.addControl(leftPanel);

    // Attributes section
    this.addSectionHeader(t('sheet.attributes'), leftPanel);
    for (const a of sheet.attributes) {
      this.makeStatBlock(leftPanel, a.label, a.value, a.description, ATTR_COLOR[a.id], true);
    }

    // Skills section grouped by attribute
    this.addSectionHeader(t('sheet.skills'), leftPanel);
    let lastAttr: AttributeId | null = null;
    for (const s of sheet.skills) {
      if (s.attribute !== lastAttr) {
        lastAttr = s.attribute;
        const grpLbl = new TextBlock();
        grpLbl.text = `▸ ${t(`attr.${s.attribute}`).toUpperCase()}`;
        grpLbl.color = ATTR_COLOR[s.attribute];
        grpLbl.fontSize = 10;
        grpLbl.fontFamily = 'monospace';
        grpLbl.fontStyle = 'bold';
        grpLbl.height = '20px';
        grpLbl.paddingTop = '6px';
        grpLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        leftPanel.addControl(grpLbl);
      }
      this.makeStatBlock(leftPanel, s.label, s.value, s.description, ATTR_COLOR[s.attribute], false);
    }

    // ── Right column — perk tree (attribute tabs + scrollable tiers).
    const rightWrap = new Rectangle('cs-right');
    rightWrap.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    rightWrap.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    rightWrap.top = '64px';
    rightWrap.left = '-14px';
    rightWrap.width = '52%';
    rightWrap.height = '84%';
    rightWrap.thickness = 1;
    rightWrap.color = '#0c3540';
    rightWrap.background = 'rgba(0,12,20,0.6)';
    rightWrap.cornerRadius = 8;
    frame.addControl(rightWrap);

    // Tab row
    const tabRow = new StackPanel('cs-tabs');
    tabRow.isVertical = false;
    tabRow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    tabRow.height = '40px';
    tabRow.spacing = 4;
    tabRow.paddingTop = '8px';
    rightWrap.addControl(tabRow);

    // Perk tree area (below tabs)
    const treeScroll = new ScrollViewer('cs-tree-scroll');
    treeScroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    treeScroll.top = '48px';
    treeScroll.height = '86%';
    treeScroll.width = '100%';
    treeScroll.thickness = 0;
    treeScroll.barColor = '#00FFCC55';
    treeScroll.barBackground = 'rgba(255,255,255,0.05)';
    rightWrap.addControl(treeScroll);

    const treePanel = new StackPanel('cs-tree');
    treePanel.width = '100%';
    treePanel.spacing = 4;
    treePanel.paddingLeft = '14px';
    treePanel.paddingRight = '14px';
    treePanel.paddingTop = '6px';
    treePanel.paddingBottom = '12px';
    treeScroll.addControl(treePanel);

    let activeAttrIdx = 0;

    const buildTree = (attrIdx: number): void => {
      treePanel.clearControls();
      const tree = sheet.perkTrees[attrIdx]!;
      const accent = ATTR_COLOR[tree.attrId];

      // Per-attribute points line (gold) when available.
      if (tree.availablePoints > 0) {
        const pts = new TextBlock('cs-pts');
        pts.text = `★ ${t('sheet.perkPoints', { n: tree.availablePoints })}`;
        pts.color = '#FFCE4D';
        pts.fontSize = 12;
        pts.fontFamily = 'monospace';
        pts.fontStyle = 'bold';
        pts.height = '24px';
        pts.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        treePanel.addControl(pts);
      }

      for (const tierGroup of tree.tiers) {
        const tierHdr = new TextBlock(`cs-tier-${tierGroup.tier}`);
        tierHdr.text = tierGroup.unlocked
          ? `── ${t('sheet.tierN', { n: tierGroup.tier })} ──`
          : `🔒 ${t('sheet.locked', { pct: tierGroup.requiredPct, attr: t(`attr.${tree.attrId}`) })}`;
        tierHdr.color = tierGroup.unlocked ? accent : '#445566';
        tierHdr.fontSize = 11;
        tierHdr.fontFamily = 'monospace';
        tierHdr.fontStyle = 'bold';
        tierHdr.height = '24px';
        tierHdr.paddingTop = '6px';
        tierHdr.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        treePanel.addControl(tierHdr);

        // Two perks side by side in a 2-column row (responsive 49% each).
        const perkRow = new Rectangle(`cs-prow-${tierGroup.tier}`);
        perkRow.width = '100%';
        perkRow.height = '88px';
        perkRow.thickness = 0;
        treePanel.addControl(perkRow);

        tierGroup.perks.forEach((p, i) => {
          const card = this.buildPerkCard(p, accent, stats);
          card.horizontalAlignment = i === 0
            ? Control.HORIZONTAL_ALIGNMENT_LEFT
            : Control.HORIZONTAL_ALIGNMENT_RIGHT;
          perkRow.addControl(card);
        });
      }
    };

    // Build attribute tabs
    const tabBtns: Button[] = [];
    sheet.perkTrees.forEach((tree, idx) => {
      const accent = ATTR_COLOR[tree.attrId];
      const hasPoints = tree.availablePoints > 0;
      const tab = Button.CreateSimpleButton(`cs-tab-${tree.attrId}`, tree.label + (hasPoints ? ' ★' : ''));
      tab.width = '108px'; tab.height = '30px';
      tab.color = accent;
      tab.fontSize = 12;
      tab.fontFamily = 'monospace';
      tab.cornerRadius = 6;
      tab.thickness = idx === activeAttrIdx ? 2 : 1;
      tab.background = idx === activeAttrIdx ? 'rgba(0,40,50,0.95)' : 'rgba(0,16,26,0.7)';
      tab.onPointerUpObservable.add(() => {
        activeAttrIdx = idx;
        tabBtns.forEach((b, i) => {
          b.background = i === idx ? 'rgba(0,40,50,0.95)' : 'rgba(0,16,26,0.7)';
          b.thickness = i === idx ? 2 : 1;
        });
        buildTree(idx);
      });
      tabBtns.push(tab);
      tabRow.addControl(tab);
    });

    buildTree(activeAttrIdx);
  }

  /* istanbul ignore next — browser GUI */
  private addSectionHeader(text: string, panel: StackPanel): void {
    const h = new TextBlock();
    h.text = text;
    h.color = '#00FFCC';
    h.fontSize = 14;
    h.fontFamily = '"Courier New", monospace';
    h.fontStyle = 'bold';
    h.height = '32px';
    h.paddingTop = '8px';
    h.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.addControl(h);
  }

  /**
   * One stat block: name + value on a row, a real filled progress bar, and (for
   * attributes) the description below. `prominent` = larger/attribute styling.
   */
  /* istanbul ignore next — browser GUI */
  private makeStatBlock(
    panel: StackPanel, label: string, value: number, desc: string,
    accent: string, prominent: boolean,
  ): void {
    const block = new StackPanel(`cs-block-${label}`);
    block.width = '100%';
    block.spacing = 2;
    block.paddingTop = '3px';
    block.paddingBottom = prominent ? '6px' : '3px';
    panel.addControl(block);

    // Name (left) + value (right) on one row.
    const top = new Rectangle(`cs-top-${label}`);
    top.width = '100%';
    top.height = prominent ? '20px' : '17px';
    top.thickness = 0;
    block.addControl(top);

    const nameLbl = new TextBlock();
    nameLbl.text = label;
    nameLbl.color = prominent ? '#E6F2FF' : '#AEC4D6';
    nameLbl.fontSize = prominent ? 13 : 11;
    nameLbl.fontFamily = 'monospace';
    nameLbl.fontStyle = prominent ? 'bold' : 'normal';
    nameLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    top.addControl(nameLbl);

    const valLbl = new TextBlock();
    valLbl.text = `${value}`;
    valLbl.color = accent;
    valLbl.fontSize = prominent ? 13 : 11;
    valLbl.fontFamily = 'monospace';
    valLbl.fontStyle = 'bold';
    valLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    top.addControl(valLbl);

    // Progress bar: track + filled portion (value%).
    const track = new Rectangle(`cs-track-${label}`);
    track.width = '100%';
    track.height = prominent ? '8px' : '6px';
    track.cornerRadius = prominent ? 4 : 3;
    track.thickness = 0;
    track.background = 'rgba(255,255,255,0.08)';
    block.addControl(track);

    const fill = new Rectangle(`cs-fill-${label}`);
    fill.width = `${Math.max(0, Math.min(100, value))}%`;
    fill.height = '100%';
    fill.cornerRadius = prominent ? 4 : 3;
    fill.thickness = 0;
    fill.background = accent;
    fill.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    track.addControl(fill);

    // Description (attributes get it inline; skills keep the list compact).
    if (desc && prominent) {
      const descLbl = new TextBlock(`cs-desc-${label}`);
      descLbl.text = desc;
      descLbl.color = '#6f879b';
      descLbl.fontSize = 10;
      descLbl.fontFamily = 'monospace';
      descLbl.textWrapping = true;
      descLbl.resizeToFit = true;
      descLbl.paddingTop = '2px';
      descLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      block.addControl(descLbl);
    }
  }

  /* istanbul ignore next — browser GUI */
  private buildPerkCard(p: PerkRow, accent: string, stats: CharacterStats): Rectangle {
    const card = new Rectangle(`cs-pcard-${p.id}`);
    card.width = '49%'; card.height = '82px';
    card.cornerRadius = 8;

    const styles: Record<PerkState, { bg: string; border: string; name: string; thickness: number }> = {
      locked:    { bg: 'rgba(12,20,28,0.6)',  border: '#1d2c38', name: '#3f5263', thickness: 1 },
      available: { bg: 'rgba(0,22,34,0.8)',   border: '#26414f', name: '#90a8ba', thickness: 1 },
      chosen:    { bg: 'rgba(0,46,38,0.9)',   border: accent,    name: accent,    thickness: 2 },
      pickable:  { bg: 'rgba(28,40,8,0.85)',  border: '#FFCE4D', name: '#F2F0C0', thickness: 2 },
    };
    const s = styles[p.state];
    card.background = s.bg;
    card.color = s.border;
    card.thickness = s.thickness;

    const inner = new StackPanel(`cs-pinner-${p.id}`);
    inner.width = '92%';
    inner.paddingTop = '6px';
    inner.spacing = 3;
    card.addControl(inner);

    // Name row with a small state tag on the right (✓ chosen / + pick).
    const nameRow = new Rectangle(`cs-pname-${p.id}`);
    nameRow.width = '100%'; nameRow.height = '18px'; nameRow.thickness = 0;
    inner.addControl(nameRow);

    const nameLbl = new TextBlock();
    nameLbl.text = p.label;
    nameLbl.color = s.name;
    nameLbl.fontSize = 12;
    nameLbl.fontFamily = 'monospace';
    nameLbl.fontStyle = (p.state === 'chosen' || p.state === 'pickable') ? 'bold' : 'normal';
    nameLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    nameRow.addControl(nameLbl);

    if (p.state === 'chosen' || p.state === 'pickable') {
      const tag = new TextBlock();
      tag.text = p.state === 'chosen' ? `✓ ${t('sheet.chosen')}` : `+ ${t('sheet.pick')}`;
      tag.color = p.state === 'chosen' ? accent : '#FFCE4D';
      tag.fontSize = 10;
      tag.fontFamily = 'monospace';
      tag.fontStyle = 'bold';
      tag.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      nameRow.addControl(tag);
    }

    const descLbl = new TextBlock();
    descLbl.text = p.state === 'locked' ? '— locked —' : p.description;
    descLbl.color = p.state === 'locked' ? '#3f5263' : '#7d93a6';
    descLbl.fontSize = 10;
    descLbl.fontFamily = 'monospace';
    descLbl.height = '48px';
    descLbl.width = '100%';
    descLbl.textWrapping = true;
    descLbl.textVerticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    descLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    inner.addControl(descLbl);

    if (p.state === 'pickable') {
      card.isPointerBlocker = true;
      card.hoverCursor = 'pointer';
      card.onPointerEnterObservable.add(() => { card.background = 'rgba(44,60,12,0.95)'; });
      card.onPointerOutObservable.add(() => { card.background = s.bg; });
      card.onPointerUpObservable.add(() => {
        const updated = pickPerk(p.id, stats);
        if (!updated) return;
        this.playerStats = updated;
        this.handlers.onPerkPick?.(updated);
        // Rebuild the GUI with the new stats (reflects the spent point).
        this.gui?.dispose();
        this.gui = null;
        this.buildGui();
      });
    }

    return card;
  }
}