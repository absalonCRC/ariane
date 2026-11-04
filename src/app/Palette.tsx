import { t, useLocale } from '../i18n';
import { useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  panel: HTMLElement | null;
  retainContent?: boolean;
}) {
  useLocale();
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
  const commandSearch = !sections && !textSearch;
  const searchTerm = (commandSearch ? query.replace(/^\//, '') : query).trim().toLocaleLowerCase();
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
        aria-label={open ? t('Fermer la recherche') : t('Rechercher dans les textes et les vaults')}
        data-tooltip={open ? t('Fermer la recherche') : t('Rechercher')}
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
                sections
                  ? t('Rechercher une section')
                  : t('Rechercher dans les textes et les vaults')
              }
              placeholder={
                sections
                  ? t('Rechercher une section…')
                  : t('Rechercher dans les textes et les vaults…')
              }
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelected(0);
                if (!sections) onTextSearch(event.target.value);
              }}
              role={commandSearch || sections ? 'combobox' : 'searchbox'}
              aria-expanded={commandSearch || sections ? !!filtered.length : undefined}
              aria-controls={commandSearch || sections ? 'palette-results' : undefined}
              aria-activedescendant={filtered[selected] ? `palette-result-${selected}` : undefined}
              onKeyDown={(event) => {
                if (
                  !sections &&
                  !commandSearch &&
                  (event.key === 'ArrowDown' || event.key === 'ArrowUp')
                ) {
                  event.preventDefault();
                  onNextMatch(query, event.key === 'ArrowUp');
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
                  onNextMatch(query, event.shiftKey);
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
                aria-label={t('Résultats de recherche')}
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
                  <span>{t('Aucun résultat')}</span>
                )}
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
