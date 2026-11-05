import type { OutlineNode } from '../../contracts/project';
import type { PropertyValue } from '../../contracts/lineProperties';
export function mergeNodeProperties(
  owner: Pick<OutlineNode, 'properties' | 'propertyConflicts'>,
  removed: Pick<OutlineNode, 'properties' | 'propertyConflicts'>,
) {
  const properties = { ...owner.properties },
    conflicts = { ...owner.propertyConflicts };
  for (const [id, value] of Object.entries(removed.properties ?? {})) {
    if (!(id in properties)) properties[id] = value;
    else if (JSON.stringify(properties[id]) !== JSON.stringify(value))
      conflicts[id] = [
        ...new Map(
          [properties[id], ...(conflicts[id] ?? []), value].map((v) => [JSON.stringify(v), v]),
        ).values(),
      ];
  }
  for (const [id, values] of Object.entries(removed.propertyConflicts ?? {}))
    conflicts[id] = [
      ...new Map(
        [...(conflicts[id] ?? []), ...values].map((v: PropertyValue) => [JSON.stringify(v), v]),
      ).values(),
    ];
  return {
    ...(Object.keys(properties).length ? { properties } : {}),
    ...(Object.keys(conflicts).length ? { propertyConflicts: conflicts } : {}),
  };
}
