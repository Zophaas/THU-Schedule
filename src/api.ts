// Response shapes shared by the Worker (worker/index.ts) and the React app.
// Source values are strings as displayed; '' means the source showed no value.

export interface Meeting {
  seq: number;
  weekday: number | null;
  period: number | null;
  weeks_text: string;
  /** Bit (n - 1) set for teaching week n; null when the week text was not understood. */
  week_mask: number | null;
  raw: string;
}

export interface Section {
  id: number;
  term: string;
  course_number: string;
  section_number: string;
  course_name: string;
  course_name_en: string | null;
  department: string;
  credits: string;
  instructors: string;
  undergrad_capacity: string;
  undergrad_available: string;
  graduate_capacity: string;
  graduate_available: string;
  class_time: string;
  enrollment_notes: string;
  course_features: string;
  grade: string;
  secondary_enrollment: string;
  lab_info: string;
  retakes_count_toward_capacity: string;
  enrollment_time_restricted: string;
  general_education_group: string;
  course_detail_url: string | null;
  lab_detail_url: string | null;
  meetings: Meeting[];
}

export interface CourseSummary {
  course_number: string;
  course_name: string;
  course_name_en: string | null;
  department: string;
  credits: string;
  sections: Section[];
}

export interface CourseDetail {
  url: string;
  course_number: string;
  course_name: string;
  total_hours: string;
  total_credits: string;
  description: string;
  description_en: string;
  schedule: string;
  assessment: string;
  textbooks: string;
  main_textbook: string;
  reference_books: string;
  co_instructors: string;
  guidance: string;
  prerequisites: string;
  teaching_features: string;
  office_hour: string;
  grading: string;
  calendar_url: string | null;
  syllabus_url: string | null;
}

export interface LabDetail {
  url: string;
  fields: Record<string, string>;
}

export interface ArchiveMeta {
  term: string;
  source: string;
  retrieved_at: string;
  section_count: number;
  english_names: number;
  departments: string[];
}

export interface SearchResponse {
  term: string;
  query: string;
  courses: CourseSummary[];
  truncated: boolean;
}

export interface CourseListResponse {
  term: string;
  courses: CourseSummary[];
}

export interface CourseResponse {
  term: string;
  course: CourseSummary;
  details: CourseDetail[];
  labs: LabDetail[];
}
