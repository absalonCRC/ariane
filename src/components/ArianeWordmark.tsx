import { useId } from 'react';
import wordmark from '../assets/ariane-wordmark-lowercase.png';
import appIcon from '../../src-tauri/icons/icon.png';

export function ArianeWordmark({ compact = false }: { compact?: boolean }) {
  const filterId = `ariane-ink-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <>
      <svg
        className="app-symbol"
        data-active={compact}
        viewBox="200 320 640 410"
        role="img"
        aria-label="ariane"
        aria-hidden={!compact}
      >
        <defs>
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feColorMatrix
              in="SourceGraphic"
              type="matrix"
              values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.2126 -0.7152 -0.0722 1 0"
            />
            <feComponentTransfer result="ink">
              <feFuncA type="linear" slope="1.2" intercept="-0.06" />
            </feComponentTransfer>
            <feFlood floodColor="currentColor" result="color" />
            <feComposite in="color" in2="ink" operator="in" />
          </filter>
        </defs>
        <image href={appIcon} width="1024" height="1024" filter={`url(#${filterId})`} />
      </svg>
      <img
        className="app-wordmark"
        data-active={!compact}
        src={wordmark}
        alt="ariane"
        aria-hidden={compact}
        width={1576}
        height={376}
      />
    </>
  );
}
