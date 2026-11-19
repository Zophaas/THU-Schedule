# Tsinghua scheduler behavior guideline

This guideline describes the intended planning experience for THU Scheduler. It is based on a direct walkthrough of the [Cornell Class Roster scheduler for Fall 2026](https://classes.cornell.edu/scheduler/roster/FA26) on November 18, 2026, and adapted to the Tsinghua course archive.

The scheduler helps students compare possible timetables. A planned section is **not** an enrollment, reservation, or guarantee of an available seat.

## Core workflow

Use four views, following Cornell's Build → Review → Share → Settings flow. Keep the weekly timetable visible while the student builds and reviews a plan. Show the selected term, active schedule name, save state, course count, and credit total near the timetable.

### 1. Build

- Let students search by course number or name. Tsinghua-specific filters may include department and instructor. Search results should show enough context to distinguish sections: course number, name, section number, credits, instructor, meeting pattern, and seat figures when available.
- Group sections under a course. A selectable Tsinghua offering is identified by `(term, course_number, section_number)`; the current archive has one row per such offering. Selecting a different section of the same course replaces its active section in that schedule. Do not assume Cornell's separate lecture and discussion structure applies to Tsinghua rows.
- Add the selected section to the timetable immediately. Keep other sections visible as alternatives. Let students hide a course from the grid without removing it from the plan, remove it, and assign it a distinct color. Explain these actions through labels or tooltips rather than color or icons alone.
- Show each meeting on a Monday–Sunday grid at its day and class periods. A section may contain several meetings and different teaching-week rules. Put sections without a usable day/period in a clearly labeled **Time not specified** list instead of guessing a slot.
- Let students add a personal event with a title, optional location, color, days, periods or times, and a teaching-week or date range. Include personal events in conflict detection.
- Support multiple named schedules within a term so students can compare alternatives. Save edits automatically and show when saving has completed. Keep term plans separate.

### 2. Review

- Show the selected courses and sections with course number, section number, instructor, credits, meeting pattern, and the source's capacity and available-seat figures. Count a course's credits once, even if it has several meetings.
- List every time conflict in plain language and make the affected items easy to find on the grid. Two meetings conflict only when their **teaching weeks, weekday, and periods or actual times overlap**. For example, a first-eight-weeks class and a last-eight-weeks class at the same period do not conflict.
- Distinguish a time conflict from a tight transition between locations. Do not infer travel feasibility without reliable location and transit data.
- Show the source and retrieval date or time, to the precision available, for seat figures. Display undergraduate and graduate figures separately when both exist. A displayed zero means zero in the archived source; a blank or missing value means unknown. Do not claim that archived availability is live.
- Keep unknown or unparsed meeting patterns visible in Review and identify that conflict checking is incomplete for them.

### 3. Share and export

- Share a schedule as a link that carries the schedule itself: the term, schedule name, and each class's course number, section, color, and hidden state, encoded in the URL fragment (`#share=v1.…`). No server stores it, and the fragment never reaches the Worker. The link is a snapshot; later edits are not sent, and there is nothing to disable.
- Share links include classes only. Personal events can hold private text and are never shared; say so on the Share tab and in the shared view, and count the events that will be left out.
- Opening a link shows a preview of the shared classes. Nothing is saved until the recipient chooses **Save as new schedule**, which adds a new schedule in the link's term and never replaces an existing one. Classes no longer in the archive are listed as such, not dropped. A broken link, or one for a term not in the archive, says so instead of showing an empty schedule.
- Offer calendar export, following Cornell's iCal download, only for terms whose academic calendar (校历) is entered in `src/lib/calendar.ts`: the Monday of teaching week 1, the number of teaching weeks, the no-class days, and whether make-up days (调休) are published. Class periods map to the official times in Beijing time (UTC+8): 1 = 08:00–09:35, 2 = 09:50–12:15, 3 = 13:30–15:05, 4 = 15:20–16:55, 5 = 17:05–18:40, 6 = 19:20–21:45.
- The `.ics` file has one event per class meeting on its real date, with `TZID=Asia/Shanghai`. Leave out occurrences on no-class days and say which days those are; while make-up days are unpublished, say so rather than guessing them. Never add rooms. List what is left out: hidden items, sections without a usable time, meetings whose teaching weeks are not understood, and classes no longer in the archive. Personal events are included, with their location.
- For a term without a calendar entry, say that calendar export is unavailable until its 校历 is added. There is no plain-text export.
- Import from Tsinghua enrollment or favorites only if an authorized integration actually exists. Do not imply that selecting a section here changes the university's enrollment system.

### 4. Settings

- Rename and delete a saved schedule; make deletion recoverable or require a clear confirmation. Allow a global color palette and per-course colors.
- Let students show weekends when relevant. A course or personal event on Saturday or Sunday must remain discoverable even if weekend columns are hidden.
- Retain a student's schedules in the browser until a supported account-backed sync service exists. Make the storage scope clear in the interface, especially before sharing or changing devices.

## Calendar and data rules

The current archive's `class_time` values use Tsinghua day, period, and teaching-week notation, for example `4-6(全周)` and comma-separated meetings. Parse the original text into structured meetings, preserve it for display, and handle `前八周`, `后八周`, numbered week ranges, odd/even weeks, and listed weeks. Treat an unrecognized expression as unknown rather than silently scheduling it every week.

Use a **teaching-week selector** when the term's calendar dates are unavailable. Once an authoritative academic calendar is mapped to the term, allow Cornell-style date or week navigation and mark meetings that do not occur in the selected week. Show clock times and room locations only when supported by source data or an authoritative period-time/location mapping. Changes in source course data should not silently replace a student's selected section; flag changed or missing offerings for review.

## Acceptance examples

1. Searching `00450321` finds 趣味微生物学实验 and its sections `91`, `92`, and `93`; adding one section puts every parsed meeting on the grid.
2. Switching from section `91` to `92` updates the grid and keeps the course count and credits from being doubled.
3. Two sections at the same weekday and period conflict if they share a teaching week; disjoint teaching-week ranges do not.
4. A section with `(全周)` but no day/period appears in **Time not specified**, with its raw meeting text and an incomplete-conflict-check notice.
5. Hiding a course removes its blocks from the grid without removing its selection or changing the Review total.
6. Reloading the page restores the named schedules for the current browser. A schedule for one term never appears as a selection in another term.
7. Export never invents dates, clock times, rooms, or current seat availability from missing data.
   For spring 2026–2027, a Tuesday period-1 class meeting every week starts 2027-02-23 08:00–09:35 Beijing time, and a Monday class has no event on 2027-04-05 (清明节).
8. A share link opened in another browser shows the same classes and sections, includes no personal events, and changes nothing until the recipient saves it as a new schedule.

## Observed Cornell reference

The Cornell page provided course search; imports from enrollment, planner, and favorites; section choices; color-coded weekly blocks; multiple schedules; custom recurring events; date navigation; a TBA area; course and credit totals; explicit overlap warnings; a review list with class numbers and open/closed status; optional sharing; iCal download; and naming, weekend, and palette settings. These observations guide the interaction design, while the Tsinghua data and university calendar determine what can be shown accurately.
