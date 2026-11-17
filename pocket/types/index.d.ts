// One choice the user can press. `leads_to` says what happens after it.
export type Option = { label: string; leads_to: string; recommended?: boolean }

// A pocketed question: one JSON file under ~/.claude/pocket/<project>/.
// Times are unix milliseconds. `session` is the session that asked.
//   open       waits for the user
//   withdrawn  Claude took it back, the user has not dismissed it yet
//   answered   the user answered, `delivered_at` says when Claude got it
//   dismissed  the user dismissed a withdrawn question
export type Question = {
  id: string
  question: string
  context: string
  options: Option[]
  meanwhile: string
  urgency: 'blocks' | 'no_hurry'
  relates_to?: string
  asked_at: number
  session: string
  status: 'open' | 'withdrawn' | 'answered' | 'dismissed'
  edited_at?: number
  reason?: string
  answer?: string
  answered_at?: number
  answered_in?: string
  delivered_at?: number
}

declare module 'claude-code' {
  interface PluginState {
    pocket: {
      // The open and the withdrawn questions of this project, as last read.
      questions: Shaped<Question[]>
      // Whether Claude got the list of open questions in this session.
      isTold: boolean
      // Ids of answers handed to the engine that it did not confirm yet.
      sent: string[]
    }
  }
}
