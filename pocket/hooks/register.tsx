import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Option, Question } from '../types'

// A pocket for questions Claude has for the user while the user is away.
//
// Claude adds a question with a tool and continues. The user sees a band row
// with the count, opens the pocket with /pocket, and answers with a button or
// a typed command. The answer goes to Claude as the user's own words.
//
// Trust: Claude or the mod wrote every text in a question. Only the answer
// has the user's authority. So no tool can answer a question. An answer comes
// only from a button press or from a /pocket command the user typed.
const PANE = 'pocket'
const COMMAND = 'pocket'
const TOOLS = /^mcp__pocket__(ask|update|list)$/
const MAX_OPTIONS = 6
const MAX_QUESTION = 300

const ASK_DESCRIPTION = `Puts a question for the user in the pocket and returns at once, so you can continue. The user sees the count of open questions above the prompt and answers when ready. The answer arrives later as a user message that starts with "Pocket answer <id>", with a note from the pocket plugin that holds the question record.

When to use it:
- The decision belongs to the user and can wait: what joins a batch, a wording that readers see, whether to accept a recommendation. State what you do in the meantime and continue.
- Decide yourself what you can decide. Do not pocket it.
- Ask in the chat instead only when the user is present and work cannot continue without the answer.

Rules:
- Write the question so the user can answer it cold: one sentence in "question", and in "context" a few self-contained lines on what led to it.
- Give 2 to 4 options where you can. Say what each leads to, and mark the one you recommend.
- "meanwhile" says what you do until the answer comes: your default, or "I wait".
- urgency "blocks" means work stops until the answer. Use it rarely. The user gets a notification.
- Do not repeat a pocketed question in later messages. The pocket shows it.
- When events make a question moot, or the user answers it in the chat, withdraw it with mcp__pocket__update.
- Main session only. A subagent returns its question to its caller.`

const UPDATE_DESCRIPTION =
  'Changes or withdraws an open pocketed question. Give "id" and the fields to change. To withdraw, give "withdraw_reason": the user sees the question as withdrawn with that reason. Withdraw a question when events made it moot or the user answered it in the chat.'

const LIST_DESCRIPTION =
  'Lists the pocketed questions of this project that still wait for the user, as JSON. Use it after a compaction or a restart to learn what is open.'

const OPTION_SCHEMA = {
  type: 'object',
  properties: {
    label: { type: 'string', description: 'The choice, in a few words' },
    leads_to: { type: 'string', description: 'What happens when the user picks it' },
    recommended: { type: 'boolean', description: 'True on the one option you recommend' },
  },
  required: ['label', 'leads_to'],
}
const FIELDS = {
  question: { type: 'string', description: 'The question, in one sentence' },
  context: { type: 'string', description: 'What led to the question, in a few self-contained lines' },
  options: { type: 'array', items: OPTION_SCHEMA, description: 'The choices, at most 6' },
  meanwhile: { type: 'string', description: 'What you do until the answer comes: your default, or "I wait"' },
  urgency: { type: 'string', enum: ['blocks', 'no_hurry'], description: '"blocks": work stops until the answer' },
  relates_to: { type: 'string', description: 'An issue, a pull request or a file, when there is one' },
}

const questions = atom({ plugin: 'pocket', key: 'questions' } as const, [] as Question[], {
  shape: 'questions-1',
})
const isTold = atom({ plugin: 'pocket', key: 'isTold' } as const, false)
const sent = atom({ plugin: 'pocket', key: 'sent' } as const, [] as string[])

// Module state. A reload starts it over, which only means an answer may go
// out while a turn runs. The engine then queues it until the turn ends.
let isBusy = false

// ---------------------------------------------------------------- text

const letter = (index: number) => String.fromCharCode(97 + index)
const two = (n: number) => String(n).padStart(2, '0')

export function clockTime(ms: number) {
  const date = new Date(ms)
  return `${two(date.getHours())}:${two(date.getMinutes())}`
}

export function age(fromMs: number, nowMs: number) {
  const minutes = Math.max(0, Math.floor((nowMs - fromMs) / 60_000))
  if (minutes < 60) return `${minutes}m`
  if (minutes < 48 * 60) return `${Math.floor(minutes / 60)}h`
  return `${Math.floor(minutes / 1440)}d`
}

// What the user asked /pocket to do.
export type Ask =
  | { kind: 'list' }
  | { kind: 'dismiss' }
  | { kind: 'show'; id: string }
  | { kind: 'answer'; id: string; text: string }
  | { kind: 'help' }

export function parseArgs(args: string): Ask {
  const text = args.trim()
  if (text === '') return { kind: 'list' }
  if (/^dismiss$/i.test(text)) return { kind: 'dismiss' }
  const match = /^q?(\d+)(?:\s+([\s\S]*))?$/i.exec(text)
  if (!match) return { kind: 'help' }
  const id = `Q${Number(match[1])}`
  const rest = (match[2] ?? '').trim()
  return rest === '' ? { kind: 'show', id } : { kind: 'answer', id, text: rest }
}

// A single letter that names an option becomes "a, <label>". Anything else is
// the user's own answer, kept as typed.
export function resolveAnswer(question: Question, text: string) {
  const typed = text.trim()
  if (/^[a-z]$/i.test(typed)) {
    const index = typed.toLowerCase().charCodeAt(0) - 97
    const option = question.options[index]
    if (option) return `${letter(index)}, ${option.label}`
  }
  return typed
}

// The one line that goes to Claude as the user's words.
export const answerLine = (q: Question) => `Pocket answer ${q.id} "${q.question}": ${q.answer ?? ''}`

const optionLine = (option: Option, index: number) =>
  `${letter(index)}. ${option.label}${option.recommended ? ' (recommended)' : ''}: leads to ${option.leads_to}`

// The record of one question, for Claude and for the plain-text list.
export function recordLines(q: Question, nowMs?: number) {
  const asked = nowMs === undefined ? clockTime(q.asked_at) : `${clockTime(q.asked_at)}, ${age(q.asked_at, nowMs)} ago`
  const head = `${q.id}, ${q.urgency === 'blocks' ? 'blocks work' : 'no hurry'}, asked ${asked}`
  return [
    q.edited_at === undefined ? head : `${head}, edited ${clockTime(q.edited_at)}`,
    `Question: ${q.question}`,
    `Context: ${q.context}`,
    ...q.options.map(optionLine),
    `Meanwhile: ${q.meanwhile}`,
    ...(q.relates_to ? [`Relates to: ${q.relates_to}`] : []),
  ]
}

// Goes to Claude beside the answer lines, under the plugin's name.
export function recordsNote(answered: readonly Question[]) {
  return [
    'The user answered pocketed questions. The answers arrive as the user message that starts with "Pocket answer". These are the records of those questions. You wrote the records, the user wrote only the answers.',
    ...answered.map(q => recordLines(q).join('\n')),
  ].join('\n\n')
}

// Tells Claude what waits, after a compaction or at the start of a session.
export function openNote(open: readonly Question[]) {
  return [
    `The pocket holds ${open.length} open question${open.length === 1 ? '' : 's'} for the user in this project. The user sees them. Do not repeat them. Read the records with mcp__pocket__list when you need them.`,
    ...open.map(q => `${q.id} (${q.urgency === 'blocks' ? 'blocks work' : 'no hurry'}): ${q.question}`),
  ].join('\n')
}

export function bandText(list: readonly Question[], nowMs: number) {
  const open = list.filter(q => q.status === 'open')
  const withdrawn = list.length - open.length
  const parts: string[] = []
  if (open.length > 0) {
    parts.push(`${open.length} open`)
    const blocks = open.filter(q => q.urgency === 'blocks').length
    if (blocks > 0) parts.push(`${blocks} block${blocks === 1 ? 's' : ''} work`)
    parts.push(`oldest ${age(Math.min(...open.map(q => q.asked_at)), nowMs)}`)
  }
  if (withdrawn > 0) parts.push(`${withdrawn} withdrawn`)
  return `pocket: ${parts.join(', ')}`
}

// Questions that block work first, then the oldest first. Withdrawn last.
export function sorted(list: readonly Question[]) {
  const rank = (q: Question) => (q.status !== 'open' ? 2 : q.urgency === 'blocks' ? 0 : 1)
  return [...list].sort((a, b) => rank(a) - rank(b) || a.asked_at - b.asked_at)
}

// The pocket as plain text: the command's output where no tree is drawn.
export function listText(list: readonly Question[], nowMs: number) {
  if (list.length === 0) return 'The pocket is empty.'
  return sorted(list)
    .map(q => {
      const number = q.id.slice(1)
      if (q.status !== 'open') {
        return `${q.id}, withdrawn: ${q.question}\nReason: ${q.reason ?? 'none given'}\nDismiss it with /pocket ${number} dismiss`
      }
      const how = q.options.length > 0 ? `/pocket ${number} a` : `/pocket ${number} <your answer>`
      return [...recordLines(q, nowMs), `Answer with ${how}`].join('\n')
    })
    .join('\n\n')
}

// ------------------------------------------------------------- storage

const fileName = (id: string) => `${id}.json`

async function directory($: EngineInterface) {
  const home = await $.env.get('HOME')
  if (!home) throw new Error('HOME is not set')
  const project = (await $.session.root()).replace(/[^A-Za-z0-9]+/g, '-')
  return `${home}/.claude/pocket/${project}`
}

function parse(text: string): Question | undefined {
  try {
    const raw = JSON.parse(text) as Partial<Question> | null
    if (!raw || typeof raw.id !== 'string' || typeof raw.question !== 'string') return undefined
    if (!Array.isArray(raw.options) || typeof raw.status !== 'string') return undefined
    return raw as Question
  } catch {
    return undefined
  }
}

async function names($: EngineInterface, path: string) {
  try {
    return (await $.fs.list(path)).map(entry => entry.name).filter(name => /^Q\d+\.json$/.test(name))
  } catch {
    return [] // The directory does not exist yet.
  }
}

// Every question that is not closed: open, withdrawn, or answered and not yet
// delivered. A file that is malformed or half-written is skipped.
async function loadAll($: EngineInterface) {
  const path = await directory($)
  const found: Question[] = []
  for (const name of await names($, path)) {
    try {
      const question = parse(await $.fs.read(`${path}/${name}`))
      if (question) found.push(question)
    } catch {
      // Another session moved the file between the listing and the read.
    }
  }
  return found
}

const isShown = (q: Question) => q.status === 'open' || q.status === 'withdrawn'

async function refresh($: EngineInterface) {
  const all = await loadAll($)
  const shown = sorted(all.filter(isShown))
  await update($, questions, () => shown)
  return all
}

async function find($: EngineInterface, id: string) {
  try {
    return parse(await $.fs.read(`${await directory($)}/${fileName(id)}`))
  } catch {
    return undefined
  }
}

async function save($: EngineInterface, question: Question) {
  await $.fs.write(`${await directory($)}/${fileName(question.id)}`, `${JSON.stringify(question, null, 2)}\n`)
}

// A closed question leaves the pocket: its file moves to done/. If the old
// file cannot be removed it stays, and its status keeps it out of the lists.
async function close($: EngineInterface, question: Question) {
  const path = await directory($)
  await save($, question)
  await $.fs.write(`${path}/done/${fileName(question.id)}`, `${JSON.stringify(question, null, 2)}\n`)
  try {
    await $.process.run(['rm', '-f', `${path}/${fileName(question.id)}`], { timeoutMs: 5000 })
  } catch {
    // The status in the file already says it is closed.
  }
}

async function nextId($: EngineInterface) {
  const path = await directory($)
  const used = [...(await names($, path)), ...(await names($, `${path}/done`))].map(name => Number(name.slice(1, -5)))
  return `Q${Math.max(0, ...used) + 1}`
}

// ------------------------------------------------------------- actions

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')

function readOptions(value: unknown): Option[] | string {
  if (value === undefined) return []
  if (!Array.isArray(value)) return '"options" must be a list'
  if (value.length > MAX_OPTIONS) return `give at most ${MAX_OPTIONS} options`
  const options: Option[] = []
  for (const one of value as Record<string, unknown>[]) {
    const label = text(one?.label)
    const leads_to = text(one?.leads_to)
    if (label === '' || leads_to === '') return 'each option needs "label" and "leads_to"'
    options.push(one.recommended === true ? { label, leads_to, recommended: true } : { label, leads_to })
  }
  if (options.filter(o => o.recommended).length > 1) return 'mark at most one option as recommended'
  return options
}

function checkQuestion(question: string) {
  if (question === '') return '"question" is required'
  if (question.length > MAX_QUESTION) return `"question" is one sentence, at most ${MAX_QUESTION} characters. Put the rest in "context"`
  return undefined
}

async function ask($: EngineInterface, input: Record<string, unknown>) {
  const question = text(input.question)
  const options = readOptions(input.options)
  const problem = checkQuestion(question) ?? (typeof options === 'string' ? options : undefined)
  if (problem !== undefined || typeof options === 'string') return { deny: `pocket: ${problem}` }
  if (text(input.context) === '') return { deny: 'pocket: "context" is required. The user reads the question cold' }
  if (text(input.meanwhile) === '') return { deny: 'pocket: "meanwhile" is required: your default, or "I wait"' }

  const pocketed: Question = {
    id: await nextId($),
    question,
    context: text(input.context),
    options,
    meanwhile: text(input.meanwhile),
    urgency: input.urgency === 'blocks' ? 'blocks' : 'no_hurry',
    ...(text(input.relates_to) === '' ? {} : { relates_to: text(input.relates_to) }),
    asked_at: await $.clock.now(),
    session: await $.session.id(),
    status: 'open',
  }
  await save($, pocketed)
  await refresh($)
  if (pocketed.urgency === 'blocks') {
    $.ui.toast(`pocket: ${pocketed.id} blocks work: ${pocketed.question}`)
    void $.ui.notify(pocketed.question, { title: 'pocket: a question blocks work' }).catch(() => undefined)
  }
  return {
    result: `Pocketed as ${pocketed.id}. The user sees it in the pocket. Do not repeat it in later messages. Meanwhile: ${pocketed.meanwhile}`,
  }
}

async function change($: EngineInterface, input: Record<string, unknown>) {
  const id = text(input.id).toUpperCase()
  const found = await find($, id)
  if (!found || found.status !== 'open') return { deny: `pocket: ${id || 'that id'} is not an open question` }
  const now = await $.clock.now()

  const reason = text(input.withdraw_reason)
  if (reason !== '') {
    await save($, { ...found, status: 'withdrawn', reason, edited_at: now })
    await refresh($)
    return { result: `${id} is withdrawn. The user sees it as withdrawn with your reason until they dismiss it.` }
  }

  const options = input.options === undefined ? found.options : readOptions(input.options)
  const question = input.question === undefined ? found.question : text(input.question)
  const problem = checkQuestion(question) ?? (typeof options === 'string' ? options : undefined)
  if (problem !== undefined || typeof options === 'string') return { deny: `pocket: ${problem}` }
  const { relates_to: _old, ...rest } = found
  const relates_to = input.relates_to === undefined ? found.relates_to : text(input.relates_to)
  await save($, {
    ...rest,
    question,
    options,
    context: text(input.context) || found.context,
    meanwhile: text(input.meanwhile) || found.meanwhile,
    urgency: input.urgency === 'blocks' ? 'blocks' : input.urgency === 'no_hurry' ? 'no_hurry' : found.urgency,
    ...(relates_to ? { relates_to } : {}),
    edited_at: now,
  })
  await refresh($)
  return { result: `${id} is updated. The user sees it as edited.` }
}

async function list($: EngineInterface) {
  const open = (await refresh($)).filter(q => q.status === 'open')
  return { result: JSON.stringify(sorted(open)) }
}

// Sends the answers that wait, as one user prompt, with one note that holds
// the question records. Runs only while no turn runs, so that the note and
// the answers reach Claude together. A failed delivery stays queued.
async function flush($: EngineInterface) {
  if (isBusy) return
  const session = await $.session.id()
  const already = await read($, sent)
  const due = (await loadAll($)).filter(
    q => q.status === 'answered' && q.delivered_at === undefined && q.answered_in === session && !already.includes(q.id),
  )
  if (due.length === 0) return
  const ids = due.map(q => q.id)
  await update($, sent, list => [...list, ...ids])
  try {
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: recordsNote(due) }] } })
    const result = await $.prompt.submit({ text: due.map(answerLine).join('\n'), asUser: true })
    if (result.drop !== undefined) throw new Error(result.drop)
    const now = await $.clock.now()
    for (const q of due) await close($, { ...q, delivered_at: now })
  } catch {
    $.ui.toast(`pocket: could not deliver ${ids.join(', ')} to Claude. It stays queued.`)
  } finally {
    await update($, sent, list => list.filter(id => !ids.includes(id)))
  }
}

// A prompt submitted inside another dispatch is lost, so delivery starts from
// a timer.
const flushSoon = ($: EngineInterface) => {
  $.clock.after(0, () => void flush($).catch(() => undefined))
}

// The user's answer. Only a button press or the user's own /pocket command
// reaches this function.
async function answer($: EngineInterface, id: string, typed: string) {
  const found = await find($, id)
  if (!found) return `${id} is not in the pocket.`
  if (found.status === 'withdrawn') {
    if (!/^dismiss$/i.test(typed.trim())) return `${id} is withdrawn. Dismiss it with /pocket ${id.slice(1)} dismiss`
    await close($, { ...found, status: 'dismissed' })
    await refresh($)
    return `${id} is dismissed.`
  }
  if (found.status !== 'open') return `${id} is already answered.`
  const resolved = resolveAnswer(found, typed)
  if (resolved === '') return `Give an answer for ${id}.`
  await save($, {
    ...found,
    status: 'answered',
    answer: resolved,
    answered_at: await $.clock.now(),
    answered_in: await $.session.id(),
  })
  await refresh($)
  flushSoon($)
  return `${id} answered: ${resolved}. Claude gets it ${isBusy ? 'when the turn ends' : 'now'}.`
}

async function dismissAll($: EngineInterface) {
  const withdrawn = (await loadAll($)).filter(q => q.status === 'withdrawn')
  for (const q of withdrawn) await close($, { ...q, status: 'dismissed' })
  await refresh($)
  return withdrawn.length === 0 ? 'No withdrawn question to dismiss.' : `Dismissed ${withdrawn.map(q => q.id).join(', ')}.`
}

async function tell($: EngineInterface) {
  const open = (await read($, questions)).filter(q => q.status === 'open')
  if (open.length === 0) return
  await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: openNote(open) }] } })
}

const press = ($: EngineInterface, id: string, typed: string) => {
  void answer($, id, typed).then(
    said => $.ui.toast(`pocket: ${said}`),
    () => $.ui.toast(`pocket: could not save the answer for ${id}`),
  )
}

// The pocket itself: every question in full, with a button for each option
// and a field for the user's own answer. The pane and the /pocket row draw it.
async function view($: EngineInterface, e: Parameters<EngineInterface['ui']['resolve']>[0], only?: string) {
  const { Box, Button, Input, Text } = $.ui.resolve(e)
  const now = await $.clock.now()
  const all = await read($, questions)
  const list = only === undefined ? all : all.filter(q => q.id === only)
  if (list.length === 0) {
    return <Text dimColor>{only === undefined ? 'The pocket is empty.' : `${only} is not in the pocket any more.`}</Text>
  }
  return (
    <Box flexDirection="column">
      {list.map(q =>
        q.status === 'open' ? (
          <Box flexDirection="column" marginBottom={1}>
            <Text bold>
              {q.id} {q.urgency === 'blocks' ? 'blocks work' : 'no hurry'}{' '}
              <Text dimColor>
                asked {clockTime(q.asked_at)}, {age(q.asked_at, now)} ago
                {q.edited_at === undefined ? '' : `, edited ${clockTime(q.edited_at)}`}
              </Text>
            </Text>
            <Text>{q.question}</Text>
            <Text dimColor>Context: {q.context}</Text>
            <Text dimColor>Meanwhile: {q.meanwhile}</Text>
            {q.relates_to ? <Text dimColor>Relates to: {q.relates_to}</Text> : null}
            {q.options.map((option, index) => (
              <Box flexDirection="column">
                <Button
                  key={`${q.id}:${letter(index)}`}
                  label={`${letter(index)}: ${option.label}${option.recommended ? ' (recommended)' : ''}`}
                  variant={option.recommended ? 'primary' : 'secondary'}
                  onPress={() => press($, q.id, letter(index))}
                />
                <Text dimColor>   leads to {option.leads_to}</Text>
              </Box>
            ))}
            <Input
              key={`${q.id}:own`}
              label="Your own answer:"
              placeholder="type and press Enter"
              submitLabel="answer"
              onSubmit={value => press($, q.id, value)}
            />
          </Box>
        ) : (
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>
              {q.id} withdrawn {q.edited_at === undefined ? '' : clockTime(q.edited_at)}: {q.question}
            </Text>
            <Text dimColor>Reason: {q.reason ?? 'none given'}</Text>
            <Button key={`${q.id}:dismiss`} label="dismiss" onPress={() => press($, q.id, 'dismiss')} />
          </Box>
        ),
      )}
    </Box>
  )
}

// ------------------------------------------------------------ register

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.tool.register({
      name: 'ask',
      description: ASK_DESCRIPTION,
      inputSchema: { type: 'object', properties: FIELDS, required: ['question', 'context', 'meanwhile', 'urgency'] },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'update',
      description: UPDATE_DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'The id of the question, for example Q3' },
          withdraw_reason: { type: 'string', description: 'Give it to withdraw the question' },
          ...FIELDS,
        },
        required: ['id'],
      },
      isDeferred: false,
    })
    await $.tool.register({
      name: 'list',
      description: LIST_DESCRIPTION,
      inputSchema: { type: 'object', properties: {} },
      isDeferred: false,
    })
    await $.command.register({
      name: COMMAND,
      description: 'Show the questions Claude pocketed for you, or answer one',
      argumentHint: '[id] [option letter or your answer]',
      immediate: true,
    })
    try {
      await refresh($)
      // A reload runs this hook again. Claude needs the list once.
      if (!(await read($, isTold))) {
        await update($, isTold, () => true)
        await tell($)
      }
      flushSoon($)
    } catch {
      // The pocket's directory cannot be read. The tools say so when called.
    }
    return started
  })

  // The three tools. Answered here, so no call raises a permission prompt
  // while the user is away.
  on('tool.call', { tool: TOOLS }, async ($, e) => {
    if (e.agentId !== undefined) {
      return { deny: 'pocket: only the main session pockets questions. Return your question to your caller.' }
    }
    const input = e as unknown as Record<string, unknown>
    const name = String(e.tool)
    if (name.endsWith('__ask')) return ask($, input)
    if (name.endsWith('__update')) return change($, input)
    return list($)
  }).catch(() => ({ deny: 'pocket: the pocket could not be read or written. Ask the user in the chat.' }))

  on('command.run', { command: COMMAND }, async ($, e) => {
    const asked = parseArgs(e.args)
    const show = async () => ({ text: listText(await read($, questions), await $.clock.now()), isTextDisplayOnly: true as const })
    if (asked.kind === 'help') {
      return { text: 'Use /pocket, /pocket <id>, /pocket <id> <option letter or your answer>, or /pocket dismiss.', isTextDisplayOnly: true as const }
    }
    if (asked.kind === 'list' || asked.kind === 'show') {
      await refresh($)
      if (asked.kind === 'list' && e.origin.kind === 'composer') void $.ui.open({ id: PANE, title: 'Pocket' }).catch(() => undefined)
      if (asked.kind === 'list') return show()
      const one = (await read($, questions)).filter(q => q.id === asked.id)
      const said = one.length === 0 ? `${asked.id} is not in the pocket.` : listText(one, await $.clock.now())
      return { text: said, isTextDisplayOnly: true as const }
    }
    // An answer has the user's authority, so it must come from the user: the
    // prompt at the terminal, or Remote Control from the phone or the web.
    if (e.origin.kind !== 'composer' && e.origin.kind !== 'bridge') {
      return { text: `pocket: refused. Only the user answers a pocketed question, and this command came from "${e.origin.kind}".` }
    }
    const said = asked.kind === 'dismiss' ? await dismissAll($) : await answer($, asked.id, asked.text)
    return { text: said, isTextDisplayOnly: true as const }
  }).catch(() => ({ text: 'pocket: the pocket could not be read or written.' }))

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) isBusy = true
    return next(e)
  })

  // Reads the directory again, so a change by another session shows, and
  // sends the answers the user gave while the turn ran.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      isBusy = false
      void refresh($).catch(() => undefined)
      flushSoon($)
    }
    return next(e)
  })

  // A compaction may drop what Claude knew of the pocket: tell it again.
  on('session.compact', async ($, e, next) => {
    const compacted = await next(e)
    if (e.agentId === undefined && e.trigger !== 'precompute') void tell($).catch(() => undefined)
    return compacted
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, questions)
    if (e.props.hasSurvey || list.length === 0) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const isBlocked = list.some(q => q.status === 'open' && q.urgency === 'blocks')
    const open = async () => {
      const opened = await $.ui.open({ id: PANE, title: 'Pocket', focus: true })
      if (!opened.isPlaced) $.ui.toast('pocket: type /pocket to see the questions')
    }
    return (
      <Box>
        <Text bold={isBlocked} dimColor={!isBlocked}>
          {bandText(list, await $.clock.now())}{' '}
        </Text>
        <Button key="pocket-open" label="open" onPress={() => void open().catch(() => undefined)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => view($, e))

  on('ui.render', { component: 'CommandOutput', props: { command: COMMAND } }, ($, e, next) => {
    const asked = parseArgs(e.props.args)
    if (e.props.isErrored || (asked.kind !== 'list' && asked.kind !== 'show')) return next(e)
    return view($, e, asked.kind === 'show' ? asked.id : undefined)
  })
}
