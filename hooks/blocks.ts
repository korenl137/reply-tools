// reply-tools' pure decisions, with no engine import: one block parser shared by quote and copy, the copy text of a block,
// inline commands, plain text, sentences and the quote format. register.tsx passes a reply's text in and draws.

export type Block = {
  /** the block as written: a paragraph, a whole list, or a fence with its marker lines (what the reply is drawn from) */
  text: string
  /** present for a fenced block */
  fence?: { lang: string; body: string; isClosed: boolean }
}

const SHELL = new Set(['bash', 'sh', 'shell', 'zsh', 'fish', 'console', 'terminal', 'shellsession', 'powershell', 'ps1', 'pwsh', 'cmd', 'bat'])
const FENCE = /^\s{0,3}(```+|~~~+)\s*([^\s`]*)/
const ITEM = /^\s*([-*+]|\d+[.)])\s/
const PREVIEW_CELLS = 36
/** a prompt typed before a command: `$ ` and `% ` as pasted sessions show them, `! ` as Claude Code's in-session run prefix */
const PROMPT = /^\s*[!$%]\s+/

// Blank-line separated paragraphs; a closed fence is one block (a fence that never closes takes the rest and is not copyable);
// a list with blank lines between its items stays one block, or each item would restart at "1.".
export function parse(text: string): Block[] {
  const out: Block[] = []
  const lines = text.split('\n')
  let cur: string[] = []
  const flush = () => {
    if (cur.length > 0) out.push({ text: cur.join('\n') })
    cur = []
  }
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const open = FENCE.exec(line)
    if (open === null) {
      if (line.trim() === '') flush()
      else cur.push(line)
      continue
    }
    flush()
    const marker = open[1] ?? '```'
    const close = new RegExp(`^\\s{0,3}${marker[0] === '~' ? '~' : '`'}{${marker.length},}\\s*$`)
    let end = lines.findIndex((l, j) => j > i && close.test(l))
    const isClosed = end >= 0
    if (!isClosed) end = lines.length
    out.push({ text: lines.slice(i, isClosed ? end + 1 : end).join('\n'), fence: { lang: open[2] ?? '', body: lines.slice(i + 1, end).join('\n'), isClosed } })
    i = end
  }
  flush()

  return out.reduce<Block[]>((acc, b) => {
    const prev = acc[acc.length - 1]
    const isList = prev !== undefined && !prev.fence && !b.fence && ((ITEM.test(b.text) && ITEM.test(prev.text.split('\n').at(-1) ?? '')) || (ITEM.test(prev.text) && /^\s{2,}\S/.test(b.text)))
    if (isList) acc[acc.length - 1] = { text: `${prev.text}\n\n${b.text}` }
    else acc.push(b)

    return acc
  }, [])
}

const promptOf = (line: string, lang: string): string | undefined => {
  const m = PROMPT.exec(line) ? line.replace(PROMPT, '') : lang === 'powershell' || lang === 'pwsh' || lang === 'ps1' || lang === 'cmd' || lang === 'bat' ? /^\s*>\s(.*)$/.exec(line)?.[1] : undefined

  return m
}

// The command lines of a shell block that shows prompts, prompts off, "\" continuations kept; any other block whole
// (comments and blank lines are the author's, not output to drop).
export function commandOf(lang: string, body: string): { copy: string; isCut: boolean } {
  const lines = body.split('\n')
  const l = lang.toLowerCase()
  if (!SHELL.has(l) || !lines.some(x => promptOf(x, l) !== undefined)) return { copy: body.replace(/\s+$/, ''), isCut: false }
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const cmd = promptOf(lines[i] ?? '', l)
    if (cmd === undefined) continue
    out.push(cmd)
    let last = cmd
    while (last.trimEnd().endsWith('\\') && i + 1 < lines.length) {
      i += 1
      last = lines[i] ?? ''
      out.push(last)
    }
  }

  return { copy: out.join('\n'), isCut: true }
}

/** what a copy button of this block puts on the clipboard; undefined for a block that is not fenced, still open, or empty */
export function copyOf(b: Block): string | undefined {
  return copyInfo(b)?.text
}

/** the same, with whether a shell block's prompts and output were cut (the toast says so) */
export function copyInfo(b: Block): { text: string; isCut: boolean } | undefined {
  if (!b.fence?.isClosed) return undefined
  const c = commandOf(b.fence.lang, b.fence.body)

  return c.copy.trim() === '' ? undefined : { text: c.copy, isCut: c.isCut }
}

/** every copyable fenced block, blank-line separated: the "All code" button */
export const allCode = (text: string): string =>
  parse(text).flatMap(b => copyOf(b) ?? []).join('\n\n')

/** the toast's words: what was copied and how big, e.g. `Copied code ① (3 lines, prompts removed)` */
export const copied = (what: string, text: string, isCut = false): string => {
  const n = text.split('\n').filter(l => l.trim() !== '').length

  return `Copied ${what} (${n} ${n === 1 ? 'line' : 'lines'}${isCut ? ', prompts removed' : ''})`
}

/** a block's number on its header and in the copy row: ①..⑳, then #21 */
export const mark = (n: number): string => (n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `#${n}`)

const COMMANDS = /^(sudo|git|gh|npm|npx|pnpm|yarn|pip3?|uv|cargo|docker|apt|apt-get|brew|systemctl|curl|wget|cd|ls|cat|chmod|chown|mkdir|rm|mv|cp|make|python3?|node|bash|ssh|scp|rsync|kill|export|claude)\s+\S/

// Inline code spans outside fences that read as a command: a `! ` or `$ ` prompt, or a well-known command word followed by an argument.
// Each is returned as it is typed (prompt off), once.
export function inlineCommands(text: string): string[] {
  const seen = new Set<string>()
  for (const b of parse(text)) {
    if (b.fence) continue
    for (const m of b.text.matchAll(/`([^`\n]+)`/g)) {
      const raw = (m[1] ?? '').trim()
      const cmd = raw.replace(PROMPT, '')
      if (cmd !== '' && (PROMPT.test(raw) || COMMANDS.test(cmd))) seen.add(cmd)
    }
  }

  return [...seen]
}

// The reply without its markdown marks: fences and backticks off, bold, headings and links reduced to their words.
// shortcut: single `*italic*` and tables are left as written, add them if a paste shows stray marks.
export function plain(text: string, withCode = true): string {
  return parse(text)
    .filter(b => withCode || !b.fence)
    .map(b =>
      b.fence
        ? b.fence.body
        : b.text
            .replace(/^\s{0,3}#{1,6}\s+/gm, '')
            .replace(/(\*\*|__)(.+?)\1/g, '$2')
            .replace(/`([^`\n]+)`/g, '$1')
            .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1'),
    )
    .join('\n\n')
    .trim()
}

// A paragraph's sentences, one per line of a list too. shortcut: splits after ". ", "? ", "! ", "。" and "…"; "e.g. x" splits wrongly, a bare "3. " does not.
export function sentences(p: string): string[] {
  return p.split(/(?<=[.!?。…])(?<!\b\d+\.)\s+|\n+/).map(s => s.trim()).filter(Boolean)
}

export function quoted(parts: string[], note: string): string {
  const q = parts.map(p => p.split('\n').map(l => (l ? `> ${l}` : '>')).join('\n')).join('\n>\n')

  return note.trim() ? `${q}\n\n${note.trim()}` : q
}

// A button's words: the first line of what is copied, cut to fit, and how many lines more there are.
export function preview(copy: string): string {
  const [first = '', ...rest] = copy.split('\n')
  const cells = Array.from(first.trim())
  const head = cells.length > PREVIEW_CELLS ? `${cells.slice(0, PREVIEW_CELLS - 1).join('')}…` : cells.join('')
  const more = rest.filter(l => l.trim() !== '').length

  return more > 0 ? `${head} +${more}` : head
}
