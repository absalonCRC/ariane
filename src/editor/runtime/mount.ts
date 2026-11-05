import type { OutlineEditor } from '../outline/state';
import type { RefObject } from 'react';
import type { OpenMenu } from '../../components/ContextMenu';
import type { VisibleText, EditorProps as Props } from '../types';
import { noteCommands } from '../noteCommands';
import { smartTags } from '../smartTags';
import { effectiveTags } from '../../tags/model';
import { noteLinks } from '../noteLinks';
import { entityMarks, entityInteractions } from '../entities';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, drawSelection } from '@codemirror/view';
import { history, defaultKeymap, historyKeymap } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { liveMarkdown } from '../markdown';
import { compose, sectionMapping, type Span } from '../composite';
import type { Outline } from '../../contracts/project';
import { outlineEditor } from '../outline/state';
import { outlinePresentation } from '../outline/view';
import type { SelectionAnchor } from '../../components/SelectionToolbar';
import { editorContext } from '../contextMenu';
import { documentScroller, documentBounds, MANUSCRIPT_CHROME_INSET } from '../scrolling';
import { sceneHeadings } from '../sceneHeadings';
import { smoothCaret } from '../smoothCaret';
import { sectionDraft, type SectionDraft } from '../../project/draft';
import { DocumentCounts } from '../counts';
import { findTextMatch, highlightTextMatch, textSearchHighlight } from '../textSearch';
import { prepareCitationInsertion } from '../citationInsertion';
interface RuntimeRefs {
  host: RefObject<HTMLDivElement | null>;
  latest: RefObject<Props>;
  spans: RefObject<Span[]>;
  outlineRef: RefObject<OutlineEditor | null>;
  view: RefObject<EditorView | null>;
  notifyTimer: RefObject<NodeJS.Timeout | null>;
  options: RefObject<Compartment>;
  wordTimer: RefObject<NodeJS.Timeout | null>;
  menuRef: RefObject<OpenMenu>;
  focusPreviewScroll: RefObject<{ scroller: HTMLElement; top: number; left: number } | null>;
}
export function mountEditor({
  host,
  latest,
  spans,
  outlineRef,
  view,
  notifyTimer,
  options,
  wordTimer,
  menuRef,
  focusPreviewScroll,
}: RuntimeRefs) {
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
  const tags = smartTags(outline, {
    tags: () => latest.current.smartTags ?? [],
    onTag: (id) => latest.current.onSmartTag?.(id),
    onPending: (task) => latest.current.onTagWork?.(task),
    sections: () => latest.current.tagSections ?? latest.current.sections,
    hidden: () => !!latest.current.immersiveFocus,
    create: (name) =>
      latest.current.createSmartTag
        ? latest.current.createSmartTag(name)
        : Promise.reject(new Error('Smart-tag indisponible.')),
    onError: (error) => latest.current.onNoteError?.(error),
    isCurrent: (candidate) => view.current === candidate,
    standalone: !(latest.current.noteLookup && latest.current.noteCreate),
  });
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
              additionalCompletions: [tags.source],
              lookup: (query) => latest.current.noteLookup!(query),
              create: (name, context) => latest.current.noteCreate!(name, context),
              isCurrent: (candidate) => view.current === candidate,
              onError: (error) => latest.current.onNoteError?.(error),
            }),
          ]
        : []),
      // Note validation must run before the outline Enter binding at the same precedence.
      tags.extensions,
      outlinePresentation(outline, tags.tagsForNode, (section, node) => {
        const current = view.current;
        const span = current?.state.field(mapping.field).find((s) => s.id === section);
        if (current && span)
          latest.current.onOutlineDetails?.(section, node, outline.serialize(current.state, span));
      }),
      ...(data.spans.length > 1 || (data.spans.length === 1 && latest.current.settings.continuous)
        ? [
            sceneHeadings(
              mapping.field,
              (section) =>
                latest.current.immersiveFocus
                  ? []
                  : effectiveTags(
                      latest.current.smartTags ?? [],
                      latest.current.tagSections ?? latest.current.sections,
                      section,
                    ),
              (id) => latest.current.onSmartTag?.(id),
              (assignment) => {
                void Promise.resolve(
                  latest.current.onRemoveSmartTag?.(
                    assignment.section,
                    assignment.node,
                    assignment.tag.id,
                  ),
                ).catch((error) => latest.current.onNoteError?.(error));
              },
            ),
          ]
        : []),
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
      keymap.of(
        ['ArrowDown', 'ArrowUp'].map((key) => ({
          key,
          run: (v: EditorView) => {
            const query = latest.current.searchQuery;
            if (!query?.trim() || v.composing) return false;
            const direction = key === 'ArrowUp' ? 'previous' : 'next';
            const match = findTextMatch(v.state, query, direction);
            const node = match
              ? [...v.state.field(outline.field).nodes].reverse().find((n) => n.from <= match.from)
              : null;
            if (node) outline.reveal(v, node.id, false);
            highlightTextMatch(v, query, direction, false, match);
            return true;
          },
        })),
      ),
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
  const unregisterTags = latest.current.registerTagFlusher?.(() => tags.flush(v));
  return () => {
    unregisterTags?.();
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
}
