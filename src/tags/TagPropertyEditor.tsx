import type { TagProperty } from '../contracts/lineProperties';
import type { Project } from '../contracts/project';
import { PropertyInput } from './PropertyInput';
import { t } from '../i18n';
export function TagPropertyEditor({
  fields,
  onChange,
  project,
  disabled,
}: {
  fields: TagProperty[];
  onChange: (fields: TagProperty[]) => void;
  project: Project;
  disabled: boolean;
}) {
  const update = (id: string, patch: Partial<TagProperty>) =>
    onChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  return (
    <section className="tag-property-editor">
      <h3>{t('Propriétés des lignes')}</h3>
      <p className="hint">
        {t(
          'Ces champs sont disponibles dans le détail des lignes et la vue tableau, y compris pour les enfants héritant du tag.',
        )}
      </p>
      {fields.map((field) => (
        <div className="tag-property-definition" key={field.id}>
          <div className="form-columns">
            <label>
              {t('Nom de la propriété')}
              <input
                required
                maxLength={80}
                disabled={disabled}
                value={field.name}
                onChange={(e) => update(field.id, { name: e.target.value })}
              />
            </label>
            <label>
              {t('Type de propriété')}
              <select
                disabled={disabled}
                value={field.type}
                onChange={(e) =>
                  update(field.id, {
                    type: e.target.value as TagProperty['type'],
                    defaultValue: null,
                    entityType: undefined,
                  })
                }
              >
                <option value="text">{t('Texte')}</option>
                <option value="date">{t('Date')}</option>
                <option value="number">{t('Nombre')}</option>
                <option value="relation">{t('Relation vers une note ou une ligne')}</option>
                <option value="checkbox">{t('Case à cocher')}</option>
              </select>
            </label>
          </div>
          <label>
            {t('Valeur par défaut')}
            <PropertyInput
              project={project}
              field={field}
              value={field.defaultValue ?? null}
              disabled={disabled}
              onChange={(value) => update(field.id, { defaultValue: value })}
            />
          </label>
          <label className="property-inherit">
            <input
              type="checkbox"
              disabled={disabled}
              checked={field.inherit !== false}
              onChange={(e) => update(field.id, { inherit: e.target.checked })}
            />
            {t('Hériter les valeurs des lignes parentes')}
          </label>
          {field.type === 'relation' && (
            <label>
              {t('Compléter depuis les mentions repérées')}
              <select
                value={field.entityType ?? ''}
                disabled={disabled}
                onChange={(e) => update(field.id, { entityType: e.target.value || undefined })}
              >
                <option value="">{t('Remplissage manuel')}</option>
                {[
                  'Personne',
                  'Lieu',
                  'Organisation',
                  'Œuvre',
                  'Événement',
                  'Concept',
                  'Note',
                  '*',
                ].map((kind) => (
                  <option key={kind} value={kind}>
                    {kind === '*' ? t('Tous les types') : t(kind)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(fields.filter((f) => f.id !== field.id))}
          >
            {t('Retirer cette propriété')}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={disabled || fields.length >= 64}
        onClick={() =>
          onChange([...fields, { id: crypto.randomUUID(), name: '', type: 'text', inherit: true }])
        }
      >
        {t('Ajouter une propriété')}
      </button>
    </section>
  );
}
