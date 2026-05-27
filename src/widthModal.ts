import { MarkdownView, Modal, Notice, Setting } from "obsidian";
import type NoteWidthPlugin from "./main";
import {
  applyToLeaf,
  parseWidthValue,
  widthValueToRaw,
} from "./widthEngine";
import { ResolvedWidth, FRONTMATTER_KEY, WidthValue } from "./types";

type Unit = "px" | "%";

interface UnitConfig {
  min: number;
  max: number;
  step: number;
  initial: number;
}

const UNIT_CFG: Record<Unit, UnitConfig> = {
  px: { min: 400, max: 1600, step: 10, initial: 900 },
  "%": { min: 30, max: 100, step: 1, initial: 70 },
};

const SOURCE_LABEL: Record<string, (extra?: string) => string> = {
  note: () => "本笔记 frontmatter",
  folder: (path) => `文件夹规则「${path || "/"}」`,
  global: () => "全局默认值",
  "obsidian-default": () => "未设置（沿用 Obsidian 默认）",
};

export class NoteWidthModal extends Modal {
  private plugin: NoteWidthPlugin;
  private view: MarkdownView;

  /** Modal 打开时 leaf 上已生效的 WidthValue，用户取消时回滚到这个值 */
  private originalApplied: WidthValue;
  /** 是否已点击保存或「沿用上一级」。若为 false 则关闭时回滚 */
  private committed = false;
  /** 关闭时要持久化的值（仅 committed 时使用） */
  private pendingValue: WidthValue;

  // UI 状态
  private fullWidth = false;
  private unit: Unit = "px";
  private numberValue = UNIT_CFG.px.initial;

  // 滑块 <-> 文本框 双向同步的回环保护
  private syncing = false;

  // 元素引用
  private sliderEl!: HTMLInputElement;
  private numberEl!: HTMLInputElement;
  private unitEl!: HTMLSelectElement;

  constructor(plugin: NoteWidthPlugin, view: MarkdownView) {
    super(plugin.app);
    this.plugin = plugin;
    this.view = view;

    const resolved = plugin.resolveForFile(view.file!);
    this.originalApplied = resolved.value;
    this.pendingValue = resolved.value;

    // UI 初值优先用本笔记 frontmatter 的设置；没有就用解析后的实际生效值
    const fmRaw = plugin.app.metadataCache.getFileCache(view.file!)
      ?.frontmatter?.[FRONTMATTER_KEY];
    const fmParsed = fmRaw !== undefined ? parseWidthValue(fmRaw) : null;
    const seed: WidthValue =
      fmParsed && fmParsed.kind !== "default" ? fmParsed : resolved.value;
    this.seedFromValue(seed);
  }

  private seedFromValue(v: WidthValue) {
    if (v.kind === "full") {
      this.fullWidth = true;
      return;
    }
    if (v.kind === "custom") {
      const m = /^(\d+(?:\.\d+)?)(px|%)$/i.exec(v.value);
      if (m) {
        this.unit = m[2] as Unit;
        this.numberValue = parseFloat(m[1]);
        return;
      }
    }
    this.unit = "px";
    this.numberValue = UNIT_CFG.px.initial;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("note-width-modal");
    contentEl.createEl("h3", { text: "笔记宽度" });

    // 当前生效来源
    const resolved = this.plugin.resolveForFile(this.view.file!);
    contentEl.createDiv({
      cls: "note-width-source",
      text: `当前生效来源：${this.sourceText(resolved)}`,
    });

    // 全宽开关
    new Setting(contentEl)
      .setName("全宽")
      .setDesc("打开后铺满整个阅读区，会覆盖下方的自定义宽度。")
      .addToggle((t) => {
        t.setValue(this.fullWidth);
        t.onChange((val) => {
          this.fullWidth = val;
          this.refreshDisabled();
          this.previewCurrent();
        });
      });

    // 单位下拉
    const unitRow = contentEl.createDiv({ cls: "note-width-row" });
    unitRow.createEl("label", { text: "单位" });
    this.unitEl = unitRow.createEl("select");
    for (const u of ["px", "%"] as Unit[]) {
      const o = this.unitEl.createEl("option", { value: u, text: u });
      if (u === this.unit) o.selected = true;
    }
    this.unitEl.addEventListener("change", () => {
      const next = this.unitEl.value as Unit;
      this.unit = next;
      const cfg = UNIT_CFG[next];
      if (this.numberValue < cfg.min || this.numberValue > cfg.max) {
        this.numberValue = cfg.initial;
      }
      this.applyConfigToSlider();
      this.writeNumberInputs(this.numberValue);
      this.previewCurrent();
    });

    // 滑块
    const sliderRow = contentEl.createDiv({ cls: "note-width-row" });
    sliderRow.createEl("label", { text: "宽度" });
    this.sliderEl = sliderRow.createEl("input", {
      type: "range",
      cls: "note-width-slider",
    });
    this.sliderEl.addEventListener("input", () => {
      if (this.syncing) return;
      const n = parseFloat(this.sliderEl.value);
      if (Number.isNaN(n)) return;
      this.numberValue = n;
      this.syncing = true;
      this.numberEl.value = this.formatNumber(n);
      this.numberEl.removeClass("is-invalid");
      this.syncing = false;
      this.previewCurrent();
    });

    // 数值文本框
    this.numberEl = sliderRow.createEl("input", {
      type: "text",
      cls: "note-width-number",
    });
    this.numberEl.addEventListener("input", () => {
      if (this.syncing) return;
      const cfg = UNIT_CFG[this.unit];
      const raw = this.numberEl.value.trim();
      const n = parseFloat(raw);
      if (
        !/^\d+(?:\.\d+)?$/.test(raw) ||
        Number.isNaN(n) ||
        n < cfg.min ||
        n > cfg.max
      ) {
        this.numberEl.addClass("is-invalid");
        return;
      }
      this.numberEl.removeClass("is-invalid");
      this.numberValue = n;
      this.syncing = true;
      this.sliderEl.value = String(n);
      this.syncing = false;
      this.previewCurrent();
    });

    this.applyConfigToSlider();
    this.writeNumberInputs(this.numberValue);
    this.refreshDisabled();

    // 操作按钮
    const actions = contentEl.createDiv({ cls: "note-width-actions" });

    const inheritBtn = actions.createEl("button", { text: "沿用上一级" });
    inheritBtn.addEventListener("click", () => {
      this.pendingValue = { kind: "default" };
      this.committed = true;
      this.close();
    });

    const cancelBtn = actions.createEl("button", { text: "取消" });
    cancelBtn.addEventListener("click", () => {
      this.committed = false;
      this.close();
    });

    const saveBtn = actions.createEl("button", { text: "保存", cls: "mod-cta" });
    saveBtn.addEventListener("click", () => {
      const v = this.currentValueFromUi();
      if (!v) {
        new Notice("宽度数值不合法");
        return;
      }
      this.pendingValue = v;
      this.committed = true;
      this.close();
    });
  }

  async onClose() {
    if (this.committed) {
      try {
        await this.plugin.writeNoteWidth(this.view.file!, this.pendingValue);
      } catch (e) {
        console.error("[note-width] 写入 frontmatter 失败", e);
        new Notice("保存笔记宽度失败");
        applyToLeaf(this.view.containerEl, this.originalApplied);
      }
    } else {
      // 用户取消：把预览改动回滚
      applyToLeaf(this.view.containerEl, this.originalApplied);
    }
    this.contentEl.empty();
  }

  // ---------- 工具方法 ----------

  private applyConfigToSlider() {
    const cfg = UNIT_CFG[this.unit];
    this.sliderEl.min = String(cfg.min);
    this.sliderEl.max = String(cfg.max);
    this.sliderEl.step = String(cfg.step);
    this.sliderEl.value = String(this.numberValue);
  }

  private writeNumberInputs(n: number) {
    this.syncing = true;
    this.numberEl.value = this.formatNumber(n);
    this.sliderEl.value = String(n);
    this.syncing = false;
  }

  private formatNumber(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  private refreshDisabled() {
    const dis = this.fullWidth;
    this.sliderEl.disabled = dis;
    this.numberEl.disabled = dis;
    this.unitEl.disabled = dis;
  }

  private currentValueFromUi(): WidthValue | null {
    if (this.fullWidth) return { kind: "full" };
    if (this.numberEl.hasClass("is-invalid")) return null;
    return {
      kind: "custom",
      value: `${this.formatNumber(this.numberValue)}${this.unit}`,
    };
  }

  private previewCurrent() {
    const v = this.currentValueFromUi();
    if (v) applyToLeaf(this.view.containerEl, v);
  }

  private sourceText(resolved: ResolvedWidth): string {
    const fn = SOURCE_LABEL[resolved.source.kind];
    const extra =
      resolved.source.kind === "folder" ? resolved.source.path : undefined;
    const where = fn ? fn(extra) : resolved.source.kind;
    const valueText =
      resolved.value.kind === "default"
        ? "默认"
        : widthValueToRaw(resolved.value);
    return `${where}（${valueText}）`;
  }
}
