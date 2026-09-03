import type { Score } from '../chess/quality';

export interface InfoLine {
  depth: number;
  multipv: number;
  score: Score;
  pv: string[];
}

export function parseInfoLine(line: string): InfoLine | null {
  if (!line.startsWith('info ') || line.includes(' string ')) return null;
  const tokens = line.split(/\s+/);
  const pvIdx = tokens.indexOf('pv');
  const scoreIdx = tokens.indexOf('score');
  if (pvIdx === -1 || scoreIdx === -1) return null;
  const num = (key: string, dflt: number) => {
    const i = tokens.indexOf(key);
    return i === -1 ? dflt : Number(tokens[i + 1]);
  };
  const kind = tokens[scoreIdx + 1];
  const val = Number(tokens[scoreIdx + 2]);
  const score: Score = kind === 'mate' ? { mate: val } : { cp: val };
  return { depth: num('depth', 0), multipv: num('multipv', 1), score, pv: tokens.slice(pvIdx + 1) };
}

export function parseBestMove(line: string): string | null {
  const m = /^bestmove\s+(\S+)/.exec(line);
  if (!m || m[1] === '(none)') return null;
  return m[1];
}
