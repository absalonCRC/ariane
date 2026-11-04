import { X } from 'lucide-react';
import { t, useLocale, localizeMessage } from '../i18n';
import { entityKind } from './entityTypes';
import type { InlineEntitiesController } from './useInlineEntities';

export function EntityProposal({ entities }: { entities: InlineEntitiesController }) {
  useLocale();
  const selected = entities.selected;
  if (!selected) return null;
  return (
    <aside
      className="entity-proposal floating"
      aria-label={t('Identifier cette entité')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          entities.close();
        }
      }}
    >
      <div className="panel-top">
        <span>{t('Identifier cette entité')}</span>
        <button className="icon-button" aria-label={t('Fermer')} onClick={entities.close}>
          <X size={16} />
        </button>
      </div>
      <h2>{selected.title}</h2>
      <p className="hint">{t(entityKind(selected.kind))}</p>
      <p>{t('Cette mention correspond-elle à une fiche existante ?')}</p>
      {selected.candidates?.map((candidate) => (
        <button
          key={candidate.id}
          disabled={entities.busy}
          onClick={() => void entities.choose(candidate.id)}
        >
          {candidate.title} · {t(entityKind(candidate.kind))}
        </button>
      ))}
      <button disabled={entities.busy} onClick={() => void entities.create()}>
        {entities.busy ? t('Création…') : t('Créer une fiche distincte')}
      </button>
      {entities.error && (
        <p role="status" className="error-text">
          {localizeMessage(entities.error)}
        </p>
      )}
    </aside>
  );
}
