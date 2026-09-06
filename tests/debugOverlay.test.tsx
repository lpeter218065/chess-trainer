// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, beforeEach } from 'vitest';
import { act, render, cleanup, screen } from '@testing-library/react';
import { installDomPolyfills } from './helpers/renderProbe';
import { DebugOverlay } from '../src/debug/DebugOverlay';
import { useSettings } from '../src/store/settings';
import { requestDebugOverlay } from '../src/debug/install';

function threeFingerTouch() {
  const ev = new Event('touchstart', { bubbles: true }) as Event & { touches: unknown[] };
  Object.defineProperty(ev, 'touches', { value: [{}, {}, {}] });
  window.dispatchEvent(ev);
}
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 20)); });

describe('DebugOverlay 手势开关', () => {
  beforeAll(() => installDomPolyfills());
  beforeEach(() => useSettings.getState().setDebugGesturesEnabled(false));
  afterEach(() => cleanup());

  it('开关关闭时三指不弹出，「查看日志」事件仍弹出', async () => {
    render(<DebugOverlay />);
    act(() => threeFingerTouch());
    await flush();
    expect(screen.queryByText('关闭')).toBeNull();
    act(() => requestDebugOverlay(true));
    await flush();
    expect(await screen.findByText('关闭')).toBeTruthy();
  });

  it('开关打开时三指弹出', async () => {
    useSettings.getState().setDebugGesturesEnabled(true);
    render(<DebugOverlay />);
    act(() => threeFingerTouch());
    await flush();
    expect(await screen.findByText('关闭')).toBeTruthy();
  });
});
