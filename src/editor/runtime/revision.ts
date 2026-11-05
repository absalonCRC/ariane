import type { EditorView } from '@codemirror/view';
import { analyze } from '../../revision/diagnostics';
export function paintRevision(v: EditorView) {
  for (const line of v.dom.querySelectorAll('.cm-line')) {
    const text = line.textContent || '';
    const remarks = analyze(text);
    if (remarks.length) {
      line.setAttribute('data-remark', remarks[0].message);
      line.setAttribute('title', remarks.map((r) => r.message).join('\n'));
    } else {
      line.removeAttribute('data-remark');
      line.removeAttribute('title');
    }
  }
}
