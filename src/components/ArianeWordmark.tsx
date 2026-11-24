import { useId } from 'react';
import wordmark from '../assets/ariane-wordmark-lowercase.png';
import appIcon from '../../src-tauri/icons/icon.png';

export function ArianeSymbol({
  draw = false,
  compact = true,
}: {
  draw?: boolean;
  compact?: boolean;
}) {
  const filterId = `ariane-ink-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const maskId = filterId + '-strokes';
  return (
    <svg
      className={draw ? 'welcome-symbol' : 'app-symbol'}
      data-active={compact}
      viewBox={draw ? '230 340 585 365' : '200 320 640 410'}
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
        {draw && (
          <mask id={maskId} maskUnits="userSpaceOnUse" x="230" y="340" width="585" height="365">
            <g fill="none" stroke="white" strokeLinecap="round" strokeLinejoin="round">
              <path
                className="symbol-downstroke"
                pathLength="1"
                strokeWidth="96"
                d="M302 433 C307 345 464 330 501 385 Q523 412 522 461 L522 598 Q522 689 584 668 L622 652"
              />
              <path
                className="symbol-loop"
                pathLength="1"
                strokeWidth="94"
                d="M500 480 C393 480 278 521 280 602 C278 694 421 688 488 612"
              />
              <path
                className="symbol-tail"
                pathLength="1"
                strokeWidth="38"
                d="M548 484 C610 490 680 584 750 562 Q779 558 803 534"
              />
            </g>
          </mask>
        )}
      </defs>
      <image
        mask={draw ? `url(#${maskId})` : undefined}
        href={appIcon}
        width="1024"
        height="1024"
        filter={`url(#${filterId})`}
      />
    </svg>
  );
}

export function ArianeWordmark({
  compact = false,
  hideCompact = false,
}: {
  compact?: boolean;
  hideCompact?: boolean;
}) {
  return (
    <>
      {!hideCompact && <ArianeSymbol compact={compact} />}
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
