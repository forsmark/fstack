# image-preview

Shows images from tool results inline in the terminal transcript, under the
tool row. The web and mobile clients already show these images. This mod
draws them in the terminal client too.

It finds images in these results:

- The Read tool on an image file.
- MCP tools that return image blocks, such as browser screenshots.
- Bash output that Claude Code marks as an image.
- Reads that the transcript folds into one count line ("Read 2 files"). The
  images go under that line.

Requirements:

- A terminal with the kitty graphics protocol: kitty or Ghostty. iTerm2 3.5
  and later works in fullscreen rendering. Elsewhere the mod shows a dim line
  such as `[png image 640x360]`.
- PNG images need nothing more. JPEG, GIF, WebP and PNG files over 2 MiB need
  `python3` with Pillow, which converts them to PNG.

Inside a multiplexer such as herdr, Claude Code does not detect image support:
it allows images only when the terminal reports itself as `kitty` or
`ghostty`. Set `CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1` before Claude Code starts
to skip that check. For herdr, in `~/.zshrc`:

```
[[ $TERM_PROGRAM == herdr ]] && export CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1
```

This variable comes from the Claude Code binary, not its documentation, so a
later release can change it.

`/image-previews off` and `/image-previews on` turn the previews off and on.
With no argument the command toggles. The setting persists across sessions.

The constants at the top of `plugins/image-preview/hooks/register.tsx` set the largest
preview (`MAX_COLUMNS`, `MAX_ROWS`) and the cell shape (`CELL_ASPECT`, cell
height divided by cell width). If previews look stretched or squashed, change
`CELL_ASPECT`.
