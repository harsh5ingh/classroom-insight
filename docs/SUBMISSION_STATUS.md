# Classroom Insight — submission status

Updated 30 October 2026. Project: `D:\Coding\classroom-insight`.

## Current capstone handover — October 30

This section supersedes the historical October 29 handover below. The latest authoritative 15-requirement matrix, exact test names, changes still required and limitations are in [REQUIREMENTS_AUDIT.md](REQUIREMENTS_AUDIT.md#capstone-compliance-matrix--30-october-2026). The official brief screenshot and mandatory report template remain unavailable; the project report is not claimed to match that template.

### New since the previous handover

- **Visible live acquisition:** Upload recording → Camera / microphone. Camera captures up to 60 timestamped JPEG snapshots at nominal two-second intervals; microphone produces up to two minutes of mono PCM WAV. Authorization checkbox and explicit Start are required. Stop/review/discard and a separate Upload action keep capture local until chosen. Closing, cancelling, hiding the tab, errors or the time limit release device resources. This is acquisition followed by batch analysis, not continuous live inference or simultaneous live A/V.
- **Capture backend:** protected `/capture` validates bounds/timestamps/JPEG headers, decodes and strips image metadata before building a private ZIP. Original frames can be reviewed through protected endpoints. Recorded video/audio remain supported. PCM microphone audio needs no FFmpeg. Camera snapshot processing does not use HOG or collect sound.
- **Configurable presence:** duration 20–300s, samples 3–30, and still-motion threshold 0.001–0.2 face-widths/s. Saved with each analysis, enforced in attendance review, no retroactive changes. Face previews are separately optional and default off; existing retained images are not erased by toggling the setting.
- **Honest observation scope:** head pose explicitly unsupported; eye-line roll is only a 2D heuristic. Speech-like heuristic intervals are now exposed (first 360, truncation disclosed), without claiming transcription or conversation understanding.
- **Reliability:** late permission cancellation, device release, empty frames, invalid timestamps/images, capture limits, optional crops, metadata stripping and Windows locked-media deletion are tested. Locked media returns a useful 409 without deleting its record.

### Current verification

- Full backend: **79 passed in 10.98s**; includes actual HTTP media/fusion/fallback/export flow, camera API integration, configurable gates and initialization of a **disposable backup** of the existing database.
- Full frontend: **43 passed / five files in 17.60s**. Ten capture tests mock hardware/browser APIs; they are not physical-device results. The flaky eight-route test was split into eight independently timed cases, preserving assertions and the original timeout.
- TypeScript passed. Production build passed: **2,634 modules**, Vite **3.10s**.
- Synthetic bounded benchmark: **60 blank 640×480 JPEGs in 0.898s**, 331,253-byte archive. Only a small local fixture measurement; not representative classroom latency, accuracy or load capacity.
- Native browser verification now succeeded on an isolated QA instance/database: homepage/login, fictional session creation, desktop/mobile capture controls, settings persistence after refresh, all eight rendered dashboard routes, sign-out and protected-route behavior. No actual classroom data was used. No camera/microphone access was granted and no physical recording was made. Original-media playback, downloads/print and positive-face review remain manual.
- Existing screenshots remain historical. New browser views were inspected, but direct screenshot saving was blocked by the browser tool's filesystem permissions; no synthetic or placeholder screenshot was created.
- Live Gemini generation: **not run in this phase**. Local recommendations and optional provider error/schema tests are verified; a supplied key is not evidence of successful generation.
- Final provider/catalogue regression rerun: `tests/test_portal.py`, **28 passed in 2.52s**, after the capability description update. Final TypeScript check also passed.
- Preservation/security: **all 11 original tables and `.env` matched their pre-phase fingerprints after startup**. No new migration, reset, reseed or deletion of existing data. Source/docs/build scan found no configured Gemini or Flask secret values. Private database, environment and QA files remain ignored by Git. `git diff --check` passed.
- Both normal application endpoints were started from this checkout: Flask at 5000 and Vite at 5173. The disposable 4173 QA server was stopped after verification; its private test database remains ignored. No unrelated process was stopped.

Run these again from the project root if needed (choose a fresh base-temp suffix; pytest clears an existing base-temp directory):

```powershell
cd D:\Coding\classroom-insight
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
.\.venv\Scripts\python.exe -B -m pytest -p no:cacheprovider --basetemp=data/capstone-pytest-20261030-final -q
npm test -- --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json
npm run build
```

### Exact startup and evaluator steps

Backend:

```powershell
cd D:\Coding\classroom-insight
.\.venv\Scripts\python.exe -m backend.app
```

Frontend, separate terminal:

```powershell
cd D:\Coding\classroom-insight
npm run dev
```

The dev URL is `http://127.0.0.1:5173/`. Vite uses `strictPort`: if that port is occupied, inspect the process and reuse it only if it serves this checkout. Do not kill an unrelated server. The simplest submission path is the already built SPA at **`http://127.0.0.1:5000/`**, with Flask alone. Port 4173 was used only for the disposable QA instance, not your main database. No deployed public URL exists.

1. Sign in using the documented demo account (`instructor@classroom.demo` / `ClassroomDemo!2026`, unless locally overridden). Show the explicit Demo Mode label and eight screens.
2. Use existing sample data for the general walkthrough; never reset it. For new media, create a separate authorized evaluation session and fictional roster. Demonstrate manual confirmation, timestamp/source and history.
3. In Settings, inspect duration/sample/still-motion thresholds. Defaults are 20s/3 samples; keep a 2–10s recorded-frame interval and a short clip for track review. Leave face-crop retention off unless needed and authorized.
4. Open Upload recording → Camera / microphone. **You must authorize the people/audio and grant the browser permission yourself.** Use localhost/HTTPS. Camera takes snapshots without audio. Microphone takes audio without images. Capture at least two camera samples; a presence review needs enough consecutive positive detections to meet the configured duration/sample thresholds. Stop, inspect, then explicitly upload; confirm no device indicator remains after stop/close. If permission is denied, the device is busy/missing, or capture fails, use a consented recorded video or PCM WAV.
5. Inspect source timestamps, original snapshots (when retained), limitations and experimental activity windows. Do not infer identity from track number or eye-line roll. Independently review before explicitly linking any qualified track to a roster student. Camera occlusion/misses can legitimately leave no qualifying track.
6. Use the existing same-session video/audio fusion workflow with correctly synchronized recordings. Explain the formula/coverage. Generate local advice; optional Gemini is a separate explicit cloud request. Export CSV/JSON and sign out.

### Before submission — prioritized checklist

- **P0:** Obtain the official SkillWallet brief and mandatory report template, then map this report into it. Do not claim full template compliance without comparing them. Keep `.env`, databases, backups and captured media private; do not publish the demo login as production security.
- **P1:** Perform an authorized real camera and microphone test on the evaluator's browser; use a consented short frontal-face video and synchronized PCM WAV as a fallback. Check permissions, release indicators, original review and export/print manually. Real positive-face accuracy is not yet established.
- **P1:** Show honest limitations: head pose and ASR unsupported; anonymous tracking is not recognition; activity is not attention; no individual engagement score. Snapshot capture is not a continuous live stream analyzer.
- **P2:** If demonstrating Gemini, verify a real generation with non-sensitive aggregate/sample information and report actual provider errors. No key is required for local suggestions. Do not put credentials in Vite or screenshots.
- **P2:** Capture fresh desktop/mobile screenshots manually if needed. Existing gallery images predate these additions. Add hardware/recording evidence and real-world performance only after executing those checks.

### Files in this phase

New: `backend/capture.py`, `src/capture.ts`, `src/LiveCapture.tsx`, `src/capture.test.tsx`, `tests/test_capture.py`.

Modified: `backend/analysis.py`, `backend/app.py`, `backend/db.py`, `backend/observations.py`, `backend/capabilities.json`, `src/forms.tsx`, `src/Observations.tsx`, `src/pages.tsx`, `src/types.ts`, `src/App.test.tsx`, `tests/test_observations.py`, `README.md`, `docs/REQUIREMENTS_AUDIT.md`, `docs/SUBMISSION_STATUS.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_REPORT.md`.

No package/lockfile/environment changes or new migration. Git was clean at this phase's start. Private test artifacts and rebuilt `dist/` are ignored. No commit, push or deployment. The QA database is separate under `data/capstone-browser-20261030/`; all its records are test-only.

---

## Historical handover — October 29 (superseded where noted above)

The existing application has been extended and tested, not replaced. The original Instructions-tab screenshot was not found; [the requirements audit](REQUIREMENTS_AUDIT.md) maps the requirements that could be recovered and identifies incomplete items. Full compliance and real-world accuracy are not claimed.

## Launch tomorrow

Reuse an already healthy server rather than starting a duplicate. The backend and Vite development server were running at the end of this work.

Backend, PowerShell terminal 1:

```powershell
cd D:\Coding\classroom-insight
.\.venv\Scripts\python.exe -m backend.app
```

Frontend, PowerShell terminal 2:

```powershell
cd D:\Coding\classroom-insight
npm run dev
```

Open `http://127.0.0.1:5173/`. Alternatively, the production bundle was built successfully and Flask alone serves it at `http://127.0.0.1:5000/`. Rebuild with `npm run build` after future frontend changes. Keep to one hostname during login; `localhost` and `127.0.0.1` do not share cookies.

Existing dependencies and `.venv` were reused; no packages or models were installed. For clean-machine setup, follow [README](../README.md#getting-started). The current local environment can process supported video and PCM WAV without an external AI service. FFmpeg was not discoverable, so video audio extraction and non-WAV audio are unavailable unless FFmpeg is separately provided. A separate synchronized PCM WAV is supported.

Documented demo login: `instructor@classroom.demo` / `ClassroomDemo!2026`, unless locally overridden. These are explicitly public demo credentials, not real employee credentials. Use **Employee Login** on the homepage, then sign out through the dashboard. Do not expose real environment values during evaluation. No `.env` changes were made.

## What was added

- **Timestamped attendance:** new confirmations store UTC confirmation/update times, source and per-student status history. Manual updates validate the complete batch before writing. Existing unknown timestamps remain blank rather than being invented.
- **Local frontal-face observation:** bundled OpenCV Haar face/eye cascades, separate from the existing HOG person detector. Tracks use conservative one-to-one IoU matching; ambiguous matches and missed detections break continuity. IDs are anonymous and recording-local.
- **Sustained-presence review:** at least three consecutive sampled detections spanning 20 seconds, with sampling no slower than 10 seconds. Only a qualified track with retained original media can be reviewed. An instructor must independently identify a roster student and explicitly attest before attendance is written. Exact retries are idempotent; a track cannot be assigned to two students. No automatic recognition or identity inference.
- **Movement and limited pose:** face-box motion in face-widths/second, sampled low-motion spans and conditional eye-line roll. No calibrated yaw/pitch, gaze or attention estimation.
- **Audio indicators:** sound energy/active intervals, bouts and bout rate, plus a clearly labelled speech-like heuristic. Noise/music/tones can trigger the heuristic; it does not establish speech, speaker identity or classroom interaction understanding.
- **Timestamp-aligned multimodal activity:** windowed visual/sound fusion with displayed formula, null missing signals and coverage. Separate analyses from the same session can be combined with an instructor-reviewed offset. Original analyses are preserved and provenance is retained.
- **Integrated UI and reports:** attendance history, original recording review, anonymous track review, activity charts/coverage, separate-recording alignment, face observation preference, CSV timestamps and JSON attendance/history. Private face previews are excluded from JSON reports and removed when original media is deleted.
- **Offline advice:** deterministic recommendations include missing-signal context and use actual timestamps for low-activity intervals. The existing optional Gemini paths remain; no raw faces/media or student identifiers are added to their summaries.

## Five-minute evaluator walkthrough

1. Open the homepage and its clearly labelled illustrative preview. Open Employee Login and sign in with the documented demo account. Existing Overview, Attendance, Sessions, Engagement Analytics, Recommendations, Students, Reports and Settings remain available.
2. Review existing sample sessions without resetting them. Old saved analyses do not acquire new observations retroactively. For a real demonstration, create a separately named evaluation session and appropriate demonstration roster, using fictional identifiers. Manual attendance confirmation displays its timestamp and change history; no recording is required for manual attendance.
3. For new analysis, obtain an appropriately consented recording in advance. Use a short (at least 25 seconds), stable, frontal-face video and a 2–10 second sampling interval with face observations enabled in Settings. Upload through Sessions and wait for processing. Show face/person counts separately, scene change, any anonymous tracks and method limitations. A zero-face result is valid and must not be represented as successful detection of a person. No positive-face classroom fixture was available during verification.
4. If a track qualifies, open its original recording and independently verify the intended roster student before using the explicit identity checkbox. Qualification is sampled continuity, not continuous proof of presence or face recognition. Browser support for AVI/MKV playback varies; use a browser-compatible video or review the original in a compatible local player. Do not confirm from a thumbnail alone. Manual attendance remains available if detection fails.
5. For audio without FFmpeg, upload a synchronized PCM WAV to the same real session. In Engagement Analytics, open **Combine separate video and audio recordings**, choose the two analyzed sources, set the correct offset (positive = audio starts later), attest alignment, and create the combined analysis. Show the experimental index, formula and coverage; explain that sound and motion do not prove engagement. Without audio, the index explicitly uses only the available visual signal.
6. Generate local recommendations, show their evidence/source, then export attendance CSV and the full JSON report. JSON includes attendance/history and numerical observations, not face previews. Sign out and verify that opening `/app` requires sign-in again.

The consultation form and readiness brief remain available. Review a consultation without submitting unnecessary enquiries. Gemini generation is optional and may fail because of network, access or quota; do not present sample text or local rules as a live Gemini response.

## Verification actually executed

All commands used the exact project directory. No tests used the existing application database.

```powershell
cd D:\Coding\classroom-insight
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'
.\.venv\Scripts\python.exe -B -m pytest -p no:cacheprovider --basetemp=data/submission-pytest-20261029-04 -q
npm test -- --maxWorkers=1
node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json
npm run build
```

- Backend: **65 passed in 8.37s**, including 20 new observation/attendance/fusion/integration tests.
- Frontend: **26 passed across four files in 15.61s**. These are React/JSDOM tests, with mocked network/charts where declared.
- TypeScript: passed, exit 0, no diagnostics.
- Production build: passed, 2,632 modules transformed; Vite build reported 860ms (the complete command also includes TypeScript).
- `git diff --check`: passed. Git emitted line-ending normalization notices, not whitespace errors.
- Actual backend startup: successful; read-only health and SPA route requests returned 200. HTML delivery alone is not a browser render test.
- Existing-data preservation: all ten original tables retained identical original-column row counts/content digests after migration/startup. Existing 12 students, 6 sessions, 72 attendance entries, 6 analyses and 19 recommendations were preserved; other original tables were also unchanged. New history starts empty; legacy confirmation timestamps remain null.

The real HTTP integration test (`tests/test_observations.py::test_real_http_async_upload_fusion_export_and_logout`) runs an isolated local server, authenticates with cookies, uploads generated AVI/WAV media, polls actual background workers, combines sources, retrieves protected media, verifies attendance was not inferred, generates local advice without a key, exports CSV, queries analytics and signs out. It proves API/decoder/worker integration on **synthetic** media, not real classroom accuracy or browser end-to-end behavior.

One early new motion test exposed a normalization error, which was corrected. One earlier parallel frontend run timed out on the existing navigation test; serial runs pass without changing the timeout or weakening assertions. The final results above supersede those intermediate runs. For future test reruns choose a fresh `--basetemp` suffix: pytest clears an existing base-temp directory.

## Verification boundaries and demo risks

- **Browser:** the available browser tool reported `Browsers: Error: Local browser use is disabled in Work settings` and no browser targets. No permission bypass was attempted. Native desktop/mobile layout, playback, print/download and screen-reader checks remain manual.
- **Positive face/pose validation:** bundled detectors execute, but positive face/eye fixtures are mocked. Synthetic blank video correctly produces no faces. No consented real classroom fixture or accuracy labels were available. Frontal Haar can miss small, side-facing or occluded faces, and IoU tracks can fragment or switch apparent identity.
- **Incomplete ML scope:** full head pose, persistent identity recognition, validated speech VAD, speaker diarization and student-level engagement are not implemented. The classroom index is an explainable experimental activity heuristic, not a validated attention/learning/engagement measure. Its 10% visual normalization and thresholds are not learned or calibrated.
- **Media:** codec support depends on the installed OpenCV/browser builds. Missing FFmpeg means video audio extraction is unavailable here. Separate audio alignment is instructor-supplied; overlapping time windows do not prove that two recordings captured the same lesson.
- **Gemini:** no live generation request was made in this phase. Existing provider/schema/error paths were tested with mocks; missing-key/local fallback was exercised over real HTTP. Previous documentation may contain historical provider results; those are not fresh verification of this update.
- **Deployment:** demo authentication is shared, local and not institutional security. History uses a shared demo actor, is not immutable, and the API currently returns only the latest 500 changes per session. No real-world accuracy, latency, concurrency, accessibility certification or production readiness is claimed.

## Data preservation and migration

The change is additive. On first startup, `migrate_attendance` backed up the existing database before adding three attendance columns. It did not rewrite attendance statuses or fabricate past timestamps. The new history table is separate. Migration is idempotent and tested, including backup contents.

Local pre-migration backup:

`data/backups/classroom-before-attendance-history-07de2f27f7b548db82f01d0185048ae4.sqlite3`

Keep this private with the database and media. Do not publish it, and do not restore over a running server or newer records. Backups can retain prior sensitive data; there is no automatic retention service. `.env`, uploads, private data and test artifacts remain ignored by Git. No reset, reseed, package installation, commit, push or deployment was performed. The existing Vite process was reused; only the backend process started by this task was restarted to load final code.

## Exact changed files

New:

- `backend/observations.py`
- `src/Observations.tsx`
- `src/Observations.test.tsx`
- `tests/test_observations.py`
- `docs/SUBMISSION_STATUS.md`

Modified:

- `backend/analysis.py`
- `backend/app.py`
- `backend/db.py`
- `backend/recommendations.py`
- `backend/capabilities.json`
- `src/pages.tsx`
- `src/types.ts`
- `README.md`
- `docs/API.md`
- `docs/ARCHITECTURE.md`
- `docs/REQUIREMENTS_AUDIT.md` (already untracked before this phase; its historical audit was preserved)

Ignored generated effects: rebuilt `dist/` and TypeScript build information, isolated test media/databases under `data/submission-pytest-*`, and the preserving application-schema migration/backup above. Dependency manifests, lockfiles, existing tests and environment configuration were not changed.

## AI Provider Manager — 30 October 2026

Added the two-provider Settings workflow, Windows Credential Manager storage, single persisted provider activation, real generation tests, safe errors, Groq model discovery, and unified recommendations/readiness generation. No original classroom records or `.env` were changed; QA uses a separate snapshot and mock-test databases. No schema migration was required.

Run from `D:\Coding\classroom-insight`: install requirements in `.venv`, then `.\.venv\Scripts\python.exe -m backend.app`; in another terminal run `npm run dev`. In Settings, save a key, save a valid model, test, then enable. Both-off selects local recommendations. Existing `.env` Gemini remains disclosed development fallback; it is not automatically migrated.

Real Gemini fixed-prompt generation passed at 16:21:01 IST with HTTP 200 and verified status retained by GET. Real Windows vault lifecycle/switching tests passed with fictional credentials, which were deleted afterward. Groq real generation was not run (no credential/model). New Settings browser checks are pending because the tool denied local browser access. See [security and verification notes](AI_PROVIDER_SECURITY.md) for exact scope and limitations.

### Final checks for the provider-manager phase

Executed from `D:\Coding\classroom-insight` on 30 October 2026:

- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'; .\.venv\Scripts\python.exe -B -m pytest -p no:cacheprovider --basetemp=data/provider-tests-04 -q` — **112 passed in 16.40s**.
- `npm test -- --maxWorkers=1` — **51 passed, 6 files**.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json` — passed.
- `npm run build` — passed, 2,635 modules transformed.
- `.\.venv\Scripts\python.exe -m pip check` — no broken requirements.
- `.\.venv\Scripts\python.exe -B scripts/verify_provider_manager.py --qa-database-confirmed` — real HTTP Gemini generation and real Windows vault lifecycle passed on the disposable QA snapshot. This script must never target an existing production database; it does not migrate the environment key.
- `git diff --check` — passed (Git emitted line-ending normalization warnings). Configured secret-value scan of changed/untracked files and built assets passed. Original eleven table fingerprints and `.env` hash matched the baseline. No migration, reset, reseed, commit or push.
- Browser interaction: not executed after access denial. Groq genuine generation: not executed without credentials/model. Neither is counted as passed.

Files changed in this phase (pre-existing unrelated changes retained):

- New: `backend/providers.py`, `src/AIProviders.tsx`, `tests/test_providers.py`, `scripts/verify_provider_manager.py`, `docs/AI_PROVIDER_SECURITY.md`.
- Updated backend: `backend/app.py`, `backend/db.py`, `backend/portal.py`, `backend/readiness.py`, `backend/recommendations.py`.
- Updated frontend/tests: `src/pages.tsx`, `src/public/PublicHome.tsx`, `src/public/Readiness.tsx`, `src/App.test.tsx`, `src/gemini.test.tsx`, `tests/test_portal.py`.
- Updated dependencies/scripts: `requirements.txt`, `requirements.lock.txt`, `scripts/verify_readiness.py`.
- Updated documentation: `README.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/REQUIREMENTS_AUDIT.md`, `docs/SUBMISSION_STATUS.md`.
