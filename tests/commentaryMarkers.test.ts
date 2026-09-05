import { describe, it, expect } from 'vitest';
import { focusFromLine, focusFromText, parseMarkerContent, stripMarkers } from '../src/chess/commentaryMarkers';

describe('commentaryMarkers', () => {
  it('解析格子列表', () => {
    expect(parseMarkerContent('d5,c3,e4')).toEqual({
      squares: ['d5', 'c3', 'e4'],
      arrows: [],
    });
  });

  it('解析格子与箭头', () => {
    expect(parseMarkerContent('d5,c3|e2-e4')).toEqual({
      squares: ['d5', 'c3'],
      arrows: [{ from: 'e2', to: 'e4' }],
    });
  });

  it('从要点行提取焦点', () => {
    const f = focusFromLine('• {{d5,c3|e2-e4}} 黑方中心压力');
    expect(f.squares).toEqual(['d5', 'c3']);
    expect(f.arrows).toEqual([{ from: 'e2', to: 'e4' }]);
    expect(stripMarkers('• {{d5,c3}} 文本')).toBe('• 文本');
  });

  it('focusFromText 合并多行标记', () => {
    const f = focusFromText('总评 {{e4}}\n• {{d5,c3|e2-e4}} 计划\n• {{f7|d1-h5}} 战术');
    expect(f.squares).toEqual(['e4', 'd5', 'c3', 'f7']);
    expect(f.arrows).toEqual([
      { from: 'e2', to: 'e4' },
      { from: 'd1', to: 'h5' },
    ]);
  });
});
