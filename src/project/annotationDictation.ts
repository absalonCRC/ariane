import type { Requests } from '../contracts/requests';
import { request } from '../platform/client';
type Delivery = Requests['passageAnnotation'];
const prefix = 'ariane.annotation.pending.';

async function commit(key: string, delivery: Delivery) {
  const value = await request('passageAnnotation', delivery);
  localStorage.removeItem(key);
  return value;
}
export async function deliverAnnotation(delivery: Delivery, flush: () => Promise<void>) {
  // Keep the destination through a failed flush, a lost acknowledgement or a restart.
  const key = prefix + delivery.id;
  localStorage.setItem(key, JSON.stringify(delivery));
  await flush();
  return commit(key, delivery);
}
export async function retryAnnotationDictations(projectPath: string, branch: string) {
  for (const key of Object.keys(localStorage).filter((key) => key.startsWith(prefix))) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    const delivery: Delivery = JSON.parse(raw);
    if (
      delivery.projectPath === projectPath &&
      delivery.branch === branch &&
      delivery.action.kind === 'dictation'
    )
      await commit(key, delivery);
  }
}
