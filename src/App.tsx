import { useEffect, useMemo, useRef, useState } from 'react';
import type { ArchiveMeta, CourseListResponse, CourseSummary, Section } from './api';
import { BuildPanel } from './components/BuildPanel';
import { CourseDialog } from './components/CourseDialog';
import { EventDialog } from './components/EventDialog';
import { type Ghost, Grid } from './components/Grid';
import { ReviewPanel } from './components/ReviewPanel';
import { LanguageSwitch, SettingsPanel } from './components/SettingsPanel';
import { SharePanel } from './components/SharePanel';
import { SharedScheduleDialog } from './components/SharedScheduleDialog';
import { type MessageKey, setLang, t, tn } from './lib/i18n';
import {
  type Block,
  type CourseCache,
  alternativeSections,
  buildPlan,
  conflictRefs,
  sectionBlocks,
  wouldConflict,
} from './lib/plan';
import {
  PALETTES,
  type PersonalEvent,
  type Schedule,
  emptySchedule,
  newId,
  nextColor,
  termPlans,
  useStore,
  withSchedule,
  withTermPlans,
} from './lib/store';
import { type SharedSchedule, clearShareHash, parseShareHash } from './lib/share';
import { ALL_WEEKS, TERM_WEEKS, maxWeek, termLabel } from './lib/weeks';

type Tab = 'build' | 'review' | 'share' | 'settings';

const TABS: { id: Tab; label: MessageKey }[] = [
  { id: 'build', label: 'tabBuild' },
  { id: 'review', label: 'tabReview' },
  { id: 'share', label: 'tabShare' },
  { id: 'settings', label: 'tabSettings' },
];

function ScheduleMenu({
  schedules,
  active,
  onSelect,
  onCreate,
  onDuplicate,
}: {
  schedules: Schedule[];
  active: Schedule;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: () => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  const choose = (action: () => void) => () => {
    action();
    setOpen(false);
  };
  return (
    <div className="menu" ref={wrapper} onKeyDown={(event) => event.key === 'Escape' && setOpen(false)}>
      <button type="button" className="schedule-button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        {active.name} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="menu-list" role="menu">
          {schedules.map((schedule) => (
            <button
              type="button"
              role="menuitemradio"
              aria-checked={schedule.id === active.id}
              key={schedule.id}
              onClick={choose(() => onSelect(schedule.id))}
            >
              <span className="check-mark">{schedule.id === active.id ? '✓' : ''}</span>
              {schedule.name}
              <small> · {tn(schedule.courses.length, 'course1', 'courses')}</small>
            </button>
          ))}
          <hr />
          <button type="button" role="menuitem" onClick={choose(onCreate)}>
            {t('newSchedule')}
          </button>
          <button type="button" role="menuitem" onClick={choose(onDuplicate)}>
            {t('duplicate', { name: active.name })}
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const { store, update, saveState } = useStore();
  const lang = store.settings.language;
  setLang(lang);

  const [metas, setMetas] = useState<ArchiveMeta[]>([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [term, setTerm] = useState<string | null>(null);
  const lastTermRef = useRef(store.settings.lastTerm);
  const [cache, setCache] = useState<CourseCache>(new Map());
  const [tab, setTab] = useState<Tab>('build');
  const [week, setWeek] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ course: CourseSummary; section: Section } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [eventDraft, setEventDraft] = useState<{ event: PersonalEvent; isNew: boolean } | null>(null);
  const [detailsFor, setDetailsFor] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  // A schedule opened from a share link, shown for review before anything is saved.
  const [incoming, setIncoming] = useState(() => parseShareHash(location.hash));

  useEffect(() => {
    clearShareHash();
    const onHash = () => {
      const shared = parseShareHash(location.hash);
      if (shared) {
        setIncoming(shared);
        clearShareHash();
      }
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('appName');
  }, [lang]);

  useEffect(() => {
    fetch('/api/meta')
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load the course archive.');
        const body = (await response.json()) as ArchiveMeta[];
        setMetas(body);
        setTerm((current) => {
          if (current) return current;
          const remembered = body.find((item) => item.term === lastTermRef.current);
          return remembered?.term ?? body[0]?.term ?? null;
        });
      })
      .catch((cause: Error) => setMetaError(cause.message));
  }, []);

  const meta = metas.find((item) => item.term === term);
  const plans = term ? termPlans(store, term) : null;
  const schedule = plans?.schedules.find((item) => item.id === plans.activeId) ?? null;
  const colors = PALETTES[store.settings.palette].colors;

  // Persist the first schedule of a term so its id stays stable.
  useEffect(() => {
    if (term && !store.terms[term]?.schedules.length) update((current) => withTermPlans(current, term, (p) => p));
  }, [term, store.terms, update]);

  // Course data is cached per term; switching terms starts a new cache.
  useEffect(() => {
    setCache(new Map());
    setWeek(null);
    setExpanded(null);
    setPreview(null);
    setDragging(null);
  }, [term]);

  const missing = useMemo(
    () => (schedule ? schedule.courses.map((course) => course.courseNumber).filter((number) => !cache.has(number)) : []),
    [schedule, cache],
  );
  const missingKey = missing.join(',');
  useEffect(() => {
    if (!term || !missingKey) return;
    const numbers = missingKey.split(',');
    const controller = new AbortController();
    fetch(`/api/courses?${new URLSearchParams({ term, numbers: missingKey })}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Could not load saved courses');
        const body = (await response.json()) as CourseListResponse;
        setCache((current) => {
          const next = new Map(current);
          for (const number of numbers) next.set(number, body.courses.find((c) => c.course_number === number) ?? null);
          return next;
        });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [term, missingKey]);

  // lang is a dependency because block and conflict text is localized when built.
  const plan = useMemo(() => (schedule ? buildPlan(schedule, cache) : null), [schedule, cache, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const conflicting = useMemo(() => conflictRefs(plan?.conflicts ?? []), [plan]);

  const previewBlocks: Block[] = useMemo(() => {
    if (!preview || !schedule) return [];
    const planned = schedule.courses.find((course) => course.courseNumber === preview.course.course_number);
    // The selected section is already drawn; a preview of it would show a duplicate block.
    if (planned?.sectionNumber === preview.section.section_number) return [];
    return sectionBlocks(preview.section, {
      refId: `preview-${preview.course.course_number}`,
      color: planned?.color ?? nextColor(schedule),
      hidden: false,
      keyPrefix: 'preview',
    }).blocks;
  }, [preview, schedule, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // Courses that have other sections at different times can be dragged between them.
  const draggableCourses = useMemo(() => {
    const result = new Set<string>();
    for (const planned of schedule?.courses ?? []) {
      const course = cache.get(planned.courseNumber);
      if (course && alternativeSections(course, planned.sectionNumber).length) result.add(planned.courseNumber);
    }
    return result;
  }, [schedule, cache]);

  const ghosts: Ghost[] = useMemo(() => {
    if (!dragging || !schedule || !plan) return [];
    const planned = schedule.courses.find((course) => course.courseNumber === dragging);
    const course = cache.get(dragging);
    if (!planned || !course) return [];
    return alternativeSections(course, planned.sectionNumber).flatMap((alternative) => {
      const { blocks } = sectionBlocks(alternative.section, {
        refId: dragging,
        color: planned.color,
        hidden: false,
        keyPrefix: `ghost-${alternative.section.section_number}`,
      });
      const conflict = wouldConflict(blocks, plan.blocks);
      const label = `${course.course_number} · ${t('sectionN', { n: alternative.sectionNumbers.join(', ') })}`;
      return blocks.map((block) => ({ block, sectionNumber: alternative.section.section_number, label, conflict }));
    });
  }, [dragging, schedule, cache, plan, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekCount = Math.max(
    TERM_WEEKS,
    ...(plan?.blocks.map((block) => (block.weekMask == null ? 0 : maxWeek(block.weekMask))) ?? []),
  );

  if (metaError) return <main className="fatal">{metaError}</main>;
  if (!term || !plans || !schedule || !plan || !meta) return <main className="fatal muted">{t('loadingArchive')}</main>;

  const editSchedule = (recipe: (current: Schedule) => Schedule) => update((current) => withSchedule(current, term, recipe));

  // A shared schedule is always added as a new schedule in its own term.
  const saveShared = (shared: SharedSchedule) => {
    const saved: Schedule = { id: newId(), name: shared.name || t('sharedTitle'), courses: shared.courses, events: [] };
    update((current) =>
      withTermPlans(current, shared.term, (p) => ({
        activeId: saved.id,
        // A term never opened here has only a placeholder schedule; don't keep it.
        schedules: current.terms[shared.term]?.schedules.length ? [...p.schedules, saved] : [saved],
      })),
    );
    setTerm(shared.term);
    setTab('build');
    setIncoming(null);
  };

  const addSection = (course: CourseSummary, section: Section) => {
    setCache((current) => new Map(current).set(course.course_number, course));
    editSchedule((current) => {
      const existing = current.courses.find((item) => item.courseNumber === course.course_number);
      if (existing) {
        return {
          ...current,
          courses: current.courses.map((item) =>
            item.courseNumber === course.course_number ? { ...item, sectionNumber: section.section_number } : item,
          ),
        };
      }
      return {
        ...current,
        courses: [
          ...current.courses,
          { courseNumber: course.course_number, sectionNumber: section.section_number, color: nextColor(current), hidden: false },
        ],
      };
    });
  };

  const locate = (ref: string) => {
    setHighlighted(ref);
    gridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => setHighlighted((current) => (current === ref ? null : current)), 2500);
  };

  const openNewEvent = () =>
    setEventDraft({
      isNew: true,
      event: {
        id: newId(),
        title: '',
        location: '',
        color: nextColor(schedule),
        days: [1],
        periodStart: 1,
        periodEnd: 1,
        weekMask: ALL_WEEKS,
        hidden: false,
      },
    });

  const setSettings = (settings: typeof store.settings) => update((current) => ({ ...current, settings }));
  const visibleUnscheduled = plan.unscheduled.filter((item) => !item.hidden);
  const hiddenCount =
    schedule.courses.filter((course) => course.hidden).length + schedule.events.filter((event) => event.hidden).length;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span>{t('appName')}</span>
        </div>
        <div className="topbar-controls">
          <label className="term">
            <span className="sr-only">{t('term')}</span>
            <select
              value={term}
              onChange={(event) => {
                const next = event.target.value;
                setTerm(next);
                update((current) => ({ ...current, settings: { ...current.settings, lastTerm: next } }));
              }}
            >
              {metas.map((item) => (
                <option key={item.term} value={item.term}>
                  {termLabel(item.term)}
                </option>
              ))}
            </select>
          </label>
          {/* All messages share one grid cell so the box keeps the widest one's width
              and nothing beside it shifts when the status changes. */}
          <span className={`save-state ${saveState}`} role="status">
            {(['saving', 'saved', 'error'] as const).map((state) => (
              <span key={state} aria-hidden={state !== saveState} className={state === saveState ? undefined : 'invisible'}>
                {state === 'saving' ? t('saving') : state === 'error' ? t('saveError') : t('saved')}
              </span>
            ))}
          </span>
          <LanguageSwitch value={lang} onChange={(language) => setSettings({ ...store.settings, language })} />
        </div>
      </header>

      <div className="page">
        <main className="main">
          <p className="planning-note">{t('planningOnly', { date: meta.retrieved_at, source: meta.source })}</p>

          <div className="toolbar" ref={gridRef}>
            <ScheduleMenu
              schedules={plans.schedules}
              active={schedule}
              onSelect={(id) => update((current) => withTermPlans(current, term, (p) => ({ ...p, activeId: id })))}
              onCreate={() =>
                update((current) =>
                  withTermPlans(current, term, (p) => {
                    const created = emptySchedule(t('scheduleN', { n: p.schedules.length + 1 }));
                    return { activeId: created.id, schedules: [...p.schedules, created] };
                  }),
                )
              }
              onDuplicate={() =>
                update((current) =>
                  withTermPlans(current, term, (p) => {
                    const copy: Schedule = { ...structuredClone(schedule), id: newId(), name: t('copyOf', { name: schedule.name }) };
                    copy.events = copy.events.map((event) => ({ ...event, id: newId() }));
                    return { activeId: copy.id, schedules: [...p.schedules, copy] };
                  }),
                )
              }
            />
            <div className="stats" aria-live="polite">
              <span>{tn(plan.courseCount, 'course1', 'courses')}</span>
              <span aria-hidden="true">·</span>
              <span>
                {tn(plan.credits, 'credit1', 'credits')}
                {plan.unknownCredits > 0 && <small> {t('unknownCredits', { n: plan.unknownCredits })}</small>}
              </span>
            </div>
            <div className="week-nav" role="group" aria-label={t('teachingWeek')}>
              <button
                type="button"
                aria-label={t('previousWeek')}
                disabled={week == null || week <= 1}
                onClick={() => setWeek((current) => (current == null ? null : current - 1))}
              >
                ‹
              </button>
              <select
                value={week ?? ''}
                aria-label={t('teachingWeek')}
                onChange={(event) => setWeek(event.target.value ? Number(event.target.value) : null)}
              >
                <option value="">{t('allWeeks')}</option>
                {Array.from({ length: weekCount }, (_, index) => (
                  <option key={index + 1} value={index + 1}>
                    {t('weekN', { n: index + 1 })}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={t('nextWeek')}
                disabled={week != null && week >= weekCount}
                onClick={() => setWeek((current) => (current == null ? 1 : current + 1))}
              >
                ›
              </button>
            </div>
          </div>

          {plan.conflicts.length > 0 && (
            <p className="notice danger">
              ⚠ {tn(plan.conflicts.length, 'conflictBanner1', 'conflictsBanner')}{' '}
              <button type="button" className="link" onClick={() => setTab('review')}>
                {t('reviewConflicts')}
              </button>
            </p>
          )}

          <Grid
            blocks={plan.blocks}
            preview={previewBlocks}
            ghosts={ghosts}
            colors={colors}
            showWeekends={store.settings.showWeekends}
            selectedWeek={week}
            conflicting={conflicting}
            highlighted={highlighted}
            draggingRef={dragging}
            canDrag={(block) => block.kind === 'course' && draggableCourses.has(block.refId)}
            onDragStart={(block) => {
              setPreview(null);
              setDragging(block.refId);
            }}
            onDrop={(sectionNumber) => {
              const course = dragging ? cache.get(dragging) : null;
              const section = course?.sections.find((item) => item.section_number === sectionNumber);
              if (course && section) addSection(course, section);
              setDragging(null);
            }}
            onSelect={(block) => {
              if (block.kind === 'event') {
                const event = schedule.events.find((item) => item.id === block.refId);
                if (event) setEventDraft({ event, isNew: false });
              } else {
                setTab('build');
                setExpanded(block.refId);
              }
            }}
            onShowWeekends={() => setSettings({ ...store.settings, showWeekends: true })}
          />
          <p className="muted small grid-note">
            {t('gridNote')}
            {hiddenCount > 0 && ` ${tn(hiddenCount, 'hiddenItem1', 'hiddenItems')}`}
            {draggableCourses.size > 0 && ` ${t('dragHint')}`}
          </p>

          <section className="tba" aria-labelledby="tba-title">
            <h2 id="tba-title">{t('timeNotSpecified')}</h2>
            {visibleUnscheduled.length === 0 ? (
              <p className="muted small">{t('allHaveTimes')}</p>
            ) : (
              <ul>
                {visibleUnscheduled.map((item) => (
                  <li key={item.key} style={{ ['--block' as string]: colors[item.color % colors.length] }}>
                    <strong>{item.label}</strong> <span className="mono">{item.raw}</span>
                    <span className="tag warn">{t('noDayPeriod')}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>

        <aside className="sidebar">
          <nav className="tabs" role="tablist" aria-label={t('appName')}>
            {TABS.map((item) => (
              <button
                type="button"
                role="tab"
                key={item.id}
                aria-selected={tab === item.id}
                className={tab === item.id ? 'active' : undefined}
                onClick={() => setTab(item.id)}
              >
                {t(item.label)}
                {item.id === 'review' && plan.conflicts.length > 0 && (
                  <span className="badge" aria-label={t('conflicts')}>
                    ({plan.conflicts.length})
                  </span>
                )}
              </button>
            ))}
          </nav>
          <div role="tabpanel" className="tab-panel">
            {tab === 'build' && (
              <BuildPanel
                term={term}
                schedule={schedule}
                cache={cache}
                colors={colors}
                conflicting={conflicting}
                incomplete={plan.incomplete}
                retrievedAt={meta.retrieved_at}
                expanded={expanded}
                onExpand={setExpanded}
                onAdd={addSection}
                onPreview={(course, section) => setPreview(course && section ? { course, section } : null)}
                onToggleCourse={(number) =>
                  editSchedule((current) => ({
                    ...current,
                    courses: current.courses.map((c) => (c.courseNumber === number ? { ...c, hidden: !c.hidden } : c)),
                  }))
                }
                onRemoveCourse={(number) =>
                  editSchedule((current) => ({ ...current, courses: current.courses.filter((c) => c.courseNumber !== number) }))
                }
                onColorCourse={(number, color) =>
                  editSchedule((current) => ({
                    ...current,
                    courses: current.courses.map((c) => (c.courseNumber === number ? { ...c, color } : c)),
                  }))
                }
                onDetails={setDetailsFor}
                onAddEvent={openNewEvent}
                onEditEvent={(event) => setEventDraft({ event, isNew: false })}
                onToggleEvent={(id) =>
                  editSchedule((current) => ({
                    ...current,
                    events: current.events.map((e) => (e.id === id ? { ...e, hidden: !e.hidden } : e)),
                  }))
                }
                onRemoveEvent={(id) =>
                  editSchedule((current) => ({ ...current, events: current.events.filter((e) => e.id !== id) }))
                }
              />
            )}
            {tab === 'review' && (
              <ReviewPanel
                schedule={schedule}
                cache={cache}
                plan={plan}
                retrievedAt={meta.retrieved_at}
                source={meta.source}
                onLocate={locate}
              />
            )}
            {tab === 'share' && <SharePanel term={term} schedule={schedule} plan={plan} cache={cache} />}
            {tab === 'settings' && (
              <SettingsPanel
                schedule={schedule}
                scheduleCount={plans.schedules.length}
                settings={store.settings}
                englishNames={meta.english_names}
                onRename={(name) => editSchedule((current) => ({ ...current, name }))}
                onDelete={() =>
                  update((current) =>
                    withTermPlans(current, term, (p) => {
                      const rest = p.schedules.filter((item) => item.id !== schedule.id);
                      const remaining = rest.length ? rest : [emptySchedule(t('scheduleN', { n: 1 }))];
                      return { activeId: remaining[0].id, schedules: remaining };
                    }),
                  )
                }
                onSettings={setSettings}
              />
            )}
          </div>
        </aside>
      </div>

      <footer className="site-footer muted">
        {t('copyright')} ·{' '}
        <a href="https://github.com/Zophaas/THU-Schedule" target="_blank" rel="noopener noreferrer">
          {t('sourceCode')}
        </a>
      </footer>

      {eventDraft && (
        <EventDialog
          initial={eventDraft.event}
          isNew={eventDraft.isNew}
          colors={colors}
          onClose={() => setEventDraft(null)}
          onSave={(saved) => {
            editSchedule((current) => ({
              ...current,
              events: eventDraft.isNew
                ? [...current.events, saved]
                : current.events.map((item) => (item.id === saved.id ? saved : item)),
            }));
            setEventDraft(null);
          }}
          onDelete={() => {
            editSchedule((current) => ({ ...current, events: current.events.filter((item) => item.id !== eventDraft.event.id) }));
            setEventDraft(null);
          }}
        />
      )}
      {incoming && (
        <SharedScheduleDialog
          shared={incoming}
          termKnown={incoming !== 'invalid' && metas.some((item) => item.term === incoming.term)}
          onClose={() => setIncoming(null)}
          onSave={saveShared}
        />
      )}
      {detailsFor && (
        <CourseDialog key={detailsFor} term={term} courseNumber={detailsFor} onClose={() => setDetailsFor(null)} />
      )}
    </div>
  );
}
