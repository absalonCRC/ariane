# ariane 0.3.2 — native screenshots

Captured on **5 November 2026** from the macOS application, in its English interface. The source images show the complete application window at 1,440 × 1,000 logical points, captured at 2× resolution. The README uses presentation copies retouched with **OpenAI Imagegen**: the screen-sharing indicator was replaced with macOS-style window buttons, and the pointer, halo and visible insertion carets were removed. The resulting images are approximately 1,505 × 1,045 pixels. The original captures are retained locally outside the published presentation.

## Source and isolation

- Base: `fb8bd328b3c5ada041a37c28c1c830b6ac5bdd08`, the merge of PR #12 into `main`, version 0.3.2.
- The resume capture includes a local CSS correction to let the English heading wrap fully; the fixed 50 px height in the merged 0.3.2 code can clip the second line. The CSS change is separate from the captured image.
- Standard release build, with a separate bundle identifier and a fresh application-data directory marked as synthetic. The product and window remain named **ariane**. No performance harness, mocked UI, or capture-only frontend is used.
- Project: **The atlas of small things · Demo**. Its prose, character Clara Dumas, places, outline and source notes are fictional material created for this presentation. The project database and Markdown mirrors were prepared as an isolated fixture before launch. Source indexing and the displayed note-activity entries come from the running application.
- Opening sources, search, focus, theme changes and version comparison are performed through the native interface. The user's existing projects and external vaults are not used in these images.

## Views

| Image | Visible state |
| --- | --- |
| [Writing](edited/writing.png) | Literary writing surface, current header controls and contextual notes. |
| [Dark theme](edited/dark.png) | The same writing surface in the dark theme. |
| [Settings](edited/settings.png) | Writing and reading controls for typography, focus, scrolling and reading comfort. |
| [Source card](edited/sources.png) | A contextual card for Clara Dumas, with linked manuscript occurrences. |
| [Source reader](edited/research.png) | The full source reader beside the manuscript. |
| [Resume](edited/resume.png) | Resume panel and genuine note activity from the demonstration session. |
| [Outliner](edited/outliner.png) | Nested passages in the working outline. |
| [Tables](edited/tables.png) | A live Markdown table in the demonstration project. |
| [Search](edited/search.png) | The current native search interface. |
| [Focus](edited/focus.png) | Paragraph focus in the manuscript. |
| [Versions](edited/versions.png) | Native side-by-side draft comparison. |
| [Export](edited/export.png) | The four available export formats. |

## Animations

The [note](actions/note.gif), [source reader](actions/reader.gif), [resume](actions/resume.gif) and [immersive focus](actions/focus.gif) animations are short excerpts of real interactions with the same 0.3.2 demonstration project. They were recorded with the pointer excluded and cropped at the top to remove the screen-sharing indicator; the remaining frames were resized and converted to GIF. They do not use generated application imagery. Each animation is five seconds and plays inside an expandable section of the README.

These images document visible states of an experimental application. A screenshot of a control does not validate every function behind it. The older film remains linked separately and explicitly identified as 0.2.0-alpha.1.
