import { useEffect, useState } from 'react';
import {
  durations,
  initialPomodoro,
  reconcile,
  remaining,
  togglePomodoro,
  type Pomodoro,
  type Phase,
} from './pomodoro';
const key = 'ariane.pomodoro.v1';
function load(): Pomodoro {
  try {
    const value = JSON.parse(localStorage.getItem(key) || 'null');
    if (
      !value ||
      !Object.hasOwn(durations, value.phase) ||
      !Number.isSafeInteger(value.completed) ||
      value.completed < 0 ||
      !Number.isFinite(value.remainingMs) ||
      value.remainingMs < 0 ||
      value.remainingMs > durations[value.phase as Phase] ||
      (value.deadline !== null && (!Number.isFinite(value.deadline) || value.deadline < 0))
    )
      return initialPomodoro();
    return reconcile(value, Date.now());
  } catch {
    return initialPomodoro();
  }
}
export function usePomodoro() {
  const [timer, setTimer] = useState(load);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(timer));
    } catch {
      /* Timer remains usable in this session. */
    }
  }, [timer]);
  useEffect(() => {
    if (timer.deadline === null) return;
    const update = () => {
      const time = Date.now();
      setNow(time);
      setTimer((value) => reconcile(value, time));
    };
    update();
    const interval = window.setInterval(update, 1000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
    };
  }, [timer.deadline]);
  return {
    timer,
    ms: remaining(timer, now),
    toggle: () => {
      const time = Date.now();
      setNow(time);
      setTimer((value) => togglePomodoro(value, time));
    },
    reset: () => {
      setNow(Date.now());
      setTimer(initialPomodoro());
    },
  };
}
