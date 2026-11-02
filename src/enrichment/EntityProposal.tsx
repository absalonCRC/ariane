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
      aria-label={t('Fiche à créer')}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          entities.close();
        }
      }}
    >
      <div className="panel-top">
        <span>{t('Fiche à créer')}</span>
        <button className="icon-button" aria-label={t('Fermer')} onClick={entities.close}>
          <X size={16} />
        </button>
      </div>
      <h2>{selected.title}</h2>
      <p className="hint">{t(entityKind(selected.kind))}</p>
      <p>
        {t(
          'Créer une fiche dans le vault du projet, avec le passage d’origine et ses références liées.',
        )}
      </p>
      <button disabled={entities.busy} onClick={() => void entities.create()}>
        {entities.busy ? t('Création…') : t('Créer la fiche')}
      </button>
      {entities.error && (
        <p role="status" className="error-text">
          {localizeMessage(entities.error)}
        </p>
      )}
    </aside>
  );
}
