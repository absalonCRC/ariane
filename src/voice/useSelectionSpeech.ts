import { useCallback, useEffect, useRef, useState } from 'react';
import type { EditorHandle } from '../editor/types';
import { request } from '../platform/client';
import { registerWindowFlusher } from '../platform/windowFlush';
import { readingSegments, wordTimings } from './readingSegments';
import type { ReadingSegment } from './readingSegments';

interface Playback {
  id: string;
  audio: AudioContext;
  release: () => void;
  endSegment?: () => void;
}

export function useSelectionSpeech(
  editor: React.RefObject<EditorHandle | null>,
  language: string,
  context: string,
  fail: (e: unknown) => void,
) {
  const active = useRef<Playback | null>(null);
  const controls = useRef<Promise<unknown>>(Promise.resolve());
  const [reading, setReading] = useState(false);
  const control = useCallback((id: string, running: boolean) => {
    controls.current = controls.current
      .catch(() => {})
      .then(() => request('selectionSpeech', { id, active: running }));
    return controls.current;
  }, []);
  const stop = useCallback(async () => {
    const old = active.current;
    if (!old) {
      await controls.current;
      return;
    }
    active.current = null;
    setReading(false);
    old.release();
    old.endSegment?.();
    await Promise.all([old.audio.close(), control(old.id, false)]);
  }, [control]);
  useEffect(
    () => () => {
      void stop().catch(fail);
    },
    [context, language, stop, fail],
  );
  useEffect(() => registerWindowFlusher(stop), [stop]);
  useEffect(() => {
    if (!reading) return;
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      void stop().catch(fail);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [reading, stop, fail]);

  async function toggle() {
    if (active.current) {
      await stop().catch(fail);
      return;
    }
    const passage = editor.current?.captureSpeech(() => {
      void stop().catch(fail);
    });
    if (!passage) return;
    let session: Playback | undefined;
    try {
      const chunks = readingSegments(passage.text, language);
      const first = chunks.next();
      if (first.done) {
        passage.release();
        return;
      }
      const audio = new AudioContext();
      const id = crypto.randomUUID();
      session = { id, audio, release: passage.release };
      active.current = session;
      setReading(true);
      await Promise.all([audio.resume(), control(id, true)]);
      if (active.current !== session) return;
      const render = async (chunk: ReadingSegment) => {
        const data = await request('selectionAudio', { id, language, text: chunk.text });
        if (active.current !== session) return;
        const bytes = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
        return {
          buffer: await audio.decodeAudioData(bytes.buffer),
          words: wordTimings(chunk, language, data.tokens),
        };
      };
      let next = render(first.value);
      while (active.current === session) {
        const clip = await next;
        if (!clip || active.current !== session) break;
        const source = audio.createBufferSource();
        source.buffer = clip.buffer;
        source.connect(audio.destination);
        const startTime = audio.currentTime;
        let cursor = 0,
          frame = 0;
        const update = () => {
          const now = (audio.currentTime - startTime) * 1000;
          while (cursor < clip.words.length && clip.words[cursor].ms <= now) {
            const word = clip.words[cursor++];
            passage.mark(word.from, word.length);
          }
          frame = requestAnimationFrame(update);
        };
        const playing = new Promise<void>((resolve) => {
          session!.endSegment = () => {
            source.onended = null;
            source.stop();
            source.disconnect();
            cancelAnimationFrame(frame);
            resolve();
          };
          source.onended = session!.endSegment;
        });
        source.start(startTime);
        update();
        const following = chunks.next();
        if (!following.done) {
          next = render(following.value);
          // Playback owns this promise until the current clip ends.
          void next.catch(() => {});
        }
        await playing;
        session.endSegment = undefined;
        if (active.current === session) passage.clear();
        if (following.done) break;
      }
    } catch (e) {
      if (!session || active.current === session) fail(e);
    } finally {
      if (!session) passage.release();
      else if (active.current === session) await stop().catch(fail);
    }
  }
  return { reading, toggle, stop };
}
