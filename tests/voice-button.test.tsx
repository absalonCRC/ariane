// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('../src/app/client', () => ({ native: true, request }));
import { VoiceButton } from '../src/voice/VoiceButton';

describe('voice gestures and live transcription', () => {
  let root: Root;
  let host: HTMLDivElement;
  let panel: HTMLDivElement;
  let processAudio: ((event: unknown) => void) | null;
  let stopTrack: ReturnType<typeof vi.fn>;
  let insertion: ReturnType<typeof vi.fn<(text: string) => boolean>>;
  let close: ReturnType<typeof vi.fn<() => void>>;
  let now: number;
  let sampleRate: number;
  let getUserMedia: ReturnType<typeof vi.fn>;
  const connect = () => {};

  beforeEach(async () => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    sessionStorage.clear();
    request.mockReset();
    request.mockImplementation(async (type: string) =>
      type === 'voiceStatus'
        ? { available: true }
        : { text: 'Bonjour.', raw: 'Bonjour.', cleaned: true },
    );
    processAudio = null;
    sampleRate = 8_000;
    stopTrack = vi.fn();
    insertion = vi.fn<(text: string) => boolean>(() => true);
    close = vi.fn();
    now = 1_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
    getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack as () => void }] }));
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    });
    class AudioContextMock {
      sampleRate = sampleRate;
      state = 'running';
      destination = {};
      createMediaStreamSource() {
        return { connect };
      }
      createScriptProcessor() {
        return {
          set onaudioprocess(callback: (event: unknown) => void) {
            processAudio = callback;
          },
          connect,
          disconnect() {},
        };
      }
      createGain() {
        return { connect, gain: { value: 1 } };
      }
      resume() {
        return Promise.resolve();
      }
      close() {
        this.state = 'closed';
        return Promise.resolve();
      }
    }
    vi.stubGlobal('AudioContext', AudioContextMock);
    host = document.createElement('div');
    panel = document.createElement('div');
    document.body.append(host, panel);
    root = createRoot(host);
    await act(async () => {
      root.render(
        <VoiceButton
          language="fr"
          prepareInsertion={() => insertion}
          panel={panel}
          open
          onOpen={() => {}}
          onClose={close}
        />,
      );
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    panel.remove();
    sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function pointer(type: string, id = 1) {
    const event = new MouseEvent(type, {
      bubbles: true,
      button: 0,
      detail: type === 'click' ? 1 : 0,
    });
    Object.defineProperty(event, 'pointerId', { value: id });
    host.querySelector('button')!.dispatchEvent(event);
  }

  function audio(level = 0.1) {
    processAudio?.({ inputBuffer: { getChannelData: () => new Float32Array(4096).fill(level) } });
  }

  function shortcut(type: 'keydown' | 'keyup') {
    window.dispatchEvent(
      new KeyboardEvent(type, {
        bubbles: true,
        code: 'KeyM',
        key: 'm',
        metaKey: true,
        shiftKey: true,
      }),
    );
  }

  function transcriptions() {
    return request.mock.calls.filter(([type]) => type === 'voiceTranscribe');
  }

  it('does not open the microphone when native authorization is refused', async () => {
    request.mockImplementation(async (type: string) => {
      if (type === 'voiceStatus') return { available: true };
      if (type === 'voicePermission') throw new Error('Accès au microphone refusé.');
      return {};
    });
    await act(async () => pointer('pointerdown'));
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(panel.textContent).toContain('Accès au microphone refusé.');
    expect(transcriptions()).toHaveLength(0);
  });
  it('does not capture after cancellation while native authorization is pending', async () => {
    let authorize!: () => void;
    request.mockImplementation((type: string) => {
      if (type === 'voiceStatus') return Promise.resolve({ available: true });
      if (type === 'voicePermission')
        return new Promise<void>((resolve) => {
          authorize = resolve;
        });
      return Promise.resolve(true);
    });
    await act(async () => pointer('pointerdown'));
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    await act(async () => authorize());
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(transcriptions()).toHaveLength(0);
  });

  it('starts capture on pointer down, keeps it after a short release, and stops on the next press', async () => {
    await act(async () => pointer('pointerdown'));
    expect(getUserMedia).toHaveBeenCalledOnce();
    await act(async () => {
      audio();
      pointer('pointerup');
    });
    expect(stopTrack).not.toHaveBeenCalled();
    expect(panel.textContent).toContain('Dictée en cours');
    await act(async () => {
      pointer('click');
    });
    expect(getUserMedia).toHaveBeenCalledOnce();
    await act(async () => pointer('pointerdown'));
    expect(stopTrack).toHaveBeenCalledOnce();
    await act(async () => pointer('pointerup'));
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(transcriptions()).toHaveLength(1);
    expect(transcriptions()[0][1]).toEqual(expect.objectContaining({ live: true, language: 'fr' }));
    expect(insertion).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('uses final cleaned transcription for a held pointer and held shortcut', async () => {
    await act(async () => pointer('pointerdown'));
    await act(async () => audio());
    now += 350;
    await act(async () => pointer('pointerup'));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcriptions()[0][1]).toEqual(expect.objectContaining({ live: false }));
    expect(insertion).toHaveBeenCalledWith('Bonjour.');
    await act(async () => shortcut('keydown'));
    await act(async () => audio());
    now += 350;
    await act(async () => shortcut('keyup'));
    expect(stopTrack).toHaveBeenCalledTimes(2);
    expect(transcriptions()[1][1].live).toBe(false);
  });

  it('uses the same short and held gesture rules for the shortcut', async () => {
    await act(async () => shortcut('keydown'));
    await act(async () => shortcut('keyup'));
    expect(stopTrack).not.toHaveBeenCalled();
    await act(async () => audio());
    await act(async () => shortcut('keydown'));
    await act(async () => shortcut('keyup'));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcriptions()[0][1].live).toBe(true);
  });

  it('keeps one permission request for a short press released before permission resolves', async () => {
    let resolve!: (stream: { getTracks: () => { stop: typeof stopTrack }[] }) => void;
    getUserMedia.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await act(async () => pointer('pointerdown'));
    await act(async () => pointer('pointerup'));
    await act(async () => resolve({ getTracks: () => [{ stop: stopTrack }] }));
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(stopTrack).not.toHaveBeenCalled();
    await act(async () => {
      audio();
      pointer('pointerdown');
    });
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcriptions()[0][1].live).toBe(true);
  });

  it('discards a late microphone stream after a held release', async () => {
    let resolve!: (stream: { getTracks: () => { stop: typeof stopTrack }[] }) => void;
    getUserMedia.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await act(async () => pointer('pointerdown'));
    now += 350;
    await act(async () => pointer('pointerup'));
    await act(async () => resolve({ getTracks: () => [{ stop: stopTrack }] }));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcriptions()).toHaveLength(0);
  });

  it('inserts independent live segments in order without inserting them again at stop', async () => {
    let resolveFirst!: (value: Result) => void;
    type Result = { text: string; raw: string; cleaned: boolean };
    let call = 0;
    request.mockImplementation((type: string) => {
      if (type === 'voiceStatus') return Promise.resolve({ available: true });
      if (type !== 'voiceTranscribe') return Promise.resolve(true);
      call++;
      return call === 1
        ? new Promise((resolve) => {
            resolveFirst = resolve;
          })
        : Promise.resolve({ text: 'monde.', raw: 'monde.', cleaned: false });
    });
    await act(async () => {
      pointer('pointerdown');
      pointer('pointerup');
    });
    await act(async () => {
      audio();
      audio();
      audio(0);
    });
    expect(transcriptions()).toHaveLength(1);
    await act(async () => {
      audio(0.2);
      audio(0.2);
      audio(0);
    });
    expect(transcriptions()).toHaveLength(1);
    await act(async () => resolveFirst({ text: 'Bonjour', raw: 'Bonjour', cleaned: false }));
    expect(transcriptions()).toHaveLength(2);
    expect(transcriptions()[0][1].audio).not.toBe(transcriptions()[1][1].audio);
    expect(insertion.mock.calls.map(([text]) => text)).toEqual(['Bonjour', ' monde.']);
    await act(async () => pointer('pointerdown'));
    expect(insertion).toHaveBeenCalledTimes(2);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('retains later live text when the editor changes and does not reinsert earlier text', async () => {
    request.mockImplementation(async (type: string) =>
      type === 'voiceStatus'
        ? { available: true }
        : { text: transcriptions().length === 1 ? 'Premier' : 'Second', raw: '', cleaned: false },
    );
    insertion.mockImplementationOnce(() => true).mockImplementationOnce(() => false);
    await act(async () => {
      pointer('pointerdown');
      pointer('pointerup');
    });
    await act(async () => {
      audio();
      audio();
      audio(0);
    });
    await act(async () => {
      audio();
      audio();
      audio(0);
    });
    expect(insertion.mock.calls.map(([text]) => text)).toEqual(['Premier', ' Second']);
    expect(sessionStorage.getItem('ariane.voice.pending')).toBe('Second');
    await act(async () => pointer('pointerdown'));
    expect(insertion).toHaveBeenCalledTimes(2);
    expect(panel.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('Second');
    expect(close).not.toHaveBeenCalled();
  });

  it('segments a long held recording and retains successful partial text after one failure', async () => {
    sampleRate = 100;
    let call = 0;
    request.mockImplementation(async (type: string) => {
      if (type === 'voiceStatus') return { available: true };
      if (type !== 'voiceTranscribe') return true;
      call++;
      if (call === 2) throw new Error('Transcription interrompue');
      return { text: 'Récupéré', raw: 'Récupéré', cleaned: true };
    });
    await act(async () => pointer('pointerdown'));
    await act(async () => {
      audio();
      audio();
      audio();
      audio();
    });
    now += 350;
    await act(async () => pointer('pointerup'));
    expect(transcriptions()).toHaveLength(2);
    expect(insertion).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('ariane.voice.pending')).toBe('Récupéré');
    expect(panel.textContent).toContain('n’a pas pu être transcrite');
  });

  it('cancels a captured press and ignores a late transcription result', async () => {
    await act(async () => pointer('pointerdown'));
    await act(async () => audio());
    await act(async () => pointer('pointercancel'));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcriptions()).toHaveLength(0);
    expect(insertion).not.toHaveBeenCalled();
  });
  it('a simple accessible click starts continuous mode and the next click stops it immediately', async () => {
    await act(async () => host.querySelector('button')!.click());
    expect(host.querySelector('button')!.getAttribute('aria-label')).toBe('Arrêter la dictée');
    expect(getUserMedia).toHaveBeenCalledOnce();
    await act(async () => host.querySelector('button')!.click());
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });
  it('the first short press waits for model status and does not require another click', async () => {
    let ready!: (value: { available: boolean }) => void;
    request.mockImplementation((type: string) =>
      type === 'voiceStatus'
        ? new Promise((resolve) => {
            ready = resolve;
          })
        : Promise.resolve({ text: 'Bonjour.', raw: 'Bonjour.', cleaned: false }),
    );
    await act(async () =>
      root.render(
        <VoiceButton
          key="waiting-status"
          language="fr"
          prepareInsertion={() => insertion}
          panel={panel}
          open
          onOpen={() => {}}
          onClose={close}
        />,
      ),
    );
    await act(async () => {
      pointer('pointerdown');
      pointer('pointerup');
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    await act(async () => ready({ available: true }));
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(stopTrack).not.toHaveBeenCalled();
    expect(host.querySelector('button')!.getAttribute('aria-label')).toBe('Arrêter la dictée');
  });
  it('stops a held capture if the window loses focus', async () => {
    await act(async () => pointer('pointerdown'));
    await act(async () => audio());
    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(insertion).toHaveBeenCalledWith('Bonjour.');
  });
  it('Escape cancels continuous recording and rejects its outstanding live result', async () => {
    let done!: (result: { text: string; raw: string; cleaned: boolean }) => void;
    request.mockImplementation((type) =>
      type === 'voiceStatus'
        ? Promise.resolve({ available: true })
        : type !== 'voiceTranscribe'
          ? Promise.resolve(true)
          : new Promise((resolve) => {
              done = resolve;
            }),
    );
    await act(async () => {
      pointer('pointerdown');
      pointer('pointerup');
    });
    await act(async () => {
      audio();
      audio();
      audio(0);
    });
    expect(transcriptions()).toHaveLength(1);
    await act(async () =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
    );
    expect(stopTrack).toHaveBeenCalledOnce();
    await act(async () => done({ text: 'Ne pas insérer', raw: 'Ne pas insérer', cleaned: false }));
    expect(insertion).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledOnce();
  });
});
