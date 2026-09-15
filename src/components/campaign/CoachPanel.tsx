import type { Coach, FollowUp } from '../../campaign/types';
import { focusFromChoice, hasBoardPreview } from '../../campaign/optionFocus';
import type { CommentaryFocus } from '../../chess/commentaryMarkers';
import { useT } from '../../i18n';

export function CoachPanel({
  coach,
  onPick,
  onHover,
  onTellMe,
  onContinue,
  continueLabel,
}: {
  coach: Coach;
  onPick?: (id: string) => void;
  onHover?: (focus: CommentaryFocus | null) => void;
  onTellMe?: () => void;
  onContinue?: () => void;
  continueLabel?: string;
}) {
  const t = useT();
  const follow = coach.followUp;
  const nextLabel = continueLabel ?? t('campaign.continue');
  return (
    <div className={`campaign-coach campaign-coach-${coach.tone}`} role="status">
      <p className="campaign-prompt text-sm leading-relaxed text-ink">{coach.say}</p>
      {coach.remember && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-brass/30 bg-cream/75 px-3 py-2 text-sm font-medium text-walnut shadow-xs">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brass/20 text-brass" aria-hidden="true">
            <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor">
              <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1h7A1.5 1.5 0 0 1 13 2.5v12.25a.25.25 0 0 1-.4.2L8 11.2l-4.6 3.75a.25.25 0 0 1-.4-.2V2.5Z" />
            </svg>
          </span>
          <span>{t('campaign.ideaCard', { card: coach.remember })}</span>
        </div>
      )}
      {follow && onPick && <FollowUpBlock followUp={follow} onPick={onPick} onHover={onHover} />}
      <div className="mt-3 flex flex-wrap gap-2">
        {coach.showTellMe && onTellMe && (
          <button type="button" className="btn btn-sm" onClick={onTellMe}>
            {t('campaign.tellMe')}
          </button>
        )}
        {onContinue && !follow && (
          <button type="button" className="btn btn-primary btn-sm" onClick={onContinue}>
            {nextLabel}
          </button>
        )}
      </div>
    </div>
  );
}

export function OptionButton({
  id,
  label,
  onPick,
  onHover,
}: {
  id: string;
  label: string;
  onPick: (id: string) => void;
  onHover?: (focus: CommentaryFocus | null) => void;
}) {
  const preview = focusFromChoice(id, label);
  const previewable = hasBoardPreview(preview);
  const show = (on: boolean) => {
    if (!onHover) return;
    onHover(on && previewable ? preview : null);
  };
  return (
    <button
      type="button"
      className="btn campaign-option text-left text-sm"
      data-preview-squares={preview.squares.join(',')}
      onClick={() => onPick(id)}
      onPointerEnter={() => show(true)}
      onPointerLeave={() => show(false)}
      onPointerDown={() => show(true)}
      onPointerCancel={() => show(false)}
      onFocus={() => show(true)}
      onBlur={() => show(false)}
    >
      {label}
    </button>
  );
}

function FollowUpBlock({
  followUp,
  onPick,
  onHover,
}: {
  followUp: FollowUp;
  onPick: (id: string) => void;
  onHover?: (focus: CommentaryFocus | null) => void;
}) {
  const choices = followUp.kind === 'tap' ? followUp.choices : followUp.options.map((o) => o.id);
  const label = (id: string) => {
    if (followUp.kind === 'tap') return id;
    return followUp.options.find((o) => o.id === id)?.label ?? id;
  };
  return (
    <div className="mt-3">
      <p className="campaign-prompt text-sm font-medium text-ink">{followUp.prompt}</p>
      <div className="mt-2 flex flex-col gap-2">
        {choices.map((id) => (
          <OptionButton key={id} id={id} label={label(id)} onPick={onPick} onHover={onHover} />
        ))}
      </div>
    </div>
  );
}
