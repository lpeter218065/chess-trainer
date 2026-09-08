// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FollowUpComposer } from '../src/components/FollowUpChat';

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

afterEach(cleanup);

describe('FollowUpComposer interaction', () => {
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
});
