import { useEffect, useState } from 'react';
import type { TagProperty, PropertyValue, PropertyRelation } from '../contracts/lineProperties';
import type { Project } from '../contracts/project';
import type { NoteRef } from '../contracts/notes';
import { request } from '../platform/client';
import { t } from '../i18n';
export function PropertyInput({
  field,
  value,
  onChange,
  project,
  onOpen,
  disabled,
}: {
  field: TagProperty;
  value: PropertyValue;
  onChange: (value: PropertyValue) => void;
  project?: Project;
  onOpen?: (relation: PropertyRelation) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(''),
    [notes, setNotes] = useState<NoteRef[]>([]);
  useEffect(() => {
    setNotes([]);
    if (field.type !== 'relation' || !project || !query.trim()) return;
    let current = true;
    const timer = setTimeout(() => {
      void request('noteSuggestions', { projectPath: project.path, query })
        .then((values) => {
          if (current) setNotes(values);
        })
        .catch(() => {});
    }, 180);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, project?.path, field.type]);
  const label = field.name;
  if (field.type === 'checkbox')
    return (
      <input
        type="checkbox"
        aria-label={label}
        disabled={disabled}
        checked={value === true}
        onChange={(e) => onChange(e.target.checked)}
      />
    );
  if (field.type !== 'relation')
    return (
      <input
        aria-label={label}
        disabled={disabled}
        type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
        step={field.type === 'number' ? 'any' : undefined}
        maxLength={10000}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        onChange={(e) =>
          onChange(
            field.type === 'number'
              ? e.target.value === ''
                ? null
                : Number(e.target.value)
              : e.target.value || null,
          )
        }
      />
    );
  const values = Array.isArray(value) ? value : [];
  const add = (relation: PropertyRelation) => {
    if (
      !values.some(
        (v) =>
          v.kind === relation.kind &&
          (v.kind === 'source' && relation.kind === 'source'
            ? v.id === relation.id
            : v.kind === 'line' &&
              relation.kind === 'line' &&
              v.section === relation.section &&
              v.node === relation.node),
      )
    )
      onChange([...values, relation]);
    setQuery('');
  };
  const lineMatches =
    query.trim() && project
      ? project.sections
          .flatMap(
            (section) =>
              section.outline?.nodes.map((node) => ({
                kind: 'line' as const,
                section: section.id,
                node: node.id,
                title: section.text
                  .slice(
                    node.start,
                    section.outline!.nodes[section.outline!.nodes.indexOf(node) + 1]?.start ??
                      section.text.length,
                  )
                  .split('\n')[0]
                  .slice(0, 120),
              })) ?? [],
          )
          .filter((v) => v.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
          .slice(0, 8)
      : [];
  return (
    <div className="property-relations">
      {values.map((relation, index) => (
        <div
          key={relation.kind === 'source' ? relation.id : relation.section + ':' + relation.node}
        >
          <button type="button" disabled={!onOpen} onClick={() => onOpen?.(relation)}>
            {relation.title || t('Référence')}
          </button>
          <button
            type="button"
            aria-label={t('Retirer la relation {0}', { 0: relation.title })}
            disabled={disabled}
            onClick={() => onChange(values.filter((_, i) => i !== index))}
          >
            ×
          </button>
        </div>
      ))}
      {project && (
        <>
          <input
            aria-label={t('Relier une note ou une ligne pour {0}', { 0: label })}
            placeholder={t('Rechercher une note ou une ligne…')}
            value={query}
            disabled={disabled}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="property-relation-results">
            {notes.map((note) => (
              <button
                type="button"
                key={note.id}
                onClick={() => add({ kind: 'source', id: note.id, title: note.title })}
              >
                {note.title}
                <small>{note.kind}</small>
              </button>
            ))}
            {lineMatches.map((line) => (
              <button type="button" key={line.section + line.node} onClick={() => add(line)}>
                {line.title || t('Passage vide')}
                <small>{t('Ligne du manuscrit')}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
