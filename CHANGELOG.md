# Changelog

All notable changes to this project are recorded here, in the format of
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.2.5] - 2026-11-14

### Fixed

- A reply or the `/quote` pane that failed to draw fell back to the plain drawing without a word, so a broken hook looked like a working reply that only lacked its buttons. The failure now shows a toast, once per distinct message.

## [0.2.4] - 2026-11-14

### Fixed

- A reply drawn by prismantis got one ❝ for the whole reply, and no `[copy]` or `[lines]` header on code blocks. reply-tools now asks prismantis (`$.prismantis.markdown`) to draw each paragraph and keeps its own layout around it: a ❝ per paragraph and the code headers. Without prismantis, or if it answers nothing for a paragraph, the old one-❝ drawing stays. prismantis does not offer its reply frame to other mods, so reply-tools draws one in the look of prismantis's `replyStyle: framed` (round, Claude's orange, the `⬤  Claude` label, no fill); with `bubble` or `solid` set in prismantis the fill would be missing. A list in such a reply gets a ❝ per top-level item: the item keeps its number and its nested lines (prismantis draws an item alone under its own number). Tables, headings, quotes and code blocks stay one block each. The frame is as wide as the widest line needs (Hangul counted as two cells), up to the whole window; the engine does not shrink a Box to its text, so the width is set from the text. prismantis's own `── bash` label shows under the code header.

## [0.2.3] - 2026-11-06

### Added

- Public repository, `README.md` and `CHANGELOG.md`.
- Plugin icon: the copy mark on a blue square (`.claude-plugin/icon.png`).

### Changed

- Marketplace name is `reply-tools`; install with `reply-tools@reply-tools`.
- `aem` and `herdr` no longer count as command words when a backtick span is checked for a copy button.

## [0.2.2] - 2026-11-05

### Added

- A fenced block with two or more non-blank lines gets `[lines]` beside `[copy]`. It opens the pane on that block with one copy button per line and `[Copy all N lines]`.

## [0.2.1] - 2026-11-05

### Added

- `/quote toggle` closes the pane when it is open and opens it otherwise.

## [0.2.0] - 2026-11-04

### Added

- A header line above each fenced block with its number, language and `[copy]`.
- Broad copy buttons that never fold: `[All code]`, `[Text only]` and `[Pick&hellip;]`.
- `/quote` pane copies as well as quotes: `[Copy picked]`, `[Quote to prompt]`, `[all code]`, `[all text]` and `[clear]`.
- The toast names what was copied.

### Changed

- The gutter holds the quote button alone.

### Fixed

- `/quote` answered with an empty result, which the engine reported as unanswered; every path now returns text.
- `[Pick&hellip;]` could not run `/quote` through the engine, because the engine skips the calling plugin's own hook.

## [0.1.2] - 2026-10-31

### Removed

- `[reply md]` from the copy row, since the built-in `/copy` covers it.

### Changed

- `[reply text]` moves to the end of the row.

## [0.1.1] - 2026-10-31

### Changed

- Copy marks use the theme's suggestion color instead of dim gray.

## [0.1.0] - 2026-10-31

### Added

- First release, merging reply-comment 0.2.0 and an unpublished code-copy 0.1.0: a quote button per paragraph, `/quote` with sentence splitting and `/quote sel`, and copy buttons for code blocks, inline commands and the reply text.
