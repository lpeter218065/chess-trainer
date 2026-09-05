import type { ChatMessage } from './client';

/** 除 system 外最多保留的 user/assistant 条数（4 轮） */
const MAX_REST = 8;

/** 有上一次对话则续写；否则用完整 bootstrap（[system, user]） */
export function continueThread(
  prev: ChatMessage[] | undefined,
  nextUser: ChatMessage,
  bootstrap: ChatMessage[],
): ChatMessage[] {
  if (!prev || prev.length < 2) return bootstrap;
  const system = prev[0]?.role === 'system' ? prev[0] : bootstrap[0];
  const rest = prev[0]?.role === 'system' ? prev.slice(1) : prev;
  const withNext = [...rest, nextUser];
  const trimmed = withNext.length > MAX_REST ? withNext.slice(-MAX_REST) : withNext;
  return [system, ...trimmed];
}

export function recordAssistant(thread: ChatMessage[], content: string): ChatMessage[] {
  if (!content.trim()) return thread;
  return [...thread, { role: 'assistant', content }];
}
