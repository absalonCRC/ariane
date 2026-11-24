import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { RuntimeModule, RuntimeModules } from '../contracts/runtimeModules';
import { localizeMessage } from '../i18n';
import { native, request } from '../platform/client';

import {
  voiceLanguage,
  type ModelNotice,
  type ModelNoticeKey,
  type ReadingPreference,
} from './modelCatalog';
const preferenceKey = 'ariane.reading.language';
function useCatalog() {
  const [status, setStatus] = useState<RuntimeModules>();
  const [requested, setRequested] = useState<RuntimeModule | null>(null);
  const [notices, setNotices] = useState<ModelNotice[]>([]);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [preferred, setPreferred] = useState<ReadingPreference>(() => {
    try {
      return voiceLanguage(localStorage.getItem(preferenceKey) || '') || 'auto';
    } catch {
      return 'auto';
    }
  });
  const pending = useRef(false);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!native) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function read() {
      try {
        const next = await request('runtimeModules');
        if (!live) return;
        setStatus((previous) =>
          previous &&
          previous.active?.phase === next.active?.phase &&
          previous.active?.module === next.active?.module &&
          previous.installed.length === next.installed.length &&
          previous.installed.every((model, index) => next.installed[index] === model)
            ? previous
            : next,
        );
        if (next.active || pending.current) timer = setTimeout(read, 500);
      } catch (e) {
        if (live) setError(localizeMessage(e));
      }
    }
    void read();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  const retry = useCallback(() => {
    setError('');
    setRefresh((n) => n + 1);
  }, []);
  function offer(notice: ModelNotice) {
    setNotices((items) =>
      items.some((item) => item.key === notice.key) ? items : [...items, notice],
    );
  }
  function select(notice: ModelNotice) {
    setNotices((items) => items.map((item) => (item.key === notice.key ? notice : item)));
  }
  function dismiss(key: ModelNoticeKey) {
    setNotices((items) => items.filter((item) => item.key !== key));
  }
  async function install(
    id: RuntimeModule,
    preference?: ReadingPreference,
    origin?: ModelNoticeKey,
  ) {
    if (!status || status.active || pending.current || status.installed.includes(id)) return;
    pending.current = true;
    setNotices((items) => {
      const current = origin
        ? items.find((item) => item.key === origin)
        : items.find((item) => item.id === id);
      const notice = {
        key: current?.key ?? origin ?? id,
        id,
        preference: preference ?? current?.preference,
      };
      return current ? items.map((item) => (item === current ? notice : item)) : [...items, notice];
    });
    setRequested(id);
    retry();
    try {
      await request('installRuntime', { module: id });
      if (mounted.current) {
        if (preference) choose(preference);
        setStatus(
          (previous) =>
            previous && { installed: [...new Set([...previous.installed, id])], active: null },
        );
        setNotices((items) => items.filter((item) => item.id !== id));
      }
    } catch (e) {
      if (mounted.current) {
        const message = localizeMessage(e);
        setNotices((items) =>
          items.map((item) => (item.id === id ? { ...item, error: message } : item)),
        );
      }
    } finally {
      pending.current = false;
      if (mounted.current) {
        setRequested(null);
        setRefresh((n) => n + 1);
      }
    }
  }
  function choose(value: ReadingPreference) {
    try {
      localStorage.setItem(preferenceKey, value);
    } catch {
      /* Session-only preference. */
    }
    setPreferred(value);
  }
  async function cancel() {
    try {
      await request('cancelRuntimeInstall');
    } catch (e) {
      if (mounted.current) setError(localizeMessage(e));
    }
  }
  return {
    status,
    notices,
    offer,
    select,
    dismiss,
    active: status?.active?.module ?? requested,
    error,
    retry,
    install,
    cancel,
    preferred,
    choose,
  };
}
const Context = createContext<ReturnType<typeof useCatalog> | null>(null);
export function RuntimeModelsProvider({ children }: { children: ReactNode }) {
  return <Context.Provider value={useCatalog()}>{children}</Context.Provider>;
}
export function useRuntimeModels() {
  return useContext(Context);
}
