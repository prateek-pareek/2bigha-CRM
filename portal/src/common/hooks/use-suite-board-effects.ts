'use client';

import { useEffect, useState } from 'react';
import {
  isSuiteBoardEffectsEnabled,
  SUITE_APPEARANCE_REFRESH_EVENT,
} from '@/lib/suite-appearance';

/** React hook — mirrors admin HR Settings → board cartoon effects toggle. */
export function useSuiteBoardEffects(): boolean {
  const [enabled, setEnabled] = useState(() => isSuiteBoardEffectsEnabled());

  useEffect(() => {
    const sync = () => setEnabled(isSuiteBoardEffectsEnabled());
    sync();
    window.addEventListener(SUITE_APPEARANCE_REFRESH_EVENT, sync);
    return () => window.removeEventListener(SUITE_APPEARANCE_REFRESH_EVENT, sync);
  }, []);

  return enabled;
}
