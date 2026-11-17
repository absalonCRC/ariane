import type { InboxCapture, CaptureSelection } from '../contracts/inbox';
import type { Requests, Responses } from '../contracts/requests';
type Transport = <K extends 'inboxSave' | 'inboxFinish'>(
  type: K,
  value: Requests[K],
) => Promise<Responses[K]>;
/** Owns revisions and retry identities. Editor text is never controlled by React. */
export class CaptureDraft {
  text: string;
  selection: CaptureSelection;
  private generation = 0;
  private confirmed = 0;
  private queue: Promise<void> = Promise.resolve();
  private pending: { request: Requests['inboxSave']; generation: number } | null = null;
  private finishing: Requests['inboxFinish'] | null = null;
  constructor(
    public capture: InboxCapture,
    private transport: Transport,
  ) {
    this.text = capture.text;
    this.selection = capture.selection;
  }
  get dirty() {
    return this.generation !== this.confirmed || this.pending !== null;
  }
  get uncertainFinish() {
    return this.finishing !== null;
  }
  edit(text: string, selection: CaptureSelection) {
    if (this.finishing) throw new Error('La finalisation doit être confirmée avant de reprendre.');
    this.text = text;
    this.selection = selection;
    this.generation++;
  }
  flush(): Promise<void> {
    const task = this.queue.then(async () => {
      while (this.dirty) {
        this.pending ??= {
          request: {
            id: this.capture.id,
            expectedRevision: this.capture.revision,
            operationId: crypto.randomUUID(),
            text: this.text,
            selection: { ...this.selection },
          },
          generation: this.generation,
        };
        const pending = this.pending;
        const saved = await this.transport('inboxSave', pending.request);
        this.capture = saved;
        this.confirmed = pending.generation;
        this.pending = null;
      }
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async finish(): Promise<InboxCapture> {
    await this.flush();
    this.finishing ??= {
      id: this.capture.id,
      expectedRevision: this.capture.revision,
      operationId: crypto.randomUUID(),
    };
    const next = await this.transport('inboxFinish', this.finishing);
    this.finishing = null;
    return next;
  }
}
