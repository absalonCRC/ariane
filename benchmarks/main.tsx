import { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Editor, type EditorHandle } from '../src/editor/Editor';
import { defaultSettings } from '../src/contracts/settings';
import { type Section } from '../src/contracts/project';
import '@fontsource/eb-garamond/latin-400.css';
import '../src/styles/tokens.css';
import '../src/styles/editor.css';
function App() {
  const ref = useRef<EditorHandle>(null);
  const [scenes, setScenes] = useState<Section[]>([]);
  const [generation, setGeneration] = useState(0);
  const [result, setResult] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(words: number, structured = false) {
    setBusy(true);
    setResult('Préparation…');
    const phrase = 'La mémoire des lieux accompagne une voix dans la ville. ';
    const perScene = 1000;
    const line = phrase.repeat(5) + '\n';
    const text = structured
      ? line.repeat(20)
      : Array.from({ length: perScene / 10 }, () => phrase).join('');
    const values: Section[] = Array.from({ length: words / perScene }, (_, i) => ({
      id: String(i),
      title: 'Scène ' + i,
      parent: null,
      position: i,
      kind: 'scene',
      text,
      revision: 0,
      synopsis: '',
      status: '',
      goal: 0,
      ...(structured
        ? {
            outline: {
              version: 1 as const,
              nodes: Array.from({ length: 20 }, (_, j) => ({
                id: `${i}-${j}`,
                start: j * line.length,
                parent: j % 5 ? `${i}-${j - (j % 5)}` : null,
              })),
            },
          }
        : {}),
    }));
    const start = performance.now();
    setScenes(values);
    setGeneration((g) => g + 1);
    await new Promise((r) => setTimeout(r, 1200));
    const domLines = document.querySelectorAll('.cm-line').length;
    const dispatch: number[] = [];
    const frames: number[] = [];
    for (let i = 0; i < 120; i++) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => {
          const t = performance.now();
          ref.current?.insert('a');
          dispatch.push(performance.now() - t);
          requestAnimationFrame(() => {
            frames.push(performance.now() - t);
            resolve();
          });
        }),
      );
    }
    const stats = (a: number[]) => {
      const s = [...a].sort((a, b) => a - b);
      return {
        p50: s[Math.floor(s.length * 0.5)],
        p95: s[Math.floor(s.length * 0.95)],
        p99: s[Math.floor(s.length * 0.99)],
      };
    };
    setResult(
      JSON.stringify(
        {
          requestedWords: words,
          structured,
          characters: ref.current?.text().length,
          scenes: values.length,
          renderedLines: domLines,
          samples: 120,
          dispatchMs: stats(dispatch),
          nextFrameMs: stats(frames),
          totalMs: performance.now() - start,
          userAgent: navigator.userAgent,
        },
        null,
        2,
      ),
    );
    setBusy(false);
  }
  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 99,
          background: 'white',
          padding: 15,
          display: 'flex',
          gap: 15,
        }}
      >
        <button disabled={busy} onClick={() => void run(1_000_000)}>
          Mesurer 1 million de mots
        </button>
        <button disabled={busy} onClick={() => void run(2_000_000)}>
          Mesurer 2 millions de mots
        </button>
        <button disabled={busy} onClick={() => void run(2_000_000, true)}>
          Mesurer 40 000 passages
        </button>
      </div>
      <pre
        aria-label="Résultats"
        style={{
          position: 'fixed',
          right: 20,
          top: 70,
          fontSize: 11,
          zIndex: 50,
          whiteSpace: 'pre-wrap',
          maxWidth: 370,
          background: '#fafafa',
          padding: 15,
        }}
      >
        {result}
      </pre>
      <main className="writing-layout">
        <div className="manuscript-column">
          <Editor
            ref={ref}
            sections={scenes}
            generation={generation}
            settings={defaultSettings}
            onChange={() => {}}
            onVisible={() => {}}
            onWords={() => {}}
            onCharacters={() => {}}
            onCursor={() => {}}
            onTyping={() => {}}
          />
        </div>
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
