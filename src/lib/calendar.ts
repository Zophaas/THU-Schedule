import type { PlanView } from './plan';
import type { CourseCache } from './plan';
import { courseName } from './i18n';
import type { Schedule } from './store';
import { weeksOf } from './weeks';

// Calendar export (.ics). Dates come only from the official 校历 entered below, and
// clock times only from the published class-period times; a term without a calendar
// entry cannot be exported. Rooms are never included because the archive has none.

/** Clock times (Beijing time, UTC+8) of the six daily class periods (大节). */
export const PERIOD_TIMES: readonly [string, string][] = [
  ['08:00', '09:35'], // 第1-2小节
  ['09:50', '12:15'], // 第3-5小节
  ['13:30', '15:05'], // 第6-7小节
  ['15:20', '16:55'], // 第8-9小节
  ['17:05', '18:40'], // 第10-11小节
  ['19:20', '21:45'], // 第12-14小节
];

export interface TermCalendar {
  /** Monday of teaching week 1 (YYYY-MM-DD). */
  week1Monday: string;
  /** Teaching weeks; the 校历 may list later exam weeks, which hold no regular classes. */
  teachingWeeks: number;
  /** Days without classes. */
  noClassDays: { date: string; name: { en: string; zh: string } }[];
  /** False while make-up class days (调休) for the term's holidays are still unannounced. */
  makeUpsPublished: boolean;
}

/** From the official 2026–2027 校历. Add a term here once its calendar is published. */
export const TERM_CALENDARS: Record<string, TermCalendar> = {
  '2026-2027-2': {
    week1Monday: '2027-02-22',
    teachingWeeks: 16,
    noClassDays: [
      { date: '2027-04-05', name: { en: 'Qingming Festival', zh: '清明节' } },
      ...['2027-04-30', '2027-05-01', '2027-05-02', '2027-05-03', '2027-05-04', '2027-05-05'].map((date) => ({
        date,
        name: { en: 'Anniversary & Labor Day', zh: '校庆及“五一”' },
      })),
      { date: '2027-06-09', name: { en: 'Dragon Boat Festival', zh: '端午节' } },
    ],
    makeUpsPublished: false,
  },
};

const TZID = 'Asia/Shanghai';
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:STANDARD',
  'DTSTART:19700101T000000',
  'TZOFFSETFROM:+0800',
  'TZOFFSETTO:+0800',
  'TZNAME:CST',
  'END:STANDARD',
  'END:VTIMEZONE',
];

/** The calendar date of a teaching week's weekday (1 = Monday), as YYYY-MM-DD. */
export function dateOf(calendar: TermCalendar, week: number, weekday: number): string {
  const [year, month, day] = calendar.week1Monday.split('-').map(Number);
  // UTC arithmetic avoids the viewer's own time zone and daylight saving.
  const date = new Date(Date.UTC(year, month - 1, day + (week - 1) * 7 + (weekday - 1)));
  return date.toISOString().slice(0, 10);
}

function escapeText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Fold content lines at 75 octets without splitting a UTF-8 character (RFC 5545 §3.1). */
function fold(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > (parts.length ? 74 : 75)) {
      parts.push(current);
      current = '';
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

function localTime(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

export interface CalendarExport {
  ics: string;
  eventCount: number;
  /** Occurrences left out because they fall on a no-class day. */
  holidaySkips: number;
  /** Labels of planned items that could not be exported, with the reason. */
  leftOut: { label: string; reason: 'hidden' | 'noTime' | 'unknownWeeks' | 'notFound' }[];
}

export function buildCalendar(
  term: string,
  calendar: TermCalendar,
  schedule: Schedule,
  plan: PlanView,
  cache: CourseCache,
): CalendarExport {
  const noClass = new Set(calendar.noClassDays.map((day) => day.date));
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const events: string[] = [];
  let holidaySkips = 0;
  const leftOut: CalendarExport['leftOut'] = [];
  const leftOutKeys = new Set<string>();
  const leave = (refId: string, reason: CalendarExport['leftOut'][number]['reason']) => {
    const key = `${refId}|${reason}`;
    if (leftOutKeys.has(key)) return;
    leftOutKeys.add(key);
    leftOut.push({ label: plan.labels.get(refId) ?? refId, reason });
  };

  for (const planned of schedule.courses) {
    const course = cache.get(planned.courseNumber);
    if (!course || !course.sections.some((section) => section.section_number === planned.sectionNumber)) {
      leftOut.push({ label: `${planned.courseNumber}-${planned.sectionNumber}`, reason: 'notFound' });
    }
  }
  for (const item of plan.unscheduled) if (!item.hidden) leave(item.refId, 'noTime');

  for (const block of plan.blocks) {
    if (block.hidden) {
      leave(block.refId, 'hidden');
      continue;
    }
    // Unknown weeks are never treated as "every week".
    if (block.weekMask == null) {
      leave(block.refId, 'unknownWeeks');
      continue;
    }
    const isCourse = block.kind === 'course';
    const course = isCourse ? cache.get(block.refId) : null;
    const section = course?.sections.find((item) => item.section_number === block.sectionNumber);
    const summary = isCourse && course ? `${courseName(course)} (${course.course_number}-${block.sectionNumber})` : block.title;
    const description = isCourse
      ? [section?.instructors, section?.class_time && `${section.class_time}`, 'THU Scheduler — planning only, not an enrollment']
          .filter(Boolean)
          .join('\n')
      : 'THU Scheduler — personal event';
    const [startTime] = PERIOD_TIMES[block.start - 1];
    const [, endTime] = PERIOD_TIMES[block.end - 1];
    for (const week of weeksOf(block.weekMask)) {
      if (week > calendar.teachingWeeks) continue;
      const date = dateOf(calendar, week, block.weekday);
      if (noClass.has(date)) {
        holidaySkips += 1;
        continue;
      }
      events.push(
        [
          'BEGIN:VEVENT',
          `UID:${term}-${block.refId}-${block.weekday}-${block.start}-${date}@thu-scheduler.hughzhao.com`,
          `DTSTAMP:${stamp}`,
          `DTSTART;TZID=${TZID}:${localTime(date, startTime)}`,
          `DTEND;TZID=${TZID}:${localTime(date, endTime)}`,
          `SUMMARY:${escapeText(summary)}`,
          `DESCRIPTION:${escapeText(description)}`,
          ...(!isCourse && block.subtitle ? [`LOCATION:${escapeText(block.subtitle)}`] : []),
          'END:VEVENT',
        ]
          .map(fold)
          .join('\r\n'),
      );
    }
  }

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//THU Scheduler//Schedule export//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${escapeText(schedule.name)}`),
    `X-WR-TIMEZONE:${TZID}`,
    ...VTIMEZONE,
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n');
  return { ics, eventCount: events.length, holidaySkips, leftOut };
}
