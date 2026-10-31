export type Phase = 'focus' | 'break' | 'longBreak';
export interface Pomodoro {
  phase: Phase;
  completed: number;
  remainingMs: number;
  deadline: number | null;
}
export const durations: Record<Phase, number> = {
  focus: 25 * 60_000,
  break: 5 * 60_000,
  longBreak: 15 * 60_000,
};
export function initialPomodoro(): Pomodoro {
  return { phase: 'focus', completed: 0, remainingMs: durations.focus, deadline: null };
}
export function reconcile(timer: Pomodoro, now: number): Pomodoro {
  if (timer.deadline === null || timer.deadline > now) return timer;
  let { phase, completed, deadline } = timer;
  while (deadline <= now) {
    // Skip complete cycles when returning after a long absence.
    const cycle = 4 * durations.focus + 3 * durations.break + durations.longBreak;
    if (phase === 'focus' && completed % 4 === 0 && now - deadline >= cycle) {
      const cycles = Math.floor((now - deadline) / cycle);
      deadline += cycles * cycle;
      completed += cycles * 4;
    }
    if (phase === 'focus') {
      completed++;
      phase = completed % 4 === 0 ? 'longBreak' : 'break';
    } else phase = 'focus';
    deadline += durations[phase];
  }
  return { phase, completed, deadline, remainingMs: durations[phase] };
}
export function remaining(timer: Pomodoro, now: number): number {
  return Math.max(0, timer.deadline === null ? timer.remainingMs : timer.deadline - now);
}
export function togglePomodoro(timer: Pomodoro, now: number): Pomodoro {
  const current = reconcile(timer, now);
  return current.deadline === null
    ? { ...current, deadline: now + current.remainingMs }
    : { ...current, remainingMs: remaining(current, now), deadline: null };
}
export function formatTime(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}
