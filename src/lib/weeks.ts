// Teaching weeks are stored as bitmasks: bit (n - 1) set means teaching week n.
// This matches meetings.week_mask produced by scripts/build_d1_import.py.
import { getLang } from './i18n';

export const TERM_WEEKS = 16;
export const PERIODS = [1, 2, 3, 4, 5, 6];
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

const DAY_NAMES = {
  zh: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
};

export function rangeMask(start: number, end: number): number {
  let mask = 0;
  for (let week = start; week <= end; week += 1) mask |= 1 << (week - 1);
  return mask;
}

export const ALL_WEEKS = rangeMask(1, TERM_WEEKS);

export function hasWeek(mask: number, week: number): boolean {
  return ((mask >>> (week - 1)) & 1) === 1;
}

export function weeksOf(mask: number): number[] {
  const weeks: number[] = [];
  for (let week = 1; week <= 30; week += 1) if (hasWeek(mask, week)) weeks.push(week);
  return weeks;
}

export function maxWeek(mask: number): number {
  return weeksOf(mask).at(-1) ?? 0;
}

function weekRanges(mask: number): string {
  const weeks = weeksOf(mask);
  const parts: string[] = [];
  let start = weeks[0];
  let previous = weeks[0];
  for (const week of [...weeks.slice(1), Infinity]) {
    if (week === previous + 1) {
      previous = week;
      continue;
    }
    parts.push(start === previous ? `${start}` : `${start}-${previous}`);
    start = previous = week;
  }
  return parts.join(', ');
}

/** Compact text such as "1-8, 10周" or "Weeks 1-8, 10". */
export function formatWeeks(mask: number): string {
  const en = getLang() === 'en';
  if (mask === ALL_WEEKS) return en ? 'All weeks' : '全周';
  if (!weeksOf(mask).length) return en ? 'No weeks' : '无周次';
  const ranges = weekRanges(mask);
  if (en) return `${weeksOf(mask).length === 1 ? 'Week' : 'Weeks'} ${ranges}`;
  return `${ranges}周`;
}

/** Source week text (e.g. 前八周, 3-5周) for display in the current language. */
export function weeksLabel(text: string): string {
  if (getLang() === 'zh') return text;
  const fixed: Record<string, string> = {
    全周: 'All weeks',
    前八周: 'Weeks 1-8',
    后八周: 'Weeks 9-16',
    单周: 'Odd weeks',
    双周: 'Even weeks',
  };
  if (fixed[text]) return fixed[text];
  const match = text.match(/^([\d,-]+)周$/);
  if (match) return `${/[,-]/.test(match[1]) ? 'Weeks' : 'Week'} ${match[1].replace(/,/g, ', ')}`;
  return text;
}

export function dayName(day: number): string {
  return DAY_NAMES[getLang()][day - 1] ?? `${day}`;
}

/** "第3-4节" / "P3-4". */
export function formatPeriods(start: number, end: number): string {
  const range = start === end ? `${start}` : `${start}-${end}`;
  return getLang() === 'en' ? `P${range}` : `第${range}节`;
}

export function periodLabel(period: number): string {
  return getLang() === 'en' ? `Period ${period}` : `第${period}节`;
}

/** Parse "1-8, 10, 12-16" (optionally ending in 周) into a mask; null when invalid. */
export function parseWeekList(text: string, weekCount = TERM_WEEKS): number | null {
  const cleaned = text
    .replace(/^weeks?\s*/i, '')
    .replace(/周$/, '')
    .replace(/\s+/g, '')
    .replace(/，/g, ',');
  if (!cleaned) return null;
  let mask = 0;
  for (const part of cleaned.split(',')) {
    const match = part.match(/^(\d+)(?:-(\d+))?$/);
    if (!match) return null;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > weekCount) return null;
    mask |= rangeMask(start, end);
  }
  return mask;
}

export function termLabel(term: string): string {
  const match = term.match(/^(\d{4})-(\d{4})-(\d)$/);
  if (!match) return term;
  const en = getLang() === 'en';
  const seasons = en ? { '1': 'Fall', '2': 'Spring', '3': 'Summer' } : { '1': '秋季学期', '2': '春季学期', '3': '夏季学期' };
  const season = seasons[match[3] as '1' | '2' | '3'] ?? match[3];
  return en ? `${season} ${match[1]}–${match[2]}` : `${match[1]}–${match[2]} ${season}`;
}
