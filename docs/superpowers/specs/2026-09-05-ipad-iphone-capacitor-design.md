# iPad / iPhone 原生化设计（Capacitor）

## 目标

把现有的国际象棋训练 Web SPA 装进 iPad 和 iPhone，以原生 App 形态通过 TestFlight / App Store 分发。同一套 React 代码同时服务 web 与 iOS；web 端行为不变。

## 已确认的决定

| 决定 | 结论 |
|---|---|
| 分发方式 | Capacitor 打包成原生 iOS App，上 TestFlight / App Store |
| LLM Key | BYOK：用户在设置页填 Base URL / Key / 模型；Key 存 iOS Keychain；无后端 |
| 设备范围 | iPad + iPhone 通用 App |
| 许可 | Stockfish 为 GPLv3，App 整体按 GPLv3 开源，App 内提供开源许可页 |
| 引擎 | 继续用 `stockfish` 包的单线程 lite WASM 构建，两个 Worker（analyst / opponent）不变 |
| 讲解 | 继续浏览器 `fetch` + SSE 流式直连；没配 Key 时 App 其余功能完整可用 |

## 非目标（本期不做）

- PWA / Service Worker（Capacitor 壳已提供离线与全屏，PWA 无增量价值）
- 自建 LLM 代理、账号体系、计费
- Android
- 暗色模式、Apple Pencil 画箭头、触觉反馈
- 会话导出到「文件」App / iCloud 同步
- 把 Key 打进构建产物：生产构建不再读取 `VITE_LLM_API_KEY`

## 现状与阻碍点

现有代码在 iOS WKWebView 中可以直接运行：单线程 WASM 不需要 SharedArrayBuffer / COOP 头；`fetch` 流式读取 iOS 14.5+ 可用；zustand `persist` 已把 settings / progress / gameSessions 落到 localStorage。需要改的只有四类：

1. **走子只支持拖拽**（`src/components/Board.tsx` 只接 `onPieceDrop`），触屏需要点选走子。
2. **讲解高亮靠鼠标 hover**（`AnnotatedCommentary` 用 `onMouseEnter/Leave` 驱动 `hoverFocus`），触屏没有 hover。
3. **布局只有一个 `lg:` 断点**（LessonPage / ExplorePage 各自写了 `lg:grid-cols-[...]`），iPad 竖屏与 iPhone 会退化成不受控的单列长页。
4. **持久化与 Key 直接依赖 localStorage / 环境变量**，上架后需要 Keychain 与更可靠的存储，并且 `BrowserRouter` 在 Capacitor 本地 scheme 下刷新深层路径会失败。

## 总体架构

```
src/
├─ platform/                 ← 新增：唯一感知运行环境的模块
│   ├─ index.ts              isNative()、hasHover()、useViewportClass()
│   ├─ storage.ts            createPlatformStorage(kind: 'small' | 'large'): StateStorage
│   └─ secureStore.ts        getApiKey() / setApiKey() / clearApiKey()
├─ components/layout/
│   └─ TrainerLayout.tsx     ← 新增：三档响应式骨架，LessonPage 与 ExplorePage 共用
├─ chess / engine / llm / lessons / store   ← 逻辑层不动
└─ pages/LicensesPage.tsx    ← 新增：开源许可页

capacitor.config.ts          webDir: 'dist'
ios/                         Xcode 工程，提交进仓库（Pods/ 与 DerivedData 不提交）
```

构建链：`npm run build` → `npx cap sync ios` → Xcode Archive → TestFlight。

### 环境判定

- `isNative()`：`Capacitor.isNativePlatform()`；web 端为 false。
- `hasHover()`：`matchMedia('(hover: hover) and (pointer: fine)').matches`，用于决定讲解高亮走 hover 还是 tap。
- `useViewportClass()`：按 `window.innerWidth` 返回 `'compact' | 'medium' | 'wide'`，监听 `resize` 与 `orientationchange`。阈值：`< 700` compact，`700–1023` medium，`≥ 1024` wide。

### 路由

`BrowserRouter` 改为 `HashRouter`。Capacitor 从 `capacitor://localhost` 加载 `index.html`，深层路径（如 `/lesson/xxx`）在冷启动或 WebView 被系统回收后重建时拿不到 `index.html`；hash 路由在 web 与原生行为一致。所有 `Link` / `navigate` 调用不需要改动。

---

## 第一期：触屏与响应式（纯 web 改动）

验收环境：iPad Safari（横/竖屏、Split View 半屏）、iPhone Safari、桌面浏览器回归。

### 1.1 点选走子

在 `Board` 内新增 tap 模式，与拖拽并存。状态机抽成纯函数，放 `src/chess/tapMove.ts`：

```ts
interface TapState { selected: string | null; targets: string[] }

type TapResult =
  | { kind: 'select'; state: TapState }
  | { kind: 'clear'; state: TapState }
  | { kind: 'move'; from: string; to: string; state: TapState };

function tapMoveReducer(
  state: TapState,
  square: string,
  legalMoves: { from: string; to: string }[],  // 当前走棋方的全部合法着法
  ownPieceSquares: Set<string>,                  // 当前走棋方棋子所在格
): TapResult;
```

规则：

| 当前状态 | 点击 | 结果 |
|---|---|---|
| 未选中 | 己方子 | select，targets = 该子的合法落点 |
| 未选中 | 其他格 | clear（无操作） |
| 已选中 | targets 中的格 | move |
| 已选中 | 另一己方子 | select 换选 |
| 已选中 | 同一格 / 其他格 | clear |

`Board` 接 react-chessboard 的 `onSquareClick` 与 `onPieceClick`，调用 reducer；`move` 结果走现有 `onMove`，升变沿用现在的自动升后（找到该着法的 `promotion` 时传 `'q'`）。拖拽开始时清空 tap 状态。选中格与落点用 `squareStyles` 叠加：选中格实色高亮，落点画圆点（通过 `radial-gradient` 背景实现，不引入新依赖）。`interactive === false` 时 tap 无效。

### 1.2 讲解高亮：hover + tap 双通道

`AnnotatedCommentary` 增加 `focusMode: 'hover' | 'tap'`，由调用方用 `hasHover()` 决定：

- `hover`：现有行为不变。
- `tap`：点一条标记 → `onFocus(focus)` 并置为 sticky；再点同一条或点棋盘任意处 → `onFocus(null)`。sticky 的那一条加边框高亮，让用户知道当前棋盘高亮来自哪里。

LessonPage / ExplorePage 现有的 `hoverFocus` state 与 `Board.hoverFocus` 属性沿用，只是来源多了一种。棋盘点击清空 sticky 由 `Board` 的 `onSquareClick` 顺带触发一个 `onBackgroundTap` 回调。

### 1.3 三档布局：`TrainerLayout`

新组件接收固定插槽，LessonPage 与 ExplorePage 都改为往里填内容，删除各自手写的 `lg:grid-cols-[...]`：

```ts
interface TrainerLayoutProps {
  header: ReactNode;                // 顶部工具条（返回、标题、设置等）
  board: ReactNode;                 // Board 组件
  leftPanel?: ReactNode;            // 候选着法 / 棋谱树（showCandidates 时才有）
  panels: { id: string; label: string; content: ReactNode }[]; // 讲解 / 棋谱 / 引擎线路 …
  footer?: ReactNode;               // 追问输入框
}
```

| 档位 | 触发 | 布局 |
|---|---|---|
| wide | ≥ 1024（iPad 横屏、桌面） | 保持现有两栏 / 三栏网格：leftPanel（可选）｜board｜panels 全部竖排在右栏 |
| medium | 700–1023（iPad 竖屏、Split View 半屏） | 上下两行。上行：board 占 55% 宽，右侧是 leftPanel（无则 board 居中，边长取 min(宽×0.6, 高×0.55)）。下行：panels 用分段控件切换，一次只显示一个；footer 固定在下行底部 |
| compact | < 700（iPhone） | 单列。board 满宽置顶，边长 = min(屏宽, 可用高度 − 面板最小高度 240px)。下方分段控件切换 panels（leftPanel 作为第一个标签并入）。footer 固定屏幕底部，位于 safe-area 之上 |

分段控件的当前标签用 `sessionStorage` 记住（每页面一个 key），切换布局档位时保留。

### 1.4 iOS 触屏细节

- `index.html`：`viewport` 加 `viewport-fit=cover`。键盘遮挡：web 端依赖 Safari 自动把聚焦的输入框滚入视口，footer 用 `position: sticky` 放在滚动流内而不是 `fixed`；原生端由第二期的 Keyboard 插件默认 `resize: 'native'` 缩小 WebView。
- 全局 CSS：`body { padding: env(safe-area-inset-*) }` 由 `TrainerLayout` 与 HomePage 各自消费；棋盘容器 `touch-action: manipulation; -webkit-user-select: none; -webkit-touch-callout: none`，禁止双击缩放与长按弹菜单。
- 所有可点击控件最小尺寸 44×44pt。MoveList、EngineLinesPanel 的行高在 compact / medium 下放大到 36px 以上。
- 现有 `hover:` Tailwind 类不影响触屏，无需批量删除。

### 1.5 测试

- `tests/tapMove.test.ts`：覆盖上表五种转移、升变着法、`interactive=false`。
- `tests/viewport.test.ts`：`classifyViewport(width)` 边界值 699 / 700 / 1023 / 1024。
- `tests/annotatedCommentary.test.tsx`（如仓库已有组件测试基础则加；否则把 sticky 切换逻辑抽成纯函数 `toggleFocus(current, next)` 单测）。
- 手工清单：iPad 竖屏 / 横屏旋转不丢状态；Split View 1/2 与 1/3；iPhone 键盘弹出时追问框可见；拖拽与点选交替使用。

---

## 第二期：Capacitor 壳、平台存储、Keychain

### 2.1 Capacitor 接入

- 依赖：`@capacitor/core`、`@capacitor/cli`、`@capacitor/ios`、`@capacitor/preferences`、`@capacitor/filesystem`、`@capacitor/app`、`@capacitor/keyboard`、`@capacitor/status-bar`，以及一个 Keychain 插件（`@aparajita/capacitor-secure-storage` 或等价维护中的库，实施时以 npm 上仍在维护为准）。均取当前稳定版（Capacitor ≥ 7）。
- `capacitor.config.ts`：`appId`、`appName: '国际象棋训练'`、`webDir: 'dist'`、`ios.contentInset: 'never'`（safe-area 由 CSS 处理）、`plugins.Keyboard.resize: 'native'`（默认值，键盘弹出时缩小 WebView，footer 随之上移）。
- `package.json` 新增脚本：`ios:sync`（`npm run build && npx cap sync ios`）、`ios:open`（`npx cap open ios`）。
- `.gitignore` 加 `ios/App/Pods/`、`ios/App/build/`、`ios/DerivedData/`。
- 引擎文件位于 `public/engine/`，构建后进入 `dist/engine/`，Capacitor 原样打包；`ENGINE_JS_URL` 是绝对路径 `/engine/...`，在 `capacitor://localhost` 下可解析，无需改动。

### 2.2 平台存储适配器

`src/platform/storage.ts` 导出：

```ts
function createPlatformStorage(kind: 'small' | 'large'): StateStorage; // zustand 的 StateStorage（可异步）
```

| 环境 | small（settings、progress） | large（gameSessions） |
|---|---|---|
| web | `localStorage` | `localStorage` |
| native | `@capacitor/preferences`（UserDefaults） | `@capacitor/filesystem`，`Directory.Data` 下每个 store 一个 JSON 文件 |
| 测试 / SSR | 现有 `memoryStorage()` | 同左 |

三个 store 的 `persist` 配置改为 `storage: createJSONStorage(() => createPlatformStorage(kind))`。key 名（`chess-trainer-settings` 等）不变。

原生端存储为异步，因此：

- `App.tsx` 根部加 `HydrationGate`：用三个 store 的 `persist.onFinishHydration` 等待全部完成后再渲染 `Routes`，期间显示与现在「引擎加载中」一致的极简占位。web 端 localStorage 同步 hydrate，Gate 立即放行，行为不变。
- gameSessions 已有 400ms 防抖写入；native 下 Filesystem 写文件是整文件覆盖，保持防抖即可。

### 2.3 API Key 与 Keychain

- `settings` store 的 `persist` 增加 `partialize`，排除 `llm.apiKey`。
- `src/platform/secureStore.ts`：native 走 Keychain 插件；web 走 `localStorage` 单独 key `chess-trainer-api-key`（web 行为与现在等价）。
- 启动时 `HydrationGate` 同时读取 Key 并 `setLlm({ apiKey })`；`setLlm` 收到 `apiKey` 变化时写回 secureStore。
- 环境变量：`envLlm()` 中的 `VITE_LLM_API_KEY` 只在 `import.meta.env.DEV` 时读取；生产构建里 Key 恒为空。Base URL / 模型的环境默认值保留。现有 `merge` 里「有 env Key 时 env 优先」的逻辑随之只在 dev 生效。
- 设置页增加「测试连接」按钮：向 `${baseUrl}/models` 发一次 GET；按结果分三种提示：成功、HTTP 错误（沿用 `formatLlmHttpError`）、网络 / CORS 失败（提示「该服务不允许从 App 内直连，请换支持跨域的服务或官方接口」）。

### 2.4 生命周期

- 监听 `@capacitor/app` 的 `appStateChange`：切到后台时立即 flush gameSessions 的防抖写入（gameSessions store 暴露 `flushPendingSave()`）。
- WebView 被系统回收后重建：现有「刷新即恢复活动会话、引擎分析重算」逻辑已覆盖；HashRouter 保证路由能恢复。
- 引擎 Worker 在后台被挂起属正常现象，前台恢复后 UCI 队列继续；不做额外处理。

### 2.5 测试

- `tests/platformStorage.test.ts`：用假的 Preferences / Filesystem 实现，验证 small / large 读写、缺失 key 返回 null、JSON 往返。
- `tests/secureStore.test.ts`：web 路径读写清除；native 路径用假插件。
- `tests/settings.test.ts` 补：生产模式下 `envLlm().apiKey === ''`；`partialize` 后持久化对象不含 apiKey。
- 手工：模拟器 iPad Pro 13″ / iPad mini / iPhone 15 Pro 冷启动、切后台再回来、杀进程后重开恢复会话；真机验证两个 Worker 加载时间与 `go depth` 耗时可接受（lite 单线程在 A 系列芯片上预计 depth 12 在 1–3 秒内）。

---

## 第三期：上架准备与许可合规

### 3.1 资产与元数据

- App 图标（1024×1024）与启动图，走 Capacitor 的 `@capacitor/assets` 生成各尺寸。
- `PrivacyInfo.xcprivacy`：声明 UserDefaults（`CA92.1`）与文件时间戳等 required-reason API；不收集任何数据，无追踪。
- App Store Connect 隐私问卷：不收集数据。App 内「关于」页写明：Key 只存本机 Keychain；讲解请求发往用户自己填写的服务地址；无任何本项目自有服务器。
- 审核备注：附一个可用的测试 Base URL / Key / 模型，说明不配 Key 时 App 全部训练功能仍可用，讲解为可选增强。

### 3.2 GPLv3 合规

- 仓库公开，根目录加 `LICENSE`（GPLv3）与 `COPYING` 说明。
- 新增 `pages/LicensesPage.tsx`（路由 `#/licenses`），从设置对话框与 HomePage 页脚可达。列出 Stockfish（GPLv3，附源码链接与本 App 源码链接）、chess.js（BSD-2）、react-chessboard（MIT）、React / Vite / zustand 等（MIT）。第三方许可清单以构建时脚本从 `package.json` 依赖生成的静态 JSON 为准，避免手写遗漏。
- 课程数据随源码一并公开；这一点已由用户确认接受。

### 3.3 发布流程

`npm run ios:sync` → Xcode 选择 Any iOS Device → Archive → Distribute → TestFlight 内测 → 提交审核。版本号以 `package.json` 的 `version` 为准，`ios:sync` 前用脚本同步进 `Info.plist`。

---

## 错误处理

| 场景 | 行为 |
|---|---|
| 讲解服务 CORS / 网络失败 | 讲解面板显示现有错误文案；设置页「测试连接」给出针对性提示 |
| 未配置 Key | 讲解面板显示「配置 API Key 后启用讲解」+ 打开设置按钮；走子、评估、课程目标判定全部可用 |
| Keychain 读取失败 | 视为无 Key，提示重新填写；不阻塞启动 |
| Filesystem 写失败（磁盘满等） | console 记录并在 SessionBar 显示「保存失败」标记，下一次防抖再试 |
| 存储 hydrate 超时（> 3s） | Gate 放行并以默认状态启动，避免白屏卡死 |

## 风险与已接受的约束

- **第三方 LLM 中转不支持 CORS**：BYOK 无后端的固有限制，用「测试连接」提前暴露，文档里注明。
- **App Store 4.2 最低功能**：不配 Key 也是完整训练器，风险可控。
- **GPL 与 App Store 条款的争议**：按 lichess 等先例，版权方 Stockfish 团队长期默认接受「公开源码 + App 内许可页」的做法；本项目遵循相同方式。
- **WASM 内存**：两个 Worker 各载入 7 MB WASM + 默认 16 MB Hash，合计约 60 MB，远低于 iOS WebView 限制。若真机冷启动明显偏慢，可把 opponent Worker 改为首次走子时懒加载，本期不做。

## 分期与交付

一份 spec，三份实施计划，按顺序各自独立可交付：

1. `2026-09-05-ipad-touch-responsive.md`：第一期。完成后 iPad Safari 即可日常使用。
2. `2026-09-05-capacitor-ios-shell.md`：第二期。完成后可出 TestFlight 包。
3. `2026-09-05-app-store-release.md`：第三期。完成后可提交审核。
