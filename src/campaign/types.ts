export type CampaignKind = 'recognize' | 'sail' | 'boss';

export interface Choice {
  id: string;
  label: string;
  correct: boolean;
}

export type FollowUp =
  | {
      kind: 'choice';
      prompt: string;
      options: Choice[];
      explainOk: string;
      explainBad: string;
    }
  | {
      kind: 'tap';
      prompt: string;
      square: string;
      choices: string[];
      explainOk: string;
      explainBad: string;
    };

export interface Coach {
  tone: 'ok' | 'retry' | 'ask' | 'done';
  say: string;
  remember?: string;
  highlights: string[];
  followUp?: FollowUp;
  showTellMe?: boolean;
}

export interface RecognizeLevel {
  kind: 'recognize';
  id: string;
  title: string;
  summary: string;
  ideaCard: string;
  fen: string;
  orientation: 'white' | 'black';
  lastMove: { from: string; to: string } | null;
  question: string;
  options: Choice[];
  explain: string;
  highlights: string[];
  followUp?: FollowUp;
}

export interface OppSoft {
  san: string;
  say: string;
  highlights: string[];
  ask: FollowUp;
  punishSans: string[];
  punishTell: string;
  punishOk: Coach;
  punishOkBySan?: Record<string, Coach>;
  punishWrong: Coach;
}

export interface SailStep {
  correctSans: string[];
  tell: string;
  correct: Coach;
  wrong: Coach;
  replyBook: string;
  replyBookBySan?: Record<string, string>;
  replyBookSay: string;
  replyBookSayBySan?: Record<string, string>;
  replyBookHighlights?: string[];
  replyBookHighlightsBySan?: Record<string, string[]>;
  replyBookFollowUp?: FollowUp;
  replyDeviate?: OppSoft | OppSoft[];
}

export interface SailLevel {
  kind: 'sail' | 'boss';
  id: string;
  title: string;
  summary: string;
  ideaCard: string;
  playerColor: 'w' | 'b';
  orientation: 'white' | 'black';
  leadSans: string[];
  steps: SailStep[];
}

export type CampaignLevel = RecognizeLevel | SailLevel;

export interface Island {
  id: string;
  title: string;
  blurb: string;
  locked?: boolean;
  levels: CampaignLevel[];
}

export interface CampaignState {
  stars: Record<string, number>;
  cards: string[];
}

export function isUnlocked(levels: CampaignLevel[], stars: Record<string, number>, levelId: string): boolean {
  const i = levels.findIndex((l) => l.id === levelId);
  if (i <= 0) return i === 0;
  const prev = levels[i - 1];
  return (stars[prev.id] ?? 0) >= 1;
}

export function scoreStars(input: { retries: number; hints: number; followUpMiss: number }): number {
  if (input.hints > 0 || input.retries > 2) return 1;
  if (input.retries > 0 || input.followUpMiss > 0) return 2;
  return 3;
}
