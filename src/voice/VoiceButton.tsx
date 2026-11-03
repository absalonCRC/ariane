import { encodeAudio } from './encodeAudio';
import captureWorklet from './capture.worklet.js?url';
import { localizeMessage, t, useLocale } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Mic } from 'lucide-react';
import { native, request } from '../app/client';
import { audioLevel, recordingTime } from './waveform';
import { useExitPresence } from '../components/useExitPresence';

type Phase = 'idle' | 'preparing' | 'recording' | 'transcribing';
type Result = { text: string; raw: string; cleaned: boolean };
type Part = { result?: Result; error?: unknown };
type Mode = 'press' | 'continuous';
const pendingKey = 'ariane.voice.pending';
const shortPressMs = 280;

type Session = {
  mode: Mode;
  active: boolean;
  cancelled: boolean;
  chunks: Float32Array[];
  segmentSamples: number;
  speechSamples: number;
  silenceSamples: number;
  queue: Promise<void>;
  parts: Part[];
  stream?: MediaStream;
  context?: AudioContext;
  processor?: AudioNode;
  flushAudio?: () => Promise<void>;
  language: string;
  samples: number;
  sampleRate?: number;
  lastFrame: number;
  insertion: (text: string) => boolean;
  inserted: number;
  insertionBlocked: boolean;
  failed: boolean;
};

function release(current: Session) {
  current.processor?.disconnect();
  current.stream?.getTracks().forEach((track) => track.stop());
  if (current.context && current.context.state !== 'closed')
    void current.context.close().catch(() => {});
  current.processor = undefined;
  current.stream = undefined;
  current.context = undefined;
}

export function VoiceButton({
  language,
  prepareInsertion,
  panel,
  open,
  onOpen,
  onClose,
  retainContent = false,
  onActivity,
}: {
  language: string;
  prepareInsertion: () => (text: string) => boolean;
  panel: HTMLElement | null;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  retainContent?: boolean;
  onActivity?: (active: boolean) => void;
}) {
  useLocale();
  const [phase, setPhase] = useState<Phase>('idle');
  const activityCallback = useRef(onActivity);
  activityCallback.current = onActivity;
  useEffect(() => {
    activityCallback.current?.(phase !== 'idle');
  }, [phase]);
  useEffect(() => () => activityCallback.current?.(false), []);
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState('');
  const [lastText, setLastText] = useState('');
  const [levels, setLevels] = useState<number[]>(() => Array(26).fill(0));
  const [seconds, setSeconds] = useState(0);
  const [mode, setMode] = useState<Mode>('press');
  const session = useRef<Session | null>(null);
  const press = useRef<{ id: string | number; at: number; stopped: boolean } | null>(null);
  const finishing = useRef(false);
  const alive = useRef(true);
  const available = useRef<boolean | null>(null);
  const availability = useRef<Promise<boolean> | null>(null);
  const present = useExitPresence(open, retainContent);

  function recover(text: string) {
    const existing = sessionStorage.getItem(pendingKey)?.trim() ?? '';
    const updated = [existing, text.trim()].filter(Boolean).join(' ');
    if (!updated) return;
    sessionStorage.setItem(pendingKey, updated);
    if (alive.current) setPending(updated);
    else window.dispatchEvent(new Event('ariane:voice-pending'));
  }

  function queuePart(current: Session, sampleRate: number) {
    if (!current.chunks.length) return;
    const chunks = current.chunks;
    current.chunks = [];
    current.segmentSamples = 0;
    current.speechSamples = 0;
    current.silenceSamples = 0;
    // The queue owns a fresh PCM snapshot, so capture can continue during transcription.
    current.queue = current.queue.then(async () => {
      if (current.cancelled) return;
      try {
        const audio = await encodeAudio(chunks, sampleRate);
        if (current.cancelled) return;
        const result = await request<Result>('voiceTranscribe', {
          audio,
          language: current.language,
          live: current.mode === 'continuous',
        });
        if (current.cancelled) return;
        if (current.mode === 'press') {
          current.parts.push({ result });
          return;
        }
        const text = result.text.trim();
        if (!text) return;
        if (alive.current) setLastText(text);
        if (current.insertionBlocked || !alive.current) {
          recover(text);
        } else if (current.insertion(`${current.inserted ? ' ' : ''}${text}`)) {
          current.inserted++;
        } else {
          current.insertionBlocked = true;
          recover(text);
        }
      } catch (error) {
        if (!current.cancelled) {
          current.failed = true;
          current.parts.push({ error });
          if (alive.current) setMessage(t('Une partie de la dictée n’a pas pu être transcrite.'));
        }
      }
    });
  }

  useEffect(() => {
    alive.current = true;
    const restorePending = () => {
      const text = sessionStorage.getItem(pendingKey);
      if (text) {
        setPending(text);
        setMessage(t('Le texte a changé pendant la dictée. Copiez la transcription ci-dessous.'));
      }
    };
    restorePending();
    window.addEventListener('ariane:voice-pending', restorePending);
    if (native)
      availability.current = request<{ available: boolean }>('voiceStatus')
        .then((status) => {
          available.current = status.available;
          return status.available;
        })
        .catch(() => {
          available.current = false;
          return false;
        });
    return () => {
      alive.current = false;
      window.removeEventListener('ariane:voice-pending', restorePending);
      if (session.current) {
        session.current.cancelled = true;
        session.current.active = false;
        release(session.current);
      }
    };
  }, []);

  async function begin(mode: Mode = 'press') {
    if (session.current || finishing.current || pending) return;
    onOpen();
    setMessage('');
    setLastText('');
    setLevels(Array(26).fill(0));
    setSeconds(0);
    if (!native) {
      setMessage(t('La dictée est disponible dans l’application macOS.'));
      return;
    }
    if (available.current === false) {
      setMessage(t('Les modèles de dictée locale ne sont pas disponibles.'));
      return;
    }
    const current: Session = {
      mode,
      active: true,
      cancelled: false,
      chunks: [],
      segmentSamples: 0,
      speechSamples: 0,
      silenceSamples: 0,
      queue: Promise.resolve(),
      parts: [],
      insertion: prepareInsertion(),
      language,
      samples: 0,
      lastFrame: 0,
      inserted: 0,
      insertionBlocked: false,
      failed: false,
    };
    session.current = current;
    setMode(mode);
    setPhase('preparing');
    try {
      const ready = available.current ?? (await availability.current);
      if (!current.active || current.cancelled || session.current !== current) return;
      if (!ready) throw new Error(t('Les modèles de dictée locale ne sont pas disponibles.'));
      if (!navigator.mediaDevices?.getUserMedia) throw new Error(t('Microphone indisponible.'));
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
        video: false,
      });
      if (!current.active || current.cancelled || session.current !== current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      current.stream = stream;
      const context = new AudioContext();
      current.context = context;
      current.sampleRate = context.sampleRate;
      const source = context.createMediaStreamSource(stream);
      const silence = context.createGain();
      silence.gain.value = 0;
      const acceptAudio = (chunk: Float32Array) => {
        if (!current.active || current.cancelled) return;
        current.chunks.push(chunk);
        current.samples += chunk.length;
        current.segmentSamples += chunk.length;
        const level = audioLevel(chunk);
        const now = performance.now();
        if (now - current.lastFrame >= 80) {
          current.lastFrame = now;
          if (alive.current) {
            setLevels((previous) => [...previous.slice(1), level]);
            setSeconds(current.samples / context.sampleRate);
          }
        }
        if (current.mode === 'continuous') {
          if (level >= 0.075) {
            current.speechSamples += chunk.length;
            current.silenceSamples = 0;
          } else if (current.speechSamples) {
            current.silenceSamples += chunk.length;
          }
          const pause = current.silenceSamples >= context.sampleRate * 0.4;
          const longEnough = current.segmentSamples >= context.sampleRate * 0.7;
          const maximum = current.segmentSamples >= context.sampleRate * 3.5;
          if ((pause && longEnough && current.speechSamples) || maximum) {
            if (current.speechSamples) queuePart(current, context.sampleRate);
            else {
              current.chunks = [];
              current.segmentSamples = 0;
            }
          }
        } else if (
          current.segmentSamples >= Math.min(context.sampleRate * 90, (19 * 1024 * 1024 - 44) / 2)
        ) {
          queuePart(current, context.sampleRate);
        }
      };
      let processor: AudioNode;
      if (context.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
        await context.audioWorklet.addModule(captureWorklet);
        const capture = new AudioWorkletNode(context, 'ariane-capture');
        let flushed: (() => void) | undefined;
        capture.port.onmessage = (event: MessageEvent<Float32Array | 'flushed'>) => {
          if (event.data === 'flushed') flushed?.();
          else acceptAudio(event.data);
        };
        current.flushAudio = () =>
          new Promise((resolve, reject) => {
            const timeout = setTimeout(
              () => reject(new Error('La fin de l’enregistrement est indisponible.')),
              1000,
            );
            flushed = () => {
              clearTimeout(timeout);
              resolve();
            };
            capture.port.postMessage('flush');
          });
        processor = capture;
      } else {
        const legacy = context.createScriptProcessor(4096, 1, 1);
        legacy.onaudioprocess = (event) =>
          acceptAudio(new Float32Array(event.inputBuffer.getChannelData(0)));
        processor = legacy;
      }
      current.processor = processor;
      if (!current.active || current.cancelled) {
        release(current);
        return;
      }
      source.connect(processor);
      processor.connect(silence);
      silence.connect(context.destination);
      await context.resume();
      if (!current.active || current.cancelled || session.current !== current) {
        if (current.context === context) release(current);
        return;
      }
      setPhase('recording');
    } catch (error) {
      release(current);
      if (session.current === current) session.current = null;
      if (current.active && alive.current) {
        setMessage(error instanceof Error ? error.message : String(error));
        setPhase('idle');
      }
    }
  }

  async function stop(cancel = false) {
    const current = session.current;
    if (!current) return;
    current.cancelled = cancel;
    session.current = null;
    finishing.current = true;
    if (!cancel && current.flushAudio) {
      try {
        await current.flushAudio();
      } catch (error) {
        current.failed = true;
        current.parts.push({ error });
      }
    }
    current.active = false;
    setMode('press');
    const sampleRate = current.sampleRate;
    release(current);
    if (cancel || !sampleRate) {
      finishing.current = false;
      if (alive.current) setPhase('idle');
      if (!cancel && alive.current) onClose();
      return;
    }
    finishing.current = true;
    if (alive.current) setPhase('transcribing');
    if (current.chunks.length) {
      if (current.mode === 'press' || current.speechSamples) queuePart(current, sampleRate);
      else current.chunks = [];
    }
    await current.queue;
    if (current.mode === 'press') {
      const text = current.parts
        .map((part) => part.result?.text?.trim())
        .filter(Boolean)
        .join(' ');
      if (current.failed) {
        recover(text);
      } else if (!text) {
        if (alive.current) onClose();
      } else if (!alive.current || !current.insertion(text)) {
        current.insertionBlocked = true;
        recover(text);
        if (alive.current)
          setMessage(t('Le texte a changé pendant la dictée. Copiez la transcription ci-dessous.'));
      }
    }
    if (alive.current) {
      if (current.failed) setMessage(t('Une partie de la dictée n’a pas pu être transcrite.'));
      else if (current.insertionBlocked)
        setMessage(t('Le texte a changé pendant la dictée. Copiez la transcription ci-dessous.'));
      else if (current.mode === 'continuous') onClose();
      else if (current.parts.some((part) => part.result?.text?.trim())) onClose();
      setPhase('idle');
    }
    finishing.current = false;
  }

  function startPress(id: string | number) {
    if (press.current) return;
    const at = Date.now();
    if (session.current?.mode === 'continuous') {
      press.current = { id, at, stopped: true };
      void stop();
      return;
    }
    if (session.current || finishing.current) return;
    press.current = { id, at, stopped: false };
    void begin();
  }

  function endPress(id: string | number) {
    const currentPress = press.current;
    if (!currentPress || currentPress.id !== id) return;
    press.current = null;
    if (currentPress.stopped) return;
    const current = session.current;
    if (!current) return;
    if (Date.now() - currentPress.at < shortPressMs) {
      current.mode = 'continuous';
      setMode('continuous');
      // Audio captured between down and up belongs to the first live segment.
      current.speechSamples = current.chunks.reduce(
        (sum, chunk) => sum + (audioLevel(chunk) >= 0.075 ? chunk.length : 0),
        0,
      );
    } else void stop();
  }

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'm' || !(event.metaKey || event.ctrlKey) || !event.shiftKey)
        return;
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) startPress('shortcut');
    };
    const up = (event: KeyboardEvent) => {
      if (press.current?.id !== 'shortcut') return;
      if (
        event.key.toLowerCase() !== 'm' &&
        ![
          'MetaLeft',
          'MetaRight',
          'ControlLeft',
          'ControlRight',
          'ShiftLeft',
          'ShiftRight',
        ].includes(event.code)
      )
        return;
      event.preventDefault();
      endPress('shortcut');
    };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  });

  useEffect(() => {
    if (!open && session.current) void stop();
  }, [open]);

  useEffect(() => {
    const blur = () => {
      press.current = null;
      if (session.current?.mode === 'press') void stop();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !session.current) return;
      event.preventDefault();
      event.stopPropagation();
      press.current = null;
      void stop(true);
      onClose();
    };
    window.addEventListener('blur', blur);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.removeEventListener('blur', blur);
      window.removeEventListener('keydown', escape, true);
    };
  });

  return (
    <div className="voice-control" data-phase={phase} data-open={open}>
      <button
        className="voice-trigger"
        aria-label={mode === 'continuous' ? t('Arrêter la dictée') : t('Dicter')}
        aria-expanded={open}
        aria-controls="bottom-writing-panel"
        data-hint={t('Clic : dicter · maintenir : parler · ⌘ ⇧ M')}
        aria-description={t(
          'Clic : démarrer ou arrêter. Maintenir : dicter pendant l’appui. ⌘ ⇧ M',
        )}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          try {
            event.currentTarget.setPointerCapture?.(event.pointerId);
          } catch {
            /* unsupported */
          }
          startPress(event.pointerId);
        }}
        onPointerUp={(event) => endPress(event.pointerId)}
        onPointerCancel={(event) => {
          if (press.current?.id !== event.pointerId) return;
          press.current = null;
          void stop(true);
        }}
        onClick={(event) => {
          if (event.detail !== 0) return;
          if (session.current?.mode === 'continuous') void stop();
          else void begin('continuous');
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            void stop(true);
            onClose();
          } else if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
            event.preventDefault();
            startPress(event.key);
          }
        }}
        onKeyUp={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            endPress(event.key);
          }
        }}
      >
        <Mic size={15} />
      </button>
      {panel &&
        present &&
        createPortal(
          <div
            key={phase}
            className={'voice-content' + (pending ? ' voice-pending' : '')}
            data-visible={open}
            role="status"
          >
            {phase === 'preparing' ? (
              t('Préparation…')
            ) : phase === 'recording' ? (
              <>
                <div className="voice-waveform" aria-hidden="true">
                  {levels.map((level, index) => (
                    <span key={index} style={{ height: `${3 + level * 20}px` }} />
                  ))}
                </div>
                <span
                  className="voice-time"
                  role="timer"
                  aria-label={t('Durée de l’enregistrement')}
                >
                  {recordingTime(seconds)}
                </span>
                <span>{t('Dictée en cours')}</span>
                {lastText && (
                  <span className="voice-last-text" aria-live="polite">
                    {lastText}
                  </span>
                )}
              </>
            ) : phase === 'transcribing' ? (
              t('Transcription…')
            ) : (
              localizeMessage(message) || t('Clic pour dicter · maintenir pour parler')
            )}
            {pending && (
              <textarea
                aria-label={t('Transcription à copier')}
                readOnly
                value={pending}
                onFocus={(event) => event.currentTarget.select()}
              />
            )}
            {phase === 'idle' && (
              <button
                aria-label={t('Fermer')}
                onClick={() => {
                  setMessage('');
                  setPending('');
                  sessionStorage.removeItem(pendingKey);
                  onClose();
                }}
              >
                ×
              </button>
            )}
          </div>,
          panel,
        )}
    </div>
  );
}
