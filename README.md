# reply-tools

A Claude Code mod that quotes and copies parts of a reply with one click.
It needs a fullscreen terminal, the only surface where a plugin receives clicks.

## What it does

- **Quote.** A `&#10077;` button beside each paragraph appends it to your prompt as a `> quote` followed by `comment:`. Nothing is submitted.
- **`/quote`.** Opens a pane of the last five replies. Tick paragraphs or split them into sentences, add a note, and press Enter to fill the prompt. `/quote sel` quotes the last mouse selection.
- **Copy a code block.** Each fenced block gets a header &#9312; bash ... [copy], and [lines] too when the block has two or more non-blank lines. In a shell block that shows prompts, only the typed commands are copied. A leading `!`, `$` or `%` is dropped (`>` too in PowerShell and cmd blocks), and every line without a prompt is treated as output and left out.
- **Copy by line.** `[lines]` opens the pane on that block with one copy button per line.
- **Copy row.** Under a reply, &#10697; copy lists inline commands, `[reply text]`, `[All code]`, `[Text only]` and `[Pick...]`.

No model call, no process and no file is involved.

## Install

```bash
claude plugin marketplace add korenl137/reply-tools
claude plugin install reply-tools@reply-tools --scope user
```

Then restart Claude Code or run `/reload-plugins`.
If you use the separate reply-comment mod, disable it, or each reply is drawn twice.

## Limits

- The quote buttons and copy buttons need a fullscreen terminal, the only place a plugin receives clicks. Elsewhere only the `/quote` command is available.
- On a terminal narrower than 144 columns the `/quote` pane is not placed automatically (observed in Claude Code 2.1.3x).
- `/quote toggle` opens or closes the pane, for a launcher that wants a single button.
- A shell block with prompts loses heredoc bodies and multi-line quoted strings, because those lines carry no prompt. Copy such a block by selecting it, or use a block without prompts.
- `[reply text]` keeps link text but not link URLs.
- Inline code spans count as commands only with a `$` or `!` prompt, or a known command word followed by an argument.

## Develop

```bash
claude plugin validate .
claude plugin test .
```

Type checks use TypeScript 5.6.3 against Claude Code's own declarations in `.claude-plugin/types/`.
That folder is gitignored; run `/plugin-types` in a Claude Code session to write it.
`CHANGELOG.md` lists releases. `PROVENANCE.md` records where the code came from and what was checked in a native session.

## AI disclosure

This mod was written with AI assistance. Some layouts are not yet observed in a native session; `PROVENANCE.md` lists them.

## License

[MIT](LICENSE)
