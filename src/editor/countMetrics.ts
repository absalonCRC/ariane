import { countCharacters } from './countCharacters';
export interface CountJob {
  id: string;
  version: number;
  text: string;
}
export interface CountResult {
  id: string;
  version: number;
  words: number;
  characters: number;
}
export function measureText(job: CountJob): CountResult {
  let words = 0;
  const pattern = /\S+/gu;
  while (pattern.exec(job.text)) words++;
  return { id: job.id, version: job.version, words, characters: countCharacters(job.text) };
}
