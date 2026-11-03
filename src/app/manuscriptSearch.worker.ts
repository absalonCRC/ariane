import { ManuscriptSearch, type SearchLabels, type SearchSection } from './projectSearch';
const engine = new ManuscriptSearch();
let timer: ReturnType<typeof setTimeout> | undefined;
self.onmessage = (
  event: MessageEvent<{
    id: number;
    changes: SearchSection[];
    removed: string[];
    query: string;
    labels: SearchLabels;
  }>,
) => {
  const message = event.data;
  engine.sync(message.changes, message.removed);
  clearTimeout(timer);
  // Drain already queued edits/queries before starting another search.
  timer = setTimeout(() => {
    self.postMessage({ id: message.id, result: engine.search(message.query, message.labels) });
  }, 0);
};
