import type { StoreApi } from 'zustand';
import type { SessionState } from '../../store/session';
import { useSession } from '../../store/sessionInstance';
import { AssessmentPanel } from '../AssessmentPanel';
import { sideToMove } from '../../chess/notation';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';
import type { CommentaryFocusMode } from '../AnnotatedCommentary';

interface Props {
  store: StoreApi<SessionState>;
  viewedFen: string;
  historyUpToPly: string[];
  onFocus: (f: CommentaryFocus | null) => void;
  focusMode: CommentaryFocusMode;
  activeFocus: CommentaryFocus | null;
}

/** 局面判断是流式的，交给这个自订阅组件（页面只为棋盘标记读 assessment 文本） */
export function LessonAssessment({ store, viewedFen, historyUpToPly, onFocus, focusMode, activeFocus }: Props) {
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
      onSide={(sd) => {
        void store.getState().requestAssessment(sd, { fen: viewedFen, history: historyUpToPly });
      }}
      onRetry={() => store.getState().retryLastLlm()}
      onFocus={onFocus}
      focusMode={focusMode}
      activeFocus={activeFocus}
    />
  );
}
