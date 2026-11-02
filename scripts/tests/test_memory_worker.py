import importlib.util
from pathlib import Path
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('ariane_memory',Path(__file__).resolve().parents[2]/'src-tauri/resources/engine/memory.py')
worker=importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class Classification(unittest.TestCase):
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
