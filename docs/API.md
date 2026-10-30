# Classroom Insight — REST API Reference

**Base path:** `/api`
**Purpose:** Local demonstration and evaluation

This reference documents the application's existing REST API. It is not a production-service guarantee.

## 1. API conventions

- JSON request bodies require `Content-Type: application/json`.
- Media uploads use `multipart/form-data` with the field name `file`.
- The browser uses a same-origin API proxy in development. Permissive CORS is not enabled.
- API responses disable caching.
- Operational endpoints require the `classroom_demo` session cookie.
- Health and documented visitor endpoints remain accessible without a demo session on the local installation.

### Error format

Errors generally use the following JSON structure:

```json
{
  "error": {
    "code": "validation_error",
    "message": "The request could not be validated."
  }
}
```

Validation responses may include field-level details:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Check the highlighted fields.",
    "fields": {
      "contact_name": "This field is required."
    }
  }
}
```

Typical HTTP statuses:

| Status | Meaning |
|---|---|
| `200` | Successful request |
| `201` | Resource created |
| `202` | Background processing accepted |
| `400` | Invalid request or validation failure |
| `401` | Missing, expired, or revoked demo session; invalid login |
| `403` | Request rejected by Host, Origin, or cross-site checks |
| `404` | Resource or route not found |
| `409` | Conflict, duplicate submission with changed content, or busy worker |
| `413` | Request exceeds the configured size limit |
| `429` | Rate limit exceeded |
| `500` | Unexpected internal failure |
| `503` | Service unavailable or generation failure, where applicable |

Exact error codes and status mappings can vary by endpoint. See the individual sections below.

## 2. Public configuration and demo sessions

### `GET /public/config`

Returns public capabilities and the current configuration state.

Example response:

```json
{
  "enquiries_available": true,
  "email_delivery": false,
  "authentication": "demo_only",
  "readiness": {
    "credential_supplied": false,
    "access": "not_configured"
  }
}
```

The readiness access value reflects the running application's Gemini verification state: `not_configured`, `unverified`, `verified`, or `failed`. The endpoint checks database connectivity but makes no provider request. A configured credential alone is never evidence of successful generation.

### `GET /auth/session`

Returns the current browser's demo-session status.

```json
{
  "authenticated": true,
  "mode": "demo"
}
```

The response's `authenticated` value may be `false`. The backend validates the cookie's SHA-256 token hash and expiry against the database.

### `POST /auth/login`

Authenticates against the configured demonstration credentials.

**Request body:**

```json
{
  "email": "instructor@classroom.demo",
  "password": "ClassroomDemo!2026",
  "remember": false
}
```

`remember` is optional and defaults to `false`.

Behavior:

- Request body limit: 2 KB.
- Rate limit: 12 attempts per minute for the local installation.
- Invalid input returns `400`; incorrect credentials return `401`.
- Successful login rotates the server-side token and sets an `HttpOnly`, `SameSite=Strict` cookie.
- Normal sessions expire after eight hours. With `remember: true`, the session lasts seven days and uses a persistent cookie.
- The cookie's `Secure` attribute is controlled by `DEMO_COOKIE_SECURE` and defaults to `false` for local HTTP.

Example success response:

```json
{
  "authenticated": true,
  "mode": "demo",
  "message": "Login successful."
}
```

Use the documented public demo credentials from the project README. Never use real employee credentials in the demonstration account.

### `POST /auth/logout`

Revokes the current matching session, clears the cookie, and returns:

```json
{
  "authenticated": false
}
```

Logout is idempotent. The frontend does not persist a bearer token or password.

**Security boundary:** These sessions support local evaluation only. They do not provide institutional identity, role-based access, or tenant isolation. Existing Host, Origin, and `Sec-Fetch-Site` restrictions also apply to public write endpoints.

## 3. Institutional enquiries

### `POST /enquiries`

Creates a consultation enquiry and stores it locally.

Required headers:

```http
Content-Type: application/json
Idempotency-Key: <20–100 ASCII letters, digits, underscores or hyphens>
```

Request body limit: 24 KB.

The browser generates a random idempotency key for each consultation flow and reuses it when retrying that submission.

### Example request

```json
{
  "contact_name": "Evaluation Contact",
  "work_email": "evaluation@example.org",
  "role": "Teaching lead",
  "organization_name": "Illustrative College",
  "organization_type": "College or university",
  "work_phone": "",
  "country": "India",
  "region": "Delhi",
  "learner_count": 200,
  "location_count": 1,
  "attendance_method": "Spreadsheets",
  "requirements": [
    "Digital attendance records",
    "Reports and exports"
  ],
  "problem": "We need consistent records across teaching sessions.",
  "success_criteria": "A small pilot that reduces reconciliation work.",
  "deployment_model": "Local/on-premises",
  "timeline": "Exploring options",
  "notes": "",
  "contact_consent": false
}
```

### Validation rules

| Field | Validation |
|---|---|
| `contact_name` | Required; 2–100 characters |
| `work_email` | Required; valid email syntax; maximum 254 characters |
| `role` | Required; 2–120 characters |
| `organization_name` | Required; 2–160 characters |
| `country` | Required; 2–80 characters |
| `region` | Required; 2–100 characters |
| `problem` | Required; 20–2,000 characters |
| `success_criteria` | Required; 20–2,000 characters |
| `work_phone` | Optional; maximum 40 characters |
| `notes` | Optional; maximum 2,000 characters |
| `learner_count` | Integer, not boolean; 1–10,000,000 |
| `location_count` | Integer, not boolean; 1–100,000 |
| `contact_consent` | Boolean; defaults to `false` |
| `requirements` | Nonempty array with unique values |

All option values are defined in `shared/institution-options.json` and validated by the server. Other optional fields must also use supported option values.

### Success and idempotency

A new submission returns `201 Created`:

```json
{
  "reference": "CI-CBE42141A923",
  "saved_locally": true,
  "email_sent": false,
  "duplicate": false
}
```

The reference format is `CI-` followed by 12 uppercase hexadecimal characters. The example reference is illustrative.

| Situation | Result |
|---|---|
| New key and valid payload | `201`, new reference |
| Same key and normalized payload | `200`, existing reference, `duplicate: true` |
| Same key but changed payload | `409`, `submission_conflict` |

The server generates the reference, creation timestamp, and initial `New` status. Client-supplied identities and statuses are not trusted. Parameterized inserts and unique constraints protect concurrent retries.

The local installation limits new submissions to 20 per 10 minutes. Request-size errors return `413`; rate-limit errors return `429` with `Retry-After`, where applicable. Validation failures return `400` with field-level details. Unexpected storage errors return sanitized `500` JSON.

There is **no public enquiry list or detail endpoint**. `scripts/inspect_enquiries.py` can inspect local reference metadata without printing contact information.

No email integration is configured. `email_sent: false` means the enquiry was saved locally, not delivered.

## 4. Institution Readiness Brief

### `POST /readiness-brief`

Requests a Gemini-generated advisory brief from explicitly supplied workflow information.

Request body limit: 10 KB.

### Example request

```json
{
  "organization_type": "College or university",
  "workflow": "Instructors maintain attendance in separate spreadsheets.",
  "goals": "Explore a consented pilot with consistent instructor review.",
  "deployment_model": "Local/on-premises",
  "requirements": [
    "Digital attendance records"
  ]
}
```

Only these five fields are accepted. Extra fields are rejected.

Validation rules:

- `workflow` and `goals` must each contain 20–1,600 characters.
- Known email patterns are rejected.
- Do not include names, student identifiers, contact details, or private records.

The email-pattern check is a data-minimization safeguard, not a comprehensive personally identifiable information detector. Stored enquiry details and classroom records are not automatically attached to readiness requests.

### Success response

A successful request returns `200 OK`:

```json
{
  "source": "gemini",
  "capability_version": "example-version",
  "notice": "Advisory output; validate assumptions before implementation.",
  "brief": {
    "summary": "A concise readiness summary.",
    "capabilities": [
      {
        "title": "Digital attendance records",
        "description": "A server-maintained capability description."
      }
    ],
    "pilot_scope": [],
    "privacy_considerations": [],
    "implementation_questions": [],
    "next_steps": [],
    "unanswered_questions": [],
    "limitations": []
  }
}
```

The version and descriptive text above are illustrative. Actual values depend on the server-maintained catalog and generated response.

### Generation and validation

1. Validate the five accepted input fields.
2. Verify model access and request structured output from Gemini.
3. Validate the response using Pydantic.
4. Resolve recognized capability IDs against `backend/capabilities.json`.
5. Append fixed limitations maintained by the application.
6. Return the advisory brief without persisting it in the application database.

The verification script may save fictional test output locally; that is separate from normal endpoint behavior.

### Limits and failure behavior

- One concurrent generation is permitted per application process.
- The local installation permits eight requests per 10 minutes.
- Model verification and generation each use a 45-second client timeout.
- `409` indicates an in-process generation is already active.
- `429` indicates local rate limiting or a provider quota limit.
- `503` indicates unavailable access, generation failure, or invalid output, according to the specific failure path.

Errors are sanitized; provider exception text and credentials are not returned. The endpoint does not substitute a fabricated sample brief on failure.

Local teaching recommendations are a separate service and must not be presented as generated readiness output.

The Gemini implementation follows the official [structured-output API documentation](https://ai.google.dev/gemini-api/docs/structured-output), using `response_json_schema` alongside application-side validation.

## 5. Health and settings

### `GET /health`

Reports health information for the local service, including database connectivity and local mode.

### `GET /config`

Returns operational configuration information, including:

- Gemini credential-supplied flag, access state (`not_configured`, `unverified`, `verified`, `failed`), model name, `checked_at` UTC timestamp, safe `message` and `error_code` (nullable).
- FFmpeg availability.
- Upload limit.
- Preferences, retention, and privacy text.

Credentials are never returned.

### `POST /config/verify-gemini`

Requires the existing demo session and same-origin mutation protection. Explicitly checks configured model access and requests a small JSON generation with a fixed connection-test prompt. Validates the response before returning `access: "verified"`. No classroom data is transmitted. Uses provider quota. No request body or credentials are accepted from the browser.

Returns the same Gemini status object as `GET /config`, including timestamp and safe diagnostic. Expected provider failures return HTTP 200 with `access: "failed"`; missing configuration returns `not_configured`. Error codes distinguish `sdk_unavailable`, `invalid_key`, `invalid_request`, `permission_denied`, `model_unavailable`, `quota_exhausted`, `timeout`, `provider_unavailable`, and `invalid_response`. Raw exceptions, URLs, keys and generated verification text are not returned. Concurrent probes are not duplicated; a caller receives the current status and an in-progress message.

`GET /config` never contacts the provider. The in-memory result survives page navigation/refresh but resets on Flask restart or an effective key/model change; each application worker has independent state. Settings explicitly refreshes after verification. Local rule recommendations remain available. The root `.env` loader preserves deployment values and supports `GOOGLE_API_KEY` as a fallback alias to `GEMINI_API_KEY`; deployment aliases override local-file aliases.

Gemini status also includes `connection_id` (a random, non-secret identifier for this application/configuration lifetime) and `revision` (starts at 0; increases on completed checks/errors). Settings ignores older revisions from the same connection, preventing an in-flight pre-verification GET from erasing a completed POST result. A different connection invalidates the old result, including after restart or key/model changes. An old backend response lacking these fields produces an explicit restart/retry error instead of claiming verification from metadata alone. No credential fingerprint is returned.

### `PUT /settings`

Updates supported application settings.

Example request:

```json
{
  "sample_seconds": 10,
  "person_detection": true
}
```

`sample_seconds` must be an integer from 2 through 60. Settings affect future jobs; they do not retroactively change completed analyses.

## 6. Students

All student endpoints require a valid demo session.

### `GET /students`

Returns the student roster, attendance rates, and per-session history.

### `POST /students`

Creates a student.

```json
{
  "identifier": "STU-001",
  "name": "Alex Green",
  "cohort": "Science"
}
```

Returns `201 Created` with the new `{ "id": ... }`.

### `PUT /students/:id`

Updates a student's registration using the same body structure.

Validation:

- `identifier`: maximum 40 characters; ASCII letters, digits, underscores, and hyphens; case-insensitive uniqueness.
- `name`: required; maximum 100 characters.
- `cohort`: optional; maximum 80 characters.

### `DELETE /students/:id`

Deletes the student and linked attendance history, subject to the application's database constraints and deletion behavior.

## 7. Sessions and attendance

### Session endpoints

| Method and path | Purpose |
|---|---|
| `GET /sessions` | Lists sessions with attendance summaries and latest analysis status |
| `GET /sessions/:id` | Returns a session and summary |
| `POST /sessions` | Creates a session |
| `PUT /sessions/:id` | Updates session metadata |
| `DELETE /sessions/:id` | Deletes a session and dependent data, subject to active-job restrictions |

Example `POST /sessions` request:

```json
{
  "title": "Ecology",
  "date": "2026-10-29",
  "instructor": "Dr Green"
}
```

Returns `201 Created` with `{ "id": ... }`.

Real sessions initialize registered students as unconfirmed roster entries. Session titles are limited to 160 characters and instructor names to 100 characters. The date must be a valid ISO date.

Deleting a session removes associated media through application code and dependent records through the configured database relationships. An active processing job prevents deletion.

### `GET /sessions/:id/attendance`

Returns attendance records and a summary:

```json
{
  "records": [
    {
      "id": 1,
      "name": "Alex Green",
      "identifier": "STU-001",
      "cohort": "Science",
      "status": "present"
    }
  ],
  "summary": {
    "present": 1,
    "absent": 0,
    "unconfirmed": 0,
    "total": 1,
    "rate": 100
  }
}
```

The example illustrates the response shape.

### `PUT /sessions/:id/attendance`

Updates attendance for roster members.

```json
{
  "records": [
    {
      "student_id": 1,
      "status": "present"
    }
  ]
}
```

Supported statuses are `present`, `absent`, and `unconfirmed`. The backend validates every entry against the session roster before writing.

### `POST /sessions/:id/roster`

Explicitly adds newly registered students of the same real/sample source to the session. Existing attendance statuses are preserved.

### Attendance-rate calculation

The session attendance rate is:

\[
\text{Attendance rate} =
100 \times \frac{\text{Present entries}}{\text{Total roster entries}}
\]

Unconfirmed entries remain in the denominator. A session with no roster has a `null` rate. A student's rate is based on their recorded sessions only.

## 8. Media analysis

### `POST /sessions/:id/media`

Uploads media for analysis.

- Content type: `multipart/form-data`.
- Required field: `file`.
- Maximum file size: 100 MB.
- Returns `202 Accepted` with an analysis ID and queued status.
- Only real sessions accept uploads.
- Supported filename suffixes are validated before storage; decoders subsequently validate the actual content.
- One active local processing job is allowed at a time.

Example response:

```json
{
  "id": 1,
  "status": "queued"
}
```

Unsupported or corrupt media produces a failed analysis job with a readable error. Processing occurs asynchronously in a local daemon thread.

### `GET /analyses?session_id=:id`

Lists analyses, optionally filtered by session.

Returned fields include:

- `id` and `session_id`
- Sanitized original filename
- `status`, `progress`, and `created_at`
- `error`, `is_demo`, and `has_media`
- `result`

Internal storage filenames are omitted.

### `DELETE /analyses/:id?media_only=true`

Deletes the original uploaded media while retaining the analysis measurements and result.

### `DELETE /analyses/:id`

Deletes the original media and analysis metrics, and may remove stale saved recommendations associated with that session. Active processing jobs cannot be deleted.

### Result interpretation

Results distinguish `kind: measured` from `kind: simulated`.

Video results can include the sampling method, duration, count estimates, scene changes, and limitations. Audio results can include RMS values, sound-active intervals, threshold, duration, and active fraction.

Missing signals are represented as `null` and described in `unavailable`. A successful video analysis may remain successful when its audio signal is unavailable. Uploads never update attendance.

**These outputs are heuristic measurements, not validated measures of individual attention, identity, speech, or learning.**

## 9. Analytics and recommendations

### `GET /analytics?start=YYYY-MM-DD&end=YYYY-MM-DD&session_id=:id`

Returns analytics with inclusive date filters and an optional session filter.

The response includes summary totals, session rows, trend points, recent events, and a demo-data flag. Each session uses its latest completed analysis. Global recent events are not filtered by the requested date period.

### `GET /recommendations`

Returns saved advisory results, including source, session title, sample marker, evidence, and timestamp.

### `POST /recommendations`

Example request:

```json
{
  "session_id": 1,
  "use_gemini": false
}
```

Returns `201 Created` when recommendations are generated and saved.

The backend builds validated aggregate metrics and applies local rules or explicitly calls Gemini when requested. If Gemini is missing or unavailable, local results can be returned with an explanatory reason.

The recommendation workflow uses aggregates; it does not send student identities or raw media to Gemini.

## 10. Demo data and exports

### `POST /demo`

Idempotently inserts twelve fictional students and six simulated sessions.

### `DELETE /demo`

Removes sample records while preserving real records.

### `GET /export/attendance.csv?session_id=:id`

Downloads a UTF-8 BOM CSV containing attendance records, including date, session, identifier, name, cohort, status, and a demonstration flag.

Cells beginning with spreadsheet formula characters are prefixed with an apostrophe to reduce formula-injection risk.

### Reports

Full report JSON and browser print/PDF reports are assembled by the frontend from the API results. JSON reports include measurements, saved recommendations, and attendance summaries. CSV exports contain identity-linked individual records.

## 11. Submission update: attendance evidence and aligned observations

All endpoints below require the existing demo cookie and local Host/Origin checks.

### Attendance timestamps/history

`GET /api/sessions/:id/attendance` adds `confirmed_at`, `updated_at`, and `source` to records, and `changes` (latest 500 events descending). Events include student ID/name, old/new status, UTC `recorded_at`, shared-demo actor, source and optional analysis/track IDs. Legacy timestamps remain null. History cascades on student/session deletion. CSV includes timestamp/source columns; report JSON includes attendance/history and excludes thumbnails.

`PUT /api/sessions/:id/attendance` rejects duplicate student IDs and validates the whole batch before writing. Repeating an already timestamped manual status does not duplicate history. Unconfirmed clears `confirmed_at` and records the change.

### `POST /api/sessions/:id/presence-confirmations`

```json
{"analysis_id": 1, "track_id": 1, "student_id": 1, "identity_confirmed": true}
```

Requires a same-session completed non-demo analysis, available original media, a roster student, and a qualified track: >=3 consecutive samples spanning >=20s with sampling <=10s. This instructor action records present with source `instructor_reviewed_track`; detection alone never changes attendance. The boolean is human attestation, not machine identity verification. Success 201; same-track/same-student replay 200 (`duplicate: true`); invalid, cross-session, insufficient or differently assigned tracks return 400. A unique index protects against duplicate review writes.

### `GET /api/analyses/:id/media`

Authenticated, no-store, conditional original-media response. Returns 401 without demo access and 404 after deletion. Browser codecs vary; there is no public media directory.

### `POST /api/sessions/:id/fusion`

```json
{"video_analysis_id": 1, "audio_analysis_id": 2, "audio_offset_seconds": 0}
```

Uses distinct completed, non-demo original analyses from the same session. One must provide video and the other audio. Offset is finite between -7200 and 7200 seconds; positive means audio starts later. Non-overlapping/cross-session/derived inputs return 400. Success 201 returns a new analysis ID, preserving originals. The new result records `derived_from`, offset, observations and fusion; face tracks/thumbnails are not duplicated. Instructors must independently check alignment.

### New analysis/preference fields

- `video.points[].faces`: frontal-face detections, capped at 100/frame; null when unavailable. HOG `count` is separate.
- `video.face_tracking`: anonymous tracks, spans, qualification, box motion, still runs, optional eye-line roll, private JPEG previews and limitations; maximum 100 tracks/analysis.
- `audio.activity_bouts`, `bouts_per_minute`, `speech_like_fraction`, `speech_method`: acoustic heuristics, not verified speech or speaker turns.
- `fusion`: versioned observable-activity formula, score, window size, offset, joint windows, and per-window visual/audio coverage. Missing values are null. Not a validated engagement measure.
- `PUT /api/settings` optionally accepts boolean `face_detection`; omission preserves its setting.
- Media-only deletion removes original media and face previews while retaining numerical metrics.

## 12. Operational and security notes

### October 30: browser capture and configurable thresholds

`POST /api/sessions/:id/capture` uses the same protected demo cookie, local-origin restrictions and shared analysis lock as recorded uploads. Send multipart fields:

- `consent`: literal `true`, explicit authorization attestation.
- `timestamps`: JSON array of 2–60 finite numeric elapsed seconds (0–120), first at most 5s, subsequent increments at least 0.5s.
- `frames`: matching repeated JPEG file fields, each nonempty and <=512 KiB, dimensions 16–960 wide and 16–720 high. Header dimensions are checked before decoding; images are re-encoded to remove metadata/trailing bytes. No caller-supplied filenames or paths are used in storage.

The server writes a private ZIP of numbered JPEGs and timestamps, then queues the existing local worker. 202 returns `{id,status:"queued"}`; validation 400; unknown session 404; shared worker busy 409; oversized request 413. Sample sessions are rejected. Capture timestamps are client-reported elapsed time, not independently verified wall-clock evidence. Arbitrary ZIP uploads are not accepted by the normal media endpoint.

`GET /api/analyses/:id/frames/:index` returns an authenticated, `no-store` JPEG for retained camera captures; missing/out-of-range/deleted frames return 404, unauthenticated requests 401. `/media` downloads the original ZIP. Camera analysis includes `source.kind="browser_camera"`, `source.frame_seconds`, clock limitations, face/scene observations and the existing fusion structure. Camera snapshot processing does not run HOG or record audio. The microphone path uploads actual PCM WAV through the existing `/media` endpoint.

New optional settings (validated atomically, omitted values preserved): `presence_seconds` integer 20–300; `presence_samples` integer 3–30; `still_motion_threshold` finite 0.001–0.2 face-widths/s; `retain_face_previews` boolean, default false. Existing `sample_seconds`, `person_detection`, `face_detection` contracts remain. Each new analysis saves its `analysis_preferences`; track qualification/review enforces that analysis's saved thresholds, with absolute floors of 20s/3 samples. Preference changes do not retroactively qualify tracks or alter attendance.

Audio adds `speech_like_intervals` (at most the first 360 intervals) and `speech_like_intervals_truncated`; the overall fraction still uses all processed samples. These are heuristic time windows, not transcription or verified speech. Head pose is explicitly unsupported.

Deleting an open/locked original file returns structured `409 media_in_use`, retaining the database record and media for a later retry. Media-only deletion otherwise removes the ZIP/original and derived face thumbnails but retains numerical observations. Reports exclude thumbnails; the explicit authenticated original-media download necessarily contains the authorized source images/audio.

- All operational endpoints require the `classroom_demo` cookie. Missing, expired, or revoked sessions return `401 demo_session_required`.
- The documented installation is local and uses request-origin restrictions rather than permissive CORS.
- Public configuration does not expose secrets and does not prove that Gemini generation is available.
- Consultation enquiries are stored locally and are not emailed.
- Readiness generation does not persist its normal result to the application database.
- Media processing is local and not backed by a durable distributed queue.
- Local rate limits and worker locks are not distributed coordination mechanisms.
- The shared demo account does not provide tenant isolation or production-grade authorization.

For implementation details, see [Architecture](ARCHITECTURE.md). For recorded test results and remaining verification gaps, see [Verification](VERIFICATION.md).

## AI Provider Manager — 30 October 2026

`GET /api/settings/ai` returns `{revision, active, providers:{gemini,groq}}`. Each provider includes model, configured/managed booleans, source (`settings`, `environment`, `none`), fixed mask, active boolean, access, checked_at, last_success_at, safe message/error_code. No key or vault identifier is returned. `active` is the single authority; verification does not activate a provider.

Mutations are `POST /api/settings/ai/:provider/:operation` with JSON, a valid employee cookie, an allowed local `Origin`, and `X-Classroom-Settings: 1`. Maximum request: 2,048 bytes. Supported operations:

- `credential`: `{key: "user-entered API key"}` — stage/read-back a Windows vault entry, atomically select its reference, reset verification. No credential is echoed.
- `activation`: `{enabled: true|false}` — enabling requires a usable credential and atomically replaces the single active provider. Disabling an inactive provider does not disable the other provider.
- `model`: `{model: "account-model-id"}` — save model and invalidate verification. Actual support is checked during testing.
- `test`: `{}` — real authenticated JSON generation; returns updated metadata with verified/failed status. A provider rejection is a successful HTTP 200 status envelope containing `access=failed`, never a false success.
- `models` (Groq): `{}` — authenticated account model list, `{models:[...]}`. Presence on this list does not guarantee text/JSON compatibility.
- `delete`: `{confirm:true}` — remove vault credential, disable if active, block automatic environment fallback.

Failures are structured: 400 invalid input/missing configuration, 401 missing session, 403 CSRF/origin/host rejection, 409 configuration changed during test, 413 oversized request, 415 wrong content type, 429 local rate limit, 503 unavailable vault. Raw SDK exceptions are not returned. Settings mutations: 30/min; tests/discovery: 6/min, shared with the legacy Gemini verification endpoint.

Persistent revisions prevent stale responses replacing newer UI state. Managed verification metadata persists across restart; environment-backed verification resets to unverified after restart while retaining its historical success time. The legacy `/api/config/verify-gemini` and `/api/config.gemini` compatibility interface remains; the new Settings UI uses `/api/settings/ai` as its authority. Recommendations still accept `use_gemini`, now meaning use the selected cloud provider, and return source `gemini`, `groq`, or `local`. Readiness uses the selected provider and validates the same Brief schema. All cloud failures preserve local operational functionality.

See [AI Provider Security](AI_PROVIDER_SECURITY.md). No schema migration or credential export was introduced.
