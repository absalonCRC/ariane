import { markdownPages, plainPages } from './markdownPages';
self.onmessage = (event: MessageEvent<string>) => {
  try {
    self.postMessage(markdownPages(event.data));
  } catch {
    self.postMessage(plainPages(event.data));
  }
};
