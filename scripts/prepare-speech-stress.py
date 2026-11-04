#!/usr/bin/env python3
"""Prepare deterministic audio perturbations, never modifying provider sources.
Run with Ariane's installed voice Python (numpy/soundfile).
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import wave

import numpy as np
import soundfile as sf

ROOT=Path(__file__).resolve().parents[1]


def pink(samples, seed):
    rng=np.random.default_rng(seed)
    spectrum=np.fft.rfft(rng.normal(size=samples))
    spectrum[0]=0
    spectrum[1:]/=np.sqrt(np.arange(1,len(spectrum)))
    noise=np.fft.irfft(spectrum,n=samples)
    return noise/np.sqrt(np.mean(noise*noise))


def main():
    p=argparse.ArgumentParser(__doc__)
    p.add_argument('--directory',type=Path,default=ROOT/'artifacts/ai-2026-11-03/validation-elargie')
    p.add_argument('--allow-partial',action='store_true')
    p.add_argument('--corpus',type=Path,default=ROOT/'benchmarks/fixtures/ai/speech-stress.json')
    p.add_argument('--manifest-output',type=Path)
    args=p.parse_args()
    corpus_path=args.corpus
    corpus=json.loads(corpus_path.read_text())
    target=args.directory/'audio';target.mkdir(exist_ok=True)
    cases=[];missing=[]
    def add(clip,path,variant,**extra):
        samples,rate=sf.read(path,always_2d=True)
        case={'id':clip['id']+'-'+variant,'clip':clip['id'],'language':clip['language'],'expected':clip['text'],'names':clip['names'],'variant':variant,'kind':clip['kind'],'wav':str(path.resolve()),'durationSeconds':len(samples)/rate,'sampleRate':rate,'channels':samples.shape[1],'cleanup':False,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),**extra}
        cases.append(case)
        return case
    for clip in corpus['clips']:
        source=args.directory/'voices'/f"{clip['id']}.mp3"
        if not source.exists():source=source.with_suffix('.wav')
        if not source.exists():missing.append(clip['id']);continue
        clean=target/f"{clip['id']}-clean.wav"
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(source),'-ac','1','-ar','16000','-c:a','pcm_s16le',str(clean)],check=True)
        add(clip,clean,'clean')
        before={'fr':'Le passage précédent reste en lecture seule.','en':'The previous passage stays read only.','es':'El texto anterior permanece intacto.','de':'Der vorherige Abschnitt bleibt unverändert.','it':'Il testo precedente rimane intatto.'}[clip['language']]
        add(clip,clean,'pipeline',cleanup=True,before=before,after=before)
        if clip['language']=='fr' and clip['kind']=='short':
            audio,rate=sf.read(clean,dtype='float32')
            rms=np.sqrt(np.mean(audio*audio))
            noise=pink(len(audio),clip.get('seed',clip.get('perturbationSeed')))
            for snr in [20,10,5]:
                mixed=audio+noise*rms/(10**(snr/20))
                mixed/=max(1.,np.max(np.abs(mixed))/.98)
                path=target/f"{clip['id']}-noise-{snr}.wav";sf.write(path,mixed,rate,subtype='PCM_16')
                add(clip,path,f'pink_noise_{snr}dB',snrDb=snr,noise='seeded global-RMS pink noise')
            for speed in [.85,1.2]:
                path=target/f"{clip['id']}-speed-{speed}.wav"
                subprocess.run(['ffmpeg','-v','error','-y','-i',str(clean),'-af',f'atempo={speed}','-c:a','pcm_s16le',str(path)],check=True)
                add(clip,path,f'speed_{speed}',speedFactor=speed)
            phone=target/f"{clip['id']}-phone8k.wav"
            subprocess.run(['ffmpeg','-v','error','-y','-i',str(clean),'-ar','8000','-c:a','pcm_s16le',str(phone)],check=True)
            add(clip,phone,'phone8k')
    if missing and not args.allow_partial:raise SystemExit('Missing generated voices: '+', '.join(missing))
    silence=target/'silence.wav';sf.write(silence,np.zeros(16000*10),16000,subtype='PCM_16')
    noise_path=target/'noise-alone.wav';sf.write(noise_path,pink(16000*10,1142026)*.02,16000,subtype='PCM_16')
    for path,id in [(silence,'silence'),(noise_path,'noise-alone')]:
        add({'id':id,'language':'fr','text':'','names':[],'kind':'negative'},path,'negative')
    if cases:
        clean=next(c for c in cases if c['variant']=='clean' and c['kind']=='short')
        broken=target/'corrupt.wav';broken.write_bytes(b'RIFF'+(100).to_bytes(4,'little')+b'WAVEinvalid')
        too_large=target/'over-limit.wav'
        with wave.open(str(too_large),'wb') as wav:
            wav.setnchannels(1);wav.setsampwidth(2);wav.setframerate(16000);wav.writeframes(b'\0'*(21*1024*1024))
        for id,path,extra in [('corrupt',broken,{}),('over-limit',too_large,{}),('missing-model',Path(clean['wav']),{'unavailableData':True}),('lost-worker',Path(clean['wav']),{'killWorkerAfterMs':10})]:
            cases.append({**clean,'id':id,'wav':str(path.resolve()),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'expectedError':True,**extra})
        cases.append({**clean,'id':'recovered-after-failure'})
    manifest={'protocol':corpus['protocol'],'corpusSha256':hashlib.sha256(corpus_path.read_bytes()).hexdigest(),'runSeconds':0,'cases':cases,'missingVoices':missing}
    (args.manifest_output or args.directory/'speech-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({'cases':len(cases),'voices':len(corpus['clips'])-len(missing),'missing':missing}))


if __name__=='__main__':main()
