// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createTypewriterSound } from '../src/editor/typewriterSound';

afterEach(() => vi.unstubAllGlobals());

it('decodes local sounds once, overlaps keystrokes, emphasizes the return and stops on cleanup', async () => {
  const nodes: {
    start: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
    playbackRate: { value: number };
    buffer: unknown;
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onended: (() => void) | null;
  }[] = [];
  const gains: {
    gain: { value: number };
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }[] = [];
  const context = {
    state: 'suspended',
    destination: {},
    resume: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    decodeAudioData: vi.fn(async () => ({})),
    createBufferSource: vi.fn(() => {
      const node = {
        start: vi.fn(),
        stop: vi.fn(),
        playbackRate: { value: 1 },
        buffer: null,
        connect: vi.fn(),
        disconnect: vi.fn(),
        onended: null,
      };
      nodes.push(node);
      return node;
    }),
    createGain: vi.fn(() => {
      const gain = { gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() };
      gains.push(gain);
      return gain;
    }),
  };
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      return context;
    }),
  );
  const fetcher = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }));
  vi.stubGlobal('fetch', fetcher);
  const sound = createTypewriterSound();
  await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledTimes(5));
  sound.play('key');
  sound.play('key');
  sound.play('return');
  expect(fetcher).toHaveBeenCalledTimes(5);
  expect(nodes).toHaveLength(3);
  expect(nodes.every((node) => node.start.mock.calls.length === 1)).toBe(true);
  expect(gains[2].gain.value).toBeGreaterThan(gains[0].gain.value);
  expect(context.resume).toHaveBeenCalled();
  sound.destroy();
  expect(nodes.every((node) => node.stop.mock.calls.length === 1)).toBe(true);
  expect(context.close).toHaveBeenCalledOnce();
  sound.play('key');
  expect(nodes).toHaveLength(3);
});

it('keeps writing usable if audio is unavailable', () => {
  vi.stubGlobal(
    'AudioContext',
    vi.fn(function () {
      throw new Error('unavailable');
    }),
  );
  const sound = createTypewriterSound();
  expect(() => {
    sound.play('key');
    sound.destroy();
  }).not.toThrow();
});
