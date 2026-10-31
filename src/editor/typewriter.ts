import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

// Measure after CodeMirror has laid out wrapped lines. Scrolling never changes selection.
export function typewriterScrolling() {
  return ViewPlugin.fromClass(
    class {
      observer: ResizeObserver;
      frame = 0;
      dragging = false;
      column: HTMLElement | null;
      constructor(readonly view: EditorView) {
        this.column = view.dom.closest('.manuscript-column');
        this.observer = new ResizeObserver(() => this.measure(false));
        this.observer.observe(view.scrollDOM);
        view.scrollDOM.addEventListener('scroll', this.syncTitle, { passive: true });
        view.scrollDOM.addEventListener('pointerdown', this.pointerDown);
        window.addEventListener('pointerup', this.pointerUp);
        this.syncTitle();
        this.measure(false);
      }
      syncTitle = () => {
        this.column?.style.setProperty(
          '--typewriter-title-offset',
          `${-this.view.scrollDOM.scrollTop}px`,
        );
      };
      pointerDown = () => {
        this.dragging = true;
      };
      pointerUp = () => {
        this.dragging = false;
      };
      update(u: ViewUpdate) {
        if (u.docChanged || u.selectionSet || u.heightChanged)
          this.measure(u.docChanged || u.selectionSet);
      }
      measure(animate: boolean) {
        const v = this.view;
        v.requestMeasure({
          key: this,
          read: () => {
            const scroller = v.scrollDOM;
            const height = scroller.clientHeight;
            const caret = v.coordsAtPos(v.state.selection.main.head);
            const box = scroller.getBoundingClientRect();
            const center = Math.max(0, Math.min(height, window.innerHeight / 2 - box.top));
            return {
              height,
              center,
              target: caret
                ? Math.max(
                    0,
                    scroller.scrollTop + (caret.top + caret.bottom) / 2 - box.top - center,
                  )
                : null,
            };
          },
          write: ({ height, center, target }) => {
            const value = height + 'px';
            const centerValue = center + 'px';
            if (
              v.dom.style.getPropertyValue('--typewriter-height') !== value ||
              v.dom.style.getPropertyValue('--typewriter-center') !== centerValue
            ) {
              v.dom.style.setProperty('--typewriter-height', value);
              v.dom.style.setProperty('--typewriter-center', centerValue);
              this.column?.style.setProperty('--typewriter-center', centerValue);
              this.measure(false);
              return;
            }
            if (target === null || this.dragging || v.dom.dataset.outlineDragging || !v.state.selection.main.empty) return;
            cancelAnimationFrame(this.frame);
            const from = v.scrollDOM.scrollTop;
            const duration =
              animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 100 : 0;
            if (!duration || Math.abs(target - from) < 1) {
              v.scrollDOM.scrollTop = target;
              return;
            }
            const start = performance.now();
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / duration);
              v.scrollDOM.scrollTop = from + (target - from) * (1 - (1 - t) ** 3);
              if (t < 1) this.frame = requestAnimationFrame(tick);
            };
            this.frame = requestAnimationFrame(tick);
          },
        });
      }
      destroy() {
        cancelAnimationFrame(this.frame);
        this.observer.disconnect();
        this.view.scrollDOM.removeEventListener('scroll', this.syncTitle);
        this.view.scrollDOM.removeEventListener('pointerdown', this.pointerDown);
        this.column?.style.removeProperty('--typewriter-title-offset');
        this.column?.style.removeProperty('--typewriter-center');
        window.removeEventListener('pointerup', this.pointerUp);
      }
    },
  );
}
