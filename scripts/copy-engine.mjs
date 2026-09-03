// 从 node_modules/stockfish/src 里找出“单线程 lite”构建（.js + .wasm 同名对），
// 复制到 public/engine/，并生成 src/engine/enginePath.generated.ts。
import { readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'node_modules', 'stockfish', 'bin');
const outDir = join(root, 'public', 'engine');

const files = readdirSync(srcDir);
// 优先 lite + single（单线程，无需 COOP/COEP），其次任何 single
const pick = (re) => files.find((f) => re.test(f));
const js =
  pick(/lite.*single.*\.js$/i) ??
  pick(/single.*lite.*\.js$/i) ??
  pick(/single.*\.js$/i);
if (!js) {
  console.error('未在 node_modules/stockfish/src 找到 single 构建，文件列表：', files);
  process.exit(1);
}
const base = js.replace(/\.js$/, '');
const related = files.filter((f) => f.startsWith(base)); // .js .wasm (可能还有 .worker.js)
mkdirSync(outDir, { recursive: true });
for (const f of related) copyFileSync(join(srcDir, f), join(outDir, f));

const genPath = join(root, 'src', 'engine', 'enginePath.generated.ts');
mkdirSync(dirname(genPath), { recursive: true });
writeFileSync(
  genPath,
  `// 由 scripts/copy-engine.mjs 生成，勿手改\nexport const ENGINE_JS_URL = '/engine/${js}';\n`,
);
console.log('engine files:', related.join(', '));
