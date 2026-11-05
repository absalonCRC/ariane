import { getCurrentWindow } from '@tauri-apps/api/window';
import { native } from '../platform/client';

/** Native dragging is restricted to this surface below the interactive chrome. */
export function WindowDragRegion({ onError }: { onError: (error: unknown) => void }) {
  return native ? (
    <div
      className="window-drag-region"
      aria-hidden="true"
      onMouseDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        void getCurrentWindow().startDragging().catch(onError);
      }}
    />
  ) : null;
}
