import { useEffect, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { typewriterScrolling } from '../editor/typewriter';
import { smoothCaret } from '../editor/smoothCaret';
import { typewriterStroke } from '../editor/typewriterInput';
import { createTypewriterSound, type TypewriterSound } from '../editor/typewriterSound';
import { t, useLocale } from '../i18n';
import { nextWord, refreshPrediction, type PredictionConfiguration } from '../editor/nextWord';
import { usePredictionPreferences } from '../prediction/usePredictionPreferences';
import type { CapturePreferences, InboxCapture, CaptureSelection } from '../contracts/inbox';
export function CaptureEditor({
  capture,
  onChange,
  onFinish,
  onHide,
  preferences,
  readOnly = false,
  visible = true,
}: {
  capture: InboxCapture;
  onChange: (text: string, selection: CaptureSelection) => void;
  onFinish: () => void;
  onHide: () => void;
  preferences: CapturePreferences;
  readOnly?: boolean;
  visible?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null),
    view = useRef<EditorView | null>(null),
    latest = useRef({ onChange, onFinish, onHide, preferences, readOnly }),
    sound = useRef<TypewriterSound | null>(null),
    options = useRef(new Compartment());
  latest.current = { onChange, onFinish, onHide, preferences, readOnly };
  const language = useLocale();
  const { enabled, distinct, epoch } = usePredictionPreferences();
  const prediction = useRef<PredictionConfiguration | null>(null);
  prediction.current = enabled && visible && !readOnly ? { language, distinct, epoch } : null;
  const configuration = () => [
    EditorState.readOnly.of(latest.current.readOnly),
    EditorView.editable.of(!latest.current.readOnly),
    ...(latest.current.preferences.typewriter ? [typewriterScrolling()] : []),
    EditorView.editorAttributes.of({
      'data-typewriter': String(latest.current.preferences.typewriter),
    }),
  ];
  useEffect(() => {
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: capture.text,
        selection: { anchor: capture.selection.anchor, head: capture.selection.head },
        extensions: [
          history(),
          nextWord(() => prediction.current),
          markdown(),
          EditorView.lineWrapping,
          smoothCaret,
          placeholder(t('Une idée à garder…')),
          options.current.of(configuration()),
          keymap.of([
            {
              key: 'Mod-Enter',
              run: (v) => {
                if (v.composing || latest.current.readOnly) return false;
                latest.current.onFinish();
                return true;
              },
            },
            {
              key: 'Escape',
              run: (v) => {
                if (v.composing) return false;
                latest.current.onHide();
                return true;
              },
            },
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          EditorView.updateListener.of((update) => {
            if (!latest.current.readOnly && (update.docChanged || update.selectionSet)) {
              const selection = update.state.selection.main;
              latest.current.onChange(update.state.doc.toString(), {
                anchor: selection.anchor,
                head: selection.head,
              });
            }
          }),
          EditorView.theme({
            '&': { height: '100%', fontSize: '24px' },
            '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--literary)' },
            '.cm-content': { padding: '24px 32px' },
            '&.cm-focused': { outline: 'none' },
            '.cm-line': { padding: '0' },
          }),
        ],
      }),
    });
    view.current = instance;
    instance.focus();
    return () => {
      view.current = null;
      instance.destroy();
    };
  }, [capture.id]);
  useEffect(() => {
    view.current?.dispatch({ effects: options.current.reconfigure(configuration()) });
  }, [readOnly, preferences.typewriter, capture.id]);
  useEffect(() => {
    view.current?.dispatch({ effects: refreshPrediction.of() });
  }, [enabled, distinct, epoch, visible, readOnly, language]);
  useEffect(() => {
    if (!preferences.sound || !visible) return;
    const audio = createTypewriterSound(preferences.volume);
    sound.current = audio;
    return () => {
      sound.current = null;
      audio.destroy();
    };
  }, [preferences.sound, visible]);
  useEffect(() => {
    sound.current?.setVolume?.(preferences.volume);
  }, [preferences.volume]);
  useEffect(() => {
    let active = true,
      dispose: (() => void) | undefined;
    void import('@tauri-apps/api/event')
      .then(({ listen }) =>
        listen('capture-shown', () => {
          view.current?.requestMeasure();
          view.current?.focus();
        }),
      )
      .then((fn) => {
        if (active) dispose = fn;
        else fn();
      })
      .catch(() => {});
    return () => {
      active = false;
      dispose?.();
    };
  }, []);
  return (
    <div
      onKeyDownCapture={(event) => {
        const instance = view.current;
        if (instance) {
          const stroke = typewriterStroke(event.nativeEvent, instance, latest.current.readOnly);
          if (stroke) sound.current?.play(stroke);
        }
      }}
      ref={host}
      className="capture-editor"
      aria-label={t('Texte de la capture')}
    />
  );
}
