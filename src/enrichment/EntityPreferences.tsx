import { EntityColorToggle } from '../components/EntityColorToggle';
import { useEffect, useState } from 'react';
import { request } from '../app/client';
import type { SourcePage } from '../app/types';
import defaults from './defaultEntityTypes.json';
import type { EntityTypeDefinition } from '../app/types';
import type { Settings } from '../app/types';
import { t } from '../i18n';
import { entityColors, entityColor, entityKind } from './entityTypes';

export function EntityPreferences({
  value,
  onChange,
}: {
  value: Settings;
  onChange: (value: Partial<Settings>) => void;
}) {
  const [catalogKinds, setCatalogKinds] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void request<SourcePage>('browseSources', {
      query: '',
      vault: null,
      kind: null,
      folder: null,
      offset: 0,
    })
      .then((page) => {
        if (alive) setCatalogKinds((page.kinds ?? []).map(entityKind));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const [newType, setNewType] = useState('');
  const [typeError, setTypeError] = useState('');
  const configured: EntityTypeDefinition[] = value.entityTypes ?? defaults;
  const types = [
    ...configured,
    ...catalogKinds
      .filter((kind) => kind !== 'Note' && !configured.some((t) => entityKind(t.name) === kind))
      .map((name) => ({ name, description: '', examples: [], enabled: true })),
  ];
  const updateType = (name: string, patch: Partial<EntityTypeDefinition>) =>
    onChange({ entityTypes: types.map((t) => (t.name === name ? { ...t, ...patch } : t)) });
  const addType = () => {
    const name = newType.trim();
    if (
      !name ||
      name.length > 60 ||
      /[\r\n]/.test(name) ||
      name.toLocaleLowerCase() === 'note' ||
      types.some(
        (t) => entityKind(t.name).toLocaleLowerCase() === entityKind(name).toLocaleLowerCase(),
      )
    ) {
      setTypeError(t('Choisissez un nom de type unique.'));
      return;
    }
    if (types.length >= 64) {
      setTypeError(t('Vous pouvez définir jusqu’à 64 types.'));
      return;
    }
    onChange({ entityTypes: [...types, { name, description: '', examples: [], enabled: true }] });
    setNewType('');
    setTypeError('');
  };
  const kinds = [
    ...new Set([
      ...Object.keys(entityColors),
      ...catalogKinds,
      ...types.map((t) => t.name),
      ...Object.keys(value.entityColors ?? {}),
    ]),
  ];
  return (
    <fieldset className="entity-preferences">
      <legend>{t('Entités dans le texte')}</legend>
      <EntityColorToggle value={value} onChange={onChange} />
      <p className="hint">
        {t('La couleur indique le type. Cliquez sur un nom pour consulter sa fiche ou la créer.')}
      </p>
      <div className="entity-color-grid">
        {kinds.map((kind) => (
          <label key={kind}>
            <span>{t(kind)}</span>
            <input
              type="color"
              aria-label={t('Couleur · {0}', { 0: t(kind) })}
              value={entityColor(kind, value.entityColors)}
              onChange={(e) =>
                onChange({ entityColors: { ...value.entityColors, [kind]: e.target.value } })
              }
            />
          </label>
        ))}
      </div>
      <button onClick={() => onChange({ entityColors: {} })}>{t('Rétablir les couleurs')}</button>
      <label className="preference-toggle">
        <span>
          {t('Classer automatiquement les nouvelles notes')}
          <small>
            {t(
              'Classification locale selon les types, descriptions et exemples ci-dessous. Les cas incertains restent de type Note.',
            )}
          </small>
        </span>
        <input
          type="checkbox"
          checked={value.classifyNewNotes !== false}
          onChange={(e) => onChange({ classifyNewNotes: e.target.checked })}
        />
      </label>
      <div className="entity-type-definitions">
        {types.map((type) => (
          <details key={type.name}>
            <summary>
              {type.name}
              {!type.enabled ? ' · ' + t('Désactivé') : ''}
            </summary>
            <label className="preference-toggle">
              <span>{t('Utiliser ce type pour la classification')}</span>
              <input
                type="checkbox"
                checked={type.enabled}
                onChange={(e) => updateType(type.name, { enabled: e.target.checked })}
              />
            </label>
            <label>
              {t('Définition · {0}', { 0: type.name })}
              <textarea
                maxLength={500}
                value={type.description}
                onChange={(e) => updateType(type.name, { description: e.target.value })}
              />
            </label>
            <label>
              {t('Exemples · {0}', { 0: type.name })}
              <input
                value={type.examples.join(', ')}
                placeholder={t('Noms séparés par des virgules')}
                onChange={(e) =>
                  updateType(type.name, {
                    examples: e.target.value
                      .split(',')
                      .map((s) => s.trim())
                      .slice(0, 30),
                  })
                }
              />
            </label>
          </details>
        ))}
      </div>
      <label>
        {t('Nouveau type d’entité')}
        <input
          maxLength={60}
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addType();
            }
          }}
        />
      </label>
      <button onClick={addType}>{t('Ajouter ce type')}</button>
      {typeError && <p role="alert">{typeError}</p>}
    </fieldset>
  );
}
