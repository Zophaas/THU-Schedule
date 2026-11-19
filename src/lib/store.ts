import { useCallback, useEffect, useRef, useState } from 'react';
import { type Lang, defaultLang, t } from './i18n';

// Schedules live only in this browser's localStorage until an account-backed
// sync service exists. Plans are kept per term and never shared across terms.

const STORAGE_KEY = 'thu-scheduler:v1';

export interface PlannedCourse {
  courseNumber: string;
  sectionNumber: string;
  /** Index into the active palette. */
  color: number;
  hidden: boolean;
}

export interface PersonalEvent {
  id: string;
  title: string;
  location: string;
  color: number;
  days: number[];
  periodStart: number;
  periodEnd: number;
  weekMask: number;
  hidden: boolean;
}

export interface Schedule {
  id: string;
  name: string;
  courses: PlannedCourse[];
  events: PersonalEvent[];
}

export interface TermPlans {
  activeId: string;
  schedules: Schedule[];
}

export interface Settings {
  language: Lang;
  showWeekends: boolean;
  palette: PaletteName;
  /** Term shown on the last visit; schedules themselves are always kept per term. */
  lastTerm?: string;
}

export interface Store {
  version: 1;
  terms: Record<string, TermPlans>;
  settings: Settings;
}

export type PaletteName = 'vivid' | 'muted';

export const PALETTES: Record<PaletteName, { label: string; colors: string[] }> = {
  vivid: {
    label: 'Default / 默认',
    colors: ['#5b6fa8', '#c0714f', '#a85a7a', '#4f8aa8', '#6f7680', '#4f9488', '#a8893f', '#7a6aa8', '#8a6f5a', '#5f8f55'],
  },
  muted: {
    label: 'Dark / 深色',
    colors: ['#4a5d8a', '#a65233', '#8f3d5c', '#3a7ca5', '#5b6470', '#6d4c8f', '#2f7d6d', '#94641c', '#6b5245', '#4d7a3e'],
  },
};

export type SaveState = 'saved' | 'saving' | 'error';

export function newId(): string {
  return crypto.randomUUID();
}

export function emptySchedule(name: string): Schedule {
  return { id: newId(), name, courses: [], events: [] };
}

function defaultStore(): Store {
  return { version: 1, terms: {}, settings: { language: defaultLang(), showWeekends: false, palette: 'vivid' } };
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultStore();
    const parsed = JSON.parse(raw) as Store;
    if (parsed.version !== 1 || typeof parsed.terms !== 'object') return defaultStore();
    return { ...defaultStore(), ...parsed, settings: { ...defaultStore().settings, ...parsed.settings } };
  } catch {
    return defaultStore();
  }
}

/** The whole store with automatic, debounced saving to localStorage. */
export function useStore() {
  const [store, setStore] = useState<Store>(readStore);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setSaveState('saving');
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [store]);

  const update = useCallback((recipe: (draft: Store) => Store) => setStore((current) => recipe(current)), []);
  return { store, update, saveState };
}

/** Plans for one term, creating a first schedule when the term has none. */
export function termPlans(store: Store, term: string): TermPlans {
  const plans = store.terms[term];
  if (plans?.schedules.length) {
    return plans.schedules.some((schedule) => schedule.id === plans.activeId)
      ? plans
      : { ...plans, activeId: plans.schedules[0].id };
  }
  const schedule = emptySchedule(t('scheduleN', { n: 1 }));
  return { activeId: schedule.id, schedules: [schedule] };
}

export function withTermPlans(store: Store, term: string, recipe: (plans: TermPlans) => TermPlans): Store {
  return { ...store, terms: { ...store.terms, [term]: recipe(termPlans(store, term)) } };
}

export function withSchedule(store: Store, term: string, recipe: (schedule: Schedule) => Schedule): Store {
  return withTermPlans(store, term, (plans) => ({
    ...plans,
    schedules: plans.schedules.map((schedule) => (schedule.id === plans.activeId ? recipe(schedule) : schedule)),
  }));
}

export function nextColor(schedule: Schedule): number {
  const used = new Set([...schedule.courses.map((course) => course.color), ...schedule.events.map((event) => event.color)]);
  for (let index = 0; index < 10; index += 1) if (!used.has(index)) return index;
  return (schedule.courses.length + schedule.events.length) % 10;
}
