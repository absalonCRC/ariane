import { useTheme } from '../app/useTheme';
import type { InboxChange } from '../contracts/inbox';
import { useCallback, useEffect, useState } from 'react';
import { native, request } from '../platform/client';
import { useWindowLifecycle } from '../platform/useWindowLifecycle';
import { WindowDragRegion } from '../components/WindowDragRegion';
import { t, localizeMessage, useLocale, setLocale, savedLocale } from '../i18n';
import { useCaptureDraft } from './useCaptureDraft';
import { useCapturePreferences, loadCapturePreferences } from './preferences';
import { CaptureEditor } from './CaptureEditor';
export function CaptureApp() {
  useTheme();
  useLocale();
  if (native) return <NativeCapture />;
  return (
    <main className="welcome">
      <div className="welcome-intro">
        <h1>{t('Capture rapide')}</h1>
        <p>{t('La capture globale est disponible dans l’application macOS.')}</p>
        <div className="welcome-actions">
          <a href="./">{t('Accueil')}</a>
        </div>
      </div>
    </main>
  );
}

function NativeCapture() {
  const [error, setError] = useState(''),
    [visible, setVisible] = useState(false);
  const fail = useCallback((e: unknown) => setError(localizeMessage(e)), []);
  const buffer = useCaptureDraft(fail),
    preferences = useCapturePreferences();
  const suspended = useWindowLifecycle(buffer.flush, fail);
  useEffect(() => {
    let active = true;
    const cleanups: (() => void)[] = [];
    const add = (fn: () => void) => {
      if (active) cleanups.push(fn);
      else fn();
    };
    void import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        add(
          await listen<InboxChange>('inbox-changed', (e) => {
            if (e.payload.kind === 'preferences' || e.payload.kind === 'restore')
              void loadCapturePreferences().catch(fail);
          }),
        );
        add(
          await listen('inbox-restored', () => {
            void buffer.reload().catch(fail);
          }),
        );
        add(
          await listen('capture-shown', () => {
            setVisible(true);
            setLocale(savedLocale());
            void loadCapturePreferences().catch(fail);
          }),
        );
        add(
          await listen('app-flush-complete', () => {
            void import('@tauri-apps/api/window')
              .then(({ getCurrentWindow }) => getCurrentWindow().isVisible())
              .then(setVisible);
          }),
        );
      })
      .catch(fail);
    const blur = () => void buffer.flush().catch(fail);
    window.addEventListener('blur', blur);
    void import('@tauri-apps/api/window')
      .then(({ getCurrentWindow }) => getCurrentWindow().isVisible())
      .then(setVisible)
      .catch(fail);
    void loadCapturePreferences().catch(fail);
    return () => {
      active = false;
      cleanups.forEach((fn) => fn());
      window.removeEventListener('blur', blur);
    };
  }, []);
  const hide = () => {
    void request('appClose', { action: 'hide-capture' }).catch(fail);
  };
  return (
    <main className="capture-app" data-visible={visible}>
      <WindowDragRegion onError={fail} />
      <header className="capture-header">
        <span className="capture-capsule" role={error ? 'alert' : 'status'}>
          {error ? (
            <>
              {error}
              <button
                onClick={() =>
                  void (buffer.draft?.uncertainFinish ? buffer.finish() : buffer.flush())
                    .then(() => setError(''))
                    .catch(fail)
                }
              >
                {t('Réessayer')}
              </button>
            </>
          ) : (
            t(buffer.status || 'Capture rapide')
          )}
        </span>
        <button
          disabled={suspended || buffer.busy}
          onClick={() => void request('captureWindow', { action: 'inbox' }).catch(fail)}
        >
          {t('Boîte de réception')}
        </button>
        <button
          disabled={!buffer.draft || buffer.busy || suspended}
          onClick={() => {
            setError('');
            void buffer.finish().catch(fail);
          }}
        >
          {t('Terminer')}
        </button>
      </header>
      {buffer.draft && (
        <CaptureEditor
          capture={buffer.draft.capture}
          preferences={preferences}
          visible={visible}
          onChange={buffer.change}
          readOnly={buffer.locked || suspended}
          onFinish={() => void buffer.finish().catch(fail)}
          onHide={hide}
        />
      )}
    </main>
  );
}
