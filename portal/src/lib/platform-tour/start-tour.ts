import type { PlatformTourStep } from './types';
import { resolvePlatformTour } from './resolve-tour';

const TOUR_PREPARE_EVENT = 'platform-tour:prepare';
const TOUR_SEEN_PREFIX = 'mathionix-tour-seen';

function prepareShellForTour() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(TOUR_PREPARE_EVENT));
}

function filterExistingSteps(steps: PlatformTourStep[]): PlatformTourStep[] {
  if (typeof document === 'undefined') return steps;
  return steps.filter((step) => {
    if (!step.element) return true;
    return Boolean(document.querySelector(step.element));
  });
}

function markTourSeen(moduleKey: string) {
  try {
    localStorage.setItem(`${TOUR_SEEN_PREFIX}:${moduleKey}`, '1');
  } catch {
    /* ignore quota / private mode */
  }
}

export function hasSeenPlatformTour(moduleKey: string): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(`${TOUR_SEEN_PREFIX}:${moduleKey}`) === '1';
  } catch {
    return true;
  }
}

export async function startPlatformTour(pathname: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  prepareShellForTour();

  // Allow sidebar expand + layout settle before measuring targets
  await new Promise((r) => window.setTimeout(r, 120));

  const { moduleId, steps } = resolvePlatformTour(pathname);
  const visibleSteps = filterExistingSteps(steps);

  if (!visibleSteps.length) return false;

  const { driver } = await import('driver.js');

  const driverObj = driver({
    showProgress: true,
    progressText: '{{current}} of {{total}}',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    showButtons: ['next', 'previous', 'close'],
    popoverClass: 'mathionix-platform-tour-popover',
    overlayColor: 'rgba(15, 23, 42, 0.55)',
    stagePadding: 8,
    stageRadius: 10,
    smoothScroll: true,
    allowClose: true,
    onDestroyed: () => {
      markTourSeen(moduleId ?? 'suite');
    },
    steps: visibleSteps.map((step) => ({
      element: step.element,
      popover: {
        title: step.title,
        description: step.description,
        side: step.side ?? 'bottom',
        align: 'start',
      },
    })),
  });

  driverObj.drive();
  return true;
}

export { TOUR_PREPARE_EVENT };
