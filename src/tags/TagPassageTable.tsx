import type { Project } from '../contracts/project';
import type { PropertyRelation, PropertyValue } from '../contracts/lineProperties';
import { t, useLocale } from '../i18n';
import type { EffectiveTag } from './model';
import { TagChip } from './TagChip';
import type { TagTableProjection } from './table';
import type { TagPassage } from './passages';
function Value({
  value,
  onOpen,
}: {
  value: PropertyValue;
  onOpen: (relation: PropertyRelation) => void;
}) {
  if (value === null) return <span className="property-empty">—</span>;
  if (Array.isArray(value))
    return (
      <span className="tag-table-relations">
        {value.length
          ? value.map((relation, i) => (
              <button type="button" key={i} onClick={() => onOpen(relation)}>
                {relation.title || t('Référence')}
              </button>
            ))
          : '—'}
      </span>
    );
  return <>{typeof value === 'boolean' ? (value ? t('Oui') : t('Non')) : String(value)}</>;
}
export function TagPassageTable({
  project,
  table,
  onPassage,
  onRelation,
  onTag,
  onRemove,
  removalLabel,
  onError,
}: {
  project: Project;
  table: TagTableProjection;
  onPassage: (passage: TagPassage) => void;
  onRelation: (relation: PropertyRelation) => void;
  onTag: (id: string) => void;
  onRemove?: (assignment: EffectiveTag) => void | Promise<void>;
  removalLabel?: (assignment: EffectiveTag) => string;
  onError?: (error: unknown) => void;
}) {
  useLocale();
  const { rows, columns } = table;
  return (
    <div
      className="tag-table-scroll"
      tabIndex={0}
      aria-label={t('Tableau des passages et propriétés')}
    >
      <table className="tag-passage-table">
        <thead>
          <tr>
            <th scope="col">{t('Page')}</th>
            <th scope="col">{t('Passage')}</th>
            <th scope="col">{t('Smart-tags')}</th>
            {columns.map(({ field, tag }) => (
              <th scope="col" key={field.id}>
                {field.name}
                <small>#{project.smartTags?.find((v) => v.id === tag)?.name}</small>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ passage, tags, properties }) => (
            <tr key={passage.section + ':' + (passage.node ?? passage.from)}>
              <td>{passage.title}</td>
              <td>
                <button
                  className="tag-table-passage"
                  onClick={() => onPassage(passage)}
                  aria-label={t('Ouvrir le passage original dans {0}', { 0: passage.title })}
                >
                  {passage.text || t('Passage vide')}
                </button>
              </td>
              <td>
                {tags.map((assignment) => (
                  <TagChip
                    key={assignment.tag.id}
                    tag={assignment.tag}
                    onOpen={() => onTag(assignment.tag.id)}
                    onRemove={onRemove ? () => onRemove(assignment) : undefined}
                    removeLabel={removalLabel?.(assignment)}
                    onError={onError}
                  />
                ))}
              </td>
              {columns.map(({ field }) => {
                const property = properties.get(field.id),
                  node = project.sections
                    .find((s) => s.id === passage.section)
                    ?.outline?.nodes.find((n) => n.id === passage.node);
                return (
                  <td key={field.id}>
                    {property ? (
                      <>
                        <div className="tag-table-value">
                          <Value value={property.value} onOpen={onRelation} />
                        </div>
                        <small>
                          {t(
                            property.origin === 'direct'
                              ? 'Saisi'
                              : property.origin === 'inherited'
                                ? 'Hérité'
                                : property.origin === 'detected'
                                  ? 'Repéré dans le texte'
                                  : 'Valeur du tag',
                          )}
                        </small>
                      </>
                    ) : (
                      '—'
                    )}
                    {!!node?.propertyConflicts?.[field.id]?.length && (
                      <details>
                        <summary>{t('Valeurs conservées')}</summary>
                        {node.propertyConflicts[field.id].map((value, i) => (
                          <div key={i}>
                            <Value value={value} onOpen={onRelation} />
                          </div>
                        ))}
                      </details>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
