import monogram from '../assets/ariane-logo.svg';
import wordmark from '../assets/ariane-wordmark-literary.svg';

export function ArianeWordmark() {
  return (
    <svg className="app-wordmark" viewBox="0 0 1660 445" role="img" aria-label="Ariane">
      <image href={monogram} x="28" y="0" width="480" height="438" />
      <svg x="550" y="0" width="1110" height="445" viewBox="550 0 1110 445" overflow="hidden">
        <image href={wordmark} x="0" y="0" width="1660" height="445" />
      </svg>
    </svg>
  );
}
