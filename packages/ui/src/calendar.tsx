"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker, getDefaultClassNames } from "react-day-picker";

import { cn } from "./utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

export function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "dropdown",
  ...props
}: CalendarProps) {
  const defaultClassNames = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      captionLayout={captionLayout}
      startMonth={new Date(2015, 0)}
      endMonth={new Date(2035, 11)}
      className={cn("p-0", className)}
      classNames={{
        root: cn("w-fit select-none", defaultClassNames.root),
        months: cn("flex flex-col sm:flex-row sm:gap-4", defaultClassNames.months),
        month: cn("flex flex-col gap-2", defaultClassNames.month),

        month_caption: cn(
          "flex h-10 w-full items-center justify-center px-10 mb-1",
          defaultClassNames.month_caption
        ),
        caption_label: cn("text-sm font-semibold text-text-main hidden", defaultClassNames.caption_label),

        dropdowns: cn("flex items-center gap-1", defaultClassNames.dropdowns),
        dropdown_root: cn("relative", defaultClassNames.dropdown_root),
        dropdown: cn(
          "h-8 rounded-md border border-border bg-card px-2 pr-6 text-sm font-semibold text-text-main",
          "outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
          "cursor-pointer appearance-none transition-colors hover:border-border",
          defaultClassNames.dropdown
        ),

        nav: cn(
          "absolute inset-x-0 top-0 flex items-center justify-between px-1 h-10",
          defaultClassNames.nav
        ),
        button_previous: cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card",
          "text-muted-foreground transition-all hover:bg-surface-hover hover:border-border hover:text-text-main",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card",
          "text-muted-foreground transition-all hover:bg-surface-hover hover:border-border hover:text-text-main",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30",
          defaultClassNames.button_next
        ),

        month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
        weekdays: cn("flex mb-1", defaultClassNames.weekdays),
        weekday: cn(
          "w-9 text-center text-xs font-semibold uppercase tracking-widest text-muted-foreground",
          defaultClassNames.weekday
        ),
        week: cn("flex w-full mt-0.5", defaultClassNames.week),

        day: cn(
          "relative flex h-9 w-9 items-center justify-center p-0 text-center",
          defaultClassNames.day
        ),
        day_button: cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
          "text-text-main transition-all duration-150",
          "hover:bg-primary/10 hover:text-primary",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          "aria-selected:bg-primary aria-selected:text-white aria-selected:hover:bg-primary aria-selected:shadow-sm",
          defaultClassNames.day_button
        ),

        today: cn(
          "font-bold text-primary data-[selected=true]:text-white",
          defaultClassNames.today
        ),
        outside: cn("opacity-30", defaultClassNames.outside),
        disabled: cn("pointer-events-none opacity-25", defaultClassNames.disabled),
        hidden: cn("invisible", defaultClassNames.hidden),
        selected: cn("", defaultClassNames.selected),
        ...classNames,
      }}
      components={{
        Chevron: ({ className: chClass, orientation, ...rest }) => {
          const Icon = orientation === "left" ? ChevronLeft : ChevronRight;
          return <Icon className={cn("h-3.5 w-3.5", chClass)} {...rest} />;
        },
      }}
      {...props}
    />
  );
}
