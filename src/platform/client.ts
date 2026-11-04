import { invoke, isTauri } from '@tauri-apps/api/core';
import { browserRequest } from './browser/client';
import type { Requests, Responses } from '../contracts/requests';
export { browserProjects, newSection } from './browser/client';
export const native = isTauri();
export async function request<K extends keyof Requests>(
  type: K,
  ...args: {} extends Requests[K] ? [args?: Requests[K]] : [args: Requests[K]]
): Promise<Responses[K]> {
  if (native) return invoke<Responses[K]>('dispatch', { request: { type, ...args[0] } });
  return browserRequest(type, args[0] ?? {}) as Responses[K];
}
