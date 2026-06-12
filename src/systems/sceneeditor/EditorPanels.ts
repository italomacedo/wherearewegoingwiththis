/* istanbul ignore file */
// Babylon GUI glue; the logical state it renders
// (EditorState/SceneDoc/GalleryManifest/NpcRandomizer) is pure and fully tested.
/**
 * EditorPanels — the Scene Editor's GUI: top toolbar (New/Save/Load + id/name),
 * left gallery (Models by category / Items / NPCs / Doors), right properties
 * panel for the current selection, bottom hint. UiStyle neon pattern; pixel
 * offsets + % heights only (no calc(), Lesson 48); text entry via native DOM
 * inputs (Lessons 15/24), removed on dispose.
 */
import type { Scene } from '@babylonjs/core';
import {
  AdvancedDynamicTexture, Rectangle, StackPanel, TextBlock, Button, ScrollViewer, Control,
} from '@babylonjs/gui';
import { UI } from '@systems/UiStyle';
import { t } from '@systems/I18n';
import { ITEM_REGISTRY } from '@entities/items/ItemCatalog';
import { ATTRIBUTES, type AttributeId } from '@entities/CharacterStats';
import type { GalleryEntry } from './GalleryManifest';
import { entriesByCategory } from './GalleryManifest';
import type { EditorState, EditorTab } from './EditorState';
import type { SceneKind, SceneNpcDoc } from './SceneDoc';
import type { NPCDisposition } from '@entities/NPCAgent';
import type { GeneratedPersona } from './PersonaGen';

export interface EditorPanelHandlers {
  onNew(kind: SceneKind): void;
  onSave(): void;
  onLoad(sceneId: string): void;
  onGalleryPick(entry: GalleryEntry): void;
  onItemPick(itemId: string): void;
  onGenerateNpc(): void;
  onAddDoor(): void;
  onTransformNudge(field: 'px' | 'py' | 'pz' | 'rot' | 'scale', delta: number): void;
  onSolidToggle(): void;
  onNpcOutfitCycle(dir: 1 | -1): void;
  onNpcDispositionCycle(): void;
  onNpcMoodCycle(): void;
  onNpcAttrNudge(attr: AttributeId, delta: number): void;
  onNpcNameEdit(name: string): void;
  onDoorTargetCycle(dir: 1 | -1): void;
  onDoorSizeNudge(axis: 0 | 1 | 2, delta: number): void;
  onDoorSpawnNudge(axis: 0 | 1 | 2, delta: number): void;
  onGroundCycle(): void;
  onDelete(): void;
  onDuplicate(): void;
  /** Back to the main menu (same dirty-confirm flow as ESC). */
  onBack(): void;
  /** Draft Personality/Backstory/Routine for the SELECTED NPC via the Claude CLI
   *  (null = no Electron bridge / call failed / unparseable). */
  onGeneratePersona(): Promise<GeneratedPersona | null>;
}

const PANEL_W = 250;
const TOOLBAR_H = 44;
// "Edit NPC" modal (fixed size so the DOM textareas can centre with CSS calc).
const MODAL_W = 680;
const MODAL_H = 560;

export class EditorPanels {
  private gui: AdvancedDynamicTexture | null = null;
  private galleryList: StackPanel | null = null;
  private propsList: StackPanel | null = null;
  private tabButtons = new Map<EditorTab, Rectangle>();
  private statusText: TextBlock | null = null;
  private titleText: TextBlock | null = null;
  private loadPanel: Rectangle | null = null;
  private idInput: HTMLInputElement | null = null;
  private nameInput: HTMLInputElement | null = null;
  private npcNameInput: HTMLInputElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  // "Edit NPC" modal (persona texts + loadout + relationship ledger).
  private npcModal: Rectangle | null = null;
  private npcModalDom: HTMLElement[] = [];
  private modalLoadoutList: StackPanel | null = null;
  private modalRelList: StackPanel | null = null;
  private modalTextareas: { personality: HTMLTextAreaElement; backstory: HTMLTextAreaElement; routine: HTMLTextAreaElement } | null = null;
  private generatingPersona = false;
  private loadoutPickIdx = 0;
  /** Live gallery filter (lowercased) typed in the search field. */
  private filter = '';
  private entries: GalleryEntry[] = [];
  private openCategory: string | null = null;
  private sceneIds: string[] = [];

  constructor(
    private readonly state: EditorState,
    private readonly handlers: EditorPanelHandlers,
  ) {}

  build(scene: Scene): void {
    if (typeof document === 'undefined') return;
    this.gui = AdvancedDynamicTexture.CreateFullscreenUI('editor-ui', true, scene);
    this.buildToolbar();
    this.buildGallery();
    this.buildProperties();
    this.buildDomInputs();
    this.refresh();
  }

  setEntries(entries: GalleryEntry[]): void {
    this.entries = entries;
    this.renderGallery();
  }

  setSceneIds(ids: string[]): void {
    this.sceneIds = ids;
  }

  getSceneIds(): string[] {
    return this.sceneIds;
  }

  setStatus(msg: string): void {
    if (this.statusText) this.statusText.text = msg;
  }

  /** Re-render dynamic regions (title, gallery, properties) from the state. */
  refresh(): void {
    if (!this.gui) return;
    if (this.titleText) {
      this.titleText.text = `${this.state.doc.kind === 'quadrant' ? '◼' : '⌂'} ${this.state.doc.id}${this.state.dirty ? ' *' : ''}`;
    }
    if (this.idInput && document.activeElement !== this.idInput) this.idInput.value = this.state.doc.id;
    if (this.nameInput && document.activeElement !== this.nameInput) this.nameInput.value = this.state.doc.name;
    this.renderGallery();
    this.renderProperties();
  }

  dispose(): void {
    this.closeNpcModal();
    this.idInput?.parentElement?.remove();
    this.idInput = null;
    this.nameInput = null;
    this.npcNameInput?.remove();
    this.npcNameInput = null;
    this.gui?.dispose();
    this.gui = null;
  }

  // ─── Toolbar ───────────────────────────────────────────────────────────────

  private toolbarBtn(label: string, left: number, width: number, action: () => void): Rectangle {
    const box = new Rectangle(`tb-${label}`);
    box.width = `${width}px`;
    box.height = '32px';
    box.left = `${left}px`;
    box.top = '6px';
    box.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    box.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    box.background = UI.btnBg;
    box.color = UI.cardBorder;
    box.thickness = 1;
    box.cornerRadius = UI.cornerSm;
    const btn = Button.CreateSimpleButton(`tb-b-${label}`, label);
    btn.color = UI.btnFg;
    btn.fontSize = UI.fontBody;
    btn.fontFamily = UI.font;
    btn.thickness = 0;
    btn.onPointerUpObservable.add(action);
    btn.onPointerEnterObservable.add(() => { box.color = UI.accent; });
    btn.onPointerOutObservable.add(() => { box.color = UI.cardBorder; });
    box.addControl(btn);
    this.gui!.addControl(box);
    return box;
  }

  private buildToolbar(): void {
    const bar = new Rectangle('editor-toolbar');
    bar.width = '100%';
    bar.height = `${TOOLBAR_H}px`;
    bar.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    bar.background = UI.headerBg;
    bar.color = UI.frameBorder;
    bar.thickness = 1;
    this.gui!.addControl(bar);

    this.toolbarBtn(t('editor.backToMenu'), 8, 80, () => this.handlers.onBack());
    this.toolbarBtn(t('editor.newQuadrant'), 96, 130, () => this.handlers.onNew('quadrant'));
    this.toolbarBtn(t('editor.newInterior'), 234, 130, () => this.handlers.onNew('interior'));
    this.toolbarBtn(t('editor.save'), 372, 80, () => this.handlers.onSave());
    this.toolbarBtn(t('editor.load'), 460, 80, () => this.toggleLoadPanel());
    this.toolbarBtn(t('editor.ground'), 548, 80, () => this.handlers.onGroundCycle());

    const title = new TextBlock('editor-title');
    title.color = UI.accent;
    title.fontSize = UI.fontSub;
    title.fontFamily = UI.font;
    title.height = `${TOOLBAR_H}px`;
    title.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    title.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    title.paddingRight = '16px';
    title.paddingTop = '12px';
    title.width = '300px';
    this.gui!.addControl(title);
    this.titleText = title;

    const status = new TextBlock('editor-status');
    status.color = UI.textMeta;
    status.fontSize = UI.fontMeta;
    status.fontFamily = UI.font;
    status.height = '20px';
    status.width = '420px';
    status.top = `${TOOLBAR_H + 2}px`;
    status.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    status.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_CENTER;
    this.gui!.addControl(status);
    this.statusText = status;
  }

  private toggleLoadPanel(): void {
    if (this.loadPanel) {
      this.loadPanel.dispose();
      this.loadPanel = null;
      return;
    }
    const panel = new Rectangle('editor-load');
    panel.width = '260px';
    panel.height = '60%';
    panel.top = `${TOOLBAR_H + 6}px`;
    panel.left = '460px'; // under the Load button
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.background = UI.frameBg;
    panel.color = UI.frameBorder;
    panel.thickness = 1;
    panel.cornerRadius = UI.cornerMd;
    this.gui!.addControl(panel);
    const scroll = new ScrollViewer('editor-load-scroll');
    scroll.thickness = 0;
    scroll.barColor = UI.accentSoft;
    panel.addControl(scroll);
    const list = new StackPanel('editor-load-list');
    list.width = '100%';
    scroll.addControl(list);
    for (const id of this.sceneIds) {
      const btn = Button.CreateSimpleButton(`load-${id}`, id);
      btn.height = '32px';
      btn.color = UI.textBody;
      btn.fontSize = UI.fontBody;
      btn.fontFamily = UI.font;
      btn.thickness = 0;
      btn.onPointerEnterObservable.add(() => { btn.color = UI.accent; });
      btn.onPointerOutObservable.add(() => { btn.color = UI.textBody; });
      btn.onPointerUpObservable.add(() => {
        this.handlers.onLoad(id);
        this.toggleLoadPanel();
      });
      list.addControl(btn);
    }
    this.loadPanel = panel;
  }

  // ─── Gallery (left) ────────────────────────────────────────────────────────

  private buildGallery(): void {
    const panel = new Rectangle('editor-gallery');
    panel.width = `${PANEL_W}px`;
    panel.height = '82%';
    panel.top = `${TOOLBAR_H + 6}px`;
    panel.left = '6px';
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    panel.background = UI.frameBg;
    panel.color = UI.frameBorder;
    panel.thickness = 1;
    panel.cornerRadius = UI.cornerMd;
    this.gui!.addControl(panel);

    // Tab row.
    const tabs: EditorTab[] = ['models', 'items', 'npcs', 'doors'];
    tabs.forEach((tab, i) => {
      const box = new Rectangle(`tab-${tab}`);
      box.width = '60px';
      box.height = '26px';
      box.top = '6px';
      box.left = `${4 + i * 61}px`;
      box.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      box.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      box.thickness = 1;
      box.cornerRadius = UI.cornerSm;
      const btn = Button.CreateSimpleButton(`tab-b-${tab}`, t(`editor.tab.${tab}`));
      btn.fontSize = UI.fontMeta;
      btn.fontFamily = UI.font;
      btn.thickness = 0;
      btn.color = UI.textBody;
      btn.onPointerUpObservable.add(() => {
        this.state.tab = tab;
        this.renderGallery();
      });
      box.addControl(btn);
      panel.addControl(box);
      this.tabButtons.set(tab, box);
    });

    // Reserved band for the DOM search input (tabs 6..32 + search 38..62).
    const scroll = new ScrollViewer('editor-gallery-scroll');
    scroll.top = '68px';
    scroll.height = '86%';
    scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    scroll.thickness = 0;
    scroll.barColor = UI.accentSoft;
    panel.addControl(scroll);

    const list = new StackPanel('editor-gallery-list');
    list.width = '100%';
    scroll.addControl(list);
    this.galleryList = list;
  }

  private listButton(label: string, action: () => void, color: string = UI.textBody): Button {
    const btn = Button.CreateSimpleButton(`gl-${label}`, label);
    btn.height = '26px';
    btn.color = color;
    btn.fontSize = UI.fontBody;
    btn.fontFamily = UI.font;
    btn.thickness = 0;
    if (btn.textBlock) btn.textBlock.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    btn.paddingLeft = '10px';
    btn.onPointerEnterObservable.add(() => { btn.color = UI.accent; });
    btn.onPointerOutObservable.add(() => { btn.color = color; });
    btn.onPointerUpObservable.add(action);
    return btn;
  }

  private renderGallery(): void {
    const list = this.galleryList;
    if (!list) return;
    for (const tab of this.tabButtons.keys()) {
      const box = this.tabButtons.get(tab)!;
      const active = this.state.tab === tab;
      box.background = active ? UI.btnBg : UI.cardBg;
      box.color = active ? UI.accent : UI.cardBorder;
    }
    list.clearControls();
    const q = this.filter;
    const matches = (...texts: Array<string | undefined>): boolean =>
      q === '' || texts.some((s) => s !== undefined && s.toLowerCase().includes(q));
    if (this.state.tab === 'models') {
      const visible = this.entries.filter((e) => matches(e.label, e.path, e.category));
      const byCat = entriesByCategory(visible);
      for (const [cat, items] of byCat) {
        // While searching, every matching category is expanded automatically.
        const open = q !== '' || this.openCategory === cat;
        list.addControl(this.listButton(`${open ? '▾' : '▸'} ${cat} (${items.length})`, () => {
          this.openCategory = this.openCategory === cat ? null : cat;
          this.renderGallery();
        }, UI.textPrimary));
        if (open) {
          for (const entry of items) {
            list.addControl(this.listButton(`  ${entry.label}`, () => this.handlers.onGalleryPick(entry)));
          }
        }
      }
    } else if (this.state.tab === 'items') {
      for (const def of Object.values(ITEM_REGISTRY)) {
        if (!matches(def.id, def.category)) continue;
        list.addControl(this.listButton(`${def.id} (${def.category})`, () => this.handlers.onItemPick(def.id)));
      }
    } else if (this.state.tab === 'npcs') {
      list.addControl(this.listButton(t('editor.generateNpc'), () => this.handlers.onGenerateNpc(), UI.accent));
      for (const npc of this.state.doc.npcs) {
        if (!matches(npc.name, npc.role, npc.outfit)) continue;
        list.addControl(this.listButton(`${npc.name} · ${npc.outfit}`, () => {
          this.state.select({ kind: 'npc', id: npc.id });
          this.renderProperties();
        }));
      }
    } else {
      list.addControl(this.listButton(t('editor.addDoor'), () => this.handlers.onAddDoor(), UI.accent));
      for (const door of this.state.doc.doorTriggers) {
        if (!matches(door.key, door.targetSceneId)) continue;
        list.addControl(this.listButton(`${door.key} → ${door.targetSceneId || t('editor.doorNoTarget')}`, () => {
          this.state.select({ kind: 'door', key: door.key });
          this.renderProperties();
        }));
      }
    }
  }

  // ─── Properties (right) ────────────────────────────────────────────────────

  private buildProperties(): void {
    const panel = new Rectangle('editor-props');
    panel.width = `${PANEL_W}px`;
    panel.height = '82%';
    panel.top = `${TOOLBAR_H + 6}px`;
    panel.left = '-6px';
    panel.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    panel.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    panel.background = UI.frameBg;
    panel.color = UI.frameBorder;
    panel.thickness = 1;
    panel.cornerRadius = UI.cornerMd;
    this.gui!.addControl(panel);

    const scroll = new ScrollViewer('editor-props-scroll');
    scroll.thickness = 0;
    scroll.barColor = UI.accentSoft;
    panel.addControl(scroll);
    const list = new StackPanel('editor-props-list');
    list.width = '100%';
    scroll.addControl(list);
    this.propsList = list;
  }

  private propLabel(text: string, color: string = UI.textMeta): TextBlock {
    const tb = new TextBlock(`pl-${text}`, text);
    tb.height = '22px';
    tb.color = color;
    tb.fontSize = UI.fontMeta;
    tb.fontFamily = UI.font;
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.paddingLeft = '10px';
    return tb;
  }

  /** A "label  −  value  +" stepper row. */
  private stepperRow(label: string, value: string, onMinus: () => void, onPlus: () => void): Rectangle {
    const row = new Rectangle(`st-${label}`);
    row.height = '26px';
    row.thickness = 0;
    const lab = new TextBlock(`st-l-${label}`, label);
    lab.color = UI.textBody;
    lab.fontSize = UI.fontMeta;
    lab.fontFamily = UI.font;
    lab.width = '90px';
    lab.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    lab.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    lab.paddingLeft = '10px';
    row.addControl(lab);
    const minus = Button.CreateSimpleButton(`st-m-${label}`, '−');
    minus.width = '26px';
    minus.height = '22px';
    minus.left = '95px';
    minus.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    minus.color = UI.btnFg;
    minus.background = UI.btnBg;
    minus.thickness = 0;
    minus.cornerRadius = UI.cornerSm;
    minus.onPointerUpObservable.add(onMinus);
    row.addControl(minus);
    const val = new TextBlock(`st-v-${label}`, value);
    val.color = UI.textPrimary;
    val.fontSize = UI.fontBody;
    val.fontFamily = UI.font;
    val.width = '76px';
    val.left = '124px';
    val.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    row.addControl(val);
    const plus = Button.CreateSimpleButton(`st-p-${label}`, '+');
    plus.width = '26px';
    plus.height = '22px';
    plus.left = '203px';
    plus.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    plus.color = UI.btnFg;
    plus.background = UI.btnBg;
    plus.thickness = 0;
    plus.cornerRadius = UI.cornerSm;
    plus.onPointerUpObservable.add(onPlus);
    row.addControl(plus);
    return row;
  }

  private actionButton(label: string, action: () => void, danger = false): Rectangle {
    const box = new Rectangle(`ab-${label}`);
    box.height = '30px';
    box.width = '92%';
    box.thickness = 1;
    box.cornerRadius = UI.cornerSm;
    box.background = danger ? UI.btnDangerBg : UI.btnBg;
    box.color = UI.cardBorder;
    const btn = Button.CreateSimpleButton(`ab-b-${label}`, label);
    btn.color = danger ? UI.btnDangerFg : UI.btnFg;
    btn.fontSize = UI.fontBody;
    btn.fontFamily = UI.font;
    btn.thickness = 0;
    btn.onPointerUpObservable.add(action);
    box.addControl(btn);
    return box;
  }

  renderProperties(): void {
    const list = this.propsList;
    if (!list) return;
    list.clearControls();
    if (this.npcNameInput) { this.npcNameInput.remove(); this.npcNameInput = null; }
    const h = this.handlers;
    const tr = this.state.selectedTransform();
    const sel = this.state.selection;
    if (!sel || !tr) {
      list.addControl(this.propLabel('—'));
      return;
    }
    const fmt = (n: number): string => n.toFixed(1);
    list.addControl(this.propLabel(`${sel.kind.toUpperCase()}`, UI.accent));
    if (sel.kind === 'npc') {
      // Name block FIRST, at a deterministic offset from the panel top: a label
      // + a reserved 30px gap row the DOM <input> overlays (Lesson 15 — Babylon
      // GUI can't do text entry; the gap keeps GUI rows from rendering under it).
      const npc = this.state.selectedNpc()!;
      list.addControl(this.propLabel(t('editor.npcName')));
      const gap = new Rectangle('npc-name-gap');
      gap.height = '30px';
      gap.thickness = 0;
      list.addControl(gap);
      this.buildNpcNameInput(npc.name);
      list.addControl(this.propLabel(npc.role));
    }
    list.addControl(this.stepperRow('x', fmt(tr.position[0]), () => h.onTransformNudge('px', -0.5), () => h.onTransformNudge('px', +0.5)));
    list.addControl(this.stepperRow('y', fmt(tr.position[1]), () => h.onTransformNudge('py', -0.5), () => h.onTransformNudge('py', +0.5)));
    list.addControl(this.stepperRow('z', fmt(tr.position[2]), () => h.onTransformNudge('pz', -0.5), () => h.onTransformNudge('pz', +0.5)));

    if (sel.kind === 'prop' || sel.kind === 'npc') {
      const deg = Math.round((tr.rotationY * 180) / Math.PI);
      list.addControl(this.stepperRow('rot°', `${deg}`, () => h.onTransformNudge('rot', -Math.PI / 12), () => h.onTransformNudge('rot', +Math.PI / 12)));
    }
    if (sel.kind === 'prop') {
      const s = typeof tr.scale === 'number' ? tr.scale : tr.scale[0];
      list.addControl(this.stepperRow('scale', s.toFixed(2), () => h.onTransformNudge('scale', -0.1), () => h.onTransformNudge('scale', +0.1)));
      const prop = this.state.selectedProp()!;
      list.addControl(this.actionButton(`${prop.solid ? '☑' : '☐'} ${t('editor.solid')}`, () => h.onSolidToggle()));
    }

    if (sel.kind === 'npc') {
      const npc = this.state.selectedNpc()!;
      list.addControl(this.actionButton(`◄ ${npc.outfit} ►`, () => h.onNpcOutfitCycle(1)));
      list.addControl(this.actionButton(`mood: ${npc.defaultMood}`, () => h.onNpcMoodCycle()));
      list.addControl(this.actionButton(`disp: ${npc.initialDisposition}`, () => h.onNpcDispositionCycle()));
      for (const a of ATTRIBUTES) {
        const v = npc.attributes?.[a.id] ?? 20;
        list.addControl(this.stepperRow(a.id.slice(0, 5), `${v}`, () => h.onNpcAttrNudge(a.id, -5), () => h.onNpcAttrNudge(a.id, +5)));
      }
      list.addControl(this.actionButton(t('editor.npcEdit'), () => this.openNpcModal()));
    }

    if (sel.kind === 'door') {
      const door = this.state.selectedDoor()!;
      list.addControl(this.propLabel(t('editor.doorTarget')));
      list.addControl(this.actionButton(`◄ ${door.targetSceneId || t('editor.doorNoTarget')} ►`, () => h.onDoorTargetCycle(1)));
      (['w', 'h', 'd'] as const).forEach((axis, i) => {
        list.addControl(this.stepperRow(`size ${axis}`, door.size[i].toFixed(1),
          () => h.onDoorSizeNudge(i as 0 | 1 | 2, -0.5), () => h.onDoorSizeNudge(i as 0 | 1 | 2, +0.5)));
      });
      (['sx', 'sy', 'sz'] as const).forEach((axis, i) => {
        list.addControl(this.stepperRow(axis, door.spawnPoint[i].toFixed(1),
          () => h.onDoorSpawnNudge(i as 0 | 1 | 2, -1), () => h.onDoorSpawnNudge(i as 0 | 1 | 2, +1)));
      });
    }

    list.addControl(this.actionButton(t('editor.duplicate'), () => h.onDuplicate()));
    list.addControl(this.actionButton(t('editor.delete'), () => h.onDelete(), true));
  }

  // ─── DOM inputs (scene id/name + NPC name) ─────────────────────────────────

  /** Neon-styled DOM <input> overlay (Lesson 15). `pos` = CSS position decls
   *  (e.g. 'left:10px;top:10px' or 'right:20px;top:96px' — right-anchoring keeps
   *  panel-bound inputs responsive to window resizes). */
  private domInput(pos: string, width: string, placeholder: string, onChange: (v: string) => void): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.style.cssText = `position:fixed;${pos};width:${width};height:24px;box-sizing:border-box;z-index:30;`
      + `background:${UI.cardBg};border:1px solid ${UI.cardBorder};color:${UI.textPrimary};`
      + `font-family:'Courier New',monospace;font-size:${UI.fontBody}px;padding:3px 8px;`
      + `border-radius:${UI.cornerSm}px;outline:none;`;
    input.addEventListener('focus', () => { input.style.borderColor = UI.accent; });
    input.addEventListener('blur', () => { input.style.borderColor = UI.cardBorder; });
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('change', () => onChange(input.value));
    document.body.appendChild(input);
    return input;
  }

  private buildDomInputs(): void {
    const wrapper = document.createElement('div');
    wrapper.id = 'editor-dom-inputs';
    document.body.appendChild(wrapper);
    this.idInput = this.domInput('left:644px;top:10px', '120px', t('editor.sceneId'), (v) => {
      const clean = v.toLowerCase().replace(/[^a-z0-9_-]/g, '');
      this.state.setMeta({ id: clean || 'untitled' });
      this.refresh();
    });
    wrapper.appendChild(this.idInput);
    this.nameInput = this.domInput('left:774px;top:10px', '160px', t('editor.sceneName'), (v) => {
      this.state.setMeta({ name: v || this.state.doc.id });
      this.refresh();
    });
    wrapper.appendChild(this.nameInput);
    // Gallery search — overlays the reserved band under the tab row (panel top
    // 50 + tabs 32 + 6). Filters every tab live as the user types.
    this.searchInput = this.domInput(`left:18px;top:${TOOLBAR_H + 6 + 38}px`, `${PANEL_W - 26}px`, t('editor.search'), () => { /* filtered on input */ });
    this.searchInput.addEventListener('input', () => {
      this.filter = (this.searchInput?.value ?? '').trim().toLowerCase();
      this.renderGallery();
    });
    wrapper.appendChild(this.searchInput);
  }

  // ─── "Edit NPC" modal — persona texts + inventory + relationship ledger ────

  isModalOpen(): boolean {
    return this.npcModal !== null;
  }

  closeNpcModal(): void {
    this.npcModalDom.forEach((el) => el.remove());
    this.npcModalDom = [];
    this.npcModal?.dispose();
    this.npcModal = null;
    this.modalLoadoutList = null;
    this.modalRelList = null;
    this.modalTextareas = null;
    this.refresh();
  }

  /** Neon-styled DOM <textarea> centred against the fixed-size modal frame. */
  private domTextarea(topOffset: number, height: number, value: string, onChange: (v: string) => void): HTMLTextAreaElement {
    const ta = document.createElement('textarea');
    ta.value = value;
    ta.style.cssText = `position:fixed;left:calc(50% - ${MODAL_W / 2 - 16}px);`
      + `top:calc(50% - ${MODAL_H / 2 - topOffset}px);width:${MODAL_W - 32}px;height:${height}px;`
      + `box-sizing:border-box;z-index:40;resize:none;`
      + `background:${UI.cardBg};border:1px solid ${UI.cardBorder};color:${UI.textBody};`
      + `font-family:'Courier New',monospace;font-size:${UI.fontBody}px;padding:4px 8px;`
      + `border-radius:${UI.cornerSm}px;outline:none;`;
    ta.addEventListener('focus', () => { ta.style.borderColor = UI.accent; });
    ta.addEventListener('blur', () => { ta.style.borderColor = UI.cardBorder; });
    ta.addEventListener('keydown', (e) => e.stopPropagation());
    ta.addEventListener('change', () => onChange(ta.value));
    document.body.appendChild(ta);
    this.npcModalDom.push(ta);
    return ta;
  }

  private modalLabel(frame: Rectangle, text: string, top: number, left = 16, color: string = UI.textMeta): void {
    const tb = new TextBlock(`ml-${text}-${top}`, text);
    tb.color = color;
    tb.fontSize = UI.fontMeta;
    tb.fontFamily = UI.font;
    tb.height = '18px';
    tb.top = `${top}px`;
    tb.left = `${left}px`;
    tb.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    tb.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    tb.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    frame.addControl(tb);
  }

  private openNpcModal(): void {
    if (this.npcModal) this.closeNpcModal();
    const npc = this.state.selectedNpc();
    if (!npc || !this.gui || typeof document === 'undefined') return;

    const frame = new Rectangle('npc-modal');
    frame.width = `${MODAL_W}px`;
    frame.height = `${MODAL_H}px`;
    frame.background = UI.frameBg;
    frame.color = UI.frameBorder;
    frame.thickness = 1;
    frame.cornerRadius = UI.cornerLg;
    this.gui.addControl(frame);
    this.npcModal = frame;

    // Header strip + accent line + close (the game's modal pattern).
    const header = new Rectangle('npc-modal-header');
    header.height = '40px';
    header.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    header.background = UI.headerBg;
    header.thickness = 0;
    frame.addControl(header);
    const title = new TextBlock('npc-modal-title', `${t('editor.npcEditTitle')} — ${npc.name}`);
    title.color = UI.accent;
    title.fontSize = UI.fontSub;
    title.fontFamily = UI.font;
    title.paddingLeft = '16px';
    title.textHorizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
    header.addControl(title);
    const closeBtn = Button.CreateSimpleButton('npc-modal-close', '✕');
    closeBtn.width = '36px';
    closeBtn.height = '28px';
    closeBtn.top = '6px';
    closeBtn.left = '-8px';
    closeBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    closeBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    closeBtn.color = UI.btnFg;
    closeBtn.fontSize = UI.fontSub;
    closeBtn.fontFamily = UI.font;
    closeBtn.thickness = 0;
    closeBtn.onPointerUpObservable.add(() => this.closeNpcModal());
    frame.addControl(closeBtn);
    const line = new Rectangle('npc-modal-line');
    line.height = '2px';
    line.top = '40px';
    line.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    line.background = UI.accent;
    line.thickness = 0;
    frame.addControl(line);

    // Persona texts (DOM textareas over reserved bands — Lesson 15).
    const patch = (p: Partial<Omit<SceneNpcDoc, 'id' | 'position'>>): void => {
      this.state.setNpcField(p);
      this.refresh();
    };
    this.modalLabel(frame, t('editor.personality'), 50);
    const personality = this.domTextarea(70, 58, npc.personalityPrompt, (v) => patch({ personalityPrompt: v }));
    this.modalLabel(frame, t('editor.backstory'), 134);
    const backstory = this.domTextarea(154, 58, npc.backstory ?? '', (v) => patch({ backstory: v || undefined }));
    this.modalLabel(frame, t('editor.routine'), 218);
    const routine = this.domTextarea(238, 58, npc.routine ?? '', (v) => patch({ routine: v || undefined }));
    this.modalTextareas = { personality, backstory, routine };

    // ⚡ Draft the three persona texts with one cheap Claude CLI call.
    const genBtn = Button.CreateSimpleButton('npc-modal-gen', t('editor.generatePersona'));
    genBtn.width = '150px';
    genBtn.height = '28px';
    genBtn.top = '6px';
    genBtn.left = '-52px';
    genBtn.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    genBtn.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    genBtn.color = UI.btnFg;
    genBtn.background = UI.btnBg;
    genBtn.fontSize = UI.fontMeta;
    genBtn.fontFamily = UI.font;
    genBtn.thickness = 1;
    genBtn.cornerRadius = UI.cornerSm;
    genBtn.onPointerUpObservable.add(() => { void this.generatePersona(genBtn); });
    frame.addControl(genBtn);

    // Two columns: inventory (left) + relationship ledger (right).
    this.modalLabel(frame, t('editor.loadout'), 306, 16, UI.textPrimary);
    this.modalLabel(frame, t('editor.relationships'), 306, MODAL_W / 2 + 8, UI.textPrimary);
    const mkColumn = (name: string, left: number): StackPanel => {
      const scroll = new ScrollViewer(`npc-modal-${name}`);
      scroll.width = `${MODAL_W / 2 - 24}px`;
      scroll.height = `${MODAL_H - 306 - 24 - 14}px`;
      scroll.top = '328px';
      scroll.left = `${left}px`;
      scroll.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
      scroll.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_LEFT;
      scroll.thickness = 0;
      scroll.barColor = UI.accentSoft;
      frame.addControl(scroll);
      const list = new StackPanel(`npc-modal-${name}-list`);
      list.width = '100%';
      scroll.addControl(list);
      return list;
    };
    this.modalLoadoutList = mkColumn('loadout', 12);
    this.modalRelList = mkColumn('rel', MODAL_W / 2 + 4);
    this.renderNpcModalLists();
  }

  /** Run the AI persona draft and pour the result into the fields + textareas. */
  private async generatePersona(btn: Button): Promise<void> {
    if (this.generatingPersona) return;
    this.generatingPersona = true;
    const original = btn.textBlock?.text ?? '';
    if (btn.textBlock) btn.textBlock.text = '· · ·';
    try {
      const persona = await this.handlers.onGeneratePersona();
      if (persona && this.state.selectedNpc()) {
        this.state.setNpcField(persona);
        if (this.modalTextareas) {
          this.modalTextareas.personality.value = persona.personalityPrompt;
          this.modalTextareas.backstory.value = persona.backstory;
          this.modalTextareas.routine.value = persona.routine;
        }
        this.refresh();
      } else {
        this.setStatus(t('editor.generateFailed'));
      }
    } finally {
      this.generatingPersona = false;
      if (btn.textBlock) btn.textBlock.text = original;
    }
  }

  /** Re-render the loadout + relationship columns from the selected NPC. */
  private renderNpcModalLists(): void {
    const npc = this.state.selectedNpc();
    if (!npc || !this.modalLoadoutList || !this.modalRelList) return;
    const patch = (p: Partial<Omit<SceneNpcDoc, 'id' | 'position'>>): void => {
      this.state.setNpcField(p);
      this.renderNpcModalLists();
      this.refresh();
    };

    // ── Inventory: one row per stack (− / qty / + / remove) + an add picker. ──
    const lo = this.modalLoadoutList;
    lo.clearControls();
    const stacks = npc.loadout ?? [];
    stacks.forEach((s, i) => {
      const row = this.stepperRow(s.id.slice(0, 10), `×${s.qty}`,
        () => {
          const next = stacks.map((x) => ({ ...x }));
          next[i].qty -= 1;
          patch({ loadout: next[i].qty <= 0 ? next.filter((_, j) => j !== i) : next });
        },
        () => {
          const next = stacks.map((x) => ({ ...x }));
          next[i].qty += 1;
          patch({ loadout: next });
        });
      const del = Button.CreateSimpleButton(`lo-del-${i}`, '✕');
      del.width = '22px';
      del.height = '22px';
      del.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
      del.color = UI.btnDangerFg;
      del.fontSize = UI.fontMeta;
      del.thickness = 0;
      del.onPointerUpObservable.add(() => patch({ loadout: stacks.filter((_, j) => j !== i) }));
      row.addControl(del);
      lo.addControl(row);
    });
    const itemIds = Object.keys(ITEM_REGISTRY);
    this.loadoutPickIdx = ((this.loadoutPickIdx % itemIds.length) + itemIds.length) % itemIds.length;
    const pick = itemIds[this.loadoutPickIdx];
    lo.addControl(this.stepperRow(t('editor.addItem'), pick.slice(0, 10),
      () => { this.loadoutPickIdx -= 1; this.renderNpcModalLists(); },
      () => { this.loadoutPickIdx += 1; this.renderNpcModalLists(); }));
    const addBtn = this.actionButton(`+ ${pick}`, () => {
      const next = stacks.map((x) => ({ ...x }));
      const found = next.find((x) => x.id === pick);
      if (found) found.qty += 1; else next.push({ id: pick, qty: 1 });
      patch({ loadout: next });
    });
    lo.addControl(addBtn);

    // ── Relationship ledger: a disposition cycler per OTHER NPC in the doc. ──
    const rl = this.modalRelList;
    rl.clearControls();
    const others = this.state.doc.npcs.filter((n) => n.id !== npc.id);
    if (others.length === 0) {
      rl.addControl(this.propLabel('—'));
    }
    const CYCLE: Array<NPCDisposition | null> = [null, 'friendly', 'neutral', 'wary', 'hostile'];
    for (const other of others) {
      const cur = npc.npcRelationships?.[other.id] ?? null;
      const label = `${other.name.slice(0, 12)}: ${cur ?? '—'}`;
      rl.addControl(this.actionButton(label, () => {
        const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
        const rels = { ...(npc.npcRelationships ?? {}) };
        if (next === null) delete rels[other.id];
        else rels[other.id] = next;
        patch({ npcRelationships: Object.keys(rels).length > 0 ? rels : undefined });
      }));
    }
  }

  /** Overlays the reserved 'npc-name-gap' row at the top of the properties panel
   *  (panel top 50 + kind label 22 + name label 22 ≈ 94). Right-anchored so it
   *  follows the right panel on resize. */
  private buildNpcNameInput(current: string): void {
    if (typeof document === 'undefined') return;
    this.npcNameInput = this.domInput(
      `right:${6 + 14}px;top:${TOOLBAR_H + 6 + 22 + 22 + 2}px`,
      `${PANEL_W - 40}px`,
      t('editor.npcName'),
      (v) => { if (v.trim()) this.handlers.onNpcNameEdit(v.trim()); },
    );
    this.npcNameInput.value = current;
  }
}
