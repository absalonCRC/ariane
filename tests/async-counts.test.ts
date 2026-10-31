import { expect, it, vi } from 'vitest';
import { DocumentCounts } from '../src/editor/counts';
import { measureText, type CountJob } from '../src/editor/countMetrics';
it('rejects stale worker replies and stops publishing after disposal', () => {
  const worker={onmessage:null as null|((event:{data:ReturnType<typeof measureText>[]})=>void),onerror:null,postMessage:vi.fn(),terminate:vi.fn()};
  vi.stubGlobal('Worker', class {});
  const publish=vi.fn();
  const counts=new DocumentCounts(publish,()=>worker as unknown as Worker);
  try {
    counts.update([{id:'a',text:'ancien texte'},{id:'b',text:'👨‍👩‍👧‍👦'}]);
    const first=worker.postMessage.mock.calls[0][0] as CountJob[];
    counts.update([{id:'a',text:'modifié'}]);
    const second=worker.postMessage.mock.calls[1][0] as CountJob[];
    worker.onmessage!({data:second.map(measureText)});
    worker.onmessage!({data:first.map(measureText)});
    expect(publish).toHaveBeenLastCalledWith(2,8);
    counts.destroy();
    const calls=publish.mock.calls.length;
    worker.onmessage!({data:first.map(measureText)});
    expect(publish).toHaveBeenCalledTimes(calls);
    expect(worker.terminate).toHaveBeenCalledOnce();
  } finally {counts.destroy();vi.unstubAllGlobals();}
});
