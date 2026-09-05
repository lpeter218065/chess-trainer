import { describe, it, expect, beforeEach } from 'vitest';
import { useGameSessions } from '../src/store/gameSessions';
import { createEmptyTree } from '../src/chess/moveTree';
import { START_FEN } from '../src/chess/pgn';

describe('gameSessions', () => {
  beforeEach(() => {
    useGameSessions.setState({
      metas: {},
      exploreData: {},
      lessonData: {},
      activeExploreId: null,
      activeLessonId: null,
    });
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
  });
});
