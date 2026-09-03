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
  return <LessonView store={store} expectedLessonId={lesson.id} difficultyId={difficultyId} onDifficulty={setDifficultyId} onBack={() => navigate('/')} />;
}

function LessonView({ store, expectedLessonId, difficultyId, onDifficulty, onBack }: { store: StoreApi<SessionState>; expectedLessonId: string; difficultyId: DifficultyId; onDifficulty(id: DifficultyId): void; onBack(): void }) {
  const s = useSession(store, (x) => x);
  // start() 在父组件 useEffect 里调用，首次渲染时 session.lesson 仍是 null
  if (!s.lesson || s.lesson.id !== expectedLessonId) {
    return <div className="p-6 text-sm text-neutral-500">正在准备课程…</div>;
  }
  const lesson = s.lesson;
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
