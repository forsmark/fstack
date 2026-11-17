import { expect, mock, test } from 'claude-code/testing'

import type { Question } from '../types'
import { age, bandText, parseArgs, resolveAnswer, sorted } from './register'

const NOW_MS = 1794909600000
const DIR = '/home/u/.claude/pocket/-home-u-dev-shows'
const ASK = 'mcp__pocket__ask'
const UPDATE = 'mcp__pocket__update'
const LIST = 'mcp__pocket__list'

const RETENTION = {
  question: 'How many days do we keep a deleted record?',
  context: 'A deleted record is kept 90 days. The backups live 92 days.',
  options: [
    { label: '100 days', leads_to: 'the record outlives every backup', recommended: true },
    { label: '90 days', leads_to: 'no change' },
  ],
  meanwhile: 'I keep 90 days.',
  urgency: 'no_hurry',
  relates_to: 'issue #212',
}
const RESET = {
  question: 'Do you use your weekly reset now?',
  context: 'The weekly usage window is at 97%.',
  meanwhile: 'I wait.',
  urgency: 'blocks',
}

type Engine = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[1]
type Dollar = Parameters<Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>>[0]
type World = { session?: string; drop?: string }

// Stands for the engine beneath the mod. Returns what the mod did.
function engine(on: Engine, world: World = {}) {
  const clock = mock.clock(on, { now: NOW_MS })
  const session = mock.session(on)
  mock.env(on, { HOME: '/home/u' })
  const seen = {
    clock,
    files: {} as Record<string, string>,
    prompts: [] as { text: string; asUser?: true }[],
    toasts: [] as string[],
    notifications: [] as string[],
    opened: [] as string[],
    notes: () => session.appended().map(row => (row.message.content[0] as unknown as { text: string }).text),
    question: (id: string, where = DIR) => JSON.parse(seen.files[`${where}/${id}.json`]!) as Question,
  }
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/home/u/dev/shows' }))
  on('session.id', () => ({ value: world.session ?? 's1' }))
  on('tool.register', () => ({ value: undefined }) as never)
  on('command.register', () => ({ value: { command: 'pocket' } }))
  on('fs.write', (_, e) => {
    seen.files[e.path] = e.text
    return { value: undefined }
  })
  on('fs.read', (_, e) => {
    const found = seen.files[e.path]
    if (found === undefined) throw new Error('ENOENT')
    return { value: found } as never
  })
  on('fs.list', (_, e) => {
    const prefix = `${e.path}/`
    const inside = Object.keys(seen.files).filter(path => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
    if (inside.length === 0) throw new Error('ENOENT')
    return { value: inside.map(path => ({ name: path.slice(prefix.length), kind: 'file', size: 1, mtimeMs: 0, isLink: false })) } as never
  })
  on('process.run', (_, e) => {
    if (e.argv[0] === 'rm') delete seen.files[e.argv[2]!]
    return { value: { exitCode: 0, stdout: '', stderr: '' } } as never
  })
  on('prompt.submit', (_, e) => {
    if (world.drop !== undefined) return { drop: world.drop } as never
    seen.prompts.push({ text: e.text, ...((e.origin as { asUser?: true }).asUser ? { asUser: true as const } : {}) })
    return { text: e.text } as never
  })
  on('turn.start', (_, e) => ({ turnId: e.turnId }) as never)
  on('turn.complete', () => ({ text: 'done' }) as never)
  on('session.compact', (_, e) => ({ messages: e.messages }) as never)
  on('ui.toast', (_, e) => {
    seen.toasts.push((e as { text: string }).text)
    return { value: undefined }
  })
  on('ui.notify', (_, e) => {
    seen.notifications.push((e as { text: string }).text)
    return { value: { isSent: true, channel: 'test' } } as never
  })
  on('ui.open', (_, e) => {
    seen.opened.push((e as { id: string }).id)
    return { value: { isPlaced: true } }
  })
  return seen
}

const start = ($: Dollar) => $.session.start({ cwd: '/home/u/dev/shows', surface: 'terminal', isInteractive: true })
const call = async ($: Dollar, tool: string, input: object = {}) =>
  (await $.tool.call({ tool, ...input } as never)) as { result?: string; deny?: string }
const pocket = async ($: Dollar, args: string, kind = 'composer') =>
  (
    await $.command.run({
      command: 'pocket',
      args,
      origin: { kind },
      presentation: { isFullscreen: false, columns: 100 },
    } as never)
  ).text
const turn = async ($: Dollar, seen: { clock: { settle: () => Promise<void> } }) => {
  await $.turn.complete({ turnId: 't1', answer: 'done', reason: 'answered', durationMs: 1 } as never)
  await seen.clock.settle()
}

const PANE = {
  plugin: 'pocket',
  component: 'Pane',
  requestId: 'pocket',
  props: { title: 'Pocket', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} },
} as const
const BAND = { plugin: 'pocket', component: 'AbovePrompt', requestId: 'band', props: { hasSurvey: false, bodyColumns: 80 } } as const

test('the command arguments parse to an action', () => {
  expect(parseArgs('')).toEqual({ kind: 'list' })
  expect(parseArgs(' 3 ')).toEqual({ kind: 'show', id: 'Q3' })
  expect(parseArgs('q3 a')).toEqual({ kind: 'answer', id: 'Q3', text: 'a' })
  expect(parseArgs('3 keep them until Monday')).toEqual({ kind: 'answer', id: 'Q3', text: 'keep them until Monday' })
  expect(parseArgs('dismiss')).toEqual({ kind: 'dismiss' })
  expect(parseArgs('what')).toEqual({ kind: 'help' })
})

test('a letter picks an option, other text is the answer as typed', () => {
  const question = { options: RETENTION.options } as Question
  expect(resolveAnswer(question, 'A')).toBe('a, 100 days')
  expect(resolveAnswer(question, 'b')).toBe('b, 90 days')
  expect(resolveAnswer(question, 'c')).toBe('c')
  expect(resolveAnswer(question, ' 95 days ')).toBe('95 days')
})

test('the band counts the open, the blocking and the withdrawn questions', () => {
  const one = (over: Partial<Question>) => ({ status: 'open', urgency: 'no_hurry', asked_at: NOW_MS, ...over }) as Question
  const list = [one({ asked_at: NOW_MS - 4 * 3600_000 }), one({ urgency: 'blocks' }), one({ status: 'withdrawn' })]
  expect(bandText(list, NOW_MS)).toBe('pocket: 2 open, 1 blocks work, oldest 4h, 1 withdrawn')
  expect(bandText([one({ status: 'withdrawn' })], NOW_MS)).toBe('pocket: 1 withdrawn')
  expect(sorted(list).map(q => `${q.status} ${q.urgency}`)).toEqual(['open blocks', 'open no_hurry', 'withdrawn no_hurry'])
  expect([age(0, 59_000), age(0, 3600_000), age(0, 50 * 3600_000)]).toEqual(['0m', '1h', '2d'])
})

test('Claude pockets a question and gets its id back', async ($, on) => {
  const seen = engine(on)
  await start($)
  expect((await call($, ASK, RETENTION)).result).toContain('Pocketed as Q1')
  expect((await call($, ASK, RESET)).result).toContain('Pocketed as Q2')
  expect(seen.question('Q1')).toEqual({ id: 'Q1', ...RETENTION, asked_at: NOW_MS, session: 's1', status: 'open' })
  expect(seen.question('Q2').options).toEqual([])
  // Only the question that blocks work raises a notification.
  expect(seen.notifications).toEqual([RESET.question])
  const listed = JSON.parse((await call($, LIST)).result!) as Question[]
  expect(listed.map(q => q.id)).toEqual(['Q2', 'Q1'])
})

test('a subagent and a malformed question are refused', async ($, on) => {
  const seen = engine(on)
  await start($)
  expect((await call($, ASK, { ...RETENTION, agentId: 'a1' })).deny).toContain('only the main session')
  expect((await call($, ASK, { ...RETENTION, question: ' ' })).deny).toContain('"question" is required')
  expect((await call($, ASK, { ...RETENTION, context: '' })).deny).toContain('"context" is required')
  expect((await call($, ASK, { ...RETENTION, options: [{ label: 'x' }] })).deny).toContain('leads_to')
  const both = RETENTION.options.map(o => ({ ...o, recommended: true }))
  expect((await call($, ASK, { ...RETENTION, options: both })).deny).toContain('at most one')
  expect(Object.keys(seen.files)).toEqual([])
})

test('the answer reaches Claude as the user, with the record beside it', async ($, on) => {
  const seen = engine(on)
  await start($)
  await call($, ASK, RETENTION)
  expect(await pocket($, '1 a')).toContain('Q1 answered: a, 100 days')
  await seen.clock.settle()

  expect(seen.prompts).toEqual([{ text: `Pocket answer Q1 "${RETENTION.question}": a, 100 days`, asUser: true }])
  const [note] = seen.notes()
  expect(note).toContain('You wrote the records')
  expect(note).toContain('Context: A deleted record is kept 90 days.')
  // The note holds the record, never the answer.
  expect(note).not.toContain('Pocket answer Q1')
  // The answered question left the pocket.
  expect(seen.files[`${DIR}/Q1.json`]).toBe(undefined)
  expect(seen.question('Q1', `${DIR}/done`)).toEqual(
    expect.objectContaining({ status: 'answered', answer: 'a, 100 days', answered_in: 's1', delivered_at: NOW_MS }),
  )
  expect(await pocket($, '')).toBe('The pocket is empty.')
  expect(await pocket($, '1 b')).toContain('not in the pocket')
})

test('only the user answers: a command from another origin is refused', async ($, on) => {
  const seen = engine(on)
  await start($)
  await call($, ASK, RETENTION)
  for (const kind of ['plugin', 'peer', 'task-notification', 'sdk']) {
    expect(await pocket($, '1 a', kind)).toContain('refused')
  }
  await seen.clock.settle()
  expect(seen.prompts).toEqual([])
  expect(seen.question('Q1').status).toBe('open')
  // Remote Control is the user's phone or the web.
  expect(await pocket($, '1 95 days', 'bridge')).toContain('Q1 answered: 95 days')
})

test('answers given while a turn runs go out together when it ends', async ($, on) => {
  const seen = engine(on)
  await start($)
  await call($, ASK, RETENTION)
  await call($, ASK, RESET)
  await $.turn.start({ turnId: 't1' } as never)
  expect(await pocket($, '1 b')).toContain('when the turn ends')
  await pocket($, '2 yes, I use it now')
  await seen.clock.settle()
  expect(seen.prompts).toEqual([])

  await turn($, seen)
  expect(seen.prompts).toEqual([
    {
      text: `Pocket answer Q1 "${RETENTION.question}": b, 90 days\nPocket answer Q2 "${RESET.question}": yes, I use it now`,
      asUser: true,
    },
  ])
  expect(seen.notes().length).toBe(1)
})

test('an answer the engine drops stays queued and goes out later', async ($, on) => {
  const world: World = { drop: 'a Stop stands' }
  const seen = engine(on, world)
  await start($)
  await call($, ASK, RETENTION)
  await pocket($, '1 a')
  await seen.clock.settle()
  expect(seen.prompts).toEqual([])
  expect(seen.toasts.at(-1)).toContain('could not deliver Q1')
  expect(seen.question('Q1').status).toBe('answered')

  delete world.drop
  await turn($, seen)
  expect(seen.prompts.length).toBe(1)
  expect(seen.files[`${DIR}/Q1.json`]).toBe(undefined)
})

test('an answer given in another session is left for that session', async ($, on) => {
  const world: World = { session: 's2' }
  const seen = engine(on, world)
  await start($)
  await call($, ASK, RETENTION)
  await pocket($, '1 a')
  // Another session of the project reads the same files and sends nothing.
  world.session = 's1'
  await turn($, seen)
  expect(seen.prompts).toEqual([])
  world.session = 's2'
  await turn($, seen)
  expect(seen.prompts.length).toBe(1)
})

test('Claude withdraws or edits a question, and the user sees it', async ($, on) => {
  const seen = engine(on)
  await start($)
  await call($, ASK, RETENTION)
  await call($, ASK, RESET)
  expect((await call($, UPDATE, { id: 'q2', urgency: 'no_hurry', meanwhile: 'I continue with small tasks.' })).result).toContain('updated')
  expect(seen.question('Q2')).toEqual(
    expect.objectContaining({ urgency: 'no_hurry', meanwhile: 'I continue with small tasks.', edited_at: NOW_MS, question: RESET.question }),
  )
  expect((await call($, UPDATE, { id: 'Q1', withdraw_reason: 'You answered in the chat.' })).result).toContain('withdrawn')
  expect((await call($, UPDATE, { id: 'Q1', question: 'Again?' })).deny).toContain('not an open question')
  expect((await call($, UPDATE, { id: 'Q9', question: 'Again?' })).deny).toContain('not an open question')

  const shown = await pocket($, '')
  expect(shown).toContain('Q1, withdrawn')
  expect(shown).toContain('Reason: You answered in the chat.')
  // A withdrawn question takes no answer, only a dismissal.
  expect(await pocket($, '1 a')).toContain('withdrawn')
  expect(await pocket($, 'dismiss')).toBe('Dismissed Q1.')
  expect(seen.question('Q1', `${DIR}/done`).status).toBe('dismissed')
  expect(JSON.parse((await call($, LIST)).result!).length).toBe(1)
  await seen.clock.settle()
  expect(seen.prompts).toEqual([])
})

test('a new id never reuses the id of a closed question', async ($, on) => {
  const seen = engine(on)
  await start($)
  await call($, ASK, RETENTION)
  await pocket($, '1 a')
  await seen.clock.settle()
  expect((await call($, ASK, RESET)).result).toContain('Pocketed as Q2')
})

test('Claude is told what waits at the start and after a compaction', async ($, on) => {
  const seen = engine(on)
  seen.files[`${DIR}/Q4.json`] = JSON.stringify({ id: 'Q4', ...RETENTION, asked_at: NOW_MS, session: 's0', status: 'open' })
  seen.files[`${DIR}/Q5.json`] = '{"id":"Q5","quest'
  await start($)
  expect(seen.notes()).toEqual([expect.stringContaining('The pocket holds 1 open question')])
  expect(seen.notes()[0]).toContain(`Q4 (no hurry): ${RETENTION.question}`)
  // A reload runs the start hook again. Claude is not told twice.
  await start($)
  expect(seen.notes().length).toBe(1)

  await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'hello', toolUses: [] }] } as never)
  await seen.clock.settle()
  expect(seen.notes().length).toBe(2)
  await $.session.compact({ trigger: 'auto', messages: [{ role: 'user', text: 'hello', toolUses: [] }], agentId: 'a1' } as never)
  await seen.clock.settle()
  expect(seen.notes().length).toBe(2)
})

test('the band and the pane draw the pocket, and a press answers', async ($, on) => {
  const seen = engine(on)
  await start($)
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const empty = await $.ui.mount({ ...BAND, surface } as never)
    expect(await empty.find({ type: 'Button' })).toBe(undefined)
    await empty.unmount()
  }
  await call($, ASK, RETENTION)
  await call($, ASK, RESET)

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const band = await $.ui.mount({ ...BAND, surface } as never)
    expect((await band.find({ type: 'Text', text: /pocket:/ }))?.text).toContain('pocket: 2 open, 1 blocks work, oldest 0m')
    await band.press({ key: 'pocket-open' })
    await band.unmount()
  }
  expect(seen.opened).toEqual(['pocket', 'pocket', 'pocket'])

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const pane = await $.ui.mount({ ...PANE, surface } as never)
    expect((await pane.find({ type: 'Text', text: /deleted record\?/ }))?.text).toBe(RETENTION.question)
    expect(await pane.find({ type: 'Button', key: 'Q1:a' })).not.toBe(undefined)
    await pane.unmount()
  }

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' } as never)
  await pane.press({ key: 'Q1:a' })
  await pane.input({ key: 'Q2:own', text: 'yes' })
  await seen.clock.settle()
  await pane.unmount()
  expect(seen.prompts.map(p => p.text).join('\n')).toContain(`Pocket answer Q1 "${RETENTION.question}": a, 100 days`)
  expect(seen.prompts.map(p => p.text).join('\n')).toContain(`Pocket answer Q2 "${RESET.question}": yes`)
  expect(seen.prompts.every(p => p.asUser)).toBe(true)
})
