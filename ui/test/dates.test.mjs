/* The date arithmetic under the calendar grid and the date picker (lib/dates.ts; TASKS FE04): the weeks of a month
   for any first day of the week, where each key moves the day, the week number, and what a typed date is read as.
   Node runs the TypeScript file as it is (type stripping, Node 22.18 and later, the kit's `engines`). */
import assert from "node:assert/strict";
import { test } from "node:test";
import { addDays, addMonths, clampDate, dateParts, daysInMonth, endOfWeek, isIsoDate, isoDate, isoWeek, monthOf, monthWeeks, moveDay, readDate, shiftMonth, startOfWeek, todayIso, weekdayOf } from "../lib/dates.ts";

test("a date is real or it is not", () => {
  assert.deepEqual(dateParts("2026-11-26"), { year: 2026, month: 11, day: 26 });
  for (const ok of ["2024-02-29", "2000-02-29", "2026-12-31", "0001-01-01"]) assert.ok(isIsoDate(ok), ok);
  for (const no of ["2026-02-29", "1900-02-29", "2026-13-01", "2026-00-10", "2026-11-31", "2026-1-5", "26-11-2026", "", "2026-11-26T00:00"]) assert.ok(!isIsoDate(no), no);
});

test("days and months add over the ends of months and years, and through a leap day", () => {
  assert.equal(addDays("2026-11-30", 1), "2026-12-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2026-02-28", 1), "2026-03-01");
  assert.equal(addDays("2026-03-08", 1), "2026-03-09", "the day the clocks change is a day like another");
  assert.equal(addDays("2026-11-26", 365), "2027-11-26");
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2024-01-31", 1), "2024-02-29");
  assert.equal(addMonths("2026-11-26", 2), "2027-01-26");
  assert.equal(addMonths("2024-02-29", 12), "2025-02-28");
  assert.equal(addMonths("2026-03-31", -1), "2026-02-28");
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  assert.equal(shiftMonth("2026-11", -23), "2024-12");
  assert.equal(daysInMonth("2026-02"), 28);
  assert.equal(daysInMonth("2024-02"), 29);
  assert.equal(daysInMonth("2026-11"), 30);
  assert.equal(daysInMonth("2026-12"), 31);
  assert.equal(isoDate(2026, 13, 1), "2027-01-01");
  assert.equal(isoDate(2026, 11, 26), "2026-11-26");
  assert.equal(monthOf("2026-11-26"), "2026-11");
});

test("the weekday and the ends of a week, for a week that starts on Monday or on Sunday", () => {
  assert.equal(weekdayOf("2026-11-26"), 4, "26 November 2026 is a Thursday");
  assert.equal(weekdayOf("2026-11-01"), 0, "1 November 2026 is a Sunday");
  assert.equal(startOfWeek("2026-11-26", 1), "2026-11-23");
  assert.equal(endOfWeek("2026-11-26", 1), "2026-11-29");
  assert.equal(startOfWeek("2026-11-26", 0), "2026-11-22");
  assert.equal(endOfWeek("2026-11-26", 0), "2026-11-28");
  assert.equal(startOfWeek("2026-11-23", 1), "2026-11-23", "a Monday starts its own week");
  assert.equal(startOfWeek("2026-11-01", 1), "2026-10-26", "a Sunday ends a week that starts on Monday");
});

test("the weeks of a month are whole, hold the month, and start on the day asked", () => {
  const november = monthWeeks("2026-11", 1);
  assert.equal(november.length, 6, "November 2026 from Monday: 26 October to 6 December");
  assert.equal(november[0][0], "2026-10-26");
  assert.equal(november[5][6], "2026-12-06");
  assert.equal(monthWeeks("2026-11", 0).length, 5, "from Sunday: 1 November to 5 December");
  assert.equal(monthWeeks("2026-11", 0)[0][0], "2026-11-01");
  assert.equal(monthWeeks("2026-02", 0).length, 4, "February 2026 from Sunday is exactly four weeks");
  assert.equal(monthWeeks("2027-02", 1).length, 4, "February 2027 from Monday is exactly four weeks");
  for (const month of ["2024-02", "2026-02", "2026-11", "2026-12", "2027-01", "2027-08"]) {
    for (const first of [0, 1, 6]) {
      const weeks = monthWeeks(month, first);
      const days = weeks.flat();
      assert.ok(weeks.every((w) => w.length === 7), `${month} from ${first}: a week is not seven days`);
      assert.equal(new Set(days).size, days.length);
      assert.equal(days.filter((d) => monthOf(d) === month).length, daysInMonth(month), `${month} from ${first}: a day of the month is missing`);
      assert.ok(weeks.every((w) => weekdayOf(w[0]) === first), `${month} from ${first}: a week starts on another day`);
      assert.ok(monthOf(weeks[0][6]) === month && monthOf(weeks.at(-1)[0]) === month, `${month} from ${first}: a week holds no day of the month`);
      assert.deepEqual(days, [...days].sort(), "the days are in order");
    }
  }
});

test("the ISO week number", () => {
  assert.equal(isoWeek("2026-11-26"), 48);
  assert.equal(isoWeek("2026-01-01"), 1);
  assert.equal(isoWeek("2027-01-01"), 53, "1 January 2027 is a Friday of the last week of 2026");
  assert.equal(isoWeek("2026-12-28"), 53);
  assert.equal(isoWeek("2024-12-30"), 1, "30 December 2024 is the Monday of week 1 of 2025");
  assert.equal(isoWeek("2021-01-03"), 53);
});

test("where each key moves the day", () => {
  const from = "2026-11-26";
  assert.equal(moveDay(from, "ArrowLeft"), "2026-11-25");
  assert.equal(moveDay(from, "ArrowRight"), "2026-11-27");
  assert.equal(moveDay(from, "ArrowUp"), "2026-11-19");
  assert.equal(moveDay(from, "ArrowDown"), "2026-12-03", "a week down leaves November");
  assert.equal(moveDay(from, "Home"), "2026-11-23");
  assert.equal(moveDay(from, "End"), "2026-11-29");
  assert.equal(moveDay(from, "Home", { weekStartsOn: 0 }), "2026-11-22");
  assert.equal(moveDay(from, "End", { weekStartsOn: 0 }), "2026-11-28");
  assert.equal(moveDay(from, "PageUp"), "2026-10-26");
  assert.equal(moveDay(from, "PageDown"), "2026-12-26");
  assert.equal(moveDay(from, "PageUp", { shift: true }), "2025-11-26");
  assert.equal(moveDay(from, "PageDown", { shift: true }), "2027-11-26");
  assert.equal(moveDay("2026-01-31", "PageDown"), "2026-02-28", "a month on from the 31st is the month's last day");
  assert.equal(moveDay("2026-11-30", "ArrowRight"), "2026-12-01");
  assert.equal(moveDay("2026-11-01", "ArrowLeft"), "2026-10-31");
  for (const other of ["Enter", " ", "Tab", "Escape", "a"]) assert.equal(moveDay(from, other), null, `"${other}" moves nothing`);
});

test("a date stays inside its limits", () => {
  assert.equal(clampDate("2026-11-26", "2026-12-01", undefined), "2026-12-01");
  assert.equal(clampDate("2026-11-26", undefined, "2026-11-20"), "2026-11-20");
  assert.equal(clampDate("2026-11-26", "2026-01-01", "2026-12-31"), "2026-11-26");
  assert.equal(clampDate("2026-11-26"), "2026-11-26");
});

test("a typed date is read year first, and nothing else is guessed", () => {
  for (const [typed, date] of [["2026-11-26", "2026-11-26"], [" 2026-11-26 ", "2026-11-26"], ["2026/11/26", "2026-11-26"], ["2026.11.26", "2026-11-26"], ["2026 11 26", "2026-11-26"], ["20261126", "2026-11-26"], ["2026-1-5", "2026-01-05"], ["2026/1/05", "2026-01-05"], ["2024-02-29", "2024-02-29"]]) {
    assert.equal(readDate(typed), date, typed);
  }
  for (const typed of ["26/11/2026", "11/26/2026", "26 November 2026", "2026-02-30", "2026-13-01", "2026-11", "tomorrow", "", "2026115", "2026-11-26x"]) {
    assert.equal(readDate(typed), null, typed);
  }
});

test("today is the device's own day", () => {
  assert.equal(todayIso(new Date(2026, 10, 26, 23, 59)), "2026-11-26");
  assert.equal(todayIso(new Date(2026, 0, 1, 0, 0)), "2026-01-01");
  assert.ok(isIsoDate(todayIso()));
});
