export type RuntimeModule = 'memory' | 'voice' | 'revision';
export interface RuntimeModules {
  installed: RuntimeModule[];
  active: {
    module: RuntimeModule;
    phase: 'bootstrap' | 'download' | 'verify';
  } | null;
}
