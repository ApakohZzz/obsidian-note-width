// 扫描 vault 内所有 .md 文件，按当前 data.json 设置离线模拟 resolveWidth，
// 输出每篇笔记的预期生效宽度，便于核对配置与定位 bug。
//
// 用法：node scripts/dump-vault.mjs [--vault <vault根>]
//   默认 vault 根为本插件的上溯：plugin/.. /.. /  即 .obsidian/plugins/note-width 上跳两级
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadEngine } from "./_loadEngine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// 解析参数
let vaultArg = null;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--vault") vaultArg = process.argv[++i];
}
const vaultRoot = vaultArg
  ? path.resolve(vaultArg)
  : path.resolve(projectRoot, "..", "..", ".."); // .obsidian/plugins/note-width → vault

if (!fs.existsSync(path.join(vaultRoot, ".obsidian"))) {
  console.error(`✗ ${vaultRoot} 看起来不是 Obsidian vault（找不到 .obsidian 目录）`);
  process.exit(2);
}

// 读 data.json（插件设置）
const dataPath = path.join(projectRoot, "data.json");
let settings = { defaultWidth: "default", folderRules: [] };
if (fs.existsSync(dataPath)) {
  try {
    settings = { ...settings, ...JSON.parse(fs.readFileSync(dataPath, "utf8")) };
  } catch (e) {
    console.warn("⚠ 解析 data.json 失败，使用默认设置：", e.message);
  }
}

console.log(`Vault: ${vaultRoot}`);
console.log(`全局默认: ${settings.defaultWidth}`);
console.log(`文件夹规则: ${JSON.stringify(settings.folderRules)}`);
console.log("");

const { resolveWidth, widthValueToRaw } = await loadEngine();

// 极简 frontmatter 解析：只读出顶部 ---...--- 块里的 width 字段
function readFrontmatterWidth(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  if (!text.startsWith("---")) return undefined;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return undefined;
  const block = text.slice(3, end);
  for (const line of block.split(/\r?\n/)) {
    const m = /^\s*note-width\s*:\s*(.+?)\s*$/i.exec(line);
    if (m) {
      let v = m[1].trim();
      // 去掉外层引号
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return undefined;
}

// 递归扫描 .md
const SKIP_DIRS = new Set([".obsidian", ".trash", "node_modules", ".git"]);
function* walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      yield* walk(p);
    } else if (ent.isFile() && ent.name.toLowerCase().endsWith(".md")) {
      yield p;
    }
  }
}

const rows = [];
for (const abs of walk(vaultRoot)) {
  const rel = path.relative(vaultRoot, abs).replace(/\\/g, "/");
  const widthRaw = readFrontmatterWidth(abs);
  const fm = widthRaw === undefined ? undefined : { "note-width": widthRaw };
  const resolved = resolveWidth(rel, fm, settings);
  rows.push({
    path: rel,
    fmWidth: widthRaw ?? "",
    effective:
      resolved.value.kind === "default"
        ? "(default)"
        : widthValueToRaw(resolved.value),
    source:
      resolved.source.kind === "folder"
        ? `folder:${resolved.source.path || "/"}`
        : resolved.source.kind,
  });
}

// 表格输出
const colW = (key) => Math.max(key.length, ...rows.map((r) => String(r[key]).length));
const cols = ["path", "fmWidth", "effective", "source"];
const widths = Object.fromEntries(cols.map((c) => [c, colW(c)]));
const sep = cols.map((c) => "-".repeat(widths[c])).join("  ");
const head = cols.map((c) => c.padEnd(widths[c])).join("  ");
console.log(head);
console.log(sep);
for (const r of rows) {
  console.log(cols.map((c) => String(r[c]).padEnd(widths[c])).join("  "));
}
console.log(`\n共 ${rows.length} 篇笔记`);
