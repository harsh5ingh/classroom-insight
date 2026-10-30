# Classroom Insight — Architecture

## Capture extension — 30 October 2026

This extension uses the existing protected API, local worker lock and SQLite tables; **no new migration** is required. Settings are additional validated keys in the existing `settings` table. The prior additive attendance migration/backup remains unchanged.

```mermaid
flowchart LR
  U[Instructor authorization and explicit Start] --> B[src/LiveCapture.tsx]
  B --> C[src/capture.ts LocalCapture]
  C --> V[Camera: timestamped JPEG snapshots in memory]
  C --> A[Microphone: mono PCM samples in memory]
  V --> R[Stop and review; explicit upload]
  A --> W[pcmWav encoder]
  W --> R
  R -->|JPEGs and relative timestamps| E[POST /api/sessions/id/capture]
  R -->|PCM WAV| M[Existing POST /api/sessions/id/media]
  E --> K[Validate limits; strip JPEG metadata; private ZIP]
  K --> J[Existing process_job and shared lock]
  M --> J
  J --> CV[backend/capture.py analyze_camera or analysis.py analyze_media]
  CV --> O[FaceObserver / PresenceTracker / fuse_signals]
  O --> D[(Existing analyses table: result JSON and preferences)]
  D --> UI[CameraFrames / PresenceReview / FusionPanel]
  UI -->|Explicit identity attestation only| AT[Existing guarded attendance confirmation]
```

`LocalCapture` releases tracks, timers, audio nodes and AudioContext on stop, close, cancellation, device failure and tab hiding. Late permission responses are stopped after disposal. Capture is capped at 120 seconds; camera storage at 60 JPEGs, microphone sample storage at 120 seconds. This is live acquisition followed by batch analysis, not continuous inference. Camera mode does not request microphone permission and does not collect audio. Microphone mode uses a compatibility ScriptProcessor PCM path with silent output; it does not depend on FFmpeg or speech services.

`backend/capture.py::validate_capture` checks bounds, timestamp ordering, JPEG dimensions before decoding and decoder success. The server alone builds ZIP member names; it does not extract caller-provided archives. `analyze_camera` uses actual client-reported elapsed timestamps, so sparse gaps do not establish uninterrupted presence. Original snapshots are individually available only through protected `capture_frame`; ZIPs remain under private uploads and share existing deletion controls. HOG is reserved for the recorded-video path. Camera metadata expressly discloses its limited sampling and unverified clock.

Presence duration, consecutive sample count and still-motion threshold are saved with each new analysis. Defaults are 20s, 3 samples and 0.02 face-widths/s. Review enforces saved settings plus absolute floors (20s/3 samples); changing current settings cannot rewrite earlier evidence. Optional face previews default off. Head pose remains unsupported; two-eye image roll is never presented as a calibrated head-pose estimate.

No camera/microphone media is sent to Gemini. Explicit teaching-recommendation requests may send aggregate metrics through the existing backend provider path. Standard JSON reports exclude face thumbnails; original-media download is a separate authorized operation and includes original images/audio. New source metadata and preferences are included in analysis JSON for provenance.

**Source inspection:** 29 October 2026

This document describes the existing local implementation, not proposed enterprise infrastructure.

Related documentation:
- [API contracts](API.md)
- [Verification evidence](VERIFICATION.md)
- [Screenshot inventory and capture status](SCREENSHOTS.md)
- [Project report](PROJECT_REPORT.md)
- [Final-phase implementation map](FINAL_PHASE_FILES.md)

## 1. System overview

```mermaid
flowchart LR
    Browser["Browser"] --> Vite["Vite :5173<br/>React SPA"]
    Vite -->|"API proxy"| Flask["Flask :5000<br/>backend/app.py"]
    Browser -.->|"Alternative: built SPA"| Flask

    Flask --> Portal["backend/portal.py<br/>Demo login, enquiries, readiness"]
    Flask --> Core["Operational REST routes<br/>Students, sessions, attendance,<br/>analytics and exports"]

    Portal --> DB["backend/db.py<br/>Parameterized SQLite connections"]
    Core --> DB
    DB --> SQLite[("data/classroom.sqlite3<br/>WAL + foreign keys")]

    Core --> Media["Private uploads<br/>UUID filenames"]
    Media --> Worker["backend/analysis.py<br/>Local background worker"]
    Worker --> DB

    Core --> Recommendations["backend/recommendations.py<br/>Aggregates + local rules"]
    Recommendations --> DB

    Portal --> Readiness["backend/readiness.py<br/>Structured-output validation"]
    Catalog["backend/capabilities.json"] --> Readiness
    Readiness --> Connection["Existing model-verification helper"]
    Recommendations -.->|"Explicit Gemini request"| Connection
    Connection --> SDK["Official google-genai SDK"]
    Env["Backend-only .env<br/>Key and model configuration"] --> SDK
    SDK --> Gemini["Gemini API"]
```

### Main components

- **Application entry and routing:** `src/main.tsx` mounts React and `BrowserRouter`. `src/App.tsx` separates the public `/` route from guarded `/app/*` routes. Legacy dashboard paths redirect under `/app`, preserving query strings.
- **Public experience:** `src/public/` contains the homepage, illustrative product visuals, login and consultation dialogs, and the readiness form. Switching illustrative session examples is local; readiness generation is a separate explicit backend request.
- **Dashboard:** `src/Dashboard.tsx` loads shared operational state through `src/api.ts` and exposes it through `src/data.tsx`. `src/pages.tsx` contains the eight dashboard screens.
- **Charts:** `src/ChartView.tsx` lazy-loads Recharts components from `src/charts.tsx`.
- **Shared UI:** `src/ui.tsx` provides reusable controls and dialogs. Fonts are bundled locally. Tailwind v4 tokens are defined in `src/styles.css`, with public-page layouts in `src/public/public.css`.
- **Development and production serving:** `vite.config.ts` proxies `/api` requests to port 5000. After a frontend build, Flask's SPA fallback serves `dist/index.html` for frontend deep links and serves existing build assets. Unknown `/api/*` paths return JSON errors instead of the SPA shell.
- **External services:** The frontend does not access SQLite or Gemini directly. Uploaded media is not exposed through a public file-serving route. There is no configured email-delivery service, institutional account system, or integration platform.

## 2. Frontend-to-backend request flow

```mermaid
sequenceDiagram
    actor User
    participant SPA as React / App.tsx
    participant API as src/api.ts + Vite proxy
    participant Guard as Flask request checks
    participant Portal as backend/portal.py
    participant DB as SQLite

    User->>SPA: Open homepage or protected route
    SPA->>API: GET /api/auth/session
    API->>Guard: Same-origin request
    Guard->>Portal: Validate local Host
    Portal->>DB: Check token hash and expiry, if present
    Portal-->>SPA: Authentication state, mode=demo

    alt No active session on /app/*
        SPA-->>User: Return to / and show login
    end

    User->>SPA: Submit demo credentials
    SPA->>API: POST /api/auth/login
    API->>Guard: JSON request
    Guard->>Portal: Check Origin and Sec-Fetch-Site
    Portal->>Portal: Validate fields, rate-limit and compare credentials
    Portal->>DB: Store hashed opaque token with expiry
    Portal-->>SPA: Set HttpOnly, SameSite=Strict cookie
    SPA-->>User: Navigate to /app and show Demo Mode

    SPA->>API: Request operational endpoint
    API->>Guard: Cookie sent on same-origin request
    Guard->>DB: Require active demo session
    Guard-->>SPA: JSON data or structured error

    User->>SPA: Sign out
    SPA->>Portal: POST /api/auth/logout
    Portal->>DB: Revoke token
    Portal-->>SPA: Clear cookie
    SPA-->>User: Return to public homepage
```

`src/api.ts` converts JSON API errors into `ApiError` instances, including field-level validation details. A `demo_session_required` error dispatches an event that returns the UI to the login flow.

Flask disables API response caching and sends security headers for MIME-type sniffing, referrer policy, and frame denial. Write requests reject foreign origins and cross-site fetch metadata. The documented deployment is loopback-only.

### Demo-session behavior

- The session token is stored in SQLite as a SHA-256 hash rather than as a plaintext token.
- Normal sessions expire after eight hours. **Remember me** uses a seven-day expiry and persistent cookie.
- The cookie's `Secure` attribute defaults to `false` for local HTTP. HTTPS deployments require appropriate secure-cookie configuration.
- Demo credentials are intentionally public for evaluation.
- Demo users share the same local records. There is no employee identity system, role-based authorization, or tenant isolation.

This is demonstration authentication, not production institutional authentication.

## 3. Public workflows

Consultation enquiries and Institution Readiness Brief generation are separate workflows.

```mermaid
flowchart TD
    Consultation["ConsultationDialog.tsx<br/>Contact → Organization → Requirements → Review"]
    Consultation -->|"POST /api/enquiries + Idempotency-Key"| Validate["Validate allowed options<br/>and bounded fields"]
    Options["shared/institution-options.json"] --> Validate

    Validate --> Dedupe["Hash normalized payload<br/>and submission key"]
    Dedupe -->|"New key"| Insert["Insert institutional_enquiries<br/>Server-generated reference and timestamp"]
    Dedupe -->|"Same key and payload"| Replay["Return existing reference"]
    Dedupe -->|"Same key, changed payload"| Conflict["Return 409 Conflict"]
    Insert --> Saved["Saved locally<br/>email_sent = false"]

    ReadinessUI["Readiness.tsx<br/>Explicit Generate Brief action"]
    ReadinessUI -->|"POST /api/readiness-brief"| Workflow["Validate five workflow fields<br/>Reject extra fields and detected email patterns"]
    Workflow --> Generation["readiness.generate_brief<br/>Verify model and request structured output"]
    Generation --> Schema["Validate brief with Pydantic"]
    Schema --> Grounding["Resolve capability IDs using catalog<br/>Append fixed limitations"]
    Grounding --> Result["Return Gemini-sourced advisory brief<br/>No database persistence"]

    Generation -->|"Unavailable, quota, timeout or invalid output"| Failure["Sanitized error and explicit retry<br/>No fabricated fallback brief"]
```

### Consultation enquiries

The consultation form validates its inputs against shared options and bounded field constraints. Submission uses an idempotency key to avoid creating duplicate records on retries. Reusing a key with a different payload returns a conflict.

Successful submissions are stored locally in `institutional_enquiries`, with a server-generated reference, timestamp, and initial status. They are not emailed automatically.

### Institution Readiness Brief

Readiness generation is an explicit user action. The backend validates the workflow inputs, requests structured output from Gemini, validates the response with Pydantic, resolves capability IDs against `backend/capabilities.json`, and appends fixed limitations.

- Contact details from consultation enquiries are not attached to readiness requests.
- Readiness does not read stored student/session records or uploaded media.
- The email-pattern check is not a complete anonymization service.
- Readiness results are not persisted to the database.
- Failures produce sanitized errors and a retry option, not a fabricated AI-generated brief.
- Deterministic teaching recommendations are a separate workflow and must not be presented as a generated readiness brief.

No public enquiry-list or enquiry-detail endpoint is provided.

## 4. Session, media-analysis, and recommendation flow

```mermaid
flowchart TD
    Roster["Registered students"] --> Create["POST /api/sessions<br/>Title, date, instructor"]
    Create --> Snapshot["Create session and unconfirmed attendance snapshot<br/>Exclude demo students for real sessions"]

    Instructor["Instructor confirmation"] -->|"PUT /api/sessions/:id/attendance"| Attendance["Update valid roster entries<br/>present / absent / unconfirmed"]
    NewStudents["Later registrations"] -->|"POST /api/sessions/:id/roster"| Snapshot

    Upload["UploadForm.tsx<br/>Multipart file"] -->|"POST /api/sessions/:id/media"| Validate["Require real session<br/>Supported suffix, nonempty file, 100 MB limit"]
    Validate --> Lock["Acquire process-local job lock"]
    Lock --> Store["Save UUID-named upload<br/>Insert queued analyses row"]
    Store --> Reply["Return HTTP 202 and analysis ID"]
    Store --> Thread["Daemon thread<br/>analysis.process_job"]

    Thread --> Decode["analyze_media<br/>Up to 2 hours / 360 video samples"]
    Decode --> Video["OpenCV sampled grayscale differences<br/>Optional HOG/SVM person estimates"]
    Decode --> WAV["PCM WAV: one-second NumPy RMS<br/>Threshold and sound-active intervals"]
    Decode -.->|"Other audio or video audio, if FFmpeg is available"| FFmpeg["Temporary mono 16 kHz WAV"]
    FFmpeg --> WAV

    Video --> Complete["Store result JSON<br/>Mark complete and progress 100%"]
    WAV --> Complete
    Thread -->|"Decode or processing failure"| Failed["Store failed status and readable error"]

    Complete --> Poll["GET /api/analyses<br/>Dashboard polls every 2 seconds while active"]
    Failed --> Poll
    Poll --> Charts["Session results and analytics"]
    Attendance --> Charts

    Charts --> Suggestions["POST /api/recommendations<br/>Aggregates → local rules or explicit Gemini request"]
    Suggestions --> SavedSuggestions["Persist recommendations<br/>with source and evidence"]
```

### Attendance and session records

Creating a session initializes attendance records as unconfirmed. Instructor confirmation updates valid roster entries. Later student registrations can be added to a session's roster.

**Media analysis does not modify attendance.** Analysis results and attendance records remain separate data sources.

The submission update adds `backend/observations.py`: frontal-face Haar detection, anonymous IoU tracks, face-box motion, conditional eye-line roll, and timestamp-aligned activity windows. `src/Observations.tsx` presents these results, instructor review, the activity formula/coverage and separate-recording alignment. It never maps tracks to student identity automatically.

```mermaid
flowchart LR
    Frames[Sampled frames] --> Faces[Haar face detector]
    Faces --> Tracks[Conservative anonymous IoU tracks]
    Tracks --> Review[Original recording + instructor identity review]
    Review -->|Explicit confirmed roster choice| Attendance[Timestamped attendance + change event]
    Frames --> Visual[Scene-change intervals]
    WAV[PCM WAV] --> Sound[Sound-active intervals + acoustic heuristic]
    Visual --> Fusion[Time-window feature fusion]
    Sound --> Fusion
    Offset[Instructor-checked audio offset] --> Fusion
    Fusion --> Index[Observable activity index + coverage]
    Index --> Reports[Analytics / reports / advisory rules]
```

Tracks need >=3 consecutive samples spanning >=20s with sampling <=10s before review can confirm attendance. Missed/ambiguous matches break runs; crossings can still misassociate faces. Protected original playback requires demo access. Face previews are local derived data, excluded from JSON exports and removed with original-media deletion.

Fusion normalizes visual change by 10%, caps it at 100, computes sound-active duration fraction, averages available components per window, then duration-weights window scores. Missing components remain absent. Gaps >1.5 nominal frame intervals are excluded. Separate recordings can be explicitly aligned via `/api/sessions/:id/fusion`, creating a derived analysis with source IDs and offset. No student-level engagement or internal attention score is calculated.

### Media processing

The analysis worker uses local processing:

- **Video:** OpenCV samples frames, compares grayscale frames for scene changes, and can use HOG/SVM person estimates.
- **Audio:** NumPy computes one-second RMS energy values from supported PCM WAV input, using a threshold to estimate sound-active intervals.
- **Audio extraction:** Other audio formats and audio embedded in video depend on FFmpeg availability and successful conversion to temporary mono 16 kHz WAV.
- **Results:** Analysis records retain status, progress, output JSON, and readable errors where applicable. Missing signals and limitations can be retained in the result.

HOG/SVM estimates do not identify students. RMS energy is not speech recognition, speaker attribution, or a measure of individual attention. Scene-change and sound-activity signals are heuristics, not validated educational diagnoses.

Temporary extracted WAV files are removed after processing. The original upload remains until explicitly deleted.

### Worker and concurrency constraints

`init_db` marks queued or processing analyses as failed when the application process starts, because background jobs are not durable across restarts.

In normal operation, a daemon thread and process-local lock provide limited concurrency control. Tests can execute the worker synchronously. There is no external job queue, durable worker service, or distributed lock.

**Run a single application process for the documented local workflow.** A multi-process deployment would require different job coordination and recovery behavior.

### Analytics and exports

- `GET /api/analytics` filters by session/date range and uses each session's latest completed analysis.
- Attendance rate divides confirmed-present entries by all roster entries, including unconfirmed entries.
- `GET /api/export/attendance.csv` exports attendance records with formula-safe cell handling.
- Session JSON and browser print/PDF reports are assembled by the frontend.
- Recommendations are generated from aggregates using local rules or an explicitly requested Gemini workflow, then persisted with their source and supporting evidence.

## 5. Actual SQLite schema

The diagram below describes the application tables declared in `backend/db.py`. JSON payloads are stored in SQLite `TEXT` columns. Relationship lines represent declared foreign keys.

```mermaid
erDiagram
    students ||--o{ attendance : "student_id / CASCADE"
    sessions ||--o{ attendance : "session_id / CASCADE"
    sessions ||--o{ analyses : "session_id / CASCADE"
    sessions ||--o{ recommendations : "session_id / CASCADE"
    students ||--o{ attendance_changes : "student_id / CASCADE"
    sessions ||--o{ attendance_changes : "session_id / CASCADE"
    analyses |o--o{ attendance_changes : "analysis_id / SET NULL"

    students {
        INTEGER id PK
        TEXT identifier UK "NOT NULL; COLLATE NOCASE"
        TEXT name "NOT NULL"
        TEXT cohort "NOT NULL; default empty"
        INTEGER is_demo "NOT NULL; default 0"
    }

    sessions {
        INTEGER id PK
        TEXT title "NOT NULL"
        TEXT date "NOT NULL; ISO date validated by API"
        TEXT instructor "NOT NULL"
        INTEGER is_demo "NOT NULL; default 0"
        TEXT created_at "NOT NULL"
    }

    attendance {
        INTEGER session_id PK, FK "Composite key"
        INTEGER student_id PK, FK "Composite key"
        TEXT status "present, absent, unconfirmed"
        TEXT confirmed_at "Nullable UTC; unknown for legacy records"
        TEXT updated_at "Nullable UTC"
        TEXT source "Default legacy"
    }

    attendance_changes {
        INTEGER id PK
        INTEGER session_id FK
        INTEGER student_id FK
        TEXT previous_status
        TEXT status
        TEXT recorded_at "UTC"
        TEXT source
        INTEGER analysis_id FK "Nullable"
        INTEGER track_id "Nullable; unique with analysis_id when both present"
        TEXT actor "Shared Demo instructor; not employee identity"
    }

    analyses {
        INTEGER id PK
        INTEGER session_id FK "NOT NULL"
        TEXT filename "NOT NULL"
        TEXT stored_name "Nullable after original-media deletion"
        TEXT status "NOT NULL"
        INTEGER progress "NOT NULL; default 0"
        TEXT result "Nullable JSON"
        TEXT error "Nullable"
        INTEGER is_demo "NOT NULL; default 0"
        TEXT created_at "NOT NULL"
    }

    recommendations {
        INTEGER id PK
        INTEGER session_id FK "NOT NULL"
        TEXT source "NOT NULL"
        TEXT items "NOT NULL; JSON"
        TEXT note "Nullable"
        TEXT created_at "NOT NULL"
    }

    settings {
        TEXT key PK
        TEXT value "NOT NULL; JSON"
    }

    events {
        INTEGER id PK
        TEXT message "NOT NULL"
        TEXT created_at "NOT NULL"
        INTEGER is_demo "NOT NULL; default 0"
    }

    demo_sessions {
        TEXT token_hash PK
        INTEGER expires_at "NOT NULL; Unix seconds"
        TEXT created_at "NOT NULL"
    }

    institutional_enquiries {
        INTEGER id PK
        TEXT reference UK "Server-generated"
        TEXT created_at "NOT NULL"
        TEXT idempotency_hash UK "NOT NULL"
        TEXT payload_hash "NOT NULL"
        TEXT contact_name "NOT NULL"
        TEXT work_email "NOT NULL"
        TEXT organization_name "NOT NULL"
        TEXT details "Validated JSON"
        INTEGER consent "0 or 1"
        TEXT status "New, Reviewed, Closed"
    }

    public_rate_limits {
        TEXT scope PK "Composite key"
        INTEGER window PK "Composite key"
        INTEGER hits "NOT NULL"
    }
```

### Relationships and persistence behavior

- `attendance` has a composite key using `session_id` and `student_id`.
- `students`, `sessions`, `attendance`, `analyses`, and `recommendations` have the foreign-key relationships shown in the diagram.
- `settings`, `events`, `demo_sessions`, `institutional_enquiries`, and `public_rate_limits` have no declared foreign-key relationships in this schema.
- There is no employee/user table and no relationship between demo sessions and student identities.
- Recommendations reference a session rather than an analysis row. Deleting an analysis can remove that session's saved recommendations through application code.
- Deleting original media retains analysis measurements. Deleting a session removes associated files through application code and cascades dependent rows through SQLite.

Connections enable foreign keys and use a 15-second SQLite timeout. Initialization uses `CREATE TABLE IF NOT EXISTS` and WAL mode. `migrate_attendance` detects missing timestamp/source columns, creates a SQLite backup in `data/backups/`, and transactionally adds the missing columns. Legacy timestamps remain null. This is one additive migration, not a general migration framework. There is no automatically enforced retention policy. Attendance history is retained until its student/session is deleted.

Database files, original media, secrets, and generated private artifacts are excluded from Git. Shared example data is explicitly labelled.

## 6. Deployment and trust boundaries

The implementation is intended for local evaluation, not direct institutional deployment.

| Area | Current implementation | Production requirement |
|---|---|---|
| Identity | Public demo credentials | Real identity provider and account lifecycle |
| Authorization | Shared demo session | Roles, permissions, and tenant isolation |
| Transport | Local HTTP supported | HTTPS and secure cookie configuration |
| Persistence | Local SQLite | Managed storage, backup, recovery, and retention policy |
| Media jobs | In-process daemon thread | Isolated, durable job processing |
| Rate limiting | Local SQLite counters | Deployment-appropriate shared rate limiting |
| Notifications | Enquiries stored locally | Explicitly configured and tested delivery service |
| AI integration | Optional Gemini API | Key management, quota controls, monitoring, and data governance |
| Privacy | Documented data boundaries | Institutional consent, access, deletion, and retention policies |
| Measurement validity | Heuristic media signals | Independent validation before operational decisions |

### Security and privacy boundaries

- Keep `.env` and real credentials out of version control.
- Do not expose uploaded media through a public file-serving route.
- Do not treat the demo cookie or shared demo account as institutional authorization.
- Do not treat the email-pattern check as proof that readiness inputs contain no identifying information.
- Review what data is sent to external AI services before enabling Gemini in a real deployment.
- Do not use heuristic classroom-analysis outputs as validated measures of student attention, identity, or educational performance.

Classroom Insight does not, by itself, establish regulatory compliance or production security readiness. Institutional use requires an appropriate authentication and authorization model, secure deployment configuration, a defined data-retention policy, managed backups, monitoring, and independent security and privacy review.

## Provider manager extension — 30 October 2026

`src/AIProviders.tsx` is composed into the existing Settings page. `backend/providers.py` registers guarded settings routes, wraps Windows Credential Manager, owns provider metadata and exclusive activation, and exposes `cloud_json` through `GeminiProvider`/`GroqProvider`. `recommendations.generate` retains deterministic local rules; `readiness.generate_brief` retains its validated product-grounded schema. Existing Gemini compatibility endpoints remain. No new database tables or migration were added.

```mermaid
sequenceDiagram
  participant U as Settings
  participant F as Flask guards
  participant M as Provider manager
  participant V as Windows vault
  participant D as SQLite settings
  participant P as Selected provider SDK
  U->>F: Save key (session, Origin, custom header)
  F->>M: Validated bounded JSON
  M->>V: Stage new version and read back
  M->>D: Commit reference and revision (no key)
  M->>V: Retire old version
  M-->>U: Masked metadata
  U->>F: Explicit test
  F->>M: Rate-limited request
  M->>V: Resolve managed key (or disclosed env fallback)
  M->>P: Fixed JSON generation request
  P-->>M: Actual output
  M->>D: Record validated outcome if revision unchanged
  M-->>U: Status + monotonic revision
```

The single `settings.ai_provider_manager` row stores `active`, revision and per-provider metadata. It is filtered out of analysis preferences. `BEGIN IMMEDIATE` serializes selection changes across SQLite connections. Keys are versioned OS-vault entries, not columns or JSON fields. A vault/database crash is not a distributed atomic transaction; compensating cleanup and its limitations are documented in [AI Provider Security](AI_PROVIDER_SECURITY.md).
