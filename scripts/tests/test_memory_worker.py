import importlib.util
import re
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('ariane_memory',Path(__file__).resolve().parents[2]/'src-tauri/resources/engine/memory.py')
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class Classification(unittest.TestCase):
    def test_publisher_and_worker_version_match(self):
        source=Path(__file__).resolve().parents[2]/'src-tauri/src/memory/ner.rs'
        version=re.search(r'NER_MODEL: &str = "([^"]+)"',source.read_text()).group(1)
        self.assertEqual(worker.NER_MODEL_ID,version)
        self.assertEqual(set(worker.POLICY['ner']['thresholds']),set(worker.LABELS))
    def test_custom_budget_counts_eligible_spans_instead_of_weak_prefixes(self):
        with tempfile.TemporaryDirectory() as root:
            engine=worker.MemoryEngine(Path(root))
            long_name='I'*121
            text='mot '*5+long_name+' UNESCO'
            engine.entities=lambda text:[{'text':'mot','label':'person','start':i*4,'end':i*4+3,'score':.6} for i in range(5)]+[{'text':long_name,'label':'organization','start':20,'end':141,'score':.99},{'text':'UNESCO','label':'organization','start':142,'end':148,'score':.99}]
            class Model:
                def classify_text(self,*args,**kwargs):
                    return {'type':[{'label':'Institution','confidence':.99},{'label':'Note','confidence':.01}]}
            engine.gliner=lambda:Model()
            result=engine.run({'operation':'entities','text':text,'types':[{'name':'Institution','description':'Organisme officiel','examples':[]}]})
            self.assertEqual(result['entities'][-2]['label'],'organization')
            self.assertEqual(result['entities'][-1]['label'],'custom:Institution')
            self.assertEqual(result['entities'][-1]['baseLabel'],'organization')
    def test_custom_definitions_are_passed_to_local_classifier(self):
        class Model:
            def classify_text(self,text,tasks,**kwargs):
                self.text,self.tasks=text,tasks
                return {'type':[{'label':'Dynastie','confidence':.9}]}
        model=Model()
        with tempfile.TemporaryDirectory() as root:
            engine=worker.MemoryEngine(Path(root));engine.gliner=lambda:model
            result=engine.run({'id':1,'operation':'classify_note','title':'capétiens','text':'Famille de rois','types':[{'name':'Dynastie','description':'Famille régnante','examples':['Valois']}]})
            self.assertEqual(result['classification']['type'][0]['label'],'Dynastie')
            self.assertIn('Famille régnante',model.tasks['type']['labels']['Dynastie'])
            self.assertIn('Valois',model.tasks['type']['labels']['Dynastie'])
            self.assertIn('Capétiens',model.text)
            self.assertIn('Note',model.tasks['type']['labels'])
    def test_rejects_invalid_schema_before_loading_model(self):
        engine=worker.MemoryEngine(Path('/unused'))
        with self.assertRaises(ValueError):
            engine.run({'operation':'classify_note','title':'Nom','types':[{'name':'a'*61}]})

if __name__=='__main__': unittest.main()
