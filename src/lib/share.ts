import type { PlannedCourse, Schedule } from './store';

// A share link carries the schedule itself in the URL fragment, so no server stores it
// and the Worker never sees it (browsers do not send the fragment). Only classes are
// shared; personal events can hold private text and are always left out.
//
// Format: #share=v1.<base64url(JSON)> with JSON {t: term, n: name, c: [[course, section, color, hidden]]}.

const PARAM = 'share';
const VERSION = 'v1';
const MAX_COURSES = 60;
const MAX_NAME = 80;
const TERM_RE = /^\d{4}-\d{4}-[123]$/;
const CODE_RE = /^[0-9A-Za-z]{1,16}$/;

export interface SharedSchedule {
  term: string;
  name: string;
  courses: PlannedCourse[];
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(data: string): string {
  const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
}

export function shareUrl(term: string, schedule: Schedule): string {
  const payload = {
    t: term,
    n: schedule.name,
    c: schedule.courses.map((course) => [course.courseNumber, course.sectionNumber, course.color, course.hidden ? 1 : 0]),
  };
  return `${location.origin}/#${PARAM}=${VERSION}.${toBase64Url(JSON.stringify(payload))}`;
}

/** The shared schedule in a URL hash; null when there is none; 'invalid' when it cannot be read. */
export function parseShareHash(hash: string): SharedSchedule | 'invalid' | null {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get(PARAM);
  if (value == null) return null;
  try {
    const [version, data] = value.split('.', 2);
    if (version !== VERSION || !data) return 'invalid';
    const payload = JSON.parse(fromBase64Url(data)) as { t?: unknown; n?: unknown; c?: unknown };
    if (typeof payload.t !== 'string' || !TERM_RE.test(payload.t)) return 'invalid';
    if (!Array.isArray(payload.c) || payload.c.length > MAX_COURSES) return 'invalid';
    const seen = new Set<string>();
    const courses: PlannedCourse[] = [];
    for (const item of payload.c) {
      if (!Array.isArray(item)) return 'invalid';
      const [courseNumber, sectionNumber, color, hidden] = item as unknown[];
      if (typeof courseNumber !== 'string' || !CODE_RE.test(courseNumber)) return 'invalid';
      if (typeof sectionNumber !== 'string' || !CODE_RE.test(sectionNumber)) return 'invalid';
      // One section per course, as in a saved schedule.
      if (seen.has(courseNumber)) continue;
      seen.add(courseNumber);
      courses.push({
        courseNumber,
        sectionNumber,
        color: Number.isInteger(color) && (color as number) >= 0 && (color as number) < 10 ? (color as number) : courses.length % 10,
        hidden: hidden === 1,
      });
    }
    const name = typeof payload.n === 'string' ? payload.n.trim().slice(0, MAX_NAME) : '';
    return { term: payload.t, name, courses };
  } catch {
    return 'invalid';
  }
}

/** Remove the share fragment so a reload or bookmark does not offer the import again. */
export function clearShareHash(): void {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}
