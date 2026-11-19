import { useState } from 'react';
import { TERM_CALENDARS, type TermCalendar, buildCalendar } from '../lib/calendar';
import { getLang, t } from '../lib/i18n';
import { shareUrl } from '../lib/share';
import type { CourseCache, PlanView } from '../lib/plan';
import type { Schedule } from '../lib/store';
import { termLabel } from '../lib/weeks';

/** Days off grouped into runs with the same name, e.g. "4/30–5/5 校庆及“五一”". */
function holidayList(calendar: TermCalendar): string {
  const lang = getLang();
  const short = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`;
  const runs: { from: string; to: string; name: string }[] = [];
  for (const day of calendar.noClassDays) {
    const last = runs.at(-1);
    const previous = last && new Date(`${last.to}T00:00:00Z`);
    const next = previous && new Date(previous.getTime() + 86_400_000).toISOString().slice(0, 10);
    if (last && next === day.date && last.name === day.name[lang]) last.to = day.date;
    else runs.push({ from: day.date, to: day.date, name: day.name[lang] });
  }
  return runs
    .map((run) => `${short(run.from)}${run.to === run.from ? '' : `–${short(run.to)}`} ${run.name}`)
    .join(lang === 'zh' ? '；' : '; ');
}

const LEFT_OUT_LABELS = {
  hidden: 'leftHidden',
  noTime: 'leftNoTime',
  unknownWeeks: 'leftUnknownWeeks',
  notFound: 'leftNotFound',
} as const;

export function SharePanel({
  term,
  schedule,
  plan,
  cache,
}: {
  term: string;
  schedule: Schedule;
  plan: PlanView;
  cache: CourseCache;
}) {
  const calendar = TERM_CALENDARS[term];
  const exported = calendar ? buildCalendar(term, calendar, schedule, plan, cache) : null;
  const [linkCopied, setLinkCopied] = useState(false);
  const link = schedule.courses.length ? shareUrl(term, schedule) : null;

  const save = (content: string, type: string, extension: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${schedule.name.replace(/[\\/:*?"<>|]+/g, '_')}-${term}.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="share">
      <section>
        <h3>{t('sharing')}</h3>
        <p className="muted">{t('shareIntro')}</p>
        <p className="notice">
          {t('shareClassesOnly')}
          {schedule.events.length > 0 && <> {t('shareEventsLeftOut', { n: schedule.events.length })}</>}
        </p>
        {link ? (
          <div className="row share-link">
            <input type="text" readOnly value={link} aria-label={t('shareLinkLabel')} onFocus={(event) => event.target.select()} />
            <button
              type="button"
              className="primary"
              onClick={() =>
                navigator.clipboard.writeText(link).then(() => {
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 1500);
                })
              }
            >
              {linkCopied ? t('linkCopied') : t('copyLink')}
            </button>
          </div>
        ) : (
          <p className="muted">{t('shareEmpty')}</p>
        )}
      </section>
      <section>
        <h3>{t('calendarTitle')}</h3>
        {calendar && exported ? (
          <>
            <p className="muted">{t('calendarNote', { weeks: calendar.teachingWeeks })}</p>
            <p className="muted">{t('calendarHolidays', { list: holidayList(calendar) })}</p>
            {!calendar.makeUpsPublished && <p className="notice warn">{t('calendarMakeUps')}</p>}
            {exported.leftOut.length > 0 && (
              <div className="notice">
                {t('calendarLeftOut')}
                <ul className="plain">
                  {exported.leftOut.map((item) => (
                    <li key={`${item.label}|${item.reason}`}>
                      {item.label} — {t(LEFT_OUT_LABELS[item.reason])}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="row">
              <button
                type="button"
                className="primary"
                disabled={!exported.eventCount}
                onClick={() => save(exported.ics, 'text/calendar;charset=utf-8', 'ics')}
              >
                {t('downloadCalendar')}
              </button>
              <span className="muted">{t('calendarCount', { n: exported.eventCount })}</span>
            </div>
          </>
        ) : (
          <p className="muted">{t('calendarUnavailable', { term: termLabel(term) })}</p>
        )}
      </section>
      <section>
        <h3>{t('import')}</h3>
        <p className="muted">{t('importNote')}</p>
      </section>
    </div>
  );
}
