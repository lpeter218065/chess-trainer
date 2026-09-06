# 性能与响应速度优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 缩短课程页冷启动、走子后讲解首字、流式期间界面卡顿三类等待，功能行为不变。

**Architecture:** 不改数据模型与持久化格式（Task 11 除外，且保持 metas 格式不变）。改动集中在：store 启动链路改为后台执行；页面把整 store 订阅拆成细粒度 selector，流式文本由自订阅的小组件消费；叶子组件 `React.memo`；引擎搜索加 `movetime` 封顶并在可复用 MultiPV 分数时省一次搜索；自由探索走子改为乐观上盘。

**Tech Stack:** React 19、zustand 5（`useStore` + `useShallow`）、vitest 4、新增 devDeps `@testing-library/react` 与 `jsdom` 用于渲染探针测试。

## Global Constraints

- 对应 spec：`docs/superpowers/specs/2026-09-05-performance-speed-design.md`。
- 基线：Grok 的 iPad 实现已整体提交为 `45e6e37`，本计划在分支 `perf/speed` 上执行。每个 Task 开始前重新读取要改的文件，按内容而不是行号定位；发现该 Task 的行为已被实现时，只补测试并验证，不要重复实现。只 `git add` 本 Task 触及的文件，不要 `git add -A`；`graphify-out/` 永不提交。
- 页面已改用 `TrainerLayout`（`src/components/layout/TrainerLayout.tsx`），`Board` 已含点选走子；plan 里引用的旧布局代码片段以当前文件为准，只改订阅方式与右栏组件，不动布局与文案。
- 保持 UI 文案与视觉不变；不改 `LessonSnapshot` / `ExploreSnapshot` 字段。
- 常量：`LLM_DEBOUNCE_MS = 120`，`ANALYZE_DEBOUNCE_MS = 350`（不变），`createStreamFlusher` 默认间隔 `80`，`ANALYSIS_DEPTH = 16` 配 `movetime 1500`，对手 `moveTimeMs`：入门 / 初级 / 中级 800，高级 1500，满力 3000。
- 每个 Task 结束时 `npm test` 与 `npm run typecheck` 必须通过。
- 顺序：Task 0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11。Task 8（乐观走子）依赖 Task 6（ExplorePage 拆订阅）。

---

### Task 0: 修复 iPad 实现审查发现的三项问题

**Files:**
- Modify: `src/platform/secureStore.ts`
- Modify: `src/platform/storage.ts`
- Modify: `src/components/HydrationGate.tsx`
- Test: `tests/secureStore.test.ts`、`tests/platformStorage.test.ts`

**Interfaces:**
- Consumes: `getApiKey() / setApiKey()`（`src/platform/secureStore.ts`）、`FilesystemLike`（`src/platform/storage.ts`）、`configureSecureStore()`（测试用）。
- Produces: `ensureApiKeyPersisted(currentKey: string): Promise<void>`；`FilesystemLike.deleteFile(options: { path: string }): Promise<void>`。

背景：Grok 的实现把 API Key 从 settings 持久化对象里剔除（`partializeSettings`），改存 secureStore。但 Web 老用户的 Key 还在旧持久化对象里，`merge` 会把它读进内存 state，而 secureStore 里是空的；下次任何设置变动重写持久化对象后再刷新，Key 就丢了。另外 Filesystem 版 `removeItem` 写空字符串会让下次 hydrate 的 `JSON.parse('')` 抛错；Keychain 不可用时静默降级到 Preferences 明文没有任何提示。

- [ ] **Step 1: 写失败测试**

`tests/secureStore.test.ts` 的 `describe('secureStore native', ...)` 内追加（复用该 describe 里已有的 `bag` 与 `plugin`）：

```ts
  it('ensureApiKeyPersisted：secureStore 为空时把内存里的老 Key 写进去', async () => {
    const { ensureApiKeyPersisted } = await import('../src/platform/secureStore');
    await ensureApiKeyPersisted('sk-legacy');
    expect(bag.get('chess-trainer-api-key')).toBe('sk-legacy');
  });

  it('ensureApiKeyPersisted：secureStore 已有 Key 时不覆盖；空 Key 不写', async () => {
    const { ensureApiKeyPersisted } = await import('../src/platform/secureStore');
    bag.set('chess-trainer-api-key', 'sk-a');
    await ensureApiKeyPersisted('sk-legacy');
    expect(bag.get('chess-trainer-api-key')).toBe('sk-a');
    bag.clear();
    await ensureApiKeyPersisted('');
    expect(bag.has('chess-trainer-api-key')).toBe(false);
  });
```

`tests/platformStorage.test.ts`：给 `fakeFilesystem()` 增加 `deleteFile`，并追加用例：

```ts
    async deleteFile({ path }: { path: string }) {
      files.delete(path);
    },
```

```ts
  it('large native removeItem 删除文件，之后 getItem 返回 null 而不是空串', async () => {
    const filesystem = fakeFilesystem();
    const store = createPlatformStorage('large', { native: true, filesystem });
    await store.setItem('chess-trainer-game-sessions', '{"metas":{}}');
    await store.removeItem('chess-trainer-game-sessions');
    expect(filesystem.files.has('chess-trainer-game-sessions.json')).toBe(false);
    expect(await store.getItem('chess-trainer-game-sessions')).toBeNull();
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/secureStore.test.ts tests/platformStorage.test.ts`
Expected: FAIL（`ensureApiKeyPersisted` 不存在；`files.has(...)` 为 true 且 `getItem` 返回 `''`）。

- [ ] **Step 3: 实现**

`src/platform/secureStore.ts` 末尾追加：

```ts
/**
 * 迁移：旧版本把 Key 存在 settings 持久化对象里，新版本只存 secureStore。
 * hydrate 后若内存里有 Key 而 secureStore 为空，补写一次，避免下次重写 settings 时丢失。
 */
export async function ensureApiKeyPersisted(currentKey: string): Promise<void> {
  if (!currentKey) return;
  const stored = await getApiKey();
  if (stored) return;
  await setApiKey(currentKey);
}
```

同文件 `getApiKey` 与 `setApiKey` 里进入 `fallbackPrefs()` 之前各加一行：

```ts
  console.warn('[secureStore] Keychain 不可用，API Key 回退到 Preferences 明文存储');
```

（`getApiKey` 放在第一个 `catch` 之后、读取 fallback 之前；`setApiKey` 放在 `/* fall through */` 之后。）

`src/platform/storage.ts`：

```ts
export type FilesystemLike = {
  readFile(options: { path: string }): Promise<{ data: string }>;
  writeFile(options: { path: string; data: string }): Promise<void>;
  deleteFile(options: { path: string }): Promise<void>;
};
```

`largeNative.removeItem`：

```ts
    removeItem: async (name) => {
      try {
        await filesystem.deleteFile({ path: fileFor(name) });
      } catch {
        /* 文件不存在视为已删除 */
      }
    },
```

`defaultFilesystem()` 返回对象追加：

```ts
    deleteFile: async ({ path }) => {
      await Filesystem.deleteFile({ path, directory: Directory.Data });
    },
```

`src/components/HydrationGate.tsx` 第一个 `useEffect` 里读 Key 的部分改为：

```tsx
      try {
        const key = await getApiKey();
        if (cancelled) return;
        if (key) useSettings.getState().setLlm({ apiKey: key });
        else await ensureApiKeyPersisted(useSettings.getState().llm.apiKey);
      } catch {
        /* 视为无 Key，不挡住启动 */
      }
```

并把 import 改为 `import { getApiKey, ensureApiKeyPersisted } from '../platform/secureStore';`。

- [ ] **Step 4: 运行**

Run: `npm run typecheck && npm test`
Expected: 全部 PASS。

- [ ] **Step 5: Commit**

```bash
git add src/platform/secureStore.ts src/platform/storage.ts src/components/HydrationGate.tsx tests/secureStore.test.ts tests/platformStorage.test.ts
git commit -m "fix: 迁移 Web 老用户 API Key 到 secureStore；Filesystem removeItem 真删文件；Keychain 降级告警"
```

---

### Task 1: 去掉主棋盘按 FEN 重挂载（spec D）

**Files:**
- Modify: `src/pages/LessonPage.tsx`（`<Board key={viewed.fen} ...>` 处）

**Interfaces:**
- Consumes: 无
- Produces: 无

- [ ] **Step 1: 定位并删除 key**

在 `src/pages/LessonPage.tsx` 的 `LessonView` 渲染体里找到：

```tsx
              <Board
                key={viewed.fen}
                fen={viewed.fen}
```

改为：

```tsx
              <Board
                fen={viewed.fen}
```

`Board` 内部 `options` 已经按 `fen` 记忆化，react-chessboard 会按 `position` 属性更新，不需要重挂载。

- [ ] **Step 2: 验证**

Run: `npm run typecheck && npm test`
Expected: 全部通过（没有测试依赖这个 key）。

手工：`npm run dev`，进入任一课程，走一步，观察棋子有平滑位移动画（重挂载时没有动画），提示箭头与最后一步高亮仍正确。

- [ ] **Step 3: Commit**

```bash
git add src/pages/LessonPage.tsx
git commit -m "perf: 主棋盘不再按 FEN 重挂载"
```

---

### Task 2: 讲解防抖 120 ms、流刷新间隔 80 ms（spec B、C 末项）

**Files:**
- Modify: `src/utils/debounce.ts`
- Modify: `src/utils/streamFlusher.ts`
- Test: `tests/debounce.test.ts`、`tests/streamFlusher.test.ts`

**Interfaces:**
- Produces: `LLM_DEBOUNCE_MS === 120`；`createStreamFlusher(flush, intervalMs = 80)`

- [ ] **Step 1: 写失败测试（常量契约）**

在 `tests/debounce.test.ts` 末尾追加：

```ts
import { LLM_DEBOUNCE_MS, ANALYZE_DEBOUNCE_MS } from '../src/utils/debounce';

describe('防抖常量', () => {
  it('讲解防抖不超过 150 ms，切步防抖保持 350 ms', () => {
    expect(LLM_DEBOUNCE_MS).toBeLessThanOrEqual(150);
    expect(ANALYZE_DEBOUNCE_MS).toBe(350);
  });
});
```

在 `tests/streamFlusher.test.ts` 末尾追加（先看文件顶部已有的 import，复用 `createStreamFlusher` 与 `vi`）：

```ts
describe('默认刷新间隔', () => {
  it('默认间隔为 80 ms：间隔内的 token 合并到一次 trailing flush', () => {
    vi.useFakeTimers();
    const out: string[] = [];
    const f = createStreamFlusher((t) => out.push(t));
    f.push('a');            // 立即刷
    f.push('b');
    vi.advanceTimersByTime(79);
    expect(out).toEqual(['a']);
    vi.advanceTimersByTime(1);
    expect(out).toEqual(['a', 'ab']);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/debounce.test.ts tests/streamFlusher.test.ts`
Expected: 两个新用例 FAIL（500 > 150；50 ms 时已刷出 'ab'）。

- [ ] **Step 3: 改常量**

`src/utils/debounce.ts`：

```ts
/** 大模型防抖：快速走子/切局面只请求停下后的那一次。流可 abort，所以只需吸收连击 */
export const LLM_DEBOUNCE_MS = 120;
```

`src/utils/streamFlusher.ts` 函数签名：

```ts
export function createStreamFlusher(flush: (text: string) => void, intervalMs = 80) {
```

- [ ] **Step 4: 运行确认通过**

Run: `npm test`
Expected: 全部 PASS（`session.test.ts` / `exploreTree.test.ts` 用 `llmDebounceMs: 0`，不受影响）。

- [ ] **Step 5: Commit**

```bash
git add src/utils/debounce.ts src/utils/streamFlusher.ts tests/debounce.test.ts tests/streamFlusher.test.ts
git commit -m "perf: 讲解防抖降至 120ms，流刷新间隔 80ms"
```

---

### Task 3: 课程页先渲染，引擎工作放后台；首页预热引擎（spec A）

**Files:**
- Modify: `src/store/sessionInstance.ts`
- Modify: `src/pages/HomePage.tsx`
- Test: `tests/session.test.ts`

**Interfaces:**
- Consumes: `SessionState.start()` / `hydrateSnapshot()` 在首个 `await` 之前同步 `set` 了 `lesson` 与 `phase`（已是现状，本 Task 用测试锁定）。
- Produces: `bootLessonSession` / `switchLessonSession` / `newLessonSession` 不再等待引擎分析；返回值类型不变。

- [ ] **Step 1: 写失败测试：start 同步进入 preparing**

在 `tests/session.test.ts` 的 `describe('session store', ...)` 内追加：

```ts
  it('start() 在第一次 await 前就同步设置 lesson 与 preparing，不等引擎', async () => {
    let resolveAnalyze: (() => void) | null = null;
    const slowEngine: EnginePort = {
      ...fakeEngine(),
      analyze: (fen) => new Promise((res) => {
        resolveAnalyze = () => res({ fen, bestMove: 'e2e4', lines: [{ depth: 16, multipv: 1, score: { cp: 0 }, pv: ['e2e4'] }] });
      }),
    };
    const store = createSessionStore({ llmDebounceMs: 0, engine: slowEngine, llm: fakeLlm() });
    const p = store.getState().start(lesson, diff);
    expect(store.getState().lesson?.id).toBe(lesson.id);
    expect(store.getState().phase).toBe('preparing');
    resolveAnalyze!();
    await p;
    await store.getState().whenIdle();
    expect(store.getState().phase).toBe('userTurn');
  });
```

- [ ] **Step 2: 运行**

Run: `npx vitest run tests/session.test.ts`
Expected: PASS（现状已满足；这个测试是后续改动的护栏。若 FAIL，说明 `start()` 在 `set` 前有 await，把 `set({...initial, lesson, difficulty, fen, phase:'preparing'})` 移到函数体第一个 await 之前）。

- [ ] **Step 3: 改 sessionInstance，不等 start / hydrate**

`src/store/sessionInstance.ts` 中三处函数改为：

```ts
/** 后台执行 start / hydrate；出错只记录，UI 靠 store 的 engineError / llmError 展示 */
function runInBackground(p: Promise<unknown>) {
  p.catch((e) => console.error('[session] 后台启动失败', e));
}

/** Start or restore lesson into the session store（立即返回，引擎与讲解在后台） */
export async function bootLessonSession(lesson: Lesson, difficulty: Difficulty): Promise<StoreApi<SessionState>> {
  const store = await getSessionStore();
  const gs = useGameSessions.getState();
  const id = gs.ensureLessonActive(lesson.id, `${lesson.title}`);
  const snap = gs.getLessonSnapshot(id);
  if (snap && snap.lessonId === lesson.id) {
    runInBackground(store.getState().hydrateSnapshot(snap, lesson));
  } else {
    runInBackground(
      store.getState().start(lesson, difficulty).then(() => {
        const exported = store.getState().exportSnapshot();
        if (exported && useGameSessions.getState().activeLessonId === id) gs.saveLessonSnapshot(id, exported, `${lesson.title}`);
      }),
    );
  }
  return store;
}

export async function switchLessonSession(id: string, lesson: Lesson, difficulty: Difficulty): Promise<void> {
  const store = await getSessionStore();
  const gs = useGameSessions.getState();
  if (gs.activeLessonId) {
    const cur = store.getState().exportSnapshot();
    if (cur) gs.saveLessonSnapshot(gs.activeLessonId, cur);
  }
  gs.setActiveLesson(id);
  const snap = gs.getLessonSnapshot(id);
  if (snap && snap.lessonId === lesson.id) {
    runInBackground(store.getState().hydrateSnapshot(snap, lesson));
  } else {
    runInBackground(
      store.getState().start(lesson, difficulty).then(() => {
        const exported = store.getState().exportSnapshot();
        if (exported && useGameSessions.getState().activeLessonId === id) gs.saveLessonSnapshot(id, exported);
      }),
    );
  }
}

export async function newLessonSession(lesson: Lesson, difficulty: Difficulty): Promise<void> {
  const store = await getSessionStore();
  const gs = useGameSessions.getState();
  if (gs.activeLessonId) {
    const cur = store.getState().exportSnapshot();
    if (cur) gs.saveLessonSnapshot(gs.activeLessonId, cur);
  }
  const id = gs.newLesson(lesson.id, `${lesson.title}`);
  runInBackground(
    store.getState().start(lesson, difficulty).then(() => {
      const exported = store.getState().exportSnapshot();
      if (exported && useGameSessions.getState().activeLessonId === id) gs.saveLessonSnapshot(id, exported);
    }),
  );
}
```

注意：`attachLessonAutosave` 的 400 ms 订阅仍会在 start 过程中保存中间状态，这与之前行为一致。

- [ ] **Step 4: 首页预热引擎**

`src/pages/HomePage.tsx`：

```tsx
import { useEffect, useMemo, useState } from 'react';
import { getEngine } from '../engine/getEngine';
// ...其余 import 不变

export function HomePage() {
  // ...现有 hooks 不变
  useEffect(() => {
    const warm = () => { void getEngine().catch(() => undefined); };
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(warm);
    else setTimeout(warm, 0);
  }, []);
  // ...
```

`getEngine()` 内部有单例 Promise，课程页再次调用直接复用。

- [ ] **Step 5: 验证**

Run: `npm run typecheck && npm test`
Expected: PASS。

手工：`npm run dev`，DevTools Network 节流 "Fast 4G"，从首页进入课程：棋盘应在引擎 Worker 就绪后立刻出现（右栏显示 preparing 状态文案），不再等待深度 16 分析；首页停留时 Network 里能看到 `stockfish-18-lite-single.wasm` 已加载。

- [ ] **Step 6: Commit**

```bash
git add src/store/sessionInstance.ts src/pages/HomePage.tsx tests/session.test.ts
git commit -m "perf: 课程页不等首次分析即渲染，首页空闲时预热引擎"
```

---

### Task 4: 渲染测试基础设施 + 叶子组件 memo + 渲染探针测试（spec C 第一部分）

**Files:**
- Modify: `package.json`（devDependencies）
- Modify: `src/components/Board.tsx`、`src/components/MiniBoard.tsx`、`src/components/EngineLinesPanel.tsx`、`src/components/MoveList.tsx`、`src/components/AnnotationLegend.tsx`
- Create: `tests/helpers/renderProbe.tsx`
- Create: `tests/lessonViewRender.test.tsx`

**Interfaces:**
- Produces: 测试辅助 `tests/helpers/renderProbe.tsx` 导出 `mockChessboardWithCounter(): { count(): number }`（通过 `vi.mock('react-chessboard')` 用计数组件替代 `Chessboard`）与 `installDomPolyfills()`（ResizeObserver、matchMedia）。Task 5 / 6 用该测试作为验收。

- [ ] **Step 1: 安装测试依赖**

Run: `npm i -D @testing-library/react@^16 jsdom@^26`
Expected: `package.json` devDependencies 新增两项，`npm test` 仍通过。

- [ ] **Step 2: 写测试辅助**

`tests/helpers/renderProbe.tsx`：

```tsx
import { vi } from 'vitest';
import { createElement } from 'react';

/** 用计数组件替换 react-chessboard 的 Chessboard；必须在被测模块 import 之前调用（放在测试文件顶层） */
export function mockChessboardWithCounter() {
  const state = { n: 0 };
  vi.mock('react-chessboard', () => ({
    Chessboard: (props: { options?: { id?: string } }) => {
      state.n += 1;
      return createElement('div', { 'data-testid': 'chessboard', 'data-id': props.options?.id ?? '' });
    },
  }));
  return { count: () => state.n, reset: () => { state.n = 0; } };
}

export function installDomPolyfills() {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class RO { observe() {} unobserve() {} disconnect() {} }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
  }
}
```

- [ ] **Step 3: 写失败的渲染探针测试**

`tests/lessonViewRender.test.tsx`：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Chess } from 'chess.js';
import { mockChessboardWithCounter, installDomPolyfills } from './helpers/renderProbe';

const probe = mockChessboardWithCounter();

import { createSessionStore, type LlmPort } from '../src/store/session';
import type { EnginePort } from '../src/engine/engineService';
import { lessonById } from '../src/lessons';
import { difficultyById } from '../src/engine/difficulty';
import { LessonView } from '../src/pages/LessonPage';

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

/** 可控 LLM：先吐第一段，等 release() 后再吐第二段 */
function gatedLlm() {
  let release: (() => void) | null = null;
  let calls = 0;
  const port: LlmPort & { release(): void; calls(): number } = {
    async *stream() {
      calls += 1;
      if (calls === 1) { yield '开场'; return; }            // intro
      yield '第一段';
      await new Promise<void>((r) => { release = r; });
      yield '第二段';
    },
    release: () => release?.(),
    calls: () => calls,
  };
  return port;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lesson = lessonById('opening/italian-game')!;
const diff = difficultyById('medium');

describe('LessonView 流式期间的渲染', () => {
  beforeAll(() => installDomPolyfills());
  afterEach(() => cleanup());

  it('讲解流式追加文本时，棋盘组件不重渲染', async () => {
    const llm = gatedLlm();
    const store = createSessionStore({ llmDebounceMs: 0, engine: fakeEngine(), llm });
    await store.getState().start(lesson, diff);
    await store.getState().whenIdle();

    render(
      <MemoryRouter>
        <LessonView
          store={store}
          lesson={lesson}
          expectedLessonId={lesson.id}
          difficultyId="medium"
          onDifficulty={() => {}}
          onBack={() => {}}
        />
      </MemoryRouter>,
    );

    await act(async () => {
      await store.getState().playUserMove('d2', 'd3');
      await sleep(150); // 让第一段 flush 出来
    });
    expect(store.getState().rounds[0]?.commentary).toBe('第一段');
    const before = probe.count();

    await act(async () => {
      llm.release();
      await sleep(150);
    });
    expect(store.getState().rounds[0]?.commentary).toBe('第一段第二段');
    expect(probe.count()).toBe(before);
  });
});
```

- [ ] **Step 4: 运行确认失败**

Run: `npx vitest run tests/lessonViewRender.test.tsx`
Expected: 最后一个断言 FAIL（`probe.count()` 大于 `before`，因为整页重渲染带动 `Chessboard`）。若在此之前因缺少 polyfill 或路由 hook 报错，把缺的 stub 补进 `installDomPolyfills`，不要改被测代码。

- [ ] **Step 5: 叶子组件 memo**

`src/components/Board.tsx`：把 `export function Board(...) {` 改为内部函数，并在文件末尾导出 memo 版本：

```tsx
import { memo, useCallback, useMemo, type CSSProperties } from 'react';
// ...
function BoardImpl({ fen, orientation, interactive, annotations, hintArrow, hoverFocus, lastMove, onMove }: BoardProps) {
  // 原函数体不变
}

export const Board = memo(BoardImpl);
```

`src/components/MiniBoard.tsx`：同样改为 `function MiniBoardImpl(...)` + `export const MiniBoard = memo(MiniBoardImpl);`。

`src/components/EngineLinesPanel.tsx`：`PvLineCard` 与 `EngineLinesPanel` 都用 `memo` 包装导出（保持导出名不变）。

`src/components/MoveList.tsx`：`export const MoveList = memo(MoveListImpl);`。

`src/components/AnnotationLegend.tsx`：`export const AnnotationLegend = memo(AnnotationLegendImpl);`。

memo 只在 props 引用稳定时才有用，Task 5 / 6 负责让页面传入稳定的 props。

- [ ] **Step 6: 运行**

Run: `npm run typecheck && npm test`
Expected: typecheck 通过；`lessonViewRender.test.tsx` 仍 FAIL（页面还传入每次重建的 `onMove` 闭包与 `annotations`），其余 PASS。这是预期的，Task 5 让它变绿。

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tests/helpers/renderProbe.tsx tests/lessonViewRender.test.tsx src/components/Board.tsx src/components/MiniBoard.tsx src/components/EngineLinesPanel.tsx src/components/MoveList.tsx src/components/AnnotationLegend.tsx
git commit -m "test: 渲染探针测试基础设施；perf: 棋盘与列表叶子组件 memo"
```

---

### Task 5: LessonPage 拆分订阅，流式文本由自订阅组件消费（spec C 第二部分）

**Files:**
- Modify: `src/pages/LessonPage.tsx`
- Create: `src/components/lesson/LessonCommentary.tsx`
- Create: `src/components/lesson/LessonHint.tsx`
- Create: `src/components/lesson/LessonSummary.tsx`
- Create: `src/components/lesson/LessonAssessment.tsx`
- Test: `tests/lessonViewRender.test.tsx`（Task 4 已写，本 Task 让它通过）

**Interfaces:**
- Consumes: `useSession(store, selector)`（`src/store/sessionInstance.ts`）、`useShallow` from `zustand/react/shallow`。
- Produces: 四个自订阅组件，props 均为 `{ store: StoreApi<SessionState> } & 少量回调 / 展示参数`，见下文签名。`LessonView` 不再读取 `intro`、`summary`、`hintText`、`assessment`、`followUp*`、`rounds[i].commentary`。

- [ ] **Step 1: 写四个自订阅组件**

`src/components/lesson/LessonCommentary.tsx`：

```tsx
import type { StoreApi } from 'zustand';
import type { SessionState } from '../../store/session';
import { useSession } from '../../store/sessionInstance';
import { CommentaryPanel } from '../CommentaryPanel';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';

interface Props {
  store: StoreApi<SessionState>;
  activeRoundIndex: number;
  onSelectRound: (index: number) => void;
  onFocus: (f: CommentaryFocus | null) => void;
}

/** 只有这个组件订阅讲解 / 追问的流式字段，流式期间页面其他部分不重渲染 */
export function LessonCommentary({ store, activeRoundIndex, onSelectRound, onFocus }: Props) {
  const intro = useSession(store, (s) => s.intro);
  const rounds = useSession(store, (s) => s.rounds);
  const streaming = useSession(store, (s) => s.streaming);
  const llmError = useSession(store, (s) => s.llmError);
  const followUps = useSession(store, (s) => s.followUps);
  const followUpStreaming = useSession(store, (s) => s.followUpStreaming);
  const followUpDraft = useSession(store, (s) => s.followUpDraft);
  const followUpError = useSession(store, (s) => s.followUpError);
  const followUpThreadId = useSession(store, (s) => s.followUpThreadId);
  return (
    <CommentaryPanel
      intro={intro}
      rounds={rounds}
      activeRoundIndex={activeRoundIndex}
      streaming={streaming}
      llmError={llmError}
      followUps={followUps}
      followUpStreaming={followUpStreaming}
      followUpDraft={followUpDraft}
      followUpError={followUpError}
      followUpThreadId={followUpThreadId}
      onAskFollowUp={(tid, q) => void store.getState().askFollowUp(tid, q)}
      onSelectRound={onSelectRound}
      onFocus={onFocus}
    />
  );
}
```

`src/components/lesson/LessonHint.tsx`：

```tsx
import type { StoreApi } from 'zustand';
import type { SessionState } from '../../store/session';
import { useSession } from '../../store/sessionInstance';
import { HintButton } from '../HintButton';

export function LessonHint({ store, disabled }: { store: StoreApi<SessionState>; disabled: boolean }) {
  const hintText = useSession(store, (s) => s.hintText);
  const streaming = useSession(store, (s) => s.streaming === 'hint');
  return <HintButton disabled={disabled} hintText={hintText} streaming={streaming} onHint={(lv) => void store.getState().requestHint(lv)} />;
}
```

`src/components/lesson/LessonSummary.tsx`：

```tsx
import type { StoreApi } from 'zustand';
import type { SessionState } from '../../store/session';
import { useSession } from '../../store/sessionInstance';
import { SummaryCard } from '../SummaryCard';

interface Props { store: StoreApi<SessionState>; onRestart: () => void; onBack: () => void }

export function LessonSummary({ store, onRestart, onBack }: Props) {
  const result = useSession(store, (s) => s.result);
  const summary = useSession(store, (s) => s.summary);
  const streaming = useSession(store, (s) => s.streaming === 'summary');
  if (!result) return null;
  return <SummaryCard outcome={result.outcome} reason={result.reason} summary={summary} streaming={streaming} onRestart={onRestart} onBack={onBack} />;
}
```

`src/components/lesson/LessonAssessment.tsx`：

```tsx
import type { StoreApi } from 'zustand';
import type { SessionState } from '../../store/session';
import { useSession } from '../../store/sessionInstance';
import { AssessmentPanel } from '../AssessmentPanel';
import { sideToMove } from '../../chess/notation';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';

interface Props {
  store: StoreApi<SessionState>;
  viewedFen: string;
  historyUpToPly: string[];
  onFocus: (f: CommentaryFocus | null) => void;
}

export function LessonAssessment({ store, viewedFen, historyUpToPly, onFocus }: Props) {
  const side = useSession(store, (s) => s.assessmentSide) ?? sideToMove(viewedFen);
  const assessmentFen = useSession(store, (s) => s.assessmentFen);
  const assessment = useSession(store, (s) => s.assessment);
  const streaming = useSession(store, (s) => s.streaming === 'assessment');
  const llmError = useSession(store, (s) => s.llmError);
  return (
    <AssessmentPanel
      side={side}
      text={assessmentFen === viewedFen ? assessment : ''}
      streaming={streaming}
      error={streaming ? null : llmError}
      onSide={(sd) => { void store.getState().requestAssessment(sd, { fen: viewedFen, history: historyUpToPly }); }}
      onFocus={onFocus}
    />
  );
}
```

- [ ] **Step 2: 改 LessonView 的订阅**

在 `src/pages/LessonPage.tsx` 的 `LessonView` 里，删除 `const s = useSession(store, (x) => x);`，替换为细粒度 selector（下面列出的就是页面剩余逻辑真正用到的字段；`useShallow` 用于从 `rounds` 派生的稳定引用数组）：

```tsx
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
// ...

  const sessionLesson = useSession(store, (x) => x.lesson);
  const phase = useSession(store, (x) => x.phase);
  const history = useSession(store, (x) => x.history);
  const analysisBefore = useSession(store, (x) => x.analysisBefore);
  const liveAnnotations = useSession(store, (x) => x.liveAnnotations);
  const hintArrow = useSession(store, (x) => x.hintArrow);
  const evalCp = useSession(store, (x) => x.evalCp);
  const engineError = useSession(store, (x) => x.engineError);
  const followUpStreaming = useSession(store, (x) => x.followUpStreaming);
  const commentaryStreaming = useSession(store, (x) => x.streaming === 'commentary');
  const assessmentReady = useSession(store, (x) => Boolean(x.assessment) && x.assessmentFen);
  const assessmentText = useSession(store, (x) => x.assessment);   // 仅用于棋盘标记，见下
  const roundsCount = useSession(store, (x) => x.rounds.length);
  // 从 rounds 派生、引用稳定的数组：commentary 流式写入只替换被写的 round 对象，其余字段引用不变
  const roundAnnotations = useSession(store, useShallow((x) => x.rounds.map((r) => r.annotations)));
  const roundEngineMoves = useSession(store, useShallow((x) => x.rounds.map((r) => r.engineMove)));
  const roundBestLinesSan = useSession(store, useShallow((x) => x.rounds.map((r) => r.bestLinesSan)));
  const roundBestLinesUci = useSession(store, useShallow((x) => x.rounds.map((r) => r.bestLinesUci ?? null)));
```

`assessmentMarks` 需要 `assessment` 文本，这会让页面在局面判断流式期间重渲染。接受这个代价（局面判断是低频操作），但要保证棋盘 props 仍稳定：`assessmentMarks` 已经 `useMemo`。

- [ ] **Step 3: 把两个 resolver 改为接收派生数组**

替换 `resolveBoardAnnotations` 与 `resolveEngineLines` 的签名与实现：

```ts
interface AnnotationSources {
  roundAnnotations: BoardAnnotations[];
  analysisBefore: Analysis | null;
  liveAnnotations: BoardAnnotations | null;
  phase: Phase;
  commentaryStreaming: boolean;
}

function resolveBoardAnnotations(src: AnnotationSources, ply: number, livePly: number, viewedFen: string): BoardAnnotations | null {
  const roundIdx = roundIndexForPly(ply);
  const viewingRound = roundIdx >= 0 && roundIdx < src.roundAnnotations.length ? src.roundAnnotations[roundIdx] : null;
  const fromAnalysis = src.analysisBefore?.fen === viewedFen ? annotationsFromAnalysis(src.analysisBefore) : null;

  if (ply < livePly) {
    if (viewingRound) return viewingRound;
    if (ply === 0 && fromAnalysis) return fromAnalysis;
    return null;
  }
  if (src.liveAnnotations) return src.liveAnnotations;
  if (viewingRound && (src.phase === 'engineThinking' || src.phase === 'preparing' || src.commentaryStreaming)) return viewingRound;
  if (src.phase === 'userTurn' && fromAnalysis) return fromAnalysis;
  if (viewingRound) return viewingRound;
  if (ply === 0 && fromAnalysis) return fromAnalysis;
  return null;
}

interface EngineLineSources {
  analysisBefore: Analysis | null;
  lesson: Lesson | null;
  history: string[];
  roundEngineMoves: (Round['engineMove'])[];
  roundBestLinesSan: string[][][];
  roundBestLinesUci: (string[][] | null)[];
}

function resolveEngineLines(src: EngineLineSources, viewedFen: string): { baseFen: string; lines: PvLineData[] } | null {
  if (src.analysisBefore?.fen === viewedFen) {
    return { baseFen: viewedFen, lines: linesFromAnalysis(src.analysisBefore) };
  }
  if (!src.lesson) return null;
  let cursor = 0;
  for (let i = 0; i < src.roundEngineMoves.length; i++) {
    const fenAt = fenAfterPlies(src.lesson.startFen, src.history, cursor).fen;
    if (fenAt === viewedFen) {
      const lines: PvLineData[] = src.roundBestLinesSan[i].slice(0, 3).map((moves, j) => {
        const stored = src.roundBestLinesUci[i]?.[j];
        const uci = stored && stored.length > 0 ? stored : sanToUci(viewedFen, moves);
        return { label: `PV${j + 1}`, uci, moves: moves.length > 0 ? moves : uciToSan(viewedFen, uci) };
      });
      return lines.length > 0 ? { baseFen: viewedFen, lines } : null;
    }
    cursor += 1 + (src.roundEngineMoves[i] ? 1 : 0);
  }
  return null;
}
```

需要的类型 import：`import type { BoardAnnotations } from '../chess/annotations'; import type { Phase, Round, SessionState } from '../store/session'; import type { Lesson } from '../lessons/schema';`（按文件现有 import 合并）。

调用处：

```tsx
  const boardAnnotations = useMemo(
    () => resolveBoardAnnotations({ roundAnnotations, analysisBefore, liveAnnotations, phase, commentaryStreaming }, ply, livePly, viewed.fen),
    [roundAnnotations, analysisBefore, liveAnnotations, phase, commentaryStreaming, ply, livePly, viewed.fen],
  );
  const enginePv = useMemo(
    () => (viewed.fen ? resolveEngineLines({ analysisBefore, lesson: sessionLesson, history, roundEngineMoves, roundBestLinesSan, roundBestLinesUci }, viewed.fen) : null),
    [analysisBefore, sessionLesson, history, roundEngineMoves, roundBestLinesSan, roundBestLinesUci, viewed.fen],
  );
  const plyAfterRounds = useMemo(() => {
    const ends: number[] = [];
    let cursor = 0;
    for (const em of roundEngineMoves) { cursor += 1 + (em ? 1 : 0); ends.push(cursor); }
    return ends;
  }, [roundEngineMoves]);
  const visibleAnnotations = useMemo(
    () => mergeAnnotations(showAnnotations ? boardAnnotations : null, assessmentMarks),
    [showAnnotations, boardAnnotations, assessmentMarks],
  );
```

- [ ] **Step 4: 稳定传给 Board 的回调与对象**

```tsx
  const onBoardMove = useCallback(async (from: string, to: string, promotion?: string) => {
    // 原 onBoardMove 函数体，把对 s.xxx 的引用换成 store.getState().xxx 或上面的 selector 变量
  }, [store, ply, livePly /* 以及函数体实际用到的其他变量 */]);

  const boardHintArrow = isLive && phase === 'userTurn' ? hintArrow : null;
```

`<Board ... hintArrow={boardHintArrow} onMove={onBoardMove} annotations={visibleAnnotations} .../>`。`lastMove={viewed.lastMove}`：`viewed` 已是 `useMemo`，引用稳定。

- [ ] **Step 5: 右栏换成自订阅组件**

```tsx
          {phase !== 'finished' && (
            <div className="shrink-0 border-b border-line px-3 py-2">
              <LessonHint store={store} disabled={!isLive || phase !== 'userTurn'} />
            </div>
          )}
          {phase === 'finished' && (
            <div className="shrink-0 border-b border-line px-3 py-2">
              <LessonSummary store={store} onRestart={() => void newLessonSession(lesson, difficultyById(difficultyId))} onBack={onBack} />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {showAssessment && (
              <div className="mb-3">
                <LessonAssessment store={store} viewedFen={viewed.fen} historyUpToPly={historyUpToPly} onFocus={setHoverFocus} />
              </div>
            )}
            <LessonCommentary store={store} activeRoundIndex={activeRoundIndex} onSelectRound={onSelectRound} onFocus={setHoverFocus} />
          </div>
```

其中：

```tsx
  const historyUpToPly = useMemo(() => history.slice(0, ply), [history, ply]);
  const onSelectRound = useCallback((index: number) => {
    if (index < 0) { setReviewPly(livePly === 0 ? null : 0); return; }
    const end = plyAfterRounds[index];
    if (end == null) return;
    setReviewPly(end >= livePly ? null : end);
  }, [livePly, plyAfterRounds]);
```

页面里其余对 `s.xxx` 的引用：`s.lesson` → `sessionLesson`；`s.phase` → `phase`；`s.history` → `history`；`s.followUpStreaming` → `followUpStreaming`；`s.evalCp` → `evalCp`；`s.engineError` → `engineError`；`s.rounds.length` → `roundsCount`；`s.rounds[...]` 的其他用法改用派生数组；一次性动作（`takeback`、`requestAssessment`）用 `store.getState()`。`useEffect` 里 `s.rounds.length` 依赖改为 `roundsCount`。`canTakeback` 里的 `s.lesson!` 改 `sessionLesson`。

- [ ] **Step 6: 运行探针测试直到通过**

Run: `npx vitest run tests/lessonViewRender.test.tsx`
Expected: PASS。若仍 FAIL，在 `LessonView` 里临时加 `console.count('LessonView render')` 找出哪个 selector 在流式期间返回了新引用；常见原因是 selector 返回了新建对象或数组而没有 `useShallow`。修完删掉 console。

Run: `npm run typecheck && npm test`
Expected: 全部 PASS。

- [ ] **Step 7: 手工回归**

`npm run dev`：走子、提示、回看、候选招法开关、局面判断、追问、完成课程看总结、切换会话、重开。每个功能和改动前一致。React DevTools Profiler 录制一次讲解流式过程：只有 `LessonCommentary` 及其子树在 commit。

- [ ] **Step 8: Commit**

```bash
git add src/pages/LessonPage.tsx src/components/lesson/
git commit -m "perf: LessonPage 拆分 store 订阅，流式文本由自订阅组件消费"
```

---

### Task 6: ExplorePage 拆分订阅（spec C 第三部分）

**Files:**
- Modify: `src/pages/ExplorePage.tsx`
- Create: `src/components/explore/ExploreCommentary.tsx`
- Create: `src/components/explore/ExploreAssessment.tsx`
- Create: `tests/exploreViewRender.test.tsx`

**Interfaces:**
- Consumes: `useExplore(store, selector)`（`src/store/exploreInstance.ts`）、`exploreFollowUpThreadId`（`src/llm/prompts.ts`）、Task 4 的 `tests/helpers/renderProbe.tsx`。
- Produces: `ExploreCommentary({ store, ply, onFocus, hasKey })`、`ExploreAssessment({ store, viewedFen, onFocus })`。

- [ ] **Step 1: 写失败测试**

`tests/exploreViewRender.test.tsx`（`ExploreView` 目前不是导出的；本 Task 顺带 `export function ExploreView`）：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { act, render, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Chess } from 'chess.js';
import { mockChessboardWithCounter, installDomPolyfills } from './helpers/renderProbe';

const probe = mockChessboardWithCounter();

import { createExploreStore } from '../src/store/explore';
import type { EnginePort } from '../src/engine/engineService';
import type { LlmPort } from '../src/store/session';
import { resetMoveTreeIds } from '../src/chess/moveTree';
import { useSettings } from '../src/store/settings';
import { ExploreView } from '../src/pages/ExplorePage';

function fakeEngine(): EnginePort {
  const first = (fen: string) => {
    const m = new Chess(fen).moves({ verbose: true })[0];
    return m.from + m.to + (m.promotion ?? '');
  };
  return {
    async analyze(fen) {
      const bm = first(fen);
      return { fen, bestMove: bm, lines: [{ depth: 12, multipv: 1, score: { cp: 20 }, pv: [bm] }] };
    },
    async opponentMove(fen) { return first(fen); },
    dispose() {},
  };
}

function gatedLlm() {
  let release: (() => void) | null = null;
  const port: LlmPort & { release(): void } = {
    async *stream() {
      yield '第一段';
      await new Promise<void>((r) => { release = r; });
      yield '第二段';
    },
    release: () => release?.(),
  };
  return port;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitIdle(store: ReturnType<typeof createExploreStore>) {
  for (let i = 0; i < 50; i++) {
    if (!store.getState().analyzing) return;
    await sleep(10);
  }
}

describe('ExploreView 流式期间的渲染', () => {
  beforeAll(() => installDomPolyfills());
  beforeEach(() => { resetMoveTreeIds(); useSettings.getState().setLlm({ apiKey: 'test-key' }); });
  afterEach(() => cleanup());

  it('讲解流式追加文本时，棋盘组件不重渲染', async () => {
    const llm = gatedLlm();
    const store = createExploreStore(fakeEngine(), llm, { llmDebounceMs: 0 });
    store.getState().loadStart();
    await waitIdle(store);

    render(<MemoryRouter><ExploreView store={store} /></MemoryRouter>);

    await act(async () => {
      const p = store.getState().requestCommentary();
      await sleep(150);
      void p;
    });
    expect(store.getState().commentary).toBe('第一段');
    const before = probe.count();

    await act(async () => {
      llm.release();
      await sleep(150);
    });
    expect(store.getState().commentary).toBe('第一段第二段');
    expect(probe.count()).toBe(before);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/exploreViewRender.test.tsx`
Expected: FAIL（先因为 `ExploreView` 未导出；导出后因为整页重渲染而在最后一个断言 FAIL）。

- [ ] **Step 3: 写自订阅组件**

`src/components/explore/ExploreCommentary.tsx`：

```tsx
import { useMemo } from 'react';
import type { StoreApi } from 'zustand';
import type { ExploreState } from '../../store/explore';
import { useExplore } from '../../store/exploreInstance';
import { exploreFollowUpThreadId } from '../../llm/prompts';
import { AnnotatedCommentary } from '../AnnotatedCommentary';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';

interface Props {
  store: StoreApi<ExploreState>;
  ply: number;
  onFocus: (f: CommentaryFocus | null) => void;
}

/** 当前局面的讲解正文；只有它订阅流式字段 */
export function ExploreCommentary({ store, ply, onFocus }: Props) {
  const path = useExplore(store, (s) => s.path);
  const commentary = useExplore(store, (s) => s.commentary);
  const commentaryPly = useExplore(store, (s) => s.commentaryPly);
  const commentaries = useExplore(store, (s) => s.commentaries);
  const llmStreaming = useExplore(store, (s) => s.llmStreaming);
  const assessmentStreaming = useExplore(store, (s) => s.assessmentStreaming);
  const text = useMemo(() => {
    const tid = exploreFollowUpThreadId(path, ply);
    if (llmStreaming && commentaryPly === ply) return commentary;
    return commentaries[tid]?.text || (commentaryPly === ply ? commentary : '');
  }, [path, ply, commentaries, commentary, commentaryPly, llmStreaming]);
  return (
    <AnnotatedCommentary
      text={text}
      streaming={llmStreaming && !assessmentStreaming && commentaryPly === ply}
      placeholder=""
      onFocus={onFocus}
    />
  );
}

/** 页面判断是否显示讲解区所需的最小信息，避免页面订阅 commentary 正文 */
export function useExploreCommentaryPresence(store: StoreApi<ExploreState>, ply: number): boolean {
  return useExplore(store, (s) => {
    const tid = exploreFollowUpThreadId(s.path, ply);
    if (s.llmStreaming && s.commentaryPly === ply) return true;
    return Boolean(s.commentaries[tid]?.text) || (s.commentaryPly === ply && s.commentary.length > 0);
  });
}
```

`src/components/explore/ExploreAssessment.tsx`：

```tsx
import type { StoreApi } from 'zustand';
import type { ExploreState } from '../../store/explore';
import { useExplore } from '../../store/exploreInstance';
import { AssessmentPanel } from '../AssessmentPanel';
import { sideToMove } from '../../chess/notation';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';

interface Props { store: StoreApi<ExploreState>; viewedFen: string; onFocus: (f: CommentaryFocus | null) => void }

export function ExploreAssessment({ store, viewedFen, onFocus }: Props) {
  const side = useExplore(store, (s) => s.assessmentSide) ?? sideToMove(viewedFen);
  const assessmentFen = useExplore(store, (s) => s.assessmentFen);
  const assessment = useExplore(store, (s) => s.assessment);
  const streaming = useExplore(store, (s) => s.assessmentStreaming);
  const llmError = useExplore(store, (s) => s.llmError);
  return (
    <AssessmentPanel
      side={side}
      text={assessmentFen === viewedFen ? assessment : ''}
      streaming={streaming}
      error={streaming ? null : llmError}
      onSide={(sd) => { void store.getState().requestAssessment(sd); }}
      onFocus={onFocus}
    />
  );
}
```

- [ ] **Step 4: 改 ExploreView**

- `function ExploreView` → `export function ExploreView`。
- 删除 `const s = useExplore(store, (x) => x);`，替换为：

```tsx
  const tree = useExplore(store, (x) => x.tree);
  const path = useExplore(store, (x) => x.path);
  const startFen = useExplore(store, (x) => x.startFen);
  const reviewDepth = useExplore(store, (x) => x.reviewDepth);
  const analysis = useExplore(store, (x) => x.analysis);
  const evalCp = useExplore(store, (x) => x.evalCp);
  const analyzing = useExplore(store, (x) => x.analyzing);
  const orientation = useExplore(store, (x) => x.orientation);
  const error = useExplore(store, (x) => x.error);
  const llmStreaming = useExplore(store, (x) => x.llmStreaming);
  const assessmentStreaming = useExplore(store, (x) => x.assessmentStreaming);
  const assessment = useExplore(store, (x) => x.assessment);      // 仅供 assessmentMarks
  const assessmentFen = useExplore(store, (x) => x.assessmentFen);
  const commentaryHistory = useExplore(store, useShallow((x) => x.commentaryHistory()));
  const hasSavedCommentaryAtPly = useExplore(store, (x) => Boolean(x.commentaries[exploreFollowUpThreadId(x.path, x.viewedPly())]?.text));
  const ply = reviewDepth === null ? path.length : Math.min(reviewDepth, path.length);
  const isLive = reviewDepth === null || reviewDepth >= path.length;
  const livePly = path.length;
  const history = useMemo(() => pathSans(tree, path), [tree, path]);
  const showCommentary = useExploreCommentaryPresence(store, ply) || commentaryOpen || (llmStreaming && !assessmentStreaming);
```

（`viewedPly()` / `isLive()` 是 store 上的方法；页面改为按上面两行本地计算，语义与 store 一致。）

- `AnnotatedCommentary` 那段替换为 `<ExploreCommentary store={store} ply={ply} onFocus={setHoverFocus} />`；`AssessmentPanel` 替换为 `<ExploreAssessment store={store} viewedFen={viewed.fen} onFocus={setHoverFocus} />`。
- 动作调用统一改为 `store.getState().xxx(...)`；`onMove` 用 `useCallback((f, t, p) => store.getState().makeMove(f, t, p), [store])`。
- `s.commentaries[currentThreadId]?.text` 用 `hasSavedCommentaryAtPly`；`useEffect` 里对 `s.commentaries` 的依赖改为 `hasSavedCommentaryAtPly`。
- `visibleAnnotations` 加 `useMemo`，与 Task 5 相同。

- [ ] **Step 5: 运行直到通过**

Run: `npx vitest run tests/exploreViewRender.test.tsx && npm run typecheck && npm test`
Expected: 全部 PASS。

手工：探索页走子、回看、变着、导入 PGN / FEN、讲解、历史列表、局面判断、追问、翻转、切换会话都与改前一致。

- [ ] **Step 6: Commit**

```bash
git add src/pages/ExplorePage.tsx src/components/explore/ tests/exploreViewRender.test.tsx
git commit -m "perf: ExplorePage 拆分 store 订阅，讲解正文自订阅"
```

---

### Task 7: 引擎搜索 movetime 封顶 + 复用 MultiPV 分数省一次搜索（spec F）

**Files:**
- Create: `src/chess/evalFromLines.ts`
- Modify: `src/engine/difficulty.ts`、`src/engine/stockfishWorker.ts`、`src/engine/engineService.ts`
- Modify: `src/store/session.ts`（`playUserMove`）、`src/store/explore.ts`（`makeMove`，Task 8 会再改）
- Test: `tests/evalFromLines.test.ts`、`tests/uciParser.test.ts`（如有 go 命令断言）、`tests/difficulty.test.ts`

**Interfaces:**
- Produces:
  - `evalAfterFromLines(analysis: Analysis, userUci: string): number | null`：返回**走子后局面、以走子后行棋方（即对手）视角**的 cp；调用方再换视角。命中条件：某条 `lines[i].pv[0] === userUci`。
  - `Difficulty.moveTimeMs: number`；`ANALYSIS_MOVETIME_MS = 1500`。
  - `StockfishEngine.analyze(fen, depth, multiPv, moveTimeMs)`、`bestMove(fen, depth, moveTimeMs)`。

- [ ] **Step 1: 写失败测试**

`tests/evalFromLines.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { evalAfterFromLines } from '../src/chess/evalFromLines';
import type { Analysis } from '../src/engine/engineService';

const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const analysis: Analysis = {
  fen,
  bestMove: 'e2e4',
  lines: [
    { depth: 16, multipv: 1, score: { cp: 35 }, pv: ['e2e4', 'e7e5'] },
    { depth: 16, multipv: 2, score: { cp: 20 }, pv: ['d2d4', 'd7d5'] },
    { depth: 16, multipv: 3, score: { mate: 3 }, pv: ['g1f3'] },
  ],
};

describe('evalAfterFromLines', () => {
  it('命中第一条：返回对手视角的分数（取反）', () => {
    expect(evalAfterFromLines(analysis, 'e2e4')).toBe(-35);
  });
  it('命中第二条', () => {
    expect(evalAfterFromLines(analysis, 'd2d4')).toBe(-20);
  });
  it('mate 分数按 scoreToCp 换算后取反', () => {
    const v = evalAfterFromLines(analysis, 'g1f3');
    expect(v).not.toBeNull();
    expect(v!).toBeLessThan(-9000);
  });
  it('未命中返回 null', () => {
    expect(evalAfterFromLines(analysis, 'c2c4')).toBeNull();
  });
  it('空 pv 不崩', () => {
    expect(evalAfterFromLines({ ...analysis, lines: [{ depth: 1, multipv: 1, score: { cp: 0 }, pv: [] }] }, 'e2e4')).toBeNull();
  });
});
```

`tests/difficulty.test.ts` 追加：

```ts
import { DIFFICULTIES, OPENING_OPPONENTS, ANALYSIS_MOVETIME_MS } from '../src/engine/difficulty';

describe('movetime 封顶', () => {
  it('每档都有 moveTimeMs，分析封顶 1500', () => {
    for (const d of [...DIFFICULTIES, ...OPENING_OPPONENTS]) expect(d.moveTimeMs).toBeGreaterThan(0);
    expect(DIFFICULTIES.find((d) => d.id === 'max')!.moveTimeMs).toBe(3000);
    expect(ANALYSIS_MOVETIME_MS).toBe(1500);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/evalFromLines.test.ts tests/difficulty.test.ts`
Expected: FAIL（模块 / 字段不存在）。

- [ ] **Step 3: 实现**

`src/chess/evalFromLines.ts`：

```ts
import type { Analysis } from '../engine/engineService';
import { scoreToCp } from './quality';

/**
 * 用户着法若正是走子前分析里某条 MultiPV 线的首着，该线分数就是走子后局面的评估，
 * 可省掉一次引擎搜索。返回值视角：走子后的行棋方（对手）。未命中返回 null。
 */
export function evalAfterFromLines(analysis: Analysis, userUci: string): number | null {
  const line = analysis.lines.find((l) => l.pv[0] === userUci);
  if (!line) return null;
  return -scoreToCp(line.score);
}
```

`src/engine/difficulty.ts`：

```ts
export interface Difficulty {
  id: DifficultyId;
  label: string;
  skillLevel: number; // Stockfish "Skill Level" 0..20
  depth: number;
  /** 搜索时间封顶（毫秒），与 depth 先到为止 */
  moveTimeMs: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'beginner', label: '入门', skillLevel: 3, depth: 5, moveTimeMs: 800 },
  { id: 'easy', label: '初级', skillLevel: 8, depth: 8, moveTimeMs: 800 },
  { id: 'medium', label: '中级', skillLevel: 14, depth: 12, moveTimeMs: 800 },
  { id: 'hard', label: '高级', skillLevel: 20, depth: 16, moveTimeMs: 1500 },
  { id: 'max', label: '满力', skillLevel: 20, depth: 20, moveTimeMs: 3000 },
];

export const OPENING_OPPONENTS: Difficulty[] = [
  { id: 'easy', label: '一般对手', skillLevel: 9, depth: 8, moveTimeMs: 800 },
  { id: 'hard', label: '高级对手', skillLevel: 20, depth: 16, moveTimeMs: 1500 },
];

/** analyst 用的固定分析深度与时间封顶 */
export const ANALYSIS_DEPTH = 16;
export const ANALYSIS_MOVETIME_MS = 1500;
```

`src/engine/stockfishWorker.ts`：

```ts
  async analyze(fen: string, depth: number, multiPv: number, moveTimeMs?: number): Promise<Analysis> {
    await this.setOptions({ MultiPV: multiPv });
    const go = moveTimeMs ? `go depth ${depth} movetime ${moveTimeMs}` : `go depth ${depth}`;
    const lines = await this.run([`position fen ${fen}`, go], true);
    // ...其余不变
  }

  async bestMove(fen: string, depth: number, moveTimeMs?: number): Promise<string> {
    const go = moveTimeMs ? `go depth ${depth} movetime ${moveTimeMs}` : `go depth ${depth}`;
    const lines = await this.run([`position fen ${fen}`, go], true);
    // ...其余不变
  }
```

`src/engine/engineService.ts`：

```ts
import { ANALYSIS_DEPTH, ANALYSIS_MOVETIME_MS, type Difficulty } from './difficulty';
// ...
    analyze: (fen, multiPv) => analyst.analyze(fen, ANALYSIS_DEPTH, multiPv, ANALYSIS_MOVETIME_MS),
    async opponentMove(fen, difficulty) {
      // ...
      return opponent.bestMove(fen, difficulty.depth, difficulty.moveTimeMs);
    },
```

`src/store/session.ts` 的 `playUserMove`，把

```ts
            const [analysisAfter, em] = await Promise.all([
              deps.engine.analyze(fenAfterUser, 1),
              applyOpponentMove(chess, s.difficulty!),
            ]);
            evalAfter = playerCp(analysisAfter, lesson);
```

改为：

```ts
            const knownCp = analysisBefore ? evalAfterFromLines(analysisBefore, userUci) : null;
            const [evalAfterCp, em] = await Promise.all([
              knownCp !== null
                ? Promise.resolve(toPerspective(knownCp, sideToMove(fenAfterUser), lesson.playerColor))
                : deps.engine.analyze(fenAfterUser, 1).then((a) => playerCp(a, lesson)),
              applyOpponentMove(chess, s.difficulty!),
            ]);
            evalAfter = evalAfterCp;
```

并 import `evalAfterFromLines`（`toPerspective` / `sideToMove` 已在文件里 import，确认一下）。

`src/store/explore.ts` 的 `makeMove` 里同样：

```ts
          const knownCp = evalAfterFromLines(analysisBefore, userUci);
          evalAfterWhite = knownCp !== null
            ? (sideToMove(chess.fen()) === 'w' ? knownCp : -knownCp)
            : whiteEval(await engine.analyze(chess.fen(), 1));
```

- [ ] **Step 4: 运行**

Run: `npm run typecheck && npm test`
Expected: 全部 PASS。`session.test.ts` 的假引擎 `lines[0].pv = [bestMove]`，走 `d2d3` 时若恰为 bestMove 会命中复用路径，否则走搜索路径，两条路径都被现有用例覆盖。

- [ ] **Step 5: Commit**

```bash
git add src/chess/evalFromLines.ts src/engine/difficulty.ts src/engine/stockfishWorker.ts src/engine/engineService.ts src/store/session.ts src/store/explore.ts tests/evalFromLines.test.ts tests/difficulty.test.ts
git commit -m "perf: 引擎搜索 movetime 封顶；命中 MultiPV 线时复用分数省一次搜索"
```

---

### Task 8: 自由探索允许分析中走子，着法乐观上盘（spec E）

**Files:**
- Modify: `src/store/explore.ts`（`makeMove`）
- Modify: `src/pages/ExplorePage.tsx`（若仍有 `interactive={!analyzing}`，改为 `interactive`）
- Test: `tests/exploreTree.test.ts`

**Interfaces:**
- Consumes: Task 7 的 `evalAfterFromLines`；`moveTree` 的 `appendChild / findChildBySan / setNodeQuality`；store 内部 `analyzeToken` / `analyzeAtPlyNow`。
- Produces: `makeMove` 在写入树后立即 resolve `true`；质量与 `evalCp` 异步补写。

- [ ] **Step 1: 写失败测试**

`tests/exploreTree.test.ts` 追加：

```ts
function slowEngine(delayMs: number): EnginePort & { calls: number } {
  const base = fakeEngine();
  const e = {
    calls: 0,
    async analyze(fen: string, multiPv: number) {
      e.calls++;
      await new Promise((r) => setTimeout(r, delayMs));
      return base.analyze(fen, multiPv);
    },
    opponentMove: base.opponentMove,
    dispose() {},
  };
  return e;
}

describe('explore 乐观走子', () => {
  beforeEach(() => resetMoveTreeIds());

  it('分析进行中也能走子，着法立即上盘，质量稍后补写', async () => {
    const engine = slowEngine(60);
    const store = createExploreStore(engine, fakeLlm);
    store.getState().loadStart();
    await waitIdle(store);

    const p1 = store.getState().makeMove('e2', 'e4');
    // 不等分析：树里已经有 e4
    expect(pathSans(store.getState().tree, store.getState().path)).toEqual(['e4']);
    expect(store.getState().analyzing).toBe(true);
    expect(await p1).toBe(true);

    // 分析尚未结束时再走一步，不能被吞
    const ok2 = await store.getState().makeMove('e7', 'e5');
    expect(ok2).toBe(true);
    expect(pathSans(store.getState().tree, store.getState().path)).toEqual(['e4', 'e5']);

    await waitIdle(store);
    await new Promise((r) => setTimeout(r, 150));
    const qs = store.getState().qualities();
    expect(qs).toHaveLength(2);
    expect(qs.every((q) => q !== null)).toBe(true);
    // 最终分析对应最后局面
    const fenAfter = (() => { const c = new Chess(); c.move('e4'); c.move('e5'); return c.fen(); })();
    expect(store.getState().analysis?.fen).toBe(fenAfter);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/exploreTree.test.ts`
Expected: 新用例 FAIL：`makeMove` 因 `analyzing` 返回 false，或树在 `await` 前为空。

- [ ] **Step 3: 重写 makeMove**

`src/store/explore.ts`：

```ts
      async makeMove(from, to, promotion) {
        const s0 = get();
        const ply = s0.viewedPly();
        const sans = pathSans(s0.tree, s0.path);
        const { fen } = fenAfterPlies(s0.startFen, sans, ply);
        const chess = new Chess(fen);
        let move;
        try {
          move = chess.move({ from, to, promotion });
        } catch {
          return false;
        }
        const userUci = move.from + move.to + (move.promotion ?? '');
        const movingSide = sideToMove(fen);
        const fenAfter = chess.fen();

        // 1) 立刻写入树并上盘，质量暂为 null
        const parentId: MoveNodeId | null = ply === 0 ? null : s0.path[ply - 1];
        const existing = findChildBySan(s0.tree, parentId, move.san);
        let tree = s0.tree;
        let nodeId: MoveNodeId;
        if (existing) {
          nodeId = existing;
        } else {
          const appended = appendChild(tree, parentId, move.san, null);
          tree = appended.tree;
          nodeId = appended.id;
        }
        const path: MoveNodeId[] = [...s0.path.slice(0, ply), nodeId];
        let tip = nodeId;
        while (tree.nodes[tip].children.length > 0) {
          tip = tree.nodes[tip].children[0];
          path.push(tip);
        }
        // 走子前分析若正好对应当前局面则可复用，否则后台补算
        const analysisBefore = s0.analysis?.fen === fen ? s0.analysis : null;
        analyzeDebouncer.cancel();
        set({ tree, path, reviewDepth: null, analysis: null });

        // 2) 后台：补质量 + 新局面 MultiPV 分析。用 token 保证只有最新一次走子的结果生效
        const token = ++analyzeToken;
        set({ analyzing: true, error: null });
        void (async () => {
          try {
            const before = analysisBefore ?? (await engine.analyze(fen, 3));
            if (token !== analyzeToken) return;
            const knownCp = evalAfterFromLines(before, userUci);
            const evalAfterWhite = knownCp !== null
              ? (sideToMove(fenAfter) === 'w' ? knownCp : -knownCp)
              : whiteEval(await engine.analyze(fenAfter, 1));
            if (token !== analyzeToken) return;
            const quality = classifyMove({
              evalBefore: sideEval(whiteEval(before), movingSide),
              evalAfter: sideEval(evalAfterWhite, movingSide),
              userMoveUci: userUci,
              bestMoveUci: before.bestMove,
            });
            set((st) => ({ tree: setNodeQuality(st.tree, nodeId, quality), evalCp: evalAfterWhite }));

            // 3) 当前 path 末端局面的 MultiPV 分析（path 可能比 nodeId 更深）
            const st = get();
            const tipFen = fenAfterPlies(st.startFen, pathSans(st.tree, st.path), st.path.length).fen;
            const analysis = await engine.analyze(tipFen, 3);
            if (token !== analyzeToken) return;
            set({ analysis, evalCp: whiteEval(analysis), analyzing: false });
          } catch (e) {
            if (token !== analyzeToken) return;
            set({ analyzing: false, error: `分析失败：${(e as Error).message}` });
          }
        })();
        return true;
      },
```

要点：
- 去掉了原先开头的 `if (s0.analyzing) return false;` 与走子前的 `await analyzeAtPlyNow(ply)`。
- `analyzeAtPlyNow` 内部也用 `++analyzeToken`，因此后续切步分析会自然废弃这里的后台任务。
- 需要 import `evalAfterFromLines`（`src/chess/evalFromLines.ts`）。

`src/pages/ExplorePage.tsx`：若 `Board` 仍是 `interactive={!analyzing}`，改为 `interactive`。「显示分析」按钮的 `disabled={!boardAnnotations}` 保持。

- [ ] **Step 4: 运行**

Run: `npx vitest run tests/exploreTree.test.ts tests/exploreViewRender.test.tsx && npm run typecheck && npm test`
Expected: 全部 PASS。注意原有用例里 `await waitIdle(store)` 后 `qualities()` 的断言：乐观上盘后质量需要等后台补写，若有用例在 `makeMove` 返回后立刻断言质量非 null，把该断言移到 `waitIdle` 之后。

- [ ] **Step 5: 手工**

探索页快速连走三步：每步立刻上盘，质量标签逐个出现，最后只有末局面有候选招法；回看后走变着行为不变。

- [ ] **Step 6: Commit**

```bash
git add src/store/explore.ts src/pages/ExplorePage.tsx tests/exploreTree.test.ts
git commit -m "perf: 自由探索允许分析中走子，着法乐观上盘、质量异步补写"
```

---

### Task 9: 系统字体 + 路由级代码拆分（spec G）

**Files:**
- Modify: `src/index.css`
- Modify: `src/App.tsx`

**Interfaces:** 无对外接口。

- [ ] **Step 1: 记录基线**

Run: `npm run build 2>&1 | grep -E "dist/assets|gzip"`
Expected: 单个 `index-*.js` 约 507 kB（写进 commit message 便于对比）。

- [ ] **Step 2: 字体改系统栈**

`src/index.css`：删除 `@import url("https://fonts.googleapis.com/...")` 整行；`@theme` 内：

```css
  --font-sans: ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
  --font-display: ui-serif, Georgia, "Songti SC", "Noto Serif CJK SC", serif;
```

- [ ] **Step 3: 路由懒加载**

`src/App.tsx`：

```tsx
import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { HomePage } from './pages/HomePage';
import { LoadingScreen } from './components/LoadingScreen';

const LessonPage = lazy(() => import('./pages/LessonPage').then((m) => ({ default: m.LessonPage })));
const ExplorePage = lazy(() => import('./pages/ExplorePage').then((m) => ({ default: m.ExplorePage })));
const AnalysesPage = lazy(() => import('./pages/AnalysesPage').then((m) => ({ default: m.AnalysesPage })));
const OpeningDrillPage = lazy(() => import('./pages/OpeningDrillPage').then((m) => ({ default: m.OpeningDrillPage })));

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<LoadingScreen message="正在加载…" />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/analyses" element={<AnalysesPage />} />
          <Route path="/drill/:id" element={<OpeningDrillPage />} />
          <Route path="/lesson/:id" element={<LessonPage />} />
          <Route path="/explore" element={<ExplorePage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
```

（若 `LoadingScreen` 的 props 名不是 `message`，以 `src/components/LoadingScreen.tsx` 实际签名为准。若 `HomePage` 通过 `lessonsBySection` 静态引用了全部课程数据，这部分仍在首屏 chunk；课程数据约 40 kB 源码，可接受，不再额外拆。）

- [ ] **Step 4: 验证**

Run: `npm run build 2>&1 | grep -E "dist/assets"`
Expected: 主 chunk 小于 250 kB（未压缩）；出现 `LessonPage-*.js`、`ExplorePage-*.js` 等独立 chunk；构建不再有 `@import rules must precede` 警告。

Run: `npm run typecheck && npm test`
Expected: PASS。

手工：首页 Network 面板不出现 react-chessboard 相关 chunk（它随 LessonPage / ExplorePage chunk 加载）；页面字体变为系统字体，无外部字体请求。

- [ ] **Step 5: Commit**

```bash
git add src/index.css src/App.tsx
git commit -m "perf: 系统字体栈；路由级代码拆分（主 chunk 507kB → 见 build 输出）"
```

---

### Task 10: 会话快照按会话分 key 存储（spec H）

> **2026-09-06 决定：本期跳过。** 基线里 `useGameSessions` 已通过 `debounceStorage(createPlatformStorage('large'), 400)` 在原生端走 Filesystem，本 Task 的同步 localStorage 设计会让 iPad 上的快照退回 WKWebView localStorage。待后续单独出 spec，在平台适配器上做异步的按会话分文件存储。下面的内容保留作参考，不执行。

**Files:**
- Create: `src/store/snapshotStorage.ts`
- Modify: `src/store/gameSessions.ts`
- Modify: `src/store/exploreInstance.ts`（`attachExploreAutosave` 里对 `gs.exploreData[id]` 的引用）
- Test: `tests/snapshotStorage.test.ts`、`tests/gameSessions.test.ts`

**Interfaces:**
- Produces:

```ts
// src/store/snapshotStorage.ts
export interface SnapshotStorage {
  get<T>(id: string): T | null;
  set<T>(id: string, snap: T): void;
  remove(id: string): void;
}
export function createSnapshotStorage(backend?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): SnapshotStorage;
export const SNAPSHOT_KEY_PREFIX = 'chess-trainer-session:';
export const snapshotStorage: SnapshotStorage; // 默认实例：浏览器 localStorage，无则内存
```

- `GameSessionsState` 去掉 `exploreData` / `lessonData` 字段；`getExploreSnapshot` / `getLessonSnapshot` / `saveXxxSnapshot` / `saveAsXxx` / `deleteSession` 改走 `snapshotStorage`。`persist` 的 `partialize` 只保留 `metas`、`activeExploreId`、`activeLessonId`。
- 迁移：`persist` 的 `migrate`（`version: 1`）把旧持久化对象里的 `exploreData` / `lessonData` 写入 `snapshotStorage` 后丢弃。

- [ ] **Step 1: 写失败测试**

`tests/snapshotStorage.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { createSnapshotStorage, SNAPSHOT_KEY_PREFIX } from '../src/store/snapshotStorage';

function memBackend() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('snapshotStorage', () => {
  it('每个会话一个 key，互不影响', () => {
    const b = memBackend();
    const s = createSnapshotStorage(b);
    s.set('a', { x: 1 });
    s.set('b', { x: 2 });
    expect([...b.m.keys()].sort()).toEqual([`${SNAPSHOT_KEY_PREFIX}a`, `${SNAPSHOT_KEY_PREFIX}b`]);
    const beforeB = b.m.get(`${SNAPSHOT_KEY_PREFIX}b`);
    s.set('a', { x: 3 });
    expect(b.m.get(`${SNAPSHOT_KEY_PREFIX}b`)).toBe(beforeB);
    expect(s.get<{ x: number }>('a')).toEqual({ x: 3 });
  });
  it('缺失返回 null，remove 后为 null，坏 JSON 视为缺失', () => {
    const b = memBackend();
    const s = createSnapshotStorage(b);
    expect(s.get('nope')).toBeNull();
    s.set('a', { x: 1 });
    s.remove('a');
    expect(s.get('a')).toBeNull();
    b.setItem(`${SNAPSHOT_KEY_PREFIX}bad`, '{not json');
    expect(s.get('bad')).toBeNull();
  });
  it('内存缓存：同一 id 连续 get 不重复解析', () => {
    const b = memBackend();
    let reads = 0;
    const counting = { ...b, getItem: (k: string) => { reads++; return b.getItem(k); } };
    const s = createSnapshotStorage(counting);
    s.set('a', { x: 1 });
    s.get('a'); s.get('a');
    expect(reads).toBe(0); // set 已填充缓存
  });
});
```

`tests/gameSessions.test.ts`：`beforeEach` 改为

```ts
import { snapshotStorage } from '../src/store/snapshotStorage';
// ...
  beforeEach(() => {
    useGameSessions.setState({ metas: {}, activeExploreId: null, activeLessonId: null });
    for (const k of Object.keys(localStorageLike())) { /* 见下 */ }
  });
```

更简单：测试文件顶部 `import { createSnapshotStorage, __setSnapshotStorageForTests } from '../src/store/snapshotStorage'`，`beforeEach` 里 `__setSnapshotStorageForTests(createSnapshotStorage(memBackend()))`（见 Step 3 的实现）。追加用例：

```ts
  it('保存会话 A 不重写会话 B 的存储条目', () => {
    const b = memBackend();
    __setSnapshotStorageForTests(createSnapshotStorage(b));
    const gs = useGameSessions.getState();
    const a = gs.newExplore('A');
    const bId = gs.newExplore('B');
    const snap = { startFen: START_FEN, tree: createEmptyTree(), path: [], reviewDepth: null, orientation: 'white' as const, commentary: '', commentaryPly: null, followUps: {} };
    gs.saveExploreSnapshot(bId, { ...snap, commentary: 'B' });
    const rawB = b.m.get(`${SNAPSHOT_KEY_PREFIX}${bId}`);
    gs.saveExploreSnapshot(a, { ...snap, commentary: 'A' });
    expect(b.m.get(`${SNAPSHOT_KEY_PREFIX}${bId}`)).toBe(rawB);
    expect(useGameSessions.getState().getExploreSnapshot(a)?.commentary).toBe('A');
  });

  it('deleteSession 同时删除快照条目', () => {
    const b = memBackend();
    __setSnapshotStorageForTests(createSnapshotStorage(b));
    const gs = useGameSessions.getState();
    const id = gs.newExplore('X');
    gs.saveExploreSnapshot(id, { startFen: START_FEN, tree: createEmptyTree(), path: [], reviewDepth: null, orientation: 'white', commentary: '', commentaryPly: null, followUps: {} });
    gs.deleteSession(id);
    expect(b.m.has(`${SNAPSHOT_KEY_PREFIX}${id}`)).toBe(false);
  });

  it('migrate 把旧的 exploreData / lessonData 搬到分 key 存储', () => {
    const b = memBackend();
    __setSnapshotStorageForTests(createSnapshotStorage(b));
    const migrated = migrateGameSessions({
      metas: { e1: { id: 'e1', kind: 'explore', title: 'e', updatedAt: 'x' } },
      exploreData: { e1: { startFen: START_FEN, tree: createEmptyTree(), path: [], reviewDepth: null, orientation: 'white', commentary: 'old', commentaryPly: null, followUps: {} } },
      lessonData: {},
      activeExploreId: 'e1',
      activeLessonId: null,
    }, 0);
    expect((migrated as { exploreData?: unknown }).exploreData).toBeUndefined();
    expect(JSON.parse(b.m.get(`${SNAPSHOT_KEY_PREFIX}e1`)!).commentary).toBe('old');
  });
```

（`migrateGameSessions` 从 `gameSessions.ts` 导出，见 Step 3。原有用例里直接 `setState({ exploreData, lessonData })` 的地方改为调用 `saveXxxSnapshot`。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run tests/snapshotStorage.test.ts tests/gameSessions.test.ts`
Expected: FAIL（模块不存在 / 字段类型错误）。

- [ ] **Step 3: 实现 snapshotStorage**

`src/store/snapshotStorage.ts`：

```ts
export interface SnapshotStorage {
  get<T>(id: string): T | null;
  set<T>(id: string, snap: T): void;
  remove(id: string): void;
}

type Backend = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const SNAPSHOT_KEY_PREFIX = 'chess-trainer-session:';

function memoryBackend(): Backend {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
}

/** 每个会话一个 key；带内存缓存，避免同一会话反复 JSON.parse */
export function createSnapshotStorage(backend?: Backend): SnapshotStorage {
  const be = backend ?? (typeof localStorage === 'undefined' ? memoryBackend() : localStorage);
  const cache = new Map<string, unknown>();
  return {
    get<T>(id: string): T | null {
      if (cache.has(id)) return cache.get(id) as T;
      const raw = be.getItem(SNAPSHOT_KEY_PREFIX + id);
      if (raw === null) return null;
      try {
        const v = JSON.parse(raw) as T;
        cache.set(id, v);
        return v;
      } catch {
        return null;
      }
    },
    set<T>(id: string, snap: T) {
      cache.set(id, snap);
      try {
        be.setItem(SNAPSHOT_KEY_PREFIX + id, JSON.stringify(snap));
      } catch (e) {
        console.error('[snapshotStorage] 写入失败', e);
      }
    },
    remove(id: string) {
      cache.delete(id);
      be.removeItem(SNAPSHOT_KEY_PREFIX + id);
    },
  };
}

let current: SnapshotStorage = createSnapshotStorage();

export const snapshotStorage: SnapshotStorage = {
  get: (id) => current.get(id),
  set: (id, snap) => current.set(id, snap),
  remove: (id) => current.remove(id),
};

/** 仅测试用：替换底层实例 */
export function __setSnapshotStorageForTests(s: SnapshotStorage) {
  current = s;
}
```

- [ ] **Step 4: 改 gameSessions**

`src/store/gameSessions.ts` 改动点：

```ts
import { snapshotStorage } from './snapshotStorage';

interface GameSessionsState {
  metas: Record<string, SessionMeta>;
  activeExploreId: string | null;
  activeLessonId: string | null;
  // ...方法签名不变
}

/** 旧版本（version 0）把全部快照放在同一个对象里；迁移到分 key 存储 */
export function migrateGameSessions(persisted: unknown, version: number): Pick<GameSessionsState, 'metas' | 'activeExploreId' | 'activeLessonId'> {
  const p = (persisted ?? {}) as Partial<GameSessionsState> & {
    exploreData?: Record<string, ExploreSnapshot>;
    lessonData?: Record<string, LessonSnapshot>;
  };
  if (version < 1) {
    for (const [id, snap] of Object.entries(p.exploreData ?? {})) snapshotStorage.set(id, snap);
    for (const [id, snap] of Object.entries(p.lessonData ?? {})) snapshotStorage.set(id, snap);
  }
  return { metas: p.metas ?? {}, activeExploreId: p.activeExploreId ?? null, activeLessonId: p.activeLessonId ?? null };
}
```

方法实现：

```ts
      saveExploreSnapshot(id, snap, title) {
        const prev = get().metas[id];
        if (!prev || prev.kind !== 'explore') return;
        snapshotStorage.set(id, snap);
        set((s) => ({ metas: { ...s.metas, [id]: { ...prev, title: title ?? prev.title, updatedAt: nowIso() } } }));
      },

      saveLessonSnapshot(id, snap, title) {
        const prev = get().metas[id];
        if (!prev || prev.kind !== 'lesson') return;
        snapshotStorage.set(id, snap);
        set((s) => ({ metas: { ...s.metas, [id]: { ...prev, title: title ?? prev.title, updatedAt: nowIso(), lessonId: snap.lessonId } } }));
      },

      saveAsExplore(fromId, title) {
        const s = get();
        const data = snapshotStorage.get<ExploreSnapshot>(fromId);
        const prev = s.metas[fromId];
        if (!data || !prev || prev.kind !== 'explore') return null;
        const id = newId();
        snapshotStorage.set(id, structuredClone(data));
        set({ metas: { ...s.metas, [id]: { id, kind: 'explore', title: title.trim() || defaultExploreTitle(), updatedAt: nowIso() } }, activeExploreId: id });
        return id;
      },

      saveAsLesson(fromId, title) {
        const s = get();
        const data = snapshotStorage.get<LessonSnapshot>(fromId);
        const prev = s.metas[fromId];
        if (!data || !prev || prev.kind !== 'lesson') return null;
        const id = newId();
        snapshotStorage.set(id, structuredClone(data));
        set({ metas: { ...s.metas, [id]: { id, kind: 'lesson', title: title.trim() || prev.title, updatedAt: nowIso(), lessonId: data.lessonId } }, activeLessonId: id });
        return id;
      },

      deleteSession(id) {
        snapshotStorage.remove(id);
        set((s) => {
          const metas = { ...s.metas };
          delete metas[id];
          let { activeExploreId, activeLessonId } = s;
          if (activeExploreId === id) activeExploreId = Object.values(metas).find((m) => m.kind === 'explore')?.id ?? null;
          if (activeLessonId === id) activeLessonId = Object.values(metas).find((m) => m.kind === 'lesson')?.id ?? null;
          return { metas, activeExploreId, activeLessonId };
        });
      },

      getExploreSnapshot(id) { return snapshotStorage.get<ExploreSnapshot>(id); },
      getLessonSnapshot(id) { return snapshotStorage.get<LessonSnapshot>(id); },
```

`persist` 配置：

```ts
    {
      name: 'chess-trainer-game-sessions',
      version: 1,
      storage: createJSONStorage(() => (typeof localStorage === 'undefined' ? memoryStorage() : localStorage)),
      partialize: (s) => ({ metas: s.metas, activeExploreId: s.activeExploreId, activeLessonId: s.activeLessonId }),
      migrate: (persisted, version) => migrateGameSessions(persisted, version) as unknown as GameSessionsState,
    },
```

`src/store/exploreInstance.ts` 的 `attachExploreAutosave`：把 `gs.exploreData[id] && JSON.stringify(gs.exploreData[id]) === json` 改为 `JSON.stringify(gs.getExploreSnapshot(id)) === json`。

全局搜索 `exploreData` / `lessonData`（`grep -rn "exploreData\|lessonData" src tests`），把剩余引用改为 `getXxxSnapshot`。

- [ ] **Step 5: 运行**

Run: `npm run typecheck && npm test`
Expected: 全部 PASS。

手工：用改动前的构建先创建 2 个探索会话和 1 个课程会话，再切到改动后的构建刷新：会话列表、内容完好；DevTools Application → Local Storage 里出现 `chess-trainer-session:<id>` 条目，`chess-trainer-game-sessions` 里不再有快照数据；走几步只更新当前会话的那个 key。

- [ ] **Step 6: Commit**

```bash
git add src/store/snapshotStorage.ts src/store/gameSessions.ts src/store/exploreInstance.ts tests/snapshotStorage.test.ts tests/gameSessions.test.ts
git commit -m "perf: 会话快照按会话分 key 存储，保存不再序列化全部会话"
```

---

### Task 11: 收尾验证

**Files:** 无新增。

- [ ] **Step 1: 全量验证**

Run: `npm run typecheck && npm test && npm run build`
Expected: 全部通过；build 输出主 chunk < 250 kB，无 CSS `@import` 警告。

- [ ] **Step 2: 手工性能对照（记录到 PR 描述）**

Chrome DevTools Performance 录一次「进入课程 → 走一步 → 讲解流式完成」：

- 讲解流式期间没有周期性的长 commit（>16 ms）。
- 课程页首屏到棋盘可见的时间不包含引擎搜索。
- Network：首页无字体请求、无 react-chessboard chunk。

- [ ] **Step 3: 刷新知识图谱**

Run: `graphify update .`
Expected: `graphify-out/` 更新，无报错（AST-only）。

---

## 自检记录

- **Spec 覆盖**：A → Task 3；B → Task 2；C → Task 4/5/6 + Task 2 的 flusher；D → Task 1；E → Task 8；F → Task 7；G → Task 9；H → Task 10。spec A 中的 `<link rel="preload">` 已从 spec 移除（Worker 内的 fetch 不消费文档级 preload，改由首页预热引擎达到同样效果）。
- **类型一致性**：`evalAfterFromLines(analysis, userUci): number | null`（Task 7 定义，Task 8 使用，视角为走子后行棋方）；`Difficulty.moveTimeMs`（Task 7）；`useSession` / `useExplore` 签名沿用现有；`snapshotStorage.get<T>/set<T>/remove`（Task 10）。
- **已知风险**：Task 5 / 6 涉及正在被其他 agent 修改的页面文件，实施者必须以当时的文件内容为准，只替换订阅方式与右栏组件，不动布局与文案。

---

## 追加任务（2026-09-06，用户要求）

审查「按要求练习」（`src/lessons/customDrill.ts`，用户确认为有意加入的功能）的结论：JSON 抽取、着法合法性过滤、测试覆盖都可用。三个问题：① 所有开局练习（含自定义）的会话在「我的分析」里点开会跳到 `/lesson/drill/...` 而 `lessonById` 不认识 `drill/` 前缀，显示「找不到课程」；自定义练习即使路由修好也恢复不了，因为模型生成的 `opponentBook` 没有持久化。② `tabiyaFromBookLine` 在主变不足 2 步时回退到写死的 `['d4','d5']`，与用户要求无关。③ 模型常输出 `0-0` 记法，`sanitizeOpponentBook` 会把整条线丢掉。以下 Task 12 修这三项；Task 13 把 chess.js 挤出首页 chunk；Task 14 是 Task 10 的异步重设计。顺序：13 → 12 → 14。

### Task 13: 把 chess.js 挤出首页 chunk

**Files:**
- Create: `src/lessons/drillLesson.ts`
- Modify: `src/lessons/openingDrills.ts`、`src/lessons/customDrill.ts`、`src/pages/OpeningDrillPage.tsx`
- Modify tests: `tests/openingDrills.test.ts`、`tests/session.test.ts`（仅 import 路径）

**Interfaces:**
- Produces: `src/lessons/drillLesson.ts` 导出 `fenAfterSans(startFen, sans): string`、`drillToLesson(drill, color, startMode?): Lesson`（函数体从 `openingDrills.ts` 原样搬过来），以及新增 `parseDrillLessonId(id: string): { drillId: string; color: Color; startMode: DrillStartMode } | null`（Task 12 使用）。`openingDrills.ts` 只剩类型、`OPENING_DRILLS` 数据、`openingDrillById`，不再 import `chess.js` 与 `../chess/pgn`。

- [ ] **Step 1: 失败测试**

新建 `tests/drillLesson.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import { drillToLesson, parseDrillLessonId } from '../src/lessons/drillLesson';
import { openingDrillById } from '../src/lessons/openingDrills';

describe('parseDrillLessonId', () => {
  it('与 drillToLesson 生成的 id 往返一致', () => {
    const drill = openingDrillById('london')!;
    for (const color of ['w', 'b'] as const) {
      for (const mode of ['from-start', 'tabiya'] as const) {
        const lesson = drillToLesson(drill, color, mode);
        expect(parseDrillLessonId(lesson.id)).toEqual({ drillId: 'london', color, startMode: mode });
      }
    }
  });
  it('非 drill id 返回 null', () => {
    expect(parseDrillLessonId('opening/italian-game')).toBeNull();
    expect(parseDrillLessonId('drill/x')).toBeNull();
  });
});
```

Run: `npx vitest run tests/drillLesson.test.ts` → FAIL（模块不存在）。

- [ ] **Step 2: 实现**

`src/lessons/drillLesson.ts`：把 `openingDrills.ts` 里的 `import { Chess } from 'chess.js'`、`import { START_FEN } from '../chess/pgn'`、`fenAfterSans`、`drillToLesson` 整体搬入（`OpeningDrill`、`DrillStartMode`、`Color`、`Lesson` 用 `import type`），并追加：

```ts
export function parseDrillLessonId(id: string): { drillId: string; color: Color; startMode: DrillStartMode } | null {
  const m = /^drill\/(.+)\/(w|b)\/(start|tabiya)$/.exec(id);
  if (!m) return null;
  return { drillId: m[1], color: m[2] as Color, startMode: m[3] === 'start' ? 'from-start' : 'tabiya' };
}
```

改 import：`customDrill.ts` 的 `fenAfterSans` 从 `./drillLesson`；`OpeningDrillPage.tsx` 的 `drillToLesson` 从 `../lessons/drillLesson`（`openingDrillById`、类型仍从 `openingDrills`）；`tests/openingDrills.test.ts` 与 `tests/session.test.ts` 的 `drillToLesson` / `fenAfterSans` 改从 `../src/lessons/drillLesson`。

- [ ] **Step 3: 验证**

`npm run typecheck && npm test` 全绿；`npm run build 2>&1 | grep "dist/assets/index-"` 主 chunk 应低于 250 kB（预期约 243 kB）。若仍高于 250 kB，在报告里列出首页 chunk 里剩余的大模块，不再继续拆。

- [ ] **Step 4: Commit**

```bash
git add src/lessons/drillLesson.ts src/lessons/openingDrills.ts src/lessons/customDrill.ts src/pages/OpeningDrillPage.tsx tests/drillLesson.test.ts tests/openingDrills.test.ts tests/session.test.ts
git commit -m "perf: 开局练习的 chess.js 逻辑拆到 drillLesson，首页 chunk 不再含 chess.js"
```

---

### Task 12: 开局练习会话可从「我的分析」恢复；自定义练习持久化开局书；customDrill 小修

**Files:**
- Modify: `src/store/gameSessions.ts`（`SessionMeta.drill`、`newLesson` 第三参数）
- Modify: `src/pages/AnalysesPage.tsx`（`openSession`）
- Modify: `src/pages/OpeningDrillPage.tsx`（`?session=` 恢复）
- Modify: `src/lessons/customDrill.ts`
- Tests: `tests/gameSessions.test.ts`、`tests/customDrill.test.ts`

**Interfaces:**
- Consumes: Task 13 的 `parseDrillLessonId`、`drillToLesson`；`openingDrillById`；`bootLessonSession`；`openingOpponentById`。
- Produces: `SessionMeta.drill?: OpeningDrill`（仅自定义练习写入）；`newLesson(lessonId: string, title: string, extra?: { drill?: OpeningDrill }): string`。

- [ ] **Step 1: 失败测试**

`tests/customDrill.test.ts` 追加：

```ts
  it('sanitizeOpponentBook 把 0-0 / 0-0-0 归一为 O-O / O-O-O', () => {
    const book = sanitizeOpponentBook([['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', '0-0', 'Nf6', 'd3', '0-0']]);
    expect(book[0][6]).toBe('O-O');
    expect(book[0][9]).toBe('O-O');
  });

  it('tabiyaFromBookLine 主变不足 2 步时抛错，而不是回退到 d4 d5', () => {
    expect(() => tabiyaFromBookLine(['e4'])).toThrow();
  });
```

`tests/gameSessions.test.ts` 追加：

```ts
  it('newLesson 可附带自定义练习定义，保存在 meta 上', () => {
    const drill = { id: 'custom', title: 'T', summary: '', theme: '', keyIdeas: [], principleIds: [], whiteTabiyaLine: ['e4', 'e5'], blackStartLine: ['e4'], opponentBook: [['e4', 'e5']], userPlies: 12 };
    const id = useGameSessions.getState().newLesson('drill/custom/w/start', '自定义', { drill });
    expect(useGameSessions.getState().metas[id].drill?.opponentBook).toEqual([['e4', 'e5']]);
    const plain = useGameSessions.getState().newLesson('drill/london/w/start', '伦敦');
    expect(useGameSessions.getState().metas[plain].drill).toBeUndefined();
  });
```

Run 两个文件 → FAIL。

- [ ] **Step 2: 实现**

`customDrill.ts`：

```ts
function normalizeSan(s: string): string {
  return s.trim().replace(/^0-0-0$/, 'O-O-O').replace(/^0-0$/, 'O-O');
}
```
`sanitizeOpponentBook` 内 `line.map((s) => String(s).trim())` 改为 `line.map((s) => normalizeSan(String(s)))`。`tabiyaFromBookLine` 开头 `if (line.length < 2) throw new Error('开局书主变太短，请让模型给出至少两步');`，并删除 `: ['d4', 'd5']` 回退，直接 `whiteTabiyaLine: line.slice(0, whiteLen)`。

`gameSessions.ts`：`SessionMeta` 加 `drill?: OpeningDrill;`（`import type { OpeningDrill } from '../lessons/openingDrills'`）；`newLesson(lessonId, title, extra?)` 构造 meta 时 `...(extra?.drill ? { drill: extra.drill } : {})`；接口签名同步。

`OpeningDrillPage.tsx`：
- `start()` 里 `gs.newLesson(lesson.id, sessionLabel(...))` 改为 `gs.newLesson(lesson.id, sessionLabel(...), isCustom ? { drill: ready } : undefined)`。
- 新增 `?session=` 恢复：`const [searchParams, setSearchParams] = useSearchParams(); const sessionParam = searchParams.get('session');`，一个 `useEffect([sessionParam, rawId])`：

```ts
  useEffect(() => {
    if (!sessionParam) return;
    let cancelled = false;
    (async () => {
      const gs = useGameSessions.getState();
      const meta = gs.metas[sessionParam];
      const parsed = meta?.kind === 'lesson' && meta.lessonId ? parseDrillLessonId(meta.lessonId) : null;
      if (!meta || !parsed || parsed.drillId !== rawId) { setStartError('该练习会话无法恢复'); return; }
      const source = parsed.drillId === CUSTOM_DRILL_ID ? meta.drill : openingDrillById(parsed.drillId);
      if (!source) { setStartError('该练习的开局书已丢失，无法恢复'); return; }
      setBusy(true);
      setStatus('正在恢复练习…');
      try {
        const lesson = drillToLesson(source, parsed.color, parsed.startMode);
        const snap = gs.getLessonSnapshot(sessionParam);
        const difficulty = openingOpponentById(snap?.difficultyId ?? oppId);
        gs.setActiveLesson(sessionParam);
        setColor(parsed.color);
        setStartMode(parsed.startMode);
        setOppId(difficulty.id);
        setPlayDrill(source);
        setExpectedLessonId(lesson.id);
        const s = await bootLessonSession(lesson, difficulty);
        if (cancelled) return;
        setStore(s);
        setPhase('play');
        setSearchParams({}, { replace: true });
      } catch (e) {
        if (!cancelled) setStartError(String(e).replace(/^Error:\s*/, ''));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionParam, rawId]);
```
把这个 effect 放在现有「rawId 变化时重置」的 effect 之后。`startError` 目前只在 `!isCustom` 分支显示，改为两种模式都显示。

`AnalysesPage.tsx` 的 `openSession`：

```ts
    if (m.lessonId) {
      const drill = parseDrillLessonId(m.lessonId);
      if (drill) {
        navigate(`/drill/${encodeURIComponent(drill.drillId)}?session=${encodeURIComponent(m.id)}`);
        return;
      }
      navigate(`/lesson/${encodeURIComponent(m.lessonId)}?session=${encodeURIComponent(m.id)}`);
    }
```

- [ ] **Step 3: 验证**

`npm run typecheck && npm test` 全绿。手工：开始一个伦敦练习和一个自定义练习各走两步 → 首页「我的分析」→ 点开两者都恢复到原局面，对手继续按书行棋。

- [ ] **Step 4: Commit**

```bash
git add src/store/gameSessions.ts src/pages/AnalysesPage.tsx src/pages/OpeningDrillPage.tsx src/lessons/customDrill.ts tests/gameSessions.test.ts tests/customDrill.test.ts
git commit -m "fix: 开局练习会话可从我的分析恢复；自定义练习持久化开局书；SAN 0-0 归一"
```

---

### Task 14: 会话快照按会话分文件存储（异步，基于平台适配器；取代 Task 10）

**Files:**
- Create: `src/store/snapshotStorage.ts`、`src/store/sessionSummary.ts`
- Modify: `src/store/gameSessions.ts`、`src/store/sessionInstance.ts`、`src/store/exploreInstance.ts`、`src/pages/AnalysesPage.tsx`
- Tests: `tests/snapshotStorage.test.ts`、`tests/gameSessions.test.ts`

**Interfaces:**
- Consumes: `createPlatformStorage('large')`（`StateStorage`，`getItem` 可能返回 Promise）。
- Produces:

```ts
// src/store/snapshotStorage.ts
export const SNAPSHOT_KEY_PREFIX = 'chess-trainer-session-';   // 文件名不能含冒号
export interface SnapshotStorage {
  peek<T>(id: string): T | null;              // 同步，只看内存缓存
  load<T>(id: string): Promise<T | null>;     // 读穿：缓存没有则从 backend 读并缓存
  set<T>(id: string, snap: T): void;          // 写缓存 + 异步写 backend，写入 Promise 被记录
  remove(id: string): void;
  flush(): Promise<void>;                     // 等待所有在途写入
}
export function createSnapshotStorage(backend: StateStorage): SnapshotStorage;
export const snapshotStorage: SnapshotStorage;  // 默认 backend = createPlatformStorage('large')
export function __setSnapshotStorageForTests(s: SnapshotStorage): void;

// src/store/sessionSummary.ts（从 AnalysesPage 搬出）
export function exploreSummary(snap: ExploreSnapshot | null | undefined): string;
export function lessonSummary(snap: LessonSnapshot | null | undefined): string;

// gameSessions
SessionMeta.summary?: string;                          // 保存快照时计算
loadSnapshot(id: string): Promise<void>;               // 新增 store 方法
getExploreSnapshot / getLessonSnapshot → snapshotStorage.peek
```

- [ ] **Step 1: 失败测试**

`tests/snapshotStorage.test.ts`：

```ts
import { describe, it, expect } from 'vitest';
import type { StateStorage } from 'zustand/middleware';
import { createSnapshotStorage, SNAPSHOT_KEY_PREFIX } from '../src/store/snapshotStorage';

function asyncBackend() {
  const m = new Map<string, string>();
  let writes = 0;
  const s: StateStorage & { m: Map<string, string>; writes(): number } = {
    m,
    writes: () => writes,
    getItem: async (k) => m.get(k) ?? null,
    setItem: async (k, v) => { await new Promise((r) => setTimeout(r, 5)); writes++; m.set(k, v); },
    removeItem: async (k) => { m.delete(k); },
  };
  return s;
}

describe('snapshotStorage', () => {
  it('set 立即可 peek，flush 后落到 backend，每个会话一个 key', async () => {
    const b = asyncBackend();
    const s = createSnapshotStorage(b);
    s.set('a', { x: 1 });
    s.set('b', { x: 2 });
    expect(s.peek<{ x: number }>('a')).toEqual({ x: 1 });
    expect(b.m.size).toBe(0);
    await s.flush();
    expect([...b.m.keys()].sort()).toEqual([`${SNAPSHOT_KEY_PREFIX}a`, `${SNAPSHOT_KEY_PREFIX}b`]);
    const rawB = b.m.get(`${SNAPSHOT_KEY_PREFIX}b`);
    s.set('a', { x: 3 });
    await s.flush();
    expect(b.m.get(`${SNAPSHOT_KEY_PREFIX}b`)).toBe(rawB);
  });
  it('load 读穿并缓存；缺失与坏 JSON 返回 null', async () => {
    const b = asyncBackend();
    b.m.set(`${SNAPSHOT_KEY_PREFIX}a`, '{"x":1}');
    b.m.set(`${SNAPSHOT_KEY_PREFIX}bad`, '{nope');
    const s = createSnapshotStorage(b);
    expect(s.peek('a')).toBeNull();
    expect(await s.load<{ x: number }>('a')).toEqual({ x: 1 });
    expect(s.peek<{ x: number }>('a')).toEqual({ x: 1 });
    expect(await s.load('missing')).toBeNull();
    expect(await s.load('bad')).toBeNull();
  });
  it('remove 清缓存并删 backend', async () => {
    const b = asyncBackend();
    const s = createSnapshotStorage(b);
    s.set('a', { x: 1 });
    await s.flush();
    s.remove('a');
    await s.flush();
    expect(s.peek('a')).toBeNull();
    expect(b.m.has(`${SNAPSHOT_KEY_PREFIX}a`)).toBe(false);
  });
});
```

`tests/gameSessions.test.ts`：`beforeEach` 改为

```ts
import { createSnapshotStorage, __setSnapshotStorageForTests, SNAPSHOT_KEY_PREFIX } from '../src/store/snapshotStorage';
import { migrateGameSessions } from '../src/store/gameSessions';
// asyncBackend 同上（可放到 tests/helpers/asyncBackend.ts 共用）
let backend: ReturnType<typeof asyncBackend>;
beforeEach(() => {
  backend = asyncBackend();
  __setSnapshotStorageForTests(createSnapshotStorage(backend));
  useGameSessions.setState({ metas: {}, activeExploreId: null, activeLessonId: null });
});
```
原有用例里 `exploreData` / `lessonData` 的读取改用 `getExploreSnapshot` / `getLessonSnapshot`。追加：

```ts
  it('保存会话 A 不重写会话 B；meta.summary 随保存更新', async () => {
    const gs = useGameSessions.getState();
    const a = gs.newExplore('A'); const b = gs.newExplore('B');
    const snap = { startFen: START_FEN, tree: createEmptyTree(), path: [], reviewDepth: null, orientation: 'white' as const, commentary: '', commentaryPly: null, followUps: {} };
    gs.saveExploreSnapshot(b, snap);
    await gs.flushPendingSave();
    const rawB = backend.m.get(`${SNAPSHOT_KEY_PREFIX}${b}`);
    gs.saveExploreSnapshot(a, snap);
    await gs.flushPendingSave();
    expect(backend.m.get(`${SNAPSHOT_KEY_PREFIX}${b}`)).toBe(rawB);
    expect(useGameSessions.getState().metas[a].summary).toBe('起始局面');
  });
  it('deleteSession 删除快照 key', async () => { /* newExplore → save → flush → deleteSession → flush → backend.m.has(...) false */ });
  it('migrate 把旧 exploreData / lessonData 搬进 snapshotStorage 并补 summary', async () => {
    const migrated = migrateGameSessions({
      metas: { e1: { id: 'e1', kind: 'explore', title: 'e', updatedAt: 'x' } },
      exploreData: { e1: { startFen: START_FEN, tree: createEmptyTree(), path: [], reviewDepth: null, orientation: 'white', commentary: 'old', commentaryPly: null, followUps: {} } },
      lessonData: {}, activeExploreId: 'e1', activeLessonId: null,
    }, 0);
    expect((migrated as { exploreData?: unknown }).exploreData).toBeUndefined();
    expect(migrated.metas.e1.summary).toBe('起始局面');
    expect(useGameSessions.getState().getExploreSnapshot('e1')?.commentary).toBe('old');
    await useGameSessions.getState().flushPendingSave();
    expect(backend.m.has(`${SNAPSHOT_KEY_PREFIX}e1`)).toBe(true);
  });
```

- [ ] **Step 2: 实现 snapshotStorage**

```ts
import type { StateStorage } from 'zustand/middleware';
import { createPlatformStorage } from '../platform/storage';

export const SNAPSHOT_KEY_PREFIX = 'chess-trainer-session-';

export interface SnapshotStorage { /* 见 Interfaces */ }

export function createSnapshotStorage(backend: StateStorage): SnapshotStorage {
  const cache = new Map<string, unknown>();
  const pending = new Set<Promise<unknown>>();
  const track = (p: Promise<unknown>) => {
    const guarded = p.catch((e) => console.error('[snapshotStorage] 写入失败', e));
    pending.add(guarded);
    void guarded.finally(() => pending.delete(guarded));
  };
  return {
    peek<T>(id: string) { return (cache.get(id) as T) ?? null; },
    async load<T>(id: string) {
      if (cache.has(id)) return cache.get(id) as T;
      const raw = await backend.getItem(SNAPSHOT_KEY_PREFIX + id);
      if (raw === null || raw === undefined) return null;
      try { const v = JSON.parse(raw) as T; cache.set(id, v); return v; } catch { return null; }
    },
    set<T>(id: string, snap: T) {
      cache.set(id, snap);
      track(Promise.resolve(backend.setItem(SNAPSHOT_KEY_PREFIX + id, JSON.stringify(snap))));
    },
    remove(id: string) {
      cache.delete(id);
      track(Promise.resolve(backend.removeItem(SNAPSHOT_KEY_PREFIX + id)));
    },
    async flush() { while (pending.size > 0) await Promise.all([...pending]); },
  };
}

let current: SnapshotStorage = createSnapshotStorage(createPlatformStorage('large'));
export const snapshotStorage: SnapshotStorage = {
  peek: (id) => current.peek(id), load: (id) => current.load(id), set: (id, s) => current.set(id, s),
  remove: (id) => current.remove(id), flush: () => current.flush(),
};
export function __setSnapshotStorageForTests(s: SnapshotStorage) { current = s; }
```

- [ ] **Step 3: 改 gameSessions**

- 删除 state 里的 `exploreData` / `lessonData`；`SessionMeta` 加 `summary?: string`。
- `saveExploreSnapshot(id, snap, title)`：`snapshotStorage.set(id, snap)`，meta 更新 `title`、`updatedAt`、`summary: exploreSummary(snap)`。`saveLessonSnapshot` 同理用 `lessonSummary`。
- `saveAsExplore/saveAsLesson`：数据来自 `snapshotStorage.peek(fromId)`，为 null 则返回 null（fromId 是活动会话，一定已加载）。
- `deleteSession`：`snapshotStorage.remove(id)`。
- `getExploreSnapshot/getLessonSnapshot`：`snapshotStorage.peek`。
- 新方法 `async loadSnapshot(id) { await snapshotStorage.load(id); }`。
- `flushPendingSave`：`await Promise.all([gameSessionStorage.flush(), snapshotStorage.flush()])`（模块级函数与 store 方法都改）。
- `export function migrateGameSessions(persisted: unknown, version: number)`：`version < 1` 时把 `exploreData` / `lessonData` 逐条 `snapshotStorage.set`，并给对应 meta 填 `summary`；返回 `{ metas, activeExploreId, activeLessonId }`。
- persist 配置：`version: 1`、`partialize: (s) => ({ metas: s.metas, activeExploreId: s.activeExploreId, activeLessonId: s.activeLessonId })`、`migrate: (p, v) => migrateGameSessions(p, v) as unknown as GameSessionsState`。

- [ ] **Step 4: 改调用方**

- `sessionInstance.ts` `bootLessonSession` / `switchLessonSession`：读 `getLessonSnapshot(id)` 之前 `await gs.loadSnapshot(id)`。
- `exploreInstance.ts` `getExploreStore` / `switchExploreSession`：同样先 `await gs.loadSnapshot(id)`；`attachExploreAutosave` 的比较改为 `JSON.stringify(gs.getExploreSnapshot(id)) === json`。
- `AnalysesPage.tsx`：删除 `exploreData` / `lessonData` 订阅与本地 `exploreSummary` / `lessonSummary`，列表显示 `m.summary ?? (m.kind === 'explore' ? '空分析' : '课程练习')`。
- Task 12 的 `OpeningDrillPage` 恢复流程：读 `getLessonSnapshot(sessionParam)` 之前 `await gs.loadSnapshot(sessionParam)`。
- 全局 `grep -rn "exploreData\|lessonData" src tests` 清零。

- [ ] **Step 5: 验证**

`npm run typecheck && npm test` 全绿。手工：用上一版构建创建 2 个探索、1 个课程、1 个开局练习会话 → 切到新构建刷新 → 列表摘要、内容、恢复都正常；Application → Local Storage 出现 `chess-trainer-session-<id>` 条目，`chess-trainer-game-sessions` 只剩 metas；走几步只更新当前会话的 key。

- [ ] **Step 6: Commit**

```bash
git add src/store/snapshotStorage.ts src/store/sessionSummary.ts src/store/gameSessions.ts src/store/sessionInstance.ts src/store/exploreInstance.ts src/pages/AnalysesPage.tsx src/pages/OpeningDrillPage.tsx tests/snapshotStorage.test.ts tests/gameSessions.test.ts tests/helpers/asyncBackend.ts
git commit -m "perf: 会话快照按会话分文件异步存储（平台适配器），meta 内置摘要"
```

---

### Task 15: 调试手势加设置开关（默认关），覆盖层懒加载，原生 SSE 首包超时 120 s

**Files:**
- Modify: `src/store/settings.ts`（`debugGesturesEnabled: boolean`，默认 `false`，进 `partializeSettings`；`setDebugGesturesEnabled(v)`）
- Modify: `src/debug/DebugOverlay.tsx`（拆成 `DebugOverlay` 宿主 + 懒加载的 `DebugOverlayPanel`）
- Create: `src/debug/DebugOverlayPanel.tsx`（现有覆盖层的 JSX 与复制/清空/关闭逻辑原样搬入，默认导出）
- Modify: `src/components/SettingsDialog.tsx`（开关）
- Modify: `src/llm/nativeSse.ts`（`openTimeoutMs` 默认 `120_000`）
- Tests: `tests/settings.test.ts`、`tests/debugOverlay.test.tsx`（新）、`tests/nativeSse.test.ts`（若有 60s 断言则改 120s）

**Interfaces:**
- Produces: `useSettings().debugGesturesEnabled`、`setDebugGesturesEnabled(v: boolean)`。`DebugOverlay` 行为：`chess-debug` 自定义事件（设置页「查看日志」按钮）**始终**有效；`chess-shake`、`devicemotion`、三指 `touchstart` 只在 `debugGesturesEnabled` 为 true 时监听；面板组件通过 `React.lazy(() => import('./DebugOverlayPanel'))` 在首次打开时才加载。`installDebugHooks()` 与日志缓冲保持常开（成本可忽略，按钮查看时才有内容）。

- [ ] **Step 1: 失败测试**

`tests/settings.test.ts` 追加：

```ts
  it('debugGesturesEnabled 默认关闭且被持久化', () => {
    expect(useSettings.getState().debugGesturesEnabled).toBe(false);
    useSettings.getState().setDebugGesturesEnabled(true);
    expect(partializeSettings(useSettings.getState()).debugGesturesEnabled).toBe(true);
    useSettings.getState().setDebugGesturesEnabled(false);
  });
```

`tests/debugOverlay.test.tsx`（`// @vitest-environment jsdom`，复用 `tests/helpers/renderProbe.tsx` 的 `installDomPolyfills`）：

```tsx
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { act, render, cleanup, screen } from '@testing-library/react';
import { installDomPolyfills } from './helpers/renderProbe';
import { DebugOverlay } from '../src/debug/DebugOverlay';
import { useSettings } from '../src/store/settings';
import { requestDebugOverlay } from '../src/debug/install';

function threeFingerTouch() {
  const ev = new Event('touchstart', { bubbles: true }) as Event & { touches: unknown[] };
  Object.defineProperty(ev, 'touches', { value: [{}, {}, {}] });
  window.dispatchEvent(ev);
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe('DebugOverlay 手势开关', () => {
  beforeAll(() => installDomPolyfills());
  beforeEach(() => useSettings.getState().setDebugGesturesEnabled(false));
  afterEach(() => cleanup());

  it('开关关闭时三指不弹出，「查看日志」事件仍弹出', async () => {
    render(<DebugOverlay />);
    act(() => threeFingerTouch());
    await flush();
    expect(screen.queryByText('关闭')).toBeNull();
    act(() => requestDebugOverlay(true));
    await flush();
    expect(await screen.findByText('关闭')).toBeTruthy();
  });

  it('开关打开时三指弹出', async () => {
    useSettings.getState().setDebugGesturesEnabled(true);
    render(<DebugOverlay />);
    act(() => threeFingerTouch());
    await flush();
    expect(await screen.findByText('关闭')).toBeTruthy();
  });
});
```

Run 两个文件 → FAIL。

- [ ] **Step 2: 实现**

`settings.ts`：state 增加 `debugGesturesEnabled: false` 与 `setDebugGesturesEnabled: (v) => set({ debugGesturesEnabled: v })`；`partializeSettings` 返回对象加 `debugGesturesEnabled: s.debugGesturesEnabled`；接口同步。

`DebugOverlayPanel.tsx`：把 `DebugOverlay` 里 `if (!open) return null;` 之后的整段 JSX 搬进来，签名 `export default function DebugOverlayPanel({ entries, copied, onCopy, onClear, onClose })`，或者更简单：面板自己读 `appDebugLog.list()`、自己管 `copied`，只接 `onClose`。选后者。

`DebugOverlay.tsx`：

```tsx
import { lazy, Suspense, useEffect, useState } from 'react';
import { appDebugLog } from './log';
import { createShakeDetector, motionMagnitudeG } from './shake';
import { isNative } from '../platform';
import { useSettings } from '../store/settings';

const Panel = lazy(() => import('./DebugOverlayPanel'));

export function DebugOverlay() {
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  const gestures = useSettings((s) => s.debugGesturesEnabled);

  useEffect(() => appDebugLog.subscribe(() => setTick((n) => n + 1)), []);

  // 「查看日志」按钮：始终有效
  useEffect(() => {
    const onDebug = (e: Event) => setOpen((e as CustomEvent<{ open?: boolean }>).detail?.open ?? true);
    window.addEventListener('chess-debug', onDebug);
    return () => window.removeEventListener('chess-debug', onDebug);
  }, []);

  // 摇一摇 / 三指：只在开关打开时监听
  useEffect(() => {
    if (!gestures) return;
    const toggle = () => setOpen((v) => !v);
    // ……现有的 chess-shake、devicemotion（!isNative()）、三指 touchstart/touchend 监听原样搬入，清理函数对应移除
    return () => { /* 移除全部 */ };
  }, [gestures]);

  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <Panel onClose={() => setOpen(false)} />
    </Suspense>
  );
}
```

`SettingsDialog.tsx`：在「查看日志」按钮旁加

```tsx
<label className="flex items-center gap-2 text-sm">
  <input type="checkbox" checked={debugGesturesEnabled} onChange={(e) => setDebugGesturesEnabled(e.target.checked)} />
  启用调试手势（摇一摇 / 三指触屏）
</label>
```

`nativeSse.ts`：`const openTimeoutMs = opts?.openTimeoutMs ?? 120_000;`，注释说明高推理强度模型首包可能超过 60 s。

- [ ] **Step 3: 验证**

`npm run typecheck && npm test` 全绿；`npm run build` 出现独立的 `DebugOverlayPanel-*.js` chunk，主 chunk 比 303.97 kB 小。

- [ ] **Step 4: Commit**

```bash
git add src/store/settings.ts src/debug/DebugOverlay.tsx src/debug/DebugOverlayPanel.tsx src/components/SettingsDialog.tsx src/llm/nativeSse.ts tests/settings.test.ts tests/debugOverlay.test.tsx tests/nativeSse.test.ts
git commit -m "feat: 调试手势改为设置开关（默认关），调试面板懒加载；原生 SSE 首包超时 120s"
```

---

### Task 16: 「测试连接」在没有 /models 路由的代理上回退到一次最小对话

**Files:**
- Modify: `src/llm/client.ts`（`probeLlmConnection`）
- Test: `tests/probeLlm.test.ts`

**Interfaces:**
- `probeLlmConnection(cfg, fetchImpl?)` 签名不变。行为：先 `GET {base}/models`；`2xx` 即成功；`404` 或 `405` 时改用现有 `testConnection(cfg, fetchImpl)`（流式最小对话，拿到首个 token 即成功），其错误原样抛出；其他状态码沿用 `formatLlmHttpError`；网络层异常抛 `CORS_HINT`。

背景：2026-09-06 冒烟发现用户实际使用的第三方代理 `.../openai/v1` 没有 `/models` 路由（返回 404 `Route ... not found`），导致「测试连接」永远失败，而 chat/completions 本身可用与否无从得知。

- [ ] **Step 1: 失败测试**（`tests/probeLlm.test.ts` 追加；文件里已有 `cfg` 与假 `fetch` 的写法，复用）

```ts
  it('/models 404 时回退到最小对话，对话成功即成功', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith('/models')) return new Response('{"error":"Not Found"}', { status: 404 });
      const body = 'data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n';
      return new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    await expect(probeLlmConnection(cfg, fetchImpl)).resolves.toBeUndefined();
    expect(calls.some((u) => u.endsWith('/chat/completions'))).toBe(true);
  });

  it('/models 404 且对话 400 时抛出对话的错误', async () => {
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/models')) return new Response('', { status: 404 });
      return new Response('{"error":{"message":"Internal server error"}}', { status: 400 });
    };
    await expect(probeLlmConnection(cfg, fetchImpl)).rejects.toThrow(/400/);
  });

  it('/models 200 时不再发起对话', async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => { calls.push(String(input)); return new Response('{"data":[]}', { status: 200 }); };
    await probeLlmConnection(cfg, fetchImpl);
    expect(calls).toHaveLength(1);
  });
```

- [ ] **Step 2: 实现**

`probeLlmConnection` 中 `if (!res.ok)` 分支前加：

```ts
  if (res.status === 404 || res.status === 405) {
    debugLog('info', 'llm', `probe /models ${res.status}，回退到最小对话`);
    await testConnection(cfg, fetchImpl);
    return;
  }
```

`testConnection` 定义在同文件更下方，函数声明会提升，无需移动。

- [ ] **Step 3: 验证与提交**

`npm run typecheck && npm test` 全绿。

```bash
git add src/llm/client.ts tests/probeLlm.test.ts
git commit -m "fix: 测试连接在代理无 /models 路由时回退到最小对话"
```

---

### Task 17: 调试日志保留错误正文；启动时记录原生插件可用性；NativeSse 缺失时回退 fetch；setApiKey 不再产生未处理拒绝

**Files:**
- Modify: `src/debug/install.ts`（导出 `stringifyArg`；启动时插件可用性日志）
- Modify: `src/llm/http.ts`（`llmFetch` 在插件不可用时回退）
- Modify: `src/platform/secureStore.ts`（`setApiKey` 的 `await plugin()` 移入 try）
- Modify: `src/store/settings.ts`（`void setApiKey(...)` 加 `.catch`）
- Tests: `tests/debugLog.test.ts`、`tests/llmHttp.test.ts`、`tests/secureStore.test.ts`

背景：2026-09-06 iPad 真机日志只有 `promise error @capacitor://localhost/assets/index-*.js:12:48496`，没有错误正文。原因一：WebKit 的 `Error.stack` 不含 message 行，`stringifyArg` 用 `stack || message` 丢掉了正文。原因二：该位置经 sourcemap 对应 `@capacitor/core` 的 `"<Plugin>.<method>()" is not implemented on ios` 异常，说明某个原生插件在当前安装包里缺失或方法名不匹配，但日志无法判断是哪一个。

**Interfaces:**
- `stringifyArg(v: unknown): string`：Error → `${name}: ${message}`，若 `stack` 不含 message 则追加换行 + stack；含 `code` 字段（CapacitorException）时附 ` [code]`。
- `installDebugHooks()`：原生端启动时追加一条 `debugLog('info','app','plugins NativeSse=yes SecureStorage=no …')`，名单：`NativeSse`、`SecureStorage`、`Preferences`、`Filesystem`、`App`、`Keyboard`、`StatusBar`，用 `Capacitor.isPluginAvailable(name)`。Web 端不打这条。
- `createLlmFetch(deps: { isNative(): boolean; isPluginAvailable(name: string): boolean; nativeFetch(): Promise<typeof fetch>; webFetch: typeof fetch }): typeof fetch`；`llmFetch = createLlmFetch({ isNative, isPluginAvailable: (n) => Capacitor.isPluginAvailable(n), nativeFetch: async () => { const { getNativeSsePlugin, nativeSseFetch } = await import('./nativeSse'); return nativeSseFetch(await getNativeSsePlugin()); }, webFetch: fetch })`。原生但 `NativeSse` 不可用时 `debugLog('warn','llm','NativeSse 插件不可用，回退 fetch')` 并用 `webFetch`。

- [ ] **Step 1: 失败测试**

`tests/debugLog.test.ts` 追加：

```ts
import { stringifyArg } from '../src/debug/install';

describe('stringifyArg', () => {
  it('WebKit 风格 stack 不含 message 时仍保留正文', () => {
    const e = new Error('"NativeSse.start()" is not implemented on ios');
    (e as Error & { code?: string }).code = 'UNIMPLEMENTED';
    e.stack = 'wrapper@capacitor://localhost/assets/index-abc.js:12:48496\n@capacitor://localhost/assets/index-abc.js:12:100';
    const s = stringifyArg(e);
    expect(s).toContain('is not implemented on ios');
    expect(s).toContain('UNIMPLEMENTED');
    expect(s).toContain('index-abc.js:12:48496');
  });
  it('非 Error 值按 JSON / String 输出', () => {
    expect(stringifyArg({ a: 1 })).toBe('{"a":1}');
    expect(stringifyArg('x')).toBe('x');
  });
});
```

`tests/llmHttp.test.ts` 追加：

```ts
import { createLlmFetch } from '../src/llm/http';

describe('createLlmFetch', () => {
  const okResponse = () => new Response('ok', { status: 200 });
  it('原生且插件可用时走原生 fetch', async () => {
    let nativeCalls = 0;
    const f = createLlmFetch({
      isNative: () => true,
      isPluginAvailable: () => true,
      nativeFetch: async () => async () => { nativeCalls++; return okResponse(); },
      webFetch: async () => { throw new Error('should not use web fetch'); },
    });
    await f('https://x/v1/models');
    expect(nativeCalls).toBe(1);
  });
  it('原生但插件不可用时回退 web fetch', async () => {
    let webCalls = 0;
    const f = createLlmFetch({
      isNative: () => true,
      isPluginAvailable: () => false,
      nativeFetch: async () => { throw new Error('should not load native'); },
      webFetch: async () => { webCalls++; return okResponse(); },
    });
    await f('https://x/v1/models');
    expect(webCalls).toBe(1);
  });
  it('Web 端直接用 web fetch', async () => {
    let webCalls = 0;
    const f = createLlmFetch({ isNative: () => false, isPluginAvailable: () => true, nativeFetch: async () => { throw new Error('no'); }, webFetch: async () => { webCalls++; return okResponse(); } });
    await f('https://x/v1/models');
    expect(webCalls).toBe(1);
  });
});
```

`tests/secureStore.test.ts` 的 native describe 追加：

```ts
  it('setApiKey：插件整体不可用时不抛，回退到 fallback prefs', async () => {
    const prefs = new Map<string, string>();
    configureSecureStore({
      native: true,
      plugin: { get: async () => { throw new Error('not implemented'); }, set: async () => { throw new Error('not implemented'); }, remove: async () => { throw new Error('not implemented'); } },
      fallback: { get: async ({ key }) => ({ value: prefs.get(key) ?? null }), set: async ({ key, value }) => { prefs.set(key, value); }, remove: async ({ key }) => { prefs.delete(key); } },
    });
    await expect(setApiKey('sk-x')).resolves.toBeUndefined();
    expect(prefs.get('chess-trainer-api-key')).toBe('sk-x');
  });
```

- [ ] **Step 2: 实现**

`install.ts`：

```ts
export function stringifyArg(v: unknown): string {
  if (v instanceof Error) {
    const code = (v as Error & { code?: unknown }).code;
    const head = `${v.name}: ${v.message}${code !== undefined ? ` [${String(code)}]` : ''}`;
    const stack = v.stack ?? '';
    if (!stack) return head;
    return stack.includes(v.message) && v.message ? stack : `${head}\n${stack}`;
  }
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return String(v); }
}
```

`installDebugHooks` 末尾（`import { Capacitor } from '@capacitor/core'; import { isNative } from '../platform/native';`）：

```ts
  if (isNative()) {
    const names = ['NativeSse', 'SecureStorage', 'Preferences', 'Filesystem', 'App', 'Keyboard', 'StatusBar'];
    debugLog('info', 'app', `plugins ${names.map((n) => `${n}=${Capacitor.isPluginAvailable(n) ? 'yes' : 'no'}`).join(' ')}`);
  }
```

`http.ts`：按 Interfaces 实现 `createLlmFetch`，`llmFetch` 用它构造；原生端插件可用性只检查一次并缓存结果。

`secureStore.ts` `setApiKey`：

```ts
export async function setApiKey(key: string): Promise<void> {
  try {
    const p = await plugin();
    if (!key) await withTimeout(p.remove(API_KEY_STORAGE), 800);
    else await withTimeout(p.set(API_KEY_STORAGE, key), 800);
    return;
  } catch {
    console.warn('[secureStore] Keychain 不可用，API Key 回退到 Preferences 明文存储');
  }
  // fallback 不变
}
```

`settings.ts`：`void setApiKey(partial.apiKey).catch((e) => console.warn('[settings] 保存 API Key 失败', e));`

- [ ] **Step 3: 验证与提交**

`npm run typecheck && npm test` 全绿。

```bash
git add src/debug/install.ts src/llm/http.ts src/platform/secureStore.ts src/store/settings.ts tests/debugLog.test.ts tests/llmHttp.test.ts tests/secureStore.test.ts
git commit -m "fix: 调试日志保留错误正文与插件可用性；NativeSse 缺失时回退 fetch；setApiKey 不再未处理拒绝"
```

---

### Task 18: 关键调试信息同时输出到原生控制台

**Files:**
- Modify: `src/debug/install.ts`
- Test: `tests/debugLog.test.ts`

背景：Capacitor 会把 WebView 的 `console.*` 转发到 Xcode / 模拟器日志（`⚡️  [log] - …`）。目前插件可用性与未处理拒绝只写进内存日志，连着 Xcode 或用 `simctl log stream` 时看不到，无法在没有真机交互的情况下诊断。

**Interfaces:**
- `installDebugHooks(deps?: { info?: (msg: string) => void; error?: (msg: string) => void })`：默认 `info = console.info.bind(console)`，`error` = hook 安装前保存的原始 `console.error`（不能用被 hook 后的 `console.error`，否则递归）。行为：`plugins …` 行同时 `info(...)`；`unhandledrejection` 与 `window.error` 的条目同时 `error('[debug] ' + text)`。`console.warn/error` 的 hook 不再回写控制台（它们本来就在控制台）。

- [ ] **Step 1: 失败测试**（`tests/debugLog.test.ts`，`// @vitest-environment jsdom` 只对本文件；若文件已是 node 环境且其他用例不需要 DOM，则把新用例放到新文件 `tests/debugInstall.test.ts` 并加该注释）

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { installDebugHooks } from '../src/debug/install';
import { appDebugLog } from '../src/debug/log';

describe('installDebugHooks 镜像到原生控制台', () => {
  it('unhandledrejection 同时进入内存日志与 error 输出', async () => {
    const error = vi.fn();
    installDebugHooks({ info: vi.fn(), error });
    const ev = new Event('unhandledrejection') as Event & { reason?: unknown };
    Object.defineProperty(ev, 'reason', { value: new Error('boom') });
    window.dispatchEvent(ev);
    expect(appDebugLog.list().some((e) => e.source === 'promise' && e.message.includes('boom'))).toBe(true);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});
```

- [ ] **Step 2: 实现**：按 Interfaces 改 `installDebugHooks`；`logPluginAvailability` 接收 `info` 回调并同时输出。多次调用 `installDebugHooks` 不得重复 hook `console`（用模块级 `installed` 标记，测试里第二次调用只更新回调）。

- [ ] **Step 3: 验证与提交**

`npm run typecheck && npm test` 全绿。

```bash
git add src/debug/install.ts tests/debugLog.test.ts tests/debugInstall.test.ts
git commit -m "debug: 插件可用性与未处理错误同时输出到原生控制台"
```

---

### Task 19: 「测试连接」永不挂起（整体超时 + 取消 /models 响应流）

**Files:**
- Modify: `src/llm/client.ts`（`probeLlmConnection`、`testConnection`）
- Test: `tests/probeLlm.test.ts`

背景：2026-09-06 iPad 模拟器实测，某第三方代理对错误请求返回响应头后不关闭连接。原生 `URLSession` 一直等 body 结束，`streamChat` 的 `res.text()` / 首个 token 也一直等，「测试连接」卡在「测试中…」直到 180 s 请求超时。Web 端因浏览器 fetch 会立即收尾而不受影响。此外 `probeLlmConnection` 在 `/models` 返回 404 回退时，没有取消 GET 响应流，原生连接会泄漏。

**Interfaces:**
- `probeLlmConnection(cfg, fetchImpl?)` 签名不变，新增行为：整个过程有 15 s 硬超时（`AbortController` + `setTimeout`），超时抛 `LlmError('测试连接超时：服务在 15 秒内没有完成响应，请检查服务地址与网络')`；GET `/models` 传入该 `signal`；读到状态码后若要回退（404/405），先 `res.body?.cancel()` 再走 `testConnection`，并把同一个 `signal` 透传给 `testConnection`。
- `testConnection(cfg, fetchImpl?, signal?)`：新增可选 `signal` 参数，透传给 `streamChat` 的 `opts.signal`；`gen.return()` 之外，`finally` 里 `controller`（若本函数自建）中止。默认无 signal 时行为不变。

- [ ] **Step 1: 失败测试**（`tests/probeLlm.test.ts` 追加，复用顶部 `cfg`）

```ts
  it('服务挂起（响应流永不结束）时在超时内失败，而不是无限等待', async () => {
    vi.useFakeTimers();
    const fetchImpl: typeof fetch = (input, init) => new Promise((_resolve, reject) => {
      // 永不 resolve；只在 abort 时 reject，模拟原生流被超时中止
      init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    });
    const p = probeLlmConnection(cfg, fetchImpl);
    const assertion = expect(p).rejects.toThrow(/超时/);
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    vi.useRealTimers();
  });

  it('/models 404 回退前取消 GET 响应流', async () => {
    let cancelled = false;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.endsWith('/models')) {
        const body = new ReadableStream({ cancel() { cancelled = true; } });
        return new Response(body, { status: 404 });
      }
      return new Response('data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n', { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    };
    await probeLlmConnection(cfg, fetchImpl);
    expect(cancelled).toBe(true);
  });
```

（vitest 已全局可用 `vi`；文件顶部 import 加 `vi`。现有三条 404 回退 / 200 用例仍需通过。）

- [ ] **Step 2: 实现**

`probeLlmConnection` 改为：

```ts
export async function probeLlmConnection(cfg: LlmConfig, fetchImpl: typeof fetch = llmFetch): Promise<void> {
  const url = modelsUrl(cfg.baseUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    let res: Response;
    try {
      debugLog('info', 'llm', `probe ${url}`);
      res = await fetchImpl(url, { method: 'GET', headers: { Authorization: `Bearer ${cfg.apiKey}`, Accept: 'application/json' }, signal: controller.signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw new LlmError('测试连接超时：服务在 15 秒内没有完成响应，请检查服务地址与网络');
      debugLog('error', 'llm', `probe fail ${(e as Error).message}`);
      throw new LlmError(CORS_HINT);
    }
    if (res.status === 404 || res.status === 405) {
      await res.body?.cancel().catch(() => {});
      debugLog('info', 'llm', `probe /models ${res.status}，回退到最小对话`);
      await testConnection(cfg, fetchImpl, controller.signal);
      return;
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new LlmError(formatLlmHttpError(res.status, text, cfg), res.status);
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new LlmError('测试连接超时：服务在 15 秒内没有完成响应，请检查服务地址与网络');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
```

`testConnection` 加第三参 `signal?: AbortSignal`，`streamChat(..., { …, signal })`；把 `if ((e).name === 'AbortError')` 的超时文案交给调用方（这里只透传 signal，不自建 timer）。

- [ ] **Step 3: 验证与提交**

`npm run typecheck && npm test` 全绿。

```bash
git add src/llm/client.ts tests/probeLlm.test.ts
git commit -m "fix: 测试连接加 15s 硬超时并取消 /models 响应流，避免服务挂起时无限等待"
```
