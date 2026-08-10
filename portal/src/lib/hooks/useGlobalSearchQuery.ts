"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 180;
const MIN_QUERY_LEN = 2;
const CACHE_MAX = 64;

type SearchFetcher = (
  query: string,
  signal: AbortSignal,
) => Promise<unknown>;

type Options = {
  fetcher: SearchFetcher;
  minLength?: number;
  debounceMs?: number;
};

function cacheKey(query: string): string {
  return query.trim().toLowerCase();
}

export function useGlobalSearchQuery({
  fetcher,
  minLength = MIN_QUERY_LEN,
  debounceMs = DEBOUNCE_MS,
}: Options) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const cacheRef = useRef<Map<string, unknown>>(new Map());
  const abortRef = useRef<AbortController | null>(null);
  const reqIdRef = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const runSearch = useCallback(
    async (raw: string) => {
      const q = raw.trim();
      if (q.length < minLength) {
        abortRef.current?.abort();
        setResults(null);
        setLoading(false);
        return;
      }

      const key = cacheKey(q);
      const cached = cacheRef.current.get(key);
      if (cached !== undefined) {
        setResults(cached);
        setIsOpen(true);
        setLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const reqId = ++reqIdRef.current;

      setLoading(true);
      try {
        const data = await fetcherRef.current(q, controller.signal);
        if (controller.signal.aborted || reqId !== reqIdRef.current) {
          return;
        }

        if (cacheRef.current.size >= CACHE_MAX) {
          const first = cacheRef.current.keys().next().value;
          if (first) cacheRef.current.delete(first);
        }
        cacheRef.current.set(key, data);
        setResults(data);
        setIsOpen(true);
      } catch (err) {
        if (controller.signal.aborted || reqId !== reqIdRef.current) {
          return;
        }
        console.error("Search error:", err);
        setResults(null);
      } finally {
        if (reqId === reqIdRef.current) {
          setLoading(false);
        }
      }
    },
    [minLength],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < minLength) {
      abortRef.current?.abort();
      setResults(null);
      setLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void runSearch(q);
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [query, minLength, debounceMs, runSearch]);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setQuery("");
    setResults(null);
    setIsOpen(false);
    setLoading(false);
  }, []);

  const prefetch = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < minLength) return;
      void runSearch(trimmed);
    },
    [minLength, runSearch],
  );

  return {
    query,
    setQuery,
    results,
    loading,
    isOpen,
    setIsOpen,
    clear,
    prefetch,
    minLength,
  };
}
