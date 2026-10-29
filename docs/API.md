# REST API reference

Base `/api`. JSON request bodies require `Content-Type: application/json`; uploads use multipart form field `file`. Errors are `{ "error": { "code": "validation_error", "message": "…" } }`. Typical codes: 400 validation, 403 foreign Host/Origin, 404 missing record, 409 identifier conflict or busy worker, 413 too large, 500 unexpected failure. API responses disable caching. Local frontend uses a same-origin proxy; permissive CORS is not enabled.

All operational endpoints below (configuration, students, sessions, attendance, analyses, analytics, recommendations, settings, exports and demo data) now require the `classroom_demo` cookie. Missing/expired/revoked sessions return 401 `demo_session_required`. Existing route paths and data contracts are otherwise preserved. Health and the following visitor endpoints are public on the loopback installation.

## Public configuration and demo sessions

- `GET /public/config`: `{enquiries_available:true,email_delivery:false,authentication:"demo_only",readiness:{credential_supplied:boolean,access:"unverified"|"not_configured"}}`. Database connectivity is checked; environment presence never means generation has been verified. No provider request occurs.
- `GET /auth/session`: `{authenticated:boolean,mode:"demo"}`. Validates the cookie's SHA-256 token hash against the database and expiration.
- `POST /auth/login`: `{email,password,remember?:boolean}`; 2 KB limit, 12 attempts/minute per local installation. Public default credentials are in README. Invalid values return 400, mismatched credentials 401. Success rotates the server token and returns `{authenticated:true,mode:"demo",message}` plus HttpOnly/SameSite=Strict cookie. Eight-hour expiry normally; seven days with persistent Max-Age when remember=true. Secure is controlled by backend `DEMO_COOKIE_SECURE` and defaults false for local HTTP.
- `POST /auth/logout`: revokes the matching token, clears the cookie and returns `{authenticated:false}`. Idempotent. No frontend bearer token or password is persisted.

These sessions support a local demonstration, not institutional account security. Existing Host, Origin and Sec-Fetch-Site write restrictions also apply to public endpoints.

## Institutional enquiries

`POST /enquiries` requires a JSON object and an `Idempotency-Key` header of 20–100 ASCII letters, digits, underscores or hyphens. The body limit is 24 KB. A browser generates a random key once per open consultation flow and reuses it for retries.

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
  "requirements": ["Digital attendance records", "Reports and exports"],
  "problem": "We need consistent records across teaching sessions.",
  "success_criteria": "A small pilot that reduces reconciliation work.",
  "deployment_model": "Local/on-premises",
  "timeline": "Exploring options",
  "notes": "",
  "contact_consent": false
}
```

Required text lengths: contact name 2–100, work email up to 254 with email syntax, role 2–120, organization name 2–160, country 2–80, region 2–100, problem and success criteria 20–2000. Optional work phone up to 40 and notes up to 2000. Counts must be integers (not booleans): learners 1–10,000,000; locations 1–100,000. Consent must be boolean and defaults false. Requirements must be a nonempty unique array. All option values are defined in `shared/institution-options.json` and validated on the server.

201: `{reference:"CI-<12 uppercase hex characters>",saved_locally:true,email_sent:false,duplicate:false}`. Same key and normalized payload returns the same reference with 200/duplicate=true; changed payload with the same key returns 409 `submission_conflict`. Reference, creation timestamp and initial `New` status are server-generated; client-supplied identities/statuses are ignored. Insertion is parameterized and unique constraints protect concurrent retries. New submissions are limited to 20 per 10 minutes for this local installation.

Validation returns 400 `{error:{code:"validation_error",message,fields:{fieldName:message}}}`. Request-size failures return 413; exceeded limits return 429 with Retry-After. Unexpected storage failures return sanitized 500 JSON. There is **no public GET/list/detail endpoint**. `scripts/inspect_enquiries.py` reads reference metadata locally without printing contact information. No email integration exists.

## Institution Readiness Brief

`POST /readiness-brief`, maximum 10 KB:

```json
{
  "organization_type": "College or university",
  "workflow": "Instructors maintain attendance in separate spreadsheets.",
  "goals": "Explore a consented pilot with consistent instructor review.",
  "deployment_model": "Local/on-premises",
  "requirements": ["Digital attendance records"]
}
```

Only these five fields are accepted. Workflow and goals must be 20–1600 characters; known email patterns are rejected. This is a data-minimization contract, not a comprehensive PII detector. Do not include names, student identifiers, contact details or private records. Enquiry details and stored classroom records are never automatically attached.

Success 200: `{source:"gemini",capability_version,notice,brief:{summary,capabilities:[{title,description}],pilot_scope:string[],privacy_considerations:string[],implementation_questions:string[],next_steps:string[],unanswered_questions:string[],limitations:string[]}}`. Pydantic validates model output; known capability IDs are replaced by exact server-maintained descriptions, and fixed limitations are appended. The brief is returned without database persistence. The verification script explicitly saves fictional test output locally.

One concurrent generation per process and eight requests per 10 minutes per local installation. Model verification and generation each have a 45-second client timeout. 409 means an in-process generation is active; 429 indicates local rate limiting or provider quota; 503 indicates unavailable access, generation failure or invalid output. Errors are sanitized and never contain provider exception text or credentials. No sample is substituted. Local teaching recommendations remain available through the existing recommendations service.

The Gemini implementation follows the official [structured-output API documentation](https://ai.google.dev/gemini-api/docs/structured-output), using `response_json_schema` with additional application-side validation.

## Health and settings

- `GET /health`: database connectivity, local mode.
- `GET /config`: Gemini supplied/unverified status, model name, FFmpeg availability, upload limit, preferences, retention and privacy text. Never returns credentials.
- `POST /config/verify-gemini`: explicit model-access request; returns access and message. Local fallback remains usable.
- `PUT /settings`: `{ "sample_seconds": 10, "person_detection": true }`; interval integer 2–60. Applies to future jobs.

## Students

- `GET /students`: roster with attendance rate and per-session history.
- `POST /students`: `{ "identifier": "STU-001", "name": "Alex Green", "cohort": "Science" }` → 201 `{id}`.
- `PUT /students/:id`: same body, edits registration. Identifier max 40 characters, ASCII letters/digits/underscore/hyphen; case-insensitive uniqueness. Name required, max 100; cohort optional, max 80.
- `DELETE /students/:id`: deletes student and linked attendance history.

## Sessions and attendance

- `GET /sessions`: sessions with attendance summaries and latest analysis status.
- `GET /sessions/:id`: session and summary.
- `POST /sessions`: `{ "title": "Ecology", "date": "2026-10-29", "instructor": "Dr Green" }` → 201 `{id}`. Real registered students become unconfirmed roster entries.
- `PUT /sessions/:id`: same body. Title max 160, instructor max 100; valid ISO date required.
- `DELETE /sessions/:id`: deletes session, attendance, analyses, media and suggestions. Active processing prevents deletion.
- `GET /sessions/:id/attendance`: `{records:[{id,name,identifier,cohort,status}],summary:{present,absent,unconfirmed,total,rate}}`.
- `PUT /sessions/:id/attendance`: `{ "records": [{ "student_id": 1, "status": "present" }] }`. Valid statuses: present, absent, unconfirmed. Validates every entry against the session roster before writing.
- `POST /sessions/:id/roster`: explicitly adds newly registered students of the same real/sample source; existing statuses are preserved.

Rate is `100 * present / total`; no roster yields null. Unconfirmed entries count in the denominator. A student’s rate uses their recorded sessions only.

## Analysis

- `POST /sessions/:id/media`: multipart `file`, maximum 100 MB. Returns 202 `{id,status:"queued"}`. One active local job; poll `GET /analyses`. Supported suffixes are validated before storage, and decoders verify actual content during analysis. Unsupported/corrupt media produces a failed job with a readable error. Sample sessions reject uploads.
- `GET /analyses?session_id=:id`: optional filter. Returns id, session_id, original sanitized filename, status, progress, created_at, error, is_demo, has_media and result. Internal storage names are omitted.
- `DELETE /analyses/:id?media_only=true`: removes original media, retains metrics.
- `DELETE /analyses/:id`: removes original and metrics, plus potentially stale saved session suggestions. Processing jobs cannot be deleted.

Results distinguish `kind: measured|simulated`. Video includes sampling method, duration, count estimates, scene changes and limitations. Audio includes RMS series, energy-active intervals, threshold, duration and active fraction. Missing signals are null and described in `unavailable`. Successful video with missing audio remains successful. Uploads never alter attendance.

## Analytics and recommendations

- `GET /analytics?start=YYYY-MM-DD&end=YYYY-MM-DD&session_id=:id`: inclusive date filters and optional session. Summary totals, session rows, trend points, recent events and demo flag. Each session uses its latest completed analysis. Global recent events are not filtered by period.
- `GET /recommendations`: saved advisory results with source, session title, sample marker, evidence and timestamp.
- `POST /recommendations`: `{ "session_id": 1, "use_gemini": false }` → 201. Backend builds validated aggregate metrics, applies rules or explicitly calls Gemini. Missing/unavailable Gemini returns local results with a reason. No student identity or raw media is sent.

## Demo and export

- `POST /demo`: idempotently inserts twelve fictional students and six simulated sessions.
- `DELETE /demo`: removes sample records, preserving real records.
- `GET /export/attendance.csv?session_id=:id`: UTF-8 BOM CSV download with date, session, identifier, name, cohort, status and demonstration flag. Cells beginning with spreadsheet formula characters are prefixed with an apostrophe.
- Full report JSON and print/PDF are assembled in the browser from the same documented API results. JSON contains measurements, saved suggestions and attendance summaries; CSV supplies identity-linked individual records.
