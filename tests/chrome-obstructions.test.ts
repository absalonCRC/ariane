// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { updateChromeObstructions } from '../src/components/useChromeObstructions';

function box(left: number, top: number, right: number, bottom: number): DOMRect {
  return {
    left, top, right, bottom, x: left, y: top,
    width: right - left, height: bottom - top, toJSON: () => ({}),
  };
}

it('protects only controls covered by visible text or media and clears them when content moves', () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <div class="path-heading"></div>
    <div class="header-search"></div>
    <div class="manuscript-column">
      <div class="cm-content">
        <div class="cm-line">Un passage écrit</div>
        <img class="picture" />
      </div>
    </div>`;
  document.body.append(root);
  const top = root.querySelector<HTMLElement>('.path-heading')!;
  const search = root.querySelector<HTMLElement>('.header-search')!;
  const viewport = root.querySelector<HTMLElement>('.manuscript-column')!;
  const line = root.querySelector<HTMLElement>('.cm-line')!;
  const picture = root.querySelector<HTMLElement>('.picture')!;
  let lineBox = box(100, 0, 500, 30);
  let textBox = box(110, 2, 170, 24);
  let imageBox = box(500, 200, 600, 300);
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(box(50, 0, 700, 800));
  vi.spyOn(top, 'getBoundingClientRect').mockReturnValue(box(100, 0, 200, 30));
  vi.spyOn(search, 'getBoundingClientRect').mockReturnValue(box(400, 0, 500, 30));
  vi.spyOn(line, 'getBoundingClientRect').mockImplementation(() => lineBox);
  vi.spyOn(picture, 'getBoundingClientRect').mockImplementation(() => imageBox);
  const range = {
    selectNodeContents: vi.fn(),
    getClientRects: () => [textBox],
  } as unknown as Range;
  const createRange = vi.spyOn(document, 'createRange').mockReturnValue(range);
  try {
    updateChromeObstructions(root);
    expect(top.hasAttribute('data-content-behind')).toBe(true);
    // The line box extends behind search, but its text does not.
    expect(search.hasAttribute('data-content-behind')).toBe(false);
    imageBox = box(420, 2, 460, 25);
    updateChromeObstructions(root);
    expect(search.hasAttribute('data-content-behind')).toBe(true);
    lineBox = box(100, 80, 500, 110);
    textBox = box(110, 82, 170, 104);
    imageBox = box(500, 200, 600, 300);
    updateChromeObstructions(root);
    expect(top.hasAttribute('data-content-behind')).toBe(false);
    expect(search.hasAttribute('data-content-behind')).toBe(false);
  } finally {
    createRange.mockRestore();
    root.remove();
  }
});

it('handles the collapsed theme control and clears coverage when the manuscript is hidden', () => {
  const root = document.createElement('div');
  root.innerHTML = `
    <nav class="binder-footer" data-expanded="false"><div class="binder-footer-actions"></div></nav>
    <div class="manuscript-column"><div class="cm-line">Texte</div></div>`;
  document.body.append(root);
  const theme = root.querySelector<HTMLElement>('.binder-footer-actions')!;
  const viewport = root.querySelector<HTMLElement>('.manuscript-column')!;
  const line = root.querySelector<HTMLElement>('.cm-line')!;
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(box(0, 0, 700, 800));
  vi.spyOn(theme, 'getBoundingClientRect').mockReturnValue(box(24, 760, 62, 798));
  vi.spyOn(line, 'getBoundingClientRect').mockReturnValue(box(20, 760, 100, 795));
  const range = {
    selectNodeContents: vi.fn(),
    getClientRects: () => [box(30, 765, 70, 790)],
  } as unknown as Range;
  const createRange = vi.spyOn(document, 'createRange').mockReturnValue(range);
  try {
    updateChromeObstructions(root);
    expect(theme.hasAttribute('data-content-behind')).toBe(true);
    viewport.hidden = true;
    updateChromeObstructions(root);
    expect(theme.hasAttribute('data-content-behind')).toBe(false);
  } finally {
    createRange.mockRestore();
    root.remove();
  }
});
