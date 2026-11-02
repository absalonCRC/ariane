"""Optional local GLiNER comparison; requires Ariane’s installed Python/model runtime.
Synthetic French/English examples only. Does not edit a project or download a model.
Run with the installed memory/runtime/bin/python.
"""
import importlib.util,json,time,statistics,pathlib,resource
root=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('memory',root/'src-tauri/resources/engine/memory.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
engine=m.MemoryEngine(pathlib.Path.home()/'Library/Application Support/fr.ariane.writer/memory')
raw=[
('Claude est né à Toulouse.', [('Claude','person'),('Toulouse','location')]),
('Nougaro chante ce soir.', [('Nougaro','person')]),
('Voltaire écrivait chaque matin.', [('Voltaire','person')]),
('Molière entre en scène.', [('Molière','person')]),
('Socrate interroge ses disciples.', [('Socrate','person')]),
('Élise referme la porte.', [('Élise','person')]),
('Pierre ramasse une pierre.', [('Pierre','person')]),
('Rose cueille une rose.', [('Rose','person')]),
('Gandalf rejoint Frodon.', [('Gandalf','person'),('Frodon','person')]),
('Arya attend devant la porte.', [('Arya','person')]),
('Mélusine disparaît dans la forêt.', [('Mélusine','person')]),
('Merlin conseille Arthur.', [('Merlin','person'),('Arthur','person')]),
('Napoléon quitte Paris.', [('Napoléon','person'),('Paris','location')]),
('Vaël tend sa lame à Néris.', [('Vaël','person'),('Néris','person')]),
('Aelys répondit sans hésiter.', [('Aelys','person')]),
('Qorûn traversa la salle.', [('Qorûn','person')]),
('Toulouse est une ville de France.', [('Toulouse','location'),('France','location')]),
('Le Portugal est voisin de l’Espagne.', [('Portugal','location'),('Espagne','location')]),
('Les Templiers possédaient une commanderie.', [('Templiers','organization')]),
('L’UNESCO publie un rapport.', [('UNESCO','organization')]),
('Claude Nougaro est né à Toulouse.', [('Claude Nougaro','person'),('Toulouse','location')]),
('Jean-Pierre retrouve Anne-Marie.', [('Jean-Pierre','person'),('Anne-Marie','person')]),
('😀 Éloïse parle avec Zoé.', [('Éloïse','person'),('Zoé','person')]),
('Alice walks beside Bob.', [('Alice','person'),('Bob','person')]),
('Rose picked a rose.', [('Rose','person')]),
('Toulouse was a beautiful city. Claude Nougaro wwas born here.', [('Toulouse','location'),('Claude Nougaro','person')]),
('Marie écrit. Elle se tait ensuite.', [('Marie','person')]),
('Il se retourne. Elle prend son manteau.', []),
('Demain sera une longue journée.', []),
('Bonjour, comment allez-vous ?', []),
('La lumière tombe sur la pierre.', []),
('Une rose pousse près du mur.', []),
('Le roi entre dans la salle.', []),
('Hiver après hiver, la neige revient.', []),
('Ordre du jour : vérifier les comptes.', []),
('Orange est une couleur chaude.', []),
('Une pomme et une orange suffisent.', []),
('Le pays est couvert de neige.', []),
('What we keep. What we leave behind.', []),
('The first spark. An unexpected question.', []),
('Claude', [('Claude','person')]),
('Qorûn', [('Qorûn','person')]),
]
variants={'current':['person','location','organization','work','event'], 'descriptions':{'person':'Name of a real or fictional individual: first name, surname, full name or a single-word name. Exclude pronouns and common nouns.', 'location':'Name of a geographical place, country, city, region or fictional place.', 'organization':'Name of an organization, institution, religious order, military order or group.', 'work':'Title of a book, song, film or other creative work.', 'event':'Name of a historical or fictional event.'}}
start=time.perf_counter();extractor=engine.gliner();load=(time.perf_counter()-start)*1000
report={'model':m.NER_MODEL_ID,'loadMs':load,'variants':{}}
for variant,labels in variants.items():
 cases=[];tp=fp=fn=0
 for text,expected in raw:
  start=time.perf_counter();output=extractor.extract_entities_long(text,labels,threshold=.5,chunk_size=256,chunk_overlap=32,batch_size=1,num_workers=0,include_confidence=True,include_spans=True);elapsed=(time.perf_counter()-start)*1000
  mentions=[dict(item,label=label) for label,items in output.get('entities',{}).items() for item in items]
  accepted={(i['text'],i['label']) for i in mentions if i.get('confidence',0)>=.8 and any(c.isupper() for c in i['text'])}
  gold=set(expected);tp+=len(accepted&gold);fp+=len(accepted-gold);fn+=len(gold-accepted)
  cases.append({'text':text,'expected':expected,'mentions':mentions,'elapsedMs':elapsed,'missed':sorted(gold-accepted),'extra':sorted(accepted-gold)})
 report['variants'][variant]={'tp':tp,'fp':fp,'fn':fn,'precision':tp/(tp+fp) if tp+fp else 0,'recall':tp/(tp+fn),'medianMs':statistics.median(c['elapsedMs'] for c in cases),'cases':cases}
 print(variant,json.dumps({k:v for k,v in report['variants'][variant].items() if k!='cases'}),flush=True)
report['maxRssBytes']=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
(root/'artifacts/entity-detection-2026-11-02').mkdir(parents=True,exist_ok=True)
(root/'artifacts/entity-detection-2026-11-02/evaluation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
