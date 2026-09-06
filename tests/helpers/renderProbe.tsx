import { vi } from 'vitest';
import { createElement } from 'react';

/**
 * 棋盘渲染计数。vitest 会把 `vi.mock` 提升到模块顶部执行，工厂函数里不能引用普通闭包变量
 * （会 ReferenceError），所以计数器用 `vi.hoisted` 建在提升区。
 */
const boardRenders = vi.hoisted(() => ({ n: 0 }));

vi.mock('react-chessboard', () => ({
  Chessboard: (props: { options?: { id?: string } }) => {
    boardRenders.n += 1;
    return createElement('div', { 'data-testid': 'chessboard', 'data-id': props.options?.id ?? '' });
  },
}));

/**
 * 用计数组件替换 react-chessboard 的 Chessboard。
 * mock 在本辅助模块被 import 时就已注册，所以测试文件要把本模块的 import 排在被测模块之前。
 */
export function mockChessboardWithCounter() {
  return { count: () => boardRenders.n, reset: () => { boardRenders.n = 0; } };
}

/** jsdom 不做布局，clientWidth/clientHeight 恒为 0 */
const FAKE_LAYOUT_SIDE = 600;
let layoutPatched = false;

export function installDomPolyfills() {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    class RO { observe() {} unobserve() {} disconnect() {} }
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = RO;
  }
  if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
    window.matchMedia = (() => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })) as unknown as typeof window.matchMedia;
  }
  // Board / MiniBoard 先用 ResizeObserver 量出正方形边长，量到 0 就整个不渲染 <Chessboard>。
  // jsdom 没有布局引擎，必须假装元素有尺寸，探针才数得到棋盘渲染次数。
  if (!layoutPatched && typeof HTMLElement !== 'undefined') {
    layoutPatched = true;
    for (const prop of ['clientWidth', 'clientHeight', 'offsetWidth', 'offsetHeight'] as const) {
      Object.defineProperty(HTMLElement.prototype, prop, {
        configurable: true,
        get() { return FAKE_LAYOUT_SIDE; },
      });
    }
  }
}
