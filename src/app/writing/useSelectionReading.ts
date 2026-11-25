import type { RefObject } from 'react';
import { native } from '../../platform/client';
import type { EditorHandle } from '../../editor/types';
import { useSelectionSpeech } from '../../voice/useSelectionSpeech';
import { useRuntimeModels } from '../runtimeModels';
import { voiceLanguage, voices } from '../modelCatalog';

export function useSelectionReading(
  editor: RefObject<EditorHandle | null>,
  language: string,
  context: string,
  fail: (error: unknown) => void,
) {
  const catalog = useRuntimeModels()!;
  const readingLanguage =
    catalog.preferred === 'auto' ? voiceLanguage(language) : catalog.preferred;
  const hasVoice =
    readingLanguage && catalog.status?.installed.includes(voices[readingLanguage].id);
  const speech = useSelectionSpeech(editor, readingLanguage ?? 'fr', context, fail);
  function listen() {
    if (speech.reading || hasVoice) {
      void speech.toggle();
      return;
    }
    catalog.offer({
      key: 'reading',
      id: voices[readingLanguage ?? 'fr'].id,
      preference: readingLanguage ? catalog.preferred : 'fr',
    });
  }
  return {
    stop: speech.stop,
    toolbar: {
      onListen: native ? listen : undefined,
      needsVoice: native && !hasVoice,
      reading: speech.reading,
    },
  };
}
