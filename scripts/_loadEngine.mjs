// 用 esbuild 程序化打包 src/widthEngine.ts 成内存里的 CJS 模块，通过 vm 加载，
// 导出引擎函数给 selftest / dump-vault 使用。这样 CLI 脚本可以直接复用真实纯逻辑，
// 不必维护第二份 JS 实现。
//
// widthEngine.ts 是纯逻辑、无外部依赖，所以 sandbox 不需要 require。
import esbuild from "esbuild";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

export async function loadEngine() {
  const result = await esbuild.build({
    entryPoints: [path.join(projectRoot, "src/widthEngine.ts")],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node18",
    write: false,
    logLevel: "silent",
  });
  const code = result.outputFiles[0].text;
  const sandbox = {
    module: { exports: {} },
    exports: {},
    console,
    process,
  };
  sandbox.exports = sandbox.module.exports;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: "widthEngine.bundled.cjs" });
  return sandbox.module.exports;
}
