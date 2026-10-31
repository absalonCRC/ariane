#!/usr/bin/env python3
"""Matched local embedding timings; synthetic prose, identical engine and prompts."""
import argparse, json, os, socket, statistics, subprocess, time, urllib.request, uuid
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);a=p.parse_args()
resources=Path(__file__).resolve().parents[1]/'src-tauri/resources'
texts=['Louise Morel, relieuse, s’installa à Arles en 1924.', 'La demeure abandonnée semblait attendre ses habitants.', 'Marie Curie travaille à Paris avec l’Institut Pasteur.', 'Le jardinier prépare le calendrier des semis.', 'La maison vide garde le souvenir de ceux qui ont vécu entre ses murs.']
report={'note':'Same llama.cpp binary, Metal, Q8, 768d, search/document prefixes; short French texts. Sequential alternating starts, no E5 or GLiNER. OS file cache not flushed. Not an end-to-end suggestion benchmark.','rounds':[]}
for name in ['embeddinggemma-300M-Q8_0.gguf','embeddinggemma-2-Q8_0.gguf']*3:
 with socket.socket() as sock: sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
 key=str(uuid.uuid4());base=f'http://127.0.0.1:{port}'
 env=os.environ|{'DYLD_LIBRARY_PATH':str(resources/'engine')}
 started=time.perf_counter()
 child=subprocess.Popen([str(resources/'engine/llama-server'),'-m',str(resources/'models'/name),'--api-key',key,'--embedding','--pooling','mean','--host','127.0.0.1','--port',str(port),'-c','2048','-b','2048','-ub','2048','-np','1','-ngl','99'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 try:
  while True:
   try:
    with urllib.request.urlopen(base+'/health',timeout=.5):break
   except Exception:
    if child.poll() is not None or time.perf_counter()-started>45: raise RuntimeError('engine did not become ready')
    time.sleep(.05)
  cold=(time.perf_counter()-started)*1000
  times=[]
  for cycle in range(5):
   for idx,text in enumerate(texts):
    text=('task: search result | query: ' if idx%2 else 'title: none | text: ')+text
    req=urllib.request.Request(base+'/v1/embeddings',data=json.dumps({'input':text}).encode(),headers={'Content-Type':'application/json','Authorization':'Bearer '+key})
    start=time.perf_counter()
    with urllib.request.urlopen(req,timeout=30) as r:out=json.load(r)
    elapsed=(time.perf_counter()-start)*1000
    assert len(out['data'][0]['embedding'])==768
    times.append(elapsed)
  report['rounds'].append({'model':name,'readyMs':cold,'firstMs':times[0],'warmMs':times[1:]})
 finally:
  child.terminate()
  try: child.wait(timeout=5)
  except subprocess.TimeoutExpired:child.kill();child.wait()
report['summary']={}
for name in sorted({r['model'] for r in report['rounds']}):
 runs=[r for r in report['rounds'] if r['model']==name];t=sorted(v for r in runs for v in r['warmMs'])
 report['summary'][name]={'samples':len(t),'warmMedianMs':statistics.median(t),'warmP95Ms':t[int(len(t)*.95)],'medianReadyMs':statistics.median(r['readyMs'] for r in runs)}
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2))
print(json.dumps(report['summary'],indent=2))
