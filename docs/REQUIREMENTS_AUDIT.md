# Classroom Insight — Requirements Audit

## Submission reassessment — 29 October 2026

**This reassessment is the current state.** The original pre-implementation audit is retained below as a historical appendix; its classifications, execution restrictions and “Not run” statements describe that earlier audit, not this implementation phase. The current user request authorized source/test changes and a necessary, preserving schema update. This is not a claim that the original assignment is fully complete.

### 1. Scope and requirements provenance

Project: `D:\Coding\classroom-insight`. The Instructions-tab screenshot remains unavailable. The R01–R40 identifiers below retain the recoverable user/document requirements from the original audit; no screenshot-only requirements, required algorithms or acceptance thresholds have been invented. This phase adds bounded functionality to the existing application, without replacing its architecture or installing packages.

### 2. Environment and preservation

The existing Python virtual environment, OpenCV cascades, NumPy, Flask, SQLite, React and Vite were reused. FFmpeg, MediaPipe and a learned speech detector were not available for this implementation. No model was trained or downloaded. At the start of this implementation phase, the only reported Git change was the pre-existing untracked `docs/REQUIREMENTS_AUDIT.md`.

`backend/db.py::migrate_attendance` makes a SQLite backup before transactionally adding `confirmed_at`, `updated_at` and `source` to existing attendance. `attendance_changes` is an additive table with foreign keys and a unique analysis/track review index. The actual startup migration ran successfully. Existing attendance timestamps remain null, source is `legacy`, and no historical confirmations were fabricated. All ten original tables retained identical row counts and SHA-256 content fingerprints over their original columns after startup. Existing data was not reset or reseeded. Tests use separate databases and media under project-local temporary directories. The application now runs at port 5000; the existing Vite process at 5173 was reused.

### 3. Current requirements traceability matrix

“Implemented and verified” below is limited to the stated automated/direct-execution evidence. It does not mean classroom accuracy, production security or real-browser validation.

| ID | Requirement summary | Current classification | Evidence / remaining boundary |
|---|---|---|---|
| R01 | Face detection | Implemented but not fully verified | Bundled Haar executes on synthetic blank video; positive detections tested with mocks, not real faces. |
| R02 | Persistent face/person tracking | Implemented but not fully verified | Recording-local conservative IoU tracks, tested gaps/ambiguity; no re-identification or cross-recording identity. |
| R03 | Sustained identity-linked attendance | Partially implemented | Multi-sample gate plus explicit instructor identity confirmation; automatic identity matching deliberately absent. |
| R04 | Per-student attendance timestamps/history | Implemented and verified | Migration, transactional writes, idempotent updates, history and CSV tests. Legacy times remain unknown. |
| R05 | Timestamped event logs | Implemented and verified | Existing operational events plus per-student changes exercised through API/HTTP tests; shared demo actor, not immutable institutional audit logging. |
| R06 | Head-pose estimation | Partially implemented | Conditional two-eye roll estimate only; no calibrated yaw/pitch/gaze. |
| R07 | Movement analysis | Partially implemented | Face-box displacement and scene change; camera motion not separated from human movement. |
| R08 | Inactivity detection | Partially implemented | Consecutive sampled low-motion intervals; no internal attention inference and no bridging missing-frame gaps. |
| R09 | Audio energy/activity | Implemented and verified | Streaming PCM energy, intervals and bouts; synthetic WAV/real decoder and HTTP worker tests. |
| R10 | Speech detection | Partially implemented | Explicitly labelled spectral/energy/zero-crossing heuristic; no validated speech VAD. |
| R11 | Classroom interaction analysis | Partially implemented | Sound bouts and bout rate; no speaker separation, turn-taking or semantic understanding. |
| R12 | Audio-video fusion | Implemented and verified | Actual timestamp alignment, missing-signal coverage, formula and same-session combination API tested with synthetic inputs and HTTP uploads. Real recording alignment remains instructor-supplied. |
| R13 | Student-level engagement scores | Not implemented | Anonymous tracks cannot establish student attention; no individual engagement model. |
| R14 | Classroom-level engagement scores | Partially implemented | Explainable experimental observable activity index; not a validated engagement measurement. |
| R15 | Local evidence-linked suggestions | Implemented and verified | Rules, missing-signal advice, actual timestamp gap handling and offline HTTP fallback. |
| R16 | Gemini teaching suggestions | Implemented but not fully verified | Existing provider path retained; mocked failures/schema checks and local fallback pass. No fresh live Gemini call in this phase. |
| R17 | Institutional readiness brief | Implemented but not fully verified | Existing structured provider path and authoritative capability catalogue retained; mocked provider tests pass, native browser/live provider not rerun. |
| R18 | Student CRUD/search/validation | Implemented and verified | Existing backend CRUD tests and mocked frontend registration flow pass; not a native-browser claim. |
| R19 | Session CRUD/roster | Implemented and verified | Backend roster snapshot/explicit-sync tests and frontend creation test pass. |
| R20 | Attendance rates/history | Implemented and verified | Existing rate tests plus new atomic validation, timestamps, review guards and history tests. |
| R21 | Eight operational screens | Implemented but not fully verified | All-route React test passes; actual responsive layout not inspected this phase. |
| R22 | Analytics/filtering/missing states | Implemented but not fully verified | API/HTTP aggregation and component/formula tests pass; interactive chart/browser behavior not verified. |
| R23 | CSV/JSON/print reports | Implemented but not fully verified | CSV HTTP/unit tests and JSON component export tests pass; physical print/PDF and native download behavior not verified. |
| R24 | Local/offline processing | Implemented and verified | Local WAV/video processing and missing-key suggestions work in isolated HTTP test; no PWA or offline browser cache is claimed. |
| R25 | External AI failure handling | Implemented and verified | Existing missing-key/provider/quota/timeout/schema tests pass with mocks; service outage behavior not simulated against the live provider. |
| R26 | Upload formats/validation | Implemented but not fully verified | Invalid/oversized inputs and WAV/AVI workers tested; all codec/container combinations not verified. |
| R27 | Async progress/failure/restart | Implemented but not fully verified | Real HTTP upload-to-completion exercised; no process-kill recovery/concurrency stress test. |
| R28 | Preferences/media deletion | Implemented and verified | Face opt-out, authenticated playback, deletion and thumbnail removal covered in backend tests. |
| R29 | Validated persistent API | Implemented and verified | Temporary-DB integration tests, additive migration/backup/idempotency and actual existing-record preservation checks. Not multi-user scale validation. |
| R30 | Honest source/identity/metric labels | Implemented and verified | Sample separation tests, review gating and formula/source component assertions; no fabricated attendance or private-face export. |
| R31 | Public homepage/preview | Implemented but not fully verified | Existing public component tests pass; no fresh browser visual inspection. |
| R32 | Demo login/session/sign-out | Implemented but not fully verified | Cookie/guard tests, mocked UI flows and actual HTTP login/logout pass; production auth is absent by design. |
| R33 | Institutional enquiry persistence | Implemented but not fully verified | SQLite/idempotency/restart and multi-step component tests pass; no live public submission created in this phase. |
| R34 | Credential/access/privacy controls | Implemented but not fully verified | Existing origin/cookie/error tests plus protected media and export exclusions; no independent security review or real employee authorization. |
| R35 | Real-world accuracy | Not implemented | No labelled classroom corpus, accuracy protocol, sensitivity/precision or fairness evaluation. |
| R36 | Reliability/edge cases | Partially implemented | 65 backend and 26 frontend cases pass; occlusion, identity swaps, noisy classrooms and sustained load remain untested. |
| R37 | Performance/resource behavior | Partially implemented | Existing size/duration/worker limits, bounded samples/tracks/windows; no representative latency/memory/concurrency benchmark. |
| R38 | Accessibility/responsiveness | Implemented but not fully verified | Existing keyboard/modal component tests and build pass; no native mobile/screen-reader/browser checks this phase. |
| R39 | Setup/architecture/verification docs | Partially implemented | Updated README/API/architecture/capabilities and submission guide; original Instructions screenshot still missing. |
| R40 | Regression/integration/end-to-end checks | Partially implemented | Full suites, type check/build and real HTTP synthetic-media flow; native browser + real classroom end-to-end validation missing. |

### 4. Detailed implementation evidence and test mapping

The historical appendix retains exact paths/names for unchanged features. The following additions supersede its source findings for the changed requirements. All test names here exist in the source; the complete backend and frontend suites were executed in this phase.

**R01–R03: faces, tracks and reviewed attendance.** `backend/observations.py::FaceObserver.observe` uses OpenCV's bundled `haarcascade_frontalface_default.xml` with 640px maximum frame extent and a 28px minimum face size. `PresenceTracker.update/result` uses one-to-one IoU association (0.3 minimum), stops continuity after misses/ambiguity, and caps tracks at 100. Qualification requires at least three consecutive detections spanning at least 20 seconds, at sample spacing no greater than 10 seconds. It is evidence between samples, not continuous physical presence. `backend/analysis.py::analyze_media` stores separate `faces` and HOG person counts. `backend/app.py::confirm_presence` (`POST /api/sessions/<id>/presence-confirmations`) requires a real completed same-session analysis, retained original recording, qualified track, session roster membership and explicit `identity_confirmed: true`. The server prevents reassigning an already reviewed track to another student and treats exact retries idempotently. `src/Observations.tsx::PresenceReview/TrackReview` require a roster selection and unchecked identity attestation; original video is available through `review_media` (`GET /api/analyses/<id>/media`). No detector automatically writes attendance.

Tests in `tests/test_observations.py`: `test_bundled_face_model_executes_without_fabricating_faces`, `test_face_observer_tracks_mock_detections_and_roll`, `test_track_requires_multiple_samples_and_twenty_seconds`, `test_track_missing_frame_ambiguity_and_sparse_sampling_break_presence`, `test_presence_review_needs_identity_qualification_roster_and_media`, `test_single_frame_track_never_confirms_attendance`, `test_presence_cannot_link_a_track_to_two_students_or_another_session`, `test_media_review_requires_auth`. Frontend tests in `src/Observations.test.tsx`: `presence review requires a roster choice and explicit identity confirmation`, `single-frame or deleted-media tracks offer no attendance confirmation`. These prove calculation/authorization/form gates, not successful real-classroom face identification. Haar can miss side-facing, small, seated or occluded faces; tracks can fragment or switch apparent identity. The instructor must verify independently from the recording and their roster knowledge. Cross-session re-identification is absent.

**R04–R05, R18–R20, R29: persistence and attendance.** `backend/db.py::record_attendance` writes status, UTC confirmation/update time, source and change history in the caller's transaction. `migrate_attendance` backs up first and leaves legacy times null. `backend/app.py::update_attendance` validates the entire batch before writing and rejects duplicate students. `attendance`, `student_write` and `export` expose timestamps/history. `src/Observations.tsx::AttendanceHistory` and `src/pages.tsx::Attendance/Students` show the records. History retrieval returns the latest 500 changes; the table stores all changes until student/session deletion. This is operational history with actor `Demo instructor`, not distinct accountable employee identities.

New tests: `test_additive_migration_backs_up_preserves_and_is_idempotent`, `test_attendance_timestamp_history_csv_and_duplicate_batch`, `test_attendance_invalid_batch_does_not_partially_write` in `tests/test_observations.py`; `attendance history exposes timestamp source and status changes` in `src/Observations.test.tsx`. Existing `tests/test_api.py::test_student_crud_and_validation`, `test_session_validation_and_attendance_math`, `test_roster_is_snapshot_with_explicit_sync` and frontend `register student submits validated fields through backend` / `new session form sends title, date and instructor` in `src/App.test.tsx` also pass. Timestamp means instructor confirmation time, not inferred arrival time.

**R06–R08: pose, movement and inactivity.** `FaceObserver.observe` optionally runs the bundled eye cascade; exactly two sufficiently separated eye candidates yield an eye-line roll angle. Both coordinate axes use the same image-width scale so motion is measured in face-widths/second. `PresenceTracker.update` measures box-center displacement and consecutive sampled still intervals below 0.02 face-widths/second. `backend/recommendations.py::summarize` now uses actual frame timestamps for low scene-change runs and rejects gaps above 1.5 times nominal spacing. Tests `test_track_motion_roll_and_cap`, `test_face_observer_tracks_mock_detections_and_roll`, and `test_timestamp_gaps_do_not_extend_low_activity_runs` verify deterministic geometry/gaps. Eye pairs are mocked positive detections. There is no 3D face landmark model, calibrated yaw/pitch or gaze, camera-motion correction, attention inference or pose accuracy measurement.

**R09–R11: audio.** `backend/analysis.py::audio_metrics` retains streaming RMS analysis and adds active bout counts/rate plus a 30ms energy, zero-crossing and speech-band heuristic. Returned `speech_like_fraction` is explicitly not verified speech; tones/music/noise can satisfy it. `src/pages.tsx::AnalysisDetail` shows calculated outputs and caveats. `tests/test_observations.py::test_audio_heuristic_is_not_claimed_as_speech_and_tracks_bouts` exercises silence/tone transitions; existing `tests/test_api.py::test_real_audio_analysis_and_deletion` and `test_empty_and_truncated_wav_are_rejected` exercise actual decoding of synthetic WAVs. No speaker identities, transcription, conversational turns, learner participation rate or language understanding are implemented. PCM WAV works without FFmpeg; extraction/other audio codecs need available FFmpeg.

**R12–R14, R22: fusion and score.** `backend/observations.py::fuse_signals` intersects actual observation intervals with time windows. Visual activity is `min(scene change / 10%, 1)`; audio is active duration divided by available audio duration. The index is the equal mean of available modalities, then a duration-weighted window mean on a 0–100 scale. Missing modalities remain null and coverage is exposed; large video gaps and the unsampled tail are not extrapolated. The 10% scale is a documented heuristic, not learned/calibrated. `backend/app.py::combine_recordings` (`POST /api/sessions/<id>/fusion`) combines two real completed original analyses from one session with a finite offset and actual joint overlap, stores a derived result with provenance, and preserves original analyses. No face thumbnails/tracks are duplicated into that derived analysis. `src/Observations.tsx::FusionForm/FusionPanel` require explicit alignment review and show formula, source coverage, chart and caveats.

Tests: `test_fusion_alignment_missing_signals_and_gaps`, `test_fusion_rejects_nonoverlapping_sources_even_in_same_window`, `test_combined_api_requires_same_session_and_preserves_sources`, `test_new_video_pipeline_returns_face_and_fusion_metadata` in `tests/test_observations.py`; `combining recordings requires reviewed alignment and sends the supplied offset`, `activity index exposes formula limitations and missing-signal coverage` in `src/Observations.test.tsx`. The HTTP worker test described below exercises decoded video/audio to derived analysis. This is genuine arithmetic fusion of measured signals on synthetic media, not a validated cognitive or educational engagement score. Student-level engagement remains absent. Actual lesson alignment is not automatically verified; partial window coverage must be reviewed before comparing sessions.

**R15–R17, R24–R25: recommendations and offline operation.** `backend/recommendations.py::summarize/local_rules/generate` add aggregate fusion/coverage and sound-bout context without sending faces, roster identities or media to Gemini. Missing joint coverage produces local advisory text. Existing optional Gemini generation and validated institutional readiness remain intact; `backend/capabilities.json` now describes the bounded observations. Existing `tests/test_api.py::test_missing_key_and_recommendation_fallback`, `test_provider_failure_uses_local_rules`, `test_rule_thresholds` and `tests/test_portal.py::test_structured_generation_and_authoritative_capabilities`, `test_invalid_model_output_is_never_displayed`, `test_provider_access_and_timeout_errors_are_transparent`, `test_quota_failure_sanitized_and_rate_limited` pass. Provider tests are mocks, not a fresh Gemini success. The real HTTP test explicitly removes the key and verifies local recommendations. No live Gemini request was executed in this phase, and no success is claimed from configuration alone.

**R21–R23, R26–R28, R30, R40: UI, export and integrated execution.** `src/pages.tsx::AnalysisDetail/Analytics/Reports/Settings`, `src/types.ts` and `src/Observations.tsx` connect the new fields to existing flows. JSON export now obtains attendance/history and removes face previews while retaining measurements; CSV includes confirmation/update/source columns. Browser print remains the existing implementation. Face observation preference is optional and persisted. Removing media also removes retained previews from its analysis. Tests `test_face_preferences_can_disable_observations` and `test_presence_review_needs_identity_qualification_roster_and_media` cover opt-out/deletion. Frontend tests `JSON report loads attendance history and excludes private face thumbnails` and `report download failure exposes a recoverable error` mock fetch/download; no native save dialog was exercised. Existing upload/route/error tests continue to pass.

`tests/test_observations.py::test_real_http_async_upload_fusion_export_and_logout` starts a real local Werkzeug HTTP server against an isolated temporary database, signs in with a cookie, creates a synthetic test session, uploads actual generated AVI and PCM WAV bytes, polls real background workers to completion, combines signals, retrieves authenticated original media, verifies attendance stays unconfirmed, requests local recommendations with no key, exports CSV, queries analytics and signs out. This provides real network/API/worker/decoder integration evidence, but it is not browser end-to-end or human classroom validation. Test media are a flat video and tone; zero faces are expected.

**R31–R34 and R38:** existing public/auth/enquiry source was preserved. The exact tests and source mappings in the historical evidence sections remain applicable; the full `tests/test_portal.py` and `src/public/PublicHome.test.tsx` were now run successfully. Fresh browser inventory returned **“Browsers: Error: Local browser use is disabled in Work settings”** with no browser targets. No workaround bypassed that permission. Therefore no fresh visual, mobile, native playback, native download, real screen-reader or browser-to-live-backend claim is made.

### 5. Executed checks

All commands ran from `D:\Coding\classroom-insight`. Test fixture files stay in project-local ignored `data/submission-pytest-*` directories and do not use the application's existing database.

- `$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD='1'; .\.venv\Scripts\python.exe -B -m pytest -p no:cacheprovider --basetemp=data/submission-pytest-20261029-04 -q` — **65 passed in 8.37s**. Includes 20 new observation tests and the actual HTTP asynchronous pipeline. No skipped/failing cases reported.
- `npm test -- --maxWorkers=1` — **26 passed in 15.61s**, four files, after final formatting. Component tests use JSDOM and mocked requests/charts where declared. An earlier parallel run hit an existing navigation test's 5-second timeout; serial runs passed without weakening assertions or raising timeouts.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json` — passed; final validation results are also recorded in `docs/SUBMISSION_STATUS.md`.
- `npm run build` — passed; 2,632 modules transformed and Vite reported 860ms, following TypeScript compilation. Produces the Flask-served SPA. This proves compilation/bundling, not browser behavior.
- Actual application startup and read-only HTTP checks: health, public homepage and `/app`, `/app/attendance`, `/app/analytics` on port 5000 returned 200. Homepage and proxied health on port 5173 also returned 200. SPA HTML success does not prove those screens rendered in a native browser. Sandboxed socket and live SQLite WAL access checks were initially denied; the authorized read-only retries succeeded.
- SQLite preservation check compared all ten original tables' original-column row counts/content digests to the pre-startup baseline: identical. New history table was empty after migration and all 72 legacy confirmation times remained null.
- Native browser and real classroom recording validation: **Not run**, for the limitations above. Live Gemini generation: **Not run in this phase**.

### 6. Synthetic versus real-world validation

OpenCV and WAV decoding genuinely execute; their fixtures are synthetic pixels/waveforms. Positive face/eye observations and identity-review analysis records are controlled mocks. The HTTP integration uses actual network requests, worker threads and isolated SQLite, but has no real people or speech. Frontend tests execute React in JSDOM, not a layout-capable browser. No dataset, consented classroom video, labelled speech, human pose ground truth or accuracy/performance experiment was supplied. Consequently none of these passes establishes recognition accuracy, identity continuity in a crowded room, genuine interaction understanding or educational validity of the score.

### 7. Missing/incomplete behavior

Automatic verified identity, cross-session person re-identification, calibrated 3D head pose, validated speech VAD, speaker diarization, student-level engagement, and validated classroom engagement remain absent or partial. Separate recording synchronization needs instructor review. All codecs, camera changes, occlusion, room noise, browser playback and concurrent long recordings are not comprehensively validated. History is bounded to the latest 500 entries per API retrieval, not paginated. Demo login remains shared and intentionally unsuitable as real institutional authentication. Face previews are local sensitive data; existing backups can retain older information until explicitly managed. Existing analyses are not silently reprocessed; new fields appear on new uploads.

### 8. Prioritized remaining implementation gaps

- **P0 — Before real institutional use:** replace shared demo access with accountable authentication/authorization and a reviewed data/retention policy. Do not enable automatic identity attendance from these tracks or relabel the activity index as attention. No known failing automated submission-blocking correctness case remains, but this is not a security certification.
- **P1 — Core validation/model gaps:** evaluate positive face detection and continuity on consented labelled classroom recordings, including occlusion/crossings; supply a measured accuracy report and tune thresholds only from that evidence. Add calibrated landmarks/pose only if required; retain null values when unavailable. If verified speech/interaction is mandatory, integrate an appropriate VAD and speaker-turn model with labelled evaluation rather than treating energy as speech. Student engagement cannot be supplied honestly by renaming this index; it needs an agreed operational definition and validation protocol.
- **P2 — Reliability/usability:** perform real desktop/mobile browser flows, original-media playback and downloads; add history pagination, concurrent/retry stress tests, crash/restart tests, codec matrix and representative memory/latency measurements. Add consented demonstration recordings before relying on the positive-face demo. Review small/partial coverage before session comparisons.
- **P3 — Additional validation:** recover the original Instructions screenshot; map its exact thresholds and extra requirements. Validate separate-source alignment on timestamped recordings, benchmark alternate detectors if justified, and test accessibility with a screen reader. Execute a fresh live Gemini request when network/quota permit and record schema/content evidence separately from mocked tests.

### 9. Current conclusion

The application now includes local face observation/tracking, guarded sustained-presence review, timestamped attendance history, partial pose/motion/audio indicators and explainable timestamp-aligned activity fusion, integrated into existing analytics, recommendations and exports. The automated evidence is materially stronger. Full original-brief compliance, real-world accuracy, complete head pose, individual engagement and production readiness are **not** established. See `SUBMISSION_STATUS.md` for the evaluator walkthrough, startup commands and final run results.

---

## Historical appendix — original pre-implementation audit

**Everything below describes the earlier audit before this submission implementation. Its old classifications and test execution statements are retained for traceability and superseded by the current reassessment above.**

## 1. Audit scope and date

- **Audit date:** 29 October 2026 (Asia/Calcutta).
- **Project root:** `D:\Coding\classroom-insight`.
- **Only authorized output:** `D:\Coding\classroom-insight\docs\REQUIREMENTS_AUDIT.md`.
- This is an implementation and evidence audit. It does not implement missing features, change tests, initialize the application, modify records, or certify production suitability.

### Requirements provenance and missing source

**The Instructions-tab screenshot was not supplied with this request and was not recovered from this project.** File inventory searches, including hidden project files but excluding dependency/build/Git internals, found eleven product-gallery PNGs under `docs/screenshots/`; no Instructions/requirements screenshot, original brief, or transcription was found. Relevant requirements-related text was read in `README.md`, `docs/PROJECT_REPORT.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/VERIFICATION.md`, and `backend/capabilities.json`.

Those documents describe the implemented local demonstration and are **not a recoverable copy of the original Instructions tab**. They cannot establish that its requirements were fulfilled.

This audit therefore distinguishes:
- **U:** requirements expressly listed in the current audit request.
- **D:** additional capabilities/objectives recoverable from the project's README, report, API documentation, and maintained capability catalogue.
- **U+D:** both sources address the area, sometimes with substantially different scope.

The summaries below are faithful descriptions of those recoverable requirements, **not quotations from the missing screenshot**. Original wording, acceptance thresholds, any prescribed models, timing/accuracy targets, scoring formulas, and additional screenshot-only requirements remain unknown. No percentage of compliance with that screenshot can honestly be calculated. Obtain that source and map any additional requirements before treating this as an exhaustive original-brief audit.

### Classification rules

Each row has exactly one classification. “Implemented and verified” applies only to the bounded behavior described and evidence actually observed; it does not imply real-world validity. “Implemented but not fully verified” means the code path exists but relevant execution, coverage, or end-to-end validation is incomplete. “Partially implemented” means a material part of the requirement is missing. “Not implemented” means no functional implementation was found in the inspected source.

Historical pass totals are identified separately and are not silently treated as fresh test results. A static code finding, mocked test, HTTP success, and real-browser end-to-end test are different evidence levels.

## 2. Project environment and repository state

- Every project command used the explicit working directory `D:\Coding\classroom-insight`; `Get-Location` confirmed it.
- Repository HEAD: `9fffbf4958ae5029ce80d1cf338d4e4a05a59612`.
- Initial verified `git --no-optional-locks status --short` output was empty: no pre-existing tracked modifications or untracked files were reported. Ignored local data and dependencies already existed.
- Initial sandboxed Git attempts returned “this operation must be run in a work tree” and “Permission denied.” A permitted read-only check outside that sandbox resolved access; no Git configuration was changed.
- Observed runtimes: Python **3.13.15**, Node **v26.7.0**, pytest **9.2.0**.
- Declared stack: React 19.3.1, React Router 7.18.5, Recharts 3.10.1, Vite 8.3.5, Tailwind 4.3.3, TypeScript 7.0.2; Flask/OpenCV/NumPy/python-dotenv/google-genai/Pydantic/pytest in `requirements.txt`. Declared versions do not prove every installed package is compatible. The installed compiler and selected Python imports did execute.
- FFmpeg was **not discoverable** through `shutil.which('ffmpeg')` in this audit environment.
- No application server was started, no live application API was called, and no browser workflow was executed during this audit.
- Source review covered all backend modules, both backend test files, the three frontend test files, route/data/form/chart components, public flows, shared options, relevant styling, and verification scripts.
- A read-only SQLite connection using `mode=ro&immutable=1` inspected schema metadata only. The ten user tables were `students`, `sessions`, `attendance`, `analyses`, `recommendations`, `settings`, `events`, `demo_sessions`, `institutional_enquiries`, and `public_rate_limits`. No rows containing personal details were printed.
- A baseline of 237 existing files covered root files, backend, frontend, tests, scripts, shared data, documentation, application data, built assets, Git metadata, and pytest cache. Dependency trees were not exhaustively hashed. No dependency/install commands were run.
- Full pytest fixtures use temporary SQLite databases/media, and smoke scripts mutate the live database. They were not run under the “only one file may change” restriction. Selected fixture-free tests disabled bytecode and pytest cache output.

## 3. Requirements traceability matrix

| ID | Origin | Requirement summary | Classification |
|---|---|---|---|
| R01 | U | Detect faces in classroom video | Not implemented |
| R02 | U | Track faces/people persistently across frames | Not implemented |
| R03 | U | Mark attendance using sustained, identity-linked presence | Not implemented |
| R04 | U | Timestamp individual attendance confirmations/history | Partially implemented |
| R05 | U+D | Maintain timestamped operational event logs | Implemented but not fully verified |
| R06 | U | Estimate head pose | Not implemented |
| R07 | U+D | Analyze movement | Partially implemented |
| R08 | U | Detect inactivity over time | Partially implemented |
| R09 | U+D | Process audio into energy and active intervals | Implemented and verified |
| R10 | U | Detect speech rather than arbitrary sound | Not implemented |
| R11 | U | Analyze classroom interaction/participation from audio | Not implemented |
| R12 | U | Fuse audio and video observations meaningfully | Not implemented |
| R13 | U | Compute student-level engagement scores | Not implemented |
| R14 | U | Compute classroom-level engagement scores | Not implemented |
| R15 | U+D | Produce evidence-linked local teaching suggestions | Implemented and verified |
| R16 | U+D | Generate teaching suggestions through Gemini | Implemented but not fully verified |
| R17 | D | Generate a grounded institutional readiness brief | Implemented but not fully verified |
| R18 | D | Register/edit/search students and validate identifiers | Implemented but not fully verified |
| R19 | D | Manage sessions and explicit roster membership | Implemented but not fully verified |
| R20 | U+D | Confirm attendance and calculate rates/history | Implemented but not fully verified |
| R21 | U+D | Provide the eight operational dashboard screens | Implemented but not fully verified |
| R22 | U+D | Display meaningful analytics with filters and missing states | Implemented but not fully verified |
| R23 | U+D | Export attendance and session reports | Implemented but not fully verified |
| R24 | U+D | Process locally and remain useful without external AI | Implemented but not fully verified |
| R25 | U+D | Fall back transparently when external recommendation AI fails | Implemented and verified |
| R26 | D | Validate media uploads and support stated formats | Implemented but not fully verified |
| R27 | D | Track asynchronous analysis progress/failure/restart states | Implemented but not fully verified |
| R28 | D | Configure analysis and delete locally retained media | Implemented but not fully verified |
| R29 | D | Persist records through validated Flask/SQLite APIs | Implemented but not fully verified |
| R30 | D | Separate sample data, measurements, identity and interpretation | Implemented but not fully verified |
| R31 | D | Provide the institutional homepage and interactive preview | Implemented but not fully verified |
| R32 | D | Support explicit demo login, refresh, protection and sign-out | Implemented but not fully verified |
| R33 | D | Validate and persist institutional enquiries idempotently | Implemented but not fully verified |
| R34 | D | Protect credentials, constrain access, and disclose privacy limits | Implemented but not fully verified |
| R35 | U | Establish real-world accuracy of attendance/engagement analysis | Not implemented |
| R36 | U | Validate reliability and important edge cases | Partially implemented |
| R37 | U | Establish performance and resource behavior | Partially implemented |
| R38 | D | Provide accessible, responsive, restrained UI behavior | Implemented but not fully verified |
| R39 | D | Supply accurate setup, architecture and verification documentation | Partially implemented |
| R40 | U+D | Verify regressions through meaningful automated and end-to-end checks | Partially implemented |

## 4. Detailed evidence for each requirement

Test names below are exact definitions confirmed in the source. Unless explicitly marked executed under C01–C06 in section 5, **execution status is Not run in this audit**. Historical suite totals cannot establish an individual test's current result.

### R01 — Face detection
**Classification: Not implemented.**

- Source: `backend/analysis.py::analyze_media` uses `cv2.HOGDescriptor`, `HOGDescriptor_getDefaultPeopleDetector`, and `detectMultiScale`. This is a pedestrian/person detector, not a face detector. No face model, facial landmarks, face crops, or face outputs were found.
- Tests: `tests/test_api.py::test_hog_can_run_on_synthetic_frame` concerns a blank synthetic frame and a zero **person** count. No face-detection test found. C04 also produced zero counts on a synthetic scene.
- What this proves: HOG execution does not satisfy face detection. Missing: a clearly scoped detector, face-specific output and evaluation on consented annotated inputs, if the original requirement indeed requires faces.

### R02 — Persistent face/person tracking
**Classification: Not implemented.**

- Source: `backend/analysis.py::analyze_media` discards detected boxes after computing `len(boxes)`. Output points contain only seconds, count and scene activity. There are no track IDs, association state, re-identification, trajectories or occlusion handling. `src/types.ts::Point` has the same limited contract.
- Tests: no tracking or identity-switch tests found. `test_hog_can_run_on_synthetic_frame` does not test tracking.
- Gap: persistent anonymous tracks and temporal association would require targeted additions and track-continuity evaluation. A track is still not a verified student identity.

### R03 — Sustained-presence attendance marking
**Classification: Not implemented.**

- Source: `backend/app.py::update_attendance` at `PUT /api/sessions/<int:session_id>/attendance` accepts explicit roster statuses. `backend/analysis.py::process_job` updates analyses/events only. There is no attendance dwell timer, minimum duration, identity linkage, entry/exit policy, or automatic marking.
- Tests: `tests/test_api.py::test_real_audio_analysis_and_deletion` asserts an upload leaves present count at zero; this uses a generated tone, not a real recording. `scripts/http_smoke.py::main` checks unchanged attendance after synthetic uploads, but was not run.
- The manual-only boundary is intentional and safer than assigning identity from anonymous counts. It does not fulfill a sustained-presence automation requirement. Agree identity verification, instructor review and timing semantics before adding such a workflow.

### R04 — Timestamped individual attendance
**Classification: Partially implemented.**

- Source: `backend/db.py::SCHEMA` and the read-only live schema show only `session_id, student_id, status` in `attendance`. Sessions have date/created_at. `update_attendance` overwrites status and emits one generic event.
- Tests: `tests/test_api.py::test_session_validation_and_attendance_math` checks status/history/rate, not per-person confirmation time or edit history. No test for timestamped attendance changes was found.
- Missing: confirmed_at/updated_at or an append-only change table with student/session keys, previous/new state, actor/source and time. Generic event time cannot reconstruct who was marked present, when each record changed, or how long a person was present.

### R05 — Timestamped event logs
**Classification: Implemented but not fully verified.**

- Source: `backend/db.py::now` returns UTC ISO timestamps; `event` inserts message, created_at and is_demo. `backend/app.py::analytics` returns the latest eight events; `src/pages.tsx::Overview` displays recent activity.
- Tests: `tests/test_api.py::test_demo_is_labelled_idempotent_and_separate` exercises demo lifecycle, but does not assert event chronology or contents. No dedicated event-log test found; Not run.
- Limit: generic messages have no subject IDs, actor or before/after values. Session edits/roster sync/settings updates do not all emit events. `src/api.ts::formatDate` is used for display, which renders day/month/year without the time of day. This is an activity log, not an auditable attendance ledger.

### R06 — Head-pose estimation
**Classification: Not implemented.**

- Source: `backend/analysis.py::analyze_media` performs grayscale differences and HOG counts; no landmarks, camera calibration, pose model, yaw/pitch/roll, or pose confidence exists. No pose field exists in the result/type contracts.
- Tests: no head-pose test found; Not run.
- Gap: add an explicitly scoped pose-estimation path and annotated pose validation if still required. Pose must not be relabelled as internal attention or motivation.

### R07 — Movement analysis
**Classification: Partially implemented.**

- Source: `backend/analysis.py::analyze_media` resizes grayscale frames to 160×90 and computes mean absolute pixel difference divided by 255, expressed as a percentage. `src/pages.tsx::AnalysisDetail` plots scene change.
- Tests: `tests/test_api.py::test_real_video_scene_change_and_disabled_detector` uses flat generated frames and asserts a large intensity change; Not run. C04 directly exercised the existing synthetic AVI with six sampled frames.
- What is verified: scene-level intensity change executes. Missing: person-specific motion, optical flow/trajectories, camera-motion separation, lighting robustness and annotated movement validation. Global brightness changes are not necessarily participant movement.

### R08 — Inactivity detection
**Classification: Partially implemented.**

- Source: `backend/recommendations.py::summarize` accumulates nominal `sample_seconds` while scene activity is below 3; `local_rules` suggests interaction at 120 seconds. There is no student-specific inactivity detector.
- Tests: `tests/test_api.py::test_rule_thresholds` passed in C01, but supplies a precomputed 180-second value; it does not test duration derivation. C05 directly probed `summarize`.
- Observed limitation: points at seconds 0 and 100 with nominal interval 10 and a low-change second sample report 10 seconds. Actual timestamp gaps are not used; skipped/irregular frames can distort the interval interpretation. No evidence establishes continuous inactivity between sparse samples.
- Needed: timestamp-aware contiguous-run semantics, missing-frame breaks/uncertainty, threshold-boundary tests and validation against annotated observable activity. Do not infer disengagement from stillness.

### R09 — Audio signal processing
**Classification: Implemented and verified.**

- Source: `backend/analysis.py::audio_metrics` streams one-second PCM WAV windows, normalizes integer samples, calculates RMS, applies `max(0.015, 2 × percentile20)`, merges active intervals and derives duration fraction. Chart output is bounded to 360 points.
- Tests: `tests/test_api.py::test_real_audio_analysis_and_deletion` and `test_empty_and_truncated_wav_are_rejected` exist; Not run. C03 directly read the pre-existing generated tone file and asserted duration 4.0 seconds, fraction 0.5 and interval 2–4 seconds.
- Verified scope: computation on that synthetic PCM sample, not the complete format matrix. No real speech, noise robustness or activity-threshold accuracy is established. The test name containing “real” denotes actual processing, not real classroom input.

### R10 — Speech detection
**Classification: Not implemented.**

- Source: `audio_metrics` labels results as sound activity, not verified speech. No voice-activity model, speech/non-speech classifier, transcript or acoustic speech features were found.
- Tests: synthetic silence-plus-tone coverage is not speech detection. No speech ground-truth test found; Not run.
- Gap: a speech-specific detector with consented speech/music/noise/silence evaluation, confidence and limitations. An RMS threshold must remain labelled sound activity.

### R11 — Classroom interaction analysis
**Classification: Not implemented.**

- Source: `backend/recommendations.py::summarize` exposes only sound-active fraction from audio; `local_rules` can suggest discussion at low activity. There is no turn-taking, speaker diarization, question/response recognition, participation attribution or dialogue analysis.
- Tests: `test_rule_thresholds` verifies text-rule selection, not interaction recognition. No interaction-analysis test found.
- Gap: define observable interaction events and validate their extraction. Speaker labels, if added, cannot automatically be treated as student identity.

### R12 — Audio-video multimodal fusion
**Classification: Not implemented.**

- Source: `analyze_media` returns separate video/audio objects. `summarize` combines aggregate fields into one dictionary; `local_rules` evaluates independent thresholds; Gemini receives the summary. There is no timestamp-aligned cross-modal feature representation, missing-modality weighting, joint estimator, or fused output.
- Tests: media tests cover separate WAV/AVI signals. No synchronization, joint-model or modality-ablation tests found; Not run.
- Sharing a session or prompt is aggregation, not an established fusion algorithm. Build an explicitly defined joint observable measure and validate synchronization and ablations before claiming fusion.

### R13 — Student-level engagement scores
**Classification: Not implemented.**

- Source: `backend/db.py::SCHEMA`, `backend/analysis.py::analyze_media`, `src/types.ts::Student`, and `src/pages.tsx::Students` contain attendance data but no student engagement score or media-to-student mapping.
- Tests: no individual engagement score tests found; Not run.
- Student attendance rates do not establish engagement. A future score would require a defined observable construct, appropriate identity/consent boundary and independent validation; do not infer intelligence, emotion or attention from appearance.

### R14 — Classroom-level engagement scores
**Classification: Not implemented.**

- Source: `backend/app.py::analytics` returns attendance rate, mean scene change and sound fraction; `src/pages.tsx::AnalyticsPage` explicitly states “without an invented engagement score.”
- Tests: `test_session_validation_and_attendance_math` concerns attendance percentages; no classroom engagement scoring test found.
- No scoring formula, calibration, uncertainty or validity study exists. Charts labelled Engagement Analytics do not implement a validated engagement score. Current observable indicators are a narrower feature.

### R15 — Local evidence-linked teaching suggestions
**Classification: Implemented and verified.**

- Source: `backend/recommendations.py::local_rules` creates advisory title/body/evidence entries for unconfirmed attendance, prolonged low scene change, large scene-change range and low sound activity, with a default contextual suggestion.
- Tests: `tests/test_api.py::test_rule_thresholds` passed in C01 for three threshold-triggered suggestions. The code exposes its thresholds and cautions against attention inference.
- Verified scope: deterministic rule output for supplied aggregate metrics. Exhaustive boundaries, correctness of upstream durations (R08), and educational usefulness are not established. This is local rule output, not Gemini generation.

### R16 — Gemini teaching recommendations
**Classification: Implemented but not fully verified.**

- Source: `backend/recommendations.py::config_status`, `verify_model`, `generate`; `backend/app.py::recommendations` at `POST /api/recommendations`; `src/pages.tsx::Recommendations`. Explicit request sends aggregate session metrics. Model availability is checked, output is parsed as 1–3 title/body/evidence objects, and source is labelled.
- Tests: `test_provider_failure_uses_local_rules` passed with a mocked client (C01); `test_missing_key_and_recommendation_fallback` exists but was Not run.
- Missing: fresh successful dashboard-Gemini generation, generated evidence correctness, malformed-output and generation-failure coverage for this specific service. Readiness tests do not substitute for dashboard recommendation tests. String/length checks and prompting cannot guarantee truthful educational advice.

### R17 — Institution Readiness Brief
**Classification: Implemented but not fully verified.**

- Source: `backend/readiness.py::Brief`, `generate_brief`, `BriefUnavailable`; `backend/portal.py::validate_readiness`, `readiness` (`POST /api/readiness-brief`); `src/public/Readiness.tsx::Readiness`. Capability IDs map to maintained descriptions in `backend/capabilities.json`.
- Tests executed: `tests/test_portal.py::test_structured_generation_and_authoritative_capabilities` and all four cases of `test_invalid_model_output_is_never_displayed` passed (C01), using a mocked provider.
- Other tests: `test_provider_access_and_timeout_errors_are_transparent`, `test_quota_failure_sanitized_and_rate_limited`, and the two readiness frontend tests listed in R25; Not run.
- Historical evidence: `docs/VERIFICATION.md` reports one real request with schema validation. Existing `data/verification/readiness-real.json` has source gemini, capability_version 2026-10-29 and nonempty expected fields (C06). The file alone does not authenticate the request's provenance or prove current quota/access.
- No real Gemini request was made in this audit. Free-text claims remain advisory; schema validation does not prove semantic truth.

### R18 — Student registration/editing/search
**Classification: Implemented but not fully verified.**

- Source: `backend/app.py::students`, `student_write` (`GET/POST /api/students`, `PUT/DELETE /api/students/<int:student_id>`); `src/pages.tsx::Students`; `src/forms.tsx::StudentForm`. Identifier validation and SQLite case-insensitive uniqueness exist; search/cohort filtering runs in the client.
- Tests: `tests/test_api.py::test_student_crud_and_validation`; `src/App.test.tsx` — “register student submits validated fields through backend”; Not run.
- Frontend fetch is mocked despite that test title. Missing current API execution and populated-roster search/edit/browser coverage. Student deletion cascades attendance; history is not immutable.

### R19 — Sessions and rosters
**Classification: Implemented but not fully verified.**

- Source: `backend/app.py::session_write`, `sync_roster`, `session_records`; session CRUD and `POST /api/sessions/<int:session_id>/roster`; `src/forms.tsx::SessionForm`, `src/pages.tsx::Sessions`, `SessionTable`.
- Tests: `test_session_validation_and_attendance_math`, `test_roster_is_snapshot_with_explicit_sync` in `tests/test_api.py`; “new session form sends title, date and instructor” in `src/App.test.tsx`; Not run.
- Membership is snapshotted at session creation, but names/identifiers are joined from mutable student rows; this is not an immutable historical identity snapshot. Current execution and edit/delete/concurrent-roster edge cases remain unverified.

### R20 — Manual attendance/rates/history
**Classification: Implemented but not fully verified.**

- Source: `attendance_summary`, `attendance`, `update_attendance`, `students` in `backend/app.py`; `src/pages.tsx::Attendance`. Rate is present / (present + absent + unconfirmed); unknown roster members and statuses are rejected before writes.
- Tests: `tests/test_api.py::test_session_validation_and_attendance_math` checks 50% for one present of two, invalid member/date handling and history. Not run.
- Missing current integration run, populated attendance-control browser tests, mixed valid/invalid batch atomicity tests and duplicate-update/concurrent-edit cases. This is instructor-confirmed record keeping, not biometric attendance verification.

### R21 — Eight operational screens
**Classification: Implemented but not fully verified.**

- Source: `src/App.tsx::App` and `LegacyRedirect`; `src/Dashboard.tsx::Dashboard`; `src/pages.tsx::Overview`, `Attendance`, `Sessions`, `AnalyticsPage`, `Recommendations`, `Students`, `Reports`, `Settings`. Routes are under /app; legacy paths redirect.
- Tests: `src/App.test.tsx` — “all eight navigation routes render and settings exposes honest key status”, “empty overview offers a real sample-data action”, “backend failures provide a retry state”; Not run.
- Type checking passed C02. Existing tests mock fetch and mostly exercise empty states. Screenshots/route names alone do not prove populated data correctness or backend integration.

### R22 — Analytics, filters and chart semantics
**Classification: Implemented but not fully verified.**

- Source: `backend/app.py::analytics` (`GET /api/analytics`); `src/pages.tsx::AnalyticsPage`, `AnalysisDetail`, `Overview`; `src/charts.tsx::Chart`. Date/session filtering, attendance trend, scene-change comparison, count/audio series, null gaps, tooltips and labels exist.
- Tests: `test_initialization_and_empty_state`, `test_session_validation_and_attendance_math` in `tests/test_api.py`; eight-route frontend test; Not run.
- Missing populated-chart/filter integration, mixed sample/real aggregation assertions, multiple-analysis selection and unsupported filter-ID tests. Latest completed analysis drives aggregate metrics, while `session_records` surfaces latest job status regardless of completion. Review and test that distinction.

### R23 — Reports and exports
**Classification: Implemented but not fully verified.**

- Source: `backend/app.py::export` at `GET /api/export/attendance.csv`; `src/pages.tsx::Reports` and its `download` callback. JSON is created client-side from session/analysis/recommendation data. PDF is browser Print / save PDF via `window.print()`, not a server PDF generator.
- Tests: `tests/test_api.py::test_csv_and_formula_safety` checks download and a formula-prefix escape; Not run. No JSON download or print/PDF browser test found.
- Missing export fidelity/encoding/large-report tests and printed layout validation. JSON includes session evidence but not the complete student roster detail returned by the separate student API. Export scope should be explicit; do not equate the “Full report” label with every database field.

### R24 — Offline/local processing
**Classification: Implemented but not fully verified.**

- Source: `backend/analysis.py::analyze_media`, `audio_metrics`; `backend/recommendations.py::generate` defaults to local; `backend/app.py::spa` serves built local assets. Fonts are imported locally in `src/main.tsx`. No remote model download is needed for HOG.
- Tests: `test_missing_key_and_recommendation_fallback` exists; Not run. C03/C04 directly processed existing synthetic audio/video without FFmpeg or cloud calls.
- Missing a full browser session under disabled network, installed-format coverage and operational offline regression. Public readiness has no local generated-brief fallback and correctly fails explicitly; local teaching suggestions remain available. This is local server processing, not an offline PWA.

### R25 — Transparent external-AI fallback
**Classification: Implemented and verified.**

- Source: `backend/recommendations.py::verify_model`, `generate` return local rules and sanitized notes on provider unavailability; `backend/readiness.py::generate_brief` raises a structured error rather than fabricating a brief.
- Test executed: `tests/test_api.py::test_provider_failure_uses_local_rules` passed C01. It proves mocked model-access failure produces source local and does not disclose supplied sensitive exception text.
- Related tests Not run: `tests/test_api.py::test_missing_key_and_recommendation_fallback`; `src/public/PublicHome.test.tsx` — “readiness errors never substitute sample output and have an explicit retry” and “public website remains usable when session check fails”.
- Scope: verified local fallback for the exercised provider-access failure, not every outage/quota/generation error or native-browser retry path.

### R26 — Media upload validation/formats
**Classification: Implemented but not fully verified.**

- Source: `backend/app.py::upload` at `POST /api/sessions/<int:session_id>/media`, `create_app` size limit, `backend/analysis.py::analyze_media` decode/duration checks and `audio_metrics` PCM validation; `src/forms.tsx::UploadForm`. UUID storage names, extension allowlist, empty-file rejection, 100 MB and two-hour constraints exist.
- Tests: `test_upload_validation_and_failed_decode`, `test_upload_limit`, `test_empty_and_truncated_wav_are_rejected` in `tests/test_api.py`; Not run. C03/C04 only validate the existing two fixtures.
- Filename extension is not MIME/content validation; decoder success is the next check. All codec/container combinations, corrupt metadata, oversize dimensions, PCM widths/channels and hostile files remain unverified. FFmpeg-dependent formats are unavailable here.

### R27 — Analysis jobs/progress/recovery
**Classification: Implemented but not fully verified.**

- Source: `backend/app.py::upload` process-local lock/daemon thread; `backend/analysis.py::process_job` progress/result/failure writes; `backend/db.py::init_db` marks queued/processing records failed on startup; `src/Dashboard.tsx::Dashboard` polls every two seconds; `src/pages.tsx::AnalysisList` displays state.
- Tests: `test_upload_validation_and_failed_decode`, `test_real_audio_analysis_and_deletion`; Not run. Under TESTING, upload executes the worker synchronously, so these do not prove daemon-thread behavior.
- `src/forms.test.tsx` contains “accepted upload refreshes job state and closes the dialog”, “accepted upload with refresh failure is recoverable without duplicate submission”, and “upload error exposes the backend reason and enables retry”; all Not run and XHR-mocked.
- Missing crash/restart, competing-upload, DB-contention and real asynchronous browser tests. No durable external queue or cross-process lock.

### R28 — Preferences and media retention
**Classification: Implemented but not fully verified.**

- Source: `backend/db.py::preferences`, `backend/app.py::settings` (`PUT /api/settings`), `delete_analysis` (`DELETE /api/analyses/<int:analysis_id>`, optional media_only), `src/pages.tsx::Settings`. Interval 2–60 seconds and detection flag are validated. Media-only deletion preserves calculated metrics; full deletion can remove recommendations for the session.
- Tests: `test_preferences_origin_and_unknown_records`, `test_real_audio_analysis_and_deletion` in `tests/test_api.py`; Not run.
- Retention is manual. No expiry scheduler, backup/restore or secure-erasure guarantee. Missing interruption/filesystem-error/concurrent deletion coverage and verification that multiple analyses' saved suggestions are retained or cleared as intended.

### R29 — Persistence/API validation
**Classification: Implemented but not fully verified.**

- Source: `backend/db.py::SCHEMA`, `db`, `init_db`; `backend/app.py::create_app`, `payload`, `text_field`, `existing` and nested error handlers. SQL values are parameterized; foreign keys are enabled per connection. Internal constant table names are interpolated in `existing`.
- Tests: `test_initialization_and_empty_state`, `test_student_crud_and_validation`, `tests/test_portal.py::test_database_error_does_not_disclose_details`; Not run. C03 confirmed actual table/column names without initialization or writes.
- Missing fresh persistence/rollback/concurrent-write/disk-full tests. The schema initializer uses CREATE TABLE IF NOT EXISTS, not a versioned migration system. No claim of migration compatibility is warranted.

### R30 — Demo and measurement provenance
**Classification: Implemented but not fully verified.**

- Source: `backend/app.py::demo`, `reset_demo`, `upload`; `src/pages.tsx::SampleNote`, `AnalysisDetail`, `Reports`; `src/public/ProductVisual.tsx` labels illustrative examples. Demo results use kind simulated and sample sessions reject uploads.
- Tests: `tests/test_api.py::test_demo_is_labelled_idempotent_and_separate`; “empty overview offers a real sample-data action” in `src/App.test.tsx`; Not run.
- Caveat: analyzing a synthetic uploaded file returns kind measured because numbers were computed; it does not automatically identify synthetic source material. C04 verified this distinction. Input provenance still requires documentation, and mixed sample/real totals need careful interpretation.

### R31 — Public institutional site
**Classification: Implemented but not fully verified.**

- Source: `src/public/PublicHome.tsx::PublicHome`, `ProductVisual.tsx::ProductVisual`, `ActivityTimeline`, `AttendanceGraphic`, `Advisory`; `src/Brand.tsx::Brand`; section anchors, institution/privacy narratives, two illustrative examples and modal triggers are wired in React.
- Tests: `src/public/PublicHome.test.tsx` — “public homepage has section anchors and independent illustrative examples”; Not run. Type checking passed C02.
- Missing current browser visual/CTA checks and accessibility review; public illustrative visuals are not measured classroom data or a functioning authenticated dashboard.

### R32 — Demo login/session/sign-out
**Classification: Implemented but not fully verified.**

- Source: `backend/portal.py::login`, `logout`, `session_status`, `signed_in`, `register_portal`; /api/auth/login, /logout, /session. Hashed opaque tokens, expiry, HttpOnly/SameSite cookies and operational API protection exist. `src/App.tsx::App`, `src/public/LoginDialog.tsx::LoginDialog` and `Dashboard` wire redirects/sign-out.
- Tests: `tests/test_portal.py::test_demo_login_cookie_rotation_logout_and_guard`, `test_expiry_and_cross_origin`; frontend “demo sign-in, dashboard navigation, sign-out and route protection work”, “signed-in refresh and legacy route retain existing dashboard access”, “invalid demo credentials return an accessible error without leaving homepage”; Not run.
- This remains a shared demo account, not institutional authorization. No fresh real-cookie/browser validation; frontend auth is mocked in component tests.

### R33 — Institutional enquiries
**Classification: Implemented but not fully verified.**

- Source: `backend/portal.py::validate_enquiry`, `enquiry` (`POST /api/enquiries`), `rate_limit`; `src/public/ConsultationDialog.tsx::ConsultationDialog`, `validate`, `advance`, `submit`; `shared/institution-options.json`. Four stages, optional consent/phone, limits/options, server reference, idempotency hash and SQLite persistence exist.
- Backend tests: `test_enquiry_persistence_idempotency_and_restart`, `test_enquiry_invalid_fields` (12 cases), `test_enquiry_limits_and_server_identity` in `tests/test_portal.py`.
- Frontend tests: “consultation validates each step, reviews all details and submits once with consent optional” and “consultation retry preserves the submission key and entered details”; Not run.
- No public enquiry listing or email integration is implemented, consistent with the disclosed local scope. Missing true simultaneous duplicate-request and native mobile form verification. No enquiry was created by this audit.

### R34 — Credentials/access/privacy
**Classification: Implemented but not fully verified.**

- Source: backend-only `load_dotenv` and Gemini calls; `backend/app.py::local_origin` and `headers`; `backend/portal.py::bounded_json`, `validate_readiness`, `protect_dashboard_api` (nested in register_portal); `.gitignore` excludes .env/data/virtual environments.
- Tests: `test_preferences_origin_and_unknown_records`, `test_expiry_and_cross_origin`, `test_database_error_does_not_disclose_details`; Not run. C01 verified sanitization for one mocked provider failure only.
- Readiness excludes unexpected fields and email-like free text, but cannot guarantee removal of names or other confidential data voluntarily typed into prose. Demo access is not real user authorization. No decoder sandbox, tenant isolation, encrypted SQLite or comprehensive security assessment is established. The secret file was never printed; no real credentials appear in this audit.

### R35 — Real-world accuracy validation
**Classification: Not implemented.**

- Evidence reviewed: `tests/test_api.py`, `scripts/generate_test_media.py`, `scripts/http_smoke.py`, `docs/VERIFICATION.md`. No consented annotated classroom corpus, ground truth, precision/recall, count MAE, tracking metrics, speech detection evaluation, engagement construct study or confidence intervals were found.
- Tests: no accuracy benchmark test found; Not run. C03/C04 synthetic outputs do not establish real-person detection accuracy.
- Needed: task-specific annotated datasets, held-out evaluation, documented conditions and uncertainty. Displayed percentages, zero detections on blank frames and successful API calls are not accuracy evidence.

### R36 — Reliability/edge-case testing
**Classification: Partially implemented.**

- Source controls: input validation, decoder error handling, null-first-frame behavior, fallback detector initialization, one-job lock, sanitized errors and restart handling.
- Exact tests include `test_empty_and_truncated_wav_are_rejected`, `test_detector_initialization_failure_keeps_scene_analysis`, `test_upload_validation_and_failed_decode`, `test_upload_limit`, `test_quota_failure_sanitized_and_rate_limited`; Not run. Selected provider/schema tests passed C01.
- Missing: decode failure midway through video, timestamps/gaps, irregular/NaN metadata, long/incomplete final audio windows, detector per-frame failure, filesystem/DB contention, simultaneous requests and crash-recovery execution. No claim of robust behavior for all these cases is supported.

### R37 — Performance/resource behavior
**Classification: Partially implemented.**

- Source: `backend/analysis.py::MAX_DURATION` (7200), `MAX_SAMPLES` (360), sampled/resized video, streaming WAV; FFmpeg timeout 180 seconds; process-local locks in upload/readiness.
- Tests: no load, throughput, p95 latency, peak memory, long-recording stress or cancellation test found; Not run. Unit-test wall time in C01 is not an application benchmark.
- Bounds reduce work but do not demonstrate runtime guarantees. Native video decoding has no hard per-job watchdog/process isolation; maximum input dimensions are not explicitly bounded before decode. Measure representative recordings and add targeted worker time/resource controls before broader use.

### R38 — Accessibility/responsiveness/design
**Classification: Implemented but not fully verified.**

- Source: `src/ui.tsx::Dialog` uses native showModal, cancel/backdrop close, body scroll lock and focus restoration; `src/styles.css` implements blur, focus, print and reduced-motion rules; `src/public/public.css` responsive breakpoints; `src/charts.tsx::Chart` provides figure labels/legend/point-count summary. Local fonts and forest/ivory tokens are used.
- Tests: “login modal validates, toggles password, locks scroll and restores focus on close” and public navigation test in `src/public/PublicHome.test.tsx`; Not run.
- `src/test-setup.ts` replaces native dialog methods and ResizeObserver. Even a passing jsdom suite would not prove actual focus trapping, layout, contrast or keyboard chart access. No fresh browser/assistive-technology/responsive validation was done.

### R39 — Documentation
**Classification: Partially implemented.**

- Source documents: `README.md`, `docs/API.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_REPORT.md`, `docs/VERIFICATION.md`, screenshot guides; architecture describes the actual modules and ten-table schema.
- Check: C03 inspected current SQLite columns; Python/TypeScript static checks passed. No documentation test found.
- Confirmed gaps: original Instructions screenshot is missing; README backend setup uses the current root but frontend startup still says `D:\Coding\SkillWallet\Multimodal`. The architecture text calls the locally switched product examples “example readiness results,” but `PublicHome` switches illustrative session examples; readiness generation is a separate explicit backend request. Screenshot and historic test claims are not independently revalidated here. README report terminology should clarify browser-generated PDF and JSON scope (R23).
- These files were intentionally not corrected: only this audit may change.

### R40 — Regression and end-to-end verification
**Classification: Partially implemented.**

- Source: `tests/test_api.py`, `tests/test_portal.py`, `src/App.test.tsx`, `src/forms.test.tsx`, `src/public/PublicHome.test.tsx`; scripts `http_smoke.py`, `portal_smoke.py`, `verify_readiness.py`.
- Current: seven fixture-free Python cases passed C01; no-output TypeScript check passed C02; synthetic read-only checks passed C03/C04.
- Historical record reports 45 backend and 19 frontend tests, build and HTTP smoke success. Full suites/build were **Not run** here. Unit provider mocks do not verify Google connectivity; Flask test clients are not a real server/browser; frontend fetch/XHR/dialog mocks are not end-to-end.
- No current browser E2E suite or real-recording accuracy/performance suite was found. Preserve current tests and add focused missing layers rather than rewriting the application.

## 5. Tests and checks executed

All commands were executed with the working directory explicitly set to the project root. The scripts below were passed through PowerShell as in-memory here-strings to `.\.venv\Scripts\python.exe -B -`; no audit scripts or result files were created.

### C00 — Location/Git/runtime checks

```powershell
Get-Location
git --no-optional-locks status --short
git rev-parse HEAD
.\.venv\Scripts\python.exe -B --version
node --version
```

Observed: exact required root; empty initial status; HEAD and versions in section 2; successful read-only check. Sandbox-only Git errors were resolved without changing repository configuration. The `--no-optional-locks` flag avoids optional index refresh writes.

### C01 — Selected existing unit tests

```powershell
$env:PYTEST_DISABLE_PLUGIN_AUTOLOAD = '1'
.\.venv\Scripts\python.exe -B -m pytest -p no:cacheprovider -vv tests/test_api.py::test_rule_thresholds tests/test_api.py::test_provider_failure_uses_local_rules tests/test_portal.py::test_structured_generation_and_authoritative_capabilities tests/test_portal.py::test_invalid_model_output_is_never_displayed
```

**Observed: 7 passed in 2.26s; exit code 0.**

Exact collected cases:
- `tests/test_api.py::test_rule_thresholds` — PASSED.
- `tests/test_api.py::test_provider_failure_uses_local_rules` — PASSED.
- `tests/test_portal.py::test_structured_generation_and_authoritative_capabilities` — PASSED.
- `tests/test_portal.py::test_invalid_model_output_is_never_displayed[bad0]` — PASSED.
- `tests/test_portal.py::test_invalid_model_output_is_never_displayed[bad1]` — PASSED.
- `tests/test_portal.py::test_invalid_model_output_is_never_displayed[bad2]` — PASSED.
- `tests/test_portal.py::test_invalid_model_output_is_never_displayed[bad3]` — PASSED.

These selected tests need no temporary database/media fixture. Environment changes were process-local. Gemini clients were mocked; no API quota was used.

### C02 — TypeScript check without emitted artifacts

```powershell
node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json
```

**Observed: exit code 0, no diagnostics.** This verifies type checking of the configured source set; it is not a Vite production build, runtime test or visual check.

### C03 — Python parse, read-only schema/audio, tool availability

The executed Python body used:
```python
from pathlib import Path
import ast, json, sqlite3, shutil
from backend.analysis import audio_metrics
root = Path.cwd()
assert str(root) == r'D:\Coding\classroom-insight'
files = (list((root/'backend').glob('*.py'))
         + list((root/'tests').glob('*.py'))
         + list((root/'scripts').glob('*.py')))
for p in files:
    ast.parse(p.read_text(encoding='utf-8'), filename=str(p))
c = sqlite3.connect((root/'data/classroom.sqlite3').as_uri()
                    + '?mode=ro&immutable=1', uri=True)
schema = {r[0]: [v[1] for v in c.execute('PRAGMA table_info("'+r[0]+'")')]
          for r in c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")}
c.close()
result = audio_metrics(root/'data/verification/synthetic-tone.wav')
assert result['duration_seconds'] == 4.0
assert result['active_fraction'] == 0.5
assert result['active_intervals'] == [{'start': 2, 'end': 4.0}]
print(bool(shutil.which('ffmpeg')))
```

Observed: **15 Python files parsed**, ten-table column metadata read, three audio assertions passed, **FFmpeg False**, exit code 0. Immutable read mode avoids journal/initialization writes; this is a static schema observation, not concurrent database integrity or migration validation.

### C04 — Existing synthetic AVI, direct read-only processing

After verifying FFmpeg was absent and no extracted WAV existed, the executed body included:
```python
from pathlib import Path
from backend.analysis import analyze_media
p = Path.cwd()/'data/verification/synthetic-scene.avi'
assert not p.with_suffix('.extracted.wav').exists()
r = analyze_media(p, {'sample_seconds': 2, 'person_detection': True}, lambda _: None)
v = r['video']
assert r['kind'] == 'measured' and v['frames_sampled'] == 6
assert v['points'][0]['activity'] is None
assert v['detector'] == 'OpenCV HOG + SVM pedestrian detector'
assert all(point['count'] == 0 for point in v['points'])
assert r['audio'] is None
```

Observed: **all assertions passed**, duration 12.0 seconds, six samples, counts [0,0,0,0,0,0], activity [null,0.0,19.51,19.51,0.0,19.51]. Unavailable signal: “Audio extraction unavailable: install FFmpeg or upload PCM WAV audio.” No extracted file or database record was created. **Do not rerun this exact probe with FFmpeg available under a no-write restriction:** extraction would create a temporary WAV.

### C05 — Low-activity gap diagnostic

```python
from backend.recommendations import summarize
a = {'kind': 'measured', 'video': {'sample_seconds': 10, 'points': [
    {'seconds': 0, 'activity': None}, {'seconds': 100, 'activity': 1}]}}
m = summarize(a, {'present': 0, 'unconfirmed': 0, 'total': 0})
print(m['low_scene_change_seconds'])
```

Observed: **10**, despite timestamps 100 seconds apart. This is a synthetic dictionary diagnostic, not a failing existing test or a measured classroom interval. It confirms nominal interval accumulation and motivates gap-aware semantics/tests.

### C06 — Historical readiness artifact inspection

`data/verification/readiness-real.json` was read as JSON without printing its prose. Observed: source gemini; capability_version 2026-10-29; summary, capabilities, pilot_scope, privacy_considerations, implementation_questions, next_steps, unanswered_questions and limitations were all nonempty. This does **not** independently establish that a current live request succeeds or that every claim in the old output is correct.

### Checks deliberately Not run

- Full `.\.venv\Scripts\python.exe -m pytest -q`: fixtures create SQLite/media files. Historical record: 45 passed; not re-established.
- `npm test`: full frontend test runner/cache/config artifacts were not allowed as additional file changes. Historical record: 19 passed in three files; not re-established.
- `npm run build`: writes dist/build metadata. Historical pass only; C02 is not a substitute build.
- `scripts/generate_test_media.py`: writes media fixtures.
- `scripts/http_smoke.py`: creates/deletes classroom records and changes event/session state.
- `scripts/portal_smoke.py`: writes authentication/rate-limit records and can retain an enquiry.
- `scripts/verify_readiness.py`: calls create_app (initializes DB/reconciles jobs), updates rate limits, calls Gemini, and saves output.
- Server startup or `create_app()` against existing data: initialization can mark in-progress jobs failed.
- Live Gemini, browser end-to-end, real-classroom recordings, load tests and comprehensive security scanning: Not run.
- No new tests, dependency installation, migrations or application-code changes.

### C07 — Preservation and output verification

The pre-write comparison found no changed or removed files among the 237 baseline files. Final checks compare those same content hashes and confirm the only added file is this audit; Git status is checked without optional locks. No database connection capable of writes was used by audit probes. Final verification results are recorded at the end of this document.

## 6. Synthetic versus real-world validation

- `scripts/generate_test_media.py` creates a four-second silence/tone WAV and a twelve-second AVI with text on changing solid backgrounds. These contain **no people or speech**.
- Backend test videos are solid/blank frames; `wav_bytes` makes silence plus a sine tone. Names beginning “test_real_” mean actual decoder/API execution on those synthetic fixtures.
- Demo data in `backend/app.py::demo` is formula-generated; no recording is analyzed when loading it.
- C03/C04 execute genuine computation on synthetic files. The resulting numbers are measured signals for those files, not evidence of classroom recognition accuracy.
- C01 provider behavior is mocked. Frontend tests mock fetch/XHR and dialog behavior. Neither provides live service/browser proof.
- The historical readiness artifact and verification narrative are supporting historical evidence, not authenticated current integration results.
- No real-world annotation protocol, evaluation split, error distribution, fairness assessment, learning-outcome validation or performance budget was recovered.

## 7. Missing or incomplete implementation

The decisive difference is between the **implemented local observation/manual attendance product** and the **richer tracking/fusion/scoring requirements listed in this request**.

Absent: face detection; persistent tracking; sustained identity-linked attendance; head pose; verified speech; interaction extraction; genuine audio-video fusion; student-level and classroom-level engagement scoring; real-world accuracy evaluation.

Partial: individual attendance timestamps/audit history; participant movement/inactivity (only scene-change heuristics); edge-case/performance validation; exhaustive regression/E2E evidence; original requirements traceability and some setup documentation.

Existing but incompletely verified: functional dashboard/API/persistence, student/session/manual attendance workflows, reports, upload jobs, privacy/settings, public demo portal and enquiries, and Gemini integrations. These should be retained and validated incrementally.

## 8. Prioritized implementation gaps

### P0 — Critical correctness or safety gates

No new, demonstrated P0 exploit or data-corruption failure was established by this limited audit. Two deployment/claims gates nevertheless must remain enforced:

- **Do not use anonymous counts or heuristic activity as verified identity, attendance or internal engagement.** R01–R14 are not a completed automated attendance/engagement pipeline. Maintain manual confirmation and explicit provenance. If automation is required, define consent, identity verification and human review before connecting observations to student records.
- **Do not expose the current shared-demo system as an institutional production service.** R32/R34/R37 lack real institutional authorization, tenant controls and isolated media processing. Before such a deployment, add real access boundaries and resource isolation, and test them. This is conditional deployment work, not a requirement to rewrite the local demo now.

### P1 — Core requirements missing or inadequately validated

1. **Recover the Instructions source.** Obtain the screenshot/transcript and acceptance criteria; amend this matrix rather than inventing targets.
2. **Attendance audit history (R04/R05).** Add a narrowly scoped timestamped per-student/session change ledger and transactional tests covering old/new status and actor/source. Current generic events cannot support disputed attendance reconstruction.
3. **Detection/tracking/presence (R01–R03).** If retained in approved scope, add a face-specific detector where required, persistent anonymous tracks, and defined dwell/missing/exit handling. Keep identity confirmation a separate governed step. Test occlusion, re-entry, ID switches and false assignments.
4. **Pose/activity/inactivity (R06–R08).** Add the required pose/motion outputs and timestamp-aware activity intervals; break or flag intervals across missing samples. Validate against labelled observable actions, not inferred mental states.
5. **Speech and interaction (R10/R11).** Add validated speech-specific processing and explicitly defined interaction events. Evaluate noise/music/silence, overlapping speech and microphone failure.
6. **Fusion and scoring (R12–R14).** Agree a defensible observable construct before building time alignment, missing-modality policy and any joint estimator. Compare single-modality baselines and ablations. Do not simply rename scene-change percentages as engagement scores.
7. **Real-world evaluation (R35).** Use consented representative classroom inputs with annotations and held-out evaluation; publish errors/limitations. Synthetic success is insufficient for attendance or engagement claims.

### P2 — Important reliability, quality and usability gaps

1. **Add targeted failure/recovery tests (R26–R29/R36).** Cover interrupted jobs, contention, failed disk operations, malformed/oversized metadata, detector failure midstream, irregular timestamps and deletion with multiple analyses.
2. **Measure performance and bound decoding (R37).** Benchmark representative duration/resolution/roster sizes; add worker watchdog/cancellation and explicit resource/dimension policy where needed. Retain existing sampling/streaming controls.
3. **Run complete regression and browser flows in a separately authorized disposable test workspace/data configuration (R40).** Do not point mutation smoke scripts at valuable records. Exercise real cookies, populated attendance edits, async uploads, retries, chart filtering, exports and sign-out.
4. **Validate Gemini integrations separately (R16/R17/R25).** Dashboard recommendations and institutional briefs have different contracts. Add dashboard malformed-output/generation-failure tests, review factual evidence, and perform explicit non-sensitive live checks when approved.
5. **Verify responsive/accessibility/report behavior (R23/R38).** Test native modal keyboard behavior, narrow screens, usable data alternatives, JSON scope and printable output. Mocked dialog APIs cannot establish accessibility.
6. **Clarify historical roster guarantees (R19/R20).** Decide whether names/identifiers must be frozen historically; if so, snapshot those fields or record identity revisions. Current membership snapshots alone do not do this.

### P3 — Documentation and additional validation

- Correct README's stale frontend directory in a separately authorized documentation change.
- Reconcile screenshot/verification claims with current provenance; retain historical/current distinctions.
- Document local sound thresholds, sampling gaps, uncertainty and consistent report/export scope.
- Add broader PCM/codec/FFmpeg coverage, time-zone/date-boundary tests, mixed-demo-data charts and multiple-analysis display tests.
- Consider explicit retention/backup responsibilities and a documented recovery procedure; avoid claiming secure erasure or compliance.

## 9. Final summary and audit limitations

The existing code implements a coherent local attendance and session-observation application, with manual roster confirmation, approximate person counts, scene-change metrics, audio energy, advisory rules, optional Gemini, public demo access and institutional enquiries. The seven executed unit cases, no-output type check and direct synthetic-media checks passed within their stated scope.

It does **not** implement the requested face-tracking/sustained-presence/head-pose/speech-interaction/fusion/engagement-scoring pipeline. Some of these omissions are deliberate boundaries in the maintained capability description. They must still be classified as missing relative to the current request's enumerated requirements.

The absent Instructions screenshot prevents exhaustive original-requirement certification. Current full-suite, production-build, real-browser, live-Gemini, real-classroom-accuracy and performance results are not established. No source files, test files, configuration, environment contents or application records were changed to obtain these findings.

### Final preservation verification

- Final `Get-Location` confirmed `D:\Coding\classroom-insight`.
- Final `git --no-optional-locks status --short` returned only `?? docs/REQUIREMENTS_AUDIT.md`. Both unstaged and staged `diff --name-only` outputs were empty. No pre-existing working-tree changes were present at the initial verified check.
- All 40 requirement headings/classification rows were checked; 43 referenced source/artifact paths exist and 27 mentioned Python test function names match actual definitions. Counts: 3 implemented and verified; 20 implemented but not fully verified; 7 partially implemented; 10 not implemented. These are counts of recoverable audit requirements, not a screenshot-compliance percentage.
- Of 237 baseline files, 235 retained identical content hashes. All existing application source, tests, configuration/environment, database/data, documentation, build artifacts and the Git index were unchanged. The only added file was this audit.
- Two Git metadata files changed during the audit: `.git/FETCH_HEAD` and `.git/logs/refs/remotes/origin/HEAD`. No audit command fetched, committed, pushed, modified Git configuration, or wrote those files. Their external provenance was not investigated, and they were not reverted. This metadata observation is distinct from the clean tracked working tree.
- This audit is the only file intentionally created or modified by the task. No records were created, deleted, reseeded or migrated; no real Gemini request was made. The exact destination was checked before writing and the UTF-8 file was read back successfully.
