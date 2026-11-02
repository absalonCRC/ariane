import { t, getLocale } from '../i18n';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { isolateHistory, redo, undo } from '@codemirror/commands';
import { syntaxTree } from '@codemirror/language';
import { Facet, StateField, type EditorState } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';

type SyntaxNode = ReturnType<typeof syntaxTree>['topNode'];
type HiddenRange = { from: number; to: number };
type Cell = { from: number; to: number; prefix?: string; suffix?: string };
type Row = { cells: Cell[]; start: number; end: number; trailingPipe: boolean };
export const tableHiddenRanges = Facet.define<(state: EditorState) => readonly HiddenRange[]>();

// Parser nodes distinguish separators from escaped pipes, including empty cells.
function tableRow(state: EditorState, row: SyntaxNode): Row {
  const separators = row.getChildren('TableDelimiter');
  const cells: Cell[] = [];
  let start = row.from;
  const append = (end: number) => {
    const text = state.sliceDoc(start, end);
    const leading = text.match(/^\s*/)?.[0].length ?? 0;
    const trailing = text.match(/\s*$/)?.[0].length ?? 0;
    const from = Math.min(end, start + leading);
    cells.push({ from, to: Math.max(from, end - trailing) });
  };
  for (let i = 0; i < separators.length; i++) {
    const separator = separators[i];
    if (i !== 0 || state.sliceDoc(row.from, separator.from).trim()) append(separator.from);
    start = separator.to;
  }
  const trailingPipe = !!separators.length && !state.sliceDoc(start, row.to).trim();
  if (!trailingPipe) append(row.to);
  return { cells, start: row.from, end: row.to, trailingPipe };
}

function cellAt(row: Row | undefined, index: number): Cell | undefined {
  if (!row) return undefined;
  if (row.cells[index]) return row.cells[index];
  const missing = index - row.cells.length;
  return {
    from: row.end,
    to: row.end,
    prefix: row.trailingPipe ? '  |'.repeat(missing) + ' ' : ' |'.repeat(missing + 1) + ' ',
    suffix: row.trailingPipe ? ' |' : '',
  };
}

function escapePipes(value: string) {
  let result = '',
    slashes = 0;
  for (const character of value.replace(/[\r\n]+/g, ' ')) {
    if (character === '|' && slashes % 2 === 0) result += '\\';
    result += character;
    slashes = character === '\\' ? slashes + 1 : 0;
  }
  return result;
}

function displayCell(value: string) {
  return value.replace(/(\\+)\|/g, (match, slashes: string) =>
    slashes.length % 2 ? slashes.slice(0, -1) + '|' : match,
  );
}

function tableMarkup(source: string) {
  const template = document.createElement('template');
  template.innerHTML = micromark(source, { extensions: [gfm()], htmlExtensions: [gfmHtml()] });
  // Remote images and navigation are disabled as in the source reader.
  for (const image of template.content.querySelectorAll('img')) image.remove();
  for (const link of template.content.querySelectorAll('a')) {
    const span = document.createElement('span');
    span.append(...link.childNodes);
    link.replaceWith(span);
  }
  return template.content.querySelector('table');
}

type TableAction = 'add-row' | 'remove-row' | 'add-column' | 'remove-column';

function tableActionIcon(action: TableAction) {
  const ns = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(ns, 'svg');
  for (const [name, value] of Object.entries({
    viewBox: '0 0 24 24',
    width: '16',
    height: '16',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.6',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
  }))
    icon.setAttribute(name, value);
  const outline = document.createElementNS(ns, 'rect');
  for (const [name, value] of Object.entries({
    x: '2.5',
    y: '5',
    width: '12.5',
    height: '14',
    rx: '2',
  }))
    outline.setAttribute(name, value);
  icon.append(outline);
  const path = document.createElementNS(ns, 'path');
  const division = action.endsWith('row') ? 'M2.5 12h12.5' : 'M8.75 5v14';
  const sign = action.startsWith('add') ? 'M17 12h5 M19.5 9.5v5' : 'M17 12h5';
  path.setAttribute('d', `${division} ${sign}`);
  icon.append(path);
  return icon;
}

type ActiveCell = { row: number; column: number; input: HTMLInputElement; range: Cell };
type Controller = {
  widget: TableWidget;
  active: ActiveCell | null;
  selected: { row: number; column: number };
  writing: boolean;
  edit?: (row: number, column: number, select?: boolean) => void;
};
const controllers = new WeakMap<HTMLElement, Controller>();

class TableWidget extends WidgetType {
  readonly locale = getLocale();
  constructor(
    readonly source: string,
    readonly from: number,
    readonly to: number,
    readonly rows: Row[],
    readonly separator: HiddenRange,
    readonly quoted: boolean,
  ) {
    super();
  }

  eq(other: TableWidget) {
    return (
      other.locale === this.locale &&
      other.from === this.from &&
      other.to === this.to &&
      other.source === this.source &&
      other.quoted === this.quoted &&
      other.separator.from === this.separator.from &&
      other.separator.to === this.separator.to &&
      JSON.stringify(other.rows) === JSON.stringify(this.rows)
    );
  }

  toDOM(view: EditorView) {
    const wrapper = document.createElement('div');
    wrapper.className = 'markdown-table-preview';
    if (this.quoted) wrapper.classList.add('markdown-table-preview-quoted');
    wrapper.setAttribute('aria-label', t('Tableau Markdown modifiable'));
    const controller: Controller = {
      widget: this,
      active: null,
      selected: { row: 0, column: 0 },
      writing: false,
    };
    controllers.set(wrapper, controller);
    const toolbar = document.createElement('div');
    toolbar.className = 'markdown-table-actions';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', t('Modifier le tableau'));
    const actions = [
      ['add-row', t('Ajouter une ligne')],
      ['remove-row', t('Supprimer la ligne')],
      ['add-column', t('Ajouter une colonne')],
      ['remove-column', t('Supprimer la colonne')],
    ] as const;
    for (const [index, [action, label]] of actions.entries()) {
      if (index === 2) {
        const separator = document.createElement('span');
        separator.className = 'markdown-table-action-separator';
        separator.setAttribute('aria-hidden', 'true');
        toolbar.append(separator);
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.action = action;
      button.dataset.tooltip = label;
      button.setAttribute('aria-label', label);
      button.append(tableActionIcon(action));
      toolbar.append(button);
    }
    if (!view.state.readOnly) wrapper.append(toolbar);
    const rendered = tableMarkup(this.source);
    if (rendered) {
      const viewport = document.createElement('div');
      viewport.className = 'markdown-table-viewport';
      viewport.append(rendered);
      wrapper.append(viewport);
    }

    const renderedCells = () =>
      Array.from(wrapper.querySelectorAll('tr')).map(
        (row) => Array.from(row.children) as HTMLElement[],
      );
    const refreshActions = () => {
      const removeRow = toolbar.querySelector<HTMLButtonElement>('[data-action="remove-row"]');
      const removeColumn = toolbar.querySelector<HTMLButtonElement>(
        '[data-action="remove-column"]',
      );
      if (removeRow) removeRow.disabled = controller.selected.row === 0;
      if (removeColumn) removeColumn.disabled = controller.widget.rows[0].cells.length <= 1;
    };
    const restore = () => {
      const next = tableMarkup(controller.widget.source);
      const current = wrapper.querySelector('table');
      if (next && current) current.replaceWith(next);
      setupCells();
    };
    const edit = (row: number, column: number, select = false) => {
      const cell = renderedCells()[row]?.[column];
      const range = cellAt(controller.widget.rows[row], column);
      if (!cell || !range || view.state.readOnly) return;
      controller.selected = { row, column };
      refreshActions();
      if (controller.active?.input.parentElement === cell) {
        controller.active.input.focus();
        return;
      }
      controller.active?.input.blur();
      const currentCell = renderedCells()[row]?.[column];
      if (!currentCell) return;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = displayCell(view.state.sliceDoc(range.from, range.to));
      input.setAttribute(
        'aria-label',
        t('Modifier la cellule ligne {0}, colonne {1}', { 0: row + 1, 1: column + 1 }),
      );
      input.className = 'markdown-table-cell-input';
      controller.active = { row, column, input, range };
      currentCell.replaceChildren(input);
      const syncSelection = () => {
        const active = controller.active;
        if (!active || active.input !== input) return;
        const base = active.range.from;
        const position = (offset: number) =>
          active.range.prefix
            ? base
            : Math.min(active.range.to, base + escapePipes(input.value.slice(0, offset)).length);
        const start = position(input.selectionStart ?? 0),
          end = position(input.selectionEnd ?? 0);
        const backwards = input.selectionDirection === 'backward';
        if (
          view.state.selection.main.anchor !== (backwards ? end : start) ||
          view.state.selection.main.head !== (backwards ? start : end)
        )
          view.dispatch({
            selection: { anchor: backwards ? end : start, head: backwards ? start : end },
          });
      };
      input.addEventListener('input', () => {
        const active = controller.active;
        if (!active || active.input !== input) return;
        const target = active.range;
        const value = escapePipes(input.value);
        const prefix = target.prefix ?? '';
        const suffix = target.suffix ?? '';
        const base = target.from + prefix.length;
        const start = base + escapePipes(input.value.slice(0, input.selectionStart ?? 0)).length;
        const end = base + escapePipes(input.value.slice(0, input.selectionEnd ?? 0)).length;
        const backwards = input.selectionDirection === 'backward';
        controller.writing = true;
        try {
          view.dispatch({
            changes: {
              from: target.from,
              to: target.to,
              insert: prefix + value + suffix,
            },
            selection: { anchor: backwards ? end : start, head: backwards ? start : end },
            userEvent: 'input.type',
          });
          active.range = {
            from: target.from + prefix.length,
            to: target.from + prefix.length + value.length,
          };
        } finally {
          controller.writing = false;
        }
      });
      input.addEventListener('select', syncSelection);
      input.addEventListener('click', syncSelection);
      input.addEventListener('keyup', syncSelection);
      input.addEventListener('keydown', (event) => {
        const mod = event.metaKey || event.ctrlKey;
        if (mod && (event.key.toLowerCase() === 'z' || event.key.toLowerCase() === 'y')) {
          event.preventDefault();
          event.stopPropagation();
          if (event.key.toLowerCase() === 'y' || event.shiftKey) redo(view);
          else undo(view);
          return;
        }
        if (event.key === 'Tab' || event.key === 'Enter') {
          const cells = renderedCells();
          const flat = cells.flat();
          const current = flat.indexOf(input.parentElement as HTMLElement);
          const next = current + (event.shiftKey ? -1 : 1);
          if (next >= 0 && next < flat.length) {
            event.preventDefault();
            const target = flat[next];
            const targetRow = cells.findIndex((items) => items.includes(target));
            edit(targetRow, cells[targetRow].indexOf(target));
          } else if (event.key === 'Enter') {
            event.preventDefault();
            input.blur();
            view.dispatch({
              selection: { anchor: Math.min(view.state.doc.length, controller.widget.to + 1) },
            });
            view.focus();
          }
        } else if (event.key === 'Escape') {
          event.preventDefault();
          input.blur();
          view.focus();
        }
      });
      input.addEventListener('blur', () => {
        if (controller.active?.input !== input) return;
        controller.active = null;
        restore();
      });
      input.focus();
      if (select) input.select();
      else input.setSelectionRange(input.value.length, input.value.length);
      syncSelection();
    };
    controller.edit = edit;
    const setupCells = () => {
      for (const [rowIndex, row] of renderedCells().entries())
        for (const [columnIndex, cell] of row.entries()) {
          cell.tabIndex = view.state.readOnly ? -1 : 0;
          cell.setAttribute('aria-label', `Ligne ${rowIndex + 1}, colonne ${columnIndex + 1}`);
        }
    };
    wrapper.addEventListener('mousedown', (event) => {
      if (event.button !== 0 || (event.target as Element).closest('input')) return;
      const cell = (event.target as Element).closest('td, th');
      if (!cell) return;
      const rows = renderedCells();
      const row = rows.findIndex((items) => items.includes(cell as HTMLElement));
      if (row < 0) return;
      event.preventDefault();
      edit(row, rows[row].indexOf(cell as HTMLElement));
    });
    wrapper.addEventListener('keydown', (event) => {
      if ((event.key !== 'Enter' && event.key !== ' ') || event.target instanceof HTMLInputElement)
        return;
      const cell = (event.target as Element).closest('td, th');
      if (!cell) return;
      const rows = renderedCells();
      const row = rows.findIndex((items) => items.includes(cell as HTMLElement));
      if (row < 0) return;
      event.preventDefault();
      edit(row, rows[row].indexOf(cell as HTMLElement));
    });
    toolbar.addEventListener('click', (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>('button[data-action]');
      if (!button || button.disabled) return;
      controller.active?.input.blur();
      const widget = controller.widget;
      const { row, column } = controller.selected;
      const columnCount = widget.rows[0].cells.length;
      const action = button.dataset.action;
      let nextRow = row,
        nextColumn = column;
      let changes: { from: number; to?: number; insert: string }[] = [];
      const formatRow = (values: string[]) => `| ${values.join(' | ')} |`;
      if (action === 'add-row') {
        const target = row === 0 ? widget.separator : widget.rows[row];
        const line = view.state.doc.lineAt('end' in target ? target.end : target.to);
        const start = 'start' in target ? target.start : target.from;
        const prefix = view.state.sliceDoc(line.from, start);
        changes = [
          { from: line.to, insert: `\n${prefix}${formatRow(Array(columnCount).fill(''))}` },
        ];
        nextRow = row === 0 ? 1 : row + 1;
      } else if (action === 'remove-row') {
        if (row === 0 || !widget.rows[row]) return;
        const line = view.state.doc.lineAt(widget.rows[row].start);
        changes =
          line.to < view.state.doc.length
            ? [{ from: line.from, to: line.to + 1, insert: '' }]
            : [{ from: Math.max(0, line.from - 1), to: line.to, insert: '' }];
        nextRow = Math.max(0, row - 1);
      } else if (action === 'add-column' || action === 'remove-column') {
        if (action === 'remove-column' && columnCount <= 1) return;
        const separatorText = view.state
          .sliceDoc(widget.separator.from, widget.separator.to)
          .trim();
        const alignment = separatorText
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((part) => part.trim());
        const mutate = (values: string[], fill: string) => {
          while (values.length < columnCount) values.push(fill);
          if (action === 'add-column') values.splice(column + 1, 0, fill);
          else values.splice(column, 1);
          return formatRow(values);
        };
        changes = widget.rows.map((item) => ({
          from: item.start,
          to: item.end,
          insert: mutate(
            item.cells.map((cell) => view.state.sliceDoc(cell.from, cell.to)),
            '',
          ),
        }));
        changes.push({
          from: widget.separator.from,
          to: widget.separator.to,
          insert: mutate(alignment, '---'),
        });
        changes.sort((a, b) => a.from - b.from);
        nextColumn = action === 'add-column' ? column + 1 : Math.max(0, column - 1);
      } else return;
      view.dispatch({ changes, userEvent: 'input.format', annotations: isolateHistory.of('full') });
      focusTableCoordinate(view, widget.from, nextRow, nextColumn);
    });
    setupCells();
    refreshActions();
    return wrapper;
  }

  updateDOM(wrapper: HTMLElement, view: EditorView) {
    const controller = controllers.get(wrapper);
    const current = wrapper.querySelector('table');
    const next = tableMarkup(this.source);
    if (!controller || !current || !next || this.quoted !== controller.widget.quoted) return false;
    const oldRows = Array.from(current.querySelectorAll('tr'));
    const newRows = Array.from(next.querySelectorAll('tr'));
    if (
      oldRows.length !== newRows.length ||
      oldRows.some((row, i) => row.children.length !== newRows[i].children.length)
    )
      return false;
    controller.widget = this;
    for (const [rowIndex, row] of oldRows.entries()) {
      for (const [columnIndex, cell] of Array.from(row.children).entries()) {
        const nextCell = newRows[rowIndex].children[columnIndex];
        const align = nextCell.getAttribute('align');
        if (align) cell.setAttribute('align', align);
        else cell.removeAttribute('align');
        const active = controller.active;
        if (active && active.row === rowIndex && active.column === columnIndex) {
          if (!controller.writing) {
            const range = cellAt(this.rows[rowIndex], columnIndex);
            if (range) {
              active.range = range;
              active.input.value = displayCell(view.state.sliceDoc(range.from, range.to));
            }
          }
        } else cell.replaceChildren(...Array.from(nextCell.childNodes));
      }
    }
    return true;
  }
}

function focusTableCoordinate(view: EditorView, from: number, row: number, column: number) {
  for (const wrapper of view.dom.querySelectorAll<HTMLElement>('.markdown-table-preview')) {
    const controller = controllers.get(wrapper);
    if (controller?.widget.from === from && controller.edit) {
      controller.edit(row, column);
      return true;
    }
  }
  return false;
}

/** Focus the selected cell after inserting a table through the formatting toolbar. */
export function focusTableCell(view: EditorView, position: number) {
  for (const wrapper of view.dom.querySelectorAll<HTMLElement>('.markdown-table-preview')) {
    const controller = controllers.get(wrapper);
    if (!controller) continue;
    for (const [rowIndex, row] of controller.widget.rows.entries()) {
      const columnIndex = row.cells.findIndex(
        (cell) => position >= cell.from && position <= cell.to,
      );
      if (columnIndex >= 0 && controller.edit) {
        controller.edit(rowIndex, columnIndex, true);
        return true;
      }
    }
  }
  return false;
}

function tables(state: EditorState): DecorationSet {
  const decorations: ReturnType<Decoration['range']>[] = [];
  const hidden = state.facet(tableHiddenRanges).flatMap((getRanges) => getRanges(state));
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Table') return;
      const from = state.doc.lineAt(node.from).from,
        { to } = node;
      if (hidden.some((range) => range.from < to && range.to > from)) return false;
      const rows = node.node.getChildren('TableHeader').concat(node.node.getChildren('TableRow'));
      const separator = node.node.getChild('TableDelimiter');
      if (!separator || !rows.length) return false;
      const source = [rows[0], separator, ...rows.slice(1)]
        .map((part) => state.sliceDoc(part.from, part.to))
        .join('\n');
      let ancestor = node.node.parent,
        quoted = false;
      while (ancestor) {
        if (ancestor.name === 'Blockquote') quoted = true;
        ancestor = ancestor.parent;
      }
      const widget = new TableWidget(
        source,
        from,
        to,
        rows.map((row) => tableRow(state, row)),
        { from: separator.from, to: separator.to },
        quoted,
      );
      decorations.push(Decoration.replace({ widget, block: true }).range(from, to));
      return false;
    },
  });
  return Decoration.set(decorations, true);
}

export const liveTables = StateField.define<DecorationSet>({
  create: tables,
  update(value, transaction) {
    const providers = transaction.state.facet(tableHiddenRanges);
    const hiddenChanged = providers.some((getRanges) => {
      const before = getRanges(transaction.startState),
        after = getRanges(transaction.state);
      return (
        before.length !== after.length ||
        before.some(
          (range, index) => range.from !== after[index].from || range.to !== after[index].to,
        )
      );
    });
    return transaction.reconfigured ||
      transaction.docChanged ||
      hiddenChanged ||
      syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
      ? tables(transaction.state)
      : value;
  },
  provide: (field) => EditorView.decorations.from(field),
});
