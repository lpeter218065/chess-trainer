// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { AnnotatedCommentary } from '../src/components/AnnotatedCommentary';
import type { CommentaryFocus } from '../src/chess/commentaryMarkers';

function focusSummary(focus: CommentaryFocus | null): string {
  if (!focus) return '';
  return `${focus.squares.join(',')}|${focus.arrows.map((arrow) => `${arrow.from}-${arrow.to}`).join(',')}`;
}

function CommentaryHarness({
  text,
  streaming,
  initialFocus = null,
}: {
  text: string;
  streaming: boolean;
  initialFocus?: CommentaryFocus | null;
}) {
  const [activeFocus, setActiveFocus] = useState<CommentaryFocus | null>(initialFocus);
  return (
    <>
      <AnnotatedCommentary
        text={text}
        streaming={streaming}
        onFocus={(next) => setActiveFocus(next)}
        focusMode="tap"
        activeFocus={activeFocus}
        showHoverHint={false}
      />
      <output data-testid="focus-state">{focusSummary(activeFocus)}</output>
    </>
  );
}

function focusState(): string {
  return screen.getByTestId('focus-state').textContent ?? '';
}

afterEach(cleanup);

describe('AnnotatedCommentary tap focus', () => {
  it('preserves a highlight through append-only streaming and completion, then toggles off', () => {
    const { rerender } = render(
      <CommentaryHarness text="关键 {{e4}}" streaming />,
    );
    act(() => fireEvent.click(screen.getByRole('button', { name: '关键' })));
    expect(focusState()).toBe('e4|');

    rerender(<CommentaryHarness text="关键 {{e4}}，继续说明" streaming />);
    expect(focusState()).toBe('e4|');
    rerender(<CommentaryHarness text="关键 {{e4}}，继续说明" streaming={false} />);
    expect(focusState()).toBe('e4|');

    act(() => fireEvent.click(screen.getByRole('button', { name: '关键 ，继续说明' })));
    expect(focusState()).toBe('');
  });

  it('clears focus when text is replaced or reset, including initial mount', () => {
    const initialFocus = { squares: ['e4'], arrows: [] } satisfies CommentaryFocus;
    const { rerender } = render(
      <CommentaryHarness text="初始 {{e4}}" streaming={false} initialFocus={initialFocus} />,
    );
    expect(focusState()).toBe('');

    act(() => fireEvent.click(screen.getByRole('button', { name: '初始' })));
    expect(focusState()).toBe('e4|');

    rerender(<CommentaryHarness text="替换 {{d5}}" streaming={false} />);
    expect(focusState()).toBe('');
    act(() => fireEvent.click(screen.getByRole('button', { name: '替换' })));
    expect(focusState()).toBe('d5|');

    rerender(<CommentaryHarness text="" streaming={false} />);
    expect(focusState()).toBe('');
  });
});
