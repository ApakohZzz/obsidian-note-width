export type WidthValue =
  | { kind: "default" }
  | { kind: "full" }
  | { kind: "custom"; value: string }; // e.g. "900px" | "70%"

/**
 * frontmatter 里使用的字段名。集中维护，避免散落硬编码。
 * 用 "note-width" 而不是 "width"，把通用的 width 字段名留给用户和其它插件。
 */
export const FRONTMATTER_KEY = "note-width";

export interface FolderRule {
  /** Folder path relative to vault root (no leading/trailing slash). Empty string = vault root. */
  path: string;
  /** Raw width string: "full" | "default" | "<num>px" | "<num>%" */
  width: string;
}

export interface PluginSettings {
  /** Raw width string for the global default. "default" means: do not override Obsidian's own setting. */
  defaultWidth: string;
  folderRules: FolderRule[];
}

export const DEFAULT_SETTINGS: PluginSettings = {
  defaultWidth: "default",
  folderRules: [],
};

/** Source describing where the resolved width actually came from. Used by the modal status text. */
export type WidthSource =
  | { kind: "note" }
  | { kind: "folder"; path: string }
  | { kind: "global" }
  | { kind: "obsidian-default" };

export interface ResolvedWidth {
  value: WidthValue;
  source: WidthSource;
}
