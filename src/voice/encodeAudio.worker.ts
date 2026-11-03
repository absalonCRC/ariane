import { wav, base64 } from './wav';
self.onmessage = (event: MessageEvent<{ chunks: Float32Array[]; sampleRate: number }>) => {
  self.postMessage(base64(wav(event.data.chunks, event.data.sampleRate)));
};
