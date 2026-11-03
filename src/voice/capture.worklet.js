// Audio rendering thread: transfer bounded PCM blocks without DOM work.
class ArianeCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(4096);
    this.used = 0;
    this.stopped = false;
    this.port.onmessage = event => {
      if (event.data !== 'flush') return;
      if (this.used) this.send();
      this.stopped = true;
      this.port.postMessage('flushed');
    };
  }
  send() {
    const chunk = this.used === this.buffer.length ? this.buffer : this.buffer.slice(0, this.used);
    this.port.postMessage(chunk, [chunk.buffer]);
    this.buffer = new Float32Array(4096);
    this.used = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const samples = inputs[0]?.[0];
    if (samples) for (const sample of samples) {
      this.buffer[this.used++] = sample;
      if (this.used === this.buffer.length) this.send();
    }
    return true;
  }
}
registerProcessor('ariane-capture', ArianeCapture);
