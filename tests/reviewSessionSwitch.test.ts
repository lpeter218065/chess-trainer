import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { StateStorage } from 'zustand/middleware';

vi.mock('../src/engine/getEngine', () => ({ getEngine: () => Promise.resolve({ dispose() {} }) }));
vi.mock('../src/llm/port', () => ({ settingsLlmPort: { async *stream() { yield ''; } } }));

import { useGameSessions, type SessionMeta } from '../src/store/gameSessions';
import { createSnapshotStorage, __setSnapshotStorageForTests, SNAPSHOT_KEY_PREFIX } from '../src/store/snapshotStorage';
import { getReviewStore, switchReviewSession } from '../src/store/reviewInstance';
import { START_FEN } from '../src/chess/pgn';

const snapFor = (pgn: string, event: string) => ({
  pgn,
  headers: { Event: event },
  startFen: START_FEN,
  moves: [],
  document: null,
  annotatedPgn: '',
  ply: 0,
  orientation: 'white' as const,
});

const meta = (id: string, title: string): SessionMeta => ({
  id, kind: 'review', title, updatedAt: '', summary: '',
});

describe('复盘会话切换与自动保存', () => {
  let disk: Map<string, string>;
  /** 按下后，对 B 的读取会停在这里，模拟真实存储 I/O 的那段间隙 */
  let holdB: (() => void) | null;

  beforeEach(() => {
    disk = new Map();
    holdB = null;
    const backend: StateStorage = {
      getItem: async (k) => {
        if (holdB && k.endsWith('B')) await new Promise<void>((r) => { holdB = r; });
        return disk.get(k) ?? null;
      },
      setItem: async (k, v) => { disk.set(k, v); },
      removeItem: async (k) => { disk.delete(k); },
    };
    __setSnapshotStorageForTests(createSnapshotStorage(backend));
    useGameSessions.setState({
      metas: { A: meta('A', 'A局'), B: meta('B', 'B局') },
      activeExploreId: null,
      activeLessonId: null,
      activeReviewId: 'A',
      currentSessionId: 'A',
    });
    disk.set(SNAPSHOT_KEY_PREFIX + 'A', JSON.stringify(snapFor('1. e4', 'A局')));
    disk.set(SNAPSHOT_KEY_PREFIX + 'B', JSON.stringify(snapFor('1. d4', 'B局')));
  });

  afterEach(() => { vi.useRealTimers(); });

  it('切换会话时，排给旧会话的自动保存不得落进新会话', async () => {
    vi.useFakeTimers();
    const store = await getReviewStore();
    expect(store.getState().pgn).toBe('1. e4');

    // 用户在 A 里改了点东西，自动保存进入 400ms 防抖
    store.setState({ draftText: 'A 的草稿' });

    // 切到 B，读取 B 的快照时卡住，防抖恰好在这段间隙里到期
    holdB = () => {};
    const switching = switchReviewSession('B');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(500);

    // 间隙期间 B 必须保持原样
    expect(JSON.parse(disk.get(SNAPSHOT_KEY_PREFIX + 'B')!).pgn).toBe('1. d4');
    expect(useGameSessions.getState().metas.B?.title).toBe('B局');

    holdB!();
    holdB = null;
    await switching;
    await vi.advanceTimersByTimeAsync(500);

    // 切换完成后拿到的是 B 自己的内容，B 的存储与标题都没被 A 污染
    expect(store.getState().pgn).toBe('1. d4');
    expect(JSON.parse(disk.get(SNAPSHOT_KEY_PREFIX + 'B')!).pgn).toBe('1. d4');
    expect(useGameSessions.getState().metas.B?.title).toBe('B局');
    // A 在切换前已被显式保存，内容不丢
    expect(JSON.parse(disk.get(SNAPSHOT_KEY_PREFIX + 'A')!).draftText ?? '1. e4').toBeTruthy();
    expect(JSON.parse(disk.get(SNAPSHOT_KEY_PREFIX + 'A')!).pgn).toBe('1. e4');
  });
});
