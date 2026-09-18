import { MiniBoard } from '../MiniBoard';
import { formatCompactScore, formatMoveHeading, groupReviewBlocks } from '../../review/document';
import { playLine } from '../../review/pgnExport';
import { focusFromVariationLine } from '../../review/highlight';
import type { AnnotatedMove, ReviewBlock, ReviewDocument, VariationLine } from '../../review/types';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';
import { useT } from '../../i18n';

function VariationTree({
  lines,
  fen,
  orientation,
  idPrefix,
  depth = 0,
  onFocus,
}: {
  lines: VariationLine[];
  fen: string;
  orientation: 'white' | 'black';
  idPrefix: string;
  depth?: number;
  onFocus?: (focus: CommentaryFocus | null) => void;
}) {
  const t = useT();
  return (
    <ol className={`review-var-list ${depth > 0 ? 'is-nested' : ''}`}>
      {lines.map((line, i) => {
        const played = playLine(fen, line.moves);
        const after = played.sans.length ? played.fen : fen;
        const childLines = (line.children ?? []).map((child) => {
          const from = playLine(after, child.moves).sans.length ? after : fen;
          return { child, from };
        });
        const focusLine = () => {
          const focus = focusFromVariationLine(fen, line.moves);
          if (focus) onFocus?.(focus);
        };
        return (
          <li
            key={`${line.label ?? i}-${line.moves}`}
            className="review-var-item"
            onMouseEnter={focusLine}
            onMouseLeave={() => onFocus?.(null)}
            onClick={focusLine}
          >
            <p>
              {line.label ? <span className="review-var-label">({line.label})</span> : null}{' '}
              {line.moves ? <span className="review-var-moves">{line.moves}</span> : null}{' '}
              <span>{line.text || (i === 0 && !line.moves ? t('review.variation') : '')}</span>
            </p>
            {played.lastMove ? (
              <figure className="review-var-plate" data-testid="review-var-board">
                <MiniBoard
                  fen={played.fen}
                  orientation={orientation}
                  lastMove={played.lastMove}
                  boardId={`${idPrefix}-var-${depth}-${i}`}
                  className="aspect-square w-full"
                />
              </figure>
            ) : null}
            {childLines.map(({ child, from }, ci) => (
              <VariationTree
                key={`${i}-${ci}`}
                lines={[child]}
                fen={from}
                orientation={orientation}
                idPrefix={`${idPrefix}-${i}-${ci}`}
                depth={depth + 1}
                onFocus={onFocus}
              />
            ))}
          </li>
        );
      })}
    </ol>
  );
}

export function ReviewBook({
  startFen,
  moves,
  document,
  ply,
  orientation,
  onSelectPly,
  onFocus,
  mode = 'steps',
}: {
  startFen: string;
  moves: AnnotatedMove[];
  document: ReviewDocument | null;
  ply: number;
  orientation: 'white' | 'black';
  onSelectPly: (ply: number) => void;
  onFocus?: (focus: CommentaryFocus | null) => void;
  /** summary：总评；steps：当前步与变化；all：打印整章 */
  mode?: 'summary' | 'steps' | 'all';
}) {
  const t = useT();
  const score = formatCompactScore(startFen, moves);
  const moveByPly = new Map(moves.map((m) => [m.ply, m]));
  if (!document) return null;

  const { lead, steps } = groupReviewBlocks(document.blocks);
  let diagramIndex = 0;

  const renderBlock = (block: ReviewBlock, index: string) => {
    if (block.type === 'paragraph') {
      return (
        <p key={index} className="review-para">
          {block.text}
        </p>
      );
    }
    if (block.type === 'move') {
      const move = moveByPly.get(block.ply);
      const nag = block.nag || move?.nag || '';
      const heading = formatMoveHeading(startFen, block.ply, block.san || move?.san || '', nag);
      return (
        <section key={index} className="review-move is-current">
          <h3 className="review-move-head">{heading}</h3>
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
        <figure key={index} className="review-diagram-plate review-main-diagram">
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
    const from = moveByPly.get(block.ply)?.fenBefore;
    return (
      <div key={index} className="review-variation">
        {block.intro ? <p className="review-var-intro">{block.intro}</p> : null}
        {from ? (
          <VariationTree
            lines={block.lines}
            fen={from}
            orientation={orientation}
            idPrefix={`var-${block.ply}-${index}`}
            onFocus={onFocus}
          />
        ) : (
          <VariationTree
            lines={block.lines}
            fen={startFen}
            orientation={orientation}
            idPrefix={`var-${block.ply}-${index}`}
            onFocus={onFocus}
          />
        )}
      </div>
    );
  };

  const showSummary = mode === 'summary' || mode === 'all';
  const showSteps = mode === 'steps' || mode === 'all';
  const showAllSteps = mode === 'all';

  return (
    <article
      id={mode === 'steps' ? 'review-book' : undefined}
      className="review-book selectable-text"
      aria-label={mode === 'summary' ? t('review.summary') : t('review.book')}
    >
      {showSummary ? (
        <div className="review-lead-card">
          {document.title ? <h2 className="review-chapter-title">{document.title}</h2> : null}
          {score ? (
            <p className="review-print-score">
              <span className="review-print-score-label">{t('review.printScore')}</span>
              {score}
            </p>
          ) : null}
          {document.overview ? <p className="review-overview">{document.overview}</p> : null}
          {lead.map((block, i) => renderBlock(block, `lead-${i}`))}
        </div>
      ) : null}
      {showSteps && ply <= 0 && !showAllSteps ? (
        <p className="review-step-hint no-print">{t('review.atStart')}</p>
      ) : null}
      {showSteps
        ? steps.map((step) => {
            const active = showAllSteps || ply === step.ply;
            return (
              <div
                key={step.ply}
                className={`review-step${active && !showAllSteps ? ' is-active' : ''}`}
                data-ply={step.ply}
                hidden={!active}
              >
                <div className="review-step-card">
                  {step.blocks.map((block, i) => renderBlock(block, `${step.ply}-${i}`))}
                </div>
              </div>
            );
          })
        : null}
      {showSteps && ply > 0 && !showAllSteps && !steps.some((s) => s.ply === ply) ? (
        <p className="review-step-hint no-print">{t('review.stepEmpty')}</p>
      ) : null}
    </article>
  );
}
