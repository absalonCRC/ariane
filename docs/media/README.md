# Ariane presentation media

## Current screenshots — ariane 0.3.2

The main README uses screenshots and short animations from [ariane 0.3.2](0.3.2), captured on **5 November 2026**. The stills were retouched for presentation; the animations show real interactions. See [the current capture notes](0.3.2/README.md) for the edits, source version, views and isolation method.

## Earlier film and screenshots — 0.2.0-alpha.1

The film and the older images directly in this directory were captured for the 0.2.0-alpha.1 presentation on 2 November 2026. They are preserved as historical media. **The film does not represent the current interface.** The provenance below describes that earlier production.

## Provenance

The **59.5-second V6 film** combines native Ariane window recordings with a generated paper-and-thread identity sequence. The sidebar stays closed. Product actions include live Markdown table creation and editing; automatic entity colors; creating a project-vault entry from a detected name; search results and opening an entry; local dictation; mouse outlining; paragraph and sentence focus; word counts; Pomodoro; and draft comparison.

Crops, camera moves, timing edits, gesture rings and feature labels are editorial. The macOS screen-recording badge is removed. UI controls and search/entity results are recorded from the running app, not generated images. The closing wordmark is the official lowercase asset used by `ArianeWordmark.tsx`, with the raised closing text retained.

The new thread keyframe was made with **OpenAI Imagegen**. It was animated using **[Seedance 2.5 image-to-video on Fal](https://fal.ai/models/bytedance/seedance-2.5/image-to-video)** through Safari: request `01a19d90-7fd5-77f0-8b0f-0e6b70cb5732`, five seconds, 720p, 24 fps, no generated audio. The animation appears in two short transitions and the closing sequence. It does not depict application behavior.

### Dictation capture

The dictation shot uses a **dedicated capture build with an audio-input fixture**: an existing OpenAI-generated WAV is decoded into a MediaStream in place of the hardware microphone. Ariane’s segmentation, local Parakeet transcription, insertion logic and editor remain unchanged. The engine produced and inserted “A quiet page A clear thought The voice is yours.”; the word count changed from 9 to 19. The result was neither pasted nor supplied as a prewritten transcript.

This demonstrates the actual local transcription and insertion pipeline, not a successful hardware-microphone test. Earlier attempts to play the generated voice through the Mac speakers and to route it through temporary Core Audio devices were not used. The temporary devices were removed. The audio adapter exists only in the separate production copy and is not part of the published application.

### Demo material

*The Human Thread — Studio* and the earlier *Motion* project contain fictional writing about AI and authorship. The new *The Connected Page* project uses illustrative prose naming Ada Lovelace and London; it is not a historical quotation or a sourced historical assertion. Its created entry belongs to the demo project. Existing external vaults are not modified.

[Portable essay and research material](../../examples/the-human-thread). Native demo projects, source recordings, production scripts and audio masters remain in the local Ariane Showcase folder; V4 and V5 exports are preserved.

## Sound and accessibility

The English voice-over is **AI-generated speech**, using the American male **Brian** voice from [Eleven v4 on Fal](https://fal.ai/models/elevenlabs/tts/eleven-v4). V6 reuses the approved V4/V5 voice recordings and aligns complete phrases to the visible actions, without changing their pitch or speech rate.

The opening uses Ariane’s own key, space and carriage-return samples from `src/editor/sounds`, synchronized with the native typing footage. **Music and narration begin at 00:03.40**, after the opening keys. Music and transition foley are original synthesized audio. Typewriter samples are mixed separately from the screen recordings.

`ariane-film.mp4` is **1920 × 1080 at 60 fps**, H.264, with 48 kHz stereo AAC and optional English captions, disabled by default. The mix targets −16 LUFS and −1.5 dBTP before AAC encoding. Standalone captions: [WebVTT](ariane-film.en.vtt) · [SRT](ariane-film.en.srt).

`film-poster.jpg` shows the final official wordmark composition. No animation autoplays in the README. The current writing, source, outliner and focus stills preserve the full native window; other detail views are identified by their captions. `versions.jpg` stacks two exact comparison excerpts for readability.

**GitHub releases remain withdrawn pending a notarized distribution.** This update publishes presentation media only.

## Film sequence

| Time | Visible action |
| --- | --- |
| 00:00–00:06 | Macro typing with mechanical keys, then a reveal of the page. |
| 00:06–00:10 | A Markdown table becomes editable; a cell changes. |
| 00:10–00:11.1 | Generated thread transition. |
| 00:11.1–00:18.3 | Names receive automatic colors; a detected person becomes a project-vault entry. |
| 00:18.3–00:23 | Search returns manuscript and vault results; an entry opens. |
| 00:23–00:28.8 | Local dictation and its inserted text. |
| 00:28.8–00:40 | Thread transition; mouse drags above, below and inside a line; move and unfold a branch. |
| 00:40–00:45.6 | Paragraph and sentence focus. |
| 00:45.6–00:51.6 | Word counter, then a running 25-minute Pomodoro. |
| 00:51.6–00:53.7 | Earlier and current drafts side by side. |
| 00:53.7–00:59.5 | Animated thread, official wordmark and closing text. |

## Narration transcript

An idea starts with a few words.

Write in live Markdown.

Shape your thoughts.

Keep your sources close, without leaving the page.

Find the thread across your writing and notes.

Capture a thought with local dictation.

Turn fragments into an outline.

Move.

Nest.

Move the whole branch.

Open it again.

Focus on a paragraph. Or a single sentence.

Every word counts.

Make time for twenty-five minutes of focus.

Revisit a draft.

Ariane. Your words. In context.

Original composition, demo prose and editorial production © 2026 Axel de Saint-Germain. Repository material is under GPL-3.0-only; third-party font and dependency notices remain in [THIRD_PARTY.md](../../THIRD_PARTY.md).
