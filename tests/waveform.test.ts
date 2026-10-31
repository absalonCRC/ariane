import { describe, expect, it } from 'vitest';
import { audioLevel, recordingTime } from '../src/voice/waveform';

describe('voice recording display', () => {
  it('shows silence and responds to the recorded signal', () => {
    expect(audioLevel(new Float32Array())).toBe(0);
    expect(audioLevel(new Float32Array([0, 0, 0]))).toBe(0);
    expect(audioLevel(new Float32Array([0.1, -0.1]))).toBeCloseTo(0.5);
    expect(audioLevel(new Float32Array([1, -1]))).toBe(1);
  });

  it('formats the real recording duration in minutes and seconds', () => {
    expect(recordingTime(0)).toBe('00:00');
    expect(recordingTime(9.9)).toBe('00:09');
    expect(recordingTime(61.5)).toBe('01:01');
  });
});
