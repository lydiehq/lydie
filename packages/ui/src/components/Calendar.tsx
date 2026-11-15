import type { CalendarDate } from "@internationalized/date";
import { useMemo, useState } from "react";
import {
  Calendar as AriaCalendar,
  CalendarCell,
  CalendarGrid,
  CalendarGridBody,
  CalendarGridHeader,
  CalendarHeaderCell,
  Heading,
  RangeCalendar as AriaRangeCalendar,
} from "react-aria-components";
import { twMerge } from "tailwind-merge";
import { tv } from "tailwind-variants";

import { LeftRegular, RightRegular } from "../icons/mingcute";
import { Button } from "./Button";
import { dayOf, todayDate } from "./iso-dates";

// Month calendars after Notion's: the month on the left, arrows on the right, short weekday names,
// days as soft squares. The selected day is a solid blue square; a range lies on a pale blue band
// between its two ends. Today has a dot under its number.

// The day itself (the whole cell of a single calendar, the inner square of a range's).
const dayStyles = tv({
  base: "relative flex h-8 w-9 items-center justify-center rounded-md text-sm tabular-nums outline-solid outline-0 -outline-offset-2 outline-blue-600 transition-colors duration-100 forced-colors:outline-[Highlight]",
  variants: {
    state: {
      none: "text-gray-800 hover:bg-gray-950/5 pressed:bg-gray-950/8",
      // Inside a range: the band behind is the colour, the day only darkens on hover.
      middle: "text-blue-700 hover:bg-blue-500/12",
      selected:
        "bg-blue-600 font-medium text-white hover:bg-blue-500 forced-colors:bg-[Highlight] forced-colors:text-[HighlightText]",
    },
    isOutsideMonth: { true: "text-gray-400" },
    isDisabled: { true: "cursor-default text-gray-300 hover:bg-transparent" },
    isUnavailable: { true: "text-gray-400 line-through" },
    isFocusVisible: { true: "outline-2" },
    isToday: {
      true: "after:pointer-events-none after:absolute after:bottom-1 after:left-1/2 after:size-1 after:-translate-x-1/2 after:rounded-full after:bg-blue-600",
    },
  },
  compoundVariants: [{ state: "selected", isToday: true, className: "after:bg-white" }],
});

function Header() {
  return (
    <header className="flex items-center gap-1 pb-1 pl-2">
      <Heading className="flex-1 truncate text-sm font-medium text-gray-900" />
      <Button slot="previous" variant="ghost" size="icon-xs" aria-label="Previous month">
        <LeftRegular aria-hidden />
      </Button>
      <Button slot="next" variant="ghost" size="icon-xs" aria-label="Next month">
        <RightRegular aria-hidden />
      </Button>
    </header>
  );
}

function Grid({ range }: { range: boolean }) {
  return (
    <CalendarGrid weekdayStyle="short" className="border-collapse">
      <CalendarGridHeader>
        {(day) => (
          <CalendarHeaderCell className="h-7 pb-0.5 text-xs font-normal text-gray-500">
            {day}
          </CalendarHeaderCell>
        )}
      </CalendarGridHeader>
      <CalendarGridBody className="[&_td]:p-0">
        {(date) =>
          range ? (
            <CalendarCell
              date={date}
              // The band: the whole width of the cell, rounded where the range (or its row) ends,
              // so the days of a range read as one strip.
              className="group/cell cursor-default outline-none selected:bg-blue-500/10 selection-start:rounded-s-md selection-end:rounded-e-md [td:first-child_&]:rounded-s-md [td:last-child_&]:rounded-e-md outside-month:bg-transparent"
            >
              {({ formattedDate, isSelected, isSelectionStart, isSelectionEnd, ...rest }) => (
                <span
                  className={dayStyles({
                    ...rest,
                    state:
                      isSelectionStart || isSelectionEnd
                        ? "selected"
                        : isSelected && !rest.isOutsideMonth
                          ? "middle"
                          : "none",
                  })}
                >
                  {formattedDate}
                </span>
              )}
            </CalendarCell>
          ) : (
            <CalendarCell
              date={date}
              className={({ isSelected, ...rest }) =>
                dayStyles({ ...rest, state: isSelected ? "selected" : "none" })
              }
            />
          )
        }
      </CalendarGridBody>
    </CalendarGrid>
  );
}

// The month shown follows the value when it changes from outside (a date typed in a field beside
// the calendar); the calendar's own paging moves it otherwise.
function useShownMonth(value: CalendarDate | null) {
  const [focused, setFocused] = useState<CalendarDate>(() => value ?? todayDate());
  const [seen, setSeen] = useState(value);
  if (value?.toString() !== seen?.toString()) {
    setSeen(value);
    if (value) setFocused(value);
  }
  return [focused, setFocused] as const;
}

type CommonProps = {
  className?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
};

export type CalendarProps = CommonProps & {
  // An ISO date; a time after it is ignored.
  value: string | null;
  // "YYYY-MM-DD".
  onChange: (date: string) => void;
};

export function Calendar({ value, onChange, className, ...props }: CalendarProps) {
  const day = useMemo(() => dayOf(value), [value]);
  const [focused, setFocused] = useShownMonth(day);
  return (
    <AriaCalendar
      {...props}
      value={day}
      onChange={(date) => onChange(date.toString())}
      focusedValue={focused}
      onFocusChange={setFocused}
      className={twMerge("w-fit select-none", className)}
    >
      <Header />
      <Grid range={false} />
    </AriaCalendar>
  );
}

export type DateRange = { start: string; end: string };

export type RangeCalendarProps = CommonProps & {
  value: DateRange | null;
  onChange: (range: DateRange) => void;
};

export function RangeCalendar({ value, onChange, className, ...props }: RangeCalendarProps) {
  const start = useMemo(() => dayOf(value?.start), [value?.start]);
  const end = useMemo(() => dayOf(value?.end), [value?.end]);
  const range = useMemo(() => (start && end ? { start, end } : null), [start, end]);
  const [focused, setFocused] = useShownMonth(start);
  return (
    <AriaRangeCalendar
      {...props}
      value={range}
      onChange={(next) => onChange({ start: next.start.toString(), end: next.end.toString() })}
      focusedValue={focused}
      onFocusChange={setFocused}
      className={twMerge("w-fit select-none", className)}
    >
      <Header />
      <Grid range />
    </AriaRangeCalendar>
  );
}

// For DatePicker, whose calendar takes its value from the picker.
export function CalendarBody() {
  return (
    <AriaCalendar className="w-fit select-none">
      <Header />
      <Grid range={false} />
    </AriaCalendar>
  );
}
