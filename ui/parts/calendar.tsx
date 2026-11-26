import { ChevronLeft, ChevronRight } from "lucide-react";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "../lib/cn.ts";
import { clampDate, isoWeek, monthOf, monthWeeks, moveDay, shiftMonth, todayIso, weekdayOf, type IsoDate, type IsoMonth, type Weekday } from "../lib/dates.ts";
import { Button, IconButton } from "./button.tsx";
import { capClass } from "./label.tsx";

/* A month of days (0.3.0; for Entity Hub's filings calendar and its date fields, and for the Calendar module of
   TASKS FE10). Two sizes, both the prototype's:

   - `mini`, the small month of the calendar's rail and of its date menus (.mm, calendar.css 16-28): a row of weekday
     names 24px tall, days 30px tall in the mono face at 12px, the wash on hover; a day of a neighbouring month in
     ink-4, the day chosen with a 1px accent frame, today filled with the accent, a dot under a day that holds
     something. It is what the date picker opens.
   - `month`, the month view (.mv, calendar.css 101-125): a hairline grid, each cell with the day's number at its top
     left (26px, mono 12px; today filled with the accent) and under it whatever the app puts there (`renderDay`:
     DayItem lines and a DayMore); days of a neighbouring month and weekends on bg-2.

   CalendarGrid is the grid alone; Calendar puts the month's name and the two arrows over it. A date is a string,
   "2026-11-26", and a month "2026-11" (lib/dates.ts). The grid holds the month it shows unless the app does
   (`month` with `onMonthChange`); the day chosen is always the app's (`selected`, `onSelect`).

   Keyboard, as the ARIA date-grid pattern: one day of the grid is in the tab order; the arrows move by a day and by
   a week, Home and End to the ends of the week, Page Up and Page Down by a month and with Shift by a year, each
   turning the month when it leaves it; Enter or Space chooses the day. It is a table with role="grid", the weekday
   names as column headers, each day a button named in full ("Thursday 26 November 2026"), the day chosen
   aria-selected, today aria-current="date".

   Month and weekday names come from the browser (Intl) for `locale`; unless the app names another it is "en-GB",
   which writes a day as the kit's pages do, "26 November 2026". The part holds no word of its own except the
   arrows' labels and the heading of the week numbers, which are props. */

export type DayState = {
  date: IsoDate;
  /** The day of the month, 1 to 31. */
  day: number;
  selected: boolean;
  today: boolean;
  /** A day of the month before or after the one shown. */
  outside: boolean;
  disabled: boolean;
  weekend: boolean;
};

export type CalendarGridProps = Omit<React.ComponentProps<"table">, "onSelect"> & {
  /** The month shown, "2026-11". With it the app holds the month and `onMonthChange` asks for another. */
  month?: IsoMonth;
  /** The month shown first when the grid holds it: otherwise the month of `selected`, or of today. */
  defaultMonth?: IsoMonth;
  onMonthChange?: (month: IsoMonth) => void;
  /** The day chosen. */
  selected?: IsoDate | null;
  onSelect?: (date: IsoDate) => void;
  /** Today. Left out, the device's own day, marked once the page is in the browser. */
  today?: IsoDate;
  size?: "mini" | "month";
  /** 0 Sunday, 1 Monday (the default) … 6 Saturday. */
  weekStartsOn?: Weekday;
  locale?: string;
  min?: IsoDate;
  max?: IsoDate;
  /** A day that cannot be chosen, besides those before `min` and after `max`. */
  isDisabled?: (date: IsoDate) => boolean;
  /** Show the days of the neighbouring months that fill the first and last week (the default), or leave them empty. */
  outsideDays?: boolean;
  /** A first column with the ISO week number of each row; `weekLabel` is its heading. */
  weekNumbers?: boolean;
  weekLabel?: string;
  /** `mini`: a day that holds something gets a dot under its number. */
  isMarked?: (date: IsoDate) => boolean;
  /** `month`: what the cell shows under the day's number. */
  renderDay?: (day: DayState) => React.ReactNode;
  /** Put the keyboard on the grid's day when it appears (the date picker does). */
  autoFocus?: boolean;
};

const utcNoon = (date: IsoDate) => new Date(`${date}T12:00:00Z`);

function useNames(locale: string, weekStartsOn: Weekday) {
  return React.useMemo(() => {
    const short = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
    const long = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" });
    const full = new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    const title = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
    // 4 January 1970 was a Sunday
    const weekdays = Array.from({ length: 7 }, (_, i) => { const d = new Date(Date.UTC(1970, 0, 4 + ((weekStartsOn + i) % 7))); return { short: short.format(d), long: long.format(d) }; });
    return { weekdays, day: (date: IsoDate) => full.format(utcNoon(date)), month: (month: IsoMonth) => title.format(utcNoon(`${month}-01`)) };
  }, [locale, weekStartsOn]);
}

/* The device's day is not known where the page is first drawn (a server), so it is read after the page is in the
   browser; a `today` the app gives is used as it is. */
function useToday(given?: IsoDate): IsoDate | undefined {
  const [own, setOwn] = React.useState<IsoDate | undefined>(undefined);
  React.useEffect(() => { if (!given) setOwn(todayIso()); }, [given]);
  return given ?? own;
}

function useMonth(month: IsoMonth | undefined, defaultMonth: IsoMonth | undefined, selected: IsoDate | null | undefined, today: IsoDate | undefined, onMonthChange?: (month: IsoMonth) => void) {
  const [own, setOwn] = React.useState<IsoMonth>(() => defaultMonth ?? monthOf(selected || today || todayIso()));
  const shown = month ?? own;
  const show = React.useCallback((next: IsoMonth) => { setOwn(next); if (next !== shown) onMonthChange?.(next); }, [shown, onMonthChange]);
  return [shown, show] as const;
}

export function CalendarGrid({
  month, defaultMonth, onMonthChange, selected, onSelect, today: givenToday, size = "mini", weekStartsOn = 1, locale = "en-GB", min, max, isDisabled,
  outsideDays = true, weekNumbers = false, weekLabel = "Wk", isMarked, renderDay, autoFocus = false, className, ...props
}: CalendarGridProps) {
  const today = useToday(givenToday);
  const [shown, show] = useMonth(month, defaultMonth, selected, givenToday, onMonthChange);
  const names = useNames(locale, weekStartsOn);
  const weeks = React.useMemo(() => monthWeeks(shown, weekStartsOn), [shown, weekStartsOn]);
  const table = React.useRef<HTMLTableElement>(null);
  const wantsFocus = React.useRef(autoFocus);

  // The one day in the tab order: the day the keyboard was last on while it is on the grid, else the day chosen,
  // else today, else the first of the month.
  const [keyDay, setKeyDay] = React.useState<IsoDate | null>(null);
  const inMonth = (date: IsoDate | null | undefined): date is IsoDate => !!date && monthOf(date) === shown;
  const active = inMonth(keyDay) ? keyDay : inMonth(selected) ? selected : inMonth(today) ? today : `${shown}-01`;

  React.useEffect(() => {
    if (!wantsFocus.current) return;
    wantsFocus.current = false;
    table.current?.querySelector<HTMLElement>(`[data-day="${active}"]`)?.focus();
  }, [active, shown]);

  const off = (date: IsoDate) => (min !== undefined && date < min) || (max !== undefined && date > max) || (isDisabled?.(date) ?? false);

  function go(date: IsoDate) {
    const next = clampDate(date, min, max);
    wantsFocus.current = true;
    setKeyDay(next);
    if (monthOf(next) !== shown) show(monthOf(next));
  }
  function onKeyDown(event: React.KeyboardEvent, date: IsoDate) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = moveDay(date, event.key, { shift: event.shiftKey, weekStartsOn });
    if (!next) return;
    event.preventDefault();
    go(next);
  }
  function choose(date: IsoDate) {
    if (off(date)) return;
    go(date);
    onSelect?.(date);
  }

  const mini = size === "mini";
  return (
    <table
      ref={table}
      role="grid"
      aria-label={props["aria-labelledby"] ? undefined : names.month(shown)}
      data-size={size}
      data-month={shown}
      className={cn("w-full table-fixed border-collapse", className)}
      {...props}
    >
      <thead>
        <tr className={mini ? undefined : "border-b border-line"}>
          {weekNumbers ? <th scope="col" className={cn("w-week-number font-regular", mini ? "h-day-head text-small text-ink-3" : cn(capClass, "px-1 py-2"))}>{weekLabel}</th> : null}
          {names.weekdays.map((d, i) => (
            <th key={d.long} scope="col" abbr={d.long} className={mini ? "h-day-head text-center text-small font-regular text-ink-3" : cn(capClass, "px-2.5 py-2 text-left font-regular", (i > 0 || weekNumbers) && "border-l border-line")}>
              {d.short}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {weeks.map((week) => (
          <tr key={week[0]} className={mini ? undefined : "border-b border-line last:border-b-0"}>
            {weekNumbers ? <th scope="row" className={cn("font-mono text-small font-regular text-ink-3", mini ? "h-day" : "pt-2 align-top")}>{isoWeek(week[3]!)}</th> : null}
            {week.map((date, i) => {
              const outside = monthOf(date) !== shown;
              const weekday = weekdayOf(date);
              const state: DayState = { date, day: Number(date.slice(8)), selected: date === selected, today: date === today, outside, disabled: off(date), weekend: weekday === 0 || weekday === 6 };
              const edge = (i > 0 || weekNumbers) && !mini ? "border-l border-line" : undefined;
              if (outside && !outsideDays) return <td key={date} role="gridcell" className={cn(edge, !mini && "bg-bg-2")} />;
              const day = (
                <button
                  type="button"
                  data-day={date}
                  tabIndex={date === active ? 0 : -1}
                  aria-label={names.day(date)}
                  aria-current={state.today ? "date" : undefined}
                  aria-disabled={state.disabled || undefined}
                  onClick={() => choose(date)}
                  onKeyDown={(event) => onKeyDown(event, date)}
                  onFocus={() => setKeyDay(date)}
                  className={cn(
                    "relative cursor-pointer items-center justify-center rounded-control border border-transparent font-mono text-small tabular-nums text-ink-1 transition-colors hover:bg-wash focus-visible:shadow-glow " +
                      "aria-disabled:cursor-default aria-disabled:opacity-(--disabled-opacity) aria-disabled:hover:bg-transparent",
                    mini ? "flex h-day w-full" : "mx-1.5 mb-0.5 inline-flex h-day-number min-w-day-number self-start px-1.25",
                    outside && (mini ? "text-ink-4" : "text-ink-3"),
                    state.today && "bg-accent text-on-accent hover:bg-accent-hover aria-disabled:hover:bg-accent",
                    mini && state.selected && "border-accent",
                    mini && state.selected && state.today && "outline outline-offset-1 outline-accent",
                  )}
                >
                  {state.day}
                  {mini && isMarked?.(date) ? <i aria-hidden className="absolute bottom-0.5 size-1 rounded-pill bg-current" /> : null}
                </button>
              );
              return (
                <td key={date} role="gridcell" aria-selected={state.selected ? true : undefined} data-outside={outside || undefined} className={cn("p-0", mini ? "text-center" : "align-top", edge, !mini && (outside || state.weekend) && "bg-bg-2")}>
                  {mini ? day : (
                    <div className={cn("flex min-h-24 min-w-0 flex-col gap-0.5 overflow-hidden border border-transparent pt-1 pb-0.5", state.selected && "border-accent")}>
                      {day}
                      {renderDay?.(state)}
                    </div>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* One line of what falls on a day in the month view (.mv-i, calendar.css 114-115, 121): 22px, mono 12px, cut off
   with an ellipsis, the wash on hover, an 8px dot in the tone of its state. `asChild` hands the look to a link. */
const itemDots = { neutral: "bg-ink-4", ok: "bg-ok", warn: "bg-warn", risk: "bg-risk", info: "bg-info", verified: "bg-verified", accent: "bg-accent" } as const;
const itemAliases: Record<string, keyof typeof itemDots> = { success: "ok", warning: "warn", danger: "risk" };

export function DayItem({ className, tone, asChild = false, type, children, ...props }: React.ComponentProps<"button"> & { tone?: keyof typeof itemDots | "success" | "warning" | "danger"; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "button";
  const t = tone ? (itemAliases[tone] ?? (tone as keyof typeof itemDots)) : undefined;
  return (
    <Comp
      type={asChild ? undefined : (type ?? "button")}
      data-tone={t}
      className={cn("mx-1 block h-day-item shrink-0 cursor-pointer truncate px-1.5 text-left font-mono text-small leading-(--day-item) text-ink-1 transition-colors hover:bg-wash focus-visible:shadow-glow", className)}
      {...props}
    >
      {t ? <i aria-hidden className={cn("mr-1.5 inline-block size-dot rounded-pill", itemDots[t])} /> : null}
      <Slot.Slottable>{children}</Slot.Slottable>
    </Comp>
  );
}

/* The line under a day's items that says how many more there are (.mv-more, calendar.css 124-125). */
export function DayMore({ className, type, ...props }: React.ComponentProps<"button">) {
  return <button type={type ?? "button"} className={cn("mx-1 h-day-item shrink-0 cursor-pointer px-1.5 text-left font-mono text-small text-ink-2 transition-colors hover:bg-wash hover:text-ink-1 focus-visible:shadow-glow", className)} {...props} />;
}

export type CalendarProps = Omit<CalendarGridProps, "aria-labelledby"> & {
  /** What the two arrows say to a screen reader. */
  previousLabel?: string;
  nextLabel?: string;
  /** With it, a button that turns back to today's month; its words ("Today"). */
  todayLabel?: string;
  /** Controls beside the arrows: a switch between views, a button that adds something. */
  actions?: React.ReactNode;
  gridClassName?: string;
};

/* The month's name and the arrows over the grid. `mini`: the small month's top row (.mm-top, calendar.css 17), the
   name as a row title (.title-r, hub.css 197) and two small icon buttons. `month`: the calendar's bar, the name at
   20px in the display face (.cal-title, calendar.css 32). The name is announced when the month turns. */
export function Calendar({
  previousLabel = "Previous month", nextLabel = "Next month", todayLabel, actions, className, gridClassName, month, defaultMonth, onMonthChange, selected, today, size = "mini", locale = "en-GB", weekStartsOn = 1, ...grid
}: CalendarProps) {
  const [shown, show] = useMonth(month, defaultMonth, selected, today, onMonthChange);
  const names = useNames(locale, weekStartsOn);
  const now = useToday(today);
  const titleId = React.useId();
  const mini = size === "mini";
  const Title = mini ? "div" : "h2";
  return (
    <div data-size={size} className={cn("flex flex-col", mini ? "w-60 gap-1" : "w-full", className)}>
      <div className={cn("flex items-center", mini ? "gap-0.5 pl-2" : "gap-2 border-b border-line px-4 py-3")}>
        <Title id={titleId} aria-live="polite" className={cn("min-w-0 flex-1 truncate font-display font-strong", mini ? "text-title tracking-row-title" : "text-h2-small tracking-title")}>{names.month(shown)}</Title>
        {actions}
        {todayLabel ? <Button size="sm" disabled={!now} onClick={() => now && show(monthOf(now))}>{todayLabel}</Button> : null}
        <IconButton size="sm" aria-label={previousLabel} onClick={() => show(shiftMonth(shown, -1))}><ChevronLeft aria-hidden /></IconButton>
        <IconButton size="sm" aria-label={nextLabel} onClick={() => show(shiftMonth(shown, 1))}><ChevronRight aria-hidden /></IconButton>
      </div>
      <CalendarGrid {...grid} aria-labelledby={titleId} month={shown} onMonthChange={show} selected={selected} today={today} size={size} locale={locale} weekStartsOn={weekStartsOn} className={gridClassName} />
    </div>
  );
}
