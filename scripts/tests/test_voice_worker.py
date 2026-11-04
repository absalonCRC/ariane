"""Audio boundary regressions without downloading or loading model weights."""
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch

WORKER = Path(__file__).resolve().parents[2]/'src-tauri/resources/voice/transcribe.py'


class VoiceWorker(unittest.TestCase):
    def load_worker(self, audio, rate=16000):
        samples = SimpleNamespace(mean=lambda axis: audio)
        model = Mock()
        model.preprocessor_config.sample_rate = 16000
        model.preprocessor_config.hop_length = 160
        model.generate.return_value = [SimpleNamespace(text='Short recording.')]
        model.transcribe.return_value = SimpleNamespace(text='First sentence. Final sentence.')
        mx = SimpleNamespace(array=lambda value: value, float32='float32')
        numpy = SimpleNamespace(max=max, abs=lambda values: [abs(value) for value in values])
        self.resample = Mock(side_effect=lambda values, **kwargs: values)
        modules = {'librosa': SimpleNamespace(resample=self.resample),
                   'mlx': SimpleNamespace(core=mx, nn=SimpleNamespace()), 'mlx.core': mx, 'mlx.nn': SimpleNamespace(),
                   'numpy': numpy, 'soundfile': SimpleNamespace(read=lambda *args, **kwargs: (samples, rate)),
                   'parakeet_mlx': SimpleNamespace(), 'parakeet_mlx.audio': SimpleNamespace(get_logmel=lambda *args: 'mel'),
                   'parakeet_mlx.utils': SimpleNamespace(from_config=None)}
        with patch.dict(sys.modules, modules):
            spec = importlib.util.spec_from_file_location('voice_worker_under_test', WORKER)
            worker = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(worker)
        return worker, model

    def test_long_recording_uses_bounded_overlapping_batch_chunks(self):
        worker, model = self.load_worker([.1]*(16000*31))
        self.assertEqual(worker.transcribe_file(Path('long.wav'), model), 'First sentence. Final sentence.')
        model.generate.assert_not_called()
        model.transcribe.assert_called_once_with(Path('long.wav'), dtype='float32', chunk_duration=30., overlap_duration=5.)

    def test_short_recording_keeps_existing_inference_path(self):
        worker, model = self.load_worker([.1]*16000)
        self.assertEqual(worker.transcribe_file(Path('short.wav'), model), 'Short recording.')
        model.generate.assert_called_once()
        model.transcribe.assert_not_called()

    def test_empty_silence_and_sub_hop_audio_never_infer(self):
        for audio in [[], [0.]*16000, [.1]*100]:
            worker, model = self.load_worker(audio)
            self.assertEqual(worker.transcribe_file(Path('silence.wav'), model), '')
            model.generate.assert_not_called()
            model.transcribe.assert_not_called()

    def test_other_sample_rate_is_resampled(self):
        worker, model = self.load_worker([.1]*8000, rate=8000)
        self.assertEqual(worker.transcribe_file(Path('phone.wav'), model), 'Short recording.')
        self.resample.assert_called_once()


if __name__ == '__main__':
    unittest.main()
