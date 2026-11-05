import { mountEditor } from './runtime/mount';
import { createEditorHandle } from './runtime/commands';
import { paintRevision } from './runtime/revision';
import type { EditorHandle, EditorProps as Props } from './types';
import { setNoteLinkData } from './noteLinks';
import { refreshSmartTags } from './smartTags';
import { entityMarks, setEntityMarks } from './entities';
import type { SelectedEntity } from '../enrichment/entityTypes';
import { t, useLocale } from '../i18n';
import { editorPhrases } from '../i18n/editor';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { type Span } from './composite';
import { type OutlineEditor } from './outline/state';
import { sentenceFocus, paragraphFocus, wordFocus, focusPreviewPosition } from './focus';
import { useContextMenu } from '../components/ContextMenu';
import { documentScroller } from './scrolling';
import { typewriterScrolling } from './typewriter';
import { createTypewriterSound, type TypewriterSound } from './typewriterSound';
export type { VisibleText, EditorHandle } from './types';

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
  useImperativeHandle(ref, () => createEditorHandle({ view, outlineRef, spans, latest }));
  useEffect(
    () =>
      mountEditor({
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
      }),
    [props.projectPath, props.generation, props.sections.map((s) => s.id).join(':')],
  );
  useEffect(() => {
    view.current?.dispatch({ effects: refreshSmartTags.of() });
  }, [props.smartTags, props.tagSections, props.immersiveFocus, props.generation]);
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
  const entityProject = useRef(props.projectPath);
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
    if (props.settings.enrichment && entityProject.current === props.projectPath) {
      for (const previous of v.state.field(entityMarks).mentions) {
        if (
          spans.current.some((s) => s.id === previous.section) &&
          !mentions.some((m) => m.from < previous.to && m.to > previous.from)
        )
          mentions.push(previous);
      }
    }
    entityProject.current = props.projectPath;
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
