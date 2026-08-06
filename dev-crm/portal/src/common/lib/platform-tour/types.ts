export type SuiteModuleId =
  | 'hrms'
  | 'crm'
  | 'pm'
  | 'social'
  | 'vault'
  | 'client-portals';

export type PlatformTourStep = {
  /** CSS selector; omit for a centered welcome step */
  element?: string;
  title: string;
  description: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
};

export type PlatformTourDefinition = {
  moduleId: SuiteModuleId | null;
  moduleName: string;
  steps: PlatformTourStep[];
};
