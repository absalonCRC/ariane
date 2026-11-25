export type RuntimeModule =
  | 'readingFr'
  | 'readingEn'
  | 'readingEs'
  | 'semantic'
  | 'memory'
  | 'voice'
  | 'cleanup'
  | 'revision'
  | 'salamandra';
export interface RuntimeModules {
  installed: RuntimeModule[];
  active: {
    module: RuntimeModule;
    phase: 'bootstrap' | 'download' | 'verify';
  } | null;
}
