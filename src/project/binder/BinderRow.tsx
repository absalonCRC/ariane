import type { BinderProps } from '../binder/types';
import { t } from '../../i18n';
import type { CSSProperties } from 'react';
import { descendants, hasChapterAncestor } from '../tree';
import { type MenuAction } from '../../components/ContextMenu';
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Folder,
  BookOpen,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Check,
  Eye,
  EyeOff,
} from 'lucide-react';
import type { BinderController } from './useBinder';
const draftId = '__ariane_new_section__';
export function BinderRow({
  index,
  p,
  controller,
}: {
  index: number;
  p: BinderProps;
  controller: BinderController;
}) {
  const {
    openMenu,
    renaming,
    setRenaming,
    name,
    setName,
    renameCancelled,
    collapsed,
    setCollapsed,
    drag,
    setDrag,
    drop,
    setDrop,
    picked,
    setPicked,
    setDropError,
    dragY,
    setDestination,
    setDestinationValue,
    role,
    trash,
    addActions,
    choose,
    run,
    beginRename,
    allowedDrop,
    dropPlacement,
    activeAncestors,
    setFocused,
    rows,
    rowHeight,
    rowInset,
    indent,
    inclusion,
    branches,
    commitRename,
  } = controller;

  const { section: s, depth } = rows[index];
  const branch = branches[index];
  const count = inclusion.get(s.id) ?? { total: 0, included: 0 };
  const fullyIncluded = count.total > 0 && count.included === count.total;
  const mixed = count.included > 0 && !fullyIncluded;
  const toggleLabel =
    count.total === 0
      ? t('Aucun texte à inclure')
      : `${mixed ? t('Inclusion partielle · ') : ''}${fullyIncluded ? t('Exclure du manuscrit') : t('Inclure dans le manuscrit')} : ${s.title || t('Sans titre')}`;
  const guides = (
    <span className="tree-guides" aria-hidden="true">
      {branch.guides.map(
        (continues, level) =>
          continues && (
            <span
              key={level}
              className="tree-guide"
              style={{ left: rowInset + 12 + level * indent }}
            />
          ),
      )}
      {depth > 0 && (
        <span
          className="tree-connector"
          data-last={branch.isLast}
          style={{ left: rowInset + 12 + (depth - 1) * indent, width: indent }}
        />
      )}
      {branch.hasChildren && (
        <span className="tree-stem" style={{ left: rowInset + 12 + depth * indent }} />
      )}
    </span>
  );
  if (s.id === draftId)
    return (
      <form
        key={draftId}
        className="tree-row tree-create"
        style={{
          position: 'absolute',
          top: index * rowHeight,
          left: 0,
          right: 0,
          height: rowHeight,
          paddingLeft: rowInset + depth * indent,
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void p.onConfirmCreation?.();
        }}
      >
        {guides}
        <span
          className="tree-inclusion draft-inclusion"
          title={t('Inclus dans le manuscrit')}
          aria-hidden="true"
        >
          <Eye size={14} />
        </span>
        <span className="disclose-spacer" aria-hidden="true" />
        <span className="creation-marker" aria-hidden="true">
          {s.kind === 'scene' ? (
            <FileText size={12} />
          ) : s.kind === 'chapter' ? (
            <BookOpen size={13} />
          ) : (
            <Folder size={13} />
          )}
        </span>
        <input
          autoFocus
          className="tree-rename"
          aria-label={
            {
              folder: t('Nom de la section'),
              chapter: t('Nom du chapitre'),
              scene: t('Nom de la scène'),
            }[s.kind]
          }
          placeholder={
            {
              folder: t('Nouvelle section'),
              chapter: t('Nouveau chapitre'),
              scene: t('Nouvelle scène'),
            }[s.kind]
          }
          value={p.creationTitle ?? ''}
          onChange={(event) => p.onCreationTitle?.(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Escape') {
              event.preventDefault();
              p.onCancelCreation?.();
            }
          }}
        />
        <button
          className="icon-button"
          type="submit"
          aria-label={t('Valider le nom')}
          disabled={p.busy || !p.creationTitle?.trim()}
        >
          <Check size={13} />
        </button>
      </form>
    );
  return (
    <div
      key={s.id}
      data-row-index={index}
      data-kind={s.kind}
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest('input')) return;
        const ids = picked.includes(s.id) ? picked : [s.id];
        if (!picked.includes(s.id)) setPicked(ids);
        const actions: MenuAction[] = [
          ...(trash ? [] : [{ label: t('Ouvrir'), icon: FileText, run: () => p.onSelect(s.id) }]),
        ];
        if (p.onRename && !trash && ids.length === 1)
          actions.push({
            label: t('Renommer'),
            icon: Pencil,
            shortcut: 'F2',
            run: () => beginRename(s),
          });
        if (p.onPrepare && !trash && ids.length === 1)
          actions.push({ label: t('Préparer cette section'), run: () => p.onPrepare!(s.id) });
        if (p.onManuscriptOperation && !trash && s.kind === 'scene' && ids.length === 1) {
          const siblings = p.project.sections.filter(
            (item) => item.kind === 'scene' && item.parent === s.parent && item.role === s.role,
          );
          const next = siblings[siblings.findIndex((item) => item.id === s.id) + 1];
          if (next)
            actions.push({
              label: t('Réunir avec « {0} »', { 0: next.title || t('Sans titre') }),
              run: () =>
                void p.onManuscriptOperation!({
                  action: 'join',
                  sourceId: s.id,
                  targetId: next.id,
                }),
            });
        }
        if (s.kind !== 'scene' && p.project.sections.some((child) => child.parent === s.id))
          actions.push({
            label: collapsed.has(s.id) ? t('Déplier') : t('Replier'),
            icon: collapsed.has(s.id) ? ChevronRight : ChevronDown,
            run: () =>
              setCollapsed((old) => {
                const next = new Set(old);
                if (next.has(s.id)) next.delete(s.id);
                else next.add(s.id);
                return next;
              }),
          });
        openMenu(event, {
          title: s.title,
          detail: { scene: t('Scène'), chapter: t('Chapitre'), folder: t('Section') }[s.kind],
          groups: [
            actions,
            p.onOperation
              ? trash
                ? [{ label: t('Restaurer'), run: () => run({ action: 'restore', ids }) }]
                : [
                    {
                      label: t('Déplacer vers…'),
                      run: () => {
                        setDestination(ids);
                        setDestinationValue('root:' + role);
                      },
                    },
                    {
                      label: t('Dupliquer'),
                      icon: Copy,
                      run: () => run({ action: 'duplicate', ids }),
                    },
                    {
                      label: t('Mettre à la corbeille'),
                      icon: Trash2,
                      run: () => run({ action: 'trash', ids }),
                    },
                  ]
              : [],
            !trash
              ? s.kind !== 'scene'
                ? addActions(s)
                : [
                    {
                      label: t('Nouvelle scène après celle-ci'),
                      icon: Plus,
                      run: () => p.onAdd(s.parent, 'scene', role, s.id),
                    },
                  ]
              : [],
            !trash &&
            p.onOperation &&
            ids.some((id) =>
              descendants(p.project.sections, id).some((item) => item.kind === 'scene'),
            )
              ? [
                  {
                    label: ids
                      .flatMap((id) => descendants(p.project.sections, id))
                      .filter((item) => item.kind === 'scene')
                      .every((item) => item.included !== false)
                      ? s.kind === 'scene'
                        ? t('Exclure du manuscrit')
                        : t('Exclure les textes du manuscrit')
                      : s.kind === 'scene'
                        ? t('Inclure dans le manuscrit')
                        : t('Inclure les textes dans le manuscrit'),
                    run: () =>
                      run({
                        action: 'include',
                        ids,
                        included: !ids
                          .flatMap((id) => descendants(p.project.sections, id))
                          .filter((item) => item.kind === 'scene')
                          .every((item) => item.included !== false),
                      }),
                  },
                ]
              : [],
            typeof navigator.clipboard?.writeText === 'function'
              ? [
                  {
                    label: t('Copier le titre'),
                    icon: Copy,
                    run: () => navigator.clipboard.writeText(s.title),
                  },
                ]
              : [],
          ],
        });
      }}
      onFocus={() => setFocused(s.id)}
      className={
        'tree-row ' +
        (picked.length > 1 && picked.includes(s.id) ? 'selected ' : '') +
        (drop?.id === s.id ? 'drop-' + drop.placement : '')
      }
      data-selected={picked.includes(s.id)}
      data-active={p.active === s.id && !trash}
      data-active-within={collapsed.has(s.id) && activeAncestors.has(s.id) && !trash}
      data-excluded={s.included === false}
      title={s.title + (s.included === false ? ' · Hors manuscrit' : '')}
      style={
        {
          '--tree-indent': `${rowInset + depth * indent}px`,
          paddingLeft: rowInset + depth * indent,
          position: 'absolute',
          top: index * rowHeight,
          left: 0,
          right: 0,
          height: rowHeight,
        } as CSSProperties
      }
      draggable={!trash && !p.busy}
      onDragStart={(e) => {
        const ids = picked.includes(s.id) ? picked : [s.id];
        setDrag(ids);
        setPicked(ids);
        e.dataTransfer.setData('application/x-ariane-section', JSON.stringify(ids));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        setDrag([]);
        setDrop(null);
      }}
      onDragOver={(e) => {
        if (!trash && drag.length) {
          e.stopPropagation();
          dragY.current = e.clientY;
          const placement = dropPlacement(e, s);
          if (!allowedDrop(s, placement)) {
            e.dataTransfer.dropEffect = 'none';
            setDropError(
              hasChapterAncestor(p.project.sections, placement === 'inside' ? s.id : s.parent) &&
                drag.some((id) =>
                  descendants(p.project.sections, id).some((item) => item.kind === 'chapter'),
                )
                ? t('Un chapitre ne peut pas contenir un autre chapitre.')
                : t('Impossible de déplacer un élément dans sa propre branche.'),
            );
            setDrop(null);
            return;
          }
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setDropError('');
          setDrop((old) =>
            old?.id === s.id && old.placement === placement ? old : { id: s.id, placement },
          );
        }
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!trash && drag.length) {
          const placement = dropPlacement(e, s);
          if (!allowedDrop(s, placement)) {
            setDrag([]);
            setDrop(null);
            return;
          }
          if (p.onOperation) void run({ action: 'move', ids: drag, target: s.id, placement });
          else p.onMove(drag[0], s.id, placement === 'inside');
        }
        setDrag([]);
        setDrop(null);
      }}
    >
      {guides}
      {!trash && (
        <button
          className="tree-inclusion"
          disabled={p.busy || !p.onOperation || !count.total}
          aria-label={toggleLabel}
          data-hint={
            mixed
              ? t('En partie dans le manuscrit')
              : fullyIncluded
                ? t('Inclus dans le manuscrit et l’export')
                : t('Texte de travail · hors manuscrit')
          }
          aria-description={
            mixed
              ? t('En partie dans le manuscrit')
              : fullyIncluded
                ? t('Inclus dans le manuscrit et l’export')
                : t('Texte de travail · hors manuscrit')
          }
          aria-pressed={mixed ? 'mixed' : fullyIncluded}
          onClick={(event) => {
            event.stopPropagation();
            void run({ action: 'include', ids: [s.id], included: !fullyIncluded });
          }}
        >
          {count.included ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
      )}
      {s.kind !== 'scene' ? (
        <button
          className="disclose"
          aria-label={
            (collapsed.has(s.id) ? t('Déplier ') : t('Replier ')) + (s.title || t('Sans titre'))
          }
          aria-expanded={!collapsed.has(s.id)}
          onClick={() =>
            setCollapsed((old) => {
              const next = new Set(old);
              if (next.has(s.id)) next.delete(s.id);
              else next.add(s.id);
              return next;
            })
          }
        >
          <ChevronRight size={12} style={{ rotate: collapsed.has(s.id) ? '0deg' : '90deg' }} />
        </button>
      ) : (
        <span className="disclose-spacer" aria-hidden="true" />
      )}
      <span
        className="tree-type-icon"
        title={{ folder: t('Section'), chapter: t('Chapitre'), scene: t('Scène') }[s.kind]}
        aria-hidden="true"
      >
        {s.kind === 'chapter' ? (
          <BookOpen size={14} />
        ) : s.kind === 'folder' ? (
          <Folder size={14} />
        ) : (
          <FileText size={14} />
        )}
      </span>
      {renaming === s.id ? (
        <input
          className="tree-rename"
          aria-label={t('Nouveau titre')}
          autoFocus
          value={name}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setName(event.target.value)}
          onBlur={commitRename}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === 'Enter') {
              event.preventDefault();
              commitRename();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              renameCancelled.current = true;
              setRenaming(null);
            }
          }}
        />
      ) : (
        <button
          className="tree-title"
          aria-current={p.active === s.id ? 'page' : undefined}
          aria-label={`${{ folder: t('Section'), chapter: t('Chapitre'), scene: t('Scène') }[s.kind]} : ${s.title || t('Sans titre')}${s.included === false ? ' · Hors manuscrit' : ''}`}
          onClick={(e) => choose(s.id, e)}
        >
          {s.title || t('Sans titre')}
        </button>
      )}
      {s.kind !== 'scene' && !trash && (
        <button
          className="row-add"
          aria-label={t('Ajouter dans ') + s.title}
          data-tooltip={t('Ajouter')}
          aria-haspopup="menu"
          onClick={(event) =>
            openMenu(event, { title: t('Ajouter dans ') + s.title, groups: [addActions(s)] })
          }
        >
          <Plus size={12} />
        </button>
      )}
    </div>
  );
}
