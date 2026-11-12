import type { StructuredQuery } from '../contracts/structuredQuery';
import type { SmartTag } from '../contracts/smartTags';
import type { EntityCatalog } from '../contracts/entityIdentity';
import { canonicalEntity } from '../entities/model';
import { parseQuery, normalizeName, quoteName } from './query';
export function resolveQuery(
  input: string,
  tags: SmartTag[],
  catalog: EntityCatalog,
  choices: Record<string, string> = {},
): StructuredQuery {
  return {
    version: 1,
    groups: parseQuery(input).map((group) =>
      group.map((term) => {
        const values =
          term.kind === 'tag'
            ? tags.map((t) => ({ id: t.id, names: [t.name] }))
            : catalog.entities
                .filter((e) => !e.redirect)
                .map((e) => ({ id: e.id, names: [e.title, ...e.aliases] }));
        const matches = values.filter((v) =>
          v.names.some((n) => normalizeName(n) === normalizeName(term.name)),
        );
        const chosen = choices[term.kind + ':' + normalizeName(term.name)];
        const match = chosen
          ? matches.find((v) => v.id === chosen)
          : matches.length === 1
            ? matches[0]
            : undefined;
        if (!match)
          throw Error(
            matches.length > 1
              ? 'Plusieurs identités portent ce nom. Choisissez une référence.'
              : 'Référence de recherche introuvable.',
          );
        return { kind: term.kind, id: match.id };
      }),
    ),
  };
}
export function queryLabel(
  query: StructuredQuery,
  tags: SmartTag[],
  catalog: EntityCatalog,
): string {
  if (
    query.version !== 1 ||
    !Array.isArray(query.groups) ||
    !query.groups.length ||
    query.groups.some((g) => !g.length)
  )
    throw Error('Vue enregistrée invalide ou trop récente.');
  return query.groups
    .map((group) =>
      group
        .map((term) => {
          const name =
            term.kind === 'tag'
              ? tags.find((t) => t.id === term.id)?.name
              : term.kind === 'entity'
                ? canonicalEntity(catalog, term.id)?.title
                : undefined;
          if (!name) throw Error('Une référence de cette vue est introuvable.');
          return (term.kind === 'tag' ? '#' : '@') + quoteName(name);
        })
        .join(' + '),
    )
    .join(', ');
}
