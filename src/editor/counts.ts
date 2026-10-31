import { measureText, type CountJob, type CountResult } from './countMetrics';

/** Exact counts off the UI thread; per-section versions reject stale replies. */
export class DocumentCounts {
  private worker: Worker | null = null;
  private pending = new Map<string, CountJob>();
  private counts = new Map<string, CountResult>();
  private serial = 0;
  private words = 0;
  private characters = 0;
  private destroyed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private publish: (words: number, characters: number) => void,
    createWorker = () =>
      new Worker(new URL('./counts.worker.ts', import.meta.url), { type: 'module' }),
  ) {
    if (typeof Worker !== 'undefined') {
      try {
        this.worker = createWorker();
        this.worker.onmessage = (event) => this.receive(event.data as CountResult[]);
        this.worker.onerror = () => {
          this.worker?.terminate();
          this.worker = null;
          this.fallback();
        };
      } catch {
        this.worker = null;
      }
    }
  }
  update(sections: { id: string; text: string }[]) {
    const jobs = sections.map((section) => ({ ...section, version: ++this.serial }));
    for (const job of jobs) this.pending.set(job.id, job);
    if (this.worker) this.worker.postMessage(jobs);
    else this.fallback();
  }
  private receive(results: CountResult[]) {
    if (this.destroyed) return;
    for (const result of results) {
      if (this.pending.get(result.id)?.version !== result.version) continue;
      const previous = this.counts.get(result.id);
      this.words += result.words - (previous?.words ?? 0);
      this.characters += result.characters - (previous?.characters ?? 0);
      this.counts.set(result.id, result);
      this.pending.delete(result.id);
    }
    this.publish(this.words, this.characters);
  }
  private fallback() {
    clearTimeout(this.timer);
    if (this.destroyed || !this.pending.size) return;
    this.timer = setTimeout(() => {
      const start = performance.now(),
        results: CountResult[] = [];
      for (const job of this.pending.values()) {
        results.push(measureText(job));
        if (performance.now() - start > 4) break;
      }
      this.receive(results);
      this.fallback();
    }, 0);
  }
  destroy() {
    this.destroyed = true;
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.pending.clear();
    this.counts.clear();
  }
}
