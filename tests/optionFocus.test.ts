import { describe, expect, it } from 'vitest';
import { focusFromChoice, hasBoardPreview } from '../src/campaign/optionFocus';

describe('focusFromChoice', () => {
  it('reads tap-choice ids as squares', () => {
    expect(focusFromChoice('e5', 'e5').squares).toEqual(['e5']);
    expect(focusFromChoice('d4', 'd4').squares).toEqual(['d4']);
  });

  it('pulls squares and SAN destinations out of labels', () => {
    expect(focusFromChoice('e5', '其实该走 e5，两边对齐更稳').squares).toEqual(['e5']);
    expect(focusFromChoice('a6', 'a6，挡住 Bb5').squares.sort()).toEqual(['a6', 'b5']);
    expect(focusFromChoice('nc6', 'Nc6，进古典西西里').squares).toEqual(['c6']);
    expect(focusFromChoice('attack', 'f3、Qd2，再长易位攻黑王').squares.sort()).toEqual(['d2', 'f3']);
    expect(focusFromChoice('take-e4', '你吃 e4，马正好打着后').squares).toEqual(['e4']);
  });

  it('draws a stare arrow for 兵盯', () => {
    const focus = focusFromChoice('fight', '用 c 兵盯 d4，换中心、下不对称');
    expect(focus.squares.sort()).toEqual(['c5', 'd4']);
    expect(focus.arrows).toEqual([{ from: 'c5', to: 'd4' }]);
  });

  it('stays quiet when the option is not about a square', () => {
    const focus = focusFromChoice('mate', '这样能马上将死');
    expect(hasBoardPreview(focus)).toBe(false);
  });
});
