import { useState } from 'react';
import { t } from '../lib/i18n';
import type { PersonalEvent } from '../lib/store';
import { useModal } from '../lib/useModal';
import { ALL_WEEKS, PERIODS, TERM_WEEKS, WEEKDAYS, dayName, formatWeeks, parseWeekList, periodLabel } from '../lib/weeks';

interface EventDialogProps {
  initial: PersonalEvent;
  isNew: boolean;
  colors: string[];
  onSave: (event: PersonalEvent) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function EventDialog({ initial, isNew, colors, onSave, onDelete, onClose }: EventDialogProps) {
  const { ref: dialog, close } = useModal(onClose);
  const [draft, setDraft] = useState(initial);
  const [weeksText, setWeeksText] = useState(
    initial.weekMask === ALL_WEEKS ? `1-${TERM_WEEKS}` : formatWeeks(initial.weekMask).replace(/^Weeks? /, '').replace(/周$/, ''),
  );


  const weekMask = parseWeekList(weeksText);
  const valid = draft.title.trim() && draft.days.length && draft.periodEnd >= draft.periodStart && weekMask;

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="event-title">
      <form
        method="dialog"
        onSubmit={(event) => {
          event.preventDefault();
          if (!valid) return;
          onSave({ ...draft, title: draft.title.trim(), location: draft.location.trim(), weekMask: weekMask! });
        }}
      >
        <h2 id="event-title">{isNew ? t('addEventTitle') : t('editEventTitle')}</h2>
        <label>
          {t('title')}
          <input
            required
            autoFocus
            maxLength={40}
            value={draft.title}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
        </label>
        <label>
          {t('locationOptional')}
          <input
            maxLength={60}
            value={draft.location}
            onChange={(event) => setDraft({ ...draft, location: event.target.value })}
          />
        </label>
        <fieldset>
          <legend>{t('days')}</legend>
          <div className="days">
            {WEEKDAYS.map((day) => (
              <label key={day} className="day-toggle">
                <input
                  type="checkbox"
                  checked={draft.days.includes(day)}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      days: event.target.checked
                        ? [...draft.days, day].sort()
                        : draft.days.filter((value) => value !== day),
                    })
                  }
                />
                <span>{dayName(day)}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="row">
          <label>
            {t('fromPeriod')}
            <select
              value={draft.periodStart}
              onChange={(event) => {
                const start = Number(event.target.value);
                setDraft({ ...draft, periodStart: start, periodEnd: Math.max(start, draft.periodEnd) });
              }}
            >
              {PERIODS.map((period) => (
                <option key={period} value={period}>
                  {periodLabel(period)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('toPeriod')}
            <select
              value={draft.periodEnd}
              onChange={(event) => setDraft({ ...draft, periodEnd: Number(event.target.value) })}
            >
              {PERIODS.filter((period) => period >= draft.periodStart).map((period) => (
                <option key={period} value={period}>
                  {periodLabel(period)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          {t('teachingWeeks')}
          <input
            value={weeksText}
            onChange={(event) => setWeeksText(event.target.value)}
            aria-invalid={!weekMask}
            placeholder={`e.g. 1-${TERM_WEEKS} or 1-8, 10`}
          />
          <small className={weekMask ? 'muted' : 'error'}>
            {weekMask ? formatWeeks(weekMask) : t('weeksHelp', { n: TERM_WEEKS })}
          </small>
        </label>
        <fieldset>
          <legend>{t('color')}</legend>
          <div className="swatches">
            {colors.map((color, index) => (
              <button
                type="button"
                key={color}
                className="swatch"
                style={{ background: color }}
                aria-label={t('colorN', { n: index + 1 })}
                aria-pressed={draft.color === index}
                onClick={() => setDraft({ ...draft, color: index })}
              />
            ))}
          </div>
        </fieldset>
        <div className="row end">
          {!isNew && (
            <button type="button" className="danger-outline" onClick={onDelete}>
              {t('delete')}
            </button>
          )}
          <span className="grow" />
          <button type="button" onClick={() => close()}>
            {t('cancel')}
          </button>
          <button type="submit" className="primary" disabled={!valid}>
            {t('save')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
