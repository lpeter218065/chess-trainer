import type { StoreApi } from 'zustand';
import type { ExploreState } from '../../store/explore';
import { useExplore } from '../../store/exploreInstance';
import { AssessmentPanel } from '../AssessmentPanel';
import { sideToMove } from '../../chess/notation';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';
import type { CommentaryFocusMode } from '../AnnotatedCommentary';

interface Props {
  store: StoreApi<ExploreState>;
  viewedFen: string;
  onFocus: (f: CommentaryFocus | null) => void;
  focusMode: CommentaryFocusMode;
  activeFocus: CommentaryFocus | null;
}

/** 局面判断是流式的，交给这个自订阅组件（页面只为棋盘标记读 assessment 文本） */
export function ExploreAssessment({ store, viewedFen, onFocus, focusMode, activeFocus }: Props) {
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
      focusMode={focusMode}
      activeFocus={activeFocus}
    />
  );
}
