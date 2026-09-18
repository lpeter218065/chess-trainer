import { useEffect, useRef } from 'react';
import { MiniBoard } from '../MiniBoard';
import { formatCompactScore, formatMoveHeading } from '../../review/document';
import type { AnnotatedMove, ReviewBlock, ReviewDocument, VariationLine } from '../../review/types';
import { useT } from '../../i18n';

function VariationTree({ lines, depth = 0 }: { lines: VariationLine[]; depth?: number }) {
  const t = useT();
  return (
    <ol className={`review-var-list ${depth > 0 ? 'is-nested' : ''}`}>
      {lines.map((line, i) => (
        <li key={`${line.label ?? i}-${line.moves}`}>
          <p>
            {line.label ? <span className="review-var-label">({line.label})</span> : null}{' '}
            {line.moves ? <span className="review-var-moves">{line.moves}</span> : null}{' '}
            <span>{line.text || (i === 0 && !line.moves ? t('review.variation') : '')}</span>
          </p>
          {line.children && line.children.length > 0 ? <VariationTree lines={line.children} depth={depth + 1} /> : null}
        </li>
      ))}
    </ol>
  );
}

function blockPly(block: ReviewBlock): number | null {
  if (block.type === 'paragraph') return block.ply ?? null;
  return block.ply;
}

export function ReviewBook({
  startFen,
  moves,
  document,
  ply,
  orientation,
  onSelectPly,
}: {
  startFen: string;
  moves: AnnotatedMove[];
  document: ReviewDocument | null;
  ply: number;
  orientation: 'white' | 'black';
  onSelectPly: (ply: number) => void;
}) {
  const t = useT();
  const rootRef = useRef<HTMLElement>(null);
  const score = formatCompactScore(startFen, moves);
  const moveByPly = new Map(moves.map((m) => [m.ply, m]));
  let diagramIndex = 0;

  useEffect(() => {
    const current = rootRef.current?.querySelector<HTMLElement>('[data-current="true"]');
    current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [ply]);

  if (!document) return null;

  const renderBlock = (block: ReviewBlock, index: number) => {
    if (block.type === 'paragraph') {
      return (
        <p key={`p-${index}`} className="review-para">
          {block.text}
        </p>
      );
    }
    if (block.type === 'move') {
      const move = moveByPly.get(block.ply);
      const nag = block.nag || move?.nag || '';
      const heading = formatMoveHeading(startFen, block.ply, block.san || move?.san || '', nag);
      const current = ply === block.ply;
      return (
        <section
          key={`m-${block.ply}-${index}`}
          className={`review-move ${current ? 'is-current' : ''}`}
          data-current={current ? 'true' : undefined}
        >
          <button type="button" className="review-move-head" onClick={() => onSelectPly(block.ply)}>
            {heading}
          </button>
          <p className="review-move-text">{block.text}</p>
        </section>
      );
    }
    if (block.type === 'diagram') {
      diagramIndex += 1;
      const move = moveByPly.get(block.ply);
      const fen = move?.fenAfter;
      const caption = block.caption?.trim() || t('review.diagram', { n: diagramIndex });
      if (!fen) return null;
      return (
        <figure key={`d-${block.ply}-${index}`} className="review-diagram-plate">
          <button type="button" className="review-diagram-btn" onClick={() => onSelectPly(block.ply)}>
            <MiniBoard
              fen={fen}
              orientation={orientation}
              lastMove={move ? { from: move.from, to: move.to } : null}
              boardId={`review-diagram-${block.ply}-${index}`}
              className="aspect-square w-full max-w-[16rem]"
            />
          </button>
          <figcaption>{caption}</figcaption>
        </figure>
      );
    }
    return (
      <div
        key={`v-${block.ply}-${index}`}
        className={`review-variation ${ply === block.ply ? 'is-current' : ''}`}
        data-current={ply === block.ply ? 'true' : undefined}
      >
        {block.intro ? <p className="review-var-intro">{block.intro}</p> : null}
        <VariationTree lines={block.lines} />
      </div>
    );
  };

  return (
    <article ref={rootRef} className="review-book selectable-text" aria-label={t('review.book')}>
      {document.title ? <h2 className="review-chapter-title">{document.title}</h2> : null}
      {score ? (
        <p className="review-print-score">
          <span className="review-print-score-label">{t('review.printScore')}</span>
          {score}
        </p>
      ) : null}
      {document.overview ? <p className="review-overview">{document.overview}</p> : null}
      {document.blocks.map((block, i) => {
        const p = blockPly(block);
        if (p != null && p > moves.length) return null;
        return renderBlock(block, i);
      })}
    </article>
  );
}
