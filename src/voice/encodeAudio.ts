import { wav, base64 } from './wav';
export function encodeAudio(chunks: Float32Array[], sampleRate: number): Promise<string> {
  if (typeof Worker === 'undefined') return Promise.resolve(base64(wav(chunks, sampleRate)));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./encodeAudio.worker.ts', import.meta.url), {
      type: 'module',
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error('Encodage audio trop long.'));
    }, 30_000);
    worker.onmessage = (event: MessageEvent<string>) => {
      clearTimeout(timer);
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = () => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error('Encodage audio indisponible.'));
    };
    worker.postMessage(
      { chunks, sampleRate },
      chunks.map((chunk) => chunk.buffer as ArrayBuffer),
    );
  });
}
