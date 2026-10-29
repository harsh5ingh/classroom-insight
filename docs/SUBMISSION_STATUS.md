# Classroom Insight — submission status

Updated 29 October 2026. Project: `D:\Coding\classroom-insight`.

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
