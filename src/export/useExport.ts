import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { native, request } from '../app/client';
import type { Project } from '../app/types';
import { ordered, scenesFor } from '../project/tree';

// The job outlives its dialog, so writing can continue without losing its result.
export function useExport() {
  const [format, setFormat] = useState('pdf');
  const [scope, setScope] = useState('project');
  const [state, setState] = useState<'ready' | 'working' | 'done' | 'error'>('ready');
  const [result, setResult] = useState('');
  async function run(project: Project, active: string | null, flush: () => Promise<void>) {
    try {
      await flush();
      if (!native) {
        if (format !== 'md')
          throw new Error(
            'Les exports PDF, Word et EPUB sont disponibles dans l’application macOS.',
          );
        const sections =
          scope === 'project'
            ? ordered(project.sections)
            : scenesFor(project.sections, active, false);
        const text = sections.map((s) => '# ' + s.title + '\n\n' + s.text).join('\n\n');
        const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = project.name + '.md';
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setResult(project.name + '.md');
        setState('done');
        return;
      }
      const path = await save({
        title: 'Exporter le manuscrit',
        defaultPath: project.name + '.' + format,
        filters: [{ name: format.toUpperCase(), extensions: [format] }],
      });
      if (!path) return;
      setState('working');
      setResult(
        await request<string>('export', {
          path,
          format,
          scope: scope === 'project' ? null : active,
        }),
      );
      setState('done');
    } catch (e) {
      setResult(String(e));
      setState('error');
    }
  }
  return {
    state,
    result,
    format,
    scope,
    setFormat,
    setScope,
    run,
    reset: () => {
      setState('ready');
      setResult('');
    },
    cancel: () => request('cancelExport'),
  };
}
export type ExportJob = ReturnType<typeof useExport>;
