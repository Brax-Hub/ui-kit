/* Dates for the calendar parts (parts/calendar.tsx, parts/date-picker.tsx), and for an app that drives them. A date
   is a string, "2026-11-26", as a date field and a database's date column give it; a month is "2026-11". Nothing here
   knows a time or a time zone: the arithmetic runs on the calendar alone (in UTC, so no daylight-saving hour can move
   a day), and only todayIso() asks the device what day it is. Strings of this shape sort as dates, so `a < b` is
   "a is before b". No dependency; test/dates.test.mjs holds the cases. */

export type IsoDate = string;
export type IsoMonth = string;
/** The first day of the week: 0 is Sunday, 1 Monday … 6 Saturday. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DAY = 86_400_000;
const pad = (n: number, width = 2) => String(n).padStart(width, "0");

function utc(year: number, month: number, day: number): Date {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day); // all three at once; Date.UTC would read a year under 100 as 19xx
  return date;
}
const fromDate = (date: Date): IsoDate => `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

/** The parts of a date, or null when the text is not a real date written YYYY-MM-DD (2026-02-30 is not one). */
export function dateParts(text: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(`${m[1]}-${m[2]}`)) return null;
  return { year, month, day };
}
export const isIsoDate = (text: string): boolean => dateParts(text) !== null;

function toDate(date: IsoDate): Date {
  const p = dateParts(date);
  if (!p) throw new RangeError(`not a date: "${date}"`);
  return utc(p.year, p.month, p.day);
}

/** A date from its parts; a day or month past its range runs on into the next (month 13 is January). */
export const isoDate = (year: number, month: number, day: number): IsoDate => fromDate(utc(year, month, day));

/** Today on this device, in its own time zone. */
export function todayIso(now: Date = new Date()): IsoDate {
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const monthOf = (date: IsoDate): IsoMonth => date.slice(0, 7);

export function daysInMonth(month: IsoMonth): number {
  const [year, m] = month.split("-").map(Number);
  return utc(year!, m! + 1, 0).getUTCDate();
}

/** The month `by` months later (earlier when negative). */
export function shiftMonth(month: IsoMonth, by: number): IsoMonth {
  const [year, m] = month.split("-").map(Number);
  return fromDate(utc(year!, m! + by, 1)).slice(0, 7);
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return fromDate(new Date(toDate(date).getTime() + days * DAY));
}

/** The same day `months` later; a day the new month lacks becomes its last (31 January + 1 month is 28 February). */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const month = shiftMonth(monthOf(date), months);
  return `${month}-${pad(Math.min(Number(date.slice(8)), daysInMonth(month)))}`;
}

/** 0 Sunday … 6 Saturday. */
export const weekdayOf = (date: IsoDate): Weekday => toDate(date).getUTCDay() as Weekday;

export function startOfWeek(date: IsoDate, weekStartsOn: Weekday = 1): IsoDate {
  return addDays(date, -((weekdayOf(date) - weekStartsOn + 7) % 7));
}
export const endOfWeek = (date: IsoDate, weekStartsOn: Weekday = 1): IsoDate => addDays(startOfWeek(date, weekStartsOn), 6);

/** The whole weeks that hold a month: four to six rows of seven days, the first and last filled from the
    neighbouring months. */
export function monthWeeks(month: IsoMonth, weekStartsOn: Weekday = 1): IsoDate[][] {
  const last = `${month}-${pad(daysInMonth(month))}`;
  const weeks: IsoDate[][] = [];
  for (let day = startOfWeek(`${month}-01`, weekStartsOn); day <= last; day = addDays(day, 7)) {
    weeks.push(Array.from({ length: 7 }, (_, i) => addDays(day, i)));
  }
  return weeks;
}

/** The ISO 8601 week number: weeks start on Monday and week 1 holds the year's first Thursday. */
export function isoWeek(date: IsoDate): number {
  const thursday = addDays(startOfWeek(date, 1), 3);
  const first = `${thursday.slice(0, 4)}-01-01`;
  return 1 + Math.floor((toDate(thursday).getTime() - toDate(first).getTime()) / (7 * DAY));
}

/** The date kept inside `min` and `max`, where given. */
export function clampDate(date: IsoDate, min?: IsoDate, max?: IsoDate): IsoDate {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

/** Where a key moves the day in a calendar grid, as the ARIA date-grid pattern has it: the arrows by a day and by a
    week, Home and End to the ends of the week, Page Up and Page Down by a month, and by a year with Shift. Null for
    any other key. */
export function moveDay(date: IsoDate, key: string, { shift = false, weekStartsOn = 1 as Weekday } = {}): IsoDate | null {
  switch (key) {
    case "ArrowLeft": return addDays(date, -1);
    case "ArrowRight": return addDays(date, 1);
    case "ArrowUp": return addDays(date, -7);
    case "ArrowDown": return addDays(date, 7);
    case "Home": return startOfWeek(date, weekStartsOn);
    case "End": return endOfWeek(date, weekStartsOn);
    case "PageUp": return addMonths(date, shift ? -12 : -1);
    case "PageDown": return addMonths(date, shift ? 12 : 1);
    default: return null;
  }
}

/** A date as a person types it into a field: 2026-11-26, and the same with slashes, dots, spaces or nothing between
    the parts, with or without the leading zeros (2026/1/5, 20261126). Year first only, because 05/01 is two different
    days to two readers. Null when it is not a real date. */
export function readDate(text: string): IsoDate | null {
  const t = text.trim();
  const m = /^(\d{4})[-/. ](\d{1,2})[-/. ](\d{1,2})$/.exec(t) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(t);
  if (!m) return null;
  const date = `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  return isIsoDate(date) ? date : null;
}
