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
import type { SceneKind } from './SceneDoc';

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
}

const PANEL_W = 250;
const TOOLBAR_H = 44;

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

    this.toolbarBtn(t('editor.newQuadrant'), 8, 130, () => this.handlers.onNew('quadrant'));
    this.toolbarBtn(t('editor.newInterior'), 146, 130, () => this.handlers.onNew('interior'));
    this.toolbarBtn(t('editor.save'), 284, 80, () => this.handlers.onSave());
    this.toolbarBtn(t('editor.load'), 372, 80, () => this.toggleLoadPanel());
    this.toolbarBtn(t('editor.ground'), 460, 80, () => this.handlers.onGroundCycle());

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
    panel.left = '372px';
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

    const scroll = new ScrollViewer('editor-gallery-scroll');
    scroll.top = '38px';
    scroll.height = '92%';
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
    if (this.state.tab === 'models') {
      const byCat = entriesByCategory(this.entries);
      for (const [cat, items] of byCat) {
        const open = this.openCategory === cat;
        list.addControl(this.listButton(`${open ? '▾' : '▸'} ${cat} (${items.length})`, () => {
          this.openCategory = open ? null : cat;
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
        list.addControl(this.listButton(`${def.id} (${def.category})`, () => this.handlers.onItemPick(def.id)));
      }
    } else if (this.state.tab === 'npcs') {
      list.addControl(this.listButton(t('editor.generateNpc'), () => this.handlers.onGenerateNpc(), UI.accent));
      for (const npc of this.state.doc.npcs) {
        list.addControl(this.listButton(`${npc.name} · ${npc.outfit}`, () => {
          this.state.select({ kind: 'npc', id: npc.id });
          this.renderProperties();
        }));
      }
    } else {
      list.addControl(this.listButton(t('editor.addDoor'), () => this.handlers.onAddDoor(), UI.accent));
      for (const door of this.state.doc.doorTriggers) {
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
      list.addControl(this.propLabel(`${npc.name} · ${npc.role}`));
      this.buildNpcNameInput(npc.name);
      list.addControl(this.actionButton(`◄ ${npc.outfit} ►`, () => h.onNpcOutfitCycle(1)));
      list.addControl(this.actionButton(`mood: ${npc.defaultMood}`, () => h.onNpcMoodCycle()));
      list.addControl(this.actionButton(`disp: ${npc.initialDisposition}`, () => h.onNpcDispositionCycle()));
      for (const a of ATTRIBUTES) {
        const v = npc.attributes?.[a.id] ?? 20;
        list.addControl(this.stepperRow(a.id.slice(0, 5), `${v}`, () => h.onNpcAttrNudge(a.id, -5), () => h.onNpcAttrNudge(a.id, +5)));
      }
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

  private domInput(left: string, top: string, width: string, placeholder: string, onChange: (v: string) => void): HTMLInputElement {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.style.cssText = `position:fixed;left:${left};top:${top};width:${width};z-index:30;`
      + 'background:rgba(0,18,28,0.9);border:1px solid #1d3b46;color:#00FFCC;'
      + 'font-family:"Courier New",monospace;font-size:12px;padding:3px 6px;border-radius:4px;outline:none;';
    input.addEventListener('keydown', (e) => e.stopPropagation());
    input.addEventListener('change', () => onChange(input.value));
    document.body.appendChild(input);
    return input;
  }

  private buildDomInputs(): void {
    const wrapper = document.createElement('div');
    wrapper.id = 'editor-dom-inputs';
    document.body.appendChild(wrapper);
    this.idInput = this.domInput('556px', '10px', '120px', t('editor.sceneId'), (v) => {
      const clean = v.toLowerCase().replace(/[^a-z0-9_-]/g, '');
      this.state.setMeta({ id: clean || 'untitled' });
      this.refresh();
    });
    wrapper.appendChild(this.idInput);
    this.nameInput = this.domInput('686px', '10px', '160px', t('editor.sceneName'), (v) => {
      this.state.setMeta({ name: v || this.state.doc.id });
      this.refresh();
    });
    wrapper.appendChild(this.nameInput);
  }

  private buildNpcNameInput(current: string): void {
    if (typeof document === 'undefined') return;
    this.npcNameInput = this.domInput(`calc(100vw - ${PANEL_W + 4}px)`, '210px', `${PANEL_W - 40}px`, 'NPC name', (v) => {
      if (v.trim()) this.handlers.onNpcNameEdit(v.trim());
    });
    this.npcNameInput.value = current;
  }
}
