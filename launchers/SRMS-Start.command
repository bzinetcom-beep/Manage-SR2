#!/usr/bin/env bash
# =============================================================================
#  SRMS one-click launcher — macOS / Linux (fallback path, requires Node.js)
#  Double-click on macOS. On Linux: chmod +x then run.
# =============================================================================
set -uo pipefail

# path-safe: resolve the real script location even through symlinks
SOURCE="${BASH_SOURCE[0]}"
while [ -L "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
HERE="$(cd -P "$(dirname "$SOURCE")" && pwd)"
ROOT="$(cd -P "$HERE/.." && pwd)"
cd "$ROOT" || exit 1

printf '\n  ===========================================================\n'
printf '     SRMS — Soldier Resource Management System\n'
printf '  ===========================================================\n\n'

# ------------------------------- locate node ---------------------------------
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  for c in /usr/local/bin/node /opt/homebrew/bin/node "$HOME/.nvm/versions/node"/*/bin/node "$ROOT/runtime/node/bin/node"; do
    [ -x "$c" ] && NODE_BIN="$c" && break
  done
fi

if [ -z "$NODE_BIN" ]; then
  printf '  [X] Node.js was not found on this computer.\n\n'
  printf '      Install the LTS build from https://nodejs.org and run this file again,\n'
  printf '      or use the packaged SRMS application which needs no prerequisites.\n\n'
  command -v open >/dev/null 2>&1 && open "https://nodejs.org/en/download" || true
  read -r -p "  Press Enter to close…" _
  exit 1
fi

printf '  [OK] Node.js: %s\n' "$("$NODE_BIN" -v)"
printf '  [..] Starting, please wait (first run can take a few minutes)\n\n'

"$NODE_BIN" "$ROOT/launchers/srms-boot.mjs" "$@"
RC=$?

if [ $RC -ne 0 ]; then
  printf '\n  [X] Startup failed (exit code %s).\n' "$RC"
  printf '      Log file: %s/logs/srms-startup.log\n\n' "$ROOT"
  read -r -p "  Press Enter to close…" _
fi

exit $RC
