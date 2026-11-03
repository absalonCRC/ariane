import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { base64, wav } from '../src/voice/wav';

describe('audio capture and encoding', () => {
  it('preserves PCM order and flushes the partial block before acknowledging stop', () => {
    const messages: (Float32Array | string)[] = [];
    const port = {
      onmessage: null as null | ((event: { data: string }) => void),
      postMessage: (value: Float32Array | string) => {
        messages.push(typeof value === 'string' ? value : new Float32Array(value));
      },
    };
    let Capture: new () => { process(inputs: Float32Array[][]): boolean };
    runInNewContext(
      readFileSync(new URL('../src/voice/capture.worklet.js', import.meta.url), 'utf8'),
      {
        AudioWorkletProcessor: class {
          port = port;
        },
        registerProcessor: (_name: string, implementation: typeof Capture) => {
          Capture = implementation;
        },
      },
    );
    const capture = new Capture!();
    const expected = Float32Array.from({ length: 9216 }, (_, i) => Math.sin(i / 31) * 0.7);
    for (let i = 0; i < expected.length; i += 128)
      expect(capture.process([[expected.slice(i, i + 128)]])).toBe(true);
    expect(messages).toHaveLength(2);
    port.onmessage!({ data: 'flush' });
    expect(messages.at(-1)).toBe('flushed');
    const chunks = messages.slice(0, -1) as Float32Array[];
    expect(chunks.map((chunk) => chunk.length)).toEqual([4096, 4096, 1024]);
    expect(chunks.flatMap((chunk) => Array.from(chunk))).toEqual(Array.from(expected));
    expect(capture.process([[expected.slice(0, 128)]])).toBe(false);
    expect(messages).toHaveLength(4);
  });

  it('encodes bounded signed PCM with the original rate, including the final samples', () => {
    const samples = [-2, -1, -0.5, 0, 0.5, 1, 2];
    const buffer = wav(
      [new Float32Array(samples.slice(0, 3)), new Float32Array(samples.slice(3))],
      48000,
    );
    const view = new DataView(buffer);
    expect(view.getUint32(24, true)).toBe(48000);
    expect(view.getUint32(40, true)).toBe(samples.length * 2);
    expect(samples.map((_, i) => view.getInt16(44 + i * 2, true))).toEqual([
      -32768, -32768, -16384, 0, 16383, 32767, 32767,
    ]);
    expect(Buffer.from(base64(buffer), 'base64')).toEqual(Buffer.from(buffer));
  });
});
