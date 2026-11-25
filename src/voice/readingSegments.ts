export interface ReadingSegment {
  text: string;
  offset: number;
}

// Keep offsets in the original selection, including skipped whitespace.
export function* readingSegments(selection: string, language: string): Generator<ReadingSegment> {
  const sentences = new Intl.Segmenter(language, { granularity: 'sentence' });
  for (const { segment, index } of sentences.segment(selection)) {
    let start = 0;
    while (start < segment.length) {
      let end = Math.min(start + 100, segment.length);
      if (end < segment.length) {
        const boundary = segment.slice(start, end + 1).search(/\s+\S*$/u);
        if (boundary > 0) end = start + boundary;
        if (/[\uD800-\uDBFF]/.test(segment[end - 1])) end--;
      }
      const raw = segment.slice(start, end);
      const text = raw.trim();
      if (/[\p{L}\p{N}]/u.test(text)) {
        yield { text, offset: index + start + raw.indexOf(text) };
      }
      start = end;
    }
  }
}

export function wordTimings(
  { text, offset }: ReadingSegment,
  language: string,
  tokens: [number, number][],
) {
  const encoder = new TextEncoder();
  const words = new Intl.Segmenter(language, { granularity: 'word' });
  let byte = 0,
    token = 0;
  const timings = [];
  for (const part of words.segment(text)) {
    if (part.isWordLike && tokens.length) {
      while (token + 1 < tokens.length && tokens[token + 1][0] <= byte) token++;
      timings.push({
        from: offset + part.index,
        length: part.segment.length,
        ms: tokens[token][1],
      });
    }
    byte += encoder.encode(part.segment).length;
  }
  return timings;
}
