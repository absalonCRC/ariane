# Ariane 0.2.0-alpha.1

A larger step toward a quiet, connected writing workspace. This **source-only prerelease** brings English and Spanish alongside French, a refined writing interface, editable Markdown tables and richer ways to work with research and earlier drafts.

## What’s new

- **English, French and Spanish interfaces**, with a remembered application language and a separate document-language setting.
- **A quieter writing workspace:** collapsible library, contextual tools, improved notices and reading comfort controls.
- **Editable Markdown tables** with row and column operations, plus direct title-first page creation.
- **Research beside the manuscript:** source browsing, linked passages, and a clearer distinction between inserted references and detected name mentions.
- **A more flexible manuscript library:** chapters, scenes, working notes, inclusion controls and imports from Markdown, DOCX and TextBundle.
- **Better draft comparison:** side-by-side passages, word-level additions and removals, individual passage recovery and a saved version before applying changes.
- **A new English project presentation:** editorial close-ups from the native app, a 46-second introduction and a reusable fictional demo about AI and authorship.

The presentation was refreshed on 2 November: sidebar closed, selected details enlarged, and a revised film. The release tag still identifies the same application sources; the presentation attachments below are the refreshed edition.

## Downloads

- **Source code:** use GitHub’s automatically generated ZIP or tarball for this tag.
- **Ariane-The-Human-Thread-1080p60.mp4:** the full-quality 46-second introduction, with an original instrumental score.
- **Ariane-The-Human-Thread-demo.zip:** portable Markdown manuscript and research vault. People, interviews and institutions are fictional.
- **SHA256SUMS.txt:** checksums for the presentation and demo attachments.

There is **no public application binary in this prerelease**. The local macOS build is signed ad hoc and is not notarized. The complete third-party redistribution bundle and a clean-machine installation qualification remain outstanding.

## Build and platform

Apple Silicon Mac · macOS 26+ · Node.js 24+ · Rust/Cargo 1.95.0 · Python 3.11+ · Xcode command-line tools.

```sh
npm ci
python3 scripts/setup-resources.py
npm run verify
npm run tauri build -- --bundles app
```

See the [build guide](https://github.com/absalonCRC/ariane/blob/v0.2.0-alpha.1/docs/building.md) for resource preparation. Optional entity detection, dictation and revision modules are installed separately. The interface language does not translate manuscript content.

## Verification and limits

The release sources are checked from a separate clean export. Validation includes native-resource checksums, packaging tests, TypeScript and frontend build, the JavaScript suite, Rust tests and Clippy. The demo was opened in the native app; source lookup, version comparison and PDF export were exercised. The film files were decoded and checked for their dimensions and duration.

Ariane remains an experimental alpha. Back up the whole project folder with the app closed. Remote synchronization, OCR, Windows, Linux and Intel Macs are not supported. A locally successful build does not establish Gatekeeper trust or validate installation on another Mac. See the [current limitations](https://github.com/absalonCRC/ariane#current-limits).

[Explore Ariane](https://github.com/absalonCRC/ariane#readme) · [Full comparison](https://github.com/absalonCRC/ariane/compare/v0.1.0-alpha.1...v0.2.0-alpha.1)
