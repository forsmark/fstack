// What the mod already told Claude in this session, so each notice goes once.
// A window holds the reset time (unix seconds) of the period the handoff
// notice went for, or 0 when that period had no reset time.
export type Told = { isUnknownTold: boolean; five_hour?: number; seven_day?: number }

declare module 'claude-code' {
  interface PluginState {
    'usage-limits': { told: Shaped<Told> }
  }
}
