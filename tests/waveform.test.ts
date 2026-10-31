import { describe, expect, it } from 'vitest';
import { audioLevel } from '../src/voice/waveform';

describe('voice recording display', () => {
  it('shows silence and responds to the recorded signal', () => {
    expect(audioLevel(new Float32Array())).toBe(0);
    expect(audioLevel(new Float32Array([0, 0, 0]))).toBe(0);
    expect(audioLevel(new Float32Array([0.1, -0.1]))).toBeCloseTo(0.5);
    expect(audioLevel(new Float32Array([1, -1]))).toBe(1);
  });
});
