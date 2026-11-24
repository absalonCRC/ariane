import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowDown, MapPin, Mic, RotateCcw, Search, Volume2 } from 'lucide-react';
import { t, useLocale } from '../i18n';
import type { RuntimeModule } from '../contracts/runtimeModules';
import { languageOf } from './modelCatalog';

const spoken = { fr: 'Le jour se lève.', en: 'The sun is rising.', es: 'El sol se levanta.' };

export function ModelPreview({ id }: { id: RuntimeModule }) {
  useLocale();
  const [take, setTake] = useState(0);
  const frame = useRef<HTMLElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!frame.current || typeof IntersectionObserver === 'undefined') {
      setSeen(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const voice = languageOf(id);
  const wave = (
    <span className="demo-wave" aria-hidden="true">
      {[8, 15, 10, 21, 13, 18, 8].map((height, i) => (
        <i key={i} style={{ height, '--beat': i } as CSSProperties} />
      ))}
    </span>
  );
  const examples = {
    cleanup: [t('bonjour léa comment vas tu'), t('Bonjour Léa, comment vas-tu ?')],
    revision: [t('Les chats joue.'), t('Les chats jouent.')],
    salamandra: [t('Il avance de façon très lente.'), t('Il avance à pas lents.')],
  };
  const edit = id === 'cleanup' || id === 'revision' || id === 'salamandra' ? examples[id] : null;
  const title = voice
    ? t('Écouter un passage du manuscrit.')
    : {
        semantic: t('Retrouver un passage par son sens.'),
        voice: t('Transformer la parole en texte.'),
        memory: t('Repérer les personnes, les lieux et les organisations.'),
        cleanup: t('Ponctuer une phrase dictée.'),
        revision: t('Corriger un accord.'),
        salamandra: t('Proposer une autre formulation.'),
      }[id as Exclude<RuntimeModule, 'readingFr' | 'readingEn' | 'readingEs'>];
  return (
    <figure ref={frame} className="model-demo" data-waiting={!seen || undefined} aria-label={title}>
      <div key={id + take} className="demo-scene">
        {voice && (
          <>
            <div className="demo-source">
              <Volume2 size={13} />
              {wave}
            </div>
            <div className="demo-reading" lang={voice}>
              {spoken[voice].split(' ').map((word, i) => (
                <span key={i} style={{ '--word': i } as CSSProperties}>
                  {word}{' '}
                </span>
              ))}
            </div>
          </>
        )}
        {id === 'voice' && (
          <>
            <div className="demo-source">
              <Mic size={13} />
              {wave}
            </div>
            <div className="demo-transcript">{t('Le jour se lève.')}</div>
          </>
        )}
        {id === 'semantic' && (
          <>
            <div className="demo-source">
              <Search size={13} />
              {t('Au bord de la mer')}
            </div>
            <div className="demo-result">{t('Les vagues effleurent le sable.')}</div>
          </>
        )}
        {id === 'memory' && (
          <>
            <div className="demo-entity">
              {t('Léa visite')} <mark>Paris</mark>.
            </div>
            <div className="demo-result demo-source">
              <MapPin size={12} />
              Paris · {t('Lieu')}
            </div>
          </>
        )}
        {edit && (
          <>
            <div className="demo-before">{edit[0]}</div>
            <div className="demo-result">
              <ArrowDown size={12} />
              {edit[1]}
            </div>
          </>
        )}
      </div>
      <button
        type="button"
        className="demo-replay"
        aria-label={t('Rejouer l’exemple · {0}', { 0: title })}
        onClick={() => setTake((n) => n + 1)}
      >
        <RotateCcw size={12} />
      </button>
    </figure>
  );
}
