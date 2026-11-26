import { CalendarDays } from "lucide-react";
import * as React from "react";
import { cn } from "../lib/cn.ts";
import { monthOf, readDate, type IsoDate, type Weekday } from "../lib/dates.ts";
import { IconButton } from "./button.tsx";
import { Calendar } from "./calendar.tsx";
import { fieldClass } from "./input.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.tsx";

/* A date field (0.3.0; Entity Hub has some forty, each a browser's own date input until now). The kit's field
   (.in, hub.css 120-125) with a small icon button at its right end that opens the small month in a popover (the
   prototype's date menus hold the same small month, calendar.css 16).

   The date is typed or picked. Typed, it is written year first, 2026-11-26, the one order nobody reads two ways; the
   field also takes slashes, dots or no separator and missing zeros, and writes it back in full when the field is
   left or Enter is pressed. What is not a date, or lies outside `min` and `max`, marks the field invalid and
   changes nothing. Picked, the popover closes and the keyboard goes back to the button.

   The value is the string a date input gives, "2026-11-26" or "" for none, so a form that had
   <Input type="date" value onChange> takes <DatePicker value onValueChange> with the same value. `name` posts it
   with a form, always in full. Keyboard: the field is a text field; Alt and the down arrow open the month from it;
   in the month, the grid's keys (calendar.tsx), Escape to close. The words of the button and the arrows are props. */
export type DatePickerProps = Omit<React.ComponentProps<"input">, "value" | "defaultValue" | "onChange" | "type" | "min" | "max"> & {
  value?: IsoDate | "";
  defaultValue?: IsoDate | "";
  onValueChange?: (value: IsoDate | "") => void;
  min?: IsoDate;
  max?: IsoDate;
  isDisabled?: (date: IsoDate) => boolean;
  today?: IsoDate;
  weekStartsOn?: Weekday;
  locale?: string;
  /** What the button that opens the month says to a screen reader, and the name of the popover. */
  calendarLabel?: string;
  previousLabel?: string;
  nextLabel?: string;
};

export function DatePicker({
  value, defaultValue = "", onValueChange, min, max, isDisabled, today, weekStartsOn, locale, calendarLabel = "Choose a date", previousLabel, nextLabel,
  name, className, disabled, placeholder = "YYYY-MM-DD", onBlur, onKeyDown, "aria-invalid": ariaInvalid, ...props
}: DatePickerProps) {
  const [own, setOwn] = React.useState<IsoDate | "">(defaultValue);
  const current = value ?? own;
  const [text, setText] = React.useState<string>(current);
  const [wrong, setWrong] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const content = React.useRef<HTMLDivElement>(null);

  // the value changed from outside (the form was reset, another field set it): show it
  React.useEffect(() => { setText(current); setWrong(false); }, [current]);

  const allowed = (date: IsoDate) => !(min !== undefined && date < min) && !(max !== undefined && date > max) && !(isDisabled?.(date) ?? false);
  function set(next: IsoDate | "") {
    setOwn(next);
    setText(next);
    setWrong(false);
    if (next !== current) onValueChange?.(next);
  }
  function commit() {
    const typed = text.trim();
    if (typed === "") return set("");
    const date = readDate(typed);
    if (date && allowed(date)) set(date); else setWrong(true);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn("relative flex w-full", className)}>
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          aria-invalid={wrong || ariaInvalid === true || ariaInvalid === "true" ? true : undefined}
          onChange={(event) => { setText(event.target.value); setWrong(false); }}
          onBlur={(event) => { commit(); onBlur?.(event); }}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "ArrowDown" && event.altKey) { event.preventDefault(); setOpen(true); }
            onKeyDown?.(event);
          }}
          className={cn(fieldClass, "pr-control font-mono tabular-nums")}
          {...props}
        />
        {name ? <input type="hidden" name={name} value={current} /> : null}
        <PopoverTrigger asChild>
          <IconButton size="sm" aria-label={calendarLabel} disabled={disabled} className="absolute top-1 right-1"><CalendarDays aria-hidden /></IconButton>
        </PopoverTrigger>
      </div>
      <PopoverContent
        ref={content}
        align="end"
        aria-label={calendarLabel}
        className="w-auto p-3"
        onOpenAutoFocus={(event) => { event.preventDefault(); content.current?.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus(); }}
      >
        <Calendar
          size="mini"
          selected={current || null}
          defaultMonth={current ? monthOf(current) : undefined}
          onSelect={(date) => { set(date); setOpen(false); }}
          min={min}
          max={max}
          isDisabled={isDisabled}
          today={today}
          weekStartsOn={weekStartsOn}
          locale={locale}
          previousLabel={previousLabel}
          nextLabel={nextLabel}
        />
      </PopoverContent>
    </Popover>
  );
}
