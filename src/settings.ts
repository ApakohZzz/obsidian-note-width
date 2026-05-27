import { App, PluginSettingTab, Setting } from "obsidian";
import type NoteWidthPlugin from "./main";
import { parseWidthValue } from "./widthEngine";
import { FolderRule } from "./types";

export class NoteWidthSettingTab extends PluginSettingTab {
  plugin: NoteWidthPlugin;

  constructor(app: App, plugin: NoteWidthPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.addClass("note-width-settings");

    // 全局默认宽度
    new Setting(containerEl)
      .setName("全局默认宽度")
      .setDesc(
        "可填：default（沿用 Obsidian 自身设置）、full（全宽）、像素值（如 900px）、百分比（如 70%）。当笔记本身和文件夹规则都没设置时使用该值。",
      )
      .addText((t) => {
        const inputEl = (t as unknown as { inputEl: HTMLInputElement }).inputEl;
        t.setPlaceholder("default")
          .setValue(this.plugin.settings.defaultWidth)
          .onChange(async (val) => {
            const trimmed = val.trim();
            const parsed = parseWidthValue(trimmed);
            if (parsed === null) {
              inputEl.addClass("is-invalid");
              return;
            }
            inputEl.removeClass("is-invalid");
            this.plugin.settings.defaultWidth =
              trimmed === "" ? "default" : trimmed;
            await this.plugin.saveSettings();
          });
      });

    // 文件夹规则：用一个 .setting-item-heading 充当分组标题，对齐 Obsidian 自带样式
    new Setting(containerEl)
      .setHeading()
      .setName("文件夹规则")
      .setDesc(
        "每条规则作用于指定文件夹（包含子文件夹）下的笔记。匹配前缀最长的规则优先生效。笔记自身的 frontmatter 设置会覆盖文件夹规则。路径留空表示「整个仓库根目录」。",
      );

    const list = containerEl.createDiv({ cls: "note-width-rules" });
    this.renderRules(list);

    new Setting(containerEl)
      .setName("添加一条新的文件夹规则")
      .setDesc("点击右侧按钮新增一条空规则，再填入路径与宽度。")
      .addButton((b) =>
        b
          .setButtonText("新增")
          .setCta()
          .onClick(async () => {
            this.plugin.settings.folderRules.push({
              path: "",
              width: "default",
            });
            await this.plugin.saveSettings();
            this.renderRules(list);
          }),
      );
  }

  private renderRules(container: HTMLElement) {
    container.empty();
    if (this.plugin.settings.folderRules.length === 0) {
      container.createDiv({
        cls: "note-width-empty",
        text: "暂无文件夹规则。",
      });
      return;
    }
    this.plugin.settings.folderRules.forEach((rule, idx) => {
      // 每条规则用 Setting 容器，自带卡片样式；在 control 区放路径 / 宽度 / 删除三个控件
      const setting = new Setting(container)
        .setClass("note-width-folder-rule")
        .setName(`规则 ${idx + 1}`)
        .setDesc("文件夹路径（留空 = 仓库根） · 宽度值");

      setting.addText((t) => {
        t.setPlaceholder("文件夹路径")
          .setValue(rule.path)
          .onChange((v) => {
            this.updateRule(idx, { path: v.trim() });
          });
        const inputEl = (t as unknown as { inputEl: HTMLInputElement }).inputEl;
        inputEl.addClass("note-width-path");
      });

      setting.addText((t) => {
        const inputEl = (t as unknown as { inputEl: HTMLInputElement }).inputEl;
        t.setPlaceholder("default | full | 900px | 70%")
          .setValue(rule.width)
          .onChange((v) => {
            const trimmed = v.trim();
            if (parseWidthValue(trimmed) === null) {
              inputEl.addClass("is-invalid");
              return;
            }
            inputEl.removeClass("is-invalid");
            this.updateRule(idx, {
              width: trimmed === "" ? "default" : trimmed,
            });
          });
        inputEl.addClass("note-width-width");
      });

      setting.addExtraButton((b) =>
        b
          .setIcon("trash")
          .setTooltip("删除该规则")
          .onClick(async () => {
            this.plugin.settings.folderRules.splice(idx, 1);
            await this.plugin.saveSettings();
            this.renderRules(container);
          }),
      );
    });
  }

  private async updateRule(idx: number, patch: Partial<FolderRule>) {
    const cur = this.plugin.settings.folderRules[idx];
    if (!cur) return;
    this.plugin.settings.folderRules[idx] = { ...cur, ...patch };
    await this.plugin.saveSettings();
  }
}
