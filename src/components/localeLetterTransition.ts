import { flushSync } from 'react-dom';
import { setLocale, getLocale, type Locale } from '../i18n';

interface Letter {
  value: string;
  box: DOMRect;
}
interface Label {
  value: string;
  font: string;
  color: string;
  letters: Letter[];
}

function measure(node: Text): Label | undefined {
  const owner = node.parentElement;
  if (
    !owner ||
    !node.data.trim() ||
    node.length > 220 ||
    owner.closest(
      'select, option, textarea, input, svg, [aria-hidden="true"], [hidden], [inert], .sr-only',
    )
  )
    return;
  const range = document.createRange();
  range.selectNodeContents(node);
  const bounds = range.getBoundingClientRect();
  if (!bounds.width || !bounds.height || bounds.bottom < 0 || bounds.top >= innerHeight) return;
  const style = getComputedStyle(owner);
  if (style.visibility !== 'visible') return;
  let offset = 0;
  const letters: Letter[] = [];
  for (const value of node.data) {
    range.setStart(node, offset);
    offset += value.length;
    range.setEnd(node, offset);
    letters.push({ value, box: range.getBoundingClientRect() });
  }
  return {
    value: node.data,
    letters,
    color: style.color,
    font: [style.fontStyle, style.fontWeight, style.fontSize, style.fontFamily].join(' '),
  };
}

// The translated DOM is immediately available to assistive technology. Only its ink is
// temporarily replaced, leaving inputs, selection, layout and React ownership intact.
export function changeInterfaceLanguage(
  control: HTMLElement,
  locale: Locale,
): (() => void) | undefined {
  if (getLocale() === locale) return;
  const surface = control.closest('.welcome, .preferences-screen');
  if (
    !surface ||
    !window.CSS?.highlights ||
    typeof Highlight === 'undefined' ||
    !Element.prototype.animate ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    setLocale(locale);
    return;
  }
  const before = new Map<Text, Label>();
  const collect = (element: Element) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const label = measure(node);
      if (label) before.set(node, label);
    }
  };
  collect(surface);
  const capsule = document.querySelector('.window-title');
  if (capsule && !surface.contains(capsule)) collect(capsule);

  flushSync(() => setLocale(locale));
  const layer = document.createElement('div');
  layer.className = 'locale-letter-layer';
  layer.setAttribute('aria-hidden', 'true');
  const hidden = new Highlight();
  const animations: Animation[] = [];
  function draw(letter: Letter, label: Label, frames: Keyframe[], delay: number) {
    if (!letter.value.trim()) return;
    const glyph = document.createElement('span');
    glyph.textContent = letter.value;
    Object.assign(glyph.style, {
      left: letter.box.x + 'px',
      top: letter.box.y + 'px',
      font: label.font,
      lineHeight: letter.box.height + 'px',
      color: label.color,
    });
    layer.append(glyph);
    animations.push(
      glyph.animate(frames, {
        duration: 310,
        delay,
        fill: 'both',
        easing: 'cubic-bezier(.22,.65,.25,1)',
      }),
    );
  }
  for (const [node, old] of before) {
    if (!node.isConnected || node.data === old.value) continue;
    const next = measure(node);
    if (!next) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    hidden.add(range);
    const count = Math.max(old.letters.length, next.letters.length);
    for (let i = 0; i < count; i++) {
      const a = old.letters[i],
        b = next.letters[i];
      const delay = (140 * i) / count;
      const dx = a && b ? a.box.x - b.box.x : 0;
      const dy = a && b ? a.box.y - b.box.y : 0;
      if (a?.value === b?.value && b) {
        draw(b, next, [{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }], delay);
      } else {
        if (a)
          draw(
            a,
            old,
            [
              { opacity: 1, transform: 'none' },
              { opacity: 0, transform: 'translateY(-.32em) scaleY(.6)', offset: 0.72 },
              { opacity: 0 },
            ],
            delay,
          );
        if (b)
          draw(
            b,
            next,
            [
              { opacity: 0, transform: `translate(${dx * 0.35}px,.32em) scaleY(.6)` },
              { opacity: 1, transform: 'none' },
            ],
            delay + 32,
          );
      }
    }
  }
  if (!animations.length) return;
  document.body.append(layer);
  CSS.highlights.set('ariane-changing-language', hidden);
  const events = new AbortController();
  const finish = () => {
    if (events.signal.aborted) return;
    events.abort();
    layer.remove();
    CSS.highlights.delete('ariane-changing-language');
    for (const animation of animations) animation.cancel();
  };
  for (const name of ['scroll', 'resize', 'pointerdown', 'keydown']) {
    window.addEventListener(name, finish, { capture: true, passive: true, signal: events.signal });
  }
  void Promise.allSettled(animations.map((a) => a.finished)).then(finish);
  return finish;
}
