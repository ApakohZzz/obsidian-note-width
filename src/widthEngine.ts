import {
  FRONTMATTER_KEY,
  PluginSettings,
  ResolvedWidth,
  WidthSource,
  WidthValue,
} from "./types";

const WIDTH_REGEX = /^(\d+(?:\.\d+)?)(px|%)$/i;
const DATA_ATTR = "data-note-width";
const CSS_VAR = "--note-custom-width";

/**
 * Parse a raw user-supplied width string into a WidthValue.
 * Returns { kind: "default" } for empty / "default" / null / undefined.
 * Returns null when the input is non-empty but invalid (caller decides how to handle).
 */
export function parseWidthValue(raw: unknown): WidthValue | null {
  if (raw === undefined || raw === null) return { kind: "default" };
  const s = String(raw).trim().toLowerCase();
  if (s === "" || s === "default") return { kind: "default" };
  if (s === "full" || s === "100%" || s === "fullwidth" || s === "full-width") {
    return { kind: "full" };
  }
  const m = WIDTH_REGEX.exec(s);
  if (!m) return null;
  // Normalize: drop unnecessary trailing zeros in the number
  const num = String(parseFloat(m[1]));
  return { kind: "custom", value: `${num}${m[2]}` };
}

/** Convert a WidthValue back to its persisted string form (for frontmatter / settings). */
export function widthValueToRaw(value: WidthValue): string {
  switch (value.kind) {
    case "default":
      return "default";
    case "full":
      return "full";
    case "custom":
      return value.value;
  }
}

/**
 * Three-tier resolution: note frontmatter > folder rule (longest matching prefix) > global default.
 * If every tier resolves to "default", returns { kind: "default" } with source "obsidian-default".
 *
 * @param filePath        File path relative to vault root, e.g. "notes/foo.md"
 * @param frontmatter     Parsed frontmatter from metadataCache (may be undefined)
 * @param settings        Plugin settings
 */
export function resolveWidth(
  filePath: string,
  frontmatter: Record<string, unknown> | undefined,
  settings: PluginSettings,
): ResolvedWidth {
  // Tier 1: note frontmatter
  const fmRaw = frontmatter?.[FRONTMATTER_KEY];
  if (fmRaw !== undefined && fmRaw !== null && String(fmRaw).trim() !== "") {
    const parsed = parseWidthValue(fmRaw);
    if (parsed === null) {
      console.warn(
        "[note-width] invalid width in frontmatter:",
        fmRaw,
        "for",
        filePath,
      );
    } else if (parsed.kind !== "default") {
      return { value: parsed, source: { kind: "note" } };
    }
  }

  // Tier 2: folder rules — pick the longest path prefix that matches.
  const folderMatch = pickFolderRule(filePath, settings);
  if (folderMatch) {
    const parsed = parseWidthValue(folderMatch.width);
    if (parsed === null) {
      console.warn(
        "[note-width] invalid width in folder rule for",
        folderMatch.path,
        ":",
        folderMatch.width,
      );
    } else if (parsed.kind !== "default") {
      return {
        value: parsed,
        source: { kind: "folder", path: folderMatch.path } as WidthSource,
      };
    }
  }

  // Tier 3: global default
  const globalParsed = parseWidthValue(settings.defaultWidth);
  if (globalParsed === null) {
    console.warn(
      "[note-width] invalid global default width:",
      settings.defaultWidth,
    );
  } else if (globalParsed.kind !== "default") {
    return { value: globalParsed, source: { kind: "global" } };
  }

  return { value: { kind: "default" }, source: { kind: "obsidian-default" } };
}

/**
 * Find the folder rule whose path is the longest prefix of `filePath`.
 * - Empty path "" is treated as vault root and matches everything (lowest priority).
 * - Match is segment-based: "foo" does NOT match "foobar/note.md".
 */
function pickFolderRule(
  filePath: string,
  settings: PluginSettings,
): { path: string; width: string } | null {
  const normalized = filePath.replace(/\\/g, "/").replace(/^\/+/, "");
  const dir = normalized.includes("/")
    ? normalized.slice(0, normalized.lastIndexOf("/"))
    : "";

  let best: { path: string; width: string } | null = null;
  let bestLen = -1;
  for (const rule of settings.folderRules) {
    const rulePath = rule.path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (rulePath === "") {
      if (bestLen < 0) {
        best = { path: "", width: rule.width };
        bestLen = 0;
      }
      continue;
    }
    if (dir === rulePath || dir.startsWith(rulePath + "/")) {
      if (rulePath.length > bestLen) {
        best = { path: rulePath, width: rule.width };
        bestLen = rulePath.length;
      }
    }
  }
  return best;
}

/**
 * The single DOM write site. Tags / cleans the leaf container so styles.css can take effect,
 * and writes the inline CSS variable for custom widths.
 */
export function applyToLeaf(
  leafContainer: HTMLElement | null | undefined,
  value: WidthValue,
): void {
  if (!leafContainer) return;
  if (value.kind === "default") {
    leafContainer.removeAttribute(DATA_ATTR);
    leafContainer.style.removeProperty(CSS_VAR);
    return;
  }
  if (value.kind === "full") {
    leafContainer.setAttribute(DATA_ATTR, "full");
    leafContainer.style.removeProperty(CSS_VAR);
    return;
  }
  // custom
  leafContainer.setAttribute(DATA_ATTR, "custom");
  leafContainer.style.setProperty(CSS_VAR, value.value);
}

/** Remove all traces written by this plugin from a leaf container. */
export function clearLeaf(leafContainer: HTMLElement | null | undefined): void {
  if (!leafContainer) return;
  leafContainer.removeAttribute(DATA_ATTR);
  leafContainer.style.removeProperty(CSS_VAR);
}
