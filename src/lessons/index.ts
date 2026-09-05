import type { Lesson, Section } from './schema';
import { lesson as italian } from './data/opening/italian-game';
import { lesson as sicilian } from './data/opening/open-sicilian';
import { lesson as qgd } from './data/opening/qgd';
import { lesson as london } from './data/opening/london';
import { lesson as londonKingside } from './data/opening/london-kingside';
import { lesson as qga } from './data/opening/queens-gambit-accepted';
import { lesson as qgdExchange } from './data/opening/qgd-exchange';
import { lesson as ruyLopez } from './data/opening/ruy-lopez';
import { lesson as caroKann } from './data/opening/caro-kann';
import { lesson as kingsIndian } from './data/opening/kings-indian';
import { lesson as frenchAdvance } from './data/opening/french-advance';
import { lesson as iqp } from './data/middlegame/iqp-attack';
import { lesson as minority } from './data/middlegame/minority-attack';
import { lesson as openFile } from './data/middlegame/open-file';
import { lesson as oppCastling } from './data/middlegame/opposite-castling';
import { lesson as londonNe5 } from './data/middlegame/london-ne5';
import { lesson as qgdOrthodox } from './data/middlegame/qgd-orthodox';
import { lesson as bishopPair } from './data/middlegame/bishop-pair';
import { lesson as outpostKnight } from './data/middlegame/outpost-knight';
import { lesson as goodBadBishop } from './data/middlegame/good-bad-bishop';
import { lesson as passedPawn } from './data/middlegame/passed-pawn';
import { lesson as kpk } from './data/endgame/kp-vs-k';
import { lesson as lucena } from './data/endgame/lucena';
import { lesson as philidor } from './data/endgame/philidor';
import { lesson as krk } from './data/endgame/kr-vs-k';

export const LESSONS: Lesson[] = [
  italian, sicilian, qgd, london, londonKingside, qga, qgdExchange,
  ruyLopez, caroKann, kingsIndian, frenchAdvance,
  iqp, minority, openFile, oppCastling, londonNe5, qgdOrthodox,
  bishopPair, outpostKnight, goodBadBishop, passedPawn,
  kpk, lucena, philidor, krk,
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function lessonsBySection(section: Section): Lesson[] {
  return LESSONS.filter((l) => l.section === section);
}

export type { Lesson, Section } from './schema';
