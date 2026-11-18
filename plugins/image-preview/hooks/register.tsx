import type { Elements, EngineInterface, ImageSource, Register, RenderNode } from 'claude-code'

type Terminal = Elements['terminal']

// Largest preview, in terminal cells.
const MAX_COLUMNS = 80
const MAX_ROWS = 20
// Height of one terminal cell divided by its width. Most fonts are near 2.
const CELL_ASPECT = 2.0
// Approximate pixels in one cell, so a small icon is not blown up.
const CELL_PIXELS_WIDE = 9
// Spaces before a preview, so it sits under the tool row's result marker.
const INDENT = 5
// At most this many previews under one row.
const MAX_IMAGES = 4
// The Image element takes at most 2 MiB of decoded bytes.
const MAX_IMAGE_BYTES = 2 * 1024 * 1024
// Longest side of a converted picture, in pixels.
const MAX_CONVERT_PIXELS = 1600
const STORE_KEY = 'enabled'
const COMMAND = 'image-previews'

type FoundImage = { data: string; mediaType: string }

type Prepared =
  | { kind: 'ok'; source: ImageSource; width: number; height: number; label: string }
  | { kind: 'error'; label: string }

// Converts any picture Pillow reads (JPEG, GIF, WebP, a big PNG) to a PNG of
// at most MAX_CONVERT_PIXELS on its longest side. Reads base64 on stdin and
// writes one JSON line.
const CONVERT = `
import sys, io, json, base64
from PIL import Image
limit = int(sys.argv[1])
im = Image.open(io.BytesIO(base64.b64decode(sys.stdin.read())))
w, h = im.size
im.seek(0)
im = im.convert('RGBA')
im.thumbnail((limit, limit))
out = io.BytesIO()
im.save(out, 'PNG')
print(json.dumps({'w': w, 'h': h, 'pw': im.size[0], 'ph': im.size[1],
                  'png': base64.b64encode(out.getvalue()).decode()}))
`

// The module's variables start over on a reload. The store keeps the switch.
let enabled: boolean | undefined
const cache = new Map<string, Promise<Prepared>>()

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: COMMAND,
      description: 'Turn inline image previews on or off (on | off; no argument toggles)',
      argumentHint: '[on|off]',
    })
    enabled = await readEnabled($)
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const arg = e.args.trim().toLowerCase()
    const current = await readEnabled($)
    const wanted = arg === 'on' ? true : arg === 'off' ? false : !current
    enabled = wanted
    await $.store.set(STORE_KEY, wanted)
    $.ui.invalidate('ui.render')
    return { text: `Image previews are ${wanted ? 'on' : 'off'}.` }
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const row = await next(e)
    if (e.surface !== 'terminal' || e.props.isRunning) return row
    if (!(await readEnabled($))) return row
    const found = findImages(e.props.output)
    if (found.length === 0) return row
    const ui = $.ui.resolve(e)
    const previews = await drawPreviews($, ui, e.viewport?.columns, e.props.tool_use_id, found)
    const { Box } = ui
    return (
      <Box flexDirection="column">
        {row}
        {previews}
      </Box>
    )
  })

  // Claude Code folds runs of reads into one count line ("Read 2 files"), and
  // draws no ToolUse row for them. Draw the folded calls' images under it.
  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const row = await next(e)
    if (e.surface !== 'terminal' || e.props.isExpanded) return row
    if (!(await readEnabled($))) return row
    const ui = $.ui.resolve(e)
    const parts: RenderNode[] = []
    let count = 0
    for (const [index, call] of e.props.calls.entries()) {
      if (call.isRunning || count >= MAX_IMAGES) continue
      const found = findImages(call.output).slice(0, MAX_IMAGES - count)
      if (found.length === 0) continue
      count += found.length
      const id = call.tool_use_id ?? `${e.requestId}:${index}`
      parts.push(...(await drawPreviews($, ui, e.viewport?.columns, id, found)))
    }
    if (parts.length === 0) return row
    const { Box } = ui
    return (
      <Box flexDirection="column">
        {row}
        {parts}
      </Box>
    )
  })
}

async function readEnabled($: EngineInterface): Promise<boolean> {
  if (enabled === undefined) enabled = (await $.store.get(STORE_KEY)) !== false
  return enabled
}

async function drawPreviews(
  $: EngineInterface,
  ui: Terminal,
  viewportColumns: number | undefined,
  id: string,
  found: FoundImage[],
): Promise<RenderNode[]> {
  const { Box, Text, Image } = ui
  const room = Math.max(10, (viewportColumns ?? 100) - INDENT - 2)
  const out: RenderNode[] = []
  for (const [index, image] of found.entries()) {
    const key = `${id}:${index}`
    let pending = cache.get(key)
    if (pending === undefined) {
      pending = prepare($, image)
      cache.set(key, pending)
      // Keep the cache small: drop the oldest entries.
      while (cache.size > 64) cache.delete(cache.keys().next().value as string)
    }
    const prepared = await pending
    if (prepared.kind === 'error') {
      out.push(
        <Box paddingLeft={INDENT}>
          <Text dimColor>{prepared.label}</Text>
        </Box>,
      )
      continue
    }
    const { columns, rows } = boxFor(prepared.width, prepared.height, room)
    out.push(
      <Box paddingLeft={INDENT} flexDirection="column">
        <Image source={prepared.source} columns={columns} rows={rows} alt={prepared.label} />
      </Box>,
    )
  }
  return out
}

// The cell box for a picture: as wide as fits, no taller than MAX_ROWS, and
// no larger than the picture's own pixels.
function boxFor(width: number, height: number, room: number): { columns: number; rows: number } {
  const natural = Math.max(1, Math.ceil(width / CELL_PIXELS_WIDE))
  let columns = Math.min(room, MAX_COLUMNS, natural)
  let rows = Math.round((columns * height) / width / CELL_ASPECT)
  if (rows > MAX_ROWS) {
    rows = MAX_ROWS
    columns = Math.round((rows * CELL_ASPECT * width) / height)
  }
  return {
    columns: Math.min(255, Math.max(1, columns)),
    rows: Math.min(255, Math.max(1, rows)),
  }
}

async function prepare($: EngineInterface, image: FoundImage): Promise<Prepared> {
  const type = image.mediaType.replace(/^image\//, '')
  const bytes = Math.floor((image.data.length * 3) / 4)
  if (type === 'png' && bytes <= MAX_IMAGE_BYTES) {
    const size = pngSize(image.data)
    if (size !== undefined) {
      return { kind: 'ok', source: { png: image.data }, ...size, label: label(type, size.width, size.height) }
    }
  }
  try {
    const run = await $.process.run(['python3', '-I', '-c', CONVERT, String(MAX_CONVERT_PIXELS)], {
      stdin: image.data,
      timeoutMs: 20_000,
    })
    if (run.exitCode !== 0) {
      const missing = /No module named 'PIL'/.test(run.stderr)
      return {
        kind: 'error',
        label: missing
          ? `[${type} image: install Pillow (python3 -m pip install pillow) to preview it]`
          : `[${type} image: could not convert it for preview]`,
      }
    }
    const result = JSON.parse(run.stdout) as { w: number; h: number; pw: number; ph: number; png: string }
    return {
      kind: 'ok',
      source: { png: result.png },
      width: result.pw,
      height: result.ph,
      label: label(type, result.w, result.h),
    }
  } catch {
    return { kind: 'error', label: `[${type} image: python3 is needed to preview it]` }
  }
}

function label(type: string, width: number, height: number): string {
  return `[${type} image ${width}x${height}]`
}

// Reads width and height from a PNG's IHDR chunk: bytes 16 to 23.
function pngSize(base64: string): { width: number; height: number } | undefined {
  const head = decodeBase64(base64.slice(0, 32))
  if (head.length < 24) return undefined
  if (head[0] !== 0x89 || head[1] !== 0x50 || head[2] !== 0x4e || head[3] !== 0x47) return undefined
  const word = (at: number) => ((head[at]! << 24) | (head[at + 1]! << 16) | (head[at + 2]! << 8) | head[at + 3]!) >>> 0
  const width = word(16)
  const height = word(20)
  return width > 0 && height > 0 ? { width, height } : undefined
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function decodeBase64(text: string): number[] {
  const out: number[] = []
  let bits = 0
  let count = 0
  for (const char of text) {
    const value = BASE64.indexOf(char)
    if (value < 0) break
    bits = (bits << 6) | value
    count += 6
    if (count >= 8) {
      count -= 8
      out.push((bits >> count) & 0xff)
    }
  }
  return out
}

// Finds base64 images in a tool's stored result. It knows three shapes:
// the Read tool's { type: 'image', file: { base64, type } }, an API content
// block { type: 'image', source: { type: 'base64', media_type, data } }, and
// an MCP content block { type: 'image', data, mimeType }. Bash marks an image
// on stdout with isImage and a data URL.
function findImages(value: unknown, out: FoundImage[] = [], depth = 0): FoundImage[] {
  if (out.length >= MAX_IMAGES || depth > 6 || value === null || typeof value !== 'object') return out
  if (Array.isArray(value)) {
    for (const item of value) findImages(item, out, depth + 1)
    return out
  }
  const o = value as Record<string, unknown>
  if (o.type === 'image') {
    const file = o.file as Record<string, unknown> | undefined
    if (file && typeof file.base64 === 'string' && typeof file.type === 'string') {
      out.push({ data: file.base64, mediaType: file.type })
      return out
    }
    const source = o.source as Record<string, unknown> | undefined
    if (source && source.type === 'base64' && typeof source.data === 'string') {
      out.push({ data: source.data, mediaType: String(source.media_type ?? 'image/png') })
      return out
    }
    if (typeof o.data === 'string' && typeof o.mimeType === 'string') {
      out.push({ data: o.data, mediaType: o.mimeType })
      return out
    }
  }
  if (o.isImage === true && typeof o.stdout === 'string') {
    const match = /^data:(image\/[a-z+.-]+);base64,(.*)$/s.exec(o.stdout.trim())
    if (match) out.push({ mediaType: match[1]!, data: match[2]! })
    return out
  }
  for (const key of Object.keys(o)) findImages(o[key], out, depth + 1)
  return out
}
