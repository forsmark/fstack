import { expect, mock, test } from 'claude-code/testing'

// A 400x200 green PNG.
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAZAAAADICAYAAADGFbfiAAAC4ElEQVR4nO3VQQ3AIADAQIYa/KuYq6GBfhaSOwX99Vnv+gYAHJp/BwBwJwMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAEgMBIDEQABIDASAxEAASAwEgMRAAkg3LiAOnBEExiQAAAABJRU5ErkJggg=='

const READ_OUTPUT = {
  type: 'image',
  file: { base64: PNG, type: 'image/png', originalSize: 1000 },
}

const VIEWPORT = { columns: 120, rows: 40 }

test('a Read of a PNG draws a preview under the tool row', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({
    plugin: 'image-preview',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEWPORT,
    props: {
      tool_use_id: 'toolu_1',
      tool: 'Read',
      input: { file_path: '/tmp/a.png' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: READ_OUTPUT,
    },
  })
  const image = await ui.find({ type: 'Image' })
  expect(image).toBeDefined()
  // 400 px wide is about 45 cells; a 2:1 picture in 2:1 cells is a quarter as tall.
  expect(image?.props.columns).toBe(45)
  expect(image?.props.rows).toBe(11)
  expect(image?.props.alt).toBe('[png image 400x200]')
  await ui.unmount()
})

test('an MCP screenshot block draws a preview', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({
    plugin: 'image-preview',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEWPORT,
    props: {
      tool_use_id: 'toolu_2',
      tool: 'mcp__browser__screenshot',
      input: {},
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: [{ type: 'text', text: 'ok' }, { type: 'image', data: PNG, mimeType: 'image/png' }],
    },
  })
  expect(await ui.find({ type: 'Image' })).toBeDefined()
  await ui.unmount()
})

test('a folded group of reads draws the image under its count line', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({
    plugin: 'image-preview',
    surface: 'terminal',
    component: 'ToolGroup',
    viewport: VIEWPORT,
    props: {
      calls: [
        { tool_use_id: 'toolu_3', tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false, output: { type: 'text' } },
        { tool_use_id: 'toolu_4', tool: 'Read', input: {}, isRunning: false, isErrored: false, isInterrupted: false, output: READ_OUTPUT },
      ],
      isActive: false,
      isExpanded: false,
    },
  })
  expect(await ui.findAll({ type: 'Image' })).toHaveLength(1)
  await ui.unmount()
})

test('a text result draws no preview', async ($, on) => {
  mock.store(on)
  const ui = await $.ui.mount({
    plugin: 'image-preview',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEWPORT,
    props: {
      tool_use_id: 'toolu_5',
      tool: 'Bash',
      input: { command: 'ls' },
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: { stdout: 'a.png', stderr: '' },
    },
  })
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})

test('previews stay hidden while the stored switch is off', async ($, on) => {
  mock.store(on, { enabled: false })
  const ui = await $.ui.mount({
    plugin: 'image-preview',
    surface: 'terminal',
    component: 'ToolUse',
    viewport: VIEWPORT,
    props: {
      tool_use_id: 'toolu_6',
      tool: 'Read',
      input: {},
      isRunning: false,
      isErrored: false,
      isInterrupted: false,
      output: READ_OUTPUT,
    },
  })
  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  await ui.unmount()
})
