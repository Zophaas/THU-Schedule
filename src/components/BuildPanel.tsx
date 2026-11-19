import { useEffect, useRef, useState } from 'react';
import type { CourseSummary, SearchResponse, Section } from '../api';
import { courseName, getLang, t } from '../lib/i18n';
import { type CourseCache, courseStatus, meetingPattern } from '../lib/plan';
import type { PersonalEvent, Schedule } from '../lib/store';
import { dayName, formatPeriods, formatWeeks } from '../lib/weeks';

/** Total archived seats left across undergraduate and graduate quotas; null when unknown. */
export function seatsLeft(section: Section): number | null {
  const values = [section.undergrad_available, section.graduate_available].filter((value) => value !== '');
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + (Number(value) || 0), 0);
}

function SeatPill({ section, retrievedAt }: { section: Section; retrievedAt: string }) {
  const left = seatsLeft(section);
  const tone = left == null ? 'unknown' : left > 0 ? 'open' : 'full';
  const text = left == null ? t('seatsUnknown') : left > 0 ? t('seatsLeft', { n: left }) : t('seatsFull');
  const detail = t('seatDetail', {
    ua: section.undergrad_available || '?',
    uc: section.undergrad_capacity || '?',
    ga: section.graduate_available || '?',
    gc: section.graduate_capacity || '?',
    date: retrievedAt,
  });
  return (
    <span className={`seat ${tone}`} title={detail}>
      {text}
      <span className="sr-only">{detail}</span>
    </span>
  );
}

function SectionRows({
  course,
  selected,
  retrievedAt,
  onPick,
  onPreview,
}: {
  course: CourseSummary;
  selected?: string;
  retrievedAt: string;
  onPick: (section: Section) => void;
  onPreview: (section: Section | null) => void;
}) {
  return (
    <table className="sections">
      <thead>
        <tr>
          <th>{t('sectionCol')}</th>
          <th>{t('meetingsCol')}</th>
          <th>{t('instructorCol')}</th>
          <th>{t('seatsCol')}</th>
        </tr>
      </thead>
      <tbody>
        {course.sections.map((section) => {
          const active = section.section_number === selected;
          return (
            <tr
              key={section.id}
              className={active ? 'active' : undefined}
              onClick={() => onPick(section)}
              onMouseEnter={() => onPreview(section)}
              onMouseLeave={() => onPreview(null)}
            >
              <td>
                <button
                  type="button"
                  className="section-pick"
                  aria-pressed={active}
                  aria-label={t(active ? 'selectedSection' : 'useSection', { n: section.section_number })}
                  onClick={(event) => {
                    event.stopPropagation();
                    onPick(section);
                  }}
                  onFocus={() => onPreview(section)}
                  onBlur={() => onPreview(null)}
                >
                  {section.section_number}
                </button>
              </td>
              <td className="pattern">{meetingPattern(section)}</td>
              <td>{section.instructors || '—'}</td>
              <td>
                <SeatPill section={section} retrievedAt={retrievedAt} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function AddCourse({
  term,
  schedule,
  retrievedAt,
  onAdd,
  onPreview,
}: {
  term: string;
  schedule: Schedule;
  retrievedAt: string;
  onAdd: (course: CourseSummary, section: Section) => void;
  onPreview: (course: CourseSummary | null, section: Section | null) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapper = useRef<HTMLDivElement>(null);
  const lang = getLang();

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResults(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/search?${new URLSearchParams({ term, q: text, lang })}`, { signal: controller.signal })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error ?? 'Search failed');
          setResults(body);
          setError(null);
        })
        .catch((cause: Error) => cause.name !== 'AbortError' && setError(cause.message));
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, term, lang]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const visible = open && query.trim() !== '';

  // Esc closes the list wherever focus is (the pointer may only be hovering a row).
  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible]);

  // Rows that disappear never fire mouseleave, so clear the grid preview whenever the
  // list closes or its rows are replaced.
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  useEffect(() => {
    previewRef.current(null, null);
  }, [visible, results]);

  const placeholder = lang === 'en' ? t('addCoursePlaceholderEn') : t('addCoursePlaceholderZh');
  return (
    <div className="add-course" ref={wrapper}>
      <label className="sr-only" htmlFor="add-course">
        {t('addCourse')}: {placeholder}
      </label>
      <input
        id="add-course"
        type="search"
        placeholder={placeholder}
        autoComplete="off"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
      />
      {visible && (
        <div className="search-results" role="listbox" aria-label={t('addCourse')}>
          {error && <p className="error">{error}</p>}
          {results && !results.courses.length && <p className="muted">{t('noMatch', { q: results.query })}</p>}
          {results?.courses.map((course) => {
            const planned = schedule.courses.find((item) => item.courseNumber === course.course_number);
            return (
              <div key={course.course_number} className="result">
                <p className="result-head">
                  <strong>{course.course_number}</strong> {courseName(course)}
                  <small>
                    {course.department} · {t('creditsShort', { n: course.credits })}
                    {planned ? ` · ${t('inPlan', { n: planned.sectionNumber })}` : ''}
                  </small>
                </p>
                <SectionRows
                  course={course}
                  selected={planned?.sectionNumber}
                  retrievedAt={retrievedAt}
                  onPick={(section) => {
                    onAdd(course, section);
                    onPreview(null, null);
                    setOpen(false);
                    setQuery('');
                  }}
                  onPreview={(section) => onPreview(section && course, section)}
                />
              </div>
            );
          })}
          {results?.truncated && <p className="muted">{t('moreMatch')}</p>}
        </div>
      )}
    </div>
  );
}

function eventSummary(event: PersonalEvent): string {
  return `${event.days.map(dayName).join(' ')} ${formatPeriods(event.periodStart, event.periodEnd)} · ${formatWeeks(event.weekMask)}`;
}

interface BuildPanelProps {
  term: string;
  schedule: Schedule;
  cache: CourseCache;
  colors: string[];
  conflicting: Set<string>;
  incomplete: Set<string>;
  retrievedAt: string;
  onAdd: (course: CourseSummary, section: Section) => void;
  onPreview: (course: CourseSummary | null, section: Section | null) => void;
  onToggleCourse: (courseNumber: string) => void;
  onRemoveCourse: (courseNumber: string) => void;
  onColorCourse: (courseNumber: string, color: number) => void;
  onDetails: (courseNumber: string) => void;
  onAddEvent: () => void;
  onEditEvent: (event: PersonalEvent) => void;
  onToggleEvent: (id: string) => void;
  onRemoveEvent: (id: string) => void;
  expanded: string | null;
  onExpand: (ref: string | null) => void;
}

export function BuildPanel(props: BuildPanelProps) {
  const { schedule, cache, colors, expanded, onExpand } = props;
  const [colorPicker, setColorPicker] = useState<string | null>(null);

  return (
    <div className="build">
      <AddCourse
        term={props.term}
        schedule={schedule}
        retrievedAt={props.retrievedAt}
        onAdd={(course, section) => {
          props.onAdd(course, section);
          onExpand(course.course_number);
        }}
        onPreview={props.onPreview}
      />
      <button type="button" className="add-event" onClick={props.onAddEvent}>
        + {t('addEvent')}
      </button>
      {!schedule.courses.length && !schedule.events.length && <p className="muted empty">{t('emptyBuild')}</p>}
      <ul className="cards">
        {schedule.courses.map((planned) => {
          const status = courseStatus(planned, cache);
          const isOpen = expanded === planned.courseNumber;
          const name =
            status.kind === 'ok' || status.kind === 'missing-section' ? courseName(status.course) : planned.courseNumber;
          return (
            <li
              key={planned.courseNumber}
              className={`card${planned.hidden ? ' is-hidden' : ''}${isOpen ? ' open' : ''}`}
              style={{ ['--block' as string]: colors[planned.color % colors.length] }}
            >
              <div className="card-head">
                <input
                  type="checkbox"
                  checked={!planned.hidden}
                  onChange={() => props.onToggleCourse(planned.courseNumber)}
                  aria-label={t('showOnGrid', { name: planned.courseNumber })}
                />
                <button
                  type="button"
                  className="card-title"
                  aria-expanded={isOpen}
                  onClick={() => onExpand(isOpen ? null : planned.courseNumber)}
                >
                  <span className="card-number">
                    {planned.courseNumber}
                    {status.kind === 'ok' && <small> · {t('sectionN', { n: planned.sectionNumber })}</small>}
                  </span>
                  <span className="card-name">{name}</span>
                  {props.conflicting.has(planned.courseNumber) && <span className="tag">⚠ {t('conflictTag')}</span>}
                </button>
                <button
                  type="button"
                  className="icon"
                  aria-label={t('removeCourse', { name: planned.courseNumber })}
                  title={t('removeCourse', { name: planned.courseNumber })}
                  onClick={() => props.onRemoveCourse(planned.courseNumber)}
                >
                  ✕
                </button>
              </div>
              {status.kind === 'missing-course' && (
                <p className="card-warning">{t('missingCourse', { term: props.term, n: planned.sectionNumber })}</p>
              )}
              {status.kind === 'missing-section' && (
                <p className="card-warning">{t('missingSection', { n: planned.sectionNumber })}</p>
              )}
              {isOpen && (status.kind === 'ok' || status.kind === 'missing-section') && (
                <div className="card-body">
                  <div className="card-meta">
                    <strong>{t('creditsShort', { n: status.course.credits || '?' })}</strong>
                    {props.incomplete.has(planned.courseNumber) && (
                      <span className="tag warn">{t('incompleteTag')}</span>
                    )}
                    <button type="button" className="link" onClick={() => props.onDetails(planned.courseNumber)}>
                      {t('courseDetails')}
                    </button>
                    <button
                      type="button"
                      className="icon color-button"
                      aria-label={t('changeColor')}
                      title={t('changeColor')}
                      aria-expanded={colorPicker === planned.courseNumber}
                      onClick={() => setColorPicker(colorPicker === planned.courseNumber ? null : planned.courseNumber)}
                    />
                  </div>
                  {colorPicker === planned.courseNumber && (
                    <div className="swatches" role="group" aria-label={t('color')}>
                      {colors.map((color, index) => (
                        <button
                          type="button"
                          key={color}
                          className="swatch"
                          style={{ background: color }}
                          aria-label={t('colorN', { n: index + 1 })}
                          aria-pressed={planned.color === index}
                          onClick={() => {
                            props.onColorCourse(planned.courseNumber, index);
                            setColorPicker(null);
                          }}
                        />
                      ))}
                    </div>
                  )}
                  <SectionRows
                    course={status.course}
                    selected={planned.sectionNumber}
                    retrievedAt={props.retrievedAt}
                    onPick={(section) => {
                      props.onPreview(null, null);
                      props.onAdd(status.course, section);
                    }}
                    onPreview={(section) => {
                      const other = section && section.section_number !== planned.sectionNumber;
                      props.onPreview(other ? status.course : null, other ? section : null);
                    }}
                  />
                </div>
              )}
              {status.kind === 'loading' && <p className="muted card-body">{t('loading')}</p>}
            </li>
          );
        })}
        {schedule.events.map((event) => (
          <li
            key={event.id}
            className={`card event${event.hidden ? ' is-hidden' : ''}`}
            style={{ ['--block' as string]: colors[event.color % colors.length] }}
          >
            <div className="card-head">
              <input
                type="checkbox"
                checked={!event.hidden}
                onChange={() => props.onToggleEvent(event.id)}
                aria-label={t('showOnGrid', { name: event.title })}
              />
              <button type="button" className="card-title" onClick={() => props.onEditEvent(event)}>
                <span className="card-number">{event.title}</span>
                <span className="card-name">{eventSummary(event)}</span>
                {props.conflicting.has(event.id) && <span className="tag">⚠ {t('conflictTag')}</span>}
              </button>
              <button
                type="button"
                className="icon"
                aria-label={t('removeEvent', { name: event.title })}
                title={t('removeEvent', { name: event.title })}
                onClick={() => props.onRemoveEvent(event.id)}
              >
                ✕
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
