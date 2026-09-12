// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FollowUpChat, FollowUpComposer } from '../src/components/FollowUpChat';

type KeyOptions = {
  isComposing?: boolean;
  keyCode?: number;
};

function dispatchEnter(input: HTMLInputElement, options: KeyOptions = {}): void {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key: 'Enter',
  });
  if (options.isComposing !== undefined) {
    Object.defineProperty(event, 'isComposing', { configurable: true, value: options.isComposing });
  }
  if (options.keyCode !== undefined) {
    Object.defineProperty(event, 'keyCode', { configurable: true, value: options.keyCode });
  }
  input.dispatchEvent(event);
}

function setWindowSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

afterEach(() => {
  cleanup();
  setWindowSize(1280, 800);
});

describe('FollowUpComposer interaction', () => {
  beforeEach(() => setWindowSize(1280, 800));
  it('does not submit during Chinese IME composition, then submits normal Enter once', () => {
    const onAsk = vi.fn();
    render(<FollowUpComposer onAsk={onAsk} />);
    const input = screen.getByPlaceholderText('继续问教练…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '你好' } });

    act(() => dispatchEnter(input, { isComposing: true, keyCode: 13 }));
    act(() => dispatchEnter(input, { keyCode: 229 }));
    expect(onAsk).not.toHaveBeenCalled();
    expect(input.value).toBe('你好');

    act(() => dispatchEnter(input, { keyCode: 13 }));
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenCalledWith('你好');
    expect(input.value).toBe('');
  });

  it('prevents sending from all composer controls while disabled', () => {
    const onAsk = vi.fn();
    render(<FollowUpComposer disabled onAsk={onAsk} />);
    const input = screen.getByPlaceholderText('继续问教练…') as HTMLInputElement;
    const send = screen.getByRole('button', { name: '发送' }) as HTMLButtonElement;
    const chip = screen.getAllByRole('button').find((button) => button !== send) as HTMLButtonElement;

    expect(input.disabled).toBe(true);
    expect(send.disabled).toBe(true);
    expect(chip.disabled).toBe(true);

    act(() => dispatchEnter(input, { keyCode: 13 }));
    fireEvent.click(send);
    fireEvent.click(chip);
    expect(onAsk).not.toHaveBeenCalled();
  });

  it('keeps suggestion chips visible on wide screens', () => {
    render(<FollowUpComposer onAsk={vi.fn()} />);
    expect(screen.getByRole('button', { name: '对方的计划是什么？' })).toBeTruthy();
  });

  it('hides compact suggestion chips until the composer is focused', () => {
    setWindowSize(390, 844);
    render(<FollowUpComposer onAsk={vi.fn()} />);
    expect(screen.queryByRole('button', { name: '对方的计划是什么？' })).toBeNull();

    fireEvent.focus(screen.getByPlaceholderText('继续问教练…'));
    expect(screen.getByRole('button', { name: '对方的计划是什么？' })).toBeTruthy();
  });

  it('sends a compact chip while the input stays focused', () => {
    setWindowSize(390, 844);
    const onAsk = vi.fn();
    render(<FollowUpComposer onAsk={onAsk} />);
    const input = screen.getByPlaceholderText('继续问教练…');
    fireEvent.focus(input);
    const chip = screen.getByRole('button', { name: '对方的计划是什么？' });
    fireEvent.mouseDown(chip);
    fireEvent.click(chip);
    expect(onAsk).toHaveBeenCalledTimes(1);
    expect(onAsk).toHaveBeenCalledWith('对方的计划是什么？');
  });
});

describe('FollowUpChat hideComposer', () => {
  it('hides the empty follow-up chrome when the composer lives in the layout footer', () => {
    render(
      <FollowUpChat
        turns={[]}
        streaming={false}
        hideComposer
        onAsk={vi.fn()}
        onFocus={vi.fn()}
      />,
    );
    expect(screen.queryByText('继续追问')).toBeNull();
    expect(screen.queryByPlaceholderText('继续问教练…')).toBeNull();
  });

  it('still shows prior answers without a second composer when hideComposer', () => {
    render(
      <FollowUpChat
        turns={[
          { role: 'user', content: '为什么走这里' },
          { role: 'assistant', content: '控制中心' },
        ]}
        streaming={false}
        hideComposer
        onAsk={vi.fn()}
        onFocus={vi.fn()}
      />,
    );
    expect(screen.getByText('继续追问')).toBeTruthy();
    expect(screen.getByText('为什么走这里')).toBeTruthy();
    expect(screen.getByText('控制中心')).toBeTruthy();
    expect(screen.queryByPlaceholderText('继续问教练…')).toBeNull();
  });
});
