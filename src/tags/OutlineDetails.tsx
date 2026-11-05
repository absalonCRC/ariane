import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Project } from '../contracts/project';
import type { EntityBatch } from '../contracts/entities';
import type { PropertyValue, PropertyRelation } from '../contracts/lineProperties';
import { t, useLocale } from '../i18n';
import { effectiveTags, type EffectiveTag } from './model';
import { TagChip } from './TagChip';
import { lineProperties, lineMentions, validPropertyValue } from './properties';
import { PropertyInput } from './PropertyInput';
export function OutlineDetails({
  project,
  section: sectionId,
  node: nodeId,
  batches,
  onChange,
  onClose,
  onManage,
  onFilter,
  onOpen,
  onRemove,
  removalLabel,
  onError,
}: {
  project: Project;
  section: string;
  node: string;
  batches: EntityBatch[];
  onChange: (field: string, value: PropertyValue | undefined) => void;
  onClose: () => void;
  onManage: () => void;
  onFilter: (id: string) => void;
  onOpen: (relation: PropertyRelation) => void;
  onRemove: (assignment: EffectiveTag) => void | Promise<void>;
  removalLabel: (assignment: EffectiveTag) => string;
  onError: (error: unknown) => void;
}) {
  useLocale();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus({ preventScroll: true });
  }, [nodeId]);
  const section = project.sections.find((s) => s.id === sectionId),
    nodes = section?.outline?.nodes ?? [],
    index = nodes.findIndex((n) => n.id === nodeId),
    node = nodes[index];
  if (!section || !node) return null;
  const properties = lineProperties(project, sectionId, nodeId, batches),
    mentions = lineMentions(project, sectionId, nodeId, batches);
  const tags = effectiveTags(project.smartTags ?? [], project.sections, sectionId, nodeId);
  return (
    <aside
      className="outline-details"
      aria-label={t('Propriétés de la ligne')}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header>
        <div>
          <h2>{t('Détail de la ligne')}</h2>
          <small>{section.title}</small>
        </div>
        <button
          ref={close}
          className="icon-button"
          aria-label={t('Fermer les propriétés')}
          onClick={onClose}
        >
          <X size={15} />
        </button>
      </header>
      <p className="outline-details-excerpt">
        {section.text.slice(node.start, nodes[index + 1]?.start ?? section.text.length).trim() ||
          t('Passage vide')}
      </p>
      <div className="outline-details-tags">
        {tags.map((assignment) => (
          <TagChip
            key={assignment.tag.id}
            tag={assignment.tag}
            onOpen={() => onFilter(assignment.tag.id)}
            onRemove={() => onRemove(assignment)}
            removeLabel={removalLabel(assignment)}
            onError={onError}
          />
        ))}
      </div>
      {!properties.length && (
        <p className="hint">
          {t('Les tags de cette ligne ne définissent pas encore de propriétés.')}
        </p>
      )}
      {properties.map(({ field, value, origin }) => (
        <section className="line-property" key={field.id}>
          <div className="line-property-label">
            <label>{field.name}</label>
            <small>
              {t(
                origin === 'direct'
                  ? 'Saisi'
                  : origin === 'inherited'
                    ? 'Hérité'
                    : origin === 'detected'
                      ? 'Repéré dans le texte'
                      : 'Valeur du tag',
              )}
            </small>
          </div>
          {!validPropertyValue(field, value) && (
            <p className="error-text">
              {t('Valeur à adapter au nouveau type. La valeur conservée est : {0}', {
                0: JSON.stringify(value),
              })}
            </p>
          )}
          <PropertyInput
            field={field}
            value={value}
            project={project}
            onOpen={onOpen}
            onChange={(next) => onChange(field.id, next)}
          />
          {origin === 'direct' && (
            <button className="property-reset" onClick={() => onChange(field.id, undefined)}>
              {t('Rétablir la valeur héritée')}
            </button>
          )}
          {node.propertyConflicts?.[field.id] && (
            <div className="property-conflicts">
              <p>
                {t(
                  'Plusieurs valeurs ont été conservées lors de la réunion. Choisissez celle à utiliser.',
                )}
              </p>
              {node.propertyConflicts[field.id].map((choice, i) => (
                <button key={i} onClick={() => onChange(field.id, choice)}>
                  {JSON.stringify(choice)}
                </button>
              ))}
            </div>
          )}
        </section>
      ))}
      {mentions.length > 0 && (
        <section className="line-observations">
          <h3>{t('Mentions repérées')}</h3>
          <p className="hint">
            {t('Ces liens viennent du texte ; ils ne confirment pas une relation entre les notes.')}
          </p>
          {mentions.map(({ relation, kind }, i) => (
            <button key={i} onClick={() => onOpen(relation)}>
              {relation.title}
              <small>{t(kind)}</small>
            </button>
          ))}
        </section>
      )}
      <button className="line-manage-properties" onClick={onManage}>
        {t('Configurer les propriétés des tags')}
      </button>
    </aside>
  );
}
