#!/usr/bin/env python3
"""Historical E5 benchmark; use benchmark-ai.py and benchmark-entities.py for current paths.
Run the installed local models on French fixtures; never access personal texts.
"""
import argparse, importlib.util, json, math, os, resource, subprocess, sys, time
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument('--root',type=Path,default=Path.home()/'Library/Application Support/fr.ariane.writer/memory');parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
source=Path(__file__).resolve().parents[1]/'src-tauri/resources/engine/memory.py'
sys.dont_write_bytecode=True
spec=importlib.util.spec_from_file_location('ariane_memory_worker',source);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
engine=module.MemoryEngine(args.root)
report={'hardware':subprocess.check_output(['sysctl','-n','machdep.cpu.brand_string'],text=True).strip(),'memoryBytes':int(subprocess.check_output(['sysctl','-n','hw.memsize'],text=True)),'model':module.MODEL_ID,'offlineEnvironment':os.environ.get('HF_HUB_OFFLINE')=='1','cases':[],'retrieval':[]}
fixtures=[
 ('Louise Morel, relieuse, s’installa à Arles en 1924.',['Louise Morel','Arles']),
 ('🌿 Bérenger Saunière est né le 11 avril 1852 à Montazels.',['Bérenger Saunière','Montazels']),
 ('Selon Louise Morel, Pierre Martin aurait quitté Lyon en 1921.',['Louise Morel','Pierre Martin','Lyon']),
 ('Le Livre des passages de Walter Benjamin évoque Paris.',['Walter Benjamin','Paris']),
 ('Louise attendait. Elle se souvenait de son frère.',[]),
 ('La maison vide garde le souvenir de ceux qui ont vécu entre ses murs.',[]),
]
for i,(text,expected) in enumerate(fixtures):
 started=time.perf_counter();out=engine.run({'id':i,'operation':'analyze','text':text});elapsed=(time.perf_counter()-started)*1000
 found=out['entities'];valid=all(text[e['start']:e['end']]==e['text'] for e in found)
 names={e['text'] for e in found if e['score']>=.8 and any(c.isupper() for c in e['text']) and (e['label']!='person' or len(e['text'].split())>=2)}
 report['cases'].append({'text':text,'expected':expected,'entities':found,'eligibleNames':sorted(names),'expectedFound':sorted(set(expected)&names),'missing':sorted(set(expected)-names),'spansExact':valid,'elapsedMs':round(elapsed,2),'dimension':len(out['vector']),'peakRssBytes':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss})
 assert valid and len(out['vector'])==384 and not (set(expected)-names)
 args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
queries=[('La demeure abandonnée semblait attendre ses habitants.',['La maison vide garde le souvenir de ceux qui ont vécu entre ses murs.','Le jardinier prépare le calendrier des semis.','La typographie du livre comporte trois familles de caractères.'],0),('Les coutumes funéraires dans le sud de la France.',['Les villages du Languedoc conservaient certains rites autour des défunts.','La ligne ferroviaire ouvre au mois de juillet.','Le propriétaire répare les fenêtres de sa demeure.'],0)]
for query,docs,expected in queries:
 started=time.perf_counter();q=engine.embed(query,'query');vectors=[engine.embed(d) for d in docs];scores=[sum(a*b for a,b in zip(q,v)) for v in vectors];rank=max(range(len(scores)),key=scores.__getitem__)
 report['retrieval'].append({'query':query,'documents':docs,'scores':scores,'expected':expected,'rankedFirst':rank,'correct':rank==expected,'elapsedMs':round((time.perf_counter()-started)*1000,2)})
mixed='Louise Morel, relieuse, s’installa à Arles en 1924. La maison vide garde le souvenir de ceux qui ont vécu entre ses murs.'
analysis=engine.run({'id':'mixed','operation':'analyze','text':mixed})
query=engine.embed('La demeure abandonnée semblait attendre ses habitants.','query')
score=max(sum(a*b for a,b in zip(query,v)) for v in analysis['passageVectors'])
distractors=['Les villages du Languedoc conservaient certains rites autour des défunts.','Le jardinier prépare le calendrier des semis.','La typographie du livre comporte trois familles de caractères.']
other=[sum(a*b for a,b in zip(query,engine.embed(t))) for t in distractors]
report['mixedParagraphRecall']={'correct':score>max(other),'score':score,'distractorScores':other,'segments':len(analysis['passageVectors'])}
assert score>max(other)
plain=engine.embed(mixed);formatted=engine.embed(mixed.replace('murs.','murs'+' '*270+'.')+'\n\n')
report['formattingInvariant']=max(abs(a-b) for a,b in zip(plain,formatted))<1e-6
assert report['formattingInvariant']
report['peakRssBytes']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
report['cpuSeconds']=resource.getrusage(resource.RUSAGE_SELF).ru_utime+resource.getrusage(resource.RUSAGE_SELF).ru_stime
report['runtimeBytes']=sum(p.stat().st_size for p in args.root.rglob('*') if p.is_file())
report['note']='Small synthetic French sample, not a domain-quality certification. RSS is the benchmark process including reference Python/PyTorch libraries. Cold includes imports and model loading.'
args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'cases':len(report['cases']),'exactSpans':all(c['spansExact'] for c in report['cases']),'retrievalCorrect':sum(c['correct'] for c in report['retrieval']),'peakRssMiB':round(report['peakRssBytes']/1048576),'coldMs':report['cases'][0]['elapsedMs'],'warmMs':[c['elapsedMs'] for c in report['cases'][1:]],'output':str(args.output)},ensure_ascii=False))
