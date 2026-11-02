# Ariane presentation media

Captured for the 0.2.0-alpha.1 presentation on 2 November 2026.

## Provenance

The product imagery comes from **Ariane running natively on macOS**, with the sidebar closed. The 89-second film edits actual window recordings. New takes show letter-by-letter typing, mouse drags above, below and inside an outline line, folding and moving a branch, paragraph and sentence focus, typewriter scrolling, source context, counters and Pomodoro. Live Markdown, table editing, dictation controls and draft comparison also use native recordings.

Crops, camera moves, changes of playback speed, restrained gesture rings, feature labels and the closing composition are editorial. The macOS screen-recording badge is removed from the picture. Product controls, results and interactions were not generated or recreated. The closing logo is the same lowercase asset imported by `ArianeWordmark.tsx` in the app. The paper-and-thread background was generated with OpenAI Imagegen; it is a closing graphic, not product imagery.

The dedicated **The Human Thread — Studio** and earlier **The Human Thread — Motion** projects contain fictional writing about AI and authorship. All people, institutions, interviews and observations are invented. The [portable essay and research material](../../examples/the-human-thread) remains available separately. Native demo projects, recordings, editable production scripts and audio masters are retained locally in Ariane Showcase.

The dictation shot shows native active controls. A separate test sent an OpenAI-generated phrase through Ariane’s bundled local transcription engine and returned the expected words. Speaker playback into the microphone did not produce a complete UI transcription; the film does not represent that test as a successful end-to-end microphone demonstration. Ariane’s dictation remains local; the film’s narration was generated separately.

## Sound and accessibility

The English narration is **AI-generated speech**, using the American male **Brian** voice from [Eleven v4 on Fal](https://fal.ai/models/elevenlabs/tts/eleven-v4), exported as uncompressed 48 kHz PCM. Phrase edits align the narration with the visible actions without changing voice pitch or speed.

The opening uses **Ariane’s own key, space and carriage-return samples** from `src/editor/sounds`, synchronized in the edit to the native typing footage. Music begins at **00:04.65** and narration at **00:04.80**. The instrumental score and additional transition foley are original synthesized audio. Typewriter sounds were mixed from the app assets, rather than captured as system audio.

`ariane-film.mp4` is the **1920 × 1080, 60 fps** H.264 film, with a 48 kHz stereo AAC mix and optional English subtitles. The mix targets −16 LUFS and a −1.5 dBTP ceiling before AAC encoding. Standalone captions: [WebVTT](ariane-film.en.vtt) · [SRT](ariane-film.en.srt).

`film-poster.jpg` is the corrected closing frame. The README does not autoplay animation. The light wordmark preserves the original logo’s alpha silhouette for contrast in GitHub’s dark theme. GitHub releases remain withdrawn pending a notarized distribution.

The stills are native app imagery. The current writing, source, outliner and focus images preserve the full window. Other detail views remain labeled by their captions. `versions.jpg` places two exact excerpts from the native side-by-side comparison above one another for readability.

## Film sequence

| Time | Visible action |
| --- | --- |
| 00:00–00:09.7 | Close-up typing and carriage return; the camera opens onto the page as music and narration enter. |
| 00:09.7–00:18.2 | Live Markdown heading and emphasis; table insertion and cell editing. |
| 00:18.2–00:36.1 | Mouse drags above, below and inside a line; fold, move and unfold a complete branch. |
| 00:36.1–00:47.5 | Paragraph focus, sentence focus and a page that follows the typing line. |
| 00:47.5–00:51.6 | Native local dictation controls in their active state. |
| 00:51.6–01:01.3 | Search results, then a complete source card beside the manuscript. |
| 01:01.3–01:07.9 | Word, character and line counters, each held for more than two seconds. |
| 01:07.9–01:12.5 | Start a 25-minute Pomodoro and see its countdown. |
| 01:12.5–01:21.3 | Refine a phrase, then inspect the side-by-side draft comparison. |
| 01:21.3–01:29 | Dark writing surface, then the official lowercase logo on a continuous paper-and-thread background. |

## Narration transcript

An idea starts with a few words.

Ariane gives it room to grow.

Write in live Markdown, and see your thoughts take shape.

Turn fragments into an outline.

Nest a thought.

Move the whole branch.

Open it again.

Then stay with the writing.

One paragraph.

One sentence.

The page follows your pace.

Speak when a thought arrives faster than your fingers.

Find the thread across your pages and notes.

Bring a source beside the sentence that needs it.

See your progress, word by word.

Set aside twenty-five minutes, and keep going.

When the idea changes, return to an earlier draft.

Compare.

Keep what matters.

Ariane. Your words. In context.

Original composition, demo prose and editorial production © 2026 Axel de Saint-Germain. Repository material is under GPL-3.0-only; third-party font and dependency notices remain in [THIRD_PARTY.md](../../THIRD_PARTY.md).
