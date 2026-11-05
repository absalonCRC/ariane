import type { Project, Section } from '../contracts/project';
import type { SmartTag, TagOperation } from '../contracts/smartTags';
import { validPropertyValue } from './propertyValues';

export function nextTagColor(tags: SmartTag[]): string {
  const palette = [
    '#54826b',
    '#a9614b',
    '#686fac',
    '#aa8240',
    '#9c5b88',
    '#438a98',
    '#7b8745',
    '#ae626b',
    '#8067a5',
    '#577eae',
    '#a36b3e',
    '#4f9188',
  ];
  const used = new Set(tags.map((tag) => tag.color.toLowerCase()));
  for (const color of palette) if (!used.has(color)) return color;
  for (let i = tags.length; ; i++) {
    const hue = ((i * 137.508) % 360) / 60;
    const c = 0.46,
      x = c * (1 - Math.abs((hue % 2) - 1)),
      m = 0.25 + (Math.floor(i / 360) % 3) * 0.04;
    const rgb =
      hue < 1
        ? [c, x, 0]
        : hue < 2
          ? [x, c, 0]
          : hue < 3
            ? [0, c, x]
            : hue < 4
              ? [0, x, c]
              : hue < 5
                ? [x, 0, c]
                : [c, 0, x];
    const color =
      '#' +
      rgb
        .map((v) =>
          Math.round((v + m) * 255)
            .toString(16)
            .padStart(2, '0'),
        )
        .join('');
    if (!used.has(color)) return color;
  }
}

export interface EffectiveTag {
  tag: SmartTag;
  inherited: boolean;
  section: string;
  node: string | null;
  origin?: string;
}
/** Nearest explicit assignment wins provenance; ancestors never receive copies. */
export function effectiveTags(
  tags: SmartTag[],
  sections: Section[],
  sectionId: string,
  nodeId?: string | null,
): EffectiveTag[] {
  const definitions = new Map(tags.map((tag) => [tag.id, tag]));
  const result = new Map<string, EffectiveTag>();
  const byId = new Map(sections.map((s) => [s.id, s]));
  const selected = byId.get(sectionId);
  if (!selected) return [];
  const add = (ids: string[] | undefined, section: string, node: string | null) => {
    for (const id of ids ?? []) {
      const tag = definitions.get(id);
      if (tag && !result.has(id))
        result.set(id, {
          tag,
          section,
          node,
          origin: sections.find((s) => s.id === section)?.title,
          inherited: section !== sectionId || node !== (nodeId ?? null),
        });
    }
  };
  const nodes = new Map(selected.outline?.nodes.map((n) => [n.id, n]) ?? []);
  let node = nodeId ? nodes.get(nodeId) : undefined;
  const visited = new Set<string>();
  while (node && !visited.has(node.id)) {
    visited.add(node.id);
    add(node.tagIds, sectionId, node.id);
    node = node.parent ? nodes.get(node.parent) : undefined;
  }
  let section: Section | undefined = selected;
  visited.clear();
  while (section && !visited.has(section.id)) {
    visited.add(section.id);
    add(section.tagIds, section.id, null);
    section = section.parent ? byId.get(section.parent) : undefined;
  }
  return [...result.values()];
}
export function tagUsages(sections: Section[], id: string) {
  return sections.reduce(
    (count, s) =>
      count +
      Number(s.tagIds?.includes(id) ?? false) +
      (s.outline?.nodes.filter((n) => n.tagIds?.includes(id)).length ?? 0),
    0,
  );
}
export function validateTag(tag: SmartTag, tags: SmartTag[]) {
  const fields = tag.properties ?? [];
  if (
    fields.length > 64 ||
    new Set(fields.map((f) => f.id)).size !== fields.length ||
    fields.some(
      (f) =>
        !f.id ||
        f.id.length > 128 ||
        !f.name.trim() ||
        f.name.length > 80 ||
        !['text', 'date', 'number', 'relation', 'checkbox'].includes(f.type),
    )
  )
    throw new Error('Propriété de tag invalide.');
  if (fields.some((f) => !validPropertyValue(f, f.defaultValue)))
    throw new Error('Valeur de propriété incompatible avec son type.');
  if (
    !tag.id.trim() ||
    tag.id.length > 128 ||
    !tag.name.trim() ||
    Array.from(tag.name.trim()).length > 80 ||
    Array.from(tag.category.trim()).length > 80 ||
    !/^#[\da-f]{6}$/i.test(tag.color)
  )
    throw new Error('Smart-tag invalide.');
  if (tags.some((v) => v.id !== tag.id && v.name.toLowerCase() === tag.name.trim().toLowerCase()))
    throw new Error('Ce nom de smart-tag existe déjà.');
  if (!tags.some((v) => v.id === tag.id) && tags.length >= 512)
    throw new Error('Limite de smart-tags atteinte.');
}
export function validateTagIds(ids: string[] | undefined, tags: SmartTag[]) {
  if (
    ids &&
    (ids.length > 512 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !tags.some((t) => t.id === id)))
  )
    throw new Error('Affectation de smart-tags invalide.');
}
/** Browser persistence implements the same metadata-only operations as SQLite. */
export function applyTagOperation(project: Project, operation: TagOperation) {
  const tags = project.smartTags ?? [];
  if (operation.action === 'assign') {
    validateTagIds(operation.tagIds, tags);
    const section = [...project.sections, ...(project.trash ?? [])].find(
      (s) => s.id === operation.section,
    );
    if (!section) throw new Error('Section introuvable.');
    if (operation.node) {
      const node = section.outline?.nodes.find((n) => n.id === operation.node);
      if (!node) throw new Error('Passage introuvable.');
      node.tagIds = [...operation.tagIds];
      section.revision++;
    } else section.tagIds = [...operation.tagIds];
    return;
  }
  if (operation.action === 'save') {
    validateTag(operation.tag, tags);
    const tag = {
      ...operation.tag,
      name: operation.tag.name.trim(),
      category: operation.tag.category.trim(),
    };
    project.smartTags = [...tags.filter((v) => v.id !== tag.id), tag];
    return;
  }
  if (!tags.some((t) => t.id === operation.id)) throw new Error('Smart-tag introuvable.');
  if (
    operation.action === 'merge' &&
    (operation.target === operation.id || !tags.some((t) => t.id === operation.target))
  )
    throw new Error('Fusion de smart-tags invalide.');
  if (operation.action === 'merge') {
    const target = tags.find((t) => t.id === operation.target)!;
    const merged = {
      ...target,
      properties: [
        ...(target.properties ?? []),
        ...(tags.find((t) => t.id === operation.id)?.properties ?? []).filter(
          (field) => !target.properties?.some((f) => f.id === field.id),
        ),
      ],
    };
    validateTag(merged, tags);
    target.properties = merged.properties;
  }
  const remap = (ids?: string[]) => [
    ...new Set(
      (ids ?? []).flatMap((id) =>
        id === operation.id ? (operation.action === 'merge' ? [operation.target] : []) : [id],
      ),
    ),
  ];
  for (const section of [...project.sections, ...(project.trash ?? [])]) {
    section.tagIds = remap(section.tagIds);
    for (const node of section.outline?.nodes ?? []) node.tagIds = remap(node.tagIds);
  }
  project.smartTags = tags.filter((t) => t.id !== operation.id);
}
