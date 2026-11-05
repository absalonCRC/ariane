import { useVoiceSession, pendingKey } from './useVoiceSession';
import type { VoiceButtonProps } from './types';
import { localizeMessage, t } from '../i18n';
import { createPortal } from 'react-dom';
import { Mic } from 'lucide-react';
import { recordingTime } from './waveform';
export function VoiceButton(props: VoiceButtonProps) {
  const { panel, open, onClose } = props;
  const {
    phase,
    message,
    setMessage,
    pending,
    setPending,
    rawText,
    nameCandidates,
    lastText,
    levels,
    seconds,
    mode,
    session,
    press,
    present,
    begin,
    stop,
    startPress,
    endPress,
  } = useVoiceSession(props);
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
            {nameCandidates.length > 0 && (
              <span className="voice-last-text">
                {t('Noms à vérifier')} : {nameCandidates.join(', ')}
              </span>
            )}
            {rawText && (
              <details>
                <summary>{t('Transcription originale')}</summary>
                <textarea
                  aria-label={t('Transcription originale')}
                  readOnly
                  value={rawText}
                  onFocus={(event) => event.currentTarget.select()}
                />
              </details>
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
