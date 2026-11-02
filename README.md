<div align="center">
  <img src="src/assets/ariane-wordmark-lowercase.png" alt="ariane" width="250">
  <p><strong>Keep the human thread.</strong></p>
  <p>A local writing app for long-form work. Your manuscript, your research, your voice.</p>
  <p><strong>English · Français · Español</strong></p>
  <p>
    <a href="#see-ariane-in-action">Watch the film</a> ·
    <a href="#a-page-with-room-to-think">Explore the features</a> ·
    <a href="#try-the-alpha">Try the alpha</a> ·
    <a href="#contribute">Contribute</a>
  </p>
  <p><a href="https://github.com/absalonCRC/ariane/actions/workflows/verify.yml"><img src="https://github.com/absalonCRC/ariane/actions/workflows/verify.yml/badge.svg" alt="GitHub Actions verification"></a> <a href="LICENSE"><img src="https://img.shields.io/badge/license-GPL--3.0--only-343434" alt="GPL-3.0-only license"></a> <img src="https://img.shields.io/badge/macOS-26%2B%20%7C%20Apple%20Silicon-343434" alt="macOS 26 and later, Apple Silicon"></p>
</div>

## See Ariane in action

[![Watch the 46-second Ariane introduction](docs/media/film-poster.jpg)](https://github.com/absalonCRC/ariane/raw/refs/heads/main/docs/media/ariane-film.mp4)

**[Watch or download the film · 46 seconds · MP4](https://github.com/absalonCRC/ariane/raw/refs/heads/main/docs/media/ariane-film.mp4)**

Ariane brings a quiet Markdown editor, a structured manuscript and a research library into one local workspace. Mention a person, place or idea in your draft, and a related note can appear in the margin. Open the context, insert a reference when it is useful, and return to your sentence.

The film and screenshots show **0.2.0-alpha.1 running natively on macOS**, using *The Human Thread*: a fictional essay about AI and authorship. The project contains four chapters, eight pages, ten research notes and two sample drafts. All people, interviews and institutions are invented. [Browse the reusable demonstration material](examples/the-human-thread).

## A page with room to think

Start with a title and write. Literary typography, adjustable reading width and line spacing, sentence or paragraph focus, and typewriter scrolling let you shape your writing environment. Tools stay close without turning the page into a dashboard.

![Ariane’s native writing workspace, with chapters on the left and related research in the margin](docs/media/writing.jpg)

### Your research, beside the sentence

Connect an existing Obsidian vault in **read-only mode**, or create a vault owned by the project. Browse your notes, follow detected mentions and inspect related sources beside your draft. Open the full note, find its appearances in the manuscript, or insert a citation or reference.

Connections are invitations to investigate. A suggested note does not verify a claim, and a name match does not establish someone’s identity.

![A source card for the fictional essayist Mara Vale beside the manuscript](docs/media/sources.jpg)

<details>
<summary>Look inside a research note</summary>

![A full research note with fictional interview excerpts and linked manuscript passages](docs/media/research.jpg)

The same research can be reached from the source library and from the manuscript. External vaults remain read-only.
</details>

### A manuscript you can shape

Organize chapters, scenes and notes in the project tree. Reorder sections, choose what belongs in the manuscript, read the assembled text, and import writing into the open project. Editable Markdown tables keep comparisons readable while their underlying text remains portable.

![An editable Markdown table comparing writing tasks, useful assistance and human decisions](docs/media/tables.jpg)

### Revise without losing the earlier thought

Keep named versions, compare drafts side by side, inspect additions and removals, and bring back an individual passage. Ariane saves a version before applying a passage or restoring a snapshot.

![Native version comparison with additions and removals highlighted](docs/media/versions.jpg)

### Find the thread again

Search across project texts and connected vaults from the writing page. Local semantic retrieval can also suggest related manuscript passages and research notes. Open the result and decide whether the connection belongs in your work.

![Search results for human thread across the manuscript and the research vault](docs/media/search.jpg)

### Make the space yours

Choose **English, French or Spanish** for the interface. The choice is remembered across sessions; changing it leaves your manuscript untouched. Document language is a separate setting. Light, dark and system themes adapt the whole workspace to your preferred environment.

![The same manuscript in Ariane’s dark theme](docs/media/dark.jpg)

### Take your writing with you

Export the full manuscript or the current section as **Markdown, PDF, Word or EPUB**, with citations. The writing project is stored locally in SQLite with readable Markdown mirrors. Ariane detects conflicting external edits and preserves a recovery copy during resolution.

<details>
<summary>See the export options</summary>

![The native export panel with Markdown, PDF, Word and EPUB options](docs/media/export.jpg)
</details>

## Local by design

**No account or cloud service is required to write.** Your manuscript and its processing stay on your Mac. Engines and models need an Internet connection when they are downloaded and installed.

Optional local modules add entity detection, dictation and revision assistance. Suggestions remain yours to review; corrections are not applied without your choice. You can write, save and export without installing these modules.

Ariane is for novels, essays, documented narratives, theses and any long-form work that grows alongside research. It also works as a quiet place to write with no connected vault.

## Try the alpha

**Ariane 0.2.0-alpha.1 is experimental and targets Apple Silicon Macs running macOS 26 or later.** A notarized, ready-to-download application is not available yet. This version can be built from source.

[Current source-only prerelease: 0.2.0-alpha.1](https://github.com/absalonCRC/ariane/releases/tag/v0.2.0-alpha.1) · [Detailed build guide](docs/building.md)

<details>
<summary>Build from source</summary>

Requirements: an Apple Silicon Mac with macOS 26+, Xcode command-line tools, Node.js 24+, Rust/Cargo 1.95.0 and Python 3.11+. Allow several GB for resources and build artifacts. Homebrew is not required to prepare the engines.

```sh
npm ci
python3 scripts/setup-resources.py
npm run verify
npm run tauri build -- --bundles app
open src-tauri/target/release/bundle/macos/Ariane.app
```

Resource preparation downloads pinned native engines and EmbeddingGemma 300M Q8 (about 334 MB). The [Gemma terms](https://ai.google.dev/gemma/terms) apply to that model. A locally built bundle is signed ad hoc and is not notarized.

For development, run `npm run tauri dev`. `npm run dev` starts a browser preview with simulated data; it does not access native project files.
</details>

### Optional modules

From the source checkout, with Python and [uv](https://docs.astral.sh/uv/getting-started/installation/) installed:

```sh
python3 scripts/setup-memory.py    # Manuscript entities: GLiNER
python3 scripts/setup-voice.py     # Dictation: Parakeet and Spokenly Cleanup
python3 scripts/setup-revision.py  # Revision: LanguageTool and SalamandraTA
```

These experimental modules are installed in Ariane’s local application data. Base semantic retrieval uses EmbeddingGemma; the active installer no longer uses E5.

### Current limits

- Back up **the entire project folder with the application closed**. Built-in history does not replace an independent backup.
- The alpha has no remote sync, OCR, Windows, Linux or Intel Mac build.
- Forced termination at every write stage, low-disk-space handling and every Word rendering scenario are not fully qualified yet.
- PDF, Word and EPUB exports support images local to the project. Remote resources, escaping symlinks and raw HTML, TeX or Typst fragments are rejected. Markdown export preserves the text.

More detail: [usage guide](docs/usage.md) · [architecture](docs/architecture.md) · [changelog](CHANGELOG.md). Some detailed guides are currently in French.

## Contribute

Feedback on writing workflows, reproducible bug reports and code contributions are welcome. [Report a problem or propose an idea](https://github.com/absalonCRC/ariane/issues/new/choose). See [CONTRIBUTING.md](CONTRIBUTING.md) for preparing a report without personal data, and [SECURITY.md](SECURITY.md) to report a vulnerability privately.

## License

Copyright © 2026 Axel de Saint-Germain. Ariane’s original code is licensed under **GNU GPL version 3 only** ([LICENSE](LICENSE), [COPYRIGHT](COPYRIGHT)). Libraries, fonts, styles and models retain their own licenses and terms; see [THIRD_PARTY.md](THIRD_PARTY.md).

[Media provenance and film transcript](docs/media/README.md).
