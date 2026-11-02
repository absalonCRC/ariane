// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { manuscriptVisibleBounds } from '../src/editor/scrolling';

it('keeps anchored controls outside the chrome while the manuscript scrolls underneath', () => {
  const column = document.createElement('div');
  column.className = 'manuscript-column';
  vi.spyOn(column, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 700, window.innerHeight),
  );
  expect(manuscriptVisibleBounds(column)).toEqual({ top: 55, bottom: window.innerHeight - 55 });
});

it('does not add chrome insets to a standalone editor', () => {
  const scroller = document.createElement('div');
  const bounds = new DOMRect(0, 12, 700, 600);
  vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue(bounds);
  expect(manuscriptVisibleBounds(scroller)).toBe(bounds);
});
