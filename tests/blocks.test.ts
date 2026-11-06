import { describe, expect, test } from 'claude-code/testing'
import { allCode, commandOf, copied, copyInfo, copyOf, mark, inlineCommands, parse, plain, preview, quoted, sentences } from '../hooks/blocks.ts'

const fence = (lang: string, body: string): string => `\`\`\`${lang}\n${body}\n\`\`\``

describe('parse', () => {
  test('splits on blank lines and keeps a fenced block whole, markers included', () => {
    const text = `one\ntwo\n\n${fence('js', 'a\n\nb')}\n\nthree`
    expect(parse(text).map(b => b.text)).toEqual(['one\ntwo', fence('js', 'a\n\nb'), 'three'])
  })

  test('a fence straight after a line of text is its own block', () => {
    expect(parse(`run:\n${fence('sh', 'ls')}`).map(b => b.text)).toEqual(['run:', fence('sh', 'ls')])
  })

  test('keeps a list with blank lines between its items in one block', () => {
    expect(parse('1. a\n\n2. b\n\ntext').map(b => b.text)).toEqual(['1. a\n\n2. b', 'text'])
    expect(parse('intro\n\n- x\n\n- y').map(b => b.text)).toEqual(['intro', '- x\n\n- y'])
  })

  test('a fence that never closes takes the rest, is marked open and gives no copy', () => {
    const b = parse(`${fence('sh', 'echo one')}\n\`\`\`sh\n$ echo two\n\nmore`)
    expect(b).toHaveLength(2)
    expect(b[1]?.fence?.isClosed).toBe(false)
    expect(copyOf(b[1]!)).toBeUndefined()
    expect(copyOf(b[0]!)).toBe('echo one')
  })

  test('a longer fence is closed only by an equal or longer one, and ~~~ works', () => {
    expect(copyOf(parse('````md\n```bash\ninner\n```\n````')[0]!)).toBe('```bash\ninner\n```')
    expect(copyOf(parse('~~~sh\nls\n~~~')[0]!)).toBe('ls')
  })
})

describe('commandOf', () => {
  test('a session with prompts gives only the typed commands, prompts off', () => {
    expect(commandOf('console', '$ git status\nOn branch main\nnothing to commit\n$ git push')).toEqual({ copy: 'git status\ngit push', isCut: true })
  })

  test('a leading "! " is dropped, but "!!" and "!x" are not prompts', () => {
    expect(commandOf('bash', '! sudo systemctl restart foo')).toEqual({ copy: 'sudo systemctl restart foo', isCut: true })
    expect(commandOf('bash', '!!\necho !x')).toEqual({ copy: '!!\necho !x', isCut: false })
  })

  test('a backslash continuation keeps the next lines with the command', () => {
    expect(commandOf('bash', '$ docker run \\\n  -p 80:80 \\\n  nginx\nStarted').copy).toBe('docker run \\\n  -p 80:80 \\\n  nginx')
  })

  test('a block with no prompt is copied whole; > is a prompt only for powershell and cmd', () => {
    expect(commandOf('bash', '# install\nnpm i foo\n')).toEqual({ copy: '# install\nnpm i foo', isCut: false })
    expect(commandOf('bash', '> quoted\nls').isCut).toBe(false)
    expect(commandOf('powershell', '> Get-Date\nMonday').copy).toBe('Get-Date')
  })
})

describe('inlineCommands', () => {
  test('takes spans with a ! or $ prompt, or a known command and an argument, prompt off, once', () => {
    const t = 'run `! sudo echo hi` then `git status`, not `foo` or `ls` or `$HOME`; again `! sudo echo hi`'
    expect(inlineCommands(t)).toEqual(['sudo echo hi', 'git status'])
  })

  test('spans inside a fence are left to the block button', () => {
    expect(inlineCommands(fence('md', 'use `git push` here'))).toEqual([])
  })
})

describe('plain, sentences, quoted, preview', () => {
  test('plain drops fence and inline marks, bold, headings and link targets, and leaves fence bodies alone', () => {
    expect(plain(`# Title\n\nsee **this** \`x\` [doc](http://a.b)\n\n${fence('sh', 'ls **/*.ts')}`)).toBe('Title\n\nsee this x doc\n\nls **/*.ts')
  })

  test('sentences split after . ? ! and per list line, not after a numbering', () => {
    expect(sentences('One. Two? Three!')).toEqual(['One.', 'Two?', 'Three!'])
    expect(sentences('1. first\n2. second')).toEqual(['1. first', '2. second'])
    expect(sentences('그렇습니다. 다음입니다.')).toEqual(['그렇습니다.', '다음입니다.'])
  })

  test('quotes every line and appends the note', () => {
    expect(quoted(['a\nb', 'c'], ' why? ')).toBe('> a\n> b\n>\n> c\n\nwhy?')
    expect(quoted(['a'], '')).toBe('> a')
  })

  test('preview: the first line cut by characters, and the count of the lines after it', () => {
    expect(preview('a\nb\n\nc')).toBe('a +2')
    expect(preview('가'.repeat(50))).toBe(`${'가'.repeat(35)}…`)
  })
})

describe('copy helpers', () => {
  test('copyInfo says whether a shell block lost its prompts; an open or empty fence has none', () => {
    expect(copyInfo(parse(fence('bash', '$ ls'))[0]!)).toEqual({ text: 'ls', isCut: true })
    expect(copyInfo(parse(fence('py', 'print(1)'))[0]!)).toEqual({ text: 'print(1)', isCut: false })
    expect(copyInfo(parse('```bash\nls')[0]!)).toBeUndefined()
    expect(copyOf(parse(fence('sh', ''))[0]!)).toBeUndefined()
  })

  test('allCode joins the copyable blocks and skips prose', () => {
    expect(allCode(`a\n\n${fence('sh', '$ ls')}\n\nb\n\n${fence('py', 'x = 1')}`)).toBe('ls\n\nx = 1')
    expect(allCode('only prose')).toBe('')
  })

  test('plain(text, false) leaves the fences out', () => {
    expect(plain(`a **b**\n\n${fence('sh', 'ls')}\n\nc`, false)).toBe('a b\n\nc')
  })

  test('copied counts the non-blank lines and names the cut', () => {
    expect(copied('code ①', 'a\n\nb', true)).toBe('Copied code ① (2 lines, prompts removed)')
    expect(copied('x', 'a')).toBe('Copied x (1 line)')
  })

  test('mark: circled digits to 20, then #n', () => {
    expect([mark(1), mark(9), mark(20), mark(21)]).toEqual(['①', '⑨', '⑳', '#21'])
  })
})
