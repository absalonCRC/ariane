import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('memory_vectors', Path(__file__).resolve().parents[1]/'migrate-memory-vectors.py')
migration = importlib.util.module_from_spec(spec)
spec.loader.exec_module(migration)


class MemoryVectors(unittest.TestCase):
    def fixture(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.database = Path(directory.name)/'ariane.sqlite'
        c = sqlite3.connect(self.database)
        c.execute('CREATE TABLE memory_passages(key TEXT PRIMARY KEY,text TEXT,model TEXT,vector,query_vector)')
        for key, dimension in [('a', 768), ('b', 768), ('legacy', 384)]:
            vector = json.dumps([[1.] + [0.]*(dimension-1)])
            c.execute('INSERT INTO memory_passages VALUES(?,?,?,?,?)', (key, 'manuscript unchanged', f'model-{dimension}', vector, vector))
        c.commit()
        self.addCleanup(c.close)
        return c

    def test_interrupted_migration_resumes_and_can_return_to_json(self):
        c = self.fixture()
        source = c.execute('SELECT key,text,model FROM memory_passages ORDER BY key').fetchall()
        self.assertEqual(migration.convert(c, 'binary', 1)['passages'], 1)
        c.close()
        c = sqlite3.connect(self.database)
        self.addCleanup(c.close)
        self.assertEqual(migration.convert(c, 'binary')['passages'], 1)
        self.assertEqual(migration.convert(c, 'binary')['passages'], 0)
        self.assertIsInstance(c.execute("SELECT vector FROM memory_passages WHERE key='legacy'").fetchone()[0], str)
        self.assertEqual(migration.convert(c, 'json')['passages'], 2)
        for vector, query in c.execute('SELECT vector,query_vector FROM memory_passages'):
            self.assertEqual(migration.decode(vector), migration.decode(query))
        self.assertEqual(c.execute('SELECT key,text,model FROM memory_passages ORDER BY key').fetchall(), source)

    def test_bad_vector_rolls_back_the_whole_batch(self):
        c = self.fixture()
        c.execute("UPDATE memory_passages SET query_vector='[[0,0]]' WHERE key='b'")
        c.commit()
        original = c.execute('SELECT * FROM memory_passages ORDER BY key').fetchall()
        with self.assertRaises(ValueError):
            migration.convert(c, 'binary')
        self.assertEqual(c.execute('SELECT * FROM memory_passages ORDER BY key').fetchall(), original)


if __name__ == '__main__':
    unittest.main()
