export interface WritingDay {
  netWords: number;
  edits: number;
}
export interface WritingActivity {
  version: 1;
  startedOn: string;
  days: Record<string, WritingDay>;
}
export const writingActivityKey = 'ariane.writing-activity.v1';
export function localDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const validDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) && localDay(new Date(`${value}T12:00:00`)) === value;
function readActivity(raw: string | null, today: string): WritingActivity {
  if (!raw) return { version: 1, startedOn: today, days: {} };
  const value = JSON.parse(raw) as WritingActivity;
  if (
    value?.version !== 1 ||
    typeof value.startedOn !== 'string' ||
    !validDay(value.startedOn) ||
    !value.days ||
    typeof value.days !== 'object' ||
    Array.isArray(value.days)
  )
    throw new Error('Activité d’écriture illisible.');
  for (const [day, entry] of Object.entries(value.days)) {
    if (
      !validDay(day) ||
      !entry ||
      !Number.isSafeInteger(entry.netWords) ||
      !Number.isSafeInteger(entry.edits) ||
      entry.edits < 1
    )
      throw new Error('Activité d’écriture illisible.');
  }
  return value;
}

/** One writer in the main window. Stores aggregate counts only, never manuscript text. */
export class WritingActivityStore {
  private value: WritingActivity;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private loadError: unknown;
  constructor(
    private storage: Pick<Storage, 'getItem' | 'setItem'>,
    private onError: (error: unknown) => void,
    private now = () => new Date(),
  ) {
    const today = localDay(now());
    this.value = { version: 1, startedOn: today, days: {} };
    try {
      this.value = readActivity(storage.getItem(writingActivityKey), today);
    } catch (error) {
      this.loadError = error;
    }
  }
  snapshot = () => this.value;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  record = (netWords: number) => {
    if (!Number.isSafeInteger(netWords)) return;
    const day = localDay(this.now());
    const previous = this.value.days[day] ?? { netWords: 0, edits: 0 };
    this.value = {
      ...this.value,
      startedOn: day < this.value.startedOn ? day : this.value.startedOn,
      days: {
        ...this.value.days,
        [day]: { netWords: previous.netWords + netWords, edits: previous.edits + 1 },
      },
    };
    for (const listener of this.listeners) listener();
    // Fixed delay, not a debounce: sustained typing is persisted too.
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.flushSafely();
    }, 500);
  };
  flush = async () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.loadError) throw this.loadError;
    this.storage.setItem(writingActivityKey, JSON.stringify(this.value));
  };
  flushSafely = () => {
    void this.flush().catch(this.onError);
  };
  dispose = () => {
    this.flushSafely();
    this.listeners.clear();
  };
}

export function calendarDays(year: number) {
  const first = new Date(year, 0, 1, 12);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const last = new Date(year, 11, 31, 12);
  last.setDate(last.getDate() + ((7 - last.getDay()) % 7));
  const days: string[] = [];
  for (const date = new Date(first); date <= last; date.setDate(date.getDate() + 1))
    days.push(localDay(date));
  return days;
}
