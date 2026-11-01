import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ManuscriptMatch } from './projectSearch';
import { Search } from 'lucide-react';
import { useExitPresence } from '../components/useExitPresence';
export interface Command {
  label: string;
  detail?: string;
  action: () => void;
}
export function Palette({
  commands,
  open,
  onOpen,
  onClose,
  sections = false,
  textSearch = false,
  searchScope,
  onTextSearch,
  onNextMatch,
  initialQuery = '',
  matches,
  matchTotal = 0,
  onMatch,
  panel,
  retainContent = false,
}: {
  commands: Command[];
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  sections?: boolean;
  textSearch?: boolean;
  searchScope: string;
  onTextSearch: (query: string) => void;
  onNextMatch: (query: string, backwards: boolean) => void;
  initialQuery?: string;
  matches?: ManuscriptMatch[];
  matchTotal?: number;
  onMatch?: (hit: ManuscriptMatch) => void;
  panel: HTMLElement | null;
  retainContent?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const present = useExitPresence(open, retainContent);
  useLayoutEffect(() => {
    if (!open) return;
    setSelected(0);
    const initial = !textSearch && !sections ? '/' : sections ? '' : initialQuery;
    setQuery(initial);
    onTextSearch(initial);
    const previouslyFocused = document.activeElement;
    input.current?.focus();
    // Wait for the shared panel to become visible and interactive.
    const timer = window.setTimeout(() => {
      if (document.activeElement === previouslyFocused) input.current?.focus();
    }, 100);
    return () => window.clearTimeout(timer);
  }, [open, sections, textSearch, searchScope, initialQuery]);
  const commandSearch = !sections && query.startsWith('/');
  const searchTerm = (commandSearch ? query.slice(1) : query).trim().toLocaleLowerCase();
  const filtered =
    commandSearch || (sections && searchTerm)
      ? commands.filter((c) => c.label.toLocaleLowerCase().includes(searchTerm))
      : [];
  const run = (command: Command) => {
    onClose();
    command.action();
  };
  return (
    <div
      className="header-search"
      data-open={open}
      role="search"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <button
        className="icon-button header-search-trigger"
        aria-label={open ? 'Fermer la recherche' : 'Rechercher dans les textes et les vaults'}
        aria-expanded={open}
        aria-controls="bottom-writing-panel"
        onClick={() => (open ? onClose() : onOpen())}
      >
        <Search size={17} />
      </button>
      {panel &&
        present &&
        createPortal(
          <div className="header-search-content" data-visible={open}>
            <input
              ref={input}
              aria-label={
                sections ? 'Rechercher une section' : 'Rechercher dans les textes et les vaults'
              }
              placeholder={
                sections ? 'Rechercher une section…' : 'Rechercher dans les textes et les vaults…'
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(0);
                if (!sections) onTextSearch(event.target.value);
              }}
              role="combobox"
              aria-expanded={commandSearch || !!searchTerm}
              aria-controls={commandSearch || sections ? 'palette-results' : 'manuscript-results'}
              aria-activedescendant={
                filtered[selected]
                  ? `palette-result-${selected}`
                  : !commandSearch && !sections && matches?.[selected]
                    ? `manuscript-result-${selected}`
                    : undefined
              }
              onKeyDown={(event) => {
                if (
                  !sections &&
                  !commandSearch &&
                  matches?.length &&
                  (event.key === 'ArrowDown' || event.key === 'ArrowUp')
                ) {
                  event.preventDefault();
                  setSelected(
                    (current) =>
                      (current + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) %
                      matches.length,
                  );
                } else if (
                  (event.key === 'ArrowDown' || event.key === 'ArrowUp') &&
                  filtered.length
                ) {
                  event.preventDefault();
                  setSelected(
                    (current) =>
                      (current + (event.key === 'ArrowDown' ? 1 : -1) + filtered.length) %
                      filtered.length,
                  );
                } else if (event.key === 'Enter' && !sections && !commandSearch) {
                  event.preventDefault();
                  if (matches?.length && onMatch)
                    onMatch(matches[Math.min(selected, matches.length - 1)]);
                  else onNextMatch(query, event.shiftKey);
                } else if (event.key === 'Enter' && filtered[selected]) {
                  event.preventDefault();
                  run(filtered[selected]);
                }
              }}
            />
            {(commandSearch || (sections && !!searchTerm)) && (
              <div
                id="palette-results"
                className="header-search-results"
                role="listbox"
                aria-label="Résultats de recherche"
              >
                {filtered.length ? (
                  filtered.map((command, index) => (
                    <button
                      key={command.label + index}
                      id={`palette-result-${index}`}
                      role="option"
                      aria-selected={index === selected}
                      onMouseEnter={() => setSelected(index)}
                      title={command.detail || command.label}
                      onClick={() => run(command)}
                    >
                      {command.label}
                    </button>
                  ))
                ) : (
                  <span>Aucun résultat</span>
                )}
              </div>
            )}
            {!sections && !commandSearch && !!searchTerm && matches && (
              <div className="manuscript-search-results">
                <small role="status">
                  {matchTotal
                    ? `${matchTotal} résultat${matchTotal > 1 ? 's' : ''} dans les textes`
                    : 'Aucun passage dans les textes'}
                  {matchTotal > matches.length
                    ? ` · ${matches.length} affichés, précisez la recherche`
                    : ''}
                </small>
                <div id="manuscript-results" role="listbox" aria-label="Passages du projet">
                  {matches.map((hit, index) => (
                    <button
                      role="option"
                      aria-selected={selected === index}
                      id={`manuscript-result-${index}`}
                      key={hit.key}
                      className="manuscript-search-result"
                      data-selected={selected === index}
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => onMatch?.(hit)}
                    >
                      <strong>{hit.title}</strong>
                      <span>{hit.excerpt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <span className="sr-only" aria-live="polite">
              {filtered[selected]
                ? `${selected + 1} sur ${filtered.length} : ${filtered[selected].label}`
                : ''}
            </span>
          </div>,
          panel,
        )}
    </div>
  );
}
