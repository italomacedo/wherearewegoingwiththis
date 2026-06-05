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

    // Dark overlay background
    const bg = new Rectangle('cs-bg');
    bg.width = '100%'; bg.height = '100%';
    bg.background = 'rgba(0,8,16,0.93)';
    bg.thickness = 0;
    this.gui.addControl(bg);

    // ── Header ──
    const header = new Rectangle('cs-header');
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.height = '48px';
    header.background = 'rgba(0,20,35,0.95)';
    header.thickness = 0;
    bg.addControl(header);

    const title = new TextBlock('cs-title');
    title.text = t('sheet.title');
    title.color = '#00FFCC';
    title.fontSize = 20;
    title.fontFamily = '"Courier New", monospace';
    title.fontStyle = 'bold';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    title.left = '20px';
    header.addControl(title);

    const closeBtn = Button.CreateSimpleButton('cs-close', t('sheet.close'));
    closeBtn.width = '100px'; closeBtn.height = '32px';
    closeBtn.color = '#888'; closeBtn.background = 'rgba(0,20,30,0.8)';
    closeBtn.fontSize = 12; closeBtn.fontFamily = 'monospace';
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.left = '-12px';
    closeBtn.onPointerUpObservable.add(() => this.hide());
    header.addControl(closeBtn);

    // ── Content area ──
    const content = new Rectangle('cs-content');
    content.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    content.top = '48px';
    content.height = 'calc(100% - 48px)';
    content.width = '100%';
    content.thickness = 0;
    bg.addControl(content);

    // Left column — attributes + skills
    const leftScroll = new ScrollViewer('cs-left-scroll');
    leftScroll.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    leftScroll.width = '42%';
    leftScroll.height = '100%';
    leftScroll.thickness = 0;
    leftScroll.barColor = '#00FFCC44';
    content.addControl(leftScroll);

    const leftPanel = new StackPanel('cs-left');
    leftPanel.spacing = 2;
    leftPanel.paddingLeft = '16px';
    leftPanel.paddingRight = '8px';
    leftPanel.paddingTop = '10px';
    leftScroll.addControl(leftPanel);

    const addSectionHeader = (text: string, panel: StackPanel): void => {
      const h = new TextBlock();
      h.text = text;
      h.color = '#00FFCC';
      h.fontSize = 13;
      h.fontFamily = 'monospace';
      h.fontStyle = 'bold';
      h.height = '28px';
      h.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      panel.addControl(h);
    };

    // Attributes section
    addSectionHeader(t('sheet.attributes'), leftPanel);
    for (const a of sheet.attributes) {
      this.addStatRow(a.label, a.value, a.description, leftPanel, '#9FD8FF');
    }

    // Skills section grouped by attribute
    addSectionHeader(t('sheet.skills'), leftPanel);
    let lastAttr: string | null = null;
    for (const s of sheet.skills) {
      if (s.attribute !== lastAttr) {
        lastAttr = s.attribute;
        const grpLbl = new TextBlock();
        grpLbl.text = t(`attr.${s.attribute}`).toUpperCase();
        grpLbl.color = '#556677';
        grpLbl.fontSize = 10;
        grpLbl.fontFamily = 'monospace';
        grpLbl.height = '16px';
        grpLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        leftPanel.addControl(grpLbl);
      }
      this.addStatRow(s.label, s.value, s.description, leftPanel, '#CCFFCC');
    }

    // Right column — perk tree with attribute tabs
    const rightPanel = new Rectangle('cs-right');
    rightPanel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    rightPanel.width = '57%';
    rightPanel.height = '100%';
    rightPanel.thickness = 1;
    rightPanel.color = '#112233';
    rightPanel.background = 'rgba(0,10,20,0.7)';
    content.addControl(rightPanel);

    // Tab row
    const tabRow = new StackPanel('cs-tabs');
    tabRow.isVertical = false;
    tabRow.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    tabRow.height = '36px';
    tabRow.spacing = 2;
    tabRow.paddingTop = '4px';
    tabRow.paddingLeft = '8px';
    rightPanel.addControl(tabRow);

    // Perk tree area (below tabs)
    const treeScroll = new ScrollViewer('cs-tree-scroll');
    treeScroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    treeScroll.top = '40px';
    treeScroll.height = 'calc(100% - 40px)';
    treeScroll.width = '100%';
    treeScroll.thickness = 0;
    treeScroll.barColor = '#00FFCC44';
    rightPanel.addControl(treeScroll);

    const treePanel = new StackPanel('cs-tree');
    treePanel.spacing = 4;
    treePanel.paddingLeft = '10px';
    treePanel.paddingRight = '10px';
    treePanel.paddingTop = '6px';
    treePanel.paddingBottom = '10px';
    treeScroll.addControl(treePanel);

    let activeAttrIdx = 0;

    const buildTree = (attrIdx: number): void => {
      treePanel.clearControls();
      const tree = sheet.perkTrees[attrIdx]!;

      // Points available indicator
      if (tree.availablePoints > 0) {
        const pts = new TextBlock('cs-pts');
        pts.text = t('sheet.perkPoints', { n: tree.availablePoints });
        pts.color = '#FFD700';
        pts.fontSize = 12;
        pts.fontFamily = 'monospace';
        pts.fontStyle = 'bold';
        pts.height = '22px';
        pts.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        treePanel.addControl(pts);
      }

      for (const tierGroup of tree.tiers) {
        // Tier header
        const tierHdr = new TextBlock(`cs-tier-${tierGroup.tier}`);
        tierHdr.text = tierGroup.unlocked
          ? t('sheet.tierN', { n: tierGroup.tier })
          : t('sheet.locked', { pct: tierGroup.requiredPct, attr: t(`attr.${tree.attrId}`) });
        tierHdr.color = tierGroup.unlocked ? '#00FFCC88' : '#445566';
        tierHdr.fontSize = 11;
        tierHdr.fontFamily = 'monospace';
        tierHdr.height = '20px';
        tierHdr.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
        treePanel.addControl(tierHdr);

        // Two perks side by side
        const perkRow = new StackPanel(`cs-prow-${tierGroup.tier}`);
        perkRow.isVertical = false;
        perkRow.height = '54px';
        perkRow.spacing = 6;
        treePanel.addControl(perkRow);

        for (const p of tierGroup.perks) {
          const card = this.buildPerkCard(p, tree.attrId, stats);
          perkRow.addControl(card);
        }
      }
    };

    // Build attribute tabs
    const tabBtns: Button[] = [];
    sheet.perkTrees.forEach((tree, idx) => {
      const hasPoints = tree.availablePoints > 0;
      const tab = Button.CreateSimpleButton(`cs-tab-${tree.attrId}`, tree.label + (hasPoints ? ' •' : ''));
      tab.width = '90px'; tab.height = '28px';
      tab.color = '#9FD8FF';
      tab.fontSize = 11;
      tab.fontFamily = 'monospace';
      tab.background = idx === activeAttrIdx ? 'rgba(0,80,60,0.9)' : 'rgba(0,20,35,0.7)';
      tab.onPointerUpObservable.add(() => {
        activeAttrIdx = idx;
        tabBtns.forEach((b, i) => {
          b.background = i === idx ? 'rgba(0,80,60,0.9)' : 'rgba(0,20,35,0.7)';
        });
        buildTree(idx);
      });
      tabBtns.push(tab);
      tabRow.addControl(tab);
    });

    buildTree(activeAttrIdx);
  }

  /* istanbul ignore next — browser GUI */
  private addStatRow(label: string, value: number, desc: string, panel: StackPanel, barColor: string): void {
    const row = new StackPanel(`cs-stat-${label}`);
    row.isVertical = false;
    row.height = '22px';
    row.spacing = 6;
    panel.addControl(row);

    const nameLbl = new TextBlock();
    nameLbl.text = label;
    nameLbl.color = '#CCDDEE';
    nameLbl.fontSize = 11;
    nameLbl.fontFamily = 'monospace';
    nameLbl.width = '170px';
    nameLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(nameLbl);

    const valLbl = new TextBlock();
    valLbl.text = `${value}%`;
    valLbl.color = barColor;
    valLbl.fontSize = 11;
    valLbl.fontFamily = 'monospace';
    valLbl.width = '36px';
    valLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    row.addControl(valLbl);

    if (desc) {
      const descLbl = new TextBlock(`cs-desc-${label}`);
      descLbl.text = desc;
      descLbl.color = '#556677';
      descLbl.fontSize = 9;
      descLbl.fontFamily = 'monospace';
      descLbl.height = '14px';
      descLbl.textWrapping = true;
      descLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      panel.addControl(descLbl);
    }
  }

  /* istanbul ignore next — browser GUI */
  private buildPerkCard(p: PerkRow, _attr: AttributeId, stats: CharacterStats): Rectangle {
    const card = new Rectangle(`cs-pcard-${p.id}`);
    card.width = '190px'; card.height = '52px';
    card.cornerRadius = 4;

    const stateColors: Record<PerkState, { bg: string; border: string; labelColor: string }> = {
      locked:   { bg: 'rgba(10,20,30,0.5)',  border: '#223344', labelColor: '#445566' },
      available: { bg: 'rgba(0,25,40,0.7)',  border: '#334455', labelColor: '#778899' },
      chosen:   { bg: 'rgba(0,60,40,0.8)',   border: '#00AA88', labelColor: '#00FFCC' },
      pickable: { bg: 'rgba(0,50,20,0.85)',  border: '#FFD70066', labelColor: '#CCEE88' },
    };
    const colors = stateColors[p.state];
    card.background = colors.bg;
    card.color = colors.border;
    card.thickness = p.state === 'chosen' ? 2 : 1;

    const inner = new StackPanel(`cs-pinner-${p.id}`);
    inner.paddingLeft = '6px';
    inner.paddingTop = '4px';
    inner.spacing = 2;
    card.addControl(inner);

    const nameLbl = new TextBlock();
    nameLbl.text = p.label;
    nameLbl.color = colors.labelColor;
    nameLbl.fontSize = 11;
    nameLbl.fontFamily = 'monospace';
    nameLbl.fontStyle = p.state === 'chosen' ? 'bold' : 'normal';
    nameLbl.height = '18px';
    nameLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    inner.addControl(nameLbl);

    const descLbl = new TextBlock();
    descLbl.text = p.state === 'locked' ? '?' : p.description;
    descLbl.color = '#445566';
    descLbl.fontSize = 9;
    descLbl.fontFamily = 'monospace';
    descLbl.height = '14px';
    descLbl.textWrapping = true;
    descLbl.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    inner.addControl(descLbl);

    if (p.state === 'pickable') {
      card.isPointerBlocker = true;
      card.onPointerUpObservable.add(() => {
        const updated = pickPerk(p.id, stats);
        if (!updated) return;
        this.playerStats = updated;
        this.handlers.onPerkPick?.(updated);
        // Rebuild the GUI with new stats
        this.gui?.dispose();
        this.gui = null;
        this.buildGui();
      });
    }

    return card;
  }
}