// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import type { HistoryState } from '../src/contracts/history';
import type { Project } from '../src/contracts/project';
import { PathMenu } from '../src/project/PathMenu';
import { BranchMenu } from '../src/history/BranchMenu';
import { useWritingBranches } from '../src/history/useWritingBranches';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/platform/client', () => ({ request }));
const project: Project = {
  path: 'roman',
  name: 'Roman',
  sections: [],
  settings: {},
  recovered: false,
};
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host?.remove();
  request.mockReset();
});

it('shows the active variant in the closed capsule and switches it after saving', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let state: HistoryState = {
    activeBranch: 'main',
    branches: [
      {
        id: 'main',
        name: 'Texte principal',
        created: '',
        isMain: true,
        baseVersion: null,
        headVersion: null,
      },
      {
        id: 'variant',
        name: 'Une autre fin',
        created: '',
        isMain: false,
        baseVersion: null,
        headVersion: null,
      },
    ],
  };
  const calls: string[] = [];
  const onError = vi.fn(),
    manage = vi.fn();
  request.mockImplementation(async (type: string, args: { id?: string }) => {
    if (type === 'historyState') return state;
    if (type === 'switchBranch') {
      calls.push('switch');
      state = { ...state, activeBranch: args.id! };
      return project;
    }
    throw new Error(type);
  });
  function Harness() {
    const [generation, setGeneration] = useState(0);
    const branches = useWritingBranches({
      path: project.path,
      generation,
      checkpoint: async () => {
        calls.push('save');
      },
      onChanged: () => {
        calls.push('apply');
        setGeneration((value) => value + 1);
      },
      onError,
    });
    const active = branches.state?.branches.find(
      (branch) => branch.id === branches.state?.activeBranch,
    );
    return (
      <PathMenu
        project={project}
        selected={undefined}
        continuous
        onSelect={() => {}}
        onAdd={() => {}}
        branchName={active?.name}
        branchMenu={
          branches.state
            ? (close) => (
                <BranchMenu
                  state={branches.state!}
                  busy={branches.busy}
                  onSwitch={async (id) => {
                    await branches.switchBranch(id);
                    close();
                  }}
                  onManage={() => {
                    close();
                    manage();
                  }}
                />
              )
            : undefined
        }
      />
    );
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness />));
  const trigger = host.querySelector<HTMLButtonElement>('.path-trigger')!;
  expect(trigger.textContent).toContain('Texte principal');
  expect(host.querySelector('.path-popover')?.getAttribute('aria-hidden')).toBe('true');
  await act(async () => trigger.click());
  expect(host.querySelector('.path-popover')?.getAttribute('aria-hidden')).toBe('false');
  const variant = [...host.querySelectorAll<HTMLButtonElement>('.path-branch-item')].find(
    (button) => button.textContent?.includes('Une autre fin'),
  )!;
  await act(async () => variant.focus());
  await act(async () => variant.click());
  expect(calls).toEqual(['save', 'switch', 'apply']);
  expect(trigger.textContent).toContain('Une autre fin');
  expect(host.querySelector('.path-popover')?.getAttribute('aria-hidden')).toBe('true');
  expect(document.activeElement).toBe(trigger);
  await act(async () => trigger.click());
  await act(async () => host.querySelector<HTMLButtonElement>('.path-branches-manage')!.click());
  expect(manage).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
});

it('does not switch the previous project if the active project changes while saving', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const state: HistoryState = {
    activeBranch: 'main',
    branches: [
      {
        id: 'main',
        name: 'Texte principal',
        created: '',
        isMain: true,
        baseVersion: null,
        headVersion: null,
      },
      {
        id: 'variant',
        name: 'Une autre fin',
        created: '',
        isMain: false,
        baseVersion: null,
        headVersion: null,
      },
    ],
  };
  let finishSave!: () => void;
  let changeProject!: (path: string) => void;
  const checkpoint = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        finishSave = resolve;
      }),
  );
  const changed = vi.fn(),
    onError = vi.fn();
  request.mockImplementation(async (type: string) => {
    if (type === 'historyState') return state;
    if (type === 'switchBranch') return project;
    throw new Error(type);
  });
  function Harness() {
    const [path, setPath] = useState('roman');
    changeProject = setPath;
    const branches = useWritingBranches({
      path,
      generation: 0,
      checkpoint,
      onChanged: changed,
      onError,
    });
    return (
      branches.state && (
        <BranchMenu
          state={branches.state}
          busy={branches.busy}
          onSwitch={branches.switchBranch}
          onManage={() => {}}
        />
      )
    );
  }
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(<Harness />));
  const variant = [...host.querySelectorAll<HTMLButtonElement>('.path-branch-item')].find(
    (button) => button.textContent?.includes('Une autre fin'),
  )!;
  await act(async () => variant.click());
  await act(async () => changeProject('autre-projet'));
  await act(async () => finishSave());
  expect(request.mock.calls.some(([type]) => type === 'switchBranch')).toBe(false);
  expect(changed).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});
