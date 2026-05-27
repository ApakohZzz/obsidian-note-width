// note-width 纯逻辑自测：覆盖 parseWidthValue / resolveWidth 全部分支
// 用法：npm run test
import { loadEngine } from "./_loadEngine.mjs";

const engine = await loadEngine();
const { parseWidthValue, resolveWidth, widthValueToRaw } = engine;

let pass = 0;
let fail = 0;
const fails = [];

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    pass++;
  } else {
    fail++;
    fails.push(`  ✗ ${label}\n    expected: ${e}\n    actual  : ${a}`);
  }
}

// ---------- parseWidthValue ----------
eq(parseWidthValue(undefined), { kind: "default" }, "parse undefined → default");
eq(parseWidthValue(null), { kind: "default" }, "parse null → default");
eq(parseWidthValue(""), { kind: "default" }, "parse empty string → default");
eq(parseWidthValue("default"), { kind: "default" }, "parse 'default' → default");
eq(parseWidthValue("DEFAULT"), { kind: "default" }, "parse 'DEFAULT' (case insensitive) → default");
eq(parseWidthValue("full"), { kind: "full" }, "parse 'full' → full");
eq(parseWidthValue("FULL"), { kind: "full" }, "parse 'FULL' (case insensitive) → full");
eq(parseWidthValue("100%"), { kind: "full" }, "parse '100%' (alias) → full");
eq(parseWidthValue("full-width"), { kind: "full" }, "parse 'full-width' alias");
eq(parseWidthValue("900px"), { kind: "custom", value: "900px" }, "parse '900px'");
eq(parseWidthValue("900PX"), { kind: "custom", value: "900px" }, "parse '900PX' normalize");
eq(parseWidthValue("70%"), { kind: "custom", value: "70%" }, "parse '70%'");
eq(parseWidthValue(" 70% "), { kind: "custom", value: "70%" }, "parse '70%' with whitespace");
eq(parseWidthValue("900.0px"), { kind: "custom", value: "900px" }, "parse '900.0px' normalize trailing zero");
eq(parseWidthValue("70.5%"), { kind: "custom", value: "70.5%" }, "parse '70.5%'");
eq(parseWidthValue("abc"), null, "parse 'abc' → invalid (null)");
eq(parseWidthValue("900"), null, "parse '900' (no unit) → invalid");
eq(parseWidthValue("900em"), null, "parse '900em' (unsupported unit) → invalid");
eq(parseWidthValue("-50px"), null, "parse '-50px' (negative) → invalid");
eq(parseWidthValue("900 px"), null, "parse '900 px' (space inside) → invalid");

// ---------- widthValueToRaw ----------
eq(widthValueToRaw({ kind: "default" }), "default", "raw of default");
eq(widthValueToRaw({ kind: "full" }), "full", "raw of full");
eq(widthValueToRaw({ kind: "custom", value: "900px" }), "900px", "raw of custom");

// ---------- resolveWidth ----------
const settingsEmpty = { defaultWidth: "default", folderRules: [] };

eq(
  resolveWidth("a.md", undefined, settingsEmpty),
  { value: { kind: "default" }, source: { kind: "obsidian-default" } },
  "resolve nothing set → obsidian-default",
);

eq(
  resolveWidth("a.md", { "note-width": "full" }, settingsEmpty),
  { value: { kind: "full" }, source: { kind: "note" } },
  "resolve frontmatter full",
);

eq(
  resolveWidth("a.md", { "note-width": "900px" }, settingsEmpty),
  { value: { kind: "custom", value: "900px" }, source: { kind: "note" } },
  "resolve frontmatter 900px",
);

eq(
  resolveWidth("a.md", { "note-width": "default" }, settingsEmpty),
  { value: { kind: "default" }, source: { kind: "obsidian-default" } },
  "resolve frontmatter explicitly default → fall through",
);

eq(
  resolveWidth("a.md", { "note-width": "garbage" }, settingsEmpty),
  { value: { kind: "default" }, source: { kind: "obsidian-default" } },
  "resolve frontmatter invalid → fall through",
);

// 文件夹规则
const folderSettings = {
  defaultWidth: "default",
  folderRules: [
    { path: "notes", width: "70%" },
    { path: "notes/wide", width: "full" },
    { path: "", width: "1200px" }, // 仓库根
  ],
};

eq(
  resolveWidth("a.md", undefined, folderSettings),
  {
    value: { kind: "custom", value: "1200px" },
    source: { kind: "folder", path: "" },
  },
  "resolve root folder rule",
);

eq(
  resolveWidth("notes/foo.md", undefined, folderSettings),
  {
    value: { kind: "custom", value: "70%" },
    source: { kind: "folder", path: "notes" },
  },
  "resolve notes/* → 70%",
);

eq(
  resolveWidth("notes/wide/x.md", undefined, folderSettings),
  {
    value: { kind: "full" },
    source: { kind: "folder", path: "notes/wide" },
  },
  "resolve notes/wide/* → longer prefix wins (full)",
);

eq(
  resolveWidth("notes/wide/sub/x.md", undefined, folderSettings),
  {
    value: { kind: "full" },
    source: { kind: "folder", path: "notes/wide" },
  },
  "resolve nested under notes/wide",
);

// 段路径不应误匹配（"foo" ≠ "foobar/x"）
const segSettings = {
  defaultWidth: "default",
  folderRules: [{ path: "foo", width: "900px" }],
};
eq(
  resolveWidth("foobar/x.md", undefined, segSettings),
  { value: { kind: "default" }, source: { kind: "obsidian-default" } },
  "segment match: 'foo' should not match 'foobar/x.md'",
);
eq(
  resolveWidth("foo/x.md", undefined, segSettings),
  {
    value: { kind: "custom", value: "900px" },
    source: { kind: "folder", path: "foo" },
  },
  "segment match: 'foo' matches 'foo/x.md'",
);

// frontmatter 优先于 folder
eq(
  resolveWidth(
    "notes/wide/x.md",
    { "note-width": "500px" },
    folderSettings,
  ),
  {
    value: { kind: "custom", value: "500px" },
    source: { kind: "note" },
  },
  "note frontmatter overrides folder",
);

// 全局默认兜底
const globalSettings = {
  defaultWidth: "1000px",
  folderRules: [],
};
eq(
  resolveWidth("a.md", undefined, globalSettings),
  {
    value: { kind: "custom", value: "1000px" },
    source: { kind: "global" },
  },
  "global default kicks in",
);

// 全局非法 → fall through
const badGlobal = { defaultWidth: "garbage", folderRules: [] };
eq(
  resolveWidth("a.md", undefined, badGlobal),
  { value: { kind: "default" }, source: { kind: "obsidian-default" } },
  "invalid global default → fall through",
);

// Windows 反斜杠路径
eq(
  resolveWidth("notes\\wide\\x.md", undefined, folderSettings),
  {
    value: { kind: "full" },
    source: { kind: "folder", path: "notes/wide" },
  },
  "windows backslash path normalization",
);

// ---------- 输出 ----------
console.log(`PASS ${pass}  FAIL ${fail}  TOTAL ${pass + fail}`);
if (fail > 0) {
  console.log("\nFailures:");
  for (const line of fails) console.log(line);
  process.exit(1);
}
