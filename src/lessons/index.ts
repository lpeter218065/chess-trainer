import type { Lesson, Section } from './schema';
import { lesson as italian } from './data/opening/italian-game';
import { lesson as sicilian } from './data/opening/open-sicilian';
import { lesson as qgd } from './data/opening/qgd';
import { lesson as london } from './data/opening/london';
import { lesson as iqp } from './data/middlegame/iqp-attack';
import { lesson as minority } from './data/middlegame/minority-attack';
import { lesson as openFile } from './data/middlegame/open-file';
import { lesson as oppCastling } from './data/middlegame/opposite-castling';
import { lesson as kpk } from './data/endgame/kp-vs-k';
import { lesson as lucena } from './data/endgame/lucena';
import { lesson as philidor } from './data/endgame/philidor';
import { lesson as krk } from './data/endgame/kr-vs-k';

export const LESSONS: Lesson[] = [
  italian, sicilian, qgd, london,
  iqp, minority, openFile, oppCastling,
  kpk, lucena, philidor, krk,
];

export function lessonById(id: string): Lesson | undefined {
  return LESSONS.find((l) => l.id === id);
}

export function lessonsBySection(section: Section): Lesson[] {
  return LESSONS.filter((l) => l.section === section);
}

export type { Lesson, Section } from './schema';
