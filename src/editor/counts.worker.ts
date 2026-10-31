import { measureText, type CountJob } from './countMetrics';
self.onmessage = (event: MessageEvent<CountJob[]>) => {
  self.postMessage(event.data.map(measureText));
};
