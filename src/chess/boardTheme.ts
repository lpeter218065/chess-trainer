export const BOARD_THEME_IDS = ['walnut', 'baize', 'sand', 'ocean', 'ink'] as const;
export type BoardThemeId = (typeof BOARD_THEME_IDS)[number];

export interface BoardSquares {
  light: string;
  dark: string;
  lastFrom: string;
  lastTo: string;
  select: string;
  hover: string;
  hoverArrow: string;
  target: string;
}

const THEMES: Record<BoardThemeId, BoardSquares> = {
  walnut: {
    light: '#f3e6c8',
    dark: '#b08850',
    lastFrom: 'rgba(162, 119, 50, 0.42)',
    lastTo: 'rgba(162, 119, 50, 0.64)',
    select: 'rgba(162, 119, 50, 0.50)',
    hover: 'rgba(61, 41, 30, 0.38)',
    hoverArrow: '#362216',
    target: 'radial-gradient(circle, rgba(54,34,22,0.42) 19%, transparent 21%)',
  },
  baize: {
    light: '#eee6c4',
    dark: '#769656',
    lastFrom: 'rgba(118, 150, 86, 0.45)',
    lastTo: 'rgba(186, 202, 68, 0.72)',
    select: 'rgba(186, 202, 68, 0.55)',
    hover: 'rgba(43, 76, 59, 0.38)',
    hoverArrow: '#2b4c3b',
    target: 'radial-gradient(circle, rgba(43,76,59,0.45) 19%, transparent 21%)',
  },
  sand: {
    light: '#f0d9b5',
    dark: '#b58863',
    lastFrom: 'rgba(181, 136, 99, 0.42)',
    lastTo: 'rgba(181, 136, 99, 0.62)',
    select: 'rgba(181, 136, 99, 0.5)',
    hover: 'rgba(91, 62, 38, 0.36)',
    hoverArrow: '#5b3e26',
    target: 'radial-gradient(circle, rgba(91,62,38,0.42) 19%, transparent 21%)',
  },
  ocean: {
    light: '#dce3ea',
    dark: '#6e8ba4',
    lastFrom: 'rgba(110, 139, 164, 0.42)',
    lastTo: 'rgba(90, 140, 180, 0.58)',
    select: 'rgba(90, 140, 180, 0.48)',
    hover: 'rgba(40, 64, 84, 0.36)',
    hoverArrow: '#284054',
    target: 'radial-gradient(circle, rgba(40,64,84,0.42) 19%, transparent 21%)',
  },
  ink: {
    light: '#d8d0c4',
    dark: '#5c5346',
    lastFrom: 'rgba(92, 83, 70, 0.4)',
    lastTo: 'rgba(92, 83, 70, 0.58)',
    select: 'rgba(162, 119, 50, 0.5)',
    hover: 'rgba(24, 19, 15, 0.36)',
    hoverArrow: '#18130f',
    target: 'radial-gradient(circle, rgba(24,19,15,0.42) 19%, transparent 21%)',
  },
};

export function parseBoardTheme(id: unknown): BoardThemeId {
  return BOARD_THEME_IDS.includes(id as BoardThemeId) ? (id as BoardThemeId) : 'walnut';
}

export function squaresForTheme(id: BoardThemeId): BoardSquares {
  return THEMES[id];
}
