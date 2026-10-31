#!/usr/bin/env python3
"""Paired local quality evaluation with frozen judgments; no application changes.

Replays the current text encoding and ranking rules. Source candidates have no
aliases or graph edges, so those deterministic layers cannot mask encoder quality.
"""
from __future__ import annotations
import argparse, hashlib, json, math, os, random, re, socket, sqlite3, statistics
import subprocess, time, unicodedata, urllib.request, uuid
from pathlib import Path

STOP = set('dans avec pour cette comme était avait leur elle mais alors plus sans tout toute depuis'.split())
MODELS = ['embeddinggemma-300M-Q8_0.gguf', 'embeddinggemma-2-Q8_0.gguf']

def norm(v):
    assert len(v)==768 and all(math.isfinite(x) for x in v)
    n=math.sqrt(sum(x*x for x in v));assert n>0
    return [x/n for x in v]

def split_input(text,limit=1200):
    # Exact byte-boundary and late-whitespace rules used by Engine::split_input.
    b=text.encode();result=[];start=0
    while start<len(b):
        end=min(start+limit,len(b))
        while end<len(b) and b[end]&0xC0==0x80:end-=1
        if end<len(b):
            chunk=b[start:end].decode();offset=0;last=None
            for ch in chunk:
                if ch.isspace():last=(offset,len(ch.encode()))
                offset+=len(ch.encode())
            if last and last[0]>limit//2:end=start+last[0]+last[1]
        result.append(b[start:end].decode());start=end
    return result

def pieces(text):
    text=' '.join(text.split())
    sentences=[s.strip() for s in re.findall(r'[^.!?;]*[.!?;]|[^.!?;]+$',text) if len(s.strip())>15]
    return [text]+(sentences[:8] if len(sentences)>1 else [])

def chunks(text):
    out=[];buf=''
    for para in text.split('\n\n'):
        if len(buf.encode())+len(para.encode())>1800 and buf:out.append(buf);buf=''
        if len(para.encode())>3500:
            words=para.split();out.extend(' '.join(words[i:i+250]) for i in range(0,len(words),250))
        else:buf+=para+'\n\n'
    if buf.strip():out.append(buf.strip())
    return out

def terms(text):
    out=[]
    for w in re.findall(r'[^\W_]+',text):
        w=w.lower()
        if len(w)>=4 and w not in STOP and w not in out:out.append(w)
        if len(out)==12:break
    return out

def cosine(a,b):return sum(x*y for x,y in zip(a,b))
def best_cos(a,b):return max(cosine(x,y) for x in a for y in b)

def stats(rows):
    if not rows:return {}
    ranks=[x['goldRank'] for x in rows]
    return {'n':len(rows),'top1':sum(r==1 for r in ranks),'top3':sum(r<=3 for r in ranks),
            'top5':sum(r<=5 for r in ranks),'mrr':statistics.mean(1/r for r in ranks),
            'ndcgAt5':statistics.mean(1/math.log2(r+1) if r<=5 else 0 for r in ranks)}

class Server:
    def __init__(self,resources,model,directory):
        self.resources=resources;self.model=model;self.cache={};self.calls=[];self.directory=directory
    def __enter__(self):
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        self.base=f'http://127.0.0.1:{port}';self.key=str(uuid.uuid4())
        self.log=(self.directory/(self.model+'.server.log')).open('w')
        self.child=subprocess.Popen([str(self.resources/'engine/llama-server'),'-m',str(self.resources/'models'/self.model),
           '--api-key',self.key,'--embedding','--pooling','mean','--host','127.0.0.1','--port',str(port),
           '-c','2048','-b','2048','-ub','2048','-np','1','-ngl','99'],
           env=os.environ|{'DYLD_LIBRARY_PATH':str(self.resources/'engine')},stdout=self.log,stderr=self.log)
        started=time.perf_counter()
        try:
            while True:
                try:
                    with urllib.request.urlopen(self.base+'/health',timeout=.5):break
                except Exception:
                    if self.child.poll() is not None or time.perf_counter()-started>45:raise RuntimeError('Model startup failed')
                    time.sleep(.05)
        except BaseException:
            self.__exit__(None,None,None);raise
        self.ready_ms=(time.perf_counter()-started)*1000;return self
    def __exit__(self,*_):
        self.child.terminate()
        try:self.child.wait(timeout=5)
        except subprocess.TimeoutExpired:self.child.kill();self.child.wait()
        self.log.close()
    def one(self,text,query):
        key=('task: search result | query: ' if query else 'title: none | text: ')+text
        if key not in self.cache:
            start=time.perf_counter()
            request=urllib.request.Request(self.base+'/v1/embeddings',
                data=json.dumps({'input':key,'model':self.model.removesuffix('.gguf')}).encode(),
                headers={'Content-Type':'application/json','Authorization':'Bearer '+self.key})
            with urllib.request.urlopen(request,timeout=45) as response:result=json.load(response)
            self.cache[key]=norm(result['data'][0]['embedding'])
            self.calls.append((time.perf_counter()-start)*1000)
        return self.cache[key]
    def embed(self,text,query):
        parts=split_input(text)
        assert parts and ''.join(parts)==text and all(len(p.encode())<=1200 for p in parts)
        if len(parts)==1:return self.one(text,query)
        total=[0.]*768
        for p in parts:
            for i,x in enumerate(self.one(p,query)):total[i]+=x*len(p.encode())
        return norm(total)

def source_hybrid(query,docs,scores,db):
    lexical=' OR '.join('"'+t+'"' for t in re.findall(r'[^\W_]{3,}',query)[:24])
    hits={}
    if lexical:
        for docid,rank in db.execute('SELECT source,bm25(search) FROM search WHERE search MATCH ? ORDER BY bm25(search)',[lexical]):
            if docid not in hits:hits[docid]=1+min(-rank,10)
            if len(hits)>=150:break
    for d in docs:
        # Text-only synthetic titles cannot create direct alias matches.
        score=scores[d['id']]
        if score>=.48:
            combined=score*4+min(hits.get(d['id'],0),2)
            if hits.get(d['id'],-1)<combined:hits[d['id']]=combined
    ranked=sorted(hits,key=lambda d:(-hits[d],d))[:20]
    return [(d,hits[d]) for d in ranked[:4] if hits[d]>=2.2]

def run_model(resources,model,corpus,directory):
    encoded={};results=[]
    with Server(resources,model,directory) as engine:
        for i,d in enumerate(corpus['documents']):
            ps=pieces(d['text']) if d['track']=='passages' else chunks(d['text'])
            encoded[d['id']]=[engine.embed(p,False) for p in ps]
            if i%40==0:print(f'{model}: documents {i}/{len(corpus["documents"])}',flush=True)
        db=sqlite3.connect(':memory:');db.execute('CREATE VIRTUAL TABLE search USING fts5(text,source UNINDEXED,page UNINDEXED)')
        for d in corpus['documents']:
            if d['track']=='sources':db.executemany('INSERT INTO search VALUES(?,?,NULL)',[(p,d['id']) for p in chunks(d['text'])])
        query_vectors={}
        for i,q in enumerate(corpus['queries']):
            docs=[d for d in corpus['documents'] if d['track']==q['track']]
            ps=pieces(q['text']) if q['track']=='passages' else [q['text'][:1800]]
            v=[engine.embed(p,True) for p in ps];query_vectors[q['id']]=v
            scores={d['id']:best_cos(v,encoded[d['id']]) for d in docs}
            ranked=sorted(scores,key=lambda d:(-scores[d],d))
            if q['track']=='passages':
                ts=terms(q['text']);hybrid={}
                for d in docs:
                    other=terms(d['text']);shared=sum(t in other for t in ts);lex=shared/max(len(ts),1);score=scores[d['id']]
                    if score>=.75:hybrid[d['id']]=score+lex*.05
                    elif shared>=2 and lex>=.3:hybrid[d['id']]=lex*.8
                display=sorted(hybrid.items(),key=lambda x:(-x[1],x[0]))[:1]
            else:display=source_hybrid(q['text'],docs,scores,db)
            gold=q['relevant'];rank=min((ranked.index(g)+1 for g in gold),default=None)
            results.append({'id':q['id'],'group':q['group'],'track':q['track'],'split':q['split'],'category':q['category'],
                'goldRank':rank,'goldScores':{g:scores[g] for g in gold},'scores':scores,
                'ranking':ranked,'displayed':display,'displayTop1Correct':bool(display and display[0][0] in gold),
                'displayContainsGold':any(d in gold for d,_ in display),'falseDisplay':bool(display and not gold)})
            if i%20==0:print(f'{model}: queries {i}/{len(corpus["queries"])}',flush=True)
        model_hash=hashlib.sha256((resources/'models'/model).read_bytes()).hexdigest()
        report={'model':model,'modelSha256':model_hash,'readyMs':engine.ready_ms,'embeddingCalls':len(engine.calls),
                'embeddingMedianMs':statistics.median(engine.calls),'results':results}
        report['summary']={}
        for track in ['passages','sources']:
            base=[r for r in results if r['track']==track and r['split']=='base'];negative=[r for r in results if r['track']==track and r['split']=='no_answer']
            report['summary'][track]={'ranking':stats(base),'variants':stats([r for r in results if r['track']==track and r['split']=='variant']),
                'displayTop1Correct':sum(r['displayTop1Correct'] for r in base),'displayContainsGold':sum(r['displayContainsGold'] for r in base),
                'wrongDisplays':sum(bool(r['displayed']) and not r['displayContainsGold'] for r in base),
                'missedDisplays':sum(not r['displayed'] for r in base),'negativeCount':len(negative),'falseDisplaysOnNegatives':sum(r['falseDisplay'] for r in negative)}
        (directory/(model+'.vectors.json')).write_text(json.dumps({'documents':encoded,'queries':query_vectors}))
        (directory/(model+'.json')).write_text(json.dumps(report,ensure_ascii=False,indent=2))
        print(json.dumps({'model':model,'summary':report['summary']},ensure_ascii=False),flush=True)
        return report

def compare(reports):
    old,new=reports;out={}
    for track in ['passages','sources','combined']:
        a=[r for r in old['results'] if r['split']=='base' and (track=='combined' or r['track']==track)]
        indexed={r['id']:r for r in new['results']};pairs=[(r,indexed[r['id']]) for r in a]
        diffs=[int(b['goldRank']==1)-int(a['goldRank']==1) for a,b in pairs]
        rng=random.Random(20261030);boot=sorted(statistics.mean(rng.choices(diffs,k=len(diffs))) for _ in range(10000))
        won=sum(a['goldRank']!=1 and b['goldRank']==1 for a,b in pairs);lost=sum(a['goldRank']==1 and b['goldRank']!=1 for a,b in pairs);discord=won+lost
        p=min(1.,2*sum(math.comb(discord,k) for k in range(min(won,lost)+1))/2**discord) if discord else 1.
        out[track]={'n':len(pairs),'newWinsTop1':won,'oldWinsTop1':lost,'bothCorrect':sum(a['goldRank']==b['goldRank']==1 for a,b in pairs),
            'bothWrong':sum(a['goldRank']!=1 and b['goldRank']!=1 for a,b in pairs),'top1DifferenceNewMinusOld':statistics.mean(diffs),
            'pairedBootstrap95':[boot[250],boot[9749]],'mcnemarExactP':p,
            'disagreements':[{'id':a['id'],'oldRank':a['goldRank'],'newRank':b['goldRank'],'oldTop':a['ranking'][0],'newTop':b['ranking'][0]} for a,b in pairs if a['ranking'][0]!=b['ranking'][0]]}
    return out

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--corpus',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);args=parser.parse_args()
    resources=Path(__file__).resolve().parents[1]/'src-tauri/resources';args.output.mkdir(parents=True,exist_ok=True)
    raw=args.corpus.read_bytes();corpus=json.loads(raw);digest=hashlib.sha256(raw).hexdigest()
    assert digest==args.corpus.with_suffix('.sha256').read_text().split()[0]
    documents={d['id']:d for d in corpus['documents']};assert len(documents)==len(corpus['documents'])
    assert all(all(g in documents and documents[g]['track']==q['track'] for g in q['relevant']) for q in corpus['queries'])
    assert len({q['id'] for q in corpus['queries']})==len(corpus['queries'])
    manifest={'corpusSha256':digest,'scriptSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),'startedUtc':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),
      'hardware':subprocess.check_output(['sysctl','-n','machdep.cpu.brand_string'],text=True).strip(),'models':MODELS,
      'protocol':'Same Q8 native engine / Metal / 768 dimensions / prefixes / UTF-8 chunks / pooling. Ranking before thresholds, then deterministic source/recall replay with identical production thresholds for both models. No aliases or graph edges. Labels frozen before inference. No production model/config changes.'}
    (args.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    reports=[run_model(resources,m,corpus,args.output) for m in MODELS]
    (args.output/'comparison.json').write_text(json.dumps(compare(reports),ensure_ascii=False,indent=2))
    print('Complete',flush=True)

if __name__=='__main__':main()
