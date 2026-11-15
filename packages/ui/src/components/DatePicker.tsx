import { useMemo } from "react";
import {
  DateField as AriaDateField,
  DateInput,
  DatePicker as AriaDatePicker,
  DateSegment,
  Dialog,
  Group,
} from "react-aria-components";
import { twMerge } from "tailwind-merge";

import { CalendarRegular } from "../icons/mingcute";
import { Button } from "./Button";
import { CalendarBody } from "./Calendar";
import { type FieldSize, fieldSurfaceClass, inputSizeClass } from "./Field";
import { fromIso, toIso } from "./iso-dates";
import { Popover } from "./Popover";

// A date typed segment by segment (day, month, year, and hour and minute `withTime`) in the
// locale's order, instead of the browser's date input. Values are ISO text, as in Calendar.

const segmentClass =
  "rounded-sm px-px whitespace-pre tabular-nums caret-transparent outline-none text-gray-800 data-placeholder:text-gray-500 data-[type=literal]:px-0 data-[type=literal]:text-gray-500 data-focused:bg-blue-600 data-focused:text-white data-focused:data-placeholder:text-white/80 forced-colors:data-focused:bg-[Highlight] forced-colors:data-focused:text-[HighlightText]";

const fieldClass = `flex items-center text-sm cursor-text ${fieldSurfaceClass} focus-within:border-gray-950/12 forced-colors:focus-within:border-[Highlight]`;

function Segments({ className }: { className?: string }) {
  return (
    <DateInput className={twMerge("flex min-w-0 flex-1 items-center", className)}>
      {(segment) => <DateSegment segment={segment} className={segmentClass} />}
    </DateInput>
  );
}

type CommonProps = {
  value: string | null;
  // The value when the field is whole again, or null when every segment is cleared. A part-typed
  // date is not reported.
  onChange: (iso: string | null) => void;
  // Hour and minute after the date ("2026-11-15T09:30").
  withTime?: boolean;
  size?: FieldSize;
  autoFocus?: boolean;
  isDisabled?: boolean;
  className?: string;
  "aria-label"?: string;
};

export type DateFieldProps = CommonProps;

export function DateField({
  value,
  onChange,
  withTime = false,
  size = "md",
  className,
  ...props
}: DateFieldProps) {
  // react-aria compares the value by identity: a new object on every render would reset typing.
  const date = useMemo(() => fromIso(value, withTime), [value, withTime]);
  return (
    <AriaDateField
      {...props}
      value={date}
      onChange={(next) => onChange(next ? toIso(next) : null)}
      granularity={withTime ? "minute" : "day"}
      shouldForceLeadingZeros
      className={twMerge("flex min-w-0", className)}
    >
      <Segments className={twMerge(fieldClass, inputSizeClass[size], "w-full")} />
    </AriaDateField>
  );
}

export type DatePickerProps = CommonProps;

// The field with a calendar button at its end; the calendar opens below.
export function DatePicker({
  value,
  onChange,
  withTime = false,
  size = "md",
  className,
  ...props
}: DatePickerProps) {
  const date = useMemo(() => fromIso(value, withTime), [value, withTime]);
  return (
    <AriaDatePicker
      {...props}
      value={date}
      onChange={(next) => onChange(next ? toIso(next) : null)}
      granularity={withTime ? "minute" : "day"}
      shouldForceLeadingZeros
      className={twMerge("group flex min-w-0", className)}
    >
      <Group className={twMerge(fieldClass, inputSizeClass[size], "w-full gap-1 pr-0.5")}>
        <Segments />
        <Button
          variant="ghost"
          size="icon-2xs"
          aria-label="Choose a date"
          className="text-gray-500"
        >
          <CalendarRegular aria-hidden />
        </Button>
      </Group>
      <Popover placement="bottom end" className="p-2">
        <Dialog aria-label="Calendar" className="outline-none">
          <CalendarBody />
        </Dialog>
      </Popover>
    </AriaDatePicker>
  );
}
