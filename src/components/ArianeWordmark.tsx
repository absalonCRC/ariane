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
  if (draw) {
    // Each pen movement reveals only its own outline, including where the strokes meet.
    const stem = filterId + '-stem';
    const bowl = filterId + '-bowl';
    return (
      <svg className="welcome-symbol" viewBox="230 340 585 365" role="img" aria-label="ariane">
        <defs>
          <mask id={stem} maskUnits="userSpaceOnUse" x="230" y="340" width="585" height="365">
            <path
              className="ink-stem"
              pathLength="1"
              fill="none"
              stroke="white"
              strokeWidth="100"
              strokeLinecap="round"
              d="M292 510 C298 470 293 431 316 402 C339 359 383 348 423 356 C494 366 522 395 522 452 L522 600 C522 663 560 693 611 658 L653 625"
            />
          </mask>
          <mask id={bowl} maskUnits="userSpaceOnUse" x="230" y="340" width="585" height="365">
            <path
              className="ink-bowl"
              pathLength="1"
              fill="none"
              stroke="white"
              strokeWidth="94"
              strokeLinecap="round"
              d="M518 580 C488 630 440 675 363 676 C306 676 275 649 280 595 C288 520 398 479 490 478 C563 473 598 510 661 542 C718 575 758 576 806 532"
            />
          </mask>
        </defs>
        <path
          fill="currentColor"
          mask={`url(#${stem})`}
          d="M268 431 C272 392 331 347 418 347 C510 344 564 378 564 449 L564 602 C564 647 581 671 624 650 Q636 645 630 655 C607 685 563 703 526 685 C493 671 480 645 480 609 L480 450 C480 397 465 370 422 369 C382 366 352 384 343 412 C337 427 340 448 323 458 C300 473 265 461 268 431 Z"
        />
        <path
          fill="currentColor"
          mask={`url(#${bowl})`}
          d="M492 584 C477 622 427 654 376 654 C338 654 321 633 322 595 C324 527 408 495 480 493 C544 486 565 501 624 535 C695 578 754 601 802 541 Q810 529 799 531 C750 575 710 554 653 522 C591 485 558 470 503 471 C383 472 242 524 239 602 C235 666 284 699 355 694 C415 692 465 658 497 612 Z"
        />
      </svg>
    );
  }
  return (
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
