import type { RuntimeModule } from '../contracts/runtimeModules';
export const voices = {
  fr: { id: 'readingFr', name: 'Estelle', language: 'Français', mb: 227 },
  en: { id: 'readingEn', name: 'Alba', language: 'English', mb: 226 },
  es: { id: 'readingEs', name: 'Lola', language: 'Español', mb: 225 },
} as const;
export type VoiceLanguage = keyof typeof voices;
export type ReadingPreference = VoiceLanguage | 'auto';
export function voiceLanguage(value: string): VoiceLanguage | undefined {
  const code = value.toLowerCase().split(/[-_]/)[0];
  return code === 'fr' || code === 'en' || code === 'es' ? code : undefined;
}
export const choices = {
  voice: ['Dictée locale', 'Parakeet', 637],
  cleanup: ['Mise en forme de la dictée', 'Cleanup 1', 639],
  memory: ['Reconnaissance des entités', 'GLiNER2', 1249],
  revision: ['Grammaire et orthographe', 'LanguageTool', 298],
  salamandra: ['Révision du style', 'SalamandraTA', 2401],
} as const;
export type OptionalTool = keyof typeof choices;

export type ModelNoticeKey = 'reading' | RuntimeModule;
export type ModelNotice = {
  key: ModelNoticeKey;
  id: RuntimeModule;
  preference?: ReadingPreference;
  error?: string;
};
export function languageOf(id: RuntimeModule): VoiceLanguage | undefined {
  return (Object.keys(voices) as VoiceLanguage[]).find((key) => voices[key].id === id);
}
