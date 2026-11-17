import { useWindowLifecycle } from '../platform/useWindowLifecycle';
export function useNativeClose(
  flush: () => Promise<void>,
  saveSession: () => Promise<unknown>,
  onError: (e: unknown) => void,
) {
  useWindowLifecycle(async () => {
    await flush();
    await saveSession();
  }, onError);
}
