import type { EntityBatch } from '../contracts/entities';
import type { Project, OutlineNode } from '../contracts/project';
import type { PropertyValue, TagProperty, PropertyRelation } from '../contracts/lineProperties';
import { entityKind } from '../enrichment/entityTypes';
import { effectiveTags } from './model';
export interface LineProperty {
  field: TagProperty;
  tag: string;
  value: PropertyValue;
  origin: 'direct' | 'inherited' | 'detected' | 'default';
  fromNode?: string;
}
export { validPropertyValue } from './propertyValues';
/** A scene split can move a stable node without rewriting every stored reference. */
export function lineReferenceSection(project: Project, section: string, node: string) {
  const matches = project.sections.filter(
    (s) => !s.trashed && s.outline?.nodes.some((n) => n.id === node),
  );
  return (
    matches.find((s) => s.id === section)?.id ?? (matches.length === 1 ? matches[0].id : undefined)
  );
}
export function lineMentions(
  project: Project,
  sectionId: string,
  nodeId: string,
  batches: EntityBatch[],
): { kind: string; relation: PropertyRelation }[] {
  const section = project.sections.find((s) => s.id === sectionId),
    nodes = section?.outline?.nodes ?? [];
  const index = nodes.findIndex((n) => n.id === nodeId);
  if (!section || index < 0) return [];
  const from = nodes[index].start,
    to = nodes[index + 1]?.start ?? section.text.length;
  const batch = batches.find(
    (b) =>
      b.section === sectionId && b.text.replace(/\n+$/, '') === section.text.replace(/\n+$/, ''),
  );
  return (
    batch?.mentions
      .filter((m) => m.sourceId && m.from >= from && m.to <= to)
      .map((m) => ({
        kind: entityKind(m.kind),
        relation: { kind: 'source', id: m.sourceId!, title: m.title },
      })) ?? []
  );
}
export function lineProperties(
  project: Project,
  sectionId: string,
  nodeId: string,
  batches: EntityBatch[] = [],
): LineProperty[] {
  const section = project.sections.find((s) => s.id === sectionId),
    nodes = new Map(section?.outline?.nodes.map((n) => [n.id, n]) ?? []),
    node = nodes.get(nodeId);
  if (!node) return [];
  const mentions = lineMentions(project, sectionId, nodeId, batches);
  return effectiveTags(project.smartTags ?? [], project.sections, sectionId, nodeId).flatMap(
    ({ tag }) =>
      (tag.properties ?? []).map((field): LineProperty => {
        if (Object.prototype.hasOwnProperty.call(node.properties ?? {}, field.id))
          return { field, tag: tag.id, value: node.properties![field.id], origin: 'direct' };
        if (field.type === 'relation' && field.entityType) {
          const values = new Map(
            mentions
              .filter((m) => field.entityType === '*' || m.kind === entityKind(field.entityType!))
              .map((m) => [(m.relation as { id: string }).id, m.relation]),
          );
          if (values.size)
            return { field, tag: tag.id, value: [...values.values()], origin: 'detected' };
        }
        let parent: OutlineNode | undefined =
          field.inherit === false ? undefined : node.parent ? nodes.get(node.parent) : undefined;
        const seen = new Set<string>();
        while (parent && !seen.has(parent.id)) {
          seen.add(parent.id);
          if (
            Object.prototype.hasOwnProperty.call(parent.properties ?? {}, field.id) &&
            effectiveTags(project.smartTags ?? [], project.sections, sectionId, parent.id).some(
              (v) => v.tag.id === tag.id,
            )
          )
            return {
              field,
              tag: tag.id,
              value: parent.properties![field.id],
              origin: 'inherited',
              fromNode: parent.id,
            };
          parent = parent.parent ? nodes.get(parent.parent) : undefined;
        }
        return { field, tag: tag.id, value: field.defaultValue ?? null, origin: 'default' };
      }),
  );
}
