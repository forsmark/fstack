#!/usr/bin/env bash
# Installs fstack into Claude Code. Running it again changes nothing that is
# already in place.
#
# - Removes the links that older versions made from ~/.claude/skills/ into
#   skills/. The skills now ship in the fstack plugin, as /fstack:<skill>.
# - Links each output style in output-styles/ into ~/.claude/output-styles/.
# - Links global/CLAUDE.md to ~/.claude/CLAUDE.md.
# - Adds this folder as the fstack plugin marketplace and installs each plugin
#   in plugins/ at user scope.
# - Checks that the openspec CLI is the version fstack pins, and prints the
#   upgrade command if not. It never runs `openspec init`, which sets up a
#   project in the folder it runs in.
# - Checks the backlog CLI (Backlog.md) in the same way. It never runs
#   `backlog init` either.
#
# A file that stands where a link goes is moved aside to <name>.bak.<time>.
# Set CLAUDE_CONFIG_DIR to install into another config folder.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
OPENSPEC_VERSION=2.1.0
BACKLOG_VERSION=1.57.4
CLAUDE_DIR="${CLAUDE_CONFIG_DIR:-$HOME/.claude}"

link() {
  local src=$1 dst=$2
  mkdir -p "$(dirname "$dst")"
  if [ -L "$dst" ]; then
    if [ "$(readlink "$dst")" = "$src" ]; then
      echo "ok       $dst"
      return
    fi
    rm "$dst"
  elif [ -e "$dst" ]; then
    local backup
    backup="$dst.bak.$(date +%Y%m%d%H%M%S)"
    mv "$dst" "$backup"
    echo "moved    $dst to $backup"
  fi
  ln -s "$src" "$dst"
  echo "linked   $dst -> $src"
}

for dst in "$CLAUDE_DIR"/skills/*; do
  [ -L "$dst" ] || continue
  case "$(readlink "$dst")" in
    "$ROOT"/skills/*)
      rm "$dst"
      echo "removed  $dst, now in the fstack plugin"
      ;;
  esac
done

for file in "$ROOT"/output-styles/*.md; do
  [ -f "$file" ] || continue
  link "$file" "$CLAUDE_DIR/output-styles/$(basename "$file")"
done

if [ -f "$ROOT/global/CLAUDE.md" ]; then
  link "$ROOT/global/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
fi

if ! command -v openspec >/dev/null; then
  echo "warning  openspec is not on PATH. Install it: pnpm add -g @fission-ai/openspec@$OPENSPEC_VERSION" >&2
elif [ "$(openspec --version 2>/dev/null)" != "$OPENSPEC_VERSION" ]; then
  echo "warning  openspec is $(openspec --version 2>/dev/null), and fstack pins $OPENSPEC_VERSION. Install that version: pnpm add -g @fission-ai/openspec@$OPENSPEC_VERSION" >&2
else
  echo "ok       openspec $OPENSPEC_VERSION"
fi

if ! command -v backlog >/dev/null; then
  echo "warning  backlog is not on PATH. Install it: npm i -g backlog.md@$BACKLOG_VERSION" >&2
elif [ "$(backlog --version 2>/dev/null)" != "$BACKLOG_VERSION" ]; then
  echo "warning  backlog is $(backlog --version 2>/dev/null), and fstack pins $BACKLOG_VERSION. Install that version: npm i -g backlog.md@$BACKLOG_VERSION" >&2
else
  echo "ok       backlog $BACKLOG_VERSION"
fi

if ! command -v claude >/dev/null; then
  echo "claude is not on PATH: plugins not installed" >&2
  exit 1
fi

if claude plugin marketplace list 2>/dev/null | grep -q "Folder ($ROOT)"; then
  claude plugin marketplace update fstack >/dev/null
  echo "ok       marketplace fstack"
else
  claude plugin marketplace add "$ROOT"
fi

installed="$(claude plugin list 2>/dev/null)"
for dir in "$ROOT"/plugins/*/; do
  name="$(basename "$dir")"
  [ -f "$dir/.claude-plugin/plugin.json" ] || continue
  if grep -q "$name@fstack" <<<"$installed"; then
    echo "ok       plugin $name@fstack"
  else
    claude plugin install "$name@fstack" --scope user
  fi
done
