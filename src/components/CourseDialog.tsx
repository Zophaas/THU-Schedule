import { useEffect, useState } from 'react';
import type { CourseDetail, CourseResponse } from '../api';
import { type MessageKey, courseName, getLang, t } from '../lib/i18n';
import { meetingPattern } from '../lib/plan';
import { useModal } from '../lib/useModal';

/**
 * The source has separate Chinese (课程内容简介) and English (Course Description) fields.
 * Show the one in the UI language; if it is blank, say so and offer the other one collapsed.
 */
function description(detail: CourseDetail): { label: MessageKey; text: string; other: string } | null {
  const english = getLang() === 'en';
  const [text, other] = english ? [detail.description_en, detail.description] : [detail.description, detail.description_en];
  if (!text.trim() && !other.trim()) return null;
  return { label: english ? 'descEn' : 'descZh', text: text.trim(), other: other.trim() };
}

const DETAIL_LABELS: [keyof CourseDetail, MessageKey][] = [
  ['prerequisites', 'prerequisites'],
  ['guidance', 'guidance'],
  ['assessment', 'assessment'],
  ['grading', 'grading'],
  ['schedule', 'scheduleDetail'],
  ['textbooks', 'textbooks'],
  ['main_textbook', 'mainTextbook'],
  ['reference_books', 'references'],
  ['co_instructors', 'coInstructors'],
  ['teaching_features', 'teachingFeatures'],
  ['office_hour', 'officeHour'],
];

export function CourseDialog({ term, courseNumber, onClose }: { term: string; courseNumber: string; onClose: () => void }) {
  const { ref: dialog, close } = useModal(onClose, { closeOnBackdrop: true });
  const [data, setData] = useState<CourseResponse | null>(null);
  const [failure, setFailure] = useState<string | null>(null);


  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/courses/${courseNumber}?term=${encodeURIComponent(term)}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Could not load course details');
        setData(body);
      })
      .catch((cause: Error) => cause.name !== 'AbortError' && setFailure(cause.message));
    return () => controller.abort();
  }, [courseNumber, term]);

  return (
    <dialog ref={dialog} className="dialog wide" aria-label={`${t('courseDetails')} ${courseNumber}`}>
      <button type="button" className="icon close" aria-label={t('close')} onClick={() => close()}>
        ✕
      </button>
      {failure && <p className="error">{failure}</p>}
      {!data && !failure && <p className="muted">{t('loading')}</p>}
      {data && (
        <>
          <p className="eyebrow">
            {data.course.department} · {data.term}
          </p>
          <h2>
            {data.course.course_number} {courseName(data.course)}
          </h2>
          <p className="muted">{t('creditsValue', { n: data.course.credits })}</p>
          <ul className="plain">
            {data.course.sections.map((section) => (
              <li key={section.id}>
                <strong>{t('sectionN', { n: section.section_number })}</strong> · {section.instructors || '—'} · {meetingPattern(section)}
                {section.course_features && <small className="muted"> · {section.course_features}</small>}
              </li>
            ))}
          </ul>
          {data.details.map((detail) => {
            const summary = description(detail);
            const sections = data.course.sections
              .filter((section) => section.course_detail_url === detail.url)
              .map((section) => section.section_number);
            return (
              <article key={detail.url} className="detail">
                {data.details.length > 1 && <h3>{t('sectionsList', { list: sections.join(', ') })}</h3>}
                <dl>
                  {detail.total_hours && (
                    <div>
                      <dt>{t('totalHours')}</dt>
                      <dd>{detail.total_hours}</dd>
                    </div>
                  )}
                  {summary && (
                    <div>
                      <dt>{t(summary.label)}</dt>
                      <dd>
                        {summary.text || (
                          <>
                            <span className="muted">{t('noDescInLang')}</span>
                            <details className="other-desc">
                              <summary>{t('showOtherDesc')}</summary>
                              {summary.other}
                            </details>
                          </>
                        )}
                      </dd>
                    </div>
                  )}
                  {DETAIL_LABELS.filter(([key]) => detail[key]).map(([key, label]) => (
                    <div key={key}>
                      <dt>{t(label)}</dt>
                      <dd>{detail[key]}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            );
          })}
          {!data.details.length && <p className="muted">{t('noDescription')}</p>}
          {data.labs.map((lab) => (
            <article key={lab.url} className="detail">
              <h3>{t('labInfo')}</h3>
              <dl>
                {Object.entries(lab.fields)
                  .filter(([key, value]) => value && !['学年学期', '课程号'].includes(key))
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
              </dl>
            </article>
          ))}
        </>
      )}
    </dialog>
  );
}
