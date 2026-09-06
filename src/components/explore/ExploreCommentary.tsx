import { useMemo } from 'react';
import type { StoreApi } from 'zustand';
import type { ExploreState } from '../../store/explore';
import { useExplore } from '../../store/exploreInstance';
import { exploreFollowUpThreadId } from '../../llm/prompts';
import { AnnotatedCommentary, type CommentaryFocusMode } from '../AnnotatedCommentary';
import { FollowUpChat } from '../FollowUpChat';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';

interface Props {
  store: StoreApi<ExploreState>;
  ply: number;
  hasKey: boolean;
  onFocus: (f: CommentaryFocus | null) => void;
  focusMode: CommentaryFocusMode;
  activeFocus: CommentaryFocus | null;
}

/** 当前局面的讲解正文与追问记录；只有它订阅流式字段，流式刷新不会重渲染页面其余部分 */
export function ExploreCommentary({ store, ply, hasKey, onFocus, focusMode, activeFocus }: Props) {
  const path = useExplore(store, (s) => s.path);
  const commentary = useExplore(store, (s) => s.commentary);
  const commentaryPly = useExplore(store, (s) => s.commentaryPly);
  const commentaries = useExplore(store, (s) => s.commentaries);
  const llmStreaming = useExplore(store, (s) => s.llmStreaming);
  const assessmentStreaming = useExplore(store, (s) => s.assessmentStreaming);
  const llmError = useExplore(store, (s) => s.llmError);
  const followUps = useExplore(store, (s) => s.followUps);
  const followUpStreaming = useExplore(store, (s) => s.followUpStreaming);
  const followUpDraft = useExplore(store, (s) => s.followUpDraft);
  const followUpError = useExplore(store, (s) => s.followUpError);
  const followUpThreadId = useExplore(store, (s) => s.followUpThreadId);

  const threadId = useMemo(() => exploreFollowUpThreadId(path, ply), [path, ply]);
  const text = useMemo(() => {
    if (llmStreaming && commentaryPly === ply) return commentary;
    return commentaries[threadId]?.text || (commentaryPly === ply ? commentary : '');
  }, [threadId, ply, commentaries, commentary, commentaryPly, llmStreaming]);

  const focusProps = { focusMode, activeFocus };
  return (
    <>
      <AnnotatedCommentary
        text={text}
        streaming={llmStreaming && !assessmentStreaming && commentaryPly === ply}
        placeholder=""
        onFocus={onFocus}
        {...focusProps}
      />
      {llmError && <p className="mt-2 text-xs text-danger" role="alert">{llmError}</p>}
      {text && !llmStreaming && (
        <FollowUpChat
          turns={followUps[threadId] ?? []}
          streaming={followUpStreaming && followUpThreadId === threadId}
          streamingText={followUpDraft}
          disabled={!hasKey || llmStreaming}
          error={followUpError}
          onAsk={(q) => void store.getState().askFollowUp(q)}
          onFocus={onFocus}
          hideComposer
          {...focusProps}
        />
      )}
    </>
  );
}

/** 页面判断是否显示讲解区所需的最小信息，避免页面订阅 commentary 正文 */
export function useExploreCommentaryPresence(store: StoreApi<ExploreState>, ply: number): boolean {
  return useExplore(store, (s) => {
    const tid = exploreFollowUpThreadId(s.path, ply);
    if (s.llmStreaming && s.commentaryPly === ply) return true;
    return Boolean(s.commentaries[tid]?.text) || (s.commentaryPly === ply && s.commentary.length > 0);
  });
}
