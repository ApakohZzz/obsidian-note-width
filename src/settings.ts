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

    containerEl.createEl("h2", { text: "笔记宽度" });

    new Setting(containerEl)
      .setName("全局默认宽度")
      .setDesc(
        '可填：default（沿用 Obsidian 自身设置）、full（全宽）、像素值（如 900px）、百分比（如 70%）。当笔记本身和文件夹规则都没设置时使用该值。',
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

    containerEl.createEl("h3", { text: "文件夹规则" });
    containerEl.createEl("p", {
      text: "每条规则作用于指定文件夹（包含子文件夹）下的笔记。匹配前缀最长的规则优先生效。笔记自身的 frontmatter 设置会覆盖文件夹规则。路径留空表示「整个仓库根目录」。",
      cls: "setting-item-description",
    });

    const list = containerEl.createDiv();
    this.renderRules(list);

    new Setting(containerEl).addButton((b) =>
      b
        .setButtonText("新增文件夹规则")
        .setCta()
        .onClick(async () => {
          this.plugin.settings.folderRules.push({ path: "", width: "default" });
          await this.plugin.saveSettings();
          this.renderRules(list);
        }),
    );
  }

  private renderRules(container: HTMLElement) {
    container.empty();
    this.plugin.settings.folderRules.forEach((rule, idx) => {
      const row = container.createDiv({ cls: "note-width-folder-rule" });

      const pathInput = row.createEl("input", {
        type: "text",
        cls: "note-width-path",
      });
      pathInput.placeholder = "文件夹路径（留空表示仓库根）";
      pathInput.value = rule.path;
      pathInput.addEventListener("input", () => {
        // 即时保存路径（trim 但不强制末尾斜杠，由 widthEngine 统一规整）
        this.updateRule(idx, { path: pathInput.value.trim() });
      });

      const widthInput = row.createEl("input", {
        type: "text",
        cls: "note-width-width",
      });
      widthInput.placeholder = "default | full | 900px | 70%";
      widthInput.value = rule.width;
      widthInput.addEventListener("input", () => {
        const v = widthInput.value.trim();
        if (parseWidthValue(v) === null) {
          widthInput.addClass("is-invalid");
          return;
        }
        widthInput.removeClass("is-invalid");
        this.updateRule(idx, { width: v === "" ? "default" : v });
      });

      const del = row.createEl("button", { text: "删除" });
      del.addEventListener("click", async () => {
        this.plugin.settings.folderRules.splice(idx, 1);
        await this.plugin.saveSettings();
        this.renderRules(container);
      });
    });
  }

  private async updateRule(idx: number, patch: Partial<FolderRule>) {
    const cur = this.plugin.settings.folderRules[idx];
    if (!cur) return;
    this.plugin.settings.folderRules[idx] = { ...cur, ...patch };
    await this.plugin.saveSettings();
  }
}
