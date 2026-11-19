import { courseName, t, tn } from '../lib/i18n';
import { type CourseCache, type PlanView, courseStatus, describeConflict, meetingPattern } from '../lib/plan';
import type { Schedule } from '../lib/store';
import { dayName, formatPeriods, formatWeeks } from '../lib/weeks';

function seat(available: string, capacity: string) {
  if (available === '' && capacity === '') return <span className="muted">{t('unknown')}</span>;
  return (
    <span className="mono">
      {available === '' ? '?' : available} / {capacity === '' ? '?' : capacity}
    </span>
  );
}

interface ReviewPanelProps {
  schedule: Schedule;
  cache: CourseCache;
  plan: PlanView;
  retrievedAt: string;
  source: string;
  onLocate: (ref: string) => void;
}

export function ReviewPanel({ schedule, cache, plan, retrievedAt, source, onLocate }: ReviewPanelProps) {
  return (
    <div className="review">
      <section>
        <h3>{t('conflicts')}</h3>
        {plan.conflicts.length === 0 ? (
          <p className="muted">{t('noConflicts')}</p>
        ) : (
          <ul className="conflicts">
            {plan.conflicts.map((conflict) => (
              <li key={conflict.key} className={conflict.overlap == null ? 'possible' : undefined}>
                <span>{describeConflict(conflict)}</span>
                <button type="button" className="link" onClick={() => onLocate(conflict.refs[0])}>
                  {t('showOnGridLink')}
                </button>
              </li>
            ))}
          </ul>
        )}
        {plan.incomplete.size > 0 && (
          <p className="notice warn">{t('incompleteFor', { list: [...plan.incomplete].join(', ') })}</p>
        )}
        <p className="muted small">{t('transitionNote')}</p>
      </section>

      <section>
        <h3>
          {t('coursesHeading')}{' '}
          <small>
            {tn(plan.courseCount, 'course1', 'courses')} · {tn(plan.credits, 'credit1', 'credits')}
          </small>
        </h3>
        <p className="muted small">{t('seatSource', { source, date: retrievedAt })}</p>
        <ul className="review-list">
          {schedule.courses.map((planned) => {
            const status = courseStatus(planned, cache);
            if (status.kind !== 'ok') {
              return (
                <li key={planned.courseNumber} className="card-warning">
                  {planned.courseNumber}-{planned.sectionNumber}:{' '}
                  {status.kind === 'loading'
                    ? t('loadingShort')
                    : status.kind === 'missing-course'
                      ? t('missingCourseShort')
                      : t('missingSectionShort')}
                </li>
              );
            }
            const { course, section } = status;
            return (
              <li key={planned.courseNumber}>
                <p>
                  <strong>
                    {course.course_number} · {t('sectionN', { n: section.section_number })}
                  </strong>{' '}
                  {courseName(course)}
                  {planned.hidden && <span className="tag">{t('hiddenOnGrid')}</span>}
                </p>
                <dl className="facts">
                  <dt>{t('instructor')}</dt>
                  <dd>{section.instructors || '—'}</dd>
                  <dt>{t('creditsLabel')}</dt>
                  <dd>{section.credits || t('unknown')}</dd>
                  <dt>{t('meetings')}</dt>
                  <dd>
                    {meetingPattern(section)}
                    {plan.incomplete.has(planned.courseNumber) && <span className="tag warn">{t('incompleteTag')}</span>}
                  </dd>
                  <dt>{t('ugSeats')}</dt>
                  <dd>{seat(section.undergrad_available, section.undergrad_capacity)}</dd>
                  <dt>{t('gradSeats')}</dt>
                  <dd>{seat(section.graduate_available, section.graduate_capacity)}</dd>
                  {section.enrollment_notes && (
                    <>
                      <dt>{t('notes')}</dt>
                      <dd>{section.enrollment_notes}</dd>
                    </>
                  )}
                </dl>
              </li>
            );
          })}
          {schedule.events.map((event) => (
            <li key={event.id}>
              <p>
                <strong>{event.title}</strong> <span className="muted">{t('personalEvent')}</span>
                {event.hidden && <span className="tag">{t('hiddenOnGrid')}</span>}
              </p>
              <dl className="facts">
                <dt>{t('when')}</dt>
                <dd>
                  {event.days.map(dayName).join(' ')} {formatPeriods(event.periodStart, event.periodEnd)} (
                  {formatWeeks(event.weekMask)})
                </dd>
                {event.location && (
                  <>
                    <dt>{t('location')}</dt>
                    <dd>{event.location}</dd>
                  </>
                )}
              </dl>
            </li>
          ))}
        </ul>
        {!schedule.courses.length && !schedule.events.length && <p className="muted">{t('emptySchedule')}</p>}
      </section>
    </div>
  );
}
