'use client';

import { useEffect } from 'react';
import {
  applySuiteAppearance,
  fetchSuiteAppearance,
  SUITE_APPEARANCE_REFRESH_EVENT,
} from '@/lib/suite-appearance';

export default function SuiteAppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    const load = async () => {
      const data = await fetchSuiteAppearance();
      applySuiteAppearance(data);
    };
    void load();
    const onRefresh = () => void load();
    window.addEventListener(SUITE_APPEARANCE_REFRESH_EVENT, onRefresh);
    return () =>
      window.removeEventListener(SUITE_APPEARANCE_REFRESH_EVENT, onRefresh);
  }, []);

  return <>{children}</>;
}
