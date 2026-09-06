import type { StoreApi } from 'zustand';
import type { SessionState } from '../../store/session';
import { useSession } from '../../store/sessionInstance';
import { CommentaryPanel } from '../CommentaryPanel';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';
import type { CommentaryFocusMode } from '../AnnotatedCommentary';

interface Props {
  store: StoreApi<SessionState>;
  activeRoundIndex: number;
  onSelectRound: (index: number) => void;
  onFocus: (f: CommentaryFocus | null) => void;
  focusMode: CommentaryFocusMode;
  activeFocus: CommentaryFocus | null;
}

/** 只有这个组件订阅讲解 / 追问的流式字段，流式期间页面其他部分不重渲染 */
export function LessonCommentary({ store, activeRoundIndex, onSelectRound, onFocus, focusMode, activeFocus }: Props) {
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
      hideComposer
      focusMode={focusMode}
      activeFocus={activeFocus}
    />
  );
}
