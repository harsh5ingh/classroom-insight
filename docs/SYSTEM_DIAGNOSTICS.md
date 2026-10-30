# System diagnostics and reproducible setup

`/app/diagnostics` calls authenticated `GET /api/analytics/diagnostics`. It shows Python/venv, installed package versions, database SELECT 1, backend reachability, FFmpeg, active provider name/model, local fallback and retained-media counts/policy. It never returns keys, credential IDs, filesystem paths, request headers or raw exceptions and makes no AI generation or vault-read request. Installed version is labelled separately from a successful import.

The explicit **Check device availability** button uses browser enumerateDevices and supported Permissions queries. It does not open devices or retain device labels/IDs. Browsers may conceal devices before permission. Use Live Monitor for an actual authorized capture test; permission state or device count alone is not proof of functioning hardware.

## Environment check

```powershell
cd D:\Coding\classroom-insight
.\.venv\Scripts\python.exe -B scripts/validate_environment.py --imports
.\.venv\Scripts\python.exe -m pip check
```

The CLI checks imports in bounded subprocesses, reads SQLite with `mode=ro`, probes health and reports active-provider metadata without loading or printing .env secrets. It never initializes/migrates/reseeds the database, opens camera/mic or calls cloud AI. Camera/mic are honestly marked not tested. Import failures are sanitized; diagnose packages locally rather than pasting secrets.

## Dependency groups

- `requirements-core.txt`: Flask, NumPy, headless OpenCV, dotenv, Waitress and Pydantic (required by existing readiness schema).
- `requirements-providers.txt`: optional official Gemini/Groq SDKs and keyring; unavailable providers retain local rules and fail-closed managed key storage.
- `requirements-dev.txt`: pytest and HTTP smoke-test tooling.
- `requirements-audio.txt`: optional Librosa/SciPy spectral features/resampling. NumPy fallback remains usable.
- `requirements-dashboard.txt`: optional Streamlit/pandas/requests interface.
- `requirements.txt`: backward-compatible core + provider + test installation.
- `requirements-lock-python313-windows.txt`: full version constraints from this verified environment, not a portable hashed lock. Existing `requirements.lock.txt` and package-lock.json are preserved as historical/current original artifacts, not silently replaced.

For the complete current feature set:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-audio.txt -r requirements-dashboard.txt -c requirements-lock-python313-windows.txt
```

The exact constrained dry-run and pip check passed. Python 3.13.15 was used. The pinned NumPy 2.5.4 and SciPy 1.18.1 require Python >=3.12; Gemini/Streamlit require >=3.11. Python 3.9 compatibility is **not** claimed. On a new machine use `py -3.13 -m venv .venv` only when no existing environment exists; do not overwrite a working environment.

Librosa 0.11.0 and Streamlit 1.66.1 installed alongside the existing OpenCV 4.14.0.94 and NumPy. Imports of Flask, NumPy, OpenCV, Librosa, SciPy, Streamlit, official AI SDKs and keyring passed. MediaPipe 1.2.0 has a Windows wheel, but its dry-run introduces opencv-contrib-python 5.0.0.93 beside headless OpenCV, which shares `cv2`. It was deliberately not installed. Bundled OpenCV Haar is the active no-download detector. Evaluate a single OpenCV distribution and actual model/landmark tests before enabling MediaPipe; no model inference or head-pose support is claimed.

FFmpeg is currently absent. The existing subprocess extraction code handles it as unavailable; upload PCM WAV alongside video and use explicit alignment. No external codec binary was silently installed. First Librosa feature import incurs startup cost (measured 3.841s); a subsequent synthetic 20s audio analysis took 0.108s. This is not a hardware/accuracy guarantee.

References: [Streamlit installation](https://docs.streamlit.io/get-started/installation), [Librosa resample](https://librosa.org/doc/latest/generated/librosa.resample.html), [MediaPipe Python setup](https://ai.google.dev/edge/mediapipe/solutions/setup_python). Actual local package resolver/import results, not version assumptions, determine the supported setup here.
