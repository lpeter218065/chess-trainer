# 国际象棋训练软件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 一个纯浏览器的国际象棋训练 Web 应用：用户从课程给定的局面开始与 Stockfish 对弈，GPT 基于引擎分析做中文讲解 / hint / 总结。

**Architecture:** React + Vite SPA，无后端。两个 Stockfish WASM Web Worker（opponent 限力走棋、analyst 满力 MultiPV 分析）。GPT 只负责讲解，所有 prompt 都由引擎数据（评估、最佳线路 SAN、着法质量分级）grounding。Zustand 管理会话状态机，设置与进度存 localStorage。课程、棋理库是仓库内置的 TS 数据。

**Tech Stack:** React 19, TypeScript 5, Vite 8, Tailwind 4 (`@tailwindcss/vite`), Zustand 5, chess.js 1.4, react-chessboard 5.12, stockfish 18 (npm), vitest 4, react-router-dom 7。

设计规格见 `docs/superpowers/specs/2026-09-03-chess-trainer-design.md`，实施中遇到未写明的细节以规格为准。

## Global Constraints

- 全部 UI 文案与 GPT 讲解为**中文**，着法一律 SAN（如 `Nf3`、`O-O`）。
- 引擎评估在内部统一以**厘兵 cp，用户视角**（正数对用户有利）表示；只有在与 UCI 交互的边界层做视角转换。
- GPT 接口为 OpenAI 兼容 `POST {baseUrl}/chat/completions`，**默认 `stream: true`**，用 SSE 解析。
- 不引入后端；API Key 存 localStorage 并在设置页提示"仅存于本机浏览器"。
- 使用 Stockfish **单线程 lite** 构建（无需 COOP/COEP 头）。
- 每个任务结束时 `npm test` 与 `npm run typecheck` 必须全绿，然后 commit。
- 文件职责单一；纯函数模块（`src/chess/*`, `src/llm/sseParser.ts`, `src/llm/angles.ts`, `src/engine/uciParser.ts`）不得依赖 React / Zustand / DOM。
- 依赖的库 API 若与本文代码不一致（尤其 `react-chessboard` 与 `stockfish` 文件名），以 `node_modules` 里的 `.d.ts` / 实际文件为准并做最小修正，不改变本文定义的模块接口。

---

## 文件结构总览

```
chess/
  package.json  vite.config.ts  vitest.config.ts  tsconfig.json  tsconfig.app.json  tsconfig.node.json  index.html
  scripts/copy-engine.mjs                 # 从 node_modules/stockfish 复制 lite-single 构建到 public/engine 并生成路径常量
  public/engine/                          # 生成物（gitignore）
  src/
    main.tsx  App.tsx  index.css
    engine/   enginePath.generated.ts(生成)  uciParser.ts  difficulty.ts  stockfishWorker.ts  engineService.ts
    chess/    notation.ts  quality.ts  result.ts  features.ts
    llm/      sseParser.ts  client.ts  angles.ts  prompts.ts
    lessons/  schema.ts  principles.ts  index.ts  data/opening/*.ts  data/middlegame/*.ts  data/endgame/*.ts
    store/    settings.ts  progress.ts  session.ts  sessionInstance.ts
    components/  Board.tsx  EvalBar.tsx  CommentaryPanel.tsx  MoveList.tsx  HintButton.tsx  SettingsDialog.tsx  LessonCard.tsx  SummaryCard.tsx  StreamText.tsx
    pages/    HomePage.tsx  LessonPage.tsx
  tests/    (与 src 同名的 *.test.ts)
```

---

### Task 1: 项目脚手架 + 引擎文件复制脚本

**Files:**
- Create: `package.json`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `scripts/copy-engine.mjs`, `.gitignore`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `src/engine/enginePath.generated.ts` 导出 `ENGINE_JS_URL: string`（形如 `/engine/stockfish-18-lite-single-xxxx.js`），后续 Task 5 使用。

- [ ] **Step 1: 写 package.json 与配置文件**

```json
{
  "name": "chess-trainer",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "engine": "node scripts/copy-engine.mjs",
    "predev": "npm run engine",
    "prebuild": "npm run engine",
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --noEmit"
  },
  "dependencies": {
    "@tailwindcss/vite": "^4.3.3",
    "chess.js": "^1.4.0",
    "react": "^19.1.0",
    "react-chessboard": "^5.12.1",
    "react-dom": "^19.1.0",
    "react-router-dom": "^7.6.0",
    "stockfish": "^18.0.8",
    "tailwindcss": "^4.3.3",
    "zustand": "^5.0.15"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^5.0.0",
    "typescript": "^5.8.0",
    "vite": "^8.0.0",
    "vitest": "^4.0.0"
  }
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
  },
});
```

`tsconfig.json`:
```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["vite/client"]
  },
  "include": ["src", "tests"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts", "scripts"]
}
```

`index.html`:
```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>国际象棋训练</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/index.css`:
```css
@import "tailwindcss";
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`（占位，Task 7 替换）:
```tsx
export default function App() {
  return <div className="p-6 text-xl">国际象棋训练</div>;
}
```

`.gitignore`:
```
node_modules
dist
public/engine
src/engine/enginePath.generated.ts
```

- [ ] **Step 2: 写引擎复制脚本**

`scripts/copy-engine.mjs`:
```js
// 从 node_modules/stockfish/src 里找出“单线程 lite”构建（.js + .wasm 同名对），
// 复制到 public/engine/，并生成 src/engine/enginePath.generated.ts。
import { readdirSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const srcDir = join(root, 'node_modules', 'stockfish', 'src');
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
```

- [ ] **Step 3: 安装依赖并生成引擎文件**

Run: `npm install && npm run engine`
Expected: 输出 `engine files: stockfish-...-lite-single-....js, ....wasm`；`public/engine/` 有两个文件；`src/engine/enginePath.generated.ts` 存在。若脚本报"未找到"，`ls node_modules/stockfish/src` 手动确认文件名并修正正则。

- [ ] **Step 4: 写冒烟测试**

`tests/smoke.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';

describe('toolchain', () => {
  it('chess.js 可用', () => {
    const c = new Chess();
    c.move('e4');
    expect(c.fen()).toContain('4P3');
  });
});
```

Run: `npm test && npm run typecheck && npm run dev -- --port 5173 &` 然后打开 http://localhost:5173 看到"国际象棋训练"。
Expected: 测试 1 passed；typecheck 无错。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold vite react ts project with stockfish copy script"
```

---

### Task 2: 课程 schema、棋理库、12 课数据与校验测试

**Files:**
- Create: `src/lessons/schema.ts`, `src/lessons/principles.ts`, `src/lessons/index.ts`, `src/lessons/data/opening/{italian-game,open-sicilian,qgd,london}.ts`, `src/lessons/data/middlegame/{iqp-attack,minority-attack,open-file,opposite-castling}.ts`, `src/lessons/data/endgame/{kp-vs-k,lucena,philidor,kr-vs-k}.ts`
- Test: `tests/lessons.test.ts`

**Interfaces:**
- Produces:
  - `Section`, `Color`, `Lesson`, `StopRule`, `Target`（schema.ts）
  - `FeatureId`, `Principle`, `PRINCIPLES: Principle[]`, `principleById(id): Principle`（principles.ts）
  - `LESSONS: Lesson[]`, `lessonById(id): Lesson | undefined`, `lessonsBySection(section): Lesson[]`（index.ts）

- [ ] **Step 1: 写 schema**

`src/lessons/schema.ts`:
```ts
export type Section = 'opening' | 'middlegame' | 'endgame';
export type Color = 'w' | 'b';

export type StopRule =
  | { kind: 'plies'; count: number } // 用户走满 count 步结束
  | { kind: 'gameOver'; maxPlies: number }; // 分出结果或双方总步数到上限

export type Target = 'win' | 'draw' | 'hold';

export interface Lesson {
  id: string; // 'opening/italian-game'
  section: Section;
  title: string;
  summary: string;
  startFen: string;
  playerColor: Color; // 必须与 startFen 的行棋方一致
  theme: string;
  keyIdeas: string[];
  principleIds: string[];
  modelLine?: string[]; // SAN，从 startFen 开始
  stop: StopRule;
  target: Target;
  evalFloor?: number; // hold 用，默认 -100
  tags?: string[];
}

export const SECTION_LABEL: Record<Section, string> = {
  opening: '开局',
  middlegame: '中局',
  endgame: '残局',
};
```

- [ ] **Step 2: 写棋理库**

`src/lessons/principles.ts`（26 条，内容必须完整写入，以下为全部条目）:
```ts
import type { Section } from './schema';

/** 由 src/chess/features.ts 从局面提取的特征；own = 用户方，opp = 引擎方 */
export type FeatureId =
  | 'opening-phase'
  | 'middlegame-phase'
  | 'endgame-phase'
  | 'own-king-uncastled'
  | 'opp-king-uncastled'
  | 'opposite-castling'
  | 'queens-off'
  | 'open-file'
  | 'own-isolated-pawn'
  | 'opp-isolated-pawn'
  | 'own-doubled-pawn'
  | 'opp-doubled-pawn'
  | 'own-passed-pawn'
  | 'opp-passed-pawn'
  | 'own-bishop-pair'
  | 'opp-bishop-pair'
  | 'bishop-vs-knight'
  | 'pawn-endgame'
  | 'rook-endgame'
  | 'locked-center'
  | 'material-up'
  | 'material-down';

export interface Principle {
  id: string;
  name: string;
  phase: Section[];
  statement: string;
  why: string;
  exceptions?: string;
  triggers: FeatureId[];
}

export const PRINCIPLES: Principle[] = [
  { id: 'center-control', name: '中心控制', phase: ['opening', 'middlegame'],
    statement: '占据或控制 d4/e4/d5/e5 四个中心格，是开局阶段最优先的目标之一。',
    why: '中心的子力能同时影响两翼，转移速度快；控制中心的一方还能限制对方子力的出路。',
    exceptions: '超现代开局允许对方先占中心，再用子力从侧翼施压（如王翼印度、格林菲尔德）。',
    triggers: ['opening-phase'] },
  { id: 'development-order', name: '出子顺序', phase: ['opening'],
    statement: '先出马和象，再易位，后用车和后。不要用同一个子走两次，也不要过早出后。',
    why: '每一步都是一个节奏；重复调动一个子等于让对方多走一步。后过早出动会成为对方轻子驱赶的目标。',
    exceptions: '如果对方出现具体失误，可以为战术打破顺序。',
    triggers: ['opening-phase'] },
  { id: 'king-safety-castling', name: '王的安全与易位时机', phase: ['opening', 'middlegame'],
    statement: '中心还没封闭时，尽早易位把王送到安全的角落，并把车连接起来。',
    why: '中心开放后，停在中间的王会成为所有子力的攻击目标；易位同时也让一个车进入战场。',
    exceptions: '中心完全锁死时可以推迟易位，甚至用王翼兵进攻而不易位。',
    triggers: ['own-king-uncastled', 'opp-king-uncastled'] },
  { id: 'open-file-rook', name: '车占开放线', phase: ['middlegame', 'endgame'],
    statement: '车需要开放线或半开放线才能发挥作用；先争夺开放线的一方通常能渗透到第七横线。',
    why: '车是远距离直线子，被兵挡住时价值大打折扣；第七横线上的车能同时攻击对方的兵和王。',
    triggers: ['open-file'] },
  { id: 'outpost', name: '前哨与弱格', phase: ['middlegame'],
    statement: '对方兵无法驱赶的格子叫前哨，放一个马在对方阵地的前哨上常常值一个车的作用。',
    why: '前哨上的子无法被兵赶走，只能用子交换，交换后往往留下更多弱点。',
    triggers: ['middlegame-phase'] },
  { id: 'isolated-pawn', name: '孤立兵：弱点与动力', phase: ['middlegame'],
    statement: '孤立兵是长期弱点，但它也给拥有者带来空间、开放线和子力活动，进攻方要用它的动力换取王翼攻势。',
    why: '孤兵不能靠邻兵保护，只能靠子力守，守的子被牵制在被动位置；反过来孤兵前方的格子是对方的前哨。',
    exceptions: '中局子力多时孤兵的动力占上风；子力换光后它就是单纯的弱点。',
    triggers: ['own-isolated-pawn', 'opp-isolated-pawn'] },
  { id: 'doubled-pawns', name: '叠兵', phase: ['middlegame', 'endgame'],
    statement: '叠兵通常是弱点，因为它们互相挡路、无法互相保护，还会让某条线变成半开放线。',
    why: '两个叠兵的防守能力约等于一个兵，而且它们控制的格子重复。',
    exceptions: '如果叠兵换来了开放线或中心控制，往往是可以接受的代价。',
    triggers: ['own-doubled-pawn', 'opp-doubled-pawn'] },
  { id: 'passed-pawn', name: '通路兵', phase: ['middlegame', 'endgame'],
    statement: '通路兵必须被推进，或者被牢牢封锁；在残局中它经常决定胜负。',
    why: '通路兵前方没有对方兵，只能靠子力挡，每前进一格就绑住对方更多子力。',
    triggers: ['own-passed-pawn', 'opp-passed-pawn'] },
  { id: 'pawn-chain-attack', name: '兵链与进攻方向', phase: ['middlegame'],
    statement: '兵链指向哪一翼，就应该在那一翼进攻；攻击兵链要从它的底部开始。',
    why: '兵链前方是自己控制的空间，后方是弱点；兵链底部一旦被拆掉，整条链就失去支撑。',
    triggers: ['locked-center'] },
  { id: 'bishop-pair', name: '双象', phase: ['middlegame', 'endgame'],
    statement: '在开放的局面里，双象通常优于象马或双马，尤其在残局中。',
    why: '两个象能覆盖所有颜色的格子，并能远距离同时进攻两翼；马需要更多时间调动。',
    exceptions: '封闭局面里马可以跳过兵墙，象则被自己的兵挡住。',
    triggers: ['own-bishop-pair', 'opp-bishop-pair'] },
  { id: 'good-bad-bishop', name: '好象与坏象', phase: ['middlegame', 'endgame'],
    statement: '被自己兵挡住的象是“坏象”，兵不在同色格上的象是“好象”；交换时尽量留好象、换掉对方的好象。',
    why: '象的活动范围完全取决于同色格是否被己方兵占据。',
    triggers: ['bishop-vs-knight', 'locked-center'] },
  { id: 'knight-vs-bishop', name: '马与象的比较', phase: ['middlegame', 'endgame'],
    statement: '封闭局面、兵在一翼时马更好；开放局面、兵分两翼时象更好。',
    why: '马的攻击距离短但不受阻挡；象走得远但需要开放的斜线。',
    triggers: ['bishop-vs-knight'] },
  { id: 'minority-attack', name: '少数兵进攻', phase: ['middlegame'],
    statement: '在卡尔斯巴德兵型里，用 a、b 两个兵推向对方三个兵（b4-b5），目的是制造 c6 弱点，而不是升变。',
    why: '交换后对方会留下一个落后兵或孤兵，白方的车和后能从半开放的 c 线施压。',
    triggers: ['middlegame-phase'] },
  { id: 'trade-when-ahead', name: '优势时简化，劣势时复杂化', phase: ['middlegame', 'endgame'],
    statement: '物质领先时交换子力（但保留兵），劣势时避免交换、保持复杂。',
    why: '子力越少，物质优势的相对比重越大；残局里多一个兵往往就能赢。',
    exceptions: '如果对方有主动权，先化解威胁再谈简化。',
    triggers: ['material-up', 'material-down'] },
  { id: 'attacker-avoids-trades', name: '进攻方避免交换', phase: ['middlegame'],
    statement: '进攻王的一方要保留进攻子力，防守方则应该争取交换，尤其是换掉对方的后。',
    why: '攻王需要足够的子力数量；每一次交换都削弱攻击的火力。',
    triggers: ['opposite-castling'] },
  { id: 'opposite-castling', name: '异侧易位互攻', phase: ['middlegame'],
    statement: '双方王在不同翼时，比拼的是进攻速度：用兵冲击对方王前，不要浪费任何一个节奏去防守。',
    why: '两翼互攻时防守的一步往往赶不上进攻的一步，率先打开对方王前线路的一方获胜。',
    triggers: ['opposite-castling'] },
  { id: 'initiative-tempo', name: '主动权与节奏', phase: ['opening', 'middlegame'],
    statement: '掌握主动权的一方逼迫对方应付威胁；每一步都问自己“这步是不是在逼对方做事”。',
    why: '主动权让对手没有时间执行自己的计划，即使物质不占优也能维持压力。',
    triggers: ['opening-phase', 'middlegame-phase'] },
  { id: 'prophylaxis', name: '预防性思维', phase: ['middlegame', 'endgame'],
    statement: '走棋前先问对方想干什么，用一步把对方最好的计划提前否定掉。',
    why: '大多数中局失误来自只看自己的计划；预防对方的好棋通常比推进自己的计划更有价值。',
    triggers: ['middlegame-phase'] },
  { id: 'queens-off-king-active', name: '后交换后王要主动', phase: ['endgame'],
    statement: '后一旦下了棋盘，王就从被保护的对象变成主动的子力，应该立刻向中心或对方弱兵走去。',
    why: '没有后就几乎没有对王的杀棋威胁，而王在残局里的战斗力约等于一个轻子。',
    triggers: ['queens-off', 'endgame-phase'] },
  { id: 'opposition', name: '对王', phase: ['endgame'],
    statement: '两王在同一直线上隔一格相对时，轮到走的一方“失去对王”。王兵残局里，掌握对王等于掌握关键格。',
    why: '对王决定谁不得不让路；让路的一方通常被迫放弃关键格。',
    triggers: ['pawn-endgame'] },
  { id: 'key-squares', name: '关键格', phase: ['endgame'],
    statement: '单兵的关键格是兵前方两格的三个格子（兵在第五横线以上则是前方一格）；进攻方的王占到任一关键格即可获胜，与谁走无关。',
    why: '王站在关键格时，兵可以在王的护送下一路升变，对方王不可能同时挡住兵和赶走王。',
    triggers: ['pawn-endgame'] },
  { id: 'rook-behind-passed-pawn', name: '车放在通路兵后面', phase: ['endgame'],
    statement: '无论是自己的还是对方的通路兵，车都应该放在它后面（Tarrasch 规则）。',
    why: '兵前进时后面的车活动范围越来越大，前面的车则越来越小。',
    triggers: ['rook-endgame'] },
  { id: 'lucena-bridge', name: 'Lucena：搭桥', phase: ['endgame'],
    statement: '王在兵前、对方王被切断至少一条线时，用车到第四横线“搭桥”，把王从对方车的追击中掩护出来。',
    why: '王离开兵前的格子时会被对方车不断将军，把车放在第四横线上正好能在合适的时候挡住将军。',
    triggers: ['rook-endgame'] },
  { id: 'philidor-sixth-rank', name: 'Philidor：第六横线防御', phase: ['endgame'],
    statement: '守方王守在兵前，把车放在自己的第六横线（从对方看是第三横线）阻止对方王上前；对方兵一旦推到第六横线，车立刻回到底线从后面长将。',
    why: '对方王上不了第六横线就无法组织杀棋威胁；兵推到第六横线后对方王失去了藏身的格子，从背后的将军挡不住。',
    triggers: ['rook-endgame'] },
  { id: 'zugzwang', name: '迫移', phase: ['endgame'],
    statement: '在残局里让对方“走棋反而有害”，用等待着法逼对方自己破坏阵地。',
    why: '子力越少，每一步的代价越明显；很多兵残局和车残局的胜负都取决于谁先没有好棋走。',
    triggers: ['pawn-endgame', 'rook-endgame'] },
  { id: 'rook-mate-box', name: '车杀单王：缩小方框', phase: ['endgame'],
    statement: '用车把对方王限制在一个越来越小的方框里，用自己的王去对王，只在必要时走车。',
    why: '车单独无法杀王，需要王做支点；胡乱将军只会把王赶来赶去而不缩小活动范围。',
    triggers: ['rook-endgame'] },
];

const byId = new Map(PRINCIPLES.map((p) => [p.id, p]));

export function principleById(id: string): Principle {
  const p = byId.get(id);
  if (!p) throw new Error(`未知棋理 id: ${id}`);
  return p;
}
```

- [ ] **Step 3: 写 12 课数据**

每课一个文件，`export const lesson: Lesson = {...}`。全部 FEN 与内容如下：

`src/lessons/data/opening/italian-game.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'opening/italian-game',
  section: 'opening',
  title: '意大利开局：慢速 c3-d3 体系',
  summary: '1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 后白方如何布阵',
  startFen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R w KQkq - 0 5',
  playerColor: 'w',
  theme: '意大利开局的慢速体系里，白方不急于 d4，而是用 d3、O-O、Re1、Nbd2-f1-g3 或 b4/a4 慢慢展开。训练目标是完成出子和易位，同时保留中心张力。',
  keyIdeas: ['d3 支撑 e4 并给 c4 象留退路', '尽早 O-O，之后 Re1 保护 e4', '马的路线 Nb1-d2-f1-g3 是这个体系的标志', 'b4 或 a4 限制黑方 c5 象'],
  principleIds: ['center-control', 'development-order', 'king-safety-castling', 'initiative-tempo'],
  modelLine: ['d3', 'd6', 'O-O', 'O-O', 'Re1', 'a6', 'Nbd2', 'Ba7', 'Nf1', 'h6', 'Ng3'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
```

`src/lessons/data/opening/open-sicilian.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'opening/open-sicilian',
  section: 'opening',
  title: '开放西西里：纳伊道夫基本结构',
  summary: '1.e4 c5 2.Nf3 d6 3.d4 cxd4 4.Nxd4 Nf6 5.Nc3 a6 后白方的主要方案',
  startFen: 'rnbqkb1r/1p2pppp/p2p1n2/8/3NP3/2N5/PPP2PPP/R1BQKB1R w KQkq - 0 6',
  playerColor: 'w',
  theme: '白方在开放西西里里换掉了 d 兵，得到了空间和出子速度，黑方则拿到 c 线和长期的兵型优势。白方要利用速度优势，选定一个方案（Be2 平稳、Be3+f3 英国式进攻、Bg5 尖锐）并坚决执行。',
  keyIdeas: ['d4 马是中心支柱，注意 ...e5 的驱赶', '常见方案：Be2/O-O 或 Be3/f3/Qd2/O-O-O', '不要让黑方无偿完成 ...b5-...b4', 'f4/f3 是王翼进攻还是防守，要在方案里定好'],
  principleIds: ['development-order', 'center-control', 'initiative-tempo', 'king-safety-castling'],
  modelLine: ['Be3', 'e5', 'Nb3', 'Be6', 'f3', 'Be7', 'Qd2', 'O-O', 'O-O-O'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
```

`src/lessons/data/opening/qgd.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'opening/qgd',
  section: 'opening',
  title: '后翼弃兵拒吃：黑方的稳固布局',
  summary: '1.d4 d5 2.c4 e6 3.Nc3 Nf6 4.Bg5 后黑方如何出子和解放局面',
  startFen: 'rnbqkb1r/ppp2ppp/4pn2/3p2B1/2PP4/2N5/PP2PPPP/R2QKBNR b KQkq - 3 4',
  playerColor: 'b',
  theme: '拒吃后翼弃兵的黑方先用 ...Be7、...O-O、...Nbd7 建立稳固阵型，再通过 ...c5 或 ...dxc4 加 ...b5 解放。训练目标是不被牵制、不丢中心、按时完成解放性的兵推进。',
  keyIdeas: ['...Be7 解除 g5 象对 f6 马的牵制', '...Nbd7 而不是 ...Nc6，给 c 兵留路', '...h6 询问 g5 象也是常见手段', '解放方案：...dxc4 + ...c5 或 ...Ne4'],
  principleIds: ['development-order', 'king-safety-castling', 'center-control', 'prophylaxis'],
  modelLine: ['Be7', 'e3', 'O-O', 'Nf3', 'Nbd7', 'Rc1', 'c6', 'Bd3', 'dxc4', 'Bxc4', 'Nd5'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
```

`src/lessons/data/opening/london.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'opening/london',
  section: 'opening',
  title: '伦敦体系：对 ...c5 的处理',
  summary: '1.d4 d5 2.Bf4 Nf6 3.e3 e6 4.Nf3 c5 5.c3 Nc6 后白方的标准展开',
  startFen: 'r1bqkb1r/pp3ppp/2n1pn2/2pp4/3P1B2/2P1PN2/PP3PPP/RN1QKB1R w KQkq - 2 6',
  playerColor: 'w',
  theme: '伦敦体系用 d4、Bf4、e3、c3 搭出金字塔兵型。黑方 ...c5 加 ...Qb6 是主要反击手段，白方要知道 Nbd2、Bd3、O-O 的正常顺序，以及何时用 Qb3 或 Qc1 应付 ...Qb6。',
  keyIdeas: ['Nbd2 先于 Bd3，避免 ...Nb4 的骚扰', '面对 ...Qb6，Qb3 提议换后是最稳的解法', 'f4 象是王翼进攻的核心，别轻易换掉', 'e3-e4 是白方争取的中心突破'],
  principleIds: ['development-order', 'center-control', 'prophylaxis', 'good-bad-bishop'],
  modelLine: ['Nbd2', 'Bd6', 'Bg3', 'O-O', 'Bd3', 'b6', 'O-O', 'Bb7', 'Qe2'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
```

`src/lessons/data/middlegame/iqp-attack.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'middlegame/iqp-attack',
  section: 'middlegame',
  title: '孤立后兵：利用动力进攻',
  summary: '白方持 d4 孤兵，用空间和子力活动换王翼攻势',
  startFen: 'r1bq1rk1/pp2bppp/2n1p3/3n4/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 10',
  playerColor: 'w',
  theme: '白方的 d4 孤兵给了 e5 前哨、半开放的 c/e 线和更多空间。正确的打法是趁子力还多时在王翼进攻：Re1、Bc2/Qd3 的炮台、Ne5、必要时 d4-d5 突破。不能被动防守 d4 兵。',
  keyIdeas: ['Re1 + Bc2 + Qd3 指向 h7', 'Ne5 占前哨，配合 f4 或 Qf3', 'd4-d5 突破在对方子力配合不好时最有力', '避免一切交换：子力越少孤兵越弱'],
  principleIds: ['isolated-pawn', 'attacker-avoids-trades', 'outpost', 'initiative-tempo'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
```

`src/lessons/data/middlegame/minority-attack.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'middlegame/minority-attack',
  section: 'middlegame',
  title: '少数兵进攻：卡尔斯巴德兵型',
  summary: '白方用 a、b 兵推进制造黑方 c6 弱点',
  startFen: 'r1bqr1k1/pp1nbppp/2p2n2/3p2B1/3P4/2NBPN2/PPQ2PPP/R4RK1 w - - 0 11',
  playerColor: 'w',
  theme: '后翼弃兵交换变例形成的卡尔斯巴德兵型。白方的标准计划是 Rab1、b4、a4、b5，交换后黑方留下 c6 弱兵或 d5 孤兵，白方再用车和后从 c 线施压。黑方则争取 ...Ne4 和王翼反击。',
  keyIdeas: ['Rab1、b4、a4、b5 是完整顺序，不要跳步', '黑方 ...a6 抵抗时用 a4 顶上去', 'c 线和 c5 格是进攻成果的收割点', '当心黑方 ...Ne4 和 ...Bd6-...Qc7 指向 h2 的反击'],
  principleIds: ['minority-attack', 'prophylaxis', 'open-file-rook', 'isolated-pawn'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
```

`src/lessons/data/middlegame/open-file.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'middlegame/open-file',
  section: 'middlegame',
  title: '开放线上的车',
  summary: '双方 e 兵都已消失，争夺 e 线并渗透第七横线',
  startFen: 'r4rk1/pp1b1ppp/2pq1n2/3p4/3P4/2PQ1N2/PP1B1PPP/R4RK1 w - - 0 15',
  playerColor: 'w',
  theme: '局面对称、只有 e 线开放。谁先把两个车放到 e 线并控制 e7/e2 这样的入口格，谁就能渗透到对方第七横线。训练目标是学会用车与轻子配合争夺一条线，而不是漫无目的地调动。',
  keyIdeas: ['Rfe1 然后 Rae1，把两个车都放上开放线', '控制入口格 e7：Bg5 或 Ne5 帮车渗透', '对方要争线时，用子力把 e 线上的交换点守住', '第七横线的车配合后能制造杀王威胁'],
  principleIds: ['open-file-rook', 'initiative-tempo', 'prophylaxis', 'outpost'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
```

`src/lessons/data/middlegame/opposite-castling.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'middlegame/opposite-castling',
  section: 'middlegame',
  title: '异侧易位互攻：龙式变例',
  summary: '白方长易位、黑方短易位，比拼进攻速度',
  startFen: '2rq1rk1/pp1bppbp/3p1np1/4n3/3NP3/1BN1BP2/PPPQ2PP/2KR3R w - - 0 12',
  playerColor: 'w',
  theme: '西西里龙式南斯拉夫进攻的典型局面。白方用 h4-h5 打开 h 线，配合 Bh6 换掉 g7 象；黑方用 c 线和 ...Nc4、...Qa5 反击。每一步都问：这步是在加快我的进攻，还是在浪费节奏？',
  keyIdeas: ['h4-h5 是主计划，hxg6 后 h 线是白方的', 'Bh6 换掉龙象是削弱黑王的关键', '注意 c3 马被 ...Rxc3 弃换的威胁，Kb1 常常是必要的预防', '不要轻易换后，换后就等于放弃进攻'],
  principleIds: ['opposite-castling', 'attacker-avoids-trades', 'prophylaxis', 'initiative-tempo'],
  stop: { kind: 'plies', count: 8 },
  target: 'hold',
};
```

`src/lessons/data/endgame/kp-vs-k.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'endgame/kp-vs-k',
  section: 'endgame',
  title: '王兵对王：对王与关键格',
  summary: '白王 d5、兵 e4 对黑王 e7，白方走棋取胜',
  startFen: '8/4k3/8/3K4/4P3/8/8/8 w - - 0 1',
  playerColor: 'w',
  theme: 'e4 兵的关键格是 d6、e6、f6。白王要先于兵到达关键格，办法是抢对王：1.Ke5! 之后黑王让路，白王进入 d6 或 f6，兵再跟上。过早推兵会导致和棋。',
  keyIdeas: ['先走王，不要先推兵', 'Ke5 抢对王，逼黑王让开', '白王到 d6/e6/f6 任一格就必胜', '兵到第六横线时注意别把王堵在兵前'],
  principleIds: ['opposition', 'key-squares', 'zugzwang'],
  modelLine: ['Ke5', 'Kd7', 'Kf6', 'Ke8', 'e5', 'Kf8', 'e6'],
  stop: { kind: 'gameOver', maxPlies: 60 },
  target: 'win',
};
```

`src/lessons/data/endgame/lucena.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'endgame/lucena',
  section: 'endgame',
  title: 'Lucena 位置：搭桥',
  summary: '白王 b8、兵 b7、车 d1 对黑王 e7、车 a2，白方取胜',
  startFen: '1K6/1P2k3/8/8/8/8/r7/3R4 w - - 0 1',
  playerColor: 'w',
  theme: '车残局最重要的胜利位置。白王在兵前，黑王被 d 线上的车切断。标准技术：1.Rd4 把车放到第四横线，2.Kc7 出王，黑车从 c 线长将，白王沿 b6-c6-b5 走，最后 Rb4 挡住将军完成“搭桥”。',
  keyIdeas: ['第一步 Rd4，不是急着出王', '王被将军时向兵靠拢，交替走 b、c 线', '车到第四横线后就能挡住最后一次将军', '不要让黑王回到 c 线附近'],
  principleIds: ['lucena-bridge', 'rook-behind-passed-pawn', 'passed-pawn'],
  modelLine: ['Rd4', 'Ra1', 'Kc7', 'Rc1+', 'Kb6', 'Rb1+', 'Kc6', 'Rc1+', 'Kb5', 'Rb1+', 'Rb4'],
  stop: { kind: 'gameOver', maxPlies: 60 },
  target: 'win',
};
```

`src/lessons/data/endgame/philidor.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'endgame/philidor',
  section: 'endgame',
  title: 'Philidor 位置：第六横线防御',
  summary: '黑王 e8、车 b6 对白王 e5、兵 e4、车 a7，黑方守和',
  startFen: '4k3/R7/1r6/4K3/4P3/8/8/8 b - - 0 1',
  playerColor: 'b',
  theme: '守方王守在兵前，车放在第六横线（黑方视角的第三横线之外，即白方的第六横线 b6-h6）阻止白王上前。白兵推到 e6 时黑车立即回到 b1，从背后长将，白王无处躲藏。切记不要过早离开第六横线。',
  keyIdeas: ['车沿第六横线来回等待，不让白王到 f6/d6', '白兵走到 e6 的那一刻，车回到底线', '从背后将军时白王无法用兵挡住', '不要用王去吃兵或离开 e8/d8/f8'],
  principleIds: ['philidor-sixth-rank', 'zugzwang', 'rook-behind-passed-pawn'],
  modelLine: ['Rc6', 'Rb7', 'Rh6', 'e5', 'Rh1'],
  stop: { kind: 'gameOver', maxPlies: 80 },
  target: 'draw',
};
```

`src/lessons/data/endgame/kr-vs-k.ts`:
```ts
import type { Lesson } from '../../schema';
export const lesson: Lesson = {
  id: 'endgame/kr-vs-k',
  section: 'endgame',
  title: '王车杀单王',
  summary: '白王 e3、车 a1 对黑王 e5，白方在 20 回合内杀王',
  startFen: '8/8/8/4k3/8/4K3/8/R7 w - - 0 1',
  playerColor: 'w',
  theme: '用车画一条线把黑王限制在半边棋盘，白王上前对王，黑王被迫后退时车再缩小方框。只在能缩小方框或黑王对王时走车，其他时候走王。目标是在边线完成杀王，避免逼和。',
  keyIdeas: ['第一步 Ra5+ 或 Rd1 把黑王限制到一侧', '王去对王，黑王让路时车再推进一线', '黑王在角落附近时留意逼和', '等待着法：黑王想对王时车横移一格'],
  principleIds: ['rook-mate-box', 'opposition', 'zugzwang'],
  stop: { kind: 'gameOver', maxPlies: 60 },
  target: 'win',
};
```

`src/lessons/index.ts`:
```ts
import type { Lesson, Section } from './schema';
import { lesson as italian } from './data/opening/italian-game';
import { lesson as sicilian } from './data/opening/open-sicilian';
import { lesson as qgd } from './data/opening/qgd';
import { lesson as london } from './data/opening/london';
import { lesson as iqp } from './data/middlegame/iqp-attack';
import { lesson as minority } from './data/middlegame/minority-attack';
import { lesson as openFile } from './data/middlegame/open-file';
import { lesson as oppCastling } from './data/middlegame/opposite-castling';
import { lesson as kpk } from './data/endgame/kp-vs-k';
import { lesson as lucena } from './data/endgame/lucena';
import { lesson as philidor } from './data/endgame/philidor';
import { lesson as krk } from './data/endgame/kr-vs-k';

export const LESSONS: Lesson[] = [
  italian, sicilian, qgd, london,
  iqp, minority, openFile, oppCastling,
  kpk, lucena, philidor, krk,
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function lessonsBySection(section: Section): Lesson[] {
  return LESSONS.filter((l) => l.section === section);
}

export type { Lesson, Section } from './schema';
```

- [ ] **Step 4: 写校验测试**

`tests/lessons.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Chess, validateFen } from 'chess.js';
import { LESSONS } from '../src/lessons';
import { PRINCIPLES, principleById } from '../src/lessons/principles';

describe('lessons data', () => {
  it('有 12 课，id 唯一', () => {
    expect(LESSONS.length).toBe(12);
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(12);
  });

  for (const lesson of LESSONS) {
    describe(lesson.id, () => {
      it('startFen 合法', () => {
        expect(validateFen(lesson.startFen).ok).toBe(true);
      });
      it('playerColor 与 FEN 行棋方一致', () => {
        expect(new Chess(lesson.startFen).turn()).toBe(lesson.playerColor);
      });
      it('id 前缀与 section 一致', () => {
        expect(lesson.id.startsWith(lesson.section + '/')).toBe(true);
      });
      it('principleIds 都存在', () => {
        for (const id of lesson.principleIds) expect(() => principleById(id)).not.toThrow();
      });
      it('modelLine 每步合法', () => {
        if (!lesson.modelLine) return;
        const c = new Chess(lesson.startFen);
        for (const san of lesson.modelLine) expect(() => c.move(san)).not.toThrow();
      });
    });
  }
});

describe('principles', () => {
  it('至少 25 条且 id 唯一', () => {
    expect(PRINCIPLES.length).toBeGreaterThanOrEqual(25);
    expect(new Set(PRINCIPLES.map((p) => p.id)).size).toBe(PRINCIPLES.length);
  });
});
```

- [ ] **Step 5: 运行测试**

Run: `npm test`
Expected: 全部通过。若某课 `modelLine` 报非法着法，用 chess.js 在 node 里逐步走验证并修正 SAN（不要改 FEN）。

- [ ] **Step 6: Commit**

```bash
git add src/lessons tests/lessons.test.ts
git commit -m "feat: lesson schema, principle library and 12 starter lessons"
```

---

### Task 3: 棋盘纯函数：记谱转换、着法质量、结果判定、局面特征

**Files:**
- Create: `src/chess/notation.ts`, `src/chess/quality.ts`, `src/chess/result.ts`, `src/chess/features.ts`
- Test: `tests/notation.test.ts`, `tests/quality.test.ts`, `tests/result.test.ts`, `tests/features.test.ts`

**Interfaces:**
- Consumes: `Lesson`, `Color` (Task 2), `FeatureId` (Task 2)
- Produces:
  - `Score = { cp?: number; mate?: number }`；`scoreToCp(score): number`；`Quality`；`classifyMove(p): Quality`（quality.ts）
  - `uciToSan(fen, uci[]): string[]`；`uciMoveToSan(fen, uci): string | null`；`formatEval(cp): string`；`toPerspective(cp, sideToMove, perspective): number`；`uciToSquares(uci): {from, to, promotion?}`（notation.ts）
  - `Outcome = 'success' | 'fail'`；`judgeResult(p): {outcome, reason}`；`isFinished(lesson, userPlies, totalPlies, gameOver): boolean`（result.ts）
  - `extractFeatures(fen, perspective: Color): FeatureId[]`（features.ts）

- [ ] **Step 1: 写测试 notation**

`tests/notation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { uciToSan, uciMoveToSan, formatEval, toPerspective, uciToSquares } from '../src/chess/notation';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('uciToSan', () => {
  it('转换合法线路', () => {
    expect(uciToSan(START, ['e2e4', 'e7e5', 'g1f3'])).toEqual(['e4', 'e5', 'Nf3']);
  });
  it('遇到非法着法停止', () => {
    expect(uciToSan(START, ['e2e4', 'e2e3'])).toEqual(['e4']);
  });
  it('处理升变', () => {
    expect(uciMoveToSan('8/P7/8/8/8/8/8/k6K w - - 0 1', 'a7a8q')).toBe('a8=Q+');
  });
  it('非法着法返回 null', () => {
    expect(uciMoveToSan(START, 'e2e5')).toBeNull();
  });
});

describe('formatEval', () => {
  it('厘兵转带符号小数', () => {
    expect(formatEval(35)).toBe('+0.35');
    expect(formatEval(-120)).toBe('-1.20');
    expect(formatEval(0)).toBe('0.00');
  });
  it('杀棋分数显示 M', () => {
    expect(formatEval(10000 - 3)).toBe('M3');
    expect(formatEval(-10000 + 2)).toBe('-M2');
  });
});

describe('toPerspective', () => {
  it('同色不变，异色取反', () => {
    expect(toPerspective(50, 'w', 'w')).toBe(50);
    expect(toPerspective(50, 'b', 'w')).toBe(-50);
  });
});

describe('uciToSquares', () => {
  it('拆分 from/to/promotion', () => {
    expect(uciToSquares('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(uciToSquares('e2e4')).toEqual({ from: 'e2', to: 'e4', promotion: undefined });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/notation.test.ts`
Expected: FAIL，找不到模块 `../src/chess/notation`。

- [ ] **Step 3: 实现 notation.ts**

```ts
import { Chess } from 'chess.js';
import type { Color } from '../lessons/schema';

export const MATE_CP = 10000;

export function uciToSquares(uci: string): { from: string; to: string; promotion?: string } {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci.length > 4 ? uci[4] : undefined };
}

export function uciMoveToSan(fen: string, uci: string): string | null {
  const c = new Chess(fen);
  try {
    return c.move(uciToSquares(uci)).san;
  } catch {
    return null;
  }
}

/** 逐步转换一条 UCI 线路为 SAN，遇到非法着法即停止 */
export function uciToSan(fen: string, uciMoves: string[]): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciMoves) {
    try {
      out.push(c.move(uciToSquares(uci)).san);
    } catch {
      break;
    }
  }
  return out;
}

/** cp（用户视角）→ 显示文本。|cp| 接近 MATE_CP 视为杀棋分 */
export function formatEval(cp: number): string {
  if (cp >= MATE_CP - 1000) return `M${MATE_CP - cp}`;
  if (cp <= -MATE_CP + 1000) return `-M${cp + MATE_CP}`;
  const v = (cp / 100).toFixed(2);
  return cp > 0 ? `+${v}` : v;
}

/** 把“行棋方视角”的分数转换成 perspective 视角 */
export function toPerspective(cpSideToMove: number, sideToMove: Color, perspective: Color): number {
  return sideToMove === perspective ? cpSideToMove : -cpSideToMove;
}

export function sideToMove(fen: string): Color {
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}
```

- [ ] **Step 4: 写测试 quality**

`tests/quality.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { scoreToCp, classifyMove } from '../src/chess/quality';

describe('scoreToCp', () => {
  it('cp 原样返回', () => expect(scoreToCp({ cp: 42 })).toBe(42));
  it('正 mate 接近 +10000，步数越少越大', () => {
    expect(scoreToCp({ mate: 3 })).toBe(9997);
    expect(scoreToCp({ mate: 1 })).toBeGreaterThan(scoreToCp({ mate: 5 }));
  });
  it('负 mate 接近 -10000', () => expect(scoreToCp({ mate: -2 })).toBe(-9998));
});

describe('classifyMove', () => {
  const base = { evalBefore: 30, userMoveUci: 'e2e4', bestMoveUci: 'd2d4' };
  it('走了引擎最佳着法就是 best', () => {
    expect(classifyMove({ ...base, userMoveUci: 'd2d4', evalAfter: -500 })).toBe('best');
  });
  it('掉分 < 30 为 good', () => expect(classifyMove({ ...base, evalAfter: 5 })).toBe('good'));
  it('掉分 30~90 为 inaccuracy', () => expect(classifyMove({ ...base, evalAfter: -20 })).toBe('inaccuracy'));
  it('掉分 90~200 为 mistake', () => expect(classifyMove({ ...base, evalAfter: -100 })).toBe('mistake'));
  it('掉分 > 200 为 blunder', () => expect(classifyMove({ ...base, evalAfter: -300 })).toBe('blunder'));
  it('评估上升也是 good', () => expect(classifyMove({ ...base, evalAfter: 80 })).toBe('good'));
});
```

- [ ] **Step 5: 实现 quality.ts**

```ts
import { MATE_CP } from './notation';

export interface Score {
  cp?: number;
  mate?: number; // 正数=行棋方将杀，负数=行棋方被杀，绝对值为回合数
}

export type Quality = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const QUALITY_LABEL: Record<Quality, string> = {
  best: '最佳',
  good: '不错',
  inaccuracy: '不精确',
  mistake: '错误',
  blunder: '严重失误',
};

export function scoreToCp(score: Score): number {
  if (score.mate !== undefined) {
    return score.mate > 0 ? MATE_CP - score.mate : -MATE_CP - score.mate;
  }
  return score.cp ?? 0;
}

export interface ClassifyParams {
  evalBefore: number; // 用户视角 cp，走子前
  evalAfter: number; // 用户视角 cp，走子后
  userMoveUci: string;
  bestMoveUci: string;
}

export function classifyMove(p: ClassifyParams): Quality {
  if (p.userMoveUci === p.bestMoveUci) return 'best';
  const delta = p.evalAfter - p.evalBefore;
  if (delta >= -30) return 'good';
  if (delta >= -90) return 'inaccuracy';
  if (delta >= -200) return 'mistake';
  return 'blunder';
}
```

- [ ] **Step 6: 写测试 result**

`tests/result.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { judgeResult, isFinished } from '../src/chess/result';
import type { Lesson } from '../src/lessons/schema';

const base: Lesson = {
  id: 'x/y', section: 'endgame', title: '', summary: '', startFen: '8/8/8/4k3/8/4K3/8/R7 w - - 0 1',
  playerColor: 'w', theme: '', keyIdeas: [], principleIds: [],
  stop: { kind: 'gameOver', maxPlies: 60 }, target: 'win',
};

describe('isFinished', () => {
  it('plies 规则：用户走满 count 步', () => {
    const l = { ...base, stop: { kind: 'plies', count: 8 } as const };
    expect(isFinished(l, 7, 14, false)).toBe(false);
    expect(isFinished(l, 8, 16, false)).toBe(true);
  });
  it('gameOver 规则：终局或到 maxPlies', () => {
    expect(isFinished(base, 3, 6, true)).toBe(true);
    expect(isFinished(base, 30, 60, false)).toBe(true);
    expect(isFinished(base, 3, 6, false)).toBe(false);
  });
  it('任何规则下终局都结束', () => {
    const l = { ...base, stop: { kind: 'plies', count: 8 } as const };
    expect(isFinished(l, 2, 4, true)).toBe(true);
  });
});

describe('judgeResult', () => {
  const common = { finalFen: base.startFen, evalHistory: [50, 60], qualities: ['good', 'best'] as const };
  it('win：实际获胜或最终评估 >= +500', () => {
    expect(judgeResult({ lesson: base, ...common, finalEvalCp: 600, gameResult: null }).outcome).toBe('success');
    expect(judgeResult({ lesson: base, ...common, finalEvalCp: 100, gameResult: 'playerWin' }).outcome).toBe('success');
    expect(judgeResult({ lesson: base, ...common, finalEvalCp: 100, gameResult: null }).outcome).toBe('fail');
  });
  it('draw：和棋或 |eval| <= 50', () => {
    const l = { ...base, target: 'draw' as const };
    expect(judgeResult({ lesson: l, ...common, finalEvalCp: -30, gameResult: null }).outcome).toBe('success');
    expect(judgeResult({ lesson: l, ...common, finalEvalCp: -30, gameResult: 'draw' }).outcome).toBe('success');
    expect(judgeResult({ lesson: l, ...common, finalEvalCp: -300, gameResult: null }).outcome).toBe('fail');
    expect(judgeResult({ lesson: l, ...common, finalEvalCp: 0, gameResult: 'playerLoss' }).outcome).toBe('fail');
  });
  it('hold：全程不低于 evalFloor 且无 blunder', () => {
    const l = { ...base, target: 'hold' as const };
    expect(judgeResult({ lesson: l, ...common, finalEvalCp: 20, gameResult: null }).outcome).toBe('success');
    expect(judgeResult({ lesson: l, ...common, evalHistory: [50, -150], finalEvalCp: -150, gameResult: null }).outcome).toBe('fail');
    expect(judgeResult({ lesson: l, ...common, qualities: ['good', 'blunder'], finalEvalCp: 20, gameResult: null }).outcome).toBe('fail');
  });
});
```

- [ ] **Step 7: 实现 result.ts**

```ts
import type { Lesson } from '../lessons/schema';
import type { Quality } from './quality';

export type Outcome = 'success' | 'fail';
export type GameResult = 'playerWin' | 'playerLoss' | 'draw' | null;

export function isFinished(lesson: Lesson, userPlies: number, totalPlies: number, gameOver: boolean): boolean {
  if (gameOver) return true;
  if (lesson.stop.kind === 'plies') return userPlies >= lesson.stop.count;
  return totalPlies >= lesson.stop.maxPlies;
}

export interface JudgeParams {
  lesson: Lesson;
  finalFen: string;
  finalEvalCp: number; // 用户视角
  evalHistory: number[]; // 每回合用户走子后的评估，用户视角
  qualities: readonly Quality[];
  gameResult: GameResult;
}

export function judgeResult(p: JudgeParams): { outcome: Outcome; reason: string } {
  const { lesson, finalEvalCp, gameResult } = p;
  switch (lesson.target) {
    case 'win':
      if (gameResult === 'playerWin') return { outcome: 'success', reason: '完成杀王，达成目标。' };
      if (gameResult === 'playerLoss' || gameResult === 'draw') return { outcome: 'fail', reason: '没有赢下这个必胜局面。' };
      return finalEvalCp >= 500
        ? { outcome: 'success', reason: '结束时已形成决定性优势。' }
        : { outcome: 'fail', reason: '结束时优势不足以取胜。' };
    case 'draw':
      if (gameResult === 'draw') return { outcome: 'success', reason: '成功守和。' };
      if (gameResult === 'playerLoss') return { outcome: 'fail', reason: '防守失败，被杀王。' };
      if (gameResult === 'playerWin') return { outcome: 'success', reason: '对方失误，反而赢了。' };
      return Math.abs(finalEvalCp) <= 50
        ? { outcome: 'success', reason: '局面保持均势，守和成功。' }
        : { outcome: 'fail', reason: '防守出现漏洞，局面已经失守。' };
    case 'hold': {
      const floor = lesson.evalFloor ?? -100;
      if (gameResult === 'playerLoss') return { outcome: 'fail', reason: '被杀王。' };
      const dropped = p.evalHistory.some((e) => e < floor);
      const blundered = p.qualities.includes('blunder');
      if (dropped) return { outcome: 'fail', reason: '过程中评估掉到阈值以下。' };
      if (blundered) return { outcome: 'fail', reason: '出现了严重失误。' };
      return { outcome: 'success', reason: '全程保持了可接受的局面，没有严重失误。' };
    }
  }
}
```

- [ ] **Step 8: 写测试 features**

`tests/features.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { extractFeatures } from '../src/chess/features';

describe('extractFeatures', () => {
  it('初始局面：开局阶段、双方未易位', () => {
    const f = extractFeatures('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'w');
    expect(f).toContain('opening-phase');
    expect(f).toContain('own-king-uncastled');
    expect(f).toContain('opp-king-uncastled');
    expect(f).not.toContain('open-file');
  });
  it('IQP 局面：己方孤兵 + 开放线 + 中局', () => {
    const f = extractFeatures('r1bq1rk1/pp2bppp/2n1p3/3n4/3P4/2NB1N2/PP3PPP/R1BQ1RK1 w - - 0 10', 'w');
    expect(f).toContain('own-isolated-pawn');
    expect(f).toContain('open-file'); // c 线
    expect(f).toContain('middlegame-phase');
    expect(f).not.toContain('own-king-uncastled');
  });
  it('异侧易位', () => {
    const f = extractFeatures('2rq1rk1/pp1bppbp/3p1np1/4n3/3NP3/1BN1BP2/PPPQ2PP/2KR3R w - - 0 12', 'w');
    expect(f).toContain('opposite-castling');
  });
  it('车残局 + 通路兵 + 后已交换', () => {
    const f = extractFeatures('1K6/1P2k3/8/8/8/8/r7/3R4 w - - 0 1', 'w');
    expect(f).toContain('rook-endgame');
    expect(f).toContain('endgame-phase');
    expect(f).toContain('own-passed-pawn');
    expect(f).toContain('queens-off');
  });
  it('兵残局', () => {
    expect(extractFeatures('8/4k3/8/3K4/4P3/8/8/8 w - - 0 1', 'w')).toContain('pawn-endgame');
  });
  it('物质差', () => {
    expect(extractFeatures('8/8/8/4k3/8/4K3/8/R7 w - - 0 1', 'w')).toContain('material-up');
    expect(extractFeatures('8/8/8/4k3/8/4K3/8/R7 w - - 0 1', 'b')).toContain('material-down');
  });
});
```

- [ ] **Step 9: 实现 features.ts**

```ts
import { Chess, type Piece, type Square } from 'chess.js';
import type { Color } from '../lessons/schema';
import type { FeatureId } from '../lessons/principles';

const FILES = 'abcdefgh';
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

interface Side {
  pawnsByFile: number[]; // 每列兵数
  pawnSquares: { file: number; rank: number }[]; // rank 1..8
  bishops: number; knights: number; rooks: number; queens: number;
  kingFile: number;
  material: number;
}

function scan(chess: Chess): Record<Color, Side> {
  const mk = (): Side => ({ pawnsByFile: Array(8).fill(0), pawnSquares: [], bishops: 0, knights: 0, rooks: 0, queens: 0, kingFile: 4, material: 0 });
  const sides: Record<Color, Side> = { w: mk(), b: mk() };
  const board = chess.board();
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p: Piece | null = board[r][f] as (Piece & { square: Square }) | null;
      if (!p) continue;
      const s = sides[p.color];
      s.material += VALUE[p.type];
      const rank = 8 - r;
      switch (p.type) {
        case 'p': s.pawnsByFile[f]++; s.pawnSquares.push({ file: f, rank }); break;
        case 'b': s.bishops++; break;
        case 'n': s.knights++; break;
        case 'r': s.rooks++; break;
        case 'q': s.queens++; break;
        case 'k': s.kingFile = f; break;
      }
    }
  }
  return sides;
}

function hasIsolated(s: Side): boolean {
  return s.pawnsByFile.some((n, f) => n > 0 && (f === 0 || s.pawnsByFile[f - 1] === 0) && (f === 7 || s.pawnsByFile[f + 1] === 0));
}
function hasDoubled(s: Side): boolean {
  return s.pawnsByFile.some((n) => n > 1);
}
function hasPassed(own: Side, opp: Side, color: Color): boolean {
  return own.pawnSquares.some(({ file, rank }) =>
    !opp.pawnSquares.some((o) => Math.abs(o.file - file) <= 1 && (color === 'w' ? o.rank > rank : o.rank < rank)),
  );
}
/** 王是否“已易位或躲到角落”：王在 a-c 或 f-h 列 */
function kingTucked(s: Side): boolean {
  return s.kingFile <= 2 || s.kingFile >= 5;
}

export function extractFeatures(fen: string, perspective: Color): FeatureId[] {
  const chess = new Chess(fen);
  const sides = scan(chess);
  const own = sides[perspective];
  const opp = sides[perspective === 'w' ? 'b' : 'w'];
  const out: FeatureId[] = [];

  const minors = own.bishops + own.knights + opp.bishops + opp.knights;
  const majors = own.rooks + own.queens + opp.rooks + opp.queens;
  const totalPieces = minors + majors;
  const queensOn = own.queens + opp.queens;
  const fullMove = Number(fen.split(' ')[5] ?? '1');

  if (totalPieces <= 6 || (queensOn === 0 && totalPieces <= 8)) out.push('endgame-phase');
  else if (fullMove <= 12 && totalPieces >= 12) out.push('opening-phase');
  else out.push('middlegame-phase');

  // castling rights 仍在 或 王在 d/e 列 → 视为未易位
  const rights = fen.split(' ')[2] ?? '-';
  const ownRights = perspective === 'w' ? /[KQ]/.test(rights) : /[kq]/.test(rights);
  const oppRights = perspective === 'w' ? /[kq]/.test(rights) : /[KQ]/.test(rights);
  if (!out.includes('endgame-phase')) {
    if (ownRights || !kingTucked(own)) out.push('own-king-uncastled');
    if (oppRights || !kingTucked(opp)) out.push('opp-king-uncastled');
    if (kingTucked(own) && kingTucked(opp) && (own.kingFile <= 2) !== (opp.kingFile <= 2)) out.push('opposite-castling');
  }

  if (queensOn === 0) out.push('queens-off');
  if (own.pawnsByFile.some((n, f) => n === 0 && opp.pawnsByFile[f] === 0)) out.push('open-file');
  if (hasIsolated(own)) out.push('own-isolated-pawn');
  if (hasIsolated(opp)) out.push('opp-isolated-pawn');
  if (hasDoubled(own)) out.push('own-doubled-pawn');
  if (hasDoubled(opp)) out.push('opp-doubled-pawn');
  if (hasPassed(own, opp, perspective)) out.push('own-passed-pawn');
  if (hasPassed(opp, own, perspective === 'w' ? 'b' : 'w')) out.push('opp-passed-pawn');
  if (own.bishops >= 2 && opp.bishops < 2) out.push('own-bishop-pair');
  if (opp.bishops >= 2 && own.bishops < 2) out.push('opp-bishop-pair');
  if ((own.bishops > 0 && own.knights === 0 && opp.knights > 0 && opp.bishops === 0) ||
      (opp.bishops > 0 && opp.knights === 0 && own.knights > 0 && own.bishops === 0)) out.push('bishop-vs-knight');
  if (out.includes('endgame-phase') && minors === 0 && own.queens + opp.queens === 0) {
    if (majors === 0) out.push('pawn-endgame');
    else out.push('rook-endgame');
  }
  // 中心锁死：d4/e5 或 e4/d5 兵链互顶
  const at = (sq: string) => chess.get(sq as Square);
  const locked = (a: string, b: string, c: string, d: string) =>
    at(a)?.type === 'p' && at(b)?.type === 'p' && at(a)?.color !== at(b)?.color && at(c)?.type === 'p' && at(d)?.type === 'p';
  if (locked('d4', 'd5', 'e5', 'e6') || locked('e4', 'e5', 'd5', 'd6')) out.push('locked-center');
  const diff = own.material - opp.material;
  if (diff >= 2) out.push('material-up');
  if (diff <= -2) out.push('material-down');
  return out;
}

export { FILES };
```

- [ ] **Step 10: 运行全部测试与 typecheck**

Run: `npm test && npm run typecheck`
Expected: 全部通过。若 `chess.board()` 的元素类型与 `Piece & {square}` 不符，按 chess.js 的 `.d.ts` 修正类型断言，不改逻辑。

- [ ] **Step 11: Commit**

```bash
git add src/chess tests/notation.test.ts tests/quality.test.ts tests/result.test.ts tests/features.test.ts
git commit -m "feat: chess pure helpers - notation, move quality, result judging, position features"
```

---

### Task 4: 大模型层：SSE 解析、流式客户端、讲解角度、prompt 构建

**Files:**
- Create: `src/llm/sseParser.ts`, `src/llm/client.ts`, `src/llm/angles.ts`, `src/llm/prompts.ts`
- Test: `tests/sseParser.test.ts`, `tests/client.test.ts`, `tests/angles.test.ts`, `tests/prompts.test.ts`

**Interfaces:**
- Consumes: `Lesson`, `Principle`, `Quality`, `formatEval`
- Produces:
  - `createSseParser(): { push(chunk: string): string[]; flush(): string[] }`；`extractDelta(payload: string): string`
  - `LlmConfig = { baseUrl; apiKey; model }`；`ChatMessage`；`LlmError`；`streamChat(cfg, messages, opts): AsyncGenerator<string>`
  - `Angle`；`ANGLE_LABEL`；`chooseAngle(p): Angle`
  - `MoveContext`, `HintContext`, `SummaryContext`；`buildIntroMessages`, `buildMoveMessages`, `buildHintMessages`, `buildSummaryMessages`

- [ ] **Step 1: 写测试 sseParser**

`tests/sseParser.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { createSseParser, extractDelta } from '../src/llm/sseParser';

describe('createSseParser', () => {
  it('按空行分事件，提取 data 负载', () => {
    const p = createSseParser();
    expect(p.push('data: {"a":1}\n\ndata: {"b":2}\n\n')).toEqual(['{"a":1}', '{"b":2}']);
  });
  it('跨 chunk 拼接', () => {
    const p = createSseParser();
    expect(p.push('data: {"a"')).toEqual([]);
    expect(p.push(':1}\n\n')).toEqual(['{"a":1}']);
  });
  it('忽略注释和 [DONE]', () => {
    const p = createSseParser();
    expect(p.push(': ping\n\ndata: [DONE]\n\n')).toEqual([]);
  });
  it('flush 输出未以空行结尾的尾部', () => {
    const p = createSseParser();
    p.push('data: {"x":1}');
    expect(p.flush()).toEqual(['{"x":1}']);
  });
});

describe('extractDelta', () => {
  it('取 choices[0].delta.content', () => {
    expect(extractDelta('{"choices":[{"delta":{"content":"你好"}}]}')).toBe('你好');
  });
  it('无内容返回空串', () => {
    expect(extractDelta('{"choices":[{"delta":{"role":"assistant"}}]}')).toBe('');
    expect(extractDelta('not json')).toBe('');
  });
});
```

- [ ] **Step 2: 实现 sseParser.ts**

```ts
/** 最小 SSE 解析：只关心 data: 行，事件以空行分隔 */
export function createSseParser() {
  let buffer = '';
  const parseEvent = (raw: string): string | null => {
    const dataLines = raw
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart());
    if (dataLines.length === 0) return null;
    const payload = dataLines.join('\n');
    return payload === '[DONE]' ? null : payload;
  };
  return {
    push(chunk: string): string[] {
      buffer += chunk.replace(/\r\n/g, '\n');
      const out: string[] = [];
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const p = parseEvent(raw);
        if (p !== null) out.push(p);
      }
      return out;
    },
    flush(): string[] {
      const raw = buffer;
      buffer = '';
      const p = raw.trim() ? parseEvent(raw) : null;
      return p === null ? [] : [p];
    },
  };
}

export function extractDelta(payload: string): string {
  try {
    const json = JSON.parse(payload) as { choices?: { delta?: { content?: string | null } }[] };
    return json.choices?.[0]?.delta?.content ?? '';
  } catch {
    return '';
  }
}
```

- [ ] **Step 3: 写测试 client（mock fetch）**

`tests/client.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { streamChat, LlmError } from '../src/llm/client';

function sseResponse(chunks: string[], status = 200): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const c of chunks) ctrl.enqueue(enc.encode(c));
      ctrl.close();
    },
  });
  return new Response(stream, { status, headers: { 'content-type': 'text/event-stream' } });
}

const cfg = { baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'gpt-x' };

describe('streamChat', () => {
  it('发送 stream:true 并逐段产出 delta', async () => {
    let captured: { url: string; init: RequestInit } | null = null;
    const fetchImpl: typeof fetch = async (url, init) => {
      captured = { url: String(url), init: init! };
      return sseResponse([
        'data: {"choices":[{"delta":{"content":"这"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"步"}}]}\n\ndata: [DONE]\n\n',
      ]);
    };
    const out: string[] = [];
    for await (const d of streamChat(cfg, [{ role: 'user', content: 'hi' }], { fetchImpl })) out.push(d);
    expect(out).toEqual(['这', '步']);
    expect(captured!.url).toBe('https://api.example.com/v1/chat/completions');
    const body = JSON.parse(captured!.init.body as string);
    expect(body.stream).toBe(true);
    expect(body.model).toBe('gpt-x');
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
  });

  it('非 2xx 抛 LlmError 带状态码', async () => {
    const fetchImpl: typeof fetch = async () => new Response('{"error":"bad key"}', { status: 401 });
    const gen = streamChat(cfg, [], { fetchImpl });
    await expect(gen.next()).rejects.toMatchObject({ status: 401 } satisfies Partial<LlmError>);
  });

  it('网络错误包装为 LlmError', async () => {
    const fetchImpl: typeof fetch = async () => { throw new TypeError('Failed to fetch'); };
    await expect(streamChat(cfg, [], { fetchImpl }).next()).rejects.toBeInstanceOf(LlmError);
  });
});
```

- [ ] **Step 4: 实现 client.ts**

```ts
import { createSseParser, extractDelta } from './sseParser';

export interface LlmConfig {
  baseUrl: string; // 如 https://api.openai.com/v1
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LlmError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.status = status;
  }
}

export interface StreamOptions {
  temperature?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

export async function* streamChat(cfg: LlmConfig, messages: ChatMessage[], opts: StreamOptions = {}): AsyncGenerator<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const url = `${cfg.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({ model: cfg.model, messages, stream: true, temperature: opts.temperature ?? 0.7 }),
      signal: opts.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    throw new LlmError(`网络请求失败：${(e as Error).message}。若为第三方服务，可能是不允许浏览器跨域访问（CORS）。`);
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new LlmError(`模型服务返回 ${res.status}：${text.slice(0, 300)}`, res.status);
  }
  if (!res.body) throw new LlmError('响应没有正文');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const parser = createSseParser();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const payload of parser.push(decoder.decode(value, { stream: true }))) {
        const d = extractDelta(payload);
        if (d) yield d;
      }
    }
    for (const payload of parser.flush()) {
      const d = extractDelta(payload);
      if (d) yield d;
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    throw e;
  } finally {
    reader.releaseLock();
  }
}

/** 设置页“测试连接”：拿到第一个 token 即成功 */
export async function testConnection(cfg: LlmConfig, fetchImpl?: typeof fetch): Promise<void> {
  const gen = streamChat(cfg, [{ role: 'user', content: '回复“好”' }], { temperature: 0, fetchImpl });
  const first = await gen.next();
  await gen.return(undefined);
  if (first.done) throw new LlmError('连接成功但没有收到任何内容');
}
```

- [ ] **Step 5: 写测试 angles**

`tests/angles.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { chooseAngle, type Angle } from '../src/llm/angles';

const rnd = (v: number) => () => v;

describe('chooseAngle', () => {
  it('blunder / mistake 强制 compare', () => {
    expect(chooseAngle({ quality: 'blunder', evalSwing: 0, history: [], random: rnd(0.1) })).toBe('compare');
    expect(chooseAngle({ quality: 'mistake', evalSwing: 0, history: [], random: rnd(0.9) })).toBe('compare');
  });
  it('评估剧变（>=150）用 tactics', () => {
    expect(chooseAngle({ quality: 'good', evalSwing: 180, history: [], random: rnd(0.5) })).toBe('tactics');
  });
  it('最近 3 回合没讲过原理时强制 principle', () => {
    expect(chooseAngle({ quality: 'good', evalSwing: 0, history: ['plan', 'tactics', 'king'], random: rnd(0.5) })).toBe('principle');
  });
  it('不与上一回合角度相同', () => {
    for (let i = 0; i < 20; i++) {
      const a = chooseAngle({ quality: 'good', evalSwing: 0, history: ['principle', 'plan'], random: rnd(i / 20) });
      expect(a).not.toBe('plan');
    }
  });
  it('good 及以上不会选 compare；inaccuracy 可以', () => {
    const angles = new Set<Angle>();
    for (let i = 0; i < 50; i++) angles.add(chooseAngle({ quality: 'good', evalSwing: 0, history: ['principle'], random: rnd(i / 50) }));
    expect(angles.has('compare')).toBe(false);
    const withInacc = new Set<Angle>();
    for (let i = 0; i < 50; i++) withInacc.add(chooseAngle({ quality: 'inaccuracy', evalSwing: 0, history: ['principle'], random: rnd(i / 50) }));
    expect(withInacc.has('compare')).toBe(true);
  });
});
```

- [ ] **Step 6: 实现 angles.ts**

```ts
import type { Quality } from '../chess/quality';

export type Angle = 'tactics' | 'plan' | 'structure' | 'pieces' | 'king' | 'compare' | 'principle' | 'history';

export const ANGLE_LABEL: Record<Angle, string> = {
  tactics: '战术', plan: '计划', structure: '兵形', pieces: '子力',
  king: '王的安全', compare: '对比最佳着法', principle: '棋理', history: '典型例子',
};

/** GPT 在该角度下应该侧重什么，会直接写进 prompt */
export const ANGLE_GUIDE: Record<Angle, string> = {
  tactics: '侧重战术：有没有威胁、牵制、双击、悬子；说明这步为什么安全或不安全，可以引用给出的引擎线路里的具体着法。',
  plan: '侧重计划：这步在服务哪个中期计划，与本课主题的关系，接下来两三步的自然延续是什么。',
  structure: '侧重兵形：这步（或它放弃的选择）对兵结构有什么长远影响，哪些格子因此变强或变弱。',
  pieces: '侧重子力：哪个子因此变好或变坏，交换的得失，谁的子力协调性更好。',
  king: '侧重王的安全：与进攻或防守王有关的判断，王前兵是否松动，哪一方更接近制造威胁。',
  compare: '侧重对比：先直接指出用户这步的问题在哪里，再解释引擎给出的更好着法为什么更好，用给出的线路说明具体后果。',
  principle: '侧重棋理：用两三句专门讲一条给出的棋理——它说了什么、为什么成立、什么时候不成立，再把它和当前局面挂上钩。',
  history: '侧重典型例子：这个结构或局面类型在开局理论或著名对局中的地位。只说你确有把握的内容，不确定就改为讲一般规律。',
};

export interface ChooseParams {
  quality: Quality;
  evalSwing: number; // |evalAfter - evalBefore|
  history: Angle[]; // 之前回合用过的角度，按时间顺序
  random?: () => number;
}

const WEIGHTS: Record<Angle, number> = {
  plan: 3, tactics: 2, structure: 2, pieces: 2, king: 2, principle: 3, history: 1, compare: 0,
};

export function chooseAngle(p: ChooseParams): Angle {
  const random = p.random ?? Math.random;
  if (p.quality === 'blunder' || p.quality === 'mistake') return 'compare';
  if (Math.abs(p.evalSwing) >= 150) return 'tactics';
  const last = p.history[p.history.length - 1];
  const recent = p.history.slice(-3);
  if (p.history.length >= 3 && !recent.includes('principle') && last !== 'principle') return 'principle';

  const weights: Record<Angle, number> = { ...WEIGHTS };
  if (p.quality === 'inaccuracy') weights.compare = 3;
  if (last) weights[last] = 0;
  const entries = (Object.keys(weights) as Angle[]).filter((a) => weights[a] > 0);
  const total = entries.reduce((s, a) => s + weights[a], 0);
  let r = random() * total;
  for (const a of entries) {
    r -= weights[a];
    if (r < 0) return a;
  }
  return entries[entries.length - 1];
}
```

- [ ] **Step 7: 写测试 prompts**

`tests/prompts.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildIntroMessages, buildMoveMessages, buildHintMessages, buildSummaryMessages } from '../src/llm/prompts';
import { LESSONS } from '../src/lessons';
import { principleById } from '../src/lessons/principles';

const lesson = LESSONS[0];
const principles = lesson.principleIds.map(principleById);

describe('prompts', () => {
  it('intro 含主题与棋理名', () => {
    const m = buildIntroMessages(lesson, principles);
    expect(m[0].role).toBe('system');
    expect(m[1].content).toContain(lesson.theme);
    expect(m[1].content).toContain(principles[0].name);
  });
  it('move prompt 含用户着法、质量、评估、线路、角度指引、最近讲解', () => {
    const m = buildMoveMessages({
      lesson, fen: lesson.startFen, moveHistorySan: ['d3', 'd6'], userMoveSan: 'd3', quality: 'inaccuracy',
      evalBefore: 30, evalAfter: -20, bestLinesSan: [['O-O', 'O-O', 'Re1'], ['d4', 'exd4']], engineReplySan: 'd6',
      angle: 'compare', principles: [principleById('center-control')], recentCommentary: ['上一回合讲了出子顺序。'],
    });
    const u = m[1].content;
    expect(u).toContain('d3');
    expect(u).toContain('不精确');
    expect(u).toContain('+0.30');
    expect(u).toContain('-0.20');
    expect(u).toContain('O-O O-O Re1');
    expect(u).toContain('对比');
    expect(u).toContain('上一回合讲了出子顺序');
    expect(m[0].content).toContain('不要自创');
  });
  it('hint prompt 要求不说具体着法', () => {
    const m = buildHintMessages({ lesson, fen: lesson.startFen, moveHistorySan: [], bestLinesSan: [['d3']], principles });
    expect(m[1].content).toContain('不要说出具体着法');
  });
  it('summary prompt 含每回合质量与结果', () => {
    const m = buildSummaryMessages({
      lesson, moveHistorySan: ['d3', 'd6', 'O-O', 'O-O'], qualities: ['good', 'best'], evalHistory: [20, 35],
      outcome: 'success', reason: '全程稳定', principles, hintUsed: false,
    });
    expect(m[1].content).toContain('成功');
    expect(m[1].content).toContain('最佳');
  });
});
```

- [ ] **Step 8: 实现 prompts.ts**

```ts
import type { Lesson } from '../lessons/schema';
import type { Principle } from '../lessons/principles';
import { QUALITY_LABEL, type Quality } from '../chess/quality';
import { formatEval } from '../chess/notation';
import { ANGLE_GUIDE, ANGLE_LABEL, type Angle } from './angles';
import type { ChatMessage } from './client';

const SYSTEM = `你是一位耐心、有见地的国际象棋教练，用简体中文讲解。规则：
1. 着法一律使用标准代数记谱（如 Nf3、O-O、exd5、Qxh7#）。
2. 只引用用户消息里给出的引擎线路和评估，不要自创着法或线路；如果需要举例变化，只能取自给出的线路，且不超过 4 步。
3. 评估以引擎为准，不要根据自己的判断改写胜负形势。
4. 讲解要有变化：不要每次都用同样的开头、同样的“先评价再建议”结构；可以从一个反问、一个具体格子、一条棋理或对方的意图切入。
5. 不要与“最近的讲解”重复措辞或重复同一个论点。
6. 不要输出标题、列表符号或 Markdown，只输出自然段落。`;

function principlesText(ps: Principle[]): string {
  if (ps.length === 0) return '（无）';
  return ps.map((p) => `【${p.name}】${p.statement} 原因：${p.why}${p.exceptions ? ` 例外：${p.exceptions}` : ''}`).join('\n');
}

function linesText(lines: string[][]): string {
  return lines.map((l, i) => `PV${i + 1}: ${l.join(' ')}`).join('\n');
}

function historyText(sans: string[]): string {
  if (sans.length === 0) return '（尚未走棋）';
  return sans.map((s, i) => (i % 2 === 0 ? `${Math.floor(i / 2) + 1}. ${s}` : s)).join(' ');
}

export function buildIntroMessages(lesson: Lesson, principles: Principle[]): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `课程：${lesson.title}
执棋方：${lesson.playerColor === 'w' ? '白方' : '黑方'}（用户）
起始局面 FEN：${lesson.startFen}
本课主题：${lesson.theme}
关键思路：${lesson.keyIdeas.join('；')}
本课棋理：
${principlesText(principles)}

请用 4~6 句话做开场讲解：这个局面里双方各自的计划是什么，用户这一方最该关注什么，并点出 1~2 条上面的棋理为什么在这里适用。不要给出具体的下一步着法。` },
  ];
}

export interface MoveContext {
  lesson: Lesson;
  fen: string; // 引擎应手后的当前局面
  moveHistorySan: string[]; // 从 startFen 开始的全部着法（含刚走的两步）
  userMoveSan: string;
  quality: Quality;
  evalBefore: number; // 用户视角
  evalAfter: number; // 用户视角，用户走子后
  bestLinesSan: string[][]; // 用户走子前引擎给出的最佳线路
  engineReplySan: string | null; // null 表示用户走完后已终局
  angle: Angle;
  principles: Principle[];
  recentCommentary: string[]; // 最近 ≤3 条讲解的前 80 字
}

export function buildMoveMessages(ctx: MoveContext): ChatMessage[] {
  const good = ctx.quality === 'best' || ctx.quality === 'good';
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `课程：${ctx.lesson.title}（主题：${ctx.lesson.theme}）
关键思路：${ctx.lesson.keyIdeas.join('；')}
着法记录：${historyText(ctx.moveHistorySan)}
用户刚走：${ctx.userMoveSan}，引擎判定：${QUALITY_LABEL[ctx.quality]}
走子前评估（用户视角）：${formatEval(ctx.evalBefore)}；走子后：${formatEval(ctx.evalAfter)}
走子前引擎认为的最佳线路：
${linesText(ctx.bestLinesSan)}
引擎的应手：${ctx.engineReplySan ?? '（对局已结束）'}
当前局面 FEN：${ctx.fen}
可引用的棋理：
${principlesText(ctx.principles)}
最近的讲解（避免重复）：
${ctx.recentCommentary.length ? ctx.recentCommentary.map((c) => `- ${c}`).join('\n') : '（无）'}

本次讲解角度：${ANGLE_LABEL[ctx.angle]}。${ANGLE_GUIDE[ctx.angle]}
篇幅 ${good ? '3~5' : '4~7'} 句。${good ? '用户走得不错，评价可以简短，把篇幅留给角度里的内容。' : '先说清问题在哪里，再展开。'}最后用一句话提示用户接下来该思考的方向（不给具体着法）。` },
  ];
}

export interface HintContext {
  lesson: Lesson;
  fen: string;
  moveHistorySan: string[];
  bestLinesSan: string[][];
  principles: Principle[];
}

export function buildHintMessages(ctx: HintContext): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `课程：${ctx.lesson.title}（主题：${ctx.lesson.theme}）
着法记录：${historyText(ctx.moveHistorySan)}
当前局面 FEN：${ctx.fen}
引擎的最佳线路：
${linesText(ctx.bestLinesSan)}
可引用的棋理：
${principlesText(ctx.principles)}

用户请求提示。请用 1~2 句话点出思路方向（例如该注意哪个子、哪条线、对方的什么意图），优先用棋理引导，可以用一个反问。不要说出具体着法，也不要提到任何格子加子力的组合（如“马跳到 e5”）。` },
  ];
}

export interface SummaryContext {
  lesson: Lesson;
  moveHistorySan: string[];
  qualities: Quality[];
  evalHistory: number[];
  outcome: 'success' | 'fail';
  reason: string;
  principles: Principle[];
  hintUsed: boolean;
}

export function buildSummaryMessages(ctx: SummaryContext): ChatMessage[] {
  const rounds = ctx.qualities.map((q, i) => `第${i + 1}回合 ${ctx.moveHistorySan[i * 2] ?? ''}：${QUALITY_LABEL[q]}，评估 ${formatEval(ctx.evalHistory[i] ?? 0)}`).join('\n');
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: `课程：${ctx.lesson.title}（主题：${ctx.lesson.theme}）
关键思路：${ctx.lesson.keyIdeas.join('；')}
本课棋理：
${principlesText(ctx.principles)}
完整着法：${historyText(ctx.moveHistorySan)}
每回合评价：
${rounds}
结果：${ctx.outcome === 'success' ? '成功' : '未达成'}（${ctx.reason}）${ctx.hintUsed ? '，过程中使用了提示' : ''}

请写一段 5~8 句的总结：整体表现如何；哪一步最关键（做对或做错）；本局体现了哪几条棋理，用户是否遵循了它们；下次练习这个主题时最该注意的一件事。` },
  ];
}
```

- [ ] **Step 9: 运行测试与 typecheck，Commit**

Run: `npm test && npm run typecheck`
Expected: 全部通过。

```bash
git add src/llm tests/sseParser.test.ts tests/client.test.ts tests/angles.test.ts tests/prompts.test.ts
git commit -m "feat: llm layer - sse parser, streaming client, commentary angles, prompt builders"
```

---

### Task 5: 引擎层：UCI 解析、Stockfish Worker 封装、难度、EngineService

**Files:**
- Create: `src/engine/uciParser.ts`, `src/engine/difficulty.ts`, `src/engine/stockfishWorker.ts`, `src/engine/engineService.ts`
- Test: `tests/uciParser.test.ts`, `tests/difficulty.test.ts`

**Interfaces:**
- Consumes: `Score`（Task 3）, `ENGINE_JS_URL`（Task 1 生成）
- Produces:
  - `InfoLine = { depth; multipv; score: Score; pv: string[] }`；`parseInfoLine(line): InfoLine | null`；`parseBestMove(line): string | null`
  - `DifficultyId`, `Difficulty = { id; label; skillLevel; depth }`, `DIFFICULTIES`, `difficultyById(id)`
  - `Analysis = { fen; lines: InfoLine[]; bestMove: string }`
  - `EnginePort = { analyze(fen, multiPv): Promise<Analysis>; opponentMove(fen, difficulty): Promise<string>; dispose(): void }`
  - `createEngineService(workerUrl): Promise<EnginePort>`；`StockfishEngine` 类

- [ ] **Step 1: 写测试 uciParser**

`tests/uciParser.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseInfoLine, parseBestMove } from '../src/engine/uciParser';

describe('parseInfoLine', () => {
  it('解析 cp 分数与 pv', () => {
    const l = parseInfoLine('info depth 18 seldepth 25 multipv 1 score cp 35 nodes 1000 nps 1 pv e2e4 e7e5 g1f3');
    expect(l).toEqual({ depth: 18, multipv: 1, score: { cp: 35 }, pv: ['e2e4', 'e7e5', 'g1f3'] });
  });
  it('解析 mate 分数', () => {
    expect(parseInfoLine('info depth 10 multipv 2 score mate -3 pv a1a2')?.score).toEqual({ mate: -3 });
  });
  it('无 multipv 时默认 1', () => {
    expect(parseInfoLine('info depth 5 score cp 0 pv e2e4')?.multipv).toBe(1);
  });
  it('忽略没有 pv 或非 info 行', () => {
    expect(parseInfoLine('info depth 3 currmove e2e4 currmovenumber 1')).toBeNull();
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
    expect(parseInfoLine('info string NNUE evaluation using nn.nnue')).toBeNull();
  });
});

describe('parseBestMove', () => {
  it('取 bestmove', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('info depth 1')).toBeNull();
  });
});
```

- [ ] **Step 2: 实现 uciParser.ts**

```ts
import type { Score } from '../chess/quality';

export interface InfoLine {
  depth: number;
  multipv: number;
  score: Score;
  pv: string[];
}

export function parseInfoLine(line: string): InfoLine | null {
  if (!line.startsWith('info ') || line.includes(' string ')) return null;
  const tokens = line.split(/\s+/);
  const pvIdx = tokens.indexOf('pv');
  const scoreIdx = tokens.indexOf('score');
  if (pvIdx === -1 || scoreIdx === -1) return null;
  const num = (key: string, dflt: number) => {
    const i = tokens.indexOf(key);
    return i === -1 ? dflt : Number(tokens[i + 1]);
  };
  const kind = tokens[scoreIdx + 1];
  const val = Number(tokens[scoreIdx + 2]);
  const score: Score = kind === 'mate' ? { mate: val } : { cp: val };
  return { depth: num('depth', 0), multipv: num('multipv', 1), score, pv: tokens.slice(pvIdx + 1) };
}

export function parseBestMove(line: string): string | null {
  const m = /^bestmove\s+(\S+)/.exec(line);
  if (!m || m[1] === '(none)') return null;
  return m[1];
}
```

- [ ] **Step 3: 写测试并实现 difficulty**

`tests/difficulty.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { DIFFICULTIES, difficultyById } from '../src/engine/difficulty';

describe('difficulty', () => {
  it('5 档且递增', () => {
    expect(DIFFICULTIES.length).toBe(5);
    for (let i = 1; i < DIFFICULTIES.length; i++) {
      expect(DIFFICULTIES[i].depth).toBeGreaterThanOrEqual(DIFFICULTIES[i - 1].depth);
      expect(DIFFICULTIES[i].skillLevel).toBeGreaterThanOrEqual(DIFFICULTIES[i - 1].skillLevel);
    }
  });
  it('按 id 查找，未知 id 回落到 medium', () => {
    expect(difficultyById('hard').label).toBe('高级');
    expect(difficultyById('nope').id).toBe('medium');
  });
});
```

`src/engine/difficulty.ts`:
```ts
export type DifficultyId = 'beginner' | 'easy' | 'medium' | 'hard' | 'max';

export interface Difficulty {
  id: DifficultyId;
  label: string;
  skillLevel: number; // Stockfish "Skill Level" 0..20
  depth: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'beginner', label: '入门', skillLevel: 3, depth: 5 },
  { id: 'easy', label: '初级', skillLevel: 8, depth: 8 },
  { id: 'medium', label: '中级', skillLevel: 14, depth: 12 },
  { id: 'hard', label: '高级', skillLevel: 20, depth: 16 },
  { id: 'max', label: '满力', skillLevel: 20, depth: 20 },
];

export function difficultyById(id: string): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[2];
}

/** analyst 用的固定分析深度 */
export const ANALYSIS_DEPTH = 16;
```

- [ ] **Step 4: 实现 stockfishWorker.ts（无自动化测试，浏览器手动验证）**

```ts
import { parseBestMove, parseInfoLine, type InfoLine } from './uciParser';

export interface Analysis {
  fen: string;
  lines: InfoLine[]; // 按 multipv 升序，每个 multipv 只保留最深的一条
  bestMove: string;
}

type Job = { resolve: (lines: string[]) => void; reject: (e: Error) => void; untilBestMove: boolean; lines: string[] };

/** 单个 Stockfish Worker 的 Promise 封装。命令串行执行。 */
export class StockfishEngine {
  private worker: Worker;
  private queue: Promise<unknown> = Promise.resolve();
  private current: Job | null = null;

  constructor(workerUrl: string) {
    this.worker = new Worker(workerUrl);
    this.worker.onmessage = (e: MessageEvent<string>) => this.onLine(String(e.data));
    this.worker.onerror = (e) => this.current?.reject(new Error(`引擎 worker 错误：${e.message}`));
  }

  private onLine(line: string) {
    const job = this.current;
    if (!job) return;
    job.lines.push(line);
    const done = job.untilBestMove ? line.startsWith('bestmove') : line === 'readyok' || line === 'uciok';
    if (done) {
      this.current = null;
      job.resolve(job.lines);
    }
  }

  /** 发送命令并等待终止行（readyok/uciok 或 bestmove） */
  private run(cmds: string[], untilBestMove: boolean): Promise<string[]> {
    const p = this.queue.then(
      () =>
        new Promise<string[]>((resolve, reject) => {
          this.current = { resolve, reject, untilBestMove, lines: [] };
          for (const c of cmds) this.worker.postMessage(c);
        }),
    );
    this.queue = p.catch(() => undefined);
    return p;
  }

  async init(): Promise<void> {
    await this.run(['uci'], false);
    await this.run(['isready'], false);
  }

  async setOptions(opts: Record<string, string | number>): Promise<void> {
    const cmds = Object.entries(opts).map(([k, v]) => `setoption name ${k} value ${v}`);
    await this.run([...cmds, 'isready'], false);
  }

  async newGame(): Promise<void> {
    await this.run(['ucinewgame', 'isready'], false);
  }

  async analyze(fen: string, depth: number, multiPv: number): Promise<Analysis> {
    await this.setOptions({ MultiPV: multiPv });
    const lines = await this.run([`position fen ${fen}`, `go depth ${depth}`], true);
    const byPv = new Map<number, InfoLine>();
    for (const l of lines) {
      const info = parseInfoLine(l);
      if (info && (!byPv.has(info.multipv) || byPv.get(info.multipv)!.depth <= info.depth)) byPv.set(info.multipv, info);
    }
    const bestMove = lines.map(parseBestMove).find((m): m is string => m !== null);
    if (!bestMove) throw new Error('引擎没有返回 bestmove（可能已终局）');
    return { fen, lines: [...byPv.values()].sort((a, b) => a.multipv - b.multipv), bestMove };
  }

  async bestMove(fen: string, depth: number): Promise<string> {
    const lines = await this.run([`position fen ${fen}`, `go depth ${depth}`], true);
    const bm = lines.map(parseBestMove).find((m): m is string => m !== null);
    if (!bm) throw new Error('引擎没有返回 bestmove');
    return bm;
  }

  terminate() {
    this.worker.terminate();
  }
}
```

- [ ] **Step 5: 实现 engineService.ts**

```ts
import { StockfishEngine, type Analysis } from './stockfishWorker';
import { ANALYSIS_DEPTH, type Difficulty } from './difficulty';

export type { Analysis };

export interface EnginePort {
  analyze(fen: string, multiPv: number): Promise<Analysis>;
  opponentMove(fen: string, difficulty: Difficulty): Promise<string>;
  dispose(): void;
}

/** 两个 worker：analyst 满力 MultiPV，opponent 受 Skill Level 与深度限制 */
export async function createEngineService(workerUrl: string): Promise<EnginePort> {
  const analyst = new StockfishEngine(workerUrl);
  const opponent = new StockfishEngine(workerUrl);
  await Promise.all([analyst.init(), opponent.init()]);
  await analyst.setOptions({ 'Skill Level': 20, MultiPV: 3 });
  let lastSkill = -1;
  return {
    analyze: (fen, multiPv) => analyst.analyze(fen, ANALYSIS_DEPTH, multiPv),
    async opponentMove(fen, difficulty) {
      if (difficulty.skillLevel !== lastSkill) {
        await opponent.setOptions({ 'Skill Level': difficulty.skillLevel });
        lastSkill = difficulty.skillLevel;
      }
      return opponent.bestMove(fen, difficulty.depth);
    },
    dispose() {
      analyst.terminate();
      opponent.terminate();
    },
  };
}
```

- [ ] **Step 6: 浏览器手动验证**

临时把 `src/App.tsx` 改为：
```tsx
import { useEffect, useState } from 'react';
import { createEngineService } from './engine/engineService';
import { ENGINE_JS_URL } from './engine/enginePath.generated';
import { difficultyById } from './engine/difficulty';

export default function App() {
  const [out, setOut] = useState('loading engine...');
  useEffect(() => {
    (async () => {
      const t0 = performance.now();
      const eng = await createEngineService(ENGINE_JS_URL);
      const fen = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2P2N2/PP1P1PPP/RNBQK2R w KQkq - 0 5';
      const [a, m] = await Promise.all([eng.analyze(fen, 3), eng.opponentMove(fen, difficultyById('easy'))]);
      setOut(JSON.stringify({ ms: Math.round(performance.now() - t0), best: a.bestMove, lines: a.lines, opp: m }, null, 2));
    })().catch((e) => setOut('ERR ' + String(e)));
  }, []);
  return <pre className="p-4 text-xs">{out}</pre>;
}
```
Run: `npm run dev`，打开页面。
Expected: 几秒内显示 JSON，`lines` 有 3 条 multipv 1/2/3，`best` 为合法 UCI 着法，`ms` < 6000。若报 wasm 加载 404，检查 `public/engine/` 中 `.wasm` 与 `.js` 文件名前缀一致。验证完把 App.tsx 恢复为 Task 1 的占位内容。

- [ ] **Step 7: 测试、typecheck、Commit**

Run: `npm test && npm run typecheck`

```bash
git add src/engine tests/uciParser.test.ts tests/difficulty.test.ts
git commit -m "feat: stockfish worker wrapper, uci parser, difficulty levels, engine service"
```

---

### Task 6: 状态：设置、进度、会话状态机（可用 mock 引擎/LLM 测试）

**Files:**
- Create: `src/store/settings.ts`, `src/store/progress.ts`, `src/store/session.ts`, `src/store/sessionInstance.ts`
- Test: `tests/session.test.ts`, `tests/progress.test.ts`

**Interfaces:**
- Consumes: `EnginePort`, `Analysis`（Task 5）；`ChatMessage`, `LlmConfig`, `streamChat`（Task 4）；`Lesson`；`chooseAngle`, prompt builders；`classifyMove`, `scoreToCp`, `toPerspective`, `uciToSan`, `uciMoveToSan`, `sideToMove`, `uciToSquares`；`isFinished`, `judgeResult`；`extractFeatures`；`PRINCIPLES`, `principleById`
- Produces:
  - `useSettings` (zustand hook, persist key `chess-trainer-settings`)：`{ llm: LlmConfig; temperature: number; difficultyId: DifficultyId; setLlm(partial); setTemperature(n); setDifficultyId(id) }`
  - `useProgress` (persist key `chess-trainer-progress`)：`{ records: Record<string, ProgressRecord>; recordAttempt(lessonId, outcome, clean) }`
  - `LlmPort = { stream(messages, opts: {temperature: number; signal: AbortSignal}): AsyncIterable<string> }`
  - `SessionDeps = { engine: EnginePort; llm: LlmPort; onFinished?(lessonId, outcome, clean): void; random?(): number }`
  - `createSessionStore(deps): StoreApi<SessionState>`；`SessionState`（字段与动作见代码）
  - `sessionInstance.ts`：`getSessionStore(): Promise<StoreApi<SessionState>>`（懒创建真实依赖），`useSession(selector)`

- [ ] **Step 1: 实现 settings.ts 与 progress.ts**

`src/store/settings.ts`:
```ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LlmConfig } from '../llm/client';
import type { DifficultyId } from '../engine/difficulty';

interface SettingsState {
  llm: LlmConfig;
  temperature: number;
  difficultyId: DifficultyId;
  setLlm(partial: Partial<LlmConfig>): void;
  setTemperature(t: number): void;
  setDifficultyId(id: DifficultyId): void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      llm: { baseUrl: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini' },
      temperature: 0.8,
      difficultyId: 'medium',
      setLlm: (partial) => set((s) => ({ llm: { ...s.llm, ...partial } })),
      setTemperature: (temperature) => set({ temperature }),
      setDifficultyId: (difficultyId) => set({ difficultyId }),
    }),
    { name: 'chess-trainer-settings' },
  ),
);
```

`src/store/progress.ts`:
```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Outcome } from '../chess/result';

export interface ProgressRecord {
  attempts: number;
  completed: boolean; // 至少一次 success
  clean: boolean; // 至少一次 success 且未用 hint
  lastOutcome: Outcome;
  lastPlayedAt: string; // ISO
}

interface ProgressState {
  records: Record<string, ProgressRecord>;
  recordAttempt(lessonId: string, outcome: Outcome, clean: boolean): void;
}

const memoryStorage = (): Storage => {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k),
    clear: () => m.clear(), key: () => null, length: 0,
  };
};

export const useProgress = create<ProgressState>()(
  persist(
    (set) => ({
      records: {},
      recordAttempt: (lessonId, outcome, clean) =>
        set((s) => {
          const prev = s.records[lessonId];
          const success = outcome === 'success';
          return {
            records: {
              ...s.records,
              [lessonId]: {
                attempts: (prev?.attempts ?? 0) + 1,
                completed: (prev?.completed ?? false) || success,
                clean: (prev?.clean ?? false) || (success && clean),
                lastOutcome: outcome,
                lastPlayedAt: new Date().toISOString(),
              },
            },
          };
        }),
    }),
    {
      name: 'chess-trainer-progress',
      storage: createJSONStorage(() => (typeof localStorage === 'undefined' ? memoryStorage() : localStorage)),
    },
  ),
);
```

`tests/progress.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { useProgress } from '../src/store/progress';

describe('progress store', () => {
  it('累计尝试并记录完成/干净完成', () => {
    const s = useProgress.getState();
    s.recordAttempt('a/b', 'fail', false);
    s.recordAttempt('a/b', 'success', false);
    let r = useProgress.getState().records['a/b'];
    expect(r.attempts).toBe(2);
    expect(r.completed).toBe(true);
    expect(r.clean).toBe(false);
    s.recordAttempt('a/b', 'success', true);
    r = useProgress.getState().records['a/b'];
    expect(r.clean).toBe(true);
  });
});
```

- [ ] **Step 2: 写会话状态机测试（mock 引擎与 LLM）**

`tests/session.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { createSessionStore, type LlmPort } from '../src/store/session';
import type { EnginePort } from '../src/engine/engineService';
import { lessonById } from '../src/lessons';
import { difficultyById } from '../src/engine/difficulty';

/** 假引擎：最佳着法 = 第一个合法着法；评估恒为 +20（行棋方视角） */
function fakeEngine(): EnginePort {
  const first = (fen: string) => {
    const m = new Chess(fen).moves({ verbose: true })[0];
    return m.from + m.to + (m.promotion ?? '');
  };
  return {
    async analyze(fen) {
      const bm = first(fen);
      return { fen, bestMove: bm, lines: [{ depth: 16, multipv: 1, score: { cp: 20 }, pv: [bm] }] };
    },
    async opponentMove(fen) { return first(fen); },
    dispose() {},
  };
}

function fakeLlm(chunks = ['讲', '解']): LlmPort & { calls: number } {
  const port = {
    calls: 0,
    async *stream() { port.calls++; for (const c of chunks) yield c; },
  };
  return port;
}

const lesson = lessonById('opening/italian-game')!;
const diff = difficultyById('medium');

describe('session store', () => {
  it('start 后进入 userTurn，intro 流式写入', async () => {
    const llm = fakeLlm();
    const store = createSessionStore({ engine: fakeEngine(), llm });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();
    const s = store.getState();
    expect(s.phase).toBe('userTurn');
    expect(s.intro).toBe('讲解');
    expect(s.fen).toBe(lesson.startFen);
    expect(s.analysisBefore?.fen).toBe(lesson.startFen);
  });

  it('非法着法被拒绝', async () => {
    const store = createSessionStore({ engine: fakeEngine(), llm: fakeLlm() });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();
    expect(await store.getState().playUserMove('e1', 'e5')).toBe(false);
    expect(store.getState().rounds.length).toBe(0);
  });

  it('合法着法：引擎应手、质量分级、讲解流式写入 round', async () => {
    const llm = fakeLlm();
    const store = createSessionStore({ engine: fakeEngine(), llm });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();
    const ok = await store.getState().playUserMove('d2', 'd3');
    expect(ok).toBe(true);
    await store.getState().whenIdle();
    const s = store.getState();
    expect(s.rounds.length).toBe(1);
    expect(s.rounds[0].userMove.san).toBe('d3');
    expect(s.rounds[0].engineMove?.san).toBeTruthy();
    expect(s.history.length).toBe(2);
    expect(['best', 'good', 'inaccuracy', 'mistake', 'blunder']).toContain(s.rounds[0].userMove.quality);
    expect(s.rounds[0].commentary).toBe('讲解');
    expect(s.phase).toBe('userTurn');
    expect(llm.calls).toBe(2); // intro + 1 次讲解
  });

  it('走满 plies 后 finished 并产出总结与结果', async () => {
    let finished: { id: string; outcome: string } | null = null;
    const store = createSessionStore({ engine: fakeEngine(), llm: fakeLlm(), onFinished: (id, outcome) => { finished = { id, outcome }; } });
    const short = { ...lesson, stop: { kind: 'plies', count: 2 } as const };
    await store.getState().start(short, diff);
    await store.getState().whenIdle();
    for (let i = 0; i < 2; i++) {
      const s = store.getState();
      const m = new Chess(s.fen).moves({ verbose: true }).find((x) => x.piece === 'p')!;
      expect(await s.playUserMove(m.from, m.to)).toBe(true);
      await store.getState().whenIdle();
    }
    const s = store.getState();
    expect(s.phase).toBe('finished');
    expect(s.result).not.toBeNull();
    expect(s.summary).toBe('讲解');
    expect(finished!.id).toBe(short.id);
  });

  it('hint 一级出文字、二级出箭头并标记 hintUsed', async () => {
    const store = createSessionStore({ engine: fakeEngine(), llm: fakeLlm(['提', '示']) });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();
    await store.getState().requestHint(1);
    await store.getState().whenIdle();
    expect(store.getState().hintText).toBe('提示');
    await store.getState().requestHint(2);
    const best = store.getState().analysisBefore!.bestMove;
    expect(store.getState().hintArrow).toEqual({ from: best.slice(0, 2), to: best.slice(2, 4) });
    expect(store.getState().hintUsed).toBe(true);
  });

  it('LLM 出错时记录 error，对弈继续', async () => {
    const llm: LlmPort = { async *stream() { throw new Error('boom'); } };
    const store = createSessionStore({ engine: fakeEngine(), llm });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();
    expect(store.getState().llmError).toContain('boom');
    expect(store.getState().phase).toBe('userTurn');
  });
});
```

- [ ] **Step 3: 实现 session.ts**

```ts
import { createStore, type StoreApi } from 'zustand/vanilla';
import { Chess } from 'chess.js';
import type { Lesson } from '../lessons/schema';
import { PRINCIPLES, principleById, type Principle } from '../lessons/principles';
import type { EnginePort, Analysis } from '../engine/engineService';
import type { Difficulty } from '../engine/difficulty';
import type { ChatMessage } from '../llm/client';
import { chooseAngle, type Angle } from '../llm/angles';
import { buildHintMessages, buildIntroMessages, buildMoveMessages, buildSummaryMessages } from '../llm/prompts';
import { classifyMove, scoreToCp, type Quality } from '../chess/quality';
import { sideToMove, toPerspective, uciToSan, uciToSquares } from '../chess/notation';
import { isFinished, judgeResult, type GameResult, type Outcome } from '../chess/result';
import { extractFeatures } from '../chess/features';

export interface LlmPort {
  stream(messages: ChatMessage[], opts: { temperature: number; signal: AbortSignal }): AsyncIterable<string>;
}

export interface SessionDeps {
  engine: EnginePort;
  llm: LlmPort;
  onFinished?(lessonId: string, outcome: Outcome, clean: boolean): void;
  random?(): number;
}

export type Phase = 'idle' | 'preparing' | 'userTurn' | 'engineThinking' | 'finished';
export type StreamKind = 'intro' | 'commentary' | 'hint' | 'summary';

export interface Round {
  index: number;
  userMove: { san: string; uci: string; quality: Quality; evalBefore: number; evalAfter: number };
  engineMove: { san: string; uci: string } | null;
  bestLinesSan: string[][];
  angle: Angle;
  commentary: string;
  error?: string;
}

export interface SessionState {
  lesson: Lesson | null;
  difficulty: Difficulty | null;
  fen: string;
  phase: Phase;
  streaming: StreamKind | null;
  rounds: Round[];
  history: string[]; // SAN
  evalCp: number; // 用户视角，当前局面
  evalHistory: number[];
  intro: string;
  summary: string;
  hintText: string;
  hintArrow: { from: string; to: string } | null;
  hintUsed: boolean;
  analysisBefore: Analysis | null; // 当前 fen 的分析（用户走子前）
  result: { outcome: Outcome; reason: string } | null;
  engineError: string | null;
  llmError: string | null;
  usedPrincipleIds: string[];
  angleHistory: Angle[];

  start(lesson: Lesson, difficulty: Difficulty): Promise<void>;
  playUserMove(from: string, to: string, promotion?: string): Promise<boolean>;
  requestHint(level: 1 | 2): Promise<void>;
  restart(): Promise<void>;
  whenIdle(): Promise<void>;
  dispose(): void;
}

const initial = {
  lesson: null, difficulty: null, fen: '', phase: 'idle' as Phase, streaming: null, rounds: [], history: [],
  evalCp: 0, evalHistory: [], intro: '', summary: '', hintText: '', hintArrow: null, hintUsed: false,
  analysisBefore: null, result: null, engineError: null, llmError: null, usedPrincipleIds: [], angleHistory: [],
};

function playerCp(analysis: Analysis, lesson: Lesson): number {
  const line = analysis.lines.find((l) => l.multipv === 1) ?? analysis.lines[0];
  return toPerspective(scoreToCp(line.score), sideToMove(analysis.fen), lesson.playerColor);
}

function gameResultOf(chess: Chess, lesson: Lesson): GameResult {
  if (!chess.isGameOver()) return null;
  if (chess.isCheckmate()) return chess.turn() === lesson.playerColor ? 'playerLoss' : 'playerWin';
  return 'draw';
}

/** 挑选本回合可引用的棋理：课程指定的优先，其次由局面特征触发；尽量不重复用过的 */
function pickPrinciples(lesson: Lesson, fen: string, used: string[]): Principle[] {
  const features = extractFeatures(fen, lesson.playerColor);
  const triggered = PRINCIPLES.filter((p) => p.triggers.some((t) => features.includes(t)) && !lesson.principleIds.includes(p.id));
  const lessonPs = lesson.principleIds.map(principleById);
  const fresh = [...lessonPs, ...triggered].filter((p) => !used.includes(p.id));
  const pool = fresh.length > 0 ? fresh : [...lessonPs, ...triggered];
  return pool.slice(0, 2);
}

export function createSessionStore(deps: SessionDeps): StoreApi<SessionState> {
  const pending = new Set<Promise<unknown>>();
  let streamAbort: AbortController | null = null;

  const track = <T,>(p: Promise<T>): Promise<T> => {
    pending.add(p);
    // 用 then(onOk, onErr) 而不是 finally，避免产生新的未处理 rejection
    p.then(() => pending.delete(p), () => pending.delete(p));
    return p;
  };

  return createStore<SessionState>((set, get) => {
    /** 流式写入：onChunk 追加文本；出错写 llmError */
    const stream = (kind: StreamKind, messages: ChatMessage[], temperature: number, onChunk: (text: string) => void, onDone?: () => void) => {
      streamAbort?.abort();
      const ac = new AbortController();
      streamAbort = ac;
      set({ streaming: kind, llmError: null });
      const run = (async () => {
        let acc = '';
        try {
          for await (const d of deps.llm.stream(messages, { temperature, signal: ac.signal })) {
            if (ac.signal.aborted) break;
            acc += d;
            onChunk(acc);
          }
        } catch (e) {
          if (!ac.signal.aborted) set({ llmError: `讲解失败：${(e as Error).message}` });
        } finally {
          if (streamAbort === ac) { streamAbort = null; set({ streaming: null }); }
          onDone?.();
        }
      })();
      return track(run);
    };

    const prepareTurn = async () => {
      const { lesson, fen } = get();
      if (!lesson) return;
      set({ phase: 'preparing', hintArrow: null, hintText: '' });
      try {
        const analysis = await deps.engine.analyze(fen, 3);
        if (get().fen !== fen) return; // 已重开
        set({ analysisBefore: analysis, evalCp: playerCp(analysis, lesson), phase: 'userTurn', engineError: null });
      } catch (e) {
        set({ engineError: `引擎分析失败：${(e as Error).message}`, phase: 'userTurn' });
      }
    };

    const finish = async (chess: Chess) => {
      const s = get();
      const lesson = s.lesson!;
      const gameResult = gameResultOf(chess, lesson);
      let finalEvalCp = s.evalHistory[s.evalHistory.length - 1] ?? s.evalCp;
      if (gameResult === 'playerWin') finalEvalCp = 10000;
      else if (gameResult === 'playerLoss') finalEvalCp = -10000;
      else if (gameResult === 'draw') finalEvalCp = 0;
      else {
        try { finalEvalCp = playerCp(await deps.engine.analyze(chess.fen(), 1), lesson); } catch { /* 用上一回合评估 */ }
      }
      const result = judgeResult({
        lesson, finalFen: chess.fen(), finalEvalCp, evalHistory: s.evalHistory,
        qualities: s.rounds.map((r) => r.userMove.quality), gameResult,
      });
      set({ phase: 'finished', result, evalCp: finalEvalCp });
      deps.onFinished?.(lesson.id, result.outcome, !get().hintUsed);
      const principles = lesson.principleIds.map(principleById);
      void stream('summary', buildSummaryMessages({
        lesson, moveHistorySan: get().history, qualities: get().rounds.map((r) => r.userMove.quality),
        evalHistory: get().evalHistory, outcome: result.outcome, reason: result.reason, principles, hintUsed: get().hintUsed,
      }), 0.5, (text) => set({ summary: text }));
    };

    return {
      ...initial,

      async start(lesson, difficulty) {
        streamAbort?.abort();
        set({ ...initial, lesson, difficulty, fen: lesson.startFen, phase: 'preparing' });
        const principles = lesson.principleIds.map(principleById);
        void stream('intro', buildIntroMessages(lesson, principles), 0.7, (text) => set({ intro: text }));
        await track(prepareTurn());
      },

      async playUserMove(from, to, promotion) {
        const s = get();
        const lesson = s.lesson;
        if (!lesson || s.phase !== 'userTurn' || !s.analysisBefore || s.analysisBefore.fen !== s.fen) return false;
        const chess = new Chess(s.fen);
        let move;
        try {
          move = chess.move({ from, to, promotion });
        } catch {
          return false;
        }
        if (s.streaming === 'commentary' || s.streaming === 'hint' || s.streaming === 'intro') streamAbort?.abort();

        const analysisBefore = s.analysisBefore;
        const evalBefore = playerCp(analysisBefore, lesson);
        const bestLinesSan = analysisBefore.lines.map((l) => uciToSan(s.fen, l.pv.slice(0, 6)));
        const userUci = move.from + move.to + (move.promotion ?? '');
        const fenAfterUser = chess.fen();
        set({ phase: 'engineThinking', hintArrow: null, hintText: '' });

        let evalAfter = evalBefore;
        let engineMove: Round['engineMove'] = null;
        const afterUserOver = chess.isGameOver();
        if (!afterUserOver) {
          try {
            const [analysisAfter, engineUci] = await Promise.all([
              deps.engine.analyze(fenAfterUser, 1),
              deps.engine.opponentMove(fenAfterUser, s.difficulty!),
            ]);
            evalAfter = playerCp(analysisAfter, lesson);
            const em = chess.move(uciToSquares(engineUci));
            engineMove = { san: em.san, uci: engineUci };
          } catch (e) {
            set({ engineError: `引擎出错：${(e as Error).message}`, phase: 'userTurn' });
            return false;
          }
        } else {
          const gr = gameResultOf(chess, lesson);
          evalAfter = gr === 'playerWin' ? 10000 : gr === 'draw' ? 0 : -10000;
        }

        const quality = classifyMove({ evalBefore, evalAfter, userMoveUci: userUci, bestMoveUci: analysisBefore.bestMove });
        const angle = chooseAngle({ quality, evalSwing: evalAfter - evalBefore, history: get().angleHistory, random: deps.random });
        const principles = pickPrinciples(lesson, chess.fen(), get().usedPrincipleIds);
        const round: Round = {
          index: get().rounds.length, userMove: { san: move.san, uci: userUci, quality, evalBefore, evalAfter },
          engineMove, bestLinesSan, angle, commentary: '',
        };
        const history = [...get().history, move.san, ...(engineMove ? [engineMove.san] : [])];
        set({
          fen: chess.fen(), history, rounds: [...get().rounds, round], evalHistory: [...get().evalHistory, evalAfter],
          evalCp: evalAfter, angleHistory: [...get().angleHistory, angle],
          usedPrincipleIds: [...get().usedPrincipleIds, ...principles.map((p) => p.id)],
        });

        const recent = get().rounds.slice(-4, -1).map((r) => r.commentary.slice(0, 80)).filter(Boolean);
        const done = isFinished(lesson, get().rounds.length, history.length, chess.isGameOver());
        const idx = round.index;
        const writeCommentary = (text: string) =>
          set((st) => ({ rounds: st.rounds.map((r) => (r.index === idx ? { ...r, commentary: text } : r)) }));

        const commentaryMessages = buildMoveMessages({
          lesson, fen: chess.fen(), moveHistorySan: history, userMoveSan: move.san, quality, evalBefore, evalAfter,
          bestLinesSan, engineReplySan: engineMove?.san ?? null, angle, principles, recentCommentary: recent,
        });

        if (done) {
          // 先讲这一回合，再总结
          await stream('commentary', commentaryMessages, 0.8, writeCommentary);
          await track(finish(chess));
        } else {
          void stream('commentary', commentaryMessages, 0.8, writeCommentary);
          await track(prepareTurn());
        }
        return true;
      },

      async requestHint(level) {
        const s = get();
        if (!s.lesson || s.phase !== 'userTurn' || !s.analysisBefore) return;
        set({ hintUsed: true });
        const best = s.analysisBefore.bestMove;
        if (level === 2) {
          const sq = uciToSquares(best);
          set({ hintArrow: { from: sq.from, to: sq.to } });
          return;
        }
        const bestLinesSan = s.analysisBefore.lines.map((l) => uciToSan(s.fen, l.pv.slice(0, 4)));
        const principles = pickPrinciples(s.lesson, s.fen, []);
        await stream('hint', buildHintMessages({ lesson: s.lesson, fen: s.fen, moveHistorySan: s.history, bestLinesSan, principles }), 0.5, (t) => set({ hintText: t }));
      },

      async restart() {
        const { lesson, difficulty } = get();
        if (lesson && difficulty) await get().start(lesson, difficulty);
      },

      async whenIdle() {
        while (pending.size > 0) await Promise.allSettled([...pending]);
      },

      dispose() {
        streamAbort?.abort();
        deps.engine.dispose();
      },
    };
  });
}
```

- [ ] **Step 4: 实现 sessionInstance.ts（真实依赖接线，供 UI 使用）**

```ts
import { useStore, type StoreApi } from 'zustand';
import { createSessionStore, type SessionState, type LlmPort } from './session';
import { createEngineService } from '../engine/engineService';
import { ENGINE_JS_URL } from '../engine/enginePath.generated';
import { streamChat } from '../llm/client';
import { useSettings } from './settings';
import { useProgress } from './progress';

let storePromise: Promise<StoreApi<SessionState>> | null = null;

const llm: LlmPort = {
  stream(messages, opts) {
    const { llm: cfg } = useSettings.getState();
    if (!cfg.apiKey) {
      return (async function* () { throw new Error('尚未配置 API Key，请先在设置中填写'); })();
    }
    return streamChat(cfg, messages, { temperature: opts.temperature, signal: opts.signal });
  },
};

export function getSessionStore(): Promise<StoreApi<SessionState>> {
  if (!storePromise) {
    storePromise = createEngineService(ENGINE_JS_URL).then((engine) =>
      createSessionStore({
        engine,
        llm,
        onFinished: (lessonId, outcome, clean) => useProgress.getState().recordAttempt(lessonId, outcome, clean),
      }),
    );
  }
  return storePromise;
}

export function useSession<T>(store: StoreApi<SessionState>, selector: (s: SessionState) => T): T {
  return useStore(store, selector);
}
```

- [ ] **Step 5: 运行测试与 typecheck**

Run: `npm test && npm run typecheck`
Expected: 全部通过。常见问题：`Promise<T>.finally` 未处理的 rejection 警告 → 在 `track` 中改为 `p.catch(() => undefined).finally(...)` 注册清理但仍返回原 `p`。

- [ ] **Step 6: Commit**

```bash
git add src/store tests/session.test.ts tests/progress.test.ts
git commit -m "feat: settings/progress stores and lesson session state machine"
```

---

### Task 7: UI：首页、设置、课程页（棋盘、讲解、hint、着法表、总结）

**Files:**
- Create: `src/components/Board.tsx`, `src/components/EvalBar.tsx`, `src/components/StreamText.tsx`, `src/components/CommentaryPanel.tsx`, `src/components/MoveList.tsx`, `src/components/HintButton.tsx`, `src/components/SettingsDialog.tsx`, `src/components/LessonCard.tsx`, `src/components/SummaryCard.tsx`, `src/pages/HomePage.tsx`, `src/pages/LessonPage.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: 所有 store 与数据模块。
- 说明：`react-chessboard` v5 使用单一 `options` prop。实现前先 `sed -n '1,200p' node_modules/react-chessboard/dist/index.d.ts` 确认 `onPieceDrop` 的参数形状、`arrows` 的字段名和 `boardOrientation` 取值，必要时调整 Board.tsx 内部，但保持 Board 的 props 接口不变。

- [ ] **Step 1: Board 与 EvalBar**

`src/components/Board.tsx`:
```tsx
import { useMemo } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

export interface BoardProps {
  fen: string;
  orientation: 'white' | 'black';
  interactive: boolean;
  arrow: { from: string; to: string } | null;
  lastMove: { from: string; to: string } | null;
  onMove(from: string, to: string, promotion?: string): Promise<boolean> | boolean;
}

export function Board({ fen, orientation, interactive, arrow, lastMove, onMove }: BoardProps) {
  const squareStyles = useMemo(() => {
    const s: Record<string, React.CSSProperties> = {};
    if (lastMove) {
      s[lastMove.from] = { backgroundColor: 'rgba(255, 213, 79, 0.45)' };
      s[lastMove.to] = { backgroundColor: 'rgba(255, 213, 79, 0.65)' };
    }
    return s;
  }, [lastMove]);

  return (
    <Chessboard
      options={{
        id: 'trainer-board',
        position: fen,
        boardOrientation: orientation,
        allowDragging: interactive,
        squareStyles,
        arrows: arrow ? [{ startSquare: arrow.from, endSquare: arrow.to, color: '#2563eb' }] : [],
        onPieceDrop: ({ sourceSquare, targetSquare }) => {
          if (!targetSquare) return false;
          // 需要升变时默认升后；chess.js 会拒绝无需升变时带 promotion 的着法，所以先判断
          const chess = new Chess(fen);
          const legal = chess.moves({ verbose: true }).find((m) => m.from === sourceSquare && m.to === targetSquare);
          if (!legal) return false;
          void onMove(sourceSquare, targetSquare, legal.promotion ? 'q' : undefined);
          return true;
        },
      }}
    />
  );
}
```

`src/components/EvalBar.tsx`:
```tsx
import { formatEval } from '../chess/notation';

export function EvalBar({ cp, playerIsWhite }: { cp: number; playerIsWhite: boolean }) {
  // cp 为用户视角；条形图以白方视角显示
  const whiteCp = playerIsWhite ? cp : -cp;
  const clamped = Math.max(-1000, Math.min(1000, whiteCp));
  const whitePct = 50 + (clamped / 1000) * 50;
  return (
    <div className="flex items-center gap-3">
      <div className="h-3 flex-1 overflow-hidden rounded bg-neutral-800">
        <div className="h-full bg-neutral-100 transition-all" style={{ width: `${whitePct}%` }} />
      </div>
      <span className="w-16 text-right font-mono text-sm">{formatEval(cp)}</span>
    </div>
  );
}
```

- [ ] **Step 2: StreamText、CommentaryPanel、MoveList、HintButton、SummaryCard**

`src/components/StreamText.tsx`:
```tsx
export function StreamText({ text, streaming, placeholder }: { text: string; streaming: boolean; placeholder?: string }) {
  if (!text && !streaming) return <p className="text-sm text-neutral-400">{placeholder ?? ''}</p>;
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {text}
      {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-neutral-500 align-middle" />}
    </p>
  );
}
```

`src/components/CommentaryPanel.tsx`:
```tsx
import type { Round } from '../store/session';
import { QUALITY_LABEL, type Quality } from '../chess/quality';
import { ANGLE_LABEL } from '../llm/angles';
import { StreamText } from './StreamText';

const QUALITY_CLASS: Record<Quality, string> = {
  best: 'bg-emerald-600', good: 'bg-green-500', inaccuracy: 'bg-yellow-500', mistake: 'bg-orange-500', blunder: 'bg-red-600',
};

interface Props { intro: string; rounds: Round[]; streaming: string | null; llmError: string | null }

export function CommentaryPanel({ intro, rounds, streaming, llmError }: Props) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto">
      <section className="rounded-lg border border-neutral-200 p-3">
        <h3 className="mb-1 text-xs font-semibold text-neutral-500">开场</h3>
        <StreamText text={intro} streaming={streaming === 'intro'} placeholder="正在生成开场讲解…" />
      </section>
      {rounds.map((r) => (
        <section key={r.index} className="rounded-lg border border-neutral-200 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs">
            <span className="font-mono">{r.index + 1}. {r.userMove.san}{r.engineMove ? ` ${r.engineMove.san}` : ''}</span>
            <span className={`rounded px-1.5 py-0.5 text-white ${QUALITY_CLASS[r.userMove.quality]}`}>{QUALITY_LABEL[r.userMove.quality]}</span>
            <span className="text-neutral-400">{ANGLE_LABEL[r.angle]}</span>
          </div>
          <StreamText text={r.commentary} streaming={streaming === 'commentary' && r.index === rounds.length - 1} placeholder="讲解生成中…" />
        </section>
      ))}
      {llmError && <p className="rounded bg-red-50 p-2 text-xs text-red-700">{llmError}</p>}
    </div>
  );
}
```

`src/components/MoveList.tsx`:
```tsx
export function MoveList({ history, startMoveNumber, blackFirst }: { history: string[]; startMoveNumber: number; blackFirst: boolean }) {
  const cells: { num: number; white?: string; black?: string }[] = [];
  let i = 0;
  let num = startMoveNumber;
  if (blackFirst && history.length) { cells.push({ num, black: history[0] }); i = 1; num++; }
  for (; i < history.length; i += 2, num++) cells.push({ num, white: history[i], black: history[i + 1] });
  return (
    <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-x-2 gap-y-0.5 font-mono text-sm">
      {cells.map((c) => (
        <div key={c.num} className="contents">
          <span className="text-neutral-400">{c.num}.</span>
          <span>{c.white ?? '…'}</span>
          <span>{c.black ?? ''}</span>
        </div>
      ))}
    </div>
  );
}
```

`src/components/HintButton.tsx`:
```tsx
import { StreamText } from './StreamText';

interface Props { disabled: boolean; hintText: string; streaming: boolean; onHint(level: 1 | 2): void }

export function HintButton({ disabled, hintText, streaming, onHint }: Props) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
      <div className="flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-40" disabled={disabled} onClick={() => onHint(1)}>提示思路</button>
        <button className="rounded border border-blue-600 px-3 py-1 text-sm text-blue-700 disabled:opacity-40" disabled={disabled} onClick={() => onHint(2)}>显示着法</button>
      </div>
      {(hintText || streaming) && <div className="mt-2"><StreamText text={hintText} streaming={streaming} /></div>}
    </div>
  );
}
```

`src/components/SummaryCard.tsx`:
```tsx
import { StreamText } from './StreamText';

interface Props { outcome: 'success' | 'fail'; reason: string; summary: string; streaming: boolean; onRestart(): void; onBack(): void }

export function SummaryCard({ outcome, reason, summary, streaming, onRestart, onBack }: Props) {
  return (
    <div className={`rounded-lg border p-4 ${outcome === 'success' ? 'border-emerald-300 bg-emerald-50' : 'border-orange-300 bg-orange-50'}`}>
      <h3 className="text-base font-semibold">{outcome === 'success' ? '完成训练目标' : '未达成目标'}</h3>
      <p className="mb-2 text-sm text-neutral-600">{reason}</p>
      <StreamText text={summary} streaming={streaming} placeholder="正在生成总结…" />
      <div className="mt-3 flex gap-2">
        <button className="rounded bg-neutral-800 px-3 py-1 text-sm text-white" onClick={onRestart}>再来一次</button>
        <button className="rounded border px-3 py-1 text-sm" onClick={onBack}>返回课程列表</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: SettingsDialog 与 LessonCard**

`src/components/SettingsDialog.tsx`:
```tsx
import { useState } from 'react';
import { useSettings } from '../store/settings';
import { testConnection } from '../llm/client';
import { DIFFICULTIES, type DifficultyId } from '../engine/difficulty';

export function SettingsDialog({ onClose }: { onClose(): void }) {
  const { llm, temperature, difficultyId, setLlm, setTemperature, setDifficultyId } = useSettings();
  const [status, setStatus] = useState<string>('');
  const test = async () => {
    setStatus('测试中…');
    try { await testConnection(llm); setStatus('连接成功，已收到流式内容。'); }
    catch (e) { setStatus(`失败：${(e as Error).message}`); }
  };
  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-[28rem] rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-lg font-semibold">设置</h2>
        <label className="block text-sm">Base URL
          <input className="mt-1 w-full rounded border px-2 py-1" value={llm.baseUrl} onChange={(e) => setLlm({ baseUrl: e.target.value })} placeholder="https://api.openai.com/v1" />
        </label>
        <label className="mt-2 block text-sm">API Key
          <input className="mt-1 w-full rounded border px-2 py-1" type="password" value={llm.apiKey} onChange={(e) => setLlm({ apiKey: e.target.value })} />
        </label>
        <label className="mt-2 block text-sm">模型
          <input className="mt-1 w-full rounded border px-2 py-1" value={llm.model} onChange={(e) => setLlm({ model: e.target.value })} />
        </label>
        <label className="mt-2 block text-sm">讲解温度 {temperature.toFixed(1)}
          <input className="mt-1 w-full" type="range" min={0} max={1.2} step={0.1} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
        </label>
        <label className="mt-2 block text-sm">默认难度
          <select className="mt-1 w-full rounded border px-2 py-1" value={difficultyId} onChange={(e) => setDifficultyId(e.target.value as DifficultyId)}>
            {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
          </select>
        </label>
        <p className="mt-2 text-xs text-neutral-500">Key 仅保存在本机浏览器的 localStorage 中，请求默认使用流式（stream）模式。</p>
        <div className="mt-3 flex items-center gap-2">
          <button className="rounded bg-blue-600 px-3 py-1 text-sm text-white" onClick={test}>测试连接</button>
          <button className="rounded border px-3 py-1 text-sm" onClick={onClose}>关闭</button>
          <span className="text-xs text-neutral-600">{status}</span>
        </div>
      </div>
    </div>
  );
}
```

`src/components/LessonCard.tsx`:
```tsx
import { Link } from 'react-router-dom';
import type { Lesson } from '../lessons/schema';
import type { ProgressRecord } from '../store/progress';

export function LessonCard({ lesson, record }: { lesson: Lesson; record?: ProgressRecord }) {
  return (
    <Link to={`/lesson/${encodeURIComponent(lesson.id)}`} className="block rounded-lg border border-neutral-200 p-3 hover:border-neutral-400">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-medium">{lesson.title}</h3>
        {record?.completed && <span className={`shrink-0 rounded px-1.5 text-xs text-white ${record.clean ? 'bg-emerald-600' : 'bg-blue-500'}`}>{record.clean ? '干净完成' : '已完成'}</span>}
      </div>
      <p className="mt-1 text-sm text-neutral-600">{lesson.summary}</p>
      <p className="mt-1 text-xs text-neutral-400">执{lesson.playerColor === 'w' ? '白' : '黑'} · {record ? `已练 ${record.attempts} 次` : '未开始'}</p>
    </Link>
  );
}
```

- [ ] **Step 4: 页面与路由**

`src/pages/HomePage.tsx`:
```tsx
import { useState } from 'react';
import { lessonsBySection } from '../lessons';
import { SECTION_LABEL, type Section } from '../lessons/schema';
import { useProgress } from '../store/progress';
import { useSettings } from '../store/settings';
import { LessonCard } from '../components/LessonCard';
import { SettingsDialog } from '../components/SettingsDialog';

const SECTIONS: Section[] = ['opening', 'middlegame', 'endgame'];

export function HomePage() {
  const records = useProgress((s) => s.records);
  const hasKey = useSettings((s) => Boolean(s.llm.apiKey));
  const [open, setOpen] = useState(false);
  return (
    <div className="mx-auto max-w-6xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">国际象棋训练</h1>
        <button className="rounded border px-3 py-1 text-sm" onClick={() => setOpen(true)}>设置{hasKey ? '' : '（未配置 API Key）'}</button>
      </header>
      <div className="grid gap-6 md:grid-cols-3">
        {SECTIONS.map((sec) => (
          <section key={sec}>
            <h2 className="mb-2 text-lg font-medium">{SECTION_LABEL[sec]}</h2>
            <div className="flex flex-col gap-3">
              {lessonsBySection(sec).map((l) => <LessonCard key={l.id} lesson={l} record={records[l.id]} />)}
            </div>
          </section>
        ))}
      </div>
      {open && <SettingsDialog onClose={() => setOpen(false)} />}
    </div>
  );
}
```

`src/pages/LessonPage.tsx`:
```tsx
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { StoreApi } from 'zustand';
import { lessonById } from '../lessons';
import { getSessionStore, useSession } from '../store/sessionInstance';
import type { SessionState } from '../store/session';
import { useSettings } from '../store/settings';
import { DIFFICULTIES, difficultyById, type DifficultyId } from '../engine/difficulty';
import { Board } from '../components/Board';
import { EvalBar } from '../components/EvalBar';
import { CommentaryPanel } from '../components/CommentaryPanel';
import { MoveList } from '../components/MoveList';
import { HintButton } from '../components/HintButton';
import { SummaryCard } from '../components/SummaryCard';
import { uciToSquares } from '../chess/notation';

export function LessonPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const lesson = lessonById(decodeURIComponent(id ?? ''));
  const defaultDifficulty = useSettings((s) => s.difficultyId);
  const [difficultyId, setDifficultyId] = useState<DifficultyId>(defaultDifficulty);
  const [store, setStore] = useState<StoreApi<SessionState> | null>(null);
  const [engineStatus, setEngineStatus] = useState('正在加载引擎…');

  useEffect(() => {
    getSessionStore().then(setStore).catch((e) => setEngineStatus(`引擎加载失败：${String(e)}`));
  }, []);

  useEffect(() => {
    if (!store || !lesson) return;
    void store.getState().start(lesson, difficultyById(difficultyId));
  }, [store, lesson, difficultyId]);

  if (!lesson) return <div className="p-6">找不到课程。<button className="underline" onClick={() => navigate('/')}>返回</button></div>;
  if (!store) return <div className="p-6 text-sm text-neutral-500">{engineStatus}</div>;
  return <LessonView store={store} difficultyId={difficultyId} onDifficulty={setDifficultyId} onBack={() => navigate('/')} />;
}

function LessonView({ store, difficultyId, onDifficulty, onBack }: { store: StoreApi<SessionState>; difficultyId: DifficultyId; onDifficulty(id: DifficultyId): void; onBack(): void }) {
  const s = useSession(store, (x) => x);
  const lesson = s.lesson!;
  const lastUci = s.rounds.length ? (s.rounds[s.rounds.length - 1].engineMove?.uci ?? s.rounds[s.rounds.length - 1].userMove.uci) : null;
  const lastMove = lastUci ? (({ from, to }) => ({ from, to }))(uciToSquares(lastUci)) : null;
  const startMoveNumber = Number(lesson.startFen.split(' ')[5] ?? '1');
  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-6 md:grid-cols-[minmax(320px,520px)_1fr]">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm">
          <button className="underline" onClick={onBack}>← 课程列表</button>
          <label>难度
            <select className="ml-1 rounded border px-1" value={difficultyId} onChange={(e) => onDifficulty(e.target.value as DifficultyId)}>
              {DIFFICULTIES.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </label>
          <button className="rounded border px-2 py-0.5" onClick={() => void s.restart()}>重开</button>
        </div>
        <Board
          fen={s.fen}
          orientation={lesson.playerColor === 'w' ? 'white' : 'black'}
          interactive={s.phase === 'userTurn'}
          arrow={s.hintArrow}
          lastMove={lastMove}
          onMove={(f, t, p) => s.playUserMove(f, t, p)}
        />
        <EvalBar cp={s.evalCp} playerIsWhite={lesson.playerColor === 'w'} />
        <p className="text-xs text-neutral-500">
          {s.phase === 'preparing' && '引擎分析中…'}
          {s.phase === 'engineThinking' && '引擎思考中…'}
          {s.phase === 'userTurn' && '轮到你走'}
          {s.phase === 'finished' && '训练结束'}
          {s.engineError && <span className="ml-2 text-red-600">{s.engineError}</span>}
        </p>
        <MoveList history={s.history} startMoveNumber={startMoveNumber} blackFirst={lesson.playerColor === 'b'} />
      </div>
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">{lesson.title}</h2>
          <p className="text-sm text-neutral-600">{lesson.theme}</p>
        </div>
        {s.phase !== 'finished' && (
          <HintButton disabled={s.phase !== 'userTurn'} hintText={s.hintText} streaming={s.streaming === 'hint'} onHint={(lv) => void s.requestHint(lv)} />
        )}
        {s.phase === 'finished' && s.result && (
          <SummaryCard outcome={s.result.outcome} reason={s.result.reason} summary={s.summary} streaming={s.streaming === 'summary'} onRestart={() => void s.restart()} onBack={onBack} />
        )}
        <CommentaryPanel intro={s.intro} rounds={s.rounds} streaming={s.streaming} llmError={s.llmError} />
      </div>
    </div>
  );
}
```

`src/App.tsx`:
```tsx
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LessonPage } from './pages/LessonPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/lesson/:id" element={<LessonPage />} />
      </Routes>
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: typecheck 与浏览器手动检查**

Run: `npm run typecheck && npm run dev`
Expected:
- 首页显示三栏 12 张卡片；设置按钮打开对话框，填入 URL/Key/模型后"测试连接"返回"连接成功"。
- 点开"意大利开局"：几秒内引擎加载完成，出现开场讲解流式文本，棋盘白方在下，状态"轮到你走"。
- 拖动 d2→d3：状态变"引擎思考中"，随后黑方应手、讲解流式出现，回合块带质量标签与角度标签。
- 拖动非法着法：棋子回弹，无变化。
- "提示思路"出文字且不含着法；"显示着法"棋盘出现蓝色箭头。
- 走满 8 步：出现 SummaryCard 与总结；返回首页卡片显示"已完成"或"干净完成"。
若 `react-chessboard` 类型报错（如 `onPieceDrop` 参数名不同），按 `.d.ts` 修正 Board.tsx。

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/components src/pages
git commit -m "feat: home, settings and lesson pages with board, commentary, hints and summary"
```

---

### Task 8: 端到端验收与调参

**Files:**
- Modify（按需）: `src/llm/prompts.ts`, `src/chess/quality.ts`, `src/engine/difficulty.ts`
- Create: `README.md`

- [ ] **Step 1: 按规格 §9 完整走一遍**

1. 设置页填真实 URL/Key/模型，测试连接成功。
2. 意大利开局：走 8 个回合，其中故意送一个子（如把象送到对方兵下）。核对：该步标签为"错误"或"严重失误"，讲解角度为"对比最佳着法"且先说错在哪；其余回合的 6 条讲解开头、结构、侧重各不相同，至少一条角度为"棋理"并解释了"为什么成立"。
3. Lucena：按 Rd4、Kc7 … Rb4 走到升变并杀王（或 eval ≥ +5），SummaryCard 显示"完成训练目标"。
4. Philidor（执黑）：棋盘黑方在下，用车沿第六横线等待，兵到 e6 后车回底线长将，走到 maxPlies 或和棋，结果为成功。
5. 把 API Key 改错：讲解区显示红色错误文本，棋盘仍可继续走子，引擎照常应手。
6. 断开网络后走一步：同上，引擎不受影响。

- [ ] **Step 2: 调参**

- 若讲解重复感仍强：把 `buildMoveMessages` 的 `recentCommentary` 截取长度从 80 提到 160，并把 `WEIGHTS.principle` 提到 4。
- 若"入门"难度仍太强：把 `beginner` 的 depth 降到 3、skillLevel 降到 1。
- 若正常开局着法频繁被判"不精确"：把 `classifyMove` 的 good 阈值从 -30 放宽到 -40。
每次修改后 `npm test` 必须通过。

- [ ] **Step 3: 写 README**

`README.md`（内容：项目简介一段；`npm install && npm run dev` 启动；设置页填写 OpenAI 兼容 Base URL / Key / 模型；课程如何新增：在 `src/lessons/data/<section>/` 加文件并在 `index.ts` 注册，`npm test` 会校验 FEN；棋理如何新增：`principles.ts` 追加条目并在课程里引用）。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: README and tuning after end-to-end verification"
```

---

## 自检记录

- 规格覆盖：架构（T1/T5/T6）、课程模型与 12 课（T2）、状态机与质量分级与结束判定（T3/T6）、hint 两级（T6/T7）、引擎两 worker 与难度（T5）、LLM 流式 + 讲解变化与原理（T4/T6）、UI（T7）、验证（T8）。
- 类型一致性：`Analysis.fen/lines/bestMove`、`EnginePort.analyze(fen, multiPv)`、`LlmPort.stream(messages, {temperature, signal})`、`Round` 字段、`chooseAngle` 参数、`judgeResult` 参数在 T3~T7 中保持一致。
- 已知需实施者核对的外部 API：`react-chessboard` v5 `options` 内字段名；`stockfish` 包内 lite-single 文件名（由脚本自动发现）。
