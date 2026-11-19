import type {
  ArchiveMeta,
  CourseDetail,
  CourseListResponse,
  CourseResponse,
  CourseSummary,
  LabDetail,
  Meeting,
  SearchResponse,
  Section,
} from '../src/api';

const COURSE_LIMIT = 40;

type SectionRow = Omit<Section, 'meetings'>;
type MeetingRow = Meeting & { section_id: number };

const SECTION_COLUMNS = `id, term, course_number, section_number, course_name, course_name_en, department, credits,
  instructors, undergrad_capacity, undergrad_available, graduate_capacity, graduate_available,
  class_time, enrollment_notes, course_features, grade, secondary_enrollment, lab_info,
  retakes_count_toward_capacity, enrollment_time_restricted, general_education_group,
  course_detail_url, lab_detail_url`;

function json(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'cache-control': 'public, max-age=300' },
  });
}

function error(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

async function defaultTerm(db: D1Database): Promise<string | null> {
  const row = await db.prepare('SELECT term FROM archive_meta ORDER BY term DESC LIMIT 1').first<{ term: string }>();
  return row?.term ?? null;
}

/** Load sections (with their meetings) and group them by course, keeping row order. */
async function loadCourses(db: D1Database, rows: SectionRow[]): Promise<CourseSummary[]> {
  const ids = rows.map((row) => row.id);
  const meetingRows = ids.length
    ? (
        await db
          .prepare(
            `SELECT section_id, seq, weekday, period, weeks_text, week_mask, raw FROM meetings
             WHERE section_id IN (SELECT value FROM json_each(?1)) ORDER BY section_id, weekday, period, seq`,
          )
          .bind(JSON.stringify(ids))
          .all<MeetingRow>()
      ).results
    : [];
  const meetings = new Map<number, Meeting[]>();
  for (const { section_id, ...meeting } of meetingRows) {
    const list = meetings.get(section_id) ?? [];
    list.push(meeting);
    meetings.set(section_id, list);
  }
  const courses = new Map<string, CourseSummary>();
  for (const row of rows) {
    let course = courses.get(row.course_number);
    if (!course) {
      course = {
        course_number: row.course_number,
        course_name: row.course_name,
        course_name_en: row.course_name_en,
        department: row.department,
        credits: row.credits,
        sections: [],
      };
      courses.set(row.course_number, course);
    }
    course.sections.push({ ...row, meetings: meetings.get(row.id) ?? [] });
  }
  return [...courses.values()];
}

async function handleMeta(db: D1Database): Promise<Response> {
  const metas = (
    await db
      .prepare(
        `SELECT term, source, retrieved_at, section_count,
           (SELECT count(*) FROM sections s WHERE s.term = archive_meta.term AND s.course_name_en IS NOT NULL) AS english_names
         FROM archive_meta ORDER BY term DESC`,
      )
      .all<Omit<ArchiveMeta, 'departments'>>()
  ).results;
  const departments = (
    await db
      .prepare('SELECT term, department FROM sections GROUP BY term, department ORDER BY term, department')
      .all<{ term: string; department: string }>()
  ).results;
  const result: ArchiveMeta[] = metas.map((meta) => ({
    ...meta,
    departments: departments.filter((row) => row.term === meta.term).map((row) => row.department),
  }));
  // Not cached: the list of terms should update as soon as a new term is imported.
  return Response.json(result, { headers: { 'cache-control': 'no-cache' } });
}

async function handleSearch(db: D1Database, term: string, params: URLSearchParams): Promise<Response> {
  const query = (params.get('q') ?? '').trim().slice(0, 100);
  const department = params.get('department') ?? '';
  // English mode searches English names; Chinese text in the query still matches Chinese names.
  const english = params.get('lang') === 'en';
  const hasCjk = /[\u3400-\u9fff]/.test(query);
  const nameColumn = english && !hasCjk ? 'coalesce(course_name_en, \'\')' : 'course_name';
  if (!query && !department) return json({ term, query, courses: [], truncated: false } satisfies SearchResponse);

  const like = `%${escapeLike(query)}%`;
  const prefix = `${escapeLike(query)}%`;
  // Rank: exact course number, number prefix, name prefix, name contains, instructor contains.
  const matched = await db
    .prepare(
      `SELECT course_number FROM (
         SELECT course_number,
           CASE
             WHEN ?2 = '' THEN 5
             WHEN course_number = ?2 THEN 0
             WHEN course_number LIKE ?3 ESCAPE '\\' THEN 1
             WHEN ${nameColumn} LIKE ?3 ESCAPE '\\' THEN 2
             WHEN ${nameColumn} LIKE ?4 ESCAPE '\\' THEN 3
             WHEN instructors LIKE ?4 ESCAPE '\\' THEN 4
           END AS rank
         FROM sections
         WHERE term = ?1 AND (?5 = '' OR department = ?5)
       )
       WHERE rank IS NOT NULL
       GROUP BY course_number
       ORDER BY min(rank), course_number
       LIMIT ?6`,
    )
    .bind(term, query, prefix, like, department, COURSE_LIMIT + 1)
    .all<{ course_number: string }>();
  const numbers = matched.results.map((row) => row.course_number);
  const truncated = numbers.length > COURSE_LIMIT;
  numbers.length = Math.min(numbers.length, COURSE_LIMIT);

  const rows = numbers.length
    ? (
        await db
          .prepare(
            `SELECT ${SECTION_COLUMNS} FROM sections
             WHERE term = ?1 AND course_number IN (SELECT value FROM json_each(?2))
             ORDER BY section_number`,
          )
          .bind(term, JSON.stringify(numbers))
          .all<SectionRow>()
      ).results
    : [];
  // Keep the ranked course order from the first query.
  const order = new Map(numbers.map((number, index) => [number, index]));
  rows.sort((a, b) => order.get(a.course_number)! - order.get(b.course_number)!);
  const courses = await loadCourses(db, rows);
  return json({ term, query, courses, truncated } satisfies SearchResponse);
}

async function handleCourse(db: D1Database, term: string, courseNumber: string): Promise<Response> {
  const rows = (
    await db
      .prepare(`SELECT ${SECTION_COLUMNS} FROM sections WHERE term = ?1 AND course_number = ?2 ORDER BY section_number`)
      .bind(term, courseNumber)
      .all<SectionRow>()
  ).results;
  if (!rows.length) return error(`Course ${courseNumber} is not offered in ${term}.`, 404);

  const [course] = await loadCourses(db, rows);
  const detailUrls = [...new Set(rows.map((row) => row.course_detail_url).filter(Boolean))];
  const labUrls = [...new Set(rows.map((row) => row.lab_detail_url).filter(Boolean))];
  const [details, labs] = await db.batch([
    db
      .prepare(
        `SELECT url, course_number, course_name, total_hours, total_credits, description, description_en,
           schedule, assessment, textbooks, main_textbook, reference_books, co_instructors, guidance,
           prerequisites, teaching_features, office_hour, grading, calendar_url, syllabus_url
         FROM course_details WHERE term = ?1 AND url IN (SELECT value FROM json_each(?2))`,
      )
      .bind(term, JSON.stringify(detailUrls)),
    // Detail pages are stored per term: the same URL can carry different content in another term.
    db
      .prepare('SELECT url, fields_json FROM lab_details WHERE term = ?1 AND url IN (SELECT value FROM json_each(?2))')
      .bind(term, JSON.stringify(labUrls)),
  ]);
  const body: CourseResponse = {
    term,
    course,
    details: details.results as CourseDetail[],
    labs: (labs.results as { url: string; fields_json: string }[]).map(
      (row): LabDetail => ({ url: row.url, fields: JSON.parse(row.fields_json) }),
    ),
  };
  return json(body);
}

/** Sections and meetings for several courses at once, used to restore a saved schedule. */
async function handleCourseList(db: D1Database, term: string, params: URLSearchParams): Promise<Response> {
  const numbers = [...new Set((params.get('numbers') ?? '').split(',').filter((value) => /^[0-9A-Za-z]+$/.test(value)))];
  if (numbers.length > 100) return error('Too many courses requested.', 400);
  const rows = numbers.length
    ? (
        await db
          .prepare(
            `SELECT ${SECTION_COLUMNS} FROM sections
             WHERE term = ?1 AND course_number IN (SELECT value FROM json_each(?2))
             ORDER BY course_number, section_number`,
          )
          .bind(term, JSON.stringify(numbers))
          .all<SectionRow>()
      ).results
    : [];
  return json({ term, courses: await loadCourses(db, rows) } satisfies CourseListResponse);
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'GET') return error('Method not allowed', 405);
    try {
      const db = env.DB;
      if (url.pathname === '/api/meta') return await handleMeta(db);
      const course = url.pathname.match(/^\/api\/courses\/([0-9A-Za-z]+)$/);
      if (url.pathname !== '/api/search' && url.pathname !== '/api/courses' && !course) return error('Not found', 404);
      const term = url.searchParams.get('term') || (await defaultTerm(db));
      if (!term) return error('No archived term is loaded.', 404);
      if (url.pathname === '/api/search') return await handleSearch(db, term, url.searchParams);
      if (url.pathname === '/api/courses') return await handleCourseList(db, term, url.searchParams);
      if (course) return await handleCourse(db, term, course[1]);
    } catch (cause) {
      console.error(cause);
      return error('Database query failed.', 500);
    }
    return error('Not found', 404);
  },
} satisfies ExportedHandler<Env>;
