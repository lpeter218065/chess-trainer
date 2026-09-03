# 国际象棋训练软件 —— 设计与实施计划

## Context

目标：做一个国际象棋训练 Web 应用。用户从**特定局面**（而不是初始局面）开始，与引擎对弈若干步，围绕一个明确主题（某开局体系 / 某中局题材 / 某残局技术）进行训练。每一步都有自然语言讲解，随时可以要 hint。

已确认的决定：

| 决定 | 结论 |
|---|---|
| 运行形态 | 纯浏览器 SPA，无后端 |
| 内容来源 | 仓库内置预编课程库（JSON/TS） |
| 用户体系 | 单用户，进度和设置存 localStorage |
| 引擎 vs 大模型 | Stockfish 走棋 + 评估；GPT 只讲解、给 hint、做总结 |
| 技术栈 | React + TypeScript + Vite |
| 语言 | 中文 UI，中文讲解，着法用标准代数记谱 |
| 难度 | 可调档位（Stockfish Skill Level + 限深） |
| GPT 接入 | 用户在设置页填 OpenAI 兼容的 Base URL + API Key + 模型名，默认 stream |

`/Users/xu/projects/chess` 目前是空目录，不是 git 仓库。第一步会 `git init`。

---

## 1. 整体架构

```
┌────────────────────────────────────────────────────────────┐
│  React UI (Vite)                                            │
│  LessonList → LessonPage(Board / Commentary / Hint / Eval)  │
├───────────────┬─────────────────────┬──────────────────────┤
│ chess.js      │ EngineService       │ LlmService            │
│ 规则/合法着法  │ 2× Stockfish WASM   │ OpenAI 兼容 SSE 流     │
│ SAN/FEN       │ Web Worker (UCI)    │ 直连用户填的 URL       │
│               │  - opponent(限力)   │ prompt 由引擎数据 grounding │
│               │  - analyst(满力 MultiPV)│                   │
├───────────────┴─────────────────────┴──────────────────────┤
│ Zustand store: session / settings / progress (persist)      │
├────────────────────────────────────────────────────────────┤
│ lessons/  内置课程数据（开局 / 中局 / 残局）                   │
└────────────────────────────────────────────────────────────┘
```

**关键设计原则：GPT 永远不自己"算棋"。** 每次讲解请求都附带引擎给出的评估值、最佳线路（已转成 SAN）、用户着法的质量分级，并在 system prompt 里明确要求"只解释给定的线路，不要自创着法"。这样讲解可读又不会说出非法/离谱的招。

### 为什么两个引擎实例
- **opponent worker**：`Skill Level` + `depth` 限制，产生符合难度的对手着法。
- **analyst worker**：满力、`MultiPV 3`、固定深度（约 16~18，单线程 lite NNUE 约 1~2 秒），用于：评估用户每一步、生成 hint 的最佳着法、给 GPT 提供 grounding 数据。
两个 worker 互不阻塞，用户走完棋后 analyst 和 opponent 可并行跑。

### Stockfish WASM 选择
使用 npm `stockfish` 包的 **单线程 lite NNUE 构建**（不需要 COOP/COEP 头，任何静态托管都能跑）。多线程版需要跨源隔离头，留作后续优化。实施时先在 `node_modules/stockfish/src/` 里确认可用文件名并把 `.js` + `.wasm` 复制到 `public/engine/`。

### GPT 直连的 CORS 风险
OpenAI 官方 API 允许浏览器直连。若用户填的第三方兼容服务不允许 CORS，请求会失败。第一版：在设置页做一个"测试连接"按钮并在失败时提示 CORS 原因。后续可选加一个几十行的本地代理，不在本期范围。

---

## 2. 课程数据模型 (`src/lessons/schema.ts`)

```ts
type Section = 'opening' | 'middlegame' | 'endgame';

interface Lesson {
  id: string;                 // 'opening/italian-game'
  section: Section;
  title: string;              // '意大利开局：基本结构'
  summary: string;            // 列表页一句话
  startFen: string;
  playerColor: 'w' | 'b';
  // 给 GPT 的教学上下文
  theme: string;              // 本课要训练什么（2~4 句）
  keyIdeas: string[];         // 关键思路要点，GPT 讲解时围绕这些
  principleIds: string[];     // 本课重点棋理，引用 principles.ts（见 §5）
  modelLine?: string[];       // 可选：示范主线 SAN 数组，用于开局课对照
  // 结束与判定
  stop: { kind: 'plies'; count: number }          // 开局/中局：用户走 N 步后结束
      | { kind: 'gameOver'; maxPlies: number };   // 残局：分出结果或到上限
  target: 'win' | 'draw' | 'hold';                // hold = 评估不掉到阈值以下
  evalFloor?: number;         // hold 用：以己方视角 cp，默认 -100
  tags?: string[];
}
```

**校验测试**（vitest）：所有 lesson 的 `startFen` 能被 chess.js 加载；`modelLine` 每步合法；`id` 唯一；`playerColor` 与 FEN 中的行棋方一致。

### 第一批课程（12 课，每部分 4 课）
- 开局：意大利开局、西西里防御（开放型）基本结构、后翼弃兵拒吃、伦敦体系
- 中局：孤立后兵（IQP）的进攻、少数兵进攻、开放线上的车、异侧易位互攻
- 残局：王兵对王（对王/关键格）、Lucena 位置、Philidor 位置、王车对王杀王

每课文件 `src/lessons/data/<section>/<id>.ts`，`src/lessons/index.ts` 汇总导出。

---

## 3. 对弈会话状态机 (`src/store/session.ts`)

```
idle → intro(GPT流式开场讲解) → userTurn
userTurn --用户走子--> analyzing(analyst评估该步 + opponent算应手，并行)
analyzing → commentary(GPT流式讲解: 用户这步 + 引擎应手)   // 引擎着法在讲解开始时就落子
commentary → userTurn | finished(达到stop条件)
finished → summary(GPT流式总结)
任意 userTurn 状态可触发 hint（不改变主状态）
```

- 讲解一次覆盖一回合（用户步 + 引擎步），把 GPT 调用次数减半。
- 讲解流式输出时用户**已经**可以走下一步（不阻塞），走了就中断当前流（AbortController）。
- 用户步质量分级（analyst 结果）：以己方视角 cp 差值 `Δ = evalAfter - evalBefore`：
  - best（用户走的就是 PV1）/ good（Δ ≥ -30）/ inaccuracy（-30 > Δ ≥ -90）/ mistake（-90 > Δ ≥ -200）/ blunder（Δ < -200）；mate 分数按 ±10000 处理。
  - 分级结果也传给 GPT，让它的语气与之匹配，并驱动 UI 标记颜色。

### Hint 两级
1. **文字提示**：把 analyst PV1~3 给 GPT，要求"用一句话点出思路，不说出具体着法"。
2. **显示着法**：直接在棋盘上画 PV1 箭头（不调 GPT）。
两级都会记录，进影响本课成绩（用了 hint 就不算"干净完成"）。

### 结束判定
- `plies`：用户走满 N 步 → finished。
- `gameOver`：chess.js `isGameOver()` 或到 `maxPlies`。
- 成绩：`target=win` 要求实际获胜或结束时 eval ≥ +500；`draw` 要求和棋或 |eval| ≤ 50；`hold` 要求全程 eval ≥ evalFloor 且无 blunder。写入 progress：`{lessonId: {completed, clean, bestResult, attempts, lastPlayedAt}}`。

---

## 4. 引擎层 (`src/engine/`)

- `stockfishWorker.ts`：封装 `new Worker('/engine/stockfish.js')`，UCI 文本协议 → Promise API：
  - `init()`（`uci`/`isready`），`setOption(name, value)`，`newGame()`
  - `analyze(fen, {depth, multiPv}) → {lines: [{pv: string[] (UCI), scoreCp|mate, depth}], bestMove}`
  - `bestMove(fen, {depth, skillLevel}) → string`
  - 内部串行化命令、解析 `info ... multipv N score cp X pv ...` 与 `bestmove`。
- `uciParser.ts`：纯函数解析 info 行（单元测试重点）。
- `difficulty.ts`：档位表，例如 入门(Skill 3, depth 5) / 初级(Skill 8, depth 8) / 中级(Skill 14, depth 12) / 高级(Skill 20, depth 16) / 满力(depth 20)。
- `src/chess/notation.ts`：UCI PV → SAN 数组（用 chess.js 在临时棋盘上逐步 move），评分格式化（`+0.35` / `M3`），视角翻转。

---

## 5. 大模型层 (`src/llm/`)

- `client.ts`：`streamChat({baseUrl, apiKey, model, messages, signal}) → AsyncIterable<string>`。POST `${baseUrl}/chat/completions`，`stream: true`，解析 SSE `data:` 行，`[DONE]` 结束；非 2xx 抛带状态码和 body 的错误。`sseParser.ts` 纯函数，可测。
- `prompts.ts`：四个 builder，输入结构化数据、输出 messages：
  - `introPrompt(lesson)`：开场讲主题、这局面里双方计划，并点出本课背后的 1~2 条棋理。
  - `movePrompt(ctx)`：ctx = {lesson, fen, moveHistorySan, userMoveSan, quality, evalBefore, evalAfter, bestLinesSan, engineReplySan, **angle, principles, recentCommentary**}。要求 4~7 句，结构不固定，见下"讲解的变化与原理"。
  - `hintPrompt(ctx)`：只给思路不说着法，优先用原理引导（"这个局面里哪一方的子力还没参战？"）。
  - `summaryPrompt(ctx)`：全局回顾 + 与 keyIdeas 对照 + 归纳本局体现了哪些棋理 + 下次注意。
  - 统一 system prompt：中文；只引用提供的线路；着法一律 SAN；不评价引擎评分以外的胜负；**避免与最近几条讲解重复措辞和句式**。

### 讲解的变化与原理（重点需求）

讲解不能每步都是"你这步不错 → 引擎走了 X → 注意 Y"的同一模板。两个机制保证变化和深度：

**1. 原理库 `src/lessons/principles.ts`**
一组结构化的棋理条目，例如：
```ts
interface Principle {
  id: string;            // 'center-control'
  name: string;          // '中心控制'
  phase: Section[];      // 适用阶段
  statement: string;     // 一两句正式表述
  why: string;           // 为什么成立（子力活动范围、空间、转换能力……）
  exceptions?: string;   // 什么时候不成立
  triggers: Trigger[];   // 由局面特征自动匹配，见下
}
```
首批约 25~30 条，覆盖：中心控制、子力出动顺序、王的安全与易位时机、开放线与车、弱格与前哨、孤兵/叠兵/落后兵、兵链与进攻方向、双象 vs 双马、好象坏象、少数兵进攻、子力交换的原则（进攻方避免交换、有优势时简化）、主动权与节奏、对王/关键格/三角步法、车残局"车在兵后"、Lucena 搭桥、Philidor 第六横线防御、把对方逼入 zugzwang、防守时的活动性等。

每课 `Lesson` 增加 `principleIds: string[]`，指明本课重点棋理；此外 `chess/features.ts` 从 FEN 提取局面特征（孤兵、开放线、双象、王是否易位、兵结构是否锁死、子力数量与阶段等），`triggers` 与特征匹配后可以附加**局面里临时冒出来的**原理（比如用户忽然换掉了对方的坏象，就该讲"好象坏象"）。

**2. 讲解角度轮换 `llm/angles.ts`**
每回合从一组角度中选一个作为本次讲解的"主视角"，传给 GPT：
- `tactics` 战术：有没有威胁、牵制、双击，为什么这步安全或不安全
- `plan` 计划：这步服务于什么中期计划，与主题的关系
- `structure` 兵形：这步对兵结构的长远影响
- `pieces` 子力：哪个子变好/变坏，交换的得失
- `king` 王安全：与进攻/防守王有关的判断
- `compare` 对比：为什么最佳着法比用户走的好（只在 inaccuracy 以下时用）
- `principle` 原理讲解：花两三句专门讲一条棋理，为什么成立，什么时候例外
- `history` 典型例子：这个局面或结构在著名对局/开局理论里的地位（要求 GPT 只说有把握的）

选择规则：用户走出 blunder/mistake → 强制 `compare`；引擎评估剧变 → `tactics`；否则按权重随机但不连续两回合同角度；每 3~4 回合至少出现一次 `principle`。角度、最近 3 条讲解摘要一起放进 prompt，让 GPT 知道"前面刚讲过孤兵，这次换别的说"。

**3. 篇幅与语气**
- 句数在 4~7 之间浮动；用户走得好时讲解可以更短、把篇幅留给原理；走错时先讲错在哪。
- 允许用一个反问或一个具体变化（引擎给的 PV，≤ 4 步）来说明，不要每条都"总—分—总"。
- temperature 默认 0.8（讲解允许一定发散），hint 和 summary 用 0.5。
- 设置持久化：`{baseUrl, apiKey, model, temperature}` 存 localStorage（明文，页面上提示"仅存于本机浏览器"）。

---

## 6. UI (`src/components/`, `src/pages/`)

- `HomePage`：三栏（开局 / 中局 / 残局）课程卡片，显示完成状态与是否干净完成；右上角设置入口。
- `LessonPage`：
  - 左：`Board`（react-chessboard，`position=fen`，`onPieceDrop` 经 chess.js 校验，箭头用于 hint/最佳着法），下方 `EvalBar` + 难度显示。
  - 右：`CommentaryPanel`（按回合分块，流式追加，用户步质量彩色标签），`MoveList`（SAN，点击可回看局面，只读），`HintButton`（两级），`Controls`（重开 / 换难度 / 返回）。
  - 结束后 `SummaryCard`。
- `SettingsDialog`：Base URL、API Key、模型名、"测试连接"、默认难度。
- 路由：react-router（`/`、`/lesson/:id`）。
- 样式：Tailwind，简洁即可；第一版不追求视觉设计。

---

## 7. 目录结构

```
chess/
  package.json  vite.config.ts  tsconfig.json  index.html
  public/engine/stockfish*.js|wasm
  src/
    main.tsx  App.tsx  router.tsx
    engine/   stockfishWorker.ts  uciParser.ts  difficulty.ts  engineService.ts
    chess/    notation.ts  quality.ts  result.ts  features.ts
    llm/      client.ts  sseParser.ts  prompts.ts  angles.ts
    lessons/  schema.ts  index.ts  principles.ts  data/{opening,middlegame,endgame}/*.ts
    store/    session.ts  settings.ts  progress.ts
    components/  Board  EvalBar  CommentaryPanel  MoveList  HintButton  SettingsDialog  LessonCard
    pages/    HomePage.tsx  LessonPage.tsx
  tests/  (vitest：uciParser、sseParser、notation、quality、result、lessons 校验、prompts 快照)
  docs/superpowers/specs/2026-09-03-chess-trainer-design.md  (本设计落盘)
```

依赖：`react react-dom react-router-dom zustand chess.js react-chessboard stockfish tailwindcss`；开发：`vite typescript vitest @testing-library/react`。实施时把 `react-chessboard` 版本锁定并按其当前 API 写（v4 与 v5 的 props 差异大）。

---

## 8. 实施顺序（每步可独立验证）

1. `git init` + Vite React-TS 脚手架 + Tailwind + vitest；写设计文档到 `docs/superpowers/specs/`。
2. 课程 schema + 原理库 `principles.ts`（25~30 条）+ 12 课数据（含 principleIds）+ 校验测试（FEN 合法、principleIds 都存在）。
3. `chess/notation.ts`、`quality.ts`、`result.ts`、`features.ts`（局面特征提取）纯函数 + 测试。
4. `llm/sseParser.ts` + `client.ts` + `angles.ts`（角度选择规则）+ `prompts.ts` + 测试（mock fetch；角度选择：blunder 必为 compare、不连续重复、每 4 回合内有 principle）。
5. 引擎：复制 WASM 到 `public/engine/`，`uciParser.ts` + 测试，`stockfishWorker.ts`，浏览器里手动确认 `analyze` 与 `bestMove` 能返回。
6. Zustand store 三个 slice + 会话状态机（先用 mock engine/llm 跑单元测试）。
7. UI：HomePage、SettingsDialog、LessonPage（Board + Commentary + Hint + MoveList + Summary）。
8. 端到端手动走一课开局、一课残局；调 prompt 与阈值。

---

## 9. 验证方式

- `npm test`：所有纯函数、课程数据校验、状态机（mock 引擎与 LLM）通过。
- `npm run dev` 手动流程：
  1. 设置页填 URL/Key/模型 → 测试连接返回成功（stream 收到第一个 token）。
  2. 打开"意大利开局"：开场讲解流式出现；走 `Nf3` 类合理步得 good/best 标签，故意送子得 blunder 标签并有相应讲解；引擎在 2 秒内应手。
  3. 点 hint 一级出文字不含具体着法，二级棋盘出箭头。
  3a. 连续走 6 个回合，讲解面板里的 6 条讲解句式、开头、侧重点各不相同，其中至少一条专门讲了一条棋理（为什么成立 / 何时例外）；故意送子后那条讲解先讲错在哪并给出更好的着法。
  4. 走满 N 步进入总结；返回首页该课显示已完成。
  5. 打开"Lucena 位置"走到升变/杀王，判定为 win。
  6. 断网或填错 Key：讲解区显示错误而不是卡住，对弈仍可继续。
