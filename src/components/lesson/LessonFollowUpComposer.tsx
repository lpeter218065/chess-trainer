import type { StoreApi } from 'zustand';
import type { SessionState } from '../../store/session';
import { useSession } from '../../store/sessionInstance';
import { FollowUpComposer } from '../FollowUpChat';

interface Props {
  store: StoreApi<SessionState>;
  threadId: string;
}

/** 底部追问输入框：自己订阅流式状态，页面只决定显示与线程 id */
export function LessonFollowUpComposer({ store, threadId }: Props) {
  const streaming = useSession(store, (s) => s.streaming !== null);
  const followUpStreaming = useSession(store, (s) => s.followUpStreaming);
  const followUpError = useSession(store, (s) => s.followUpError);
  return (
    <FollowUpComposer
      disabled={streaming || followUpStreaming}
      error={followUpError}
      onAsk={(q) => void store.getState().askFollowUp(threadId, q)}
    />
  );
}
