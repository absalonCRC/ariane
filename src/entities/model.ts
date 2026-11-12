import type { EntityCatalog, EntityIdentity, EntityOperation } from '../contracts/entityIdentity';
export const emptyCatalog = (): EntityCatalog => ({ revision: 0, entities: [], relations: [] });
export function canonicalEntity(catalog: EntityCatalog, id: string): EntityIdentity | undefined {
  const seen = new Set<string>();
  let entity = catalog.entities.find((e) => e.id === id);
  while (entity?.redirect) {
    if (seen.has(entity.id)) return;
    seen.add(entity.id);
    entity = catalog.entities.find((e) => e.id === entity!.redirect);
  }
  return entity;
}
export function changeCatalog(catalog: EntityCatalog, operation: EntityOperation): EntityCatalog {
  const next = structuredClone(catalog);
  if (operation.action === 'save') {
    const old = next.entities.find((e) => e.id === operation.entity.id);
    if ((old?.redirect ?? null) !== (operation.entity.redirect ?? null))
      throw Error('Utilisez la fusion pour modifier une redirection.');
    if (!operation.entity.id || !operation.entity.title.trim() || !operation.entity.kind.trim())
      throw Error('Identité invalide.');
    next.entities = next.entities
      .filter((e) => e.id !== operation.entity.id)
      .concat(operation.entity);
  } else if (operation.action === 'relation') {
    const r = operation.relation;
    if (!r.name.trim() || !canonicalEntity(next, r.from) || !canonicalEntity(next, r.to))
      throw Error('Relation invalide.');
    next.relations = next.relations.filter((x) => x.id !== r.id).concat(r);
  } else if (operation.action === 'removeRelation')
    next.relations = next.relations.filter((r) => r.id !== operation.id);
  else if (operation.action === 'merge') {
    const a = canonicalEntity(next, operation.source),
      b = canonicalEntity(next, operation.target);
    if (!a || !b || a.id === b.id || operation.token !== JSON.stringify(catalog))
      throw Error('La prévisualisation a changé.');
    b.aliases = [...new Set([...b.aliases, a.title, ...a.aliases])].filter((n) => n !== b.title);
    b.sourceIds = [...new Set([...b.sourceIds, ...a.sourceIds])];
    b.detectedIds = [...new Set([...b.detectedIds, ...a.detectedIds])];
    a.redirect = b.id;
    next.relations = next.relations.map((r) => ({
      ...r,
      from: r.from === a.id ? b.id : r.from,
      to: r.to === a.id ? b.id : r.to,
    }));
  } else throw Error('Opération indisponible.');
  next.revision++;
  return next;
}

export function catalogContent(catalog: EntityCatalog) {
  return JSON.stringify({ ...catalog, revision: 0 });
}
