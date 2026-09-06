import type { StoreApi } from 'zustand';
import type { SessionState } from '../../store/session';
import { useSession } from '../../store/sessionInstance';
import { SummaryCard } from '../SummaryCard';

interface Props {
  store: StoreApi<SessionState>;
  onRestart: () => void;
  onBack: () => void;
}

/** 总结是流式的，交给这个自订阅组件，页面不订阅 summary */
export function LessonSummary({ store, onRestart, onBack }: Props) {
  const result = useSession(store, (s) => s.result);
  const summary = useSession(store, (s) => s.summary);
  const streaming = useSession(store, (s) => s.streaming === 'summary');
  if (!result) return null;
  return (
    <SummaryCard
      outcome={result.outcome}
      reason={result.reason}
      summary={summary}
      streaming={streaming}
      onRestart={onRestart}
      onBack={onBack}
    />
  );
}
