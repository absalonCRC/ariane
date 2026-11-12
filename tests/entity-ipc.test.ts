import { expect, it } from 'vitest';
import fixture from './fixtures/ipc-entity-relation.json';
import type { Requests } from '../src/contracts/requests';
it('serializes relationship identity, confirmation and evidence independently across IPC', () => {
  const value: { type: 'entityOperation' } & Requests['entityOperation'] = {
    type: 'entityOperation',
    projectPath: '/synthetique',
    revision: 7,
    operation: {
      action: 'relation',
      relation: {
        id: 'lien',
        from: 'origine',
        to: 'destination',
        name: 'étudie',
        status: 'proposed',
        provenance: { source: 'source', section: 'scene', node: 'ligne', quote: 'Été 🌿' },
      },
    },
  };
  expect(JSON.parse(JSON.stringify(value))).toEqual(fixture);
});
