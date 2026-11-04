"""Local Parakeet inference on a mono PCM WAV; no downloads at runtime."""
import json
import sys
from contextlib import redirect_stdout
from pathlib import Path

import librosa
import mlx.core as mx
import mlx.nn as nn
import numpy as np
import soundfile as sf
from parakeet_mlx.audio import get_logmel
from parakeet_mlx.utils import from_config


def load_model(model_path):
    with (model_path / "config.json").open() as config_file:
        config = json.load(config_file)
    model = from_config(config)
    nn.quantize(model, bits=config["quantization"]["bits"], group_size=config["quantization"]["group_size"])
    model.load_weights(str(model_path / "model.safetensors"))
    return model


def transcribe_file(path, model):
    samples, sample_rate = sf.read(path, dtype="float32", always_2d=True)
    audio = samples.mean(axis=1)
    if len(audio) == 0 or np.max(np.abs(audio)) < 0.003:
        return ""
    target_rate = model.preprocessor_config.sample_rate
    if sample_rate != target_rate:
        audio = librosa.resample(audio, orig_sr=sample_rate, target_sr=target_rate)
    if len(audio) < model.preprocessor_config.hop_length:
        return ""
    # Bound full-attention Metal allocations on long recordings. This remains
    # offline batch inference; token timestamps reconcile the five-second overlap.
    if len(audio) > target_rate * 30:
        return model.transcribe(
            path, dtype=mx.float32, chunk_duration=30., overlap_duration=5.
        ).text
    mel = get_logmel(mx.array(audio), model.preprocessor_config)
    result = model.generate(mel)[0]
    return result.text


def main():
    worker = sys.argv[1] == "--worker"
    with redirect_stdout(sys.stderr):
        model = load_model(Path(sys.argv[2]))
    if not worker:
        with redirect_stdout(sys.stderr):
            text = transcribe_file(sys.argv[1], model)
        print(json.dumps({"text": text}, ensure_ascii=False), flush=True)
        return
    for line in sys.stdin:
        try:
            path = json.loads(line)["path"]
            with redirect_stdout(sys.stderr):
                text = transcribe_file(path, model)
            result = {"text": text}
        except Exception as error:
            result = {"error": str(error)}
        print(json.dumps(result, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
