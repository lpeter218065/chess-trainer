import { describe, it, expect, beforeEach } from 'vitest';
import { useGameSessions, migrateGameSessions, resolveCurrentSessionId } from '../src/store/gameSessions';
import { createSnapshotStorage, __setSnapshotStorageForTests, SNAPSHOT_KEY_PREFIX } from '../src/store/snapshotStorage';
import { createEmptyTree } from '../src/chess/moveTree';
import { START_FEN } from '../src/chess/pgn';
import { asyncBackend } from './helpers/asyncBackend';

const emptyExplore = () => ({
  startFen: START_FEN,
  tree: createEmptyTree(),
  path: [],
  reviewDepth: null,
  orientation: 'white' as const,
  commentary: '',
  commentaryPly: null,
  followUps: {},
});

describe('gameSessions', () => {
  let backend: ReturnType<typeof asyncBackend>;

  beforeEach(() => {
    backend = asyncBackend();
    __setSnapshotStorageForTests(createSnapshotStorage(backend));
    useGameSessions.setState({ metas: {}, activeExploreId: null, activeLessonId: null, currentSessionId: null });
  });

  it('newExplore sets active and saveAs clones', () => {
    const id = useGameSessions.getState().newExplore('测试探索');
    expect(useGameSessions.getState().activeExploreId).toBe(id);
    useGameSessions.getState().saveExploreSnapshot(id, {
      startFen: START_FEN,
      tree: createEmptyTree(),
      path: [],
      reviewDepth: null,
      orientation: 'white',
      commentary: 'hello',
      commentaryPly: 0,
      followUps: {},
    });
    const copy = useGameSessions.getState().saveAsExplore(id, '副本');
    expect(copy).toBeTruthy();
    expect(useGameSessions.getState().getExploreSnapshot(copy!)?.commentary).toBe('hello');
    expect(useGameSessions.getState().list('explore')).toHaveLength(2);
  });

  it('saveAsExplore 在源快照未加载时返回 null', () => {
    const id = useGameSessions.getState().newExplore('未加载');
    expect(useGameSessions.getState().saveAsExplore(id, '副本')).toBeNull();
  });

  it('ensureLessonActive reuses same lesson session', () => {
    const a = useGameSessions.getState().ensureLessonActive('opening/italian-game', '意大利');
    useGameSessions.getState().saveLessonSnapshot(a, {
      lessonId: 'opening/italian-game',
      difficultyId: 'medium',
      fen: 'x',
      history: [],
      rounds: [],
      evalHistory: [],
      evalCp: 0,
      intro: 'intro',
      summary: '',
      hintUsed: false,
      usedPrincipleIds: [],
      angleHistory: [],
      followUps: {},
      phase: 'userTurn',
      result: null,
    });
    const b = useGameSessions.getState().ensureLessonActive('opening/italian-game', '意大利');
    expect(b).toBe(a);
    expect(useGameSessions.getState().getLessonSnapshot(b)?.intro).toBe('intro');
    expect(useGameSessions.getState().metas[b].summary).toBe('已开局');
  });

  it('newLesson 可附带自定义练习定义，保存在 meta 上', () => {
    const drill = { id: 'custom', title: 'T', summary: '', theme: '', keyIdeas: [], principleIds: [], whiteTabiyaLine: ['e4', 'e5'], blackStartLine: ['e4'], opponentBook: [['e4', 'e5']], userPlies: 12 };
    const id = useGameSessions.getState().newLesson('drill/custom/w/start', '自定义', { drill });
    expect(useGameSessions.getState().metas[id].drill?.opponentBook).toEqual([['e4', 'e5']]);
    const plain = useGameSessions.getState().newLesson('drill/london/w/start', '伦敦');
    expect(useGameSessions.getState().metas[plain].drill).toBeUndefined();
  });

  it('保存会话 A 不重写会话 B；meta.summary 随保存更新', async () => {
    const gs = useGameSessions.getState();
    const a = gs.newExplore('A');
    const b = gs.newExplore('B');
    const snap = emptyExplore();
    gs.saveExploreSnapshot(b, snap);
    await gs.flushPendingSave();
    const rawB = backend.m.get(`${SNAPSHOT_KEY_PREFIX}${b}`);
    expect(rawB).toBeTruthy();
    const writesBefore = backend.writes();
    gs.saveExploreSnapshot(a, snap);
    await gs.flushPendingSave();
    expect(backend.m.get(`${SNAPSHOT_KEY_PREFIX}${b}`)).toBe(rawB);
    expect(backend.writes()).toBe(writesBefore + 1);
    expect(useGameSessions.getState().metas[a].summary).toBe('起始局面');
  });

  it('deleteSession 删除快照 key', async () => {
    const gs = useGameSessions.getState();
    const id = gs.newExplore('待删');
    gs.saveExploreSnapshot(id, emptyExplore());
    await gs.flushPendingSave();
    expect(backend.m.has(`${SNAPSHOT_KEY_PREFIX}${id}`)).toBe(true);
    useGameSessions.getState().deleteSession(id);
    await useGameSessions.getState().flushPendingSave();
    expect(backend.m.has(`${SNAPSHOT_KEY_PREFIX}${id}`)).toBe(false);
    expect(useGameSessions.getState().getExploreSnapshot(id)).toBeNull();
  });

  it('migrate 把旧 exploreData / lessonData 搬进 snapshotStorage 并补 summary', async () => {
    const migrated = migrateGameSessions(
      {
        metas: { e1: { id: 'e1', kind: 'explore', title: 'e', updatedAt: 'x' } },
        exploreData: {
          e1: {
            startFen: START_FEN,
            tree: createEmptyTree(),
            path: [],
            reviewDepth: null,
            orientation: 'white',
            commentary: 'old',
            commentaryPly: null,
            followUps: {},
          },
        },
        lessonData: {},
        activeExploreId: 'e1',
        activeLessonId: null,
      },
      0,
    );
    expect((migrated as { exploreData?: unknown }).exploreData).toBeUndefined();
    expect(migrated.metas.e1.summary).toBe('起始局面');
    expect(migrated.currentSessionId).toBe('e1');
    useGameSessions.setState(migrated);
    expect(useGameSessions.getState().getExploreSnapshot('e1')?.commentary).toBe('old');
    await useGameSessions.getState().flushPendingSave();
    expect(backend.m.has(`${SNAPSHOT_KEY_PREFIX}e1`)).toBe(true);
  });

  it('同一时刻只有一条会话是当前：后激活的覆盖标记', () => {
    const gs = useGameSessions.getState();
    const explore = gs.newExplore('探索局');
    const lesson = gs.newLesson('opening/italian-game', '意大利');
    expect(useGameSessions.getState().currentSessionId).toBe(lesson);
    gs.setActiveExplore(explore);
    expect(useGameSessions.getState().currentSessionId).toBe(explore);
    gs.setActiveLesson(lesson);
    expect(useGameSessions.getState().currentSessionId).toBe(lesson);
    expect(resolveCurrentSessionId(useGameSessions.getState())).toBe(lesson);
  });

  it('未记录 currentSessionId 时，按活动项里更新更晚的一条标记', () => {
    const id = resolveCurrentSessionId({
      metas: {
        e1: { id: 'e1', kind: 'explore', title: 'e', updatedAt: '2026-09-10T15:21:00.000Z' },
        l1: { id: 'l1', kind: 'lesson', title: 'l', updatedAt: '2026-09-10T14:07:00.000Z', lessonId: 'x' },
      },
      activeExploreId: 'e1',
      activeLessonId: 'l1',
      currentSessionId: null,
    });
    expect(id).toBe('e1');
  });
});
