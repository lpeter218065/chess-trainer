# 性能与响应速度优化设计

## 目标

缩短三个用户能直接感受到的等待：课程页冷启动到可走子、走子后讲解首字出现、流式讲解期间的界面卡顿。同时为 iPad（引擎慢 2～4 倍、内存更紧）扫清障碍。功能行为不变。

## 依据（2026-09-05 实测与代码扫描）

Stockfish 18 lite 单线程，本机 M 系列，Node 环境：

| 场景 | 耗时 |
|---|---|
| analyst 深度 16 MultiPV 3，开局局面 | 620 ms |
| analyst 深度 16 MultiPV 3，中局局面 | 294 ms |
| analyst 深度 16 MultiPV 1（走子后评估） | 68 ms |
| 对手「中级」深度 12 | 13 ms |
| 对手「满力」深度 20 | 820 ms |

结论：引擎搜索不是主要瓶颈；主要瓶颈是启动链路串行等待、固定 500 ms 讲解防抖、流式期间整页重渲染、棋盘按 FEN 重挂载。提示词（system 约 1.6 KB）、对话线程截断、`max_completion_tokens`、SSE / UCI 解析均已足够轻，不在本次范围。

## 范围内的改动

### A. 课程页先渲染，引擎工作放后台

现状：`bootLessonSession`（`src/store/sessionInstance.ts`）内 `start()` 会等 `playUntilPlayerToMove → prepareTurn → analyze(depth 16, MultiPV 3)` 全部完成才返回，`LessonPage` 在此之前只显示「正在加载引擎…」。

改法：

- `bootLessonSession` / `switchLessonSession` / `newLessonSession` 在 `getSessionStore()` 返回后立刻 resolve store；`start()` / `hydrateSnapshot()` 以 `void track(...)` 方式在后台执行。store 的 `phase: 'preparing'` 与 `engineThinking` 已足以驱动现有 UI 的占位显示，不新增状态。
- 首次保存快照（`gs.saveLessonSnapshot(id, exported)`）改为在 `start()` 完成后于后台执行；已有的 400 ms 自动保存订阅会覆盖后续变化。
- `HomePage` 挂载后用 `requestIdleCallback`（不可用时 `setTimeout 0`）调用 `getEngine()` 预热两个 Worker。
- `index.html` 为引擎 `.wasm` 增加 `<link rel="preload" as="fetch" crossorigin>`，URL 由 `enginePath.generated.ts` 的生成脚本同时写入（脚本已生成 JS 路径，补一个 WASM 路径导出并让 `scripts/copy-engine.mjs` 注入 `index.html` 的占位标记）。

验收：课程页从路由进入到棋盘可见，不再等待任何引擎搜索；引擎尚未就绪时棋盘不可交互并显示现有 preparing 文案。

### B. 讲解防抖从 500 ms 降到 120 ms

现状：`LLM_DEBOUNCE_MS = 500`（`src/utils/debounce.ts`），课程讲解与局面判断都用它。流本身可 abort。

改法：`LLM_DEBOUNCE_MS = 120`。`ANALYZE_DEBOUNCE_MS = 350` 保留（切步回看需要吸收连按）。依赖该常量的测试同步调整。

验收：走子后讲解请求在 120 ms 内发出；快速连走两步只产生最后一次请求（现有 debouncer 测试覆盖）。

### C. 拆分订阅与组件记忆化，流式期间不整页重渲染

现状：`LessonPage` 与 `ExplorePage` 都 `useSession(store, (x) => x)` 订阅整个 store；`createStreamFlusher` 每 50 ms 写一次讲解文本，导致主棋盘、`EngineLinesPanel` 内 3 个 `MiniBoard`（各自一个完整 `Chessboard`）、`MoveList` 每秒重渲染 20 次；`resolveBoardAnnotations` 依赖整个 `s`。全项目无 `React.memo`。

改法：

- 流式文本字段（lesson：`rounds[i].commentary`、`intro`、`summary`、`hintText`、`assessment`、`followUps`；explore：`commentaries`、`assessment`、`followUps`）由讲解面板组件自行以细粒度 selector 订阅；页面组件不再直接读取这些字段。做法是把 `useSession(store, (x) => x)` 拆成若干 `useSession(store, selector)` 调用，selector 只返回原始值或引用稳定的对象，必要时用 zustand 的 `useShallow`。
- `Board`、`MiniBoard`、`PvLineCard`、`EngineLinesPanel`、`MoveList`、`AnnotationLegend` 用 `React.memo` 包装；传入的回调用 `useCallback` 固定，数组 / 对象 props 用 `useMemo` 固定。
- `resolveBoardAnnotations` 的依赖改为它真正读取的字段。
- `createStreamFlusher` 默认间隔 50 ms → 80 ms。

验收：在讲解流式输出期间，用 React Profiler 观察 `Board`、`MiniBoard`、`MoveList` 的 commit 次数为 0；讲解面板正常刷新。作为自动化下限，新增测试验证 `StreamText` 之外的组件在仅 `commentary` 变化时不重渲染（用 render 计数的探针组件）。

### D. 去掉主棋盘的 `key={viewed.fen}`

现状：`src/pages/LessonPage.tsx:383` 每次局面变化都销毁并重建整个 `Chessboard`。`ExplorePage` 没有这个 key 且工作正常。

改法：删除该 `key`。`Board` 内 `options` 已按 `fen` 记忆化，react-chessboard 会按 `position` 更新。

验收：走子后棋盘 DOM 节点不被替换（Profiler 中 `Board` 为 update 而非 mount）；提示箭头、最后一步高亮、注释箭头在走子后仍正确切换。

### E. 自由探索允许分析中走子，着法先上盘

现状（`src/store/explore.ts` 的 `makeMove`）：

- 开头 `if (s0.analyzing) return false`，`ExplorePage` 也传 `interactive={!s.analyzing}`，分析期间的点击全部丢弃；iPad 上分析 1～2 秒，几乎每次快速走子都被吞。
- 着法要等「走子后评估」`analyze(depth 16, MultiPV 1)` 返回后才写入树、才显示。

改法：

- 移除 `analyzing` 门禁；`Board.interactive` 只取决于是否在回看等原有条件。
- `makeMove` 顺序改为：1）合法性校验；2）立刻把着法写入树、更新 `path`、`analysis: null`、`evalCp` 暂保留旧值，质量暂为 `null`；3）后台并行执行「走子后评估」与「新局面深度 16 MultiPV 3 分析」，都通过现有 `analyzeToken` 机制在局面再次变化时废弃；4）评估返回后用 `setNodeQuality` 补写质量与 `evalCp`。
- `MoveTree` 节点的 `quality` 类型允许 `null`（已存在的树可能需要兼容读取；`qualities` 数组本来就允许 `null`）。
- 走子前若 `analysis.fen !== fen`（回看后走子），仍需要一份走子前分析来判定质量：改为在后台补算，而不是阻塞上盘。补算路径：先分析走子前局面（用于 `bestMove` 与 `evalBefore`），再评估走子后局面，最后补写质量。

验收：分析进行中点击走子立即上盘；质量标签在评估完成后出现；连续快速走三步，树与 path 正确，只有最后一个局面得到 MultiPV 分析。

### F. 引擎搜索封顶与省一次搜索

- `StockfishEngine.analyze` 与 `bestMove` 的 `go depth N` 改为 `go depth N movetime M`，两者先到为止。`ANALYSIS_DEPTH = 16` 配 `movetime 1500`；对手各档位在 `Difficulty` 上新增 `moveTimeMs`（入门 / 初级 / 中级 800，高级 1500，满力 3000）。UCI 解析不变。
- `playUserMove`（lesson）与 `makeMove`（explore）在用户着法等于 `analysisBefore.lines[i].pv[0]` 时，直接取该线的 `score` 作为走子后评估，跳过一次搜索。分数换算沿用 `playerCp` / `whiteEval` 的现有约定（注意 MultiPV 分数是走子前一方视角，需取反）。此逻辑抽成纯函数 `evalAfterFromLines(analysis, userUci): number | null` 放 `src/chess/quality.ts` 或相邻模块，单测覆盖三条线命中、未命中、mate 分数。

验收：单测通过；开局局面深度 16 分析在 1.5 s 内返回（movetime 生效时 `depth` 字段可能小于 16，UI 不显示深度，无影响）。

### G. 首屏包与字体

- `index.css` 去掉 Google Fonts 的 `@import`；`--font-sans` / `--font-display` 改为系统字体栈（`ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Noto Sans CJK SC", sans-serif` 与 `ui-serif, Georgia, "Songti SC", serif`）。这也消除了 Capacitor 离线时的外部请求。若之后要恢复 Newsreader / Source Sans 3，改为自托管 woff2 并 `font-display: swap`，不在本次范围。
- `App.tsx` 用 `React.lazy` 按路由拆分：`LessonPage`、`ExplorePage`、`OpeningDrillPage`、`AnalysesPage` 各一个 chunk；`HomePage` 留在主 chunk。`Suspense` 占位沿用现有「正在准备课程…」样式。
- 课程数据（`src/lessons/data/**`）与 `openingBook` 只被课程页与探索页引用；拆分后自然离开首屏 chunk，不需要额外动态 import。

验收：`npm run build` 后首屏 JS chunk 小于 250 KB（未压缩）；首页不加载 react-chessboard 与 chess.js（在 Network 面板确认）。

### H. 会话持久化只写变化的会话

现状：`useGameSessions` 的 `persist` 把所有会话（`metas` / `exploreData` / `lessonData`）整体 `JSON.stringify` 写入一个 localStorage key；会话越多每次保存越慢。

改法：`persist` 的 `partialize` 只保留 `metas` 与 `activeExploreId` / `activeLessonId`；快照数据改为每个会话一个 key（`chess-trainer-session:<id>`），由 `saveLessonSnapshot` / `saveExploreSnapshot` / 删除会话时直接读写，通过一个小的 `snapshotStorage` 模块封装（`get(id)` / `set(id, snap)` / `remove(id)`）。`getLessonSnapshot` / `getExploreSnapshot` 改为从该模块读取并做内存缓存。首次运行时把旧 key 里的 `exploreData` / `lessonData` 迁移到新 key 后清空。

这一项与 iPad spec 第二期的平台存储适配器共用同一个 `snapshotStorage` 接口：本次实现 localStorage 版本，iPad 期替换为 Filesystem 版本。

验收：`tests/gameSessions.test.ts` 新增：保存会话 A 不会重写会话 B 的 key；迁移后旧 key 不再包含快照数据；列表、切换、删除行为不变。

## 不在范围内

- 提示词、对话线程、`reasoning_effort` 策略
- 引擎改多线程构建（需要 COOP/COEP，与 Capacitor 与静态托管冲突）
- 两个 Worker 合并为一个
- 暗色模式、布局改动（见 iPad spec）

## 实施顺序

D → B → A → C → F → E → G → H。D、B 是一行改动；A、C 收益最大；E 依赖 C 里的订阅拆分（否则质量补写会再次触发整页重渲染）；G、H 独立。

## 测试与验证

- 现有 `vitest` 全量通过。
- 新增：`evalAfterFromLines` 单测；`StreamText` 之外组件在讲解变化时不重渲染的探针测试；`snapshotStorage` 与迁移测试；explore `makeMove` 乐观上盘与质量补写的 store 测试（用现有的假引擎 / 假 LLM）。
- 手工：Chrome DevTools Performance 录制一次完整回合，确认流式期间没有每 50 ms 一次的长 commit；`npm run build` 观察 chunk 体积。
