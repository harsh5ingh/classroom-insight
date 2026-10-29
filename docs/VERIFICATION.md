# Verification Record

**Project:** Classroom Insight — Multimodal Attendance & Engagement Agent
**Environment:** Windows, Python 3.13.15, Node.js 26.7.0
**Last recorded verification:** 29 October 2026

This document records the reported automated test results, integration checks, data-preservation checks, screenshot status, and known verification limitations. A successful test run does not establish real-world classroom accuracy or production readiness.

## 1. Current Status Summary

| Area | Recorded status |
|---|---|
| Backend automated tests | 45 passed in the final-phase verification report |
| Frontend automated tests | 19 passed across three files in the final-phase verification report |
| Frontend production build | Passed |
| Python dependency check | `pip check` passed |
| Flask and Vite integration | HTTP checks passed in the recorded verification |
| SQLite enquiry persistence | Passed, including idempotent replay |
| Synthetic media processing | Passed for tested WAV and AVI workflows |
| Gemini readiness generation | A real request returned HTTP 200 and passed schema validation |
| Security checks | Recorded source/bundle secret-pattern scan and isolated ignore-rule check passed |
| Screenshots | 11 PNG files were committed; two planned captures remain outstanding |
| Final homepage browser review | Incomplete |
| Real-world attendance and engagement accuracy | Not established |
| Production deployment readiness | Not established |

**Evidence boundary:** The test totals and integration results below are from the verification reports recorded on 29 October 2026. They have not been independently rerun as part of this documentation update.

## 2. Screenshot Verification

Eleven screenshot files were included in the initial Git commit:

- `docs/screenshots/public-homepage.png`
- `docs/screenshots/employee-login.png`
- `docs/screenshots/consultation-form.png`
- `docs/screenshots/dashboard.png`
- `docs/screenshots/attendance.png`
- `docs/screenshots/sessions.png`
- `docs/screenshots/engagement-analytics.png`
- `docs/screenshots/recommendations.png`
- `docs/screenshots/students.png`
- `docs/screenshots/reports.png`
- `docs/screenshots/settings.png`

Their presence in Git confirms that the files were committed. It does not independently establish that every image was visually reviewed, correctly framed, or free of sensitive information.

Two additional screenshots remain pending:

- `docs/screenshots/readiness-brief.png`
- `docs/screenshots/mobile-homepage.png`

The browser-control tool repeatedly reported `Local browser use is disabled in Work settings`. The attempted final-phase capture could not be completed through that tool. No synthetic or placeholder images were created as substitutes.

See [SCREENSHOTS.md](SCREENSHOTS.md) and the [screenshot index](screenshots/README.md) for capture instructions and review requirements.

## 3. Final Public Experience Phase

The final-phase verification report recorded the following results.

### Backend tests

**45 pytest tests passed.**

Reported coverage includes:

- Demo-session cookie creation, rotation, revocation, and expiry.
- Protected APIs and cross-origin write rejection.
- Enquiry persistence across database reinitialization.
- Idempotent duplicate requests and conflicting payload detection.
- Form option, length, count, consent, and request-size validation.
- Server-generated enquiry references and the absence of public enquiry-listing endpoints.
- Missing Gemini configuration and structured-response validation.
- Authoritative capability descriptions and invalid model output.
- Provider access, quota, timeout, and sanitized database error paths.

### Frontend tests

**19 Vitest tests passed across three files.**

Reported coverage includes:

- Public navigation and interactive examples.
- Login validation and password visibility.
- Modal close behavior, Escape-event handling, body scroll locking, and focus restoration.
- Dashboard navigation, refresh, sign-out, and protected-route redirects.
- Consultation form validation, review, optional consent, retries, and duplicate-submission protection.
- Readiness success, failure, retry, and homepage availability when session lookup fails.

The tests use jsdom and mocks for some native browser behavior. They do not establish correct native-browser focus containment or complete visual behavior.

### Production build and dependencies

- `npm run build` passed using TypeScript and Vite.
- The verification report recorded separate frontend, dashboard, and chart bundles, with login and consultation dialogs loaded separately.
- Local fonts were emitted as production assets.
- `pip check` passed.
- Pydantic was recorded as an explicit dependency.

These results are historical verification evidence; repeat the commands to confirm the current checkout.

## 4. HTTP, Portal, and Database Checks

The recorded live integration checks reported:

- Nine SPA URLs returned the built application shell.
- The Vite server and API proxy responded.
- Built frontend and font assets were served successfully.
- Operational read and export endpoints worked after demo login.
- Unauthenticated operational access was rejected.
- Sign-out revoked access.
- Consultation data persisted in SQLite.
- Replaying the same idempotency key returned the same reference.
- No email was sent.

One explicitly synthetic, non-consenting institutional enquiry was retained for evaluator inspection. Its recorded reference was `CI-CBE42141A923`. This is test data, not a customer enquiry.

The portal smoke test is designed to reuse its idempotency key on subsequent runs. Check the current database before running tests that create or retain records.

## 5. Media Analysis Checks

The recorded media regression used synthetic WAV and AVI files through the asynchronous analysis workflow.

Reported checks covered:

- Audio energy analysis.
- Video scene-change measurements.
- Execution of the HOG pedestrian detector.
- Job completion.
- Local recommendations, analytics, and CSV export.
- Unchanged attendance during analysis.
- Cleanup of temporary test student, session, and media records.

FFmpeg was unavailable in the recorded environment. Compressed audio decoding and audio extraction from video therefore remain unverified there.

Synthetic media verifies that the tested processing path executes. It does **not** prove reliable person counts, attendance accuracy, speech recognition, engagement validity, or performance on real classroom recordings.

## 6. Gemini Readiness Verification

The final-phase report recorded a real Gemini readiness-generation request using fictional, non-identifying institutional workflow information.

- An initial provider request failed because of schema-field compatibility.
- The implementation was updated to use `response_json_schema`.
- A subsequent request returned HTTP 200 with `source=gemini`.
- The result passed Pydantic schema validation.
- The report was saved to ignored `data/verification/readiness-real.json`.

This demonstrates a successful generation request at the time of verification. It does not guarantee future API availability, remaining quota, or the correctness of generated advice.

The recorded dashboard recommendation tests also covered deterministic local fallback behavior. No cloud request is intended merely because the dashboard renders.

## 7. Security and Data Preservation

The recorded security check reported:

- No configured key, secret, or standard Gemini-key pattern detected in the scanned source, documentation, scripts, or production bundle.
- `.env` and local data were excluded by ignore rules in an isolated temporary Git repository.
- `.env.example` remained trackable.
- Dependency compatibility passed `pip check`.

The ignore-rule test does not prove the absence of every possible secret. The current Git history and staged changes should still be checked before future public pushes.

The recorded preservation check found the following classroom data remained available:

- 12 students.
- 6 sessions.
- 72 attendance entries.
- 6 analyses.
- 14 saved recommendations at final inspection.

The portal verification added a separately labelled synthetic enquiry. The report states that existing classroom records were not reset or replaced.

## 8. Original Core Phase — Historical Evidence

The earlier core-phase report recorded:

- **17 backend pytest tests passed.**
- **9 frontend Vitest tests passed.**
- TypeScript and Vite production build passed.
- Python dependency compatibility check passed.
- Synthetic WAV and AVI processing, analytics, recommendations, and CSV export were exercised.
- All eight dashboard routes were inspected at 390 × 844 and 768 × 1024.
- Desktop dashboard appearance and student/session dialogs were inspected at 1440 × 1000.
- A mobile overflow issue was fixed, and chart loading was split into a separate lazy bundle.

These are historical results from the original dashboard phase. They are not evidence that the final public homepage, consultation modal, or readiness result received the same full browser inspection.

## 9. Remaining Verification Limitations

The following areas remain unverified or incomplete:

- The final public homepage's complete desktop, tablet, and mobile appearance.
- The two pending screenshots.
- Native-browser keyboard focus containment, focus restoration, backdrop/Escape handling, and modal scrolling across supported browsers.
- Real-world person-detection and attendance accuracy.
- Reliable classroom engagement measurement.
- Compressed audio processing and video audio extraction without FFmpeg.
- Load testing, malicious-media isolation, and production resource controls.
- Institutional privacy, accessibility, and security audits.
- Production identity management, tenant isolation, email delivery, and hosted deployment.

The application is a **local, single-instructor demonstration**, not a production-ready multi-user institutional service. AI output is advisory, and observable media signals must not be treated as definitive evidence of student attention or learning.

## 10. Reverification Commands

Run these commands from the project root in PowerShell.

### Backend tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

### Frontend tests

```powershell
npm test
```

### Production build

```powershell
npm run build
```

### Python dependency check

```powershell
.\.venv\Scripts\python.exe -m pip check
```

### Portal smoke test

Start Flask first, then run:

```powershell
.\.venv\Scripts\python.exe scripts/portal_smoke.py
```

This test can retain a synthetic enquiry for evaluator inspection. Review its behavior and the existing database before running it again.

### Media smoke test

```powershell
.\.venv\Scripts\python.exe scripts/generate_test_media.py
.\.venv\Scripts\python.exe scripts/http_smoke.py
```

Start the backend before running the HTTP smoke test. Use only test data and verify cleanup afterward.

## 11. Git and Handoff Status

The initial commit was created and pushed to the `main` branch of the configured GitHub repository on 29 October 2026.

The screenshot files listed in Section 2 were included in that commit. The readiness-brief and mobile-homepage screenshots were not included.

This document records prior verification results and remaining limitations. It does not certify that all tests were rerun after the initial commit or after this documentation change.
