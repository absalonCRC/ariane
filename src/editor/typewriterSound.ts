import key1 from './sounds/key1.wav';
import key2 from './sounds/key2.wav';
import key3 from './sounds/key3.wav';
import space from './sounds/space.wav';
import carriageReturn from './sounds/return.wav';

export type TypewriterStroke = 'key' | 'space' | 'delete' | 'return';
export interface TypewriterSound {
  play: (stroke: TypewriterStroke) => void;
  destroy: () => void;
}

// Decode once per enabled session so fast keystrokes can overlap without restarting a sound.
export function createTypewriterSound(): TypewriterSound {
  const silent: TypewriterSound = { play: () => {}, destroy: () => {} };
  let context: AudioContext;
  try {
    context = new AudioContext();
  } catch {
    return silent;
  }
  let disposed = false;
  let lastKey = -1;
  let pending: { stroke: TypewriterStroke; time: number } | null = null;
  const sources = new Set<AudioBufferSourceNode>();
  const buffers: (AudioBuffer | null)[] = [];
  const urls = [key1, key2, key3, space, carriageReturn];
  const ready = Promise.all(
    urls.map(async (url, index) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!disposed) buffers[index] = buffer;
      } catch {
        // Audio is optional: a missing device or sound file must never interrupt writing.
      }
    }),
  );
  const play = (stroke: TypewriterStroke) => {
    if (disposed) return;
    if (context.state === 'suspended') void context.resume().catch(() => {});
    let index: number;
    if (stroke === 'return') index = 4;
    else if (stroke === 'space') index = 3;
    else {
      // Pick a different mechanical strike from the last one, even on a repeated key.
      index = Math.floor(Math.random() * (lastKey < 0 ? 3 : 2));
      if (lastKey >= 0 && index >= lastKey) index++;
      lastKey = index;
    }
    const buffer = buffers[index];
    if (!buffer) {
      pending = { stroke, time: Date.now() };
      return;
    }
    pending = null;
    try {
      const source = context.createBufferSource();
      const gain = context.createGain();
      source.buffer = buffer;
      source.playbackRate.value = stroke === 'key' ? 0.99 + Math.random() * 0.02 : 1;
      // The carriage is intentionally more prominent than ordinary keystrokes.
      gain.gain.value = stroke === 'return' ? 0.8 : stroke === 'space' ? 0.18 : 0.4;
      source.connect(gain);
      gain.connect(context.destination);
      sources.add(source);
      source.onended = () => {
        sources.delete(source);
        source.disconnect();
        gain.disconnect();
      };
      source.start();
    } catch {
      // Losing the audio device should not affect the editor.
    }
  };
  void ready.then(() => {
    const waiting = pending;
    pending = null;
    if (waiting && Date.now() - waiting.time < 250) play(waiting.stroke);
  });
  return {
    play,
    destroy: () => {
      disposed = true;
      pending = null;
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          /* Already stopped. */
        }
      }
      sources.clear();
      void context.close().catch(() => {});
    },
  };
}
