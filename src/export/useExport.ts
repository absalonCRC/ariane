import { t, useLocale } from '../i18n';
import { useState } from 'react';
import { choosePath } from '../app/choosePath';
import { native, request } from '../app/client';
import type { Project } from '../app/types';
import { manuscriptSections, scenesFor } from '../project/tree';

// The job outlives its dialog, so writing can continue without losing its result.
export function useExport() {
  useLocale();
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
            t('Les exports PDF, Word et EPUB sont disponibles dans l’application macOS.'),
          );
        const sections =
          scope === 'project'
            ? manuscriptSections(project.sections)
            : scenesFor(project.sections, active, false);
        if (!sections.some((s) => s.kind === 'scene'))
          throw new Error(t('Aucun texte inclus dans cet export.'));
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
      const path = await choosePath('export', {
        title: t('Exporter le manuscrit'),
        name: project.name + '.' + format,
        format,
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
