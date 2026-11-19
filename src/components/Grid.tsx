import { useEffect, useRef, useState } from 'react';
import type { Block } from '../lib/plan';
import { t, tn } from '../lib/i18n';
import { PERIODS, WEEKDAYS, dayName, hasWeek, periodLabel } from '../lib/weeks';

/** A semi-transparent drop target: another section of the course being dragged. */
export interface Ghost {
  block: Block;
  sectionNumber: string;
  label: string;
  conflict: boolean;
}

interface Placed<T> {
  item: T;
  block: Block;
  lane: number;
  lanes: number;
}

/** Assign side-by-side lanes to blocks whose periods overlap on the same day. */
function layoutDay<T>(items: { item: T; block: Block }[]): Placed<T>[] {
  const sorted = [...items].sort((a, b) => a.block.start - b.block.start || b.block.end - a.block.end);
  const placed: Placed<T>[] = [];
  let cluster: Placed<T>[] = [];
  let clusterEnd = 0;
  const closeCluster = () => {
    const lanes = Math.max(1, ...cluster.map((entry) => entry.lane + 1));
    for (const entry of cluster) entry.lanes = lanes;
    cluster = [];
  };
  for (const { item, block } of sorted) {
    if (cluster.length && block.start > clusterEnd) closeCluster();
    const laneEnds: number[] = [];
    for (const other of cluster) laneEnds[other.lane] = Math.max(laneEnds[other.lane] ?? 0, other.block.end);
    let lane = 0;
    while (laneEnds[lane] !== undefined && laneEnds[lane] >= block.start) lane += 1;
    const entry = { item, block, lane, lanes: 1 };
    cluster.push(entry);
    placed.push(entry);
    clusterEnd = Math.max(clusterEnd, block.end);
  }
  closeCluster();
  return placed;
}

function position(block: Block, lane: number, lanes: number, color: string) {
  return {
    top: `calc(${block.start - 1} * var(--row) + 3px)`,
    height: `calc(${block.end - block.start + 1} * var(--row) - 6px)`,
    left: `calc(${(lane / lanes) * 100}% + 3px)`,
    width: `calc(${100 / lanes}% - 6px)`,
    ['--block' as string]: color,
  };
}

interface GridProps {
  blocks: Block[];
  preview: Block[];
  ghosts: Ghost[];
  colors: string[];
  showWeekends: boolean;
  selectedWeek: number | null;
  conflicting: Set<string>;
  highlighted: string | null;
  draggingRef: string | null;
  canDrag: (block: Block) => boolean;
  onDragStart: (block: Block) => void;
  onDrop: (sectionNumber: string | null) => void;
  onSelect: (block: Block) => void;
  onShowWeekends: () => void;
}

interface PointerState {
  block: Block;
  pointerId: number;
  startX: number;
  startY: number;
  dragging: boolean;
}

export function Grid(props: GridProps) {
  const { blocks, preview, ghosts, colors, selectedWeek, conflicting, highlighted, draggingRef } = props;
  const pointer = useRef<PointerState | null>(null);
  const suppressClick = useRef(false);
  const [cursor, setCursor] = useState<{ x: number; y: number; label: string } | null>(null);
  const [target, setTarget] = useState<string | null>(null);

  const visible = blocks.filter((block) => !block.hidden);
  const ghostOnWeekend = ghosts.some((ghost) => ghost.block.weekday >= 6);
  const showWeekends = props.showWeekends || ghostOnWeekend;
  const hiddenWeekend = showWeekends ? [] : [...visible, ...preview].filter((block) => block.weekday >= 6);
  const days = WEEKDAYS.filter((day) => showWeekends || day <= 5);

  useEffect(() => {
    if (!draggingRef) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      pointer.current = null;
      setCursor(null);
      setTarget(null);
      props.onDrop(null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [draggingRef, props]);

  const dropTargetAt = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest('[data-drop]') as HTMLElement | null)?.dataset.drop ?? null;

  const handlers = (block: Block) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !props.canDrag(block)) return;
      pointer.current = { block, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, dragging: false };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture can fail for synthetic or already-released pointers; dragging still works without it.
      }
    },
    onPointerMove: (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = pointer.current;
      if (!state || state.pointerId !== event.pointerId) return;
      if (!state.dragging) {
        if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < 6) return;
        state.dragging = true;
        props.onDragStart(state.block);
      }
      setCursor({ x: event.clientX, y: event.clientY, label: `${state.block.title} ${state.block.subtitle}` });
      setTarget(dropTargetAt(event.clientX, event.clientY));
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      const state = pointer.current;
      pointer.current = null;
      if (!state?.dragging) return;
      suppressClick.current = true;
      setCursor(null);
      setTarget(null);
      props.onDrop(dropTargetAt(event.clientX, event.clientY));
    },
    onPointerCancel: () => {
      if (pointer.current?.dragging) props.onDrop(null);
      pointer.current = null;
      setCursor(null);
      setTarget(null);
    },
    onClick: () => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return;
      }
      props.onSelect(block);
    },
  });

  return (
    <div className="grid-wrap">
      {hiddenWeekend.length > 0 && (
        <p className="notice warn">
          {tn(hiddenWeekend.length, 'weekendHidden1', 'weekendHidden')}{' '}
          <button type="button" className="link" onClick={props.onShowWeekends}>
            {t('showWeekends')}
          </button>
        </p>
      )}
      <div
        className={`grid${draggingRef ? ' is-dragging' : ''}`}
        style={{ ['--days' as string]: days.length }}
        role="table"
        aria-label="Timetable"
      >
        <div className="grid-corner" />
        {days.map((day) => (
          <div key={day} className={`grid-day${day >= 6 ? ' weekend' : ''}`} role="columnheader">
            {dayName(day)}
          </div>
        ))}
        {PERIODS.map((period) => (
          <div key={period} className="grid-period" style={{ gridRow: period + 1 }} role="rowheader">
            <span>{period}</span>
            <small>{periodLabel(period)}</small>
          </div>
        ))}
        {days.map((day, column) => {
          const placed = layoutDay([
            ...visible.filter((block) => block.weekday === day).map((block) => ({ item: { preview: false }, block })),
            ...preview.filter((block) => block.weekday === day).map((block) => ({ item: { preview: true }, block })),
          ]);
          const ghostPlaced = layoutDay(
            ghosts.filter((ghost) => ghost.block.weekday === day).map((ghost) => ({ item: ghost, block: ghost.block })),
          );
          return (
            <div
              key={day}
              className={`grid-column${day >= 6 ? ' weekend' : ''}`}
              style={{ gridColumn: column + 2, gridRow: `2 / span ${PERIODS.length}` }}
            >
              {PERIODS.map((period) => (
                <div key={period} className="grid-cell" />
              ))}
              {placed.map(({ block, lane, lanes, item }) => {
                const isPreview = item.preview;
                const offWeek = selectedWeek != null && block.weekMask != null && !hasWeek(block.weekMask, selectedWeek);
                const conflict = !isPreview && conflicting.has(block.refId);
                const draggable = !isPreview && props.canDrag(block);
                const classes = [
                  'block',
                  isPreview && 'preview',
                  offWeek && 'off-week',
                  conflict && 'conflict',
                  highlighted === block.refId && 'highlighted',
                  block.kind === 'event' && 'event',
                  draggable && 'draggable',
                  draggingRef === block.refId && !isPreview && 'dragging',
                  lanes >= 3 && 'narrow',
                ]
                  .filter(Boolean)
                  .join(' ');
                const status = [
                  offWeek ? t('notInWeek', { n: selectedWeek! }) : '',
                  block.weekMask == null ? t('weeksUnknown') : '',
                  conflict ? t('timeConflict') : '',
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <button
                    type="button"
                    key={`${block.key}${isPreview ? '-preview' : ''}`}
                    className={classes}
                    style={position(block, lane, lanes, colors[block.color % colors.length])}
                    title={`${block.title} ${block.subtitle}\n${block.detail}\n${block.weeksText}${status ? `\n${status}` : ''}`}
                    tabIndex={isPreview ? -1 : 0}
                    {...(isPreview ? {} : handlers(block))}
                  >
                    <strong>
                      {conflict && <span aria-label={t('timeConflict')}>⚠ </span>}
                      {block.title}
                    </strong>
                    {block.subtitle && <span>{block.subtitle}</span>}
                    <span className="block-detail">{block.detail}</span>
                    <span className="block-weeks">
                      {block.weekMask == null ? `${block.weeksText} · ${t('weeksUnknown')}` : block.weeksText}
                    </span>
                    {offWeek && <span className="block-flag">{t('notInWeek', { n: selectedWeek! })}</span>}
                    {isPreview && <span className="block-flag">{t('preview')}</span>}
                  </button>
                );
              })}
              {ghostPlaced.map(({ item: ghost, block, lane, lanes }) => (
                <div
                  key={`ghost-${block.key}`}
                  data-drop={ghost.sectionNumber}
                  className={`block ghost${target === ghost.sectionNumber ? ' target' : ''}${ghost.conflict ? ' ghost-conflict' : ''}`}
                  style={position(block, lane, lanes, colors[block.color % colors.length])}
                  aria-hidden="true"
                >
                  <strong>{ghost.label}</strong>
                  <span className="block-weeks">{block.weeksText}</span>
                  {ghost.conflict && <span className="block-flag">⚠ {t('wouldConflict')}</span>}
                  {target === ghost.sectionNumber && (
                    <span className="block-flag">{t('dropToSwitch', { n: ghost.sectionNumber })}</span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
      {cursor && (
        <div className="drag-label" style={{ left: cursor.x + 12, top: cursor.y + 12 }} aria-hidden="true">
          {cursor.label}
        </div>
      )}
    </div>
  );
}
