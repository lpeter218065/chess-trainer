import type { StoreApi } from 'zustand';
import type { ExploreState } from '../../store/explore';
import { useExplore } from '../../store/exploreInstance';
import { FollowUpComposer } from '../FollowUpChat';

/** 底部追问输入框：自己订阅流式状态，页面只决定显示与否 */
export function ExploreFollowUpComposer({ store, hasKey }: { store: StoreApi<ExploreState>; hasKey: boolean }) {
  const llmStreaming = useExplore(store, (s) => s.llmStreaming);
  const followUpStreaming = useExplore(store, (s) => s.followUpStreaming);
  const followUpError = useExplore(store, (s) => s.followUpError);
  return (
    <FollowUpComposer
      disabled={!hasKey || llmStreaming || followUpStreaming}
      error={followUpError}
      onAsk={(q) => void store.getState().askFollowUp(q)}
    />
  );
}
