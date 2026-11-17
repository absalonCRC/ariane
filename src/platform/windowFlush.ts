const flushers = new Set<() => Promise<unknown>>();
export function registerWindowFlusher(flush: () => Promise<unknown>) {
  flushers.add(flush);
  return () => {
    flushers.delete(flush);
  };
}
export async function flushWindowResources() {
  for (const flush of flushers) await flush();
}
