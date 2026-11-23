#!/usr/bin/env bash
# Local audio pipeline setup (Apple Silicon only). Idempotent: safe to re-run.
#
#   bash scripts/setup-audio.sh [--no-install] [--skip-warmup] [--keep]
#
#   --no-install   only check prerequisites; never call `brew install`
#   --skip-warmup  skip the end-to-end warm-up render
#   --keep         keep the temp warm-up directory (path is printed)
#
# What it does:
#   1. Checks macOS + arm64, Node >= 22 (native TS type stripping), Homebrew.
#   2. Ensures ffmpeg (with libmp3lame, alimiter, loudnorm, ebur128) and uv are on PATH
#      (installs missing ones with `brew install`, unless --no-install).
#   3. Warm-up: renders a tiny 2-chapter script through the real pipeline
#      (scripts/render-audio.mjs -> uv run --python 3.12 scripts/audio/synthesize_mlx.py -> ffmpeg)
#      into a temp directory OUTSIDE the repo, then checks duration and loudness.
#      First run downloads the Kokoro model (~355 MB, ~/.cache/huggingface) and builds the
#      uv environment (~1.2 GB incl. torch); later runs are offline and take seconds.
#
# Docs: ai-guidelines/setup/local-audio.md
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL_ID="mlx-community/Kokoro-82M-bf16"
INSTALL=1
WARMUP=1
KEEP=0
for arg in "$@"; do
  case "$arg" in
    --no-install) INSTALL=0 ;;
    --skip-warmup) WARMUP=0 ;;
    --keep) KEEP=1 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

ok()   { printf '  ok    %s\n' "$*"; }
info() { printf '  ..    %s\n' "$*"; }
die()  { printf '  FAIL  %s\n' "$*" >&2; exit 1; }

echo "== prerequisites"
[[ "$(uname -s)" == "Darwin" ]] || die "macOS required (MLX runs on Apple Silicon only); got $(uname -s)"
[[ "$(uname -m)" == "arm64" ]] || die "Apple Silicon (arm64) required; got $(uname -m). Under Rosetta? Use a native arm64 shell."
ok "macOS $(sw_vers -productVersion) on arm64"

command -v node >/dev/null || die "node not found (need >= 22 for native TS type stripping; repo engines >=22.23.4)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 22 )) || die "node $(node --version) is too old; need >= 22"
ok "node $(node --version)"

ensure_tool() { # <command> <brew formula>
  local cmd="$1" formula="$2"
  if command -v "$cmd" >/dev/null; then ok "$cmd: $(command -v "$cmd")"; return; fi
  (( INSTALL )) || die "$cmd not found (re-run without --no-install, or: brew install $formula)"
  command -v brew >/dev/null || die "$cmd not found and Homebrew is missing; install Homebrew from https://brew.sh then re-run"
  info "installing $formula with Homebrew"
  brew install "$formula"
  command -v "$cmd" >/dev/null || die "$cmd still not on PATH after brew install $formula"
  ok "$cmd installed: $(command -v "$cmd")"
}
if command -v brew >/dev/null; then ok "brew $(brew --version | head -1 | awk '{print $2}')"; else info "Homebrew not found (only needed to install missing tools)"; fi
ensure_tool ffmpeg ffmpeg
ensure_tool uv uv
ok "$(ffmpeg -version | head -1 | awk '{print $1, $2, $3}')"
ok "$(uv --version)"

# Capture first: `cmd | grep -q` trips pipefail when grep exits early (SIGPIPE on ffmpeg).
FF_ENCODERS="$(ffmpeg -hide_banner -encoders 2>/dev/null || true)"
FF_FILTERS="$(ffmpeg -hide_banner -filters 2>/dev/null || true)"
grep -q ' libmp3lame ' <<<"$FF_ENCODERS" || die "ffmpeg lacks the libmp3lame encoder (brew's ffmpeg includes it)"
for f in alimiter loudnorm ebur128; do
  grep -q " $f " <<<"$FF_FILTERS" || die "ffmpeg lacks the $f filter"
done
ok "ffmpeg has libmp3lame, alimiter, loudnorm, ebur128"

HF_HUB="${HF_HUB_CACHE:-${HF_HOME:-$HOME/.cache/huggingface}/hub}"
if [[ -d "$HF_HUB/models--${MODEL_ID//\//--}" ]]; then
  ok "model cached: $HF_HUB/models--${MODEL_ID//\//--}"
else
  info "model $MODEL_ID not cached yet; the warm-up will download ~355 MB to $HF_HUB"
fi

if (( ! WARMUP )); then echo "== warm-up skipped (--skip-warmup)"; echo "done"; exit 0; fi

echo "== warm-up render (temp dir, outside the repo)"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/sp-audio-setup.XXXXXX")"
cleanup() { if (( KEEP )); then echo "  kept: $WORK"; else rm -rf "$WORK"; fi; }
trap cleanup EXIT
SLUG="sp-audio-smoke"
mkdir -p "$WORK/articles/$SLUG/audio"
cat > "$WORK/articles/$SLUG/audio/script.json" <<'JSON'
{
  "title": "Audio pipeline warm-up",
  "lexicon": { "MLX": "M L X" },
  "chapters": [
    { "id": "intro", "title": "Intro", "paragraphs": [{ "text": "This is a short warm-up for the MLX audio pipeline." }] },
    { "id": "outro", "title": "Outro", "paragraphs": [{ "text": "If you can hear this, synthesis, stitching and loudness normalization all work." }] }
  ]
}
JSON

START=$SECONDS
node "$REPO_ROOT/scripts/render-audio.mjs" --articles-dir "$WORK/articles" --slug "$SLUG"
ok "render finished in $((SECONDS - START)) s"

MP3="$WORK/articles/$SLUG/audio/episode.mp3"
[[ -s "$MP3" ]] || die "no MP3 produced at $MP3"
DUR="$(ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$MP3")"
LUFS="$(ffmpeg -hide_banner -nostdin -i "$MP3" -af ebur128 -f null - 2>&1 | awk '/Integrated loudness:/{f=1} f && /I:/{print $2; exit}')"
ok "episode.mp3: ${DUR}s, integrated loudness ${LUFS} LUFS (target -16 +/- 1)"
awk -v l="$LUFS" 'BEGIN{ exit !(l >= -17 && l <= -15) }' || info "loudness outside -16 +/- 1 LUFS; on clips this short the ebur128 gate is noisy — check a real episode before worrying"

START=$SECONDS
OUT="$(node "$REPO_ROOT/scripts/render-audio.mjs" --articles-dir "$WORK/articles" --slug "$SLUG" 2>&1)"
grep -q 'up to date' <<<"$OUT" || { echo "$OUT"; die "second run did not hit the lock skip"; }
ok "second run skipped via generated.lock.json ($((SECONDS - START)) s)"

echo "done: local audio pipeline ready. Next: npm run audio -- --slug <slug>"
