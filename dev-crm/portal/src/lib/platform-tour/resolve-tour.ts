import { COMMON_SHELL_STEPS } from './common-steps';
import { getModuleName, getModuleSteps, getPageSteps } from './modules';
import type { PlatformTourDefinition, PlatformTourStep, SuiteModuleId } from './types';

function resolveModuleId(pathname: string): SuiteModuleId | null {
  if (pathname.startsWith('/hrms')) return 'hrms';
  if (pathname.startsWith('/crm')) return 'crm';
  if (pathname.startsWith('/pm')) return 'pm';
  if (pathname.startsWith('/social')) return 'social';
  if (pathname.startsWith('/vault')) return 'vault';
  if (pathname.startsWith('/client-portals')) return 'client-portals';
  return null;
}

function dedupeSteps(steps: PlatformTourStep[]): PlatformTourStep[] {
  const seen = new Set<string>();
  const result: PlatformTourStep[] = [];
  for (const step of steps) {
    const key = `${step.element ?? '__welcome__'}::${step.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(step);
  }
  return result;
}

export function resolvePlatformTour(pathname: string): PlatformTourDefinition {
  const moduleId = resolveModuleId(pathname);
  const moduleName = moduleId ? getModuleName(moduleId) : 'Mathionix Suite';

  const pageSteps = getPageSteps(pathname);
  const moduleSteps = moduleId ? getModuleSteps(moduleId) : [];

  // Page-specific content replaces generic module main-content step when present
  const shellWithoutDuplicateMain =
    pageSteps.length > 0
      ? [...moduleSteps.filter((s) => s.element !== '[data-tour="main-content"]')]
      : moduleSteps;

  const steps = dedupeSteps([
    ...COMMON_SHELL_STEPS,
    ...shellWithoutDuplicateMain,
    ...pageSteps,
  ]);

  return { moduleId, moduleName, steps };
}
