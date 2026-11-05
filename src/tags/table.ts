import type { Project } from '../contracts/project';
import type { EntityBatch } from '../contracts/entities';
import type { TagPassage } from './passages';
import { effectiveTags } from './model';
import { lineProperties, type LineProperty } from './properties';
export function tagTableProjection(
  project: Project,
  passages: TagPassage[],
  batches: EntityBatch[],
) {
  const rows = passages.map((passage) => {
    const tags = effectiveTags(
      project.smartTags ?? [],
      project.sections,
      passage.section,
      passage.node,
    );
    const properties: LineProperty[] = passage.node
      ? lineProperties(project, passage.section, passage.node, batches)
      : tags.flatMap(({ tag }) =>
          (tag.properties ?? []).map((field) => ({
            field,
            tag: tag.id,
            value: field.defaultValue ?? null,
            origin: 'default' as const,
          })),
        );
    return {
      passage,
      tags,
      properties: new Map(properties.map((property) => [property.field.id, property])),
    };
  });
  const columns = [
    ...new Map(
      rows.flatMap((row) =>
        [...row.properties.values()].map((property) => [property.field.id, property] as const),
      ),
    ).values(),
  ];
  return { rows, columns, preferredWidth: 900 + columns.length * 180 };
}
export type TagTableProjection = ReturnType<typeof tagTableProjection>;
