import { noteCommands, type NoteRef } from './noteCommands';
import { noteLinks, setNoteLinkData } from './noteLinks';
import { entityMarks, entityInteractions, setEntityMarks } from './entities';
import type { EntityBatch, SelectedEntity } from '../enrichment/entityTypes';
import { t, useLocale } from '../i18n';
import { editorPhrases } from '../i18n/editor';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap, isolateHistory } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { liveMarkdown } from './markdown';
import { focusTableCell } from './liveTables';
import { compose, sectionMapping, type Span } from './composite';
import type { Outline, Section, Settings } from '../app/types';
import { outlineEditor, type OutlineEditor } from './outline/state';
import { outlinePresentation } from './outline/view';
import { prepareTextInsertion } from './insertion';
import { analyze } from '../revision/diagnostics';
import { sentenceFocus, paragraphFocus, wordFocus, focusPreviewPosition } from './focus';
import type { SelectionAnchor } from '../components/SelectionToolbar';
import { useContextMenu } from '../components/ContextMenu';
import { editorContext } from './contextMenu';
import { documentScroller, documentBounds, MANUSCRIPT_CHROME_INSET } from './scrolling';
import { typewriterScrolling } from './typewriter';
import { sceneHeadings } from './sceneHeadings';
import { smoothCaret } from './smoothCaret';
import { sectionDraft, type SectionDraft } from '../project/draft';
import { DocumentCounts } from './counts';
import { highlightTextMatch, textSearchHighlight } from './textSearch';
import { formatMarkdown, type MarkdownFormat } from './formatMarkdown';
import { prepareCitationInsertion } from './citationInsertion';
import { reviewTarget, type ReviewTarget } from './reviewTarget';
import { createTypewriterSound, type TypewriterSound } from './typewriterSound';
export interface VisibleText {
  cursor?: number;
  text: string;
  from: number;
  allowEnd: boolean;
  paragraphs: { line: number; text: string; top: number; from?: number }[];
  bounds?: { top: number; bottom: number; right: number };
}
export interface EditorHandle {
  context: () => { section: string; node: string | null; offset: number; cursor: number } | null;
  contextTop: (section: string, node: string | null) => number | null;
  restoreContext: (context: {
    section: string;
    node: string | null;
    offset: number;
    cursor: number;
  }) => boolean;
  insert: (text: string) => void;
  text: () => string;
  focus: () => void;
  selection: () => string;
  cursor: () => number;
  prepareInsertion: () => ((text: string) => boolean) & { before?: string; after?: string };
  prepareCitation: () => (text: string) => boolean;
  passage: () => { section: string; from: number; to: number; text: string } | null;
  revealNode: (id: string) => boolean;
  findText: (query: string, direction?: 'next' | 'previous') => void;
  clearTextSearch: () => void;
  revealMatch: (section: string, from: number | null, query: string) => boolean;
  format: (format: MarkdownFormat) => void;
  reviewTarget: () => ReviewTarget | null;
  structure: (command: 'indent' | 'outdent' | 'up' | 'down' | 'fold') => void;
}
interface Props {
  sections: Section[];
  entities?: EntityBatch[];
  onEntity?: (mention: SelectedEntity) => void;
  noteLookup?: (query: string) => Promise<NoteRef[]>;
  noteCreate?: (name: string, context: string) => Promise<NoteRef>;
  noteResolve?: (ids: string[]) => Promise<NoteRef[]>;
  sourceVersion?: number;
  onOpenNote?: (id: string) => void;
  onNoteError?: (error: unknown) => void;
  projectPath?: string;
  generation: number;
  readOnly?: boolean;
  settings: Settings;
  immersiveFocus?: boolean;
  focusPreview?: Settings['focus'] | null;
  scrollPreview?: boolean | null;
  onChange: (changes: Map<string, string>, outlines?: Map<string, Outline>) => void;
  onDraftChange?: (drafts: Map<string, SectionDraft>) => void;
  onVisible: (value: VisibleText) => void;
  onWords: (words: number) => void;
  onCharacters: (characters: number) => void;
  onLines?: (lines: number) => void;
  onCursor: (cursor: number) => void;
  onTyping: () => void;
  onSearchSources?: (text: string) => void;
  onSelection?: (anchor: SelectionAnchor | null) => void;
}
export const Editor = forwardRef<EditorHandle, Props>(function Editor(props, ref) {
  const locale = useLocale();
  const openMenu = useContextMenu();
  const menuRef = useRef(openMenu);
  menuRef.current = openMenu;
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const spans = useRef<Span[]>([]);
  const outlineRef = useRef<OutlineEditor | null>(null);
  const options = useRef(new Compartment());
  const notifyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const focusPreviewScroll = useRef<{ scroller: HTMLElement; top: number; left: number } | null>(
    null,
  );
  const typingSound = useRef<TypewriterSound | null>(null);
  useEffect(() => {
    if (!props.settings.typewriter || !props.settings.typewriterSound) return;
    const sound = createTypewriterSound();
    typingSound.current = sound;
    return () => {
      typingSound.current = null;
      sound.destroy();
    };
  }, [props.settings.typewriter, props.settings.typewriterSound]);
  useImperativeHandle(ref, () => ({
    context() {
      const v = view.current,
        outline = outlineRef.current;
      if (!v || !outline) return null;
      const cursor = v.state.selection.main.head;
      const span = spans.current.find((s) => cursor >= s.from && cursor <= s.to);
      if (!span) return null;
      const entry = [...v.state.field(outline.field).nodes]
        .reverse()
        .find((n) => n.section === span.id && n.from <= cursor);
      const persisted = latest.current.sections.find((s) => s.id === span.id)?.outline;
      return {
        section: span.id,
        node: persisted ? (entry?.id ?? null) : null,
        offset: cursor - (entry?.from ?? span.from),
        cursor,
      };
    },
    contextTop(section, node) {
      const v = view.current,
        outline = outlineRef.current;
      if (!v || !outline) return null;
      const from = node
        ? v.state.field(outline.field).nodes.find((n) => n.section === section && n.id === node)
            ?.from
        : spans.current.find((s) => s.id === section)?.from;
      if (from === undefined) return null;
      const top = v.coordsAtPos(from)?.top;
      const bounds = documentBounds(v);
      return top !== undefined && top >= bounds.top && top < bounds.bottom - 35 ? top : null;
    },
    restoreContext(context) {
      const v = view.current,
        outline = outlineRef.current;
      if (!v || !outline) return false;
      const span = spans.current.find((s) => s.id === context.section);
      if (!span) return false;
      const nodes = v.state.field(outline.field).nodes;
      const entry = nodes.find((n) => n.section === context.section && n.id === context.node);
      if (entry) outline.reveal(v, entry.id);
      const next = entry ? (nodes.find((n) => n.from > entry.from)?.from ?? span.to) : span.to;
      const position = entry
        ? Math.min(entry.from + context.offset, next)
        : Math.min(span.to, Math.max(span.from, context.cursor));
      v.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: 'center' }),
      });
      return true;
    },
    insert(text) {
      const v = view.current;
      if (!v) return;
      v.dispatch(v.state.replaceSelection(text));
      v.focus();
    },
    text: () => view.current?.state.doc.toString() || '',
    focus: () => view.current?.focus(),
    structure(command) {
      const v = view.current,
        outline = outlineRef.current;
      if (!v || !outline) return;
      if (command === 'up' || command === 'down') outline.move(v, command === 'up' ? -1 : 1);
      else if (command === 'fold') outline.toggleFold(v);
      else outline[command](v);
      v.focus();
    },
    format: (format) => {
      const v = view.current;
      if (!v || !spans.current.length) return;
      v.dispatch({
        ...formatMarkdown(v.state, format, spans.current),
        annotations: isolateHistory.of('full'),
      });
      if (format !== 'table' || !focusTableCell(v, v.state.selection.main.from)) v.focus();
    },
    revealNode: (id) =>
      view.current && outlineRef.current ? outlineRef.current.reveal(view.current, id) : false,
    findText: (query, direction) => {
      if (view.current) highlightTextMatch(view.current, query, direction);
    },
    revealMatch(section, from, query) {
      const v = view.current,
        outline = outlineRef.current;
      const span = spans.current.find((s) => s.id === section);
      if (!v || !span) return false;
      const position = Math.min(span.to, span.from + (from ?? 0));
      const node = outline
        ? [...v.state.field(outline.field).nodes]
            .reverse()
            .find((n) => n.section === section && n.from <= position)
        : null;
      if (node && outline) outline.reveal(v, node.id);
      v.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: 'center' }),
      });
      highlightTextMatch(v, from === null ? '' : query, 'current', true);
      return true;
    },
    clearTextSearch: () => {
      if (view.current) highlightTextMatch(view.current, '', 'current', true);
    },
    selection: () => {
      const v = view.current;
      if (!v) return '';
      const s = v.state.selection.main;
      return v.state.sliceDoc(s.from, s.to);
    },
    cursor: () => view.current?.state.selection.main.head || 0,
    reviewTarget: () =>
      view.current ? reviewTarget(view.current, spans.current, () => view.current) : null,
    passage() {
      const v = view.current;
      if (!v) return null;
      const selection = v.state.selection.main;
      const span = spans.current.find((s) => selection.from >= s.from && selection.to <= s.to);
      return span
        ? {
            section: span.id,
            from: selection.from - span.from,
            to: selection.to - span.from,
            text: v.state.sliceDoc(selection.from, selection.to),
          }
        : null;
    },
    prepareCitation() {
      return view.current
        ? prepareCitationInsertion(view.current, spans.current, () => view.current)
        : () => false;
    },
    prepareInsertion() {
      const v = view.current;
      if (!v) return () => false;
      return prepareTextInsertion(v, () => view.current);
    },
  }));
  useEffect(() => {
    if (!host.current) return;
    if (!latest.current.sections.length) {
      spans.current = [];
      outlineRef.current = null;
      latest.current.onWords(0);
      latest.current.onCharacters(0);
      latest.current.onLines?.(0);
      latest.current.onCursor(0);
      latest.current.onVisible({ text: '', from: 0, allowEnd: false, paragraphs: [] });
      return;
    }
    const data = compose(latest.current.sections);
    const counter = new DocumentCounts((words, characters) => {
      latest.current.onWords(words);
      latest.current.onCharacters(characters);
    });
    const pendingCounts = new Map<string, SectionDraft>();
    spans.current = data.spans;
    const mapping = sectionMapping(data.spans);
    const outline = outlineEditor(latest.current.sections, data.spans, mapping.field);
    outlineRef.current = outline;
    let sampled: VisibleText | null = null;
    let geometryFrame = 0;
    const selectionMeasureKey = {};
    const selectionGeometry = () => {
      const v = view.current;
      if (!v) return;
      v.requestMeasure({
        key: selectionMeasureKey,
        read: (): SelectionAnchor | null => {
          const selection = v.state.selection.main;
          const active = document.activeElement;
          if (
            selection.empty ||
            v.state.readOnly ||
            v.composing ||
            (!v.hasFocus &&
              !(active instanceof HTMLElement && active.closest('.selection-toolbar'))) ||
            !spans.current.some((span) => selection.from >= span.from && selection.to <= span.to)
          )
            return null;
          const first = v.coordsAtPos(selection.from),
            last = v.coordsAtPos(selection.to, -1);
          const box = documentBounds(v);
          if (!first || first.top < box.top || first.top >= box.bottom - 30) return null;
          return {
            top: first.top,
            bottom: first.bottom,
            left:
              last && Math.abs(first.top - last.top) < 2
                ? (first.left + last.right) / 2
                : (box.left + box.right) / 2,
          };
        },
        write: (anchor) => latest.current.onSelection?.(anchor),
      });
    };
    const bounds = (v: EditorView) => {
      const rect = documentBounds(v);
      return { top: rect.top, bottom: rect.bottom, right: rect.right };
    };
    // Move existing anchors immediately; source detection remains debounced.
    const geometry = () => {
      cancelAnimationFrame(geometryFrame);
      geometryFrame = requestAnimationFrame(() => {
        const v = view.current;
        if (!v || !sampled) return;
        sampled = {
          ...sampled,
          bounds: bounds(v),
          paragraphs: sampled.paragraphs.map((p) => ({
            ...p,
            top:
              p.from === undefined || p.from > v.state.doc.length
                ? Infinity
                : (v.coordsAtPos(p.from)?.top ?? Infinity),
          })),
        };
        latest.current.onVisible(sampled);
      });
    };
    const visible = () => {
      const v = view.current;
      if (!v || v.composing) return;
      const { from, to } = v.viewport;
      const viewportBounds = documentBounds(v);
      // A wrapped Markdown paragraph can be enormous; source lookup stays bounded.
      const sampleFrom = v.visibleRanges[0]?.from ?? from;
      const sampleTo = Math.min(v.visibleRanges.at(-1)?.to ?? to, sampleFrom + 8000);
      const first = v.state.doc.lineAt(sampleFrom),
        last = v.state.doc.lineAt(sampleTo);
      const paragraphs = [];
      for (let n = first.number; n <= Math.min(last.number, first.number + 80); n++) {
        const line = v.state.doc.line(n);
        if (!line.text.trim()) continue;
        const start = Math.max(line.from, sampleFrom);
        const text = v.state.sliceDoc(start, Math.min(line.to, sampleTo));
        const coords = v.coordsAtPos(start);
        if (
          coords &&
          coords.top >= viewportBounds.top - 10 &&
          coords.top < viewportBounds.bottom - 10
        )
          paragraphs.push({ line: n, text, top: coords.top, from: start });
      }
      sampled = {
        bounds: bounds(v),
        cursor: v.state.selection.main.head,
        text: v.state.sliceDoc(sampleFrom, sampleTo),
        from: sampleFrom,
        allowEnd: sampleTo === last.to && (!v.hasFocus || v.state.selection.main.head < sampleTo),
        paragraphs,
      };
      latest.current.onVisible(sampled);
    };
    const schedule = () => {
      if (notifyTimer.current) clearTimeout(notifyTimer.current);
      notifyTimer.current = setTimeout(visible, 600);
    };
    const count = () => {
      latest.current.onLines?.(view.current?.state.doc.lines ?? 1);
      counter.update(Array.from(pendingCounts, ([id, draft]) => ({ id, text: draft().text })));
      pendingCounts.clear();
    };
    const state = EditorState.create({
      doc: data.text,
      selection: { anchor: Math.min(latest.current.settings.cursor, data.text.length) },
      extensions: [
        history(),
        EditorState.transactionFilter.of((tr) =>
          tr.docChanged && latest.current.readOnly ? [] : tr,
        ),
        mapping.extensions,
        outline.extensions,
        drawSelection(),
        smoothCaret,
        markdown({ base: markdownLanguage }),
        liveMarkdown,
        noteLinks(
          (id) => latest.current.onOpenNote?.(id),
          (ids) => latest.current.noteResolve?.(ids) ?? Promise.resolve([]),
        ),
        ...(latest.current.noteLookup && latest.current.noteCreate
          ? [
              noteCommands({
                lookup: (query) => latest.current.noteLookup!(query),
                create: (name, context) => latest.current.noteCreate!(name, context),
                isCurrent: (candidate) => view.current === candidate,
                onError: (error) => latest.current.onNoteError?.(error),
              }),
            ]
          : []),
        // Note validation must run before the outline Enter binding at the same precedence.
        outlinePresentation(outline),
        ...(data.spans.length > 1 ? [sceneHeadings(mapping.field)] : []),
        highlightSelectionMatches(),
        textSearchHighlight,
        entityMarks,
        entityInteractions((mention) => {
          const span = spans.current.find((s) => s.id === mention.section);
          if (span)
            latest.current.onEntity?.({
              ...mention,
              from: mention.from - span.from,
              to: mention.to - span.from,
            });
        }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.lineWrapping,
        EditorView.scrollMargins.of((view) =>
          documentScroller(view) === view.scrollDOM
            ? null
            : { top: MANUSCRIPT_CHROME_INSET, bottom: MANUSCRIPT_CHROME_INSET },
        ),
        EditorView.contentAttributes.of({
          spellcheck: 'true',
          lang: latest.current.settings.language,
        }),
        options.current.of([]),
        EditorView.updateListener.of((u) => {
          const before = u.startState.field(outline.field).nodes;
          const after = u.state.field(outline.field).nodes;
          if (u.docChanged || before !== after) {
            const touched = u.state.field(outline.field).changedSections;
            spans.current = u.state.field(mapping.field);
            const snapshot = u.state;
            const drafts = new Map<string, SectionDraft>();
            for (const span of spans.current)
              if (touched.has(span.id)) {
                const draft = sectionDraft(() => {
                  const text = snapshot.sliceDoc(span.from, span.to);
                  const value = outline.serialize(snapshot, span);
                  return {
                    text,
                    outline: { ...value, nodes: value.nodes.filter((n) => n.start <= text.length) },
                  };
                });
                drafts.set(span.id, draft);
                pendingCounts.set(span.id, draft);
              }
            if (latest.current.onDraftChange) latest.current.onDraftChange(drafts);
            else {
              const changes = new Map<string, string>(),
                outlines = new Map<string, Outline>();
              for (const [id, draft] of drafts) {
                const value = draft();
                changes.set(id, value.text);
                if (value.outline) outlines.set(id, value.outline);
              }
              latest.current.onChange(changes, outlines);
            }
            sampled = null;
            latest.current.onTyping();
            if (wordTimer.current) clearTimeout(wordTimer.current);
            wordTimer.current = setTimeout(count, 350);
          }
          if (u.docChanged || u.viewportChanged || u.selectionSet) {
            schedule();
          }
          if (u.geometryChanged && !u.docChanged) geometry();
          if (u.selectionSet || u.docChanged || u.geometryChanged || u.focusChanged)
            selectionGeometry();
          if (u.selectionSet) latest.current.onCursor(u.state.selection.main.head);
        }),
        EditorView.domEventHandlers({
          mousedown: (event) => {
            // The context handler decides whether to preserve or move the selection.
            if (event.button === 2 || (event.button === 0 && event.ctrlKey)) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          contextmenu: (event, currentView) => {
            const handle = (event.target as HTMLElement).closest<HTMLElement>(
              '[data-outline-handle]',
            );
            const node =
              handle &&
              currentView.state
                .field(outline.field)
                .nodes.find((node) => node.id === handle.dataset.outlineHandle);
            const position = node
              ? node.from
              : event.clientX || event.clientY
                ? currentView.posAtCoords({ x: event.clientX, y: event.clientY })
                : null;
            const selected = currentView.state.selection.main;
            if (
              position !== null &&
              (selected.empty || position < selected.from || position > selected.to)
            )
              currentView.dispatch({
                selection: { anchor: position },
                userEvent: 'select.context',
              });
            else currentView.dispatch({ userEvent: 'select.context' });
            const coords = currentView.coordsAtPos(currentView.state.selection.main.head);
            menuRef.current(
              {
                clientX: event.clientX || coords?.left || 0,
                clientY: event.clientY || coords?.bottom || 0,
                currentTarget: currentView.contentDOM,
                preventDefault: () => event.preventDefault(),
                stopPropagation: () => event.stopPropagation(),
              },
              editorContext(
                currentView,
                outline,
                spans.current,
                () => view.current,
                latest.current.onSearchSources,
              ),
            );
            return event.defaultPrevented;
          },
          scroll: () => {
            geometry();
            schedule();
            return false;
          },
          drop: (e, v) => {
            if (e.dataTransfer?.types.includes('application/x-ariane-citation')) {
              e.preventDefault();
              const pos =
                v.posAtCoords({ x: e.clientX, y: e.clientY }) ?? v.state.selection.main.head;
              prepareCitationInsertion(v, spans.current, () => view.current, {
                from: pos,
                to: pos,
              })(e.dataTransfer.getData('application/x-ariane-citation'));
              return true;
            }
            return false;
          },
        }),
      ],
    });
    const v = new EditorView({ state, parent: host.current });
    view.current = v;
    // Persist the outline's existing logical boundaries before the first
    // analysis, including legacy pages. Text remains byte-for-byte unchanged.
    if (latest.current.onDraftChange) {
      const initial = new Map<string, SectionDraft>();
      for (const span of data.spans) {
        const section = latest.current.sections.find((s) => s.id === span.id);
        if (!section || section.outline) continue;
        const text = section.text;
        const value = outline.serialize(v.state, span);
        initial.set(
          span.id,
          sectionDraft(() => ({
            text,
            outline: { ...value, nodes: value.nodes.filter((n) => n.start <= text.length) },
          })),
        );
      }
      if (initial.size) latest.current.onDraftChange(initial);
    }
    // Keep the first visible passage in place when a sidebar changes the wrapping width.
    let anchor: { pos: number; offset: number } | null = null;
    let frame = 0;
    let width = v.scrollDOM.clientWidth;
    const typography = () => {
      const style = getComputedStyle(v.dom);
      return `${style.fontSize}/${style.lineHeight}/${style.fontFamily}`;
    };
    let textStyle = typography();
    const rememberAnchor = () => {
      const bounds = documentBounds(v);
      const pos = v.posAtCoords({
        x: bounds.left + Math.min(60, bounds.width / 2),
        y: bounds.top + 8,
      });
      const coords = pos === null ? null : v.coordsAtPos(pos);
      if (pos !== null && coords) anchor = { pos, offset: coords.top - bounds.top };
    };
    const rememberLater = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(rememberAnchor);
    };
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            geometry();
            const nextWidth = v.scrollDOM.clientWidth;
            const nextStyle = typography();
            if (nextWidth === width && nextStyle === textStyle) return;
            width = nextWidth;
            textStyle = nextStyle;
            const previous = anchor;
            if (!previous) {
              rememberLater();
              return;
            }
            v.requestMeasure({
              read: () => {
                const pos = Math.min(previous.pos, v.state.doc.length);
                const coords = v.coordsAtPos(pos);
                return coords ? coords.top - documentBounds(v).top - previous.offset : 0;
              },
              write: (delta) => {
                if (delta) documentScroller(v).scrollTop += delta;
                rememberLater();
              },
            });
          });
    observer?.observe(v.scrollDOM);
    const scroller = documentScroller(v);
    const scrolled = () => {
      rememberLater();
      geometry();
      schedule();
      selectionGeometry();
    };
    scroller.addEventListener('scroll', scrolled, { passive: true });
    const resized = () => {
      geometry();
      selectionGeometry();
    };
    window.addEventListener('resize', resized);
    rememberLater();
    counter.update(
      data.spans.map((span) => ({ id: span.id, text: data.text.slice(span.from, span.to) })),
    );
    count();
    schedule();
    v.dispatch({
      effects: EditorView.scrollIntoView(v.state.selection.main.head, { y: 'center' }),
    });
    return () => {
      if (notifyTimer.current) clearTimeout(notifyTimer.current);
      if (wordTimer.current) clearTimeout(wordTimer.current);
      latest.current.onSelection?.(null);
      counter.destroy();
      observer?.disconnect();
      scroller.removeEventListener('scroll', scrolled);
      window.removeEventListener('resize', resized);
      cancelAnimationFrame(frame);
      cancelAnimationFrame(geometryFrame);
      v.destroy();
      view.current = null;
      outlineRef.current = null;
      focusPreviewScroll.current = null;
    };
  }, [props.projectPath, props.generation, props.sections.map((s) => s.id).join(':')]);
  useEffect(() => {
    view.current?.dispatch({
      effects: setNoteLinkData.of({
        colors: props.settings.entityColors ?? {},
        enabled: !props.immersiveFocus && props.settings.entityHighlighting !== false,
        refresh: true,
      }),
    });
  }, [
    props.settings.entityColors,
    props.settings.entityHighlighting,
    props.immersiveFocus,
    props.sourceVersion,
    props.projectPath,
    props.generation,
    props.sections.map((s) => s.id).join(':'),
  ]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const mentions: SelectedEntity[] = [];
    if (props.settings.enrichment) {
      for (const batch of props.entities ?? []) {
        const span = spans.current.find((s) => s.id === batch.section);
        if (
          !span ||
          v.state.sliceDoc(span.from, span.to).replace(/\n+$/, '') !==
            batch.text.replace(/\n+$/, '')
        )
          continue;
        for (const mention of batch.mentions) {
          const nodes = outlineRef.current ? v.state.field(outlineRef.current.field).nodes : [];
          const entry = [...nodes]
            .reverse()
            .find((n) => n.section === batch.section && n.from <= span.from + mention.from);
          mentions.push({
            ...mention,
            section: batch.section,
            revision: batch.revision,
            from: span.from + mention.from,
            to: span.from + mention.to,
            blockFrom: entry?.from,
            blockTo: entry
              ? (nodes.find((n) => n.section === batch.section && n.from > entry.from)?.from ??
                span.to)
              : undefined,
          });
        }
      }
    }
    v.dispatch({
      effects: setEntityMarks.of({
        mentions,
        colors: props.settings.entityColors ?? {},
        enabled: !props.immersiveFocus && props.settings.entityHighlighting !== false,
        hidden: props.immersiveFocus,
      }),
    });
  }, [
    props.entities,
    props.settings.entityColors,
    props.settings.entityHighlighting,
    props.settings.enrichment,
    props.immersiveFocus,
    props.generation,
    props.sections.map((s) => s.id).join(':'),
    locale,
  ]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const mode = props.focusPreview ?? props.settings.focus;
    v.dom.dataset.focus = mode;
    v.contentDOM.lang = props.settings.language;
    const visualTypewriter = props.scrollPreview ?? props.settings.typewriter;
    v.dom.dataset.typewriter = String(visualTypewriter);
    const diagnostics = props.settings.revision
      ? EditorView.updateListener.of((u) => {
          if (u.docChanged || u.viewportChanged) paintRevision(u.view);
        })
      : [];
    v.dispatch({
      effects: options.current.reconfigure([
        diagnostics,
        EditorState.phrases.of(editorPhrases()),
        EditorView.contentAttributes.of({
          'aria-label': t('Manuscrit'),
          lang: props.settings.language,
        }),
        EditorState.readOnly.of(!!props.readOnly),
        ...(mode === 'sentence'
          ? [sentenceFocus(props.focusPreview != null)]
          : mode === 'paragraph'
            ? [paragraphFocus(props.focusPreview != null)]
            : mode === 'word'
              ? [wordFocus(props.focusPreview != null)]
              : []),
        ...(visualTypewriter ? [typewriterScrolling(props.scrollPreview != null)] : []),
      ]),
    });
    if (visualTypewriter) v.requestMeasure();
    if (props.settings.revision) paintRevision(v);
    else v.dom.querySelectorAll('[data-remark]').forEach((e) => e.removeAttribute('data-remark'));
  }, [
    locale,
    props.readOnly,
    props.settings.focus,
    props.focusPreview,
    props.settings.revision,
    props.settings.language,
    props.settings.typewriter,
    props.scrollPreview,
    props.generation,
    props.sections.map((section) => section.id).join(':'),
  ]);
  useEffect(() => {
    const v = view.current;
    if (!v) return;
    const needsPreviewPosition =
      (props.focusPreview != null && props.focusPreview !== 'none') || props.scrollPreview != null;
    if (needsPreviewPosition) {
      const scroller = documentScroller(v);
      if (!focusPreviewScroll.current)
        focusPreviewScroll.current = {
          scroller,
          top: scroller.scrollTop,
          left: scroller.scrollLeft,
        };
      v.dispatch({
        effects: EditorView.scrollIntoView(focusPreviewPosition(v.state.doc), {
          y: props.scrollPreview === true ? 'center' : 'nearest',
        }),
      });
    } else if (
      props.focusPreview == null &&
      props.scrollPreview == null &&
      focusPreviewScroll.current
    ) {
      const { scroller, top, left } = focusPreviewScroll.current;
      focusPreviewScroll.current = null;
      scroller.scrollTop = top;
      scroller.scrollLeft = left;
    }
  }, [
    props.focusPreview,
    props.scrollPreview,
    props.generation,
    props.sections.map((section) => section.id).join(':'),
  ]);
  return (
    <div
      className={
        'editor-host ' +
        ((props.focusPreview ?? props.settings.focus) !== 'none' ? 'concentrating' : '')
      }
      onKeyDownCapture={(event) => {
        const target = event.target;
        const v = view.current;
        if (
          !props.settings.typewriter ||
          !props.settings.typewriterSound ||
          props.readOnly ||
          !v ||
          !(target instanceof HTMLElement) ||
          !v.contentDOM.contains(target) ||
          event.metaKey ||
          (event.ctrlKey && !event.getModifierState('AltGraph')) ||
          event.nativeEvent.isComposing
        )
          return;
        const table = target.closest('.markdown-table-preview');
        const tableInput = table && target instanceof HTMLInputElement && !target.readOnly;
        if (
          table
            ? !tableInput
            : !!target.closest('button, input, textarea, select, [contenteditable="false"]')
        )
          return;
        const key = event.key;
        if (key === 'Enter') {
          // Enter in a table moves between cells; it does not insert a line break.
          if (!tableInput) typingSound.current?.play('return');
        } else if (key === 'Backspace' || key === 'Delete') typingSound.current?.play('delete');
        else if (key === ' ') typingSound.current?.play('space');
        else if (Array.from(key).length === 1) typingSound.current?.play('key');
      }}
      style={
        {
          '--writing-size': props.settings.fontSize + 'px',
          '--writing-leading': props.settings.lineHeight ?? 1.5,
          ...(props.sections.length ? {} : { height: 0 }),
        } as React.CSSProperties
      }
      ref={host}
    />
  );
});
function paintRevision(v: EditorView) {
  for (const line of v.dom.querySelectorAll('.cm-line')) {
    const text = line.textContent || '';
    const remarks = analyze(text);
    if (remarks.length) {
      line.setAttribute('data-remark', remarks[0].message);
      line.setAttribute('title', remarks.map((r) => r.message).join('\n'));
    } else {
      line.removeAttribute('data-remark');
      line.removeAttribute('title');
    }
  }
}
