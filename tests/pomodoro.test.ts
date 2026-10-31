import { describe, expect, it } from 'vitest';
import {
  initialPomodoro,
  togglePomodoro,
  reconcile,
  remaining,
  durations,
} from '../src/timer/pomodoro';

describe('Pomodoro', () => {
  it('pauses and resumes without losing elapsed time', () => {
    const start = togglePomodoro(initialPomodoro(), 1000);
    const paused = togglePomodoro(start, 61_000);
    expect(remaining(paused, 99_000)).toBe(24 * 60_000);
    expect(remaining(togglePomodoro(paused, 100_000), 160_000)).toBe(23 * 60_000);
  });
  it('advances to a short break, then a long break after four focus sessions', () => {
    let timer = togglePomodoro(initialPomodoro(), 0);
    timer = reconcile(timer, durations.focus);
    expect(timer.phase).toBe('break');
    timer = reconcile(timer, 4 * durations.focus + 3 * durations.break);
    expect(timer.phase).toBe('longBreak');
    expect(timer.completed).toBe(4);
  });
  it('catches up correctly after many cycles away', () => {
    const timer = togglePomodoro(initialPomodoro(), 0);
    const cycle = 4 * durations.focus + 3 * durations.break + durations.longBreak;
    const result = reconcile(timer, cycle * 100 + 1000);
    expect(result.phase).toBe('focus');
    expect(result.completed).toBe(400);
    expect(remaining(result, cycle * 100 + 1000)).toBe(durations.focus - 1000);
  });
});
