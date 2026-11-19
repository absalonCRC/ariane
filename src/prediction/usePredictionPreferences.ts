import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import type { PredictionStatus } from '../contracts/prediction';
import { native, request } from '../platform/client';

const defaults: PredictionStatus = { enabled: false, distinct: false, forgotten: false, epoch: 0 };

export function usePredictionPreferences(projectPath?: string) {
  const [loaded, setLoaded] = useState<{ projectPath?: string; value: PredictionStatus }>();
  useEffect(() => {
    if (!native) return;
    let alive = true;
    let dispose: (() => void) | undefined;
    let generation = 0;
    const refresh = () => {
      const current = ++generation;
      void request('predictionPreferences', { projectPath })
        .then((value) => {
          if (alive && current === generation) setLoaded({ projectPath, value });
        })
        .catch(() => {
          if (alive && current === generation) setLoaded(undefined);
        });
    };
    void listen('prediction-changed', refresh)
      .then((stop) => {
        if (alive) {
          dispose = stop;
          refresh();
        } else stop();
      })
      .catch(() => {});
    refresh();
    return () => {
      alive = false;
      dispose?.();
    };
  }, [projectPath]);
  return loaded && loaded.projectPath === projectPath ? loaded.value : defaults;
}
