#!/usr/bin/env python3
# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = [
#   "mlx-audio==0.6.7",
#   "mlx==0.32.4",
#   "soundfile==0.14.0",
#   "numpy==2.5.5",
#   "scipy==1.18.1",
#   "misaki[en]==0.9.4",
#   "spacy==3.8.18",
#   "torch==2.15.0",
#   "transformers==5.24.0",
#   "huggingface-hub==2.4.0",
#   "en-core-web-sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl",
# ]
# ///
"""Kokoro (mlx-audio) chunk synthesizer.

stdin : JSON { model, voice, langCode, speed, sampleRateHz, cacheDir,
               chunks: [{ key, text }] }
stdout: one JSON line per chunk: { "key", "samples", "cached" }  (nothing else)
stderr: all logs, library prints and progress.
Output: <cacheDir>/<key>.wav, mono PCM16 at sampleRateHz.

Run: uv run --python 3.12 scripts/audio/synthesize_mlx.py < input.json
"""
import json
import os
import sys

# Keep stdout pure: library code (mlx-audio) print()s to stdout. Capture the real
# stdout for our JSON lines, then point sys.stdout at stderr.
_OUT = sys.stdout
sys.stdout = sys.stderr


def log(msg: str) -> None:
    print(f"[synthesize_mlx] {msg}", file=sys.stderr, flush=True)


def emit(obj: dict) -> None:
    _OUT.write(json.dumps(obj, separators=(",", ":")) + "\n")
    _OUT.flush()


def fail(msg: str, code: int = 1) -> "None":
    log(f"ERROR: {msg}")
    sys.exit(code)


def read_request() -> dict:
    try:
        req = json.load(sys.stdin)
    except Exception as e:  # noqa: BLE001
        fail(f"invalid JSON on stdin: {e}", 2)
    for k in ("model", "voice", "langCode", "speed", "sampleRateHz", "cacheDir", "chunks"):
        if k not in req:
            fail(f"missing required field '{k}'", 2)
    if not os.path.isabs(req["cacheDir"]):
        fail("cacheDir must be an absolute path", 2)
    if not isinstance(req["chunks"], list):
        fail("chunks must be an array", 2)
    for c in req["chunks"]:
        if not isinstance(c, dict) or not c.get("key") or not isinstance(c.get("text"), str):
            fail(f"invalid chunk: {c!r}", 2)
        if "/" in c["key"] or "\\" in c["key"] or c["key"].startswith("."):
            fail(f"unsafe chunk key: {c['key']!r}", 2)
    return req


def resample(x, src: int, dst: int):
    import numpy as np
    from scipy.signal import resample_poly  # scipy ships as an mlx-audio dependency
    from math import gcd

    g = gcd(src, dst)
    return resample_poly(x, dst // g, src // g).astype(np.float32)


def main() -> None:
    req = read_request()
    cache_dir = req["cacheDir"]
    target_sr = int(req["sampleRateHz"])
    os.makedirs(cache_dir, exist_ok=True)

    import soundfile as sf

    todo = [c for c in req["chunks"] if not os.path.isfile(os.path.join(cache_dir, c["key"] + ".wav"))]
    model = None
    if todo:
        log(f"loading model {req['model']} ({len(todo)}/{len(req['chunks'])} chunks to synthesize)")
        import mlx.core as mx
        import numpy as np
        from mlx_audio.tts.utils import load_model

        model = load_model(req["model"])
    else:
        log("all chunks cached; model not loaded")

    for c in req["chunks"]:
        key, text = c["key"], c["text"]
        path = os.path.join(cache_dir, key + ".wav")
        if os.path.isfile(path):
            info = sf.info(path)
            emit({"key": key, "samples": int(info.frames), "cached": True})
            continue
        if not text.strip():
            fail(f"chunk '{key}' has empty text")
        parts, native_sr = [], target_sr
        for r in model.generate(
            text=text,
            voice=req["voice"],
            speed=float(req["speed"]),
            lang_code=req["langCode"],
        ):
            parts.append(np.asarray(r.audio, dtype=np.float32).reshape(-1))
            native_sr = int(r.sample_rate)
        if not parts:
            fail(f"no audio generated for chunk '{key}'")
        audio = np.concatenate(parts)
        if native_sr != target_sr:
            log(f"resampling {native_sr} -> {target_sr} Hz")
            audio = resample(audio, native_sr, target_sr)
        audio = np.clip(audio, -1.0, 1.0)
        tmp = path + ".tmp.wav"
        sf.write(tmp, audio, target_sr, subtype="PCM_16", format="WAV")
        os.replace(tmp, path)
        emit({"key": key, "samples": int(sf.info(path).frames), "cached": False})
        log(f"synthesized {key}: {len(audio)} samples")


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:  # noqa: BLE001
        import traceback

        traceback.print_exc(file=sys.stderr)
        fail(f"{type(e).__name__}: {e}")
