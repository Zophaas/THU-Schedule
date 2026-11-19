import { useEffect, useState } from 'react';
import type { CourseListResponse, CourseSummary } from '../api';
import { courseName, t } from '../lib/i18n';
import { meetingPattern } from '../lib/plan';
import type { SharedSchedule } from '../lib/share';
import { useModal } from '../lib/useModal';
import { termLabel } from '../lib/weeks';

/**
 * Preview of a schedule opened from a share link. Nothing is saved until the
 * recipient chooses to; saving always adds a new schedule and never replaces one.
 */
export function SharedScheduleDialog({
  shared,
  termKnown,
  onSave,
  onClose,
}: {
  shared: SharedSchedule | 'invalid';
  termKnown: boolean;
  onSave: (shared: SharedSchedule) => void;
  onClose: () => void;
}) {
  const { ref: dialog, close } = useModal(onClose);
  const [courses, setCourses] = useState<Map<string, CourseSummary> | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const valid = shared !== 'invalid' && termKnown;

  useEffect(() => {
    if (shared === 'invalid' || !termKnown || !shared.courses.length) return;
    const controller = new AbortController();
    const numbers = shared.courses.map((course) => course.courseNumber).join(',');
    fetch(`/api/courses?${new URLSearchParams({ term: shared.term, numbers })}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not load the shared courses');
        setCourses(new Map((body as CourseListResponse).courses.map((course) => [course.course_number, course])));
      })
      .catch((cause: Error) => cause.name !== 'AbortError' && setFailure(cause.message));
    return () => controller.abort();
  }, [shared, termKnown]);

  return (
    <dialog ref={dialog} className="dialog wide" aria-label={t('sharedTitle')}>
      <button type="button" className="icon close" aria-label={t('close')} onClick={() => close()}>
        ✕
      </button>
      <p className="eyebrow">{t('sharedTitle')}</p>
      {shared === 'invalid' ? (
        <p className="error">{t('sharedInvalid')}</p>
      ) : !termKnown ? (
        <p className="error">{t('sharedUnknownTerm', { term: termLabel(shared.term) })}</p>
      ) : (
        <>
          <h2>{t('sharedFrom', { name: shared.name || t('sharedTitle'), term: termLabel(shared.term) })}</h2>
          <p className="notice">{t('shareClassesOnly')}</p>
          {!shared.courses.length && <p className="muted">{t('sharedNoClasses')}</p>}
          {failure && <p className="error">{failure}</p>}
          {shared.courses.length > 0 && !courses && !failure && <p className="muted">{t('loading')}</p>}
          {courses && (
            <ul className="plain shared-list">
              {shared.courses.map((planned) => {
                const course = courses.get(planned.courseNumber);
                const section = course?.sections.find((item) => item.section_number === planned.sectionNumber);
                return (
                  <li key={planned.courseNumber}>
                    <strong>
                      {planned.courseNumber}-{planned.sectionNumber}
                    </strong>{' '}
                    {course && section ? (
                      <>
                        {courseName(course)} · {section.instructors || '—'} · {meetingPattern(section)}
                      </>
                    ) : (
                      <span className="muted">{t('sharedNotFound')}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <p className="muted">{t('sharedSaveNote')}</p>
        </>
      )}
      <div className="row end">
        <button type="button" onClick={() => close()}>
          {valid ? t('cancel') : t('close')}
        </button>
        {valid && shared.courses.length > 0 && (
          <button type="button" className="primary" onClick={() => onSave(shared)}>
            {t('saveShared')}
          </button>
        )}
      </div>
    </dialog>
  );
}
