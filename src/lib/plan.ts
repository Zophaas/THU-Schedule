import type { CourseSummary, Meeting, Section } from '../api';
import { courseName, t } from './i18n';
import type { PersonalEvent, PlannedCourse, Schedule } from './store';
import { dayName, formatPeriods, formatWeeks, weeksLabel } from './weeks';

/** A contiguous run of periods on one weekday, drawn as one block on the grid. */
export interface Block {
  key: string;
  kind: 'course' | 'event';
  refId: string;
  /** For course blocks: the section this block belongs to. */
  sectionNumber?: string;
  weekday: number;
  start: number;
  end: number;
  /** null when the source's week expression was not understood. */
  weekMask: number | null;
  /** Already-localized week text. */
  weeksText: string;
  color: number;
  title: string;
  subtitle: string;
  detail: string;
  hidden: boolean;
}

export interface Unscheduled {
  key: string;
  refId: string;
  label: string;
  raw: string;
  color: number;
  hidden: boolean;
}

export interface Conflict {
  key: string;
  refs: [string, string];
  labels: [string, string];
  weekday: number;
  periods: number[];
  /** Weeks both items meet; null when at least one side's weeks are unknown. */
  overlap: number | null;
}

export type CourseStatus =
  | { kind: 'loading' }
  | { kind: 'ok'; course: CourseSummary; section: Section }
  | { kind: 'missing-course' }
  | { kind: 'missing-section'; course: CourseSummary };

/** courses: undefined = not loaded yet, null = not in the archive for this term. */
export type CourseCache = Map<string, CourseSummary | null>;

export function courseStatus(planned: PlannedCourse, cache: CourseCache): CourseStatus {
  const course = cache.get(planned.courseNumber);
  if (course === undefined) return { kind: 'loading' };
  if (course === null) return { kind: 'missing-course' };
  const section = course.sections.find((item) => item.section_number === planned.sectionNumber);
  return section ? { kind: 'ok', course, section } : { kind: 'missing-section', course };
}

export function sectionLabel(
  course: { course_number: string; course_name: string; course_name_en?: string | null },
  sectionNumber: string,
): string {
  return `${course.course_number}-${sectionNumber} ${courseName(course)}`;
}

/** Merge a section's per-period meetings into contiguous blocks. */
export function sectionBlocks(
  section: Section,
  options: { refId: string; color: number; hidden: boolean; keyPrefix: string },
): { blocks: Block[]; unscheduled: Unscheduled[] } {
  const blocks: Block[] = [];
  const unscheduled: Unscheduled[] = [];
  const groups = new Map<string, Meeting[]>();
  for (const meeting of section.meetings) {
    if (meeting.weekday == null || meeting.period == null) {
      unscheduled.push({
        key: `${options.keyPrefix}-u${meeting.seq}`,
        refId: options.refId,
        label: sectionLabel(section, section.section_number),
        raw: meeting.raw,
        color: options.color,
        hidden: options.hidden,
      });
      continue;
    }
    const groupKey = `${meeting.weekday}|${meeting.week_mask}|${meeting.weeks_text}`;
    groups.set(groupKey, [...(groups.get(groupKey) ?? []), meeting]);
  }
  for (const meetings of groups.values()) {
    meetings.sort((a, b) => a.period! - b.period!);
    let run: Meeting[] = [];
    const flush = () => {
      if (!run.length) return;
      const first = run[0];
      blocks.push({
        key: `${options.keyPrefix}-${first.weekday}-${first.period}-${first.seq}`,
        kind: 'course',
        refId: options.refId,
        sectionNumber: section.section_number,
        weekday: first.weekday!,
        start: first.period!,
        end: run.at(-1)!.period!,
        weekMask: first.week_mask,
        weeksText: weeksLabel(first.weeks_text),
        color: options.color,
        title: section.course_number,
        subtitle: t('sectionN', { n: section.section_number }),
        detail: courseName(section),
        hidden: options.hidden,
      });
      run = [];
    };
    for (const meeting of meetings) {
      if (run.length && meeting.period !== run.at(-1)!.period! + 1) flush();
      run.push(meeting);
    }
    flush();
  }
  return { blocks, unscheduled };
}

export function eventBlocks(event: PersonalEvent): Block[] {
  return event.days.map((day) => ({
    key: `event-${event.id}-${day}`,
    kind: 'event' as const,
    refId: event.id,
    weekday: day,
    start: event.periodStart,
    end: event.periodEnd,
    weekMask: event.weekMask,
    weeksText: formatWeeks(event.weekMask),
    color: event.color,
    title: event.title,
    subtitle: event.location,
    detail: t('personalEvent'),
    hidden: event.hidden,
  }));
}

export interface PlanView {
  blocks: Block[];
  unscheduled: Unscheduled[];
  conflicts: Conflict[];
  /** Planned items with meetings whose weeks or time are unknown. */
  incomplete: Set<string>;
  labels: Map<string, string>;
  courseCount: number;
  credits: number;
  unknownCredits: number;
}

export function buildPlan(schedule: Schedule, cache: CourseCache): PlanView {
  const blocks: Block[] = [];
  const unscheduled: Unscheduled[] = [];
  const labels = new Map<string, string>();
  const incomplete = new Set<string>();
  let credits = 0;
  let unknownCredits = 0;

  for (const planned of schedule.courses) {
    const status = courseStatus(planned, cache);
    if (status.kind !== 'ok') continue;
    const value = Number.parseFloat(status.section.credits);
    if (Number.isFinite(value)) credits += value;
    else unknownCredits += 1;
    labels.set(planned.courseNumber, sectionLabel(status.course, planned.sectionNumber));
    const result = sectionBlocks(status.section, {
      refId: planned.courseNumber,
      color: planned.color,
      hidden: planned.hidden,
      keyPrefix: `c-${planned.courseNumber}`,
    });
    blocks.push(...result.blocks);
    unscheduled.push(...result.unscheduled);
    if (result.unscheduled.length || result.blocks.some((block) => block.weekMask == null)) {
      incomplete.add(planned.courseNumber);
    }
  }
  for (const event of schedule.events) {
    labels.set(event.id, event.title);
    blocks.push(...eventBlocks(event));
  }

  return {
    blocks,
    unscheduled,
    conflicts: findConflicts(blocks, labels),
    incomplete,
    labels,
    courseCount: schedule.courses.length,
    credits,
    unknownCredits,
  };
}

/** Two items conflict only when weekday, period, and teaching weeks all overlap. */
export function findConflicts(blocks: Block[], labels: Map<string, string>): Conflict[] {
  const conflicts = new Map<string, Conflict>();
  for (let i = 0; i < blocks.length; i += 1) {
    for (let j = i + 1; j < blocks.length; j += 1) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.refId === b.refId || a.weekday !== b.weekday) continue;
      const start = Math.max(a.start, b.start);
      const end = Math.min(a.end, b.end);
      if (start > end) continue;
      const known = a.weekMask != null && b.weekMask != null;
      const overlap = known ? a.weekMask! & b.weekMask! : null;
      if (overlap === 0) continue;
      const [first, second] = a.refId < b.refId ? [a, b] : [b, a];
      const key = `${first.refId}|${second.refId}|${a.weekday}`;
      const existing = conflicts.get(key);
      const periods = Array.from({ length: end - start + 1 }, (_, index) => start + index);
      if (existing) {
        existing.periods = [...new Set([...existing.periods, ...periods])].sort((x, y) => x - y);
        existing.overlap = existing.overlap == null || overlap == null ? null : existing.overlap | overlap;
      } else {
        conflicts.set(key, {
          key,
          refs: [first.refId, second.refId],
          labels: [labels.get(first.refId) ?? first.title, labels.get(second.refId) ?? second.title],
          weekday: a.weekday,
          periods,
          overlap,
        });
      }
    }
  }
  return [...conflicts.values()].sort((x, y) => x.weekday - y.weekday || x.periods[0] - y.periods[0]);
}

/** Does any of these blocks conflict with another planned item (other than refId itself)? */
export function wouldConflict(candidate: Block[], others: Block[]): boolean {
  return findConflicts([...candidate, ...others.filter((block) => block.refId !== candidate[0]?.refId)], new Map()).some(
    (conflict) => conflict.refs.includes(candidate[0]?.refId ?? ''),
  );
}

export function describeConflict(conflict: Conflict): string {
  const when = `${dayName(conflict.weekday)} ${formatPeriods(conflict.periods[0], conflict.periods.at(-1)!)}`;
  const [a, b] = conflict.labels;
  if (conflict.overlap == null) return t('possibleConflictText', { a, b, when });
  return t('conflictText', { a, b, when, weeks: formatWeeks(conflict.overlap) });
}

export function conflictRefs(conflicts: Conflict[]): Set<string> {
  return new Set(conflicts.flatMap((conflict) => conflict.refs));
}

/** Plain-text meeting pattern for a section, preserving unknown entries. */
export function meetingPattern(section: Section): string {
  if (!section.meetings.length) return section.class_time || '—';
  const { blocks, unscheduled } = sectionBlocks(section, { refId: '', color: 0, hidden: false, keyPrefix: 'p' });
  const parts = blocks
    .sort((a, b) => a.weekday - b.weekday || a.start - b.start)
    .map((block) => `${dayName(block.weekday)} ${formatPeriods(block.start, block.end)} (${block.weeksText})`);
  for (const item of unscheduled) parts.push(`${t('timeNotSpecified')} ${item.raw}`);
  return parts.join('; ');
}

export interface Alternative {
  /** The section a drop selects (first of the group). */
  section: Section;
  /** All sections meeting at exactly these times. */
  sectionNumbers: string[];
}

/**
 * Other times this course is offered, grouped by identical meeting pattern.
 * Patterns identical to the selected section's (same time, other instructor) are left out.
 */
export function alternativeSections(course: CourseSummary, selected: string): Alternative[] {
  const signature = (section: Section) =>
    section.meetings
      .map((meeting) => `${meeting.weekday}-${meeting.period}-${meeting.week_mask}`)
      .sort()
      .join(',');
  const current = course.sections.find((section) => section.section_number === selected);
  const currentSignature = current ? signature(current) : null;
  const groups = new Map<string, Alternative>();
  for (const section of course.sections) {
    if (section.section_number === selected) continue;
    if (!section.meetings.some((meeting) => meeting.weekday != null)) continue;
    const key = signature(section);
    if (key === currentSignature) continue;
    const group = groups.get(key);
    if (group) group.sectionNumbers.push(section.section_number);
    else groups.set(key, { section, sectionNumbers: [section.section_number] });
  }
  return [...groups.values()];
}
