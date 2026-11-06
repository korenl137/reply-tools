/**
 * reply-tools: quote and copy parts of a reply. Nothing is ever submitted.
 *
 * Fullscreen terminal (the only place a plugin gets clicks), reply drawn by the engine: the reply is redrawn paragraph by
 * paragraph with a ❝ at the left that quotes it into the prompt, and a header above each fenced block with [copy] and,
 * for two or more non-blank lines, [lines]. Under the reply, one row: inline commands, [reply text], then [All code],
 * [Text only] and [Pick…]. A reply another mod drew keeps that drawing: one ❝ over it, and the row also lists its code blocks.
 * /quote opens a pane (last five replies, sentences, number keys); /quote sel quotes the mouse selection;
 * /quote toggle opens or closes the pane.
 */
import type { Elements, Register, RenderElement } from 'claude-code'

import { allCode, copied, copyInfo, inlineCommands, mark, parse, plain, preview, quoted, sentences } from './blocks.ts'

const PANE = 'reply-tools'
const REPLIES = 5
const SHOWN = 3
const TRAILER = '\ncomment: '
// a paragraph of the pane that is a fenced block
const isCode = (p: string) => /^\s*(```|~~~)/.test(p)
// Theme key `suggestion`: a blue-violet the theme tunes per light/dark, so it reads on both and is not gray; not a status color (error/success/warning).
const COPY_COLOR = 'suggestion'

// the pane's state: replies newest first, each as its blocks; the one on view; what is picked and which paragraphs are split
let replies: string[][] = []
let age = 0
let picked = new Set<string>()
let split = new Set<string>()
// the line view: one code block's lines, each with its own copy button; null shows the replies
let lineView: { what: string; lines: string[] } | null = null
// replies whose copy row shows every button, not the first four
const expanded = new Set<string>()

// trailer: text after the quote, so the cursor lands on a labelled answer line. Never throws: a press that fails says so.
async function fillPrompt($: any, parts: string[], note: string, trailer = ''): Promise<boolean> {
  try {
    const box = await $.prompt.read()
    const r = await $.prompt.fill({ text: (box.text.trim() ? '\n\n' : '') + quoted(parts, note) + trailer, mode: 'append' })
    if (!r.isFilled) $.ui.toast("Couldn't fill the prompt (is a dialog open?)")

    return r.isFilled
  } catch (err) {
    $.ui.toast(`Quote failed: ${String(err).slice(0, 80)}`)

    return false
  }
}

// what: the toast's words for the copy, e.g. "code ①"; isCut: a shell block lost its prompts
async function copy($: any, text: string, surface: string, what: string, isCut = false) {
  const done = await $.ui.copy({ text, surface }).catch(() => ({ isCopied: false as const, reason: 'copy failed' }))
  $.ui.toast(done.isCopied ? copied(what, text, isCut) : `Could not copy: ${done.reason}`)
}

// /quote's work, shared by the command and the [Pick…] button: $.command.run skips the calling plugin's own hook, so the button cannot run its own command
async function quote($: any, args: string): Promise<string> {
  try {
    // toggle (a launcher button and the row's [Pick…]): an open pane closes, its picks with it
    if (args.trim() === 'toggle' && (await $.ui.panes()).some((pane: { id: string }) => pane.id === PANE)) {
      await $.ui.close({ id: PANE })

      return 'Quote pane closed.'
    }
    if (args.trim() === 'sel') {
      const s = await $.ui.selection()
      if (!s?.text.trim()) $.ui.toast('Nothing selected (fullscreen only: drag over the text with the mouse first)')
      else await fillPrompt($, [s.text.trim()], '', TRAILER)

      return s?.text.trim() ? 'Quoted the selection into the prompt.' : 'Nothing selected.'
    }
    const msgs = (await $.session.messages()).filter((m: any) => m.role === 'assistant' && m.text.trim())
    replies = msgs.slice(-REPLIES).reverse().map((m: any) => parse(m.text).map(b => b.text))
    if (replies.length === 0) {
      $.ui.toast('No reply to quote yet')

      return 'No reply to quote yet.'
    }
    lineView = null
    age = 0
    picked = new Set()
    split = new Set()
    await $.ui.open({ id: PANE, title: 'quote', focus: true, closeOnEscape: true })
    $.ui.invalidate('ui.render')

    return 'Quote pane opened.'
  } catch (err) {
    $.ui.toast(`/quote failed: ${String(err).slice(0, 80)}`)

    return `/quote failed: ${String(err).slice(0, 80)}`
  }
}

// The [lines] button: the block's non-blank lines in the pane, each copied alone or all together
async function showLines($: any, text: string, what: string) {
  try {
    lineView = { what, lines: text.split('\n').filter(l => l.trim() !== '') }
    await $.ui.open({ id: PANE, title: `${what} lines`, focus: true, closeOnEscape: true })
    $.ui.invalidate('ui.render')
  } catch (err) {
    $.ui.toast(`Lines failed: ${String(err).slice(0, 80)}`)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'quote', description: 'Quote the last replies into your prompt: pick paragraphs or sentences; "sel" quotes the mouse selection', immediate: true }).catch(() => undefined)

    return next(e)
  })

  // a command that returns no text reads as unanswered on Claude Code 2.1.318 ("no command.run hook answered it")
  on('command.run', { command: 'quote' }, async ($, e) => ({ text: await quote($, e.args) }))

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    const drawn = (await next(e)) as RenderElement & { type?: string }
    if (e.surface !== 'terminal' || !e.viewport?.isFullscreen) return drawn
    try {
      const blocks = parse(e.props.text)
      if (blocks.length === 0) return drawn
      const { Box, Text, Button, Markdown } = $.ui.resolve(e)
      const engineDrawn = drawn.type === 'engine'
      const cmds = inlineCommands(e.props.text)
      const id = String(e.requestId)
      // the row's buttons: code blocks (only when the blocks have no ⧉ of their own), inline commands, then the reply as plain text last,
      // so it is the first to fold into "+N more"; the reply as markdown is left to the built-in /copy
      // fenced blocks, numbered as their header shows them (a reply another mod drew has no headers: no numbers)
      const fenced = blocks.flatMap((b, i) => { const c = copyInfo(b); return c === undefined ? [] : [{ i, ...c }] })
      const no = (i: number) => fenced.findIndex(f => f.i === i) + 1
      // the one-by-one buttons: code blocks (only when the blocks have no copy button of their own), inline commands, then the whole
      // reply as plain text last, so it is the first to fold into "+N more"; the reply as markdown is left to the built-in /copy
      const items: { key: string; label: string; text: string; what: string; isCut: boolean }[] = [
        ...(engineDrawn ? [] : fenced.map(f => ({ key: `rt-b${f.i}`, label: preview(f.text), text: f.text, what: 'code', isCut: f.isCut }))),
        ...cmds.map((c, i) => ({ key: `rt-c${i}`, label: `$ ${preview(c)}`, text: c, what: 'command', isCut: false })),
        { key: 'rt-txt', label: 'reply text', text: plain(e.props.text), what: 'reply text', isCut: false },
      ]
      const isOpen = expanded.has(id)
      const shown = isOpen ? items : items.slice(0, SHOWN)
      const hasText = blocks.some(b => !b.fence)
      // never folded: the broad copies and the picker
      const row =
        items.length > 1 || blocks.length > 1 ? (
          <Box key="rt-row" flexDirection="row" flexWrap="wrap" columnGap={1} marginLeft={2}>
            <Text color={COPY_COLOR}>⧉ copy</Text>
            {shown.map(it => (
              <Button key={it.key} plain onPress={() => void copy($, it.text, e.surface, it.what, it.isCut)}><Text color={COPY_COLOR}>{`[${it.label}]`}</Text></Button>
            ))}
            {items.length > SHOWN ? <Button key="rt-more" label={isOpen ? '[fewer]' : `[+${items.length - SHOWN} more]`} plain dimColor onPress={() => { isOpen ? expanded.delete(id) : expanded.add(id); $.ui.invalidate('ui.render') }} /> : null}
            {fenced.length > 1 ? <Button key="rt-allcode" plain onPress={() => void copy($, allCode(e.props.text), e.surface, `all ${fenced.length} code blocks`)}><Text color={COPY_COLOR}>[All code]</Text></Button> : null}
            {fenced.length > 0 && hasText ? <Button key="rt-textonly" plain onPress={() => void copy($, plain(e.props.text, false), e.surface, 'text without code')}><Text color={COPY_COLOR}>[Text only]</Text></Button> : null}
            <Button key="rt-pick" plain onPress={() => void quote($, 'toggle')}><Text color={COPY_COLOR}>[Pick…]</Text></Button>
          </Box>
        ) : null

      if (!engineDrawn) {
        return (
          <Box flexDirection="column">
            <Box flexDirection="row">
              <Box flexShrink={0} minWidth={2} marginTop={1}>
                <Button key="quote-reply" label="❝" plain onPress={() => void fillPrompt($, [e.props.text], '', TRAILER)} />
              </Box>
              <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                {drawn}
              </Box>
            </Box>
            {row}
          </Box>
        )
      }

      return (
        <Box flexDirection="column">
          <Box flexDirection="row" marginTop={1}>
            <Box minWidth={2}>
              <Text>{e.props.isFirstOfReply ? '⏺' : ' '}</Text>
            </Box>
            <Box flexDirection="column" flexGrow={1}>
              {blocks.map((b, i) => {
                const c = copyInfo(b)

                return (
                  <Box key={`b${i}`} flexDirection="row" columnGap={1} alignItems="flex-start" marginTop={i === 0 ? 0 : 1}>
                    {/* the gutter holds the quote button alone, so a copy click cannot land on it */}
                    <Box flexShrink={0} minWidth={2}>
                      <Button key={`q${i}`} label="❝" plain onPress={() => void fillPrompt($, [b.text], '', TRAILER)} />
                    </Box>
                    <Box flexDirection="column" flexGrow={1} flexShrink={1}>
                      {c === undefined ? null : (
                        <Box flexDirection="row" justifyContent="space-between">
                          <Text color={COPY_COLOR}>{`${mark(no(i))} ${b.fence?.lang || 'code'}`}</Text>
                          <Box flexDirection="row" columnGap={1}>
                            {c.text.split('\n').filter(l => l.trim() !== '').length > 1 ? <Button key={`l${i}`} plain onPress={() => void showLines($, c.text, `code ${mark(no(i))}`)}><Text color={COPY_COLOR}>[lines]</Text></Button> : null}
                            <Button key={`c${i}`} plain onPress={() => void copy($, c.text, e.surface, `code ${mark(no(i))}`, c.isCut)}><Text color={COPY_COLOR}>[copy]</Text></Button>
                          </Box>
                        </Box>
                      )}
                      <Markdown key={`m${i}`} text={b.text} />
                    </Box>
                  </Box>
                )
              })}
            </Box>
          </Box>
          {row}
        </Box>
      )
    } catch {
      return drawn
    }
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    try {
      const { Box, Text, Button, Input, Markdown } = $.ui.resolve(e) as Elements['terminal']
      const redraw = () => $.ui.invalidate('ui.render')
      const toggle = (set: Set<string>, k: string) => {
        set.has(k) ? set.delete(k) : set.add(k)
        redraw()
      }
      // oldest reply first; a paragraph picked whole, else its picked sentences joined
      const picks = (): string[] => {
        const parts: string[] = []
        for (let a = replies.length - 1; a >= 0; a -= 1) {
          replies[a]!.forEach((p, i) => {
            if (picked.has(`${a}.${i}`)) parts.push(p)
            else {
              const s = sentences(p).filter((_, j) => picked.has(`${a}.${i}.${j}`))
              if (s.length > 0) parts.push(s.join(' '))
            }
          })
        }

        return parts
      }
      const send = async (note: string) => {
        const parts = picks()
        if (parts.length === 0) return void $.ui.toast('Pick at least one paragraph or sentence (☐)')
        if (await fillPrompt($, parts, note)) await $.ui.close({ id: PANE })
      }
      // a code block copies as its Copy button does (prompts off), any other part as plain text
      const copyPicked = async () => {
        const parts = picks()
        if (parts.length === 0) return void $.ui.toast('Pick at least one paragraph or sentence (☐)')
        const infos = parts.map(p => { const b = parse(p)[0]; return (b && copyInfo(b)) ?? { text: plain(p), isCut: false } })
        await copy($, infos.map(i => i.text).join('\n\n'), 'terminal', `${parts.length} picked ${parts.length === 1 ? 'part' : 'parts'}`, infos.some(i => i.isCut))
      }
      // whole paragraphs of the reply on view: all code, all text, or none (a paragraph's sentence picks are dropped)
      const selectAll = (which: 'code' | 'text' | 'none') => {
        for (const x of [...picked]) if (x.startsWith(`${age}.`)) picked.delete(x)
        if (which !== 'none') (replies[age] ?? []).forEach((p, i) => { if (isCode(p) === (which === 'code')) picked.add(`${age}.${i}`) })
        redraw()
      }
      let n = 0
      // number keys 1-9 toggle the first nine rows on view
      const pick = (k: string) => {
        n += 1

        return <Button key={`pick-${k}`} label={picked.has(k) ? '☑' : '☐'} hotkey={n <= 9 ? String(n) : undefined} plain onPress={() => toggle(picked, k)} />
      }
      const cur = replies[age] ?? []

      if (lineView) {
        const { what, lines } = lineView

        return (
          <Box flexDirection="column">
            <Box flexDirection="row" columnGap={1}>
              <Text color={COPY_COLOR}>{what}</Text>
              <Button key="lines-all" label={`[Copy all ${lines.length} lines]`} plain onPress={() => void copy($, lines.join('\n'), 'terminal', what)} />
              <Button key="lines-back" label="[replies]" plain dimColor onPress={() => { lineView = null; redraw() }} />
            </Box>
            {lines.map((line, j) => (
              <Box key={`ln${j}`} flexDirection="row" columnGap={1}>
                <Button key={`lc${j}`} label="[copy]" plain onPress={() => void copy($, line, 'terminal', `${what} line ${j + 1}`)} />
                <Text>{line}</Text>
              </Box>
            ))}
          </Box>
        )
      }

      return (
        <Box flexDirection="column">
          <Input key="note" label="Note" placeholder="comment on the picked parts, Enter quotes them into the prompt" value="" submitLabel="quote" onSubmit={send} />
          <Box flexDirection="row" columnGap={1} flexWrap="wrap">
            <Button key="act-copy" label="[Copy picked]" plain onPress={() => void copyPicked()} />
            <Button key="act-quote" label="[Quote to prompt]" plain onPress={() => void send('')} />
            <Text dimColor>select</Text>
            <Button key="sel-code" label="[all code]" plain dimColor onPress={() => selectAll('code')} />
            <Button key="sel-text" label="[all text]" plain dimColor onPress={() => selectAll('text')} />
            <Button key="sel-none" label="[clear]" plain dimColor onPress={() => selectAll('none')} />
          </Box>
          <Box flexDirection="row" columnGap={1}>
            <Text dimColor>{`reply ${age + 1}/${replies.length}${age === 0 ? ' (latest)' : ''}, ${picked.size} picked`}</Text>
            {age + 1 < replies.length ? <Button key="older" label="[older]" plain onPress={() => { age += 1; redraw() }} /> : null}
            {age > 0 ? <Button key="newer" label="[newer]" plain onPress={() => { age -= 1; redraw() }} /> : null}
          </Box>
          {cur.map((p, i) => {
            const k = `${age}.${i}`
            const ss = sentences(p)
            const isSplit = split.has(k) && ss.length > 1

            return (
              <Box key={`p${i}`} flexDirection="column">
                {isSplit ? (
                  <Box flexDirection="column">
                    {ss.map((s, j) => (
                      <Box key={`s${j}`} flexDirection="row" columnGap={1}>
                        {pick(`${k}.${j}`)}
                        <Text>{s}</Text>
                      </Box>
                    ))}
                  </Box>
                ) : (
                  <Box flexDirection="row" columnGap={1}>
                    {pick(k)}
                    {isCode(p) ? <Text color={COPY_COLOR}>code</Text> : null}
                    <Markdown key={`m${i}`} text={p} />
                  </Box>
                )}
                {!/^\s*(```|~~~)/.test(p) && ss.length > 1 ? (
                  <Box marginLeft={4}>
                    <Button key={`split-${i}`} label={isSplit ? '[whole paragraph]' : '[split into sentences]'} plain dimColor onPress={() => { for (const x of [...picked]) if (x === k || x.startsWith(`${k}.`)) picked.delete(x); toggle(split, k) }} />
                  </Box>
                ) : null}
              </Box>
            )
          })}
        </Box>
      )
    } catch {
      return next(e)
    }
  })
}
