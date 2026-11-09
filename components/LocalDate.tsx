"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** True only in the browser after hydration, so time-zone-dependent text never mismatches the server. */
export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/** A date shown in the reader's own time zone, e.g. "9 Nov" or "9 Nov 2025". */
export function LocalDate({ iso }: { iso: string }) {
  const isClient = useIsClient();
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const text = date.toLocaleDateString(isClient ? undefined : "en-GB", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
    timeZone: isClient ? undefined : "UTC",
  });
  return <time dateTime={iso}>{text}</time>;
}
