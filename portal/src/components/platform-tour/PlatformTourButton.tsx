'use client';

import { HelpCircle } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useCallback, useState } from 'react';
import { startPlatformTour } from '@/lib/platform-tour/start-tour';
import 'driver.js/dist/driver.css';
import './platform-tour.css';

type PlatformTourButtonProps = {
  className?: string;
};

export default function PlatformTourButton({ className }: PlatformTourButtonProps) {
  const pathname = usePathname();
  const [running, setRunning] = useState(false);

  const handleClick = useCallback(async () => {
    if (running) return;
    setRunning(true);
    try {
      await startPlatformTour(pathname);
    } finally {
      setRunning(false);
    }
  }, [pathname, running]);

  return (
    <button
      type="button"
      data-tour="platform-tour"
      onClick={handleClick}
      disabled={running}
      title="Platform tour — learn how to use this module"
      aria-label="Start platform tour for this module"
      className={
        className ??
        'p-2 rounded-md text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] disabled:opacity-50'
      }
    >
      <HelpCircle size={20} className={running ? 'animate-pulse' : undefined} />
    </button>
  );
}
