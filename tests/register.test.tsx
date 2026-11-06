import { describe, expect, test } from 'claude-code/testing'

const fence = (lang: string, body: string): string => `\`\`\`${lang}\n${body}\n\`\`\``
const props = (text: string) => ({ text, isFirstOfReply: true }) as never
const REPLY = `alpha one. alpha two.\n\nbeta\n\n${fence('bash', '! sudo echo hi')}\n\nuse \`! sudo echo hi\` now`

// `drawn` stands in for what the hooks below reply-tools drew; the engine's own drawing by default
const world = (on: any, log: { filled: string[]; copied: string[]; toasts: string[]; opened: string[]; closed: string[]; panes: string[] }, opts: { drawn?: unknown; messages?: string[]; selection?: unknown } = {}) => {
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }) as never)
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.render', async () => (opts.drawn ?? { type: 'engine', ref: 0 }) as never)
  on('prompt.read', () => ({ value: { text: '' } }) as never)
  on('prompt.fill', (_$: any, e: any) => {
    log.filled.push(e.text)

    return { isFilled: true } as never
  })
  on('ui.toast', (_$: any, e: any) => {
    log.toasts.push(e.text)

    return { value: undefined } as never
  })
  on('ui.copy', (_$: any, e: any) => {
    log.copied.push(e.text)

    return { value: { isCopied: true } } as never
  })
  on('ui.selection', () => ({ value: opts.selection }) as never)
  on('session.messages', () => ({ value: (opts.messages ?? []).map(text => ({ role: 'assistant', text, toolUses: [] })) }) as never)
  on('ui.open', (_$: any, e: any) => {
    log.opened.push(e.id)

    return { value: { isPlaced: true } } as never
  })
  on('ui.close', (_$: any, e: any) => {
    log.closed.push(e.id)

    return { value: undefined } as never
  })
  on('ui.panes', () => ({ value: log.panes.map(id => ({ id })) }) as never)
  on('ui.invalidate', () => ({ value: undefined }) as never)
}
const log = () => ({ filled: [] as string[], copied: [] as string[], toasts: [] as string[], opened: [] as string[], closed: [] as string[], panes: [] as string[] })
const mountReply = ($: any, text: string) => $.ui.mount({ plugin: 'reply-tools', surface: 'terminal', component: 'AssistantMessage', requestId: 'm1', viewport: { columns: 100, rows: 40, isFullscreen: true }, props: props(text) } as never)

describe('the reply', () => {
  test('each block gets a ❝ that quotes just that block, with a comment line after it', async ($, on) => {
    const l = log()
    world(on, l)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await mountReply($, REPLY)
    await ui.press({ key: 'q1' })
    expect(l.filled).toEqual(['> beta\ncomment: '])
    await ui.unmount()
  })

  test('the ⧉ beside a shell block copies the command without "! "; a prose block has none', async ($, on) => {
    const l = log()
    world(on, l)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await mountReply($, REPLY)
    await ui.press({ key: 'c2' })
    expect(l.copied).toEqual(['sudo echo hi'])
    expect(await ui.find({ key: 'c1' })).toBeUndefined()
    expect(await ui.find({ key: 'rt-b2' })).toBeUndefined()
    await ui.unmount()
  })

  test('the row copies an inline command without "! " and the reply as plain text', async ($, on) => {
    const l = log()
    world(on, l)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await mountReply($, REPLY)
    await ui.press({ key: 'rt-c0' })
    await ui.press({ key: 'rt-txt' })
    expect(l.copied[0]).toBe('sudo echo hi')
    expect(l.copied[1]).toBe('alpha one. alpha two.\n\nbeta\n\n! sudo echo hi\n\nuse ! sudo echo hi now')
    await ui.unmount()
  })

  test('more than three one-by-one buttons show "+N more", which expands the row', async ($, on) => {
    const l = log()
    world(on, l)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await mountReply($, 'text\n\n`git a b` `git c d` `git e f` `git g h`')
    expect(await ui.find({ key: 'rt-more' })).toBeDefined()
    expect(await ui.find({ key: 'rt-c2' })).toBeDefined()
    expect(await ui.find({ key: 'rt-c3' })).toBeUndefined()
    // the plain-text copy is last, so it is what folds away first
    expect(await ui.find({ key: 'rt-txt' })).toBeUndefined()
    expect(await ui.find({ key: 'rt-md' })).toBeUndefined()
    await ui.press({ key: 'rt-more' })
    await ui.unmount()
    const again = await mountReply($, 'text\n\n`git a b` `git c d` `git e f` `git g h`')
    expect(await again.find({ key: 'rt-c3' })).toBeDefined()
    expect(await again.find({ key: 'rt-txt' })).toBeDefined()
    await again.press({ key: 'rt-more' })
    await again.unmount()
  })

  test('the gutter holds the quote button alone; the code header carries its number and copy, and the toast says what was copied', async ($, on) => {
    const l = log()
    world(on, l)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await mountReply($, REPLY)
    expect(await ui.find({ type: 'Text', text: '① bash' })).toBeDefined()
    expect((await ui.find({ key: 'q2' }))?.props?.dimColor).toBeUndefined()
    await ui.press({ key: 'c2' })
    expect(l.toasts).toContain('Copied code ① (1 line, prompts removed)')
    await ui.unmount()
  })

  test('All code joins the code blocks, Text only leaves them out; both are never folded', async ($, on) => {
    const l = log()
    world(on, l)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await mountReply($, `intro **x**\n\n${fence('sh', 'ls')}\n\nmiddle\n\n${fence('py', 'print(1)')}\n\n\`git a b\` \`git c d\` \`git e f\` \`git g h\``)
    expect(await ui.find({ key: 'rt-more' })).toBeDefined()
    await ui.press({ key: 'rt-allcode' })
    await ui.press({ key: 'rt-textonly' })
    expect(l.copied[0]).toBe('ls\n\nprint(1)')
    expect(l.copied[1]).toBe('intro x\n\nmiddle\n\ngit a b git c d git e f git g h')
    expect(l.toasts).toContain('Copied all 2 code blocks (2 lines)')
    await ui.unmount()
  })

  test('Pick… opens the pane itself (a plugin cannot run its own command: command.run skips the calling hook); All code and Text only are absent when there is nothing to split', async ($, on) => {
    const l = log()
    world(on, l, { messages: ['alpha'] })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await mountReply($, 'one\n\ntwo')
    expect(await ui.find({ key: 'rt-allcode' })).toBeUndefined()
    expect(await ui.find({ key: 'rt-textonly' })).toBeUndefined()
    await ui.press({ key: 'rt-pick' })
    expect(l.opened).toEqual(['reply-tools'])
    await ui.unmount()
  })

  test('a code block of several lines has [lines]; the pane copies each line alone or all together; a one-line block has no [lines]', async ($, on) => {
    const l = log()
    world(on, l)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await mountReply($, `${fence('bash', 'git status\n\ngit add -A\ngit commit -m x')}\n\n${fence('bash', 'ls')}`)
    expect(await ui.find({ key: 'l0' })).toBeDefined()
    expect(await ui.find({ key: 'l1' })).toBeUndefined()
    await ui.press({ key: 'l0' })
    expect(l.opened).toEqual(['reply-tools'])
    await ui.unmount()
    const pane = await $.ui.mount({ plugin: 'reply-tools', surface: 'terminal', component: 'Pane', requestId: 'reply-tools', props: { title: 'x', bodyColumns: 80 } as never })
    await pane.press({ key: 'lc1' })
    expect(l.copied).toEqual(['git add -A'])
    expect(l.toasts.at(-1)).toBe('Copied code ① line 2 (1 line)')
    await pane.press({ key: 'lines-all' })
    expect(l.copied.at(-1)).toBe('git status\ngit add -A\ngit commit -m x')
    expect(l.toasts.at(-1)).toBe('Copied code ① (3 lines)')
    await pane.unmount()
  })

  test('Pick… again closes the pane it opened (a launcher button sends the same toggle)', async ($, on) => {
    const l = log()
    l.panes = ['reply-tools']
    world(on, l, { messages: ['alpha'] })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await mountReply($, 'one\n\ntwo')
    await ui.press({ key: 'rt-pick' })
    expect(l.closed).toEqual(['reply-tools'])
    expect(l.opened).toEqual([])
    expect((await $.command.run({ command: 'quote', args: 'toggle' } as never)).text).toBe('Quote pane closed.')
    await ui.unmount()
  })

  test('a reply another mod drew keeps that drawing: one ❝ over it, code blocks in the row', async ($, on) => {
    const l = log()
    world(on, l, { drawn: { type: 'Text', children: ['x'] } })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await mountReply($, REPLY)
    expect(await ui.find({ key: 'quote-reply' })).toBeDefined()
    expect(await ui.find({ key: 'q0' })).toBeUndefined()
    await ui.press({ key: 'rt-b2' })
    expect(l.copied).toEqual(['sudo echo hi'])
    await ui.unmount()
  })

  test('outside a fullscreen terminal nothing is added', async ($, on) => {
    const l = log()
    world(on, l)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const ui = await $.ui.mount({ plugin: 'reply-tools', surface: 'terminal', component: 'AssistantMessage', requestId: 'm1', viewport: { columns: 100, rows: 40, isFullscreen: false }, props: props(REPLY) } as never)
    expect(await ui.find({ key: 'q0' })).toBeUndefined()
    expect(await ui.find({ key: 'rt-txt' })).toBeUndefined()
    await ui.unmount()
  })
})

describe('/quote', () => {
  test('sel quotes the mouse selection, and says so when there is none', async ($, on) => {
    const l = log()
    world(on, l, { selection: { text: ' picked words ' } })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    const r = await $.command.run({ command: 'quote', args: 'sel' } as never)
    expect(l.filled).toEqual(['> picked words\ncomment: '])
    expect(r.text).toBeTruthy()
  })

  test('sel with nothing selected says so and fills nothing', async ($, on) => {
    const l2 = log()
    world(on, l2)
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    await $.command.run({ command: 'quote', args: 'sel' } as never)
    expect(l2.toasts.some(t => t.startsWith('Nothing selected'))).toBe(true)
    expect(l2.filled).toEqual([])
  })

  const pane = ($: any) => $.ui.mount({ plugin: 'reply-tools', surface: 'terminal', component: 'Pane', requestId: 'reply-tools', props: { title: 'quote', bodyColumns: 80 } as never })

  test('sentences are picked one by one, and an earlier reply is reachable', async ($, on) => {
    const l = log()
    world(on, l, { messages: ['old one. old two.', 'First. Second. Third.\n\nbeta'] })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    await $.command.run({ command: 'quote', args: '' } as never)
    let ui = await pane($)
    await ui.press({ key: 'split-0' })
    await ui.unmount()
    ui = await pane($)
    await ui.press({ key: 'pick-0.0.0' })
    await ui.press({ key: 'pick-0.0.2' })
    await ui.press({ key: 'older' })
    await ui.unmount()
    ui = await pane($)
    await ui.press({ key: 'pick-1.0' })
    await ui.input({ key: 'note', text: 'why?' })
    expect(l.filled).toEqual(['> old one. old two.\n>\n> First. Third.\n\nwhy?'])
    await ui.unmount()
  })

  test('Copy picked copies code without prompts and other parts as plain text; select all code picks only the code', async ($, on) => {
    const l = log()
    world(on, l, { messages: [`**intro**\n\n${fence('bash', '$ ls -la')}\n\ntail`] })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    await $.command.run({ command: 'quote', args: '' } as never)
    let ui = await pane($)
    await ui.press({ key: 'sel-code' })
    await ui.unmount()
    ui = await pane($)
    expect((await ui.find({ key: 'pick-0.1' }))?.props?.label).toBe('☑')
    expect((await ui.find({ key: 'pick-0.0' }))?.props?.label).toBe('☐')
    await ui.press({ key: 'pick-0.0' })
    await ui.press({ key: 'act-copy' })
    expect(l.copied).toEqual(['intro\n\nls -la'])
    expect(l.toasts).toContain('Copied 2 picked parts (2 lines, prompts removed)')
    await ui.press({ key: 'sel-none' })
    await ui.unmount()
  })

  test('a number key toggles the first rows: hotkey 2 is the second paragraph', async ($, on) => {
    const l = log()
    world(on, l, { messages: ['alpha\n\nbeta'] })
    await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
    // text must come back: a command answering with nothing reads as unanswered in the engine
    expect((await $.command.run({ command: 'quote', args: '' } as never)).text).toBeTruthy()
    const ui = await pane($)
    expect((await ui.find({ key: 'pick-0.1' }))?.props?.hotkey).toBe('2')
    await ui.unmount()
  })
})
