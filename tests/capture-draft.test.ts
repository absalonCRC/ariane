import { expect, it, vi } from 'vitest';
import { CaptureDraft } from '../src/capture/draft';
import type { InboxCapture } from '../src/contracts/inbox';

const capture = (): InboxCapture => ({
  id: 'draft',
  revision: 0,
  text: '',
  createdAt: '',
  updatedAt: '',
  status: 'draft',
  selection: { anchor: 0, head: 0 },
  destination: null,
});
it('retries a lost save response with the same identity, then preserves a newer edit', async () => {
  const requests: Record<string, unknown>[] = [];
  let fail = true;
  const transport = vi.fn(async (_type, request) => {
    requests.push(request);
    if (fail) {
      fail = false;
      throw Error('response lost after commit');
    }
    return {
      ...capture(),
      text: request.text,
      selection: request.selection,
      revision: request.expectedRevision + 1,
    };
  });
  const draft = new CaptureDraft(capture(), transport);
  draft.edit('Été 🌿', { anchor: 6, head: 6 });
  await expect(draft.flush()).rejects.toThrow('response lost');
  draft.edit('Été 🌿 demain', { anchor: 13, head: 13 });
  await draft.flush();
  expect(requests[1]).toEqual(requests[0]);
  expect(requests[2]).toMatchObject({ text: 'Été 🌿 demain', expectedRevision: 1 });
  expect(requests[2].operationId).not.toBe(requests[0].operationId);
  expect(draft.dirty).toBe(false);
  expect(draft.text).toBe('Été 🌿 demain');
});

it('serializes flushes and includes edits made while the commit is pending', async () => {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const transport = vi.fn(async (_type, request) => {
    await wait;
    return {
      ...capture(),
      text: request.text,
      selection: request.selection,
      revision: request.expectedRevision + 1,
    };
  });
  const draft = new CaptureDraft(capture(), transport);
  draft.edit('Un', { anchor: 2, head: 2 });
  const first = draft.flush();
  await Promise.resolve();
  draft.edit('Un deux', { anchor: 7, head: 7 });
  const second = draft.flush();
  release();
  await Promise.all([first, second]);
  expect(transport).toHaveBeenCalledTimes(2);
  expect(draft.capture.text).toBe('Un deux');
  expect(draft.capture.revision).toBe(2);
});

it('locks an uncertain finish and reuses its receipt before showing the next draft', async () => {
  let failed = false;
  const transport = vi.fn(async (type, request) => {
    if (type === 'inboxSave') return { ...capture(), text: request.text, revision: 1 };
    if (!failed) {
      failed = true;
      throw Error('lost finish');
    }
    return { ...capture(), id: 'next' };
  });
  const draft = new CaptureDraft(capture(), transport);
  draft.edit('Une idée', { anchor: 0, head: 0 });
  await expect(draft.finish()).rejects.toThrow('lost finish');
  expect(draft.uncertainFinish).toBe(true);
  expect(() => draft.edit('frappe tardive', { anchor: 0, head: 0 })).toThrow();
  expect((await draft.finish()).id).toBe('next');
  expect(transport.mock.calls[2]).toEqual(transport.mock.calls[1]);
  expect(draft.uncertainFinish).toBe(false);
});
