# Verification record

Verified locally on Windows on **29 October 2026**, with Python 3.13.15 and Node.js 26.7.0.

## Screenshot documentation attempt — 29 October 2026

- **Zero screenshots captured.** Browser inventory, browser selection and opening the real local URL were rejected with `Local browser use is disabled in Work settings`. The user reported enabling access twice; fresh tool sessions still returned the same rejection. No replacement driver was installed to bypass the gate, and no synthetic or placeholder image was created.
- Inspected README, package scripts, installed dependencies, Python runtime, source routes and schema. No project Playwright setup was installed. Started the existing Flask command; health, public configuration and built frontend at `http://127.0.0.1:5000/` returned HTTP 200.
- The initial listener query returned no result; the attempted Vite startup then reported port 5173 occupied. Process inspection identified the existing Vite process as this repository's instance. A later HTTP request to 5173 was refused. That process was left untouched; Flask's built SPA provides the documented manual-capture fallback. The Flask process started for this attempt remains available for manual review.
- Added `docs/ARCHITECTURE.md` with actual module/request/media flows and the complete ER diagram. A read-only SQLite comparison verified all **10 table names and ordered column lists** against the diagram. Mermaid rendering in a browser was not tested.
- Added `docs/screenshots/README.md` with honest capture status, planned filenames, safe fictional form details and precise manual steps. Root README now links to it rather than embedding nonexistent PNGs. `docs/SCREENSHOTS.md` points to the current capture index.
- Before/after row counts and SHA-256 hashes matched for **students, sessions, attendance, analyses, recommendations, settings, events and institutional_enquiries**. No attendance changes, resets, consultation submission, new readiness generation or application-code edits were made.
- All relative links in the changed documentation resolved. There are no PNGs to decode or visually inspect. Existing tests/build results below are historical; they were **not rerun** for documentation-only changes. No commit, push or deployment was performed.

## Final public experience phase — current results

This section supersedes older test totals and Gemini-generation limitations below. Historical browser checks describe the original dashboard before this extension, not a visual verification of the final homepage.

- **45 backend pytest tests passed.** The original 17 pass with demo login. New coverage includes cookie rotation/revocation/expiry, protected APIs, cross-origin rejection, enquiry SQLite persistence across reinitialization, same-key duplicate replay and changed-payload conflict, allowed option and length/count/consent validation, request limits, server-generated references, no public listing, missing Gemini configuration, structured response validation, authoritative capability descriptions, invalid model output, provider access/quota/timeout errors and sanitized database failures.
- **19 frontend Vitest tests passed across three files.** All original nine tests pass. New tests exercise public section links, example switching without AI calls, navigation toggle, modal validation/show-password/Escape-event/backdrop handling, body scroll lock and restored focus, successful and invalid demo login, refresh/legacy route access, dashboard navigation, sign-out and protected redirects, consultation step validation/review/optional consent/double-click protection/retry idempotency, readiness success/error/retry and website availability when session lookup fails. jsdom mocks native dialog opening; native browser Tab containment is not established by these tests.
- **`npm run build` passed** (TypeScript + Vite). Public entry approximately 298 KB / 95 KB gzip, dashboard approximately 58 KB / 16 KB gzip, chart chunk approximately 388 KB / 111 KB gzip. Login and consultation dialogs are separate lazy chunks. Local fonts are emitted in `dist/assets`, with primary Latin font preloads rewritten to built asset paths.
- **`pip check` passed.** Existing Python packages remain compatible; Pydantic is now an explicit dependency. No new animation or component library was installed. Font packages carry OFL licenses in their installed distributions.
- **Live Flask + Vite HTTP checks passed.** Nine SPA URLs returned the built shell; Vite and its API proxy responded; four built entry/font assets returned non-HTML content successfully; all operational read/export endpoints worked after cookie login; unauthenticated access was rejected; logout cleared access. Sandbox loopback initially failed with WinError 10013 and then timed out against an isolated server. Launching the verification backend and HTTP client through approved execution outside the sandbox resolved this environment issue.
- **Live enquiry persistence passed.** `scripts/portal_smoke.py` saved one explicitly synthetic, non-consenting evaluation enquiry with reference `CI-CBE42141A923`, verified its details/status directly in SQLite, and replayed the same key to receive the same reference. No email was sent. The record remains for the evaluator. It is labelled synthetic in its organization and notes; it is not a customer enquiry.
- **Live media regression passed.** `scripts/http_smoke.py` logged in through the new session flow, processed synthetic WAV and AVI uploads through the asynchronous worker, verified local recommendations/CSV/analytics and unchanged attendance, then removed its own student/session/media. FFmpeg remains unavailable; video reported that limitation while completing video observations.
- **Real Gemini generation passed.** `scripts/verify_readiness.py` sent fictional, non-identifying institutional workflow data through the Flask readiness endpoint. An initial provider 400 rejected `additional_properties` under the SDK's legacy `response_schema`. The implementation was corrected to `response_json_schema`, then a real request returned **HTTP 200, source=gemini**, with all sections passing Pydantic validation. The reviewed output proposed a consented one-course/single-instructor pilot, manual identity confirmation, measurable operational criteria and governance review; no integrations or outcome guarantees were represented as available. Full fictional output is in ignored `data/verification/readiness-real.json`. This confirms generation, not merely model access. Quota/model availability can change.
- **Security check passed.** `scripts/security_check.py` found no configured key/secret or standard Gemini-key pattern in source/docs/scripts or the production bundle. It verified ignore rules using an isolated temporary Git repository: `.env`, databases, uploads, virtual environments, dependencies and build outputs are excluded; `.env.example` remains trackable. The project itself still has no Git repository; no commit or push was performed.
- **Preservation:** the existing 12 students, six sessions, 72 attendance entries and six analyses remain. There are 14 saved recommendations at final inspection; existing records were not reset or replaced. Only the separately labelled synthetic enquiry and additive portal tables were introduced by the portal smoke check.

### Remaining verification boundary

Computer-use inventory reported **“Local browser use is disabled in Work settings.”** No setting was changed or bypassed. The final homepage's desktop/tablet/mobile appearance, native focus trapping, actual Escape-key/backdrop behavior, font rendering/layout shift, reduced-motion appearance and browser screenshots remain **unverified**. Responsive CSS, native-dialog semantics, local font assets, reduced-motion overrides and interaction tests are implemented, but they do not replace a real browser pass. Follow `docs/SCREENSHOTS.md` for the outstanding evaluator checks.

No hosted deployment, real employee identity system, email service, multi-tenant isolation, institutional compliance review or real-classroom detector validation is claimed.

The owned Flask verification process was stopped after checks. A pre-existing Vite process was reused and left untouched. Start Flask with the README command; reuse the frontend already listening on port 5173 or start Vite if it is no longer running.

## Original core phase — historical evidence

## Automated checks

- **17 backend pytest tests passed.** Coverage includes schema initialization, empty responses, student CRUD and case-insensitive duplicate validation, session CRUD/date validation, attendance math and roster snapshots, analytics filters, CSV formula protection, missing-key fallback, mocked provider failure, advisory thresholds, upload type/size validation, corrupt video, real synthetic PCM audio, original/full-analysis deletion, synthetic video scene changes, HOG execution, detector-initialization fallback, empty/truncated WAV rejection, sample isolation/idempotency/reset, settings and local request restrictions.
- **9 frontend Vitest tests passed.** Coverage includes eight-route navigation, empty/sample actions, student registration, session creation, server-error retry, reset confirmation, multipart request construction, successful upload refresh, refresh failure after an accepted upload and backend upload errors.
- Upload component tests explicitly dispatch form submission after checking the selected-file UI. `user-event` patches the public FileList while jsdom's native required-file check reads its internal list. These tests do not claim to verify a native OS file picker.
- **TypeScript and Vite production build passed**, with separate app and chart bundles and no chunk-size warning. App JS is about 326 KB before compression; the lazily loaded chart bundle is about 388 KB.
- `pip check`: no broken requirements. npm installation audit reported zero vulnerabilities at installation time; this is not a comprehensive security assessment.

## Running application checks

- Vite frontend and Flask backend were launched. Windows sandbox networking initially prevented localhost access; approved execution outside the sandbox restored access.
- The built SPA was also served through the documented **Waitress** command. All eight deep links returned HTTP 200 with the built app shell.
- `scripts/http_smoke.py` verified the live HTTP API and actual asynchronous worker: synthetic WAV upload (4 seconds, 50% sound-active), synthetic AVI upload with HOG/scene measurements, job completion, CSV export, analytics and local recommendations. Analysis did not change attendance. The script removed its temporary student/session/media.
- `scripts/generate_test_media.py` creates the non-sensitive recordings in ignored `data/verification/` for repeatable testing.

## Browser checks completed

- Empty overview, loading labelled sample data, manual attendance change and recalculated totals.
- Student registration and session creation against the live API, plus opening the associated upload dialog.
- All eight production routes at **390 × 844** and **768 × 1024**. Each heading was checked after navigation; no document-level horizontal overflow remained. Tables scroll inside their containers.
- Desktop dashboard appearance inspected, and student/session dialogs exercised at **1440 × 1000**.
- Production browser console had no captured error or warning entries during the route checks.
- Fixed a mobile overflow from an absolutely positioned screen-reader label in a table header; established the header as its containing block. Hid the closed mobile sidebar from keyboard navigation. Changed chart axes to start at zero and split charts into a lazy bundle.

## Verification limits

- Local browser use became disabled in Work settings before native file-picker completion. The full browser upload interaction, downloadable screenshot capture, a complete desktop visual pass for every route, and native print/PDF dialog remain unverified. HTTP uploads and component upload states passed independently. Earlier mobile/tablet/browser results above were observed before that restriction.
- A Gemini credential was supplied during the session. A final request through `/api/config/verify-gemini` successfully verified that the configured model is accessible and advertises content generation. No classroom data was sent. Actual recommendation generation and generation quota were not exercised. The missing-key and mocked provider-failure fallback paths also passed.
- FFmpeg is not installed in this environment. Direct PCM WAV analysis and video-only processing passed; compressed-audio decoding and extraction from video remain unverified here.
- Synthetic recordings verify execution and arithmetic, **not accuracy on real classroom recordings**. HOG is explicitly a limited anonymous estimate.
- No public deployment, multi-user authentication, institutional privacy review, accessibility audit, load test or malicious-media isolation test was performed. This is a local single-instructor submission.

## Submission hygiene

The workspace initially contained no project or Git repository. No commit or push was performed. Git ignore rules were tested in an isolated temporary repository: `.env`, virtual environments, databases, uploads, caches, node_modules and builds are excluded, while `.env.example` is includable. Standard credential-pattern scans of source and built frontend found no matches. A root `.env` was created with a generated local secret; a Gemini credential was subsequently supplied during the session. Neither credential was displayed or included in distributable source.

The temporary browser verification student/session were removed, and the sample attendance change was restored. The labelled sample classroom remains available for review. Verification servers are stopped at handoff; use README startup commands to reopen the app.
