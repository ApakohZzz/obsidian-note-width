import {
  MarkdownView,
  Plugin,
  TFile,
  WorkspaceLeaf,
} from "obsidian";
import {
  DEFAULT_SETTINGS,
  FRONTMATTER_KEY,
  PluginSettings,
  ResolvedWidth,
  WidthValue,
} from "./types";
import {
  applyToLeaf,
  clearLeaf,
  parseWidthValue,
  resolveWidth,
  widthValueToRaw,
} from "./widthEngine";
import { NoteWidthModal } from "./widthModal";
import { NoteWidthSettingTab } from "./settings";

const ACTION_FLAG = "noteWidthActionAttached";

export default class NoteWidthPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;

  /** Track leaves we've tagged so onunload can clean every one. */
  private taggedLeaves: Set<WorkspaceLeaf> = new Set();

  async onload() {
    await this.loadSettings();

    this.addSettingTab(new NoteWidthSettingTab(this.app, this));

    this.addCommand({
      id: "set-note-width",
      name: "设置当前笔记宽度…",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;
        if (!checking) this.openModalFor(view);
        return true;
      },
    });

    this.addCommand({
      id: "toggle-full-width",
      name: "切换当前笔记全宽",
      checkCallback: (checking) => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view || !view.file) return false;
        if (!checking) this.toggleFullWidth(view.file);
        return true;
      },
    });

    // Re-apply on relevant workspace events.
    this.registerEvent(
      this.app.workspace.on("file-open", () => {
        this.applyAllVisibleLeaves();
        this.attachActionsToAllViews();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.applyAllVisibleLeaves();
        this.attachActionsToAllViews();
      }),
    );
    this.registerEvent(
      this.app.workspace.on("layout-change", () => {
        this.applyAllVisibleLeaves();
        this.attachActionsToAllViews();
      }),
    );
    this.registerEvent(
      this.app.metadataCache.on("changed", (file) => {
        this.applyForFile(file);
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      this.applyAllVisibleLeaves();
      this.attachActionsToAllViews();
    });
  }

  onunload() {
    for (const leaf of this.taggedLeaves) {
      clearLeaf(leaf.view?.containerEl ?? null);
    }
    this.taggedLeaves.clear();
  }

  async loadSettings() {
    const raw = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw ?? {});
    if (!Array.isArray(this.settings.folderRules)) {
      this.settings.folderRules = [];
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.applyAllVisibleLeaves();
  }

  /** Resolve + apply for a specific file across all leaves currently showing it. */
  applyForFile(file: TFile) {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === file.path) {
        const resolved = this.resolveForFile(view.file);
        applyToLeaf(leaf.view.containerEl, resolved.value);
        this.taggedLeaves.add(leaf);
      }
    });
  }

  /** Iterate every visible markdown leaf and apply the resolved width. */
  applyAllVisibleLeaves() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) return;
      if (!view.file) {
        clearLeaf(view.containerEl);
        return;
      }
      const resolved = this.resolveForFile(view.file);
      applyToLeaf(view.containerEl, resolved.value);
      this.taggedLeaves.add(leaf);
    });
  }

  resolveForFile(file: TFile): ResolvedWidth {
    const cache = this.app.metadataCache.getFileCache(file);
    return resolveWidth(file.path, cache?.frontmatter, this.settings);
  }

  /** Toggle full width: if currently full -> remove the field; otherwise set "full". */
  async toggleFullWidth(file: TFile) {
    const cache = this.app.metadataCache.getFileCache(file);
    const current = parseWidthValue(cache?.frontmatter?.[FRONTMATTER_KEY]);
    const turnOn = !(current && current.kind === "full");
    await this.writeNoteWidth(file, turnOn ? { kind: "full" } : { kind: "default" });
  }

  /**
   * Persist a width to the note's frontmatter.
   * { kind: "default" } removes the field entirely (so resolution falls through).
   */
  async writeNoteWidth(file: TFile, value: WidthValue) {
    await this.app.fileManager.processFrontMatter(file, (fm) => {
      if (value.kind === "default") {
        delete fm[FRONTMATTER_KEY];
      } else {
        fm[FRONTMATTER_KEY] = widthValueToRaw(value);
      }
    });
    // metadataCache "changed" event will re-apply, but force one immediate apply
    // for snappier feedback.
    this.applyForFile(file);
  }

  openModalFor(view: MarkdownView) {
    if (!view.file) return;
    new NoteWidthModal(this, view).open();
  }

  /** Add the toolbar action button to every MarkdownView, exactly once per view. */
  attachActionsToAllViews() {
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) return;
      const v = view as MarkdownView & Record<string, unknown>;
      if (v[ACTION_FLAG]) return;
      v[ACTION_FLAG] = true;
      view.addAction("move-horizontal", "设置笔记宽度", () => {
        this.openModalFor(view);
      });
    });
  }
}
