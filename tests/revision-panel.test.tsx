// @vitest-environment jsdom
import { act, createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import type { EditorHandle } from '../src/editor/Editor';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/app/client', () => ({ native: true, request }));
import { ReviewPanel } from '../src/revision/ReviewPanel';

describe('révision locale', () => {
  it('affiche la grammaire pendant que le modèle calcule et ignore sa réponse après application', async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    let finish: (value: unknown) => void = () => {};
    request.mockImplementation((kind: string, input?: { stage?: string }) => {
      if (kind === 'revisionStatus') return Promise.resolve({ available: true });
      if (input?.stage === 'language')
        return Promise.resolve({
          issues: [{ offset: 4, length: 6, message: 'Accord', replacements: ['enfants'] }],
          model: null,
          languageError: null,
          modelError: null,
        });
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const editor = createRef<EditorHandle>();
    const apply = vi.fn(() => true);
    Object.defineProperty(editor, 'current', {
      value: { reviewTarget: () => ({ text: 'Les enfant jouent.', isCurrent: () => true, apply }) },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<ReviewPanel editor={editor} language="fr" open />));
    await act(async () => host.querySelector('button')!.click());
    expect(host.textContent).toContain('enfants');
    expect(host.querySelector('button')!.disabled).toBe(true);
    await act(async () => (host.querySelectorAll('button')[1] as HTMLButtonElement).click());
    await act(async () =>
      finish({ issues: [], model: 'Les enfants jouent.', languageError: null, modelError: null }),
    );
    expect(apply).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('Correction appliquée.');
    await act(async () => root.unmount());
    host.remove();
  });
  it('présente une suggestion sans modifier le manuscrit avant son choix', async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    request.mockImplementation(async (kind: string) =>
      kind === 'revisionStatus'
        ? { available: true }
        : {
            issues: [{ offset: 4, length: 6, message: 'Accord', replacements: ['enfants'] }],
            model: null,
            languageError: null,
            modelError: null,
          },
    );
    const apply = vi.fn(() => true);
    const editor = createRef<EditorHandle>();
    Object.defineProperty(editor, 'current', {
      value: { reviewTarget: () => ({ text: 'Les enfant jouent.', isCurrent: () => true, apply }) },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<ReviewPanel editor={editor} language="fr" open />));
    await act(async () => host.querySelector('button')!.click());
    expect(apply).not.toHaveBeenCalled();
    expect(host.textContent).toContain('enfants');
    await act(async () => (host.querySelectorAll('button')[1] as HTMLButtonElement).click());
    expect(apply).toHaveBeenCalledOnce();
    expect(host.textContent).toContain('Correction appliquée.');
    await act(async () => root.unmount());
    host.remove();
  });
  it('n’affiche pas de résultats lorsque le document a changé pendant l’analyse', async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    request.mockImplementation(async (kind: string) =>
      kind === 'revisionStatus'
        ? { available: true }
        : {
            issues: [{ offset: 4, length: 6, message: 'Accord', replacements: ['enfants'] }],
            model: null,
            languageError: null,
            modelError: null,
          },
    );
    const editor = createRef<EditorHandle>();
    Object.defineProperty(editor, 'current', {
      value: {
        reviewTarget: () => ({
          text: 'Les enfant jouent.',
          isCurrent: () => false,
          apply: vi.fn(),
        }),
      },
    });
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<ReviewPanel editor={editor} language="fr" open />));
    await act(async () => host.querySelector('button')!.click());
    expect(host.textContent).toContain('Le texte a changé');
    expect(host.querySelectorAll('button')).toHaveLength(1);
    await act(async () => root.unmount());
    host.remove();
  });
});
