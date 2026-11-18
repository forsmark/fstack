import { expect, test } from 'claude-code/testing'

const EMAIL = 'jane.doe@example.com'

const BLOCKED: Record<string, unknown>[] = [
  { tool: 'Bash', command: `curl -H "User-Agent: myapp/1.0 (${EMAIL})" https://nominatim.openstreetmap.org/search?q=x` },
  { tool: 'Bash', command: `curl -A 'myapp (${EMAIL})' https://api.example.com` },
  { tool: 'Bash', command: `curl --header="From: ${EMAIL}" https://api.example.com` },
  { tool: 'Bash', command: `curl -H'From: ${EMAIL.toUpperCase()}' https://api.example.com` },
  { tool: 'Bash', command: `wget --user-agent "bot ${EMAIL}" https://example.com` },
  { tool: 'Bash', command: `http GET https://example.com User-Agent:"bot ${EMAIL}"` },
  { tool: 'Bash', command: `ketch scrape https://example.com --user-agent "bot ${EMAIL}"` },
  { tool: 'Bash', command: `ketch config set user_agent "bot ${EMAIL}"` },
  { tool: 'Bash', command: `python3 -c "import requests; requests.get(u, headers={'User-Agent': 'x ${EMAIL}'})"` },
  { tool: 'Bash', command: `curl -H "X-Contact: jane.doe%40example.com" https://example.com` },
  { tool: 'mcp__fetch__fetch', url: 'https://example.com', headers: { 'User-Agent': `bot ${EMAIL}` } },
  { tool: 'mcp__http__request', url: 'https://example.com', headers: [`From: ${EMAIL}`] },
]

const ALLOWED: Record<string, unknown>[] = [
  { tool: 'Bash', command: `git config user.email ${EMAIL}` },
  { tool: 'Bash', command: `curl -H "User-Agent: myapp/1.0" https://example.com` },
  { tool: 'Bash', command: `grep -r ${EMAIL} ~/.config` },
  { tool: 'Bash', command: 'ls -la' },
  { tool: 'Write', file_path: '/tmp/x.txt', content: `author: ${EMAIL}` },
  { tool: 'mcp__gmail__search', query: `from:me to:${EMAIL}` },
]

test('calls that put the address in a header are denied', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('ui.toast', () => ({ value: undefined }))
  for (const input of BLOCKED) {
    const r = await $.tool.call(input as never)
    expect(r.deny, JSON.stringify(input)).toContain('email-guard')
  }
})

test('other calls run', async ($, on) => {
  on('tool.call', () => ({ result: {} }))
  on('ui.toast', () => ({ value: undefined }))
  for (const input of ALLOWED) {
    const r = await $.tool.call(input as never)
    expect(r.deny, JSON.stringify(input)).toBeUndefined()
  }
})
