"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from "react";

export type ChartZoomRange = {
  startIndex: number;
  endIndex: number;
};

type Options = {
  /** Total number of data points in the series. */
  length: number;
  /** Minimum visible window size when zoomed in. */
  minWindow?: number;
  /** Extra reset token — bump to force full range (e.g. refresh button). */
  resetKey?: number;
};

/**
 * Index-based zoom/pan for Recharts Brush charts.
 * When the chart container is focused:
 * - `+` / `=` / `ArrowUp` — zoom in
 * - `-` / `_` / `ArrowDown` — zoom out
 * - `ArrowLeft` / `ArrowRight` — pan
 * - `0` / `Home` / `Escape` — reset
 */
export function useChartKeyboardZoom({
  length,
  minWindow = 2,
  resetKey = 0,
}: Options) {
  const full = useMemo(
    () => ({
      startIndex: 0,
      endIndex: Math.max(0, length - 1),
    }),
    [length],
  );

  const [range, setRange] = useState<ChartZoomRange>(full);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setRange(full);
  }, [full, resetKey]);

  const clampRange = useCallback(
    (next: ChartZoomRange): ChartZoomRange => {
      if (length <= 0) return { startIndex: 0, endIndex: 0 };
      let start = Math.max(0, Math.min(next.startIndex, length - 1));
      let end = Math.max(0, Math.min(next.endIndex, length - 1));
      if (end < start) [start, end] = [end, start];
      if (end - start + 1 < Math.min(minWindow, length)) {
        end = Math.min(length - 1, start + Math.min(minWindow, length) - 1);
      }
      return { startIndex: start, endIndex: end };
    },
    [length, minWindow],
  );

  const resetZoom = useCallback(() => setRange(full), [full]);

  const zoomIn = useCallback(() => {
    setRange((prev) => {
      const span = prev.endIndex - prev.startIndex + 1;
      if (span <= minWindow) return prev;
      const shrink = Math.max(1, Math.floor(span * 0.2));
      return clampRange({
        startIndex: prev.startIndex + shrink,
        endIndex: prev.endIndex - shrink,
      });
    });
  }, [clampRange, minWindow]);

  const zoomOut = useCallback(() => {
    setRange((prev) => {
      const grow = Math.max(
        1,
        Math.floor((prev.endIndex - prev.startIndex + 1) * 0.25),
      );
      return clampRange({
        startIndex: prev.startIndex - grow,
        endIndex: prev.endIndex + grow,
      });
    });
  }, [clampRange]);

  const pan = useCallback(
    (dir: -1 | 1) => {
      setRange((prev) => {
        const span = prev.endIndex - prev.startIndex;
        const shift = Math.max(1, Math.floor((span + 1) * 0.15)) * dir;
        let start = prev.startIndex + shift;
        let end = prev.endIndex + shift;
        if (start < 0) {
          end -= start;
          start = 0;
        }
        if (end > length - 1) {
          start -= end - (length - 1);
          end = length - 1;
        }
        return clampRange({ startIndex: start, endIndex: end });
      });
    },
    [clampRange, length],
  );

  const onBrushChange = useCallback(
    (next?: { startIndex?: number; endIndex?: number }) => {
      if (
        next?.startIndex == null ||
        next?.endIndex == null ||
        !Number.isFinite(next.startIndex) ||
        !Number.isFinite(next.endIndex)
      ) {
        return;
      }
      setRange(
        clampRange({
          startIndex: next.startIndex,
          endIndex: next.endIndex,
        }),
      );
    },
    [clampRange],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLElement>) => {
      if (length <= 1) return;
      const key = e.key;
      if (
        key === "+" ||
        key === "=" ||
        key === "ArrowUp" ||
        key === "Add"
      ) {
        e.preventDefault();
        zoomIn();
      } else if (
        key === "-" ||
        key === "_" ||
        key === "ArrowDown" ||
        key === "Subtract"
      ) {
        e.preventDefault();
        zoomOut();
      } else if (key === "ArrowLeft") {
        e.preventDefault();
        pan(-1);
      } else if (key === "ArrowRight") {
        e.preventDefault();
        pan(1);
      } else if (key === "0" || key === "Home" || key === "Escape") {
        e.preventDefault();
        resetZoom();
      }
    },
    [length, pan, resetZoom, zoomIn, zoomOut],
  );

  const isZoomed =
    length > 0 &&
    (range.startIndex !== 0 || range.endIndex !== length - 1);

  return {
    containerRef: containerRef as RefObject<HTMLDivElement>,
    range,
    isZoomed,
    resetZoom,
    zoomIn,
    zoomOut,
    onBrushChange,
    onKeyDown,
    brushProps: {
      startIndex: range.startIndex,
      endIndex: range.endIndex,
      onChange: onBrushChange,
    },
    focusProps: {
      ref: containerRef,
      tabIndex: 0 as const,
      role: "group" as const,
      "aria-label":
        "Chart. Use + and - to zoom, arrow keys to pan, 0 or Escape to reset.",
      onKeyDown,
      className:
        "h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2 rounded-[var(--radius-md)]",
    },
  };
}
