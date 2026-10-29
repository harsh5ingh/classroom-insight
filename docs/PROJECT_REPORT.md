# Project Report — Classroom Insight

**Multimodal Attendance & Engagement Agent**

## 1. Abstract

Classroom Insight is a local-first instructor workspace designed to manage attendance, analyze observable classroom media signals, visualize session-level trends, and provide evidence-linked teaching suggestions.

The application combines a React and TypeScript frontend with a Flask backend and SQLite database. It supports roster-based attendance, student and session management, local video and audio analysis, reporting, and optional Gemini-powered recommendations.

The system distinguishes confirmed attendance records, anonymous media-derived estimates, and explicitly labelled synthetic demonstration data. Its recommendations are intended to support instructor reflection rather than evaluate students or make automated educational decisions.

Classroom Insight is a single-instructor local demonstration. It is not a production-ready institutional platform.

## 2. Objectives

The primary objectives are to:

- Maintain explicit, persistent attendance records.
- Provide an organized workspace for students, sessions, and classroom reports.
- Extract limited, explainable observations from supported video and audio recordings.
- Present classroom signals through visualizations and session-level summaries.
- Generate rule-based suggestions and optionally request AI-assisted guidance.
- Keep media files, database records, and provider credentials under backend control.
- Separate demonstration data and heuristic observations from verified facts.
- Document limitations, privacy considerations, and future deployment requirements.

## 3. System Architecture

The frontend handles navigation, forms, filtering, and visualization. The Flask backend validates requests, enforces application access rules, coordinates database operations, processes media, and serves API responses.

During development, Vite serves the frontend and proxies API requests to Flask. In the local built configuration, Flask can serve the frontend and API from the same origin.

```mermaid
flowchart TD
    Visitor["Institutional visitor"]
    Instructor["Instructor"]
    Public["Public homepage"]
    Login["Demo login and session"]
    Portal["Protected application routes"]
    SPA["React and TypeScript SPA"]
    API["Flask REST API"]
    DB[("Local SQLite database")]
    Media["Private local media"]
    Worker["Local analysis worker"]
    CV["OpenCV frame and person estimates"]
    Audio["NumPy audio energy analysis"]
    Rules["Deterministic recommendation rules"]
    Gemini["Optional Gemini API"]
    Reports["CSV, JSON and printable reports"]

    Visitor --> Public
    Public --> Login
    Public -->|"Validated enquiry"| API
    Public -->|"Explicit readiness request"| API
    Instructor --> Login
    Login --> Portal
    Portal --> SPA
    SPA --> API
    API --> DB
    API --> Media
    Media --> Worker
    Worker --> CV
    Worker --> Audio
    CV --> DB
    Audio --> DB
    API --> Rules
    API -. "Explicit request using aggregate metrics" .-> Gemini
    Rules --> DB
    Gemini --> API
    API --> Reports
    API --> DB
```

The diagram represents the major application flows. Actual request handling, worker lifecycle, and persistence behavior are defined by the implementation.

### 3.1 Technology stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| UI and visualization | Tailwind CSS v4, Lucide React, Recharts, React Router |
| Backend | Python, Flask |
| Database | SQLite |
| Video analysis | OpenCV |
| Audio analysis | NumPy |
| Optional audio decoding and extraction | FFmpeg |
| AI integration | Official `google-genai` Python SDK |
| Validation | Pydantic and application-level validation |
| Testing | pytest and Vitest |

## 4. Main Modules

| Module | Responsibility |
|---|---|
| `backend/app.py` | Application factory, API routes, request restrictions, upload orchestration, and built-SPA serving |
| `backend/db.py` | SQLite schema, database connections, preferences, and event records |
| `backend/analysis.py` | Video sampling, optional HOG person estimates, audio energy analysis, and optional FFmpeg extraction |
| `backend/recommendations.py` | Deterministic recommendations, aggregate prompt construction, provider checks, and fallback behavior |
| `backend/portal.py` | Public enquiries, input validation, idempotency, and hashed demo sessions |
| `backend/readiness.py` | Schema-validated readiness generation |
| `backend/capabilities.json` | Server-maintained catalogue of supported capabilities and limitations |
| `src/App.tsx` | Public and operational routing, session checks, redirects, and sign-out |
| `src/Dashboard.tsx` | Dashboard navigation, API state, notifications, and shared dialogs |
| `src/pages.tsx` | Eight operational dashboard sections |
| `src/public/` | Homepage, login and consultation dialogs, product preview, and readiness workflow |
| `src/forms.tsx`, `src/ui.tsx` | Shared forms and UI controls |
| `src/charts.tsx`, `src/ChartView.tsx` | Chart presentation and visualization helpers |
| `shared/institution-options.json` | Institution-related options shared between Python and TypeScript |
| `src/styles.css`, `src/public/public.css` | Design tokens, layout, responsive styles, and public-page presentation |

## 5. Functional Scope

### 5.1 Public website and portal

The public homepage introduces the product and explains its workflow. It includes interactive illustrative examples, an Employee Login dialog, a consultation request form, and an optional Institution Readiness Brief.

The operational application provides eight sections:

1. Overview
2. Attendance
3. Sessions
4. Engagement Analytics
5. Recommendations
6. Students
7. Reports
8. Settings

The login uses deliberately public demo credentials and a server-managed session. The dashboard identifies the environment as Demo Mode. This supports a predictable evaluation workflow but does not constitute real employee identity management or institutional authorization.

### 5.2 Attendance management

The application maintains attendance entries associated with students and sessions. Attendance states distinguish present, absent, and unconfirmed records.

Attendance rates are calculated as confirmed-present entries divided by all roster entries, including unconfirmed entries. Aggregate rates use student-session entries rather than unique students.

Historical session rosters are snapshots. Anonymous person detection does not automatically mark a student present.

### 5.3 Student and session management

The workspace supports student records, session creation, attendance workflows, and historical session information. Sample students, sessions, and analyses have explicit demonstration markers.

Loading sample data is a separate action from creating real records. Sample students do not automatically enter real session rosters, and uploaded media cannot be attached to sample sessions.

### 5.4 Analytics and reporting

The application visualizes available attendance and media-derived observations. It also supports recommendations, student histories, and available report exports.

Charts and summary metrics describe the available records and computed signals. They do not independently establish learning outcomes or student attention.

### 5.5 Institutional enquiries

The consultation form collects institution and contact information through a multi-stage workflow. Browser and backend validation are applied, and idempotency helps prevent duplicate records when a request is retried.

Enquiries persist in SQLite with a generated reference, submission details, consent information, status, and idempotency-related metadata.

**The current workflow does not send email notifications.** Enquiry retention and access remain local operational responsibilities.

### 5.6 Institution Readiness Brief

The readiness workflow accepts institution type, non-identifying workflow information, goals, requirements, and deployment preferences.

Generation occurs only after an explicit request. The backend uses `backend/capabilities.json` as its maintained capability catalogue. Model-selected capability IDs are mapped to server-controlled descriptions and limitations.

Pydantic validation constrains the structure of generated output. It does not guarantee that every generated statement is factually correct. Results are labelled as advisory, and failures should be reported explicitly rather than presented as successful generation.

## 6. Data Model and Persistence

SQLite stores classroom records, analysis results, recommendations, settings, and event history. The final portal phase adds institutional enquiry records, hashed demo-session tokens, and local rate-limit counters without intentionally replacing existing classroom data.

The primary entities include:

- **Students:** institutional identifier and optional cohort.
- **Sessions:** title, date, instructor, and session metadata.
- **Attendance:** student-session relationship and attendance state.
- **Analyses:** processing metadata and structured JSON results.
- **Recommendations:** source, evidence, timestamp, and session association.
- **Settings and events:** local preferences and event history.
- **Institutional enquiries:** reference, contact details, submission details, consent, status, and idempotency metadata.
- **Demo sessions:** hashed session tokens and expiration information.
- **Rate-limit records:** local request-control counters.

Database relationships, column definitions, and additional implementation details are documented in [ARCHITECTURE.md](ARCHITECTURE.md).

Media paths are managed by the backend and are not exposed as public static files. The local database is not encrypted by the application.

## 7. Design and User Experience

The interface uses a warm editorial visual language built around ivory, forest green, muted sage, and restrained amber.

- **DM Serif Display** is used for selected editorial headings.
- **Manrope** provides interface typography.
- Fonts are bundled locally with system fallbacks.
- The public homepage uses an asymmetric hero, product preview, numbered sections, and illustrative timelines.
- The desktop dashboard uses a persistent sidebar, while narrower layouts use a navigation drawer.
- Charts use consistent visual conventions and supporting summaries.
- Tables scroll within their own containers on smaller screens.
- Forms use labels and validation; dialogs use native modal semantics where implemented.
- Reduced-motion styling and a print stylesheet are included in the frontend.

Responsive styling and component tests do not replace a complete real-browser accessibility and visual review. See [VERIFICATION.md](VERIFICATION.md) for the recorded verification boundary.

## 8. Algorithms and Analytical Limitations

### 8.1 Person estimates

The bundled OpenCV HOG/SVM pedestrian detector estimates visible pedestrian-like objects without a separate model download.

It does not identify individuals. Its recall is poor for seated or occluded classroom participants, so it must not be treated as a reliable classroom headcount.

### 8.2 Scene-change analysis

Scene change is estimated from the mean absolute difference between sampled grayscale frames, expressed as a percentage of the intensity range.

The first sample has no preceding frame and therefore has a null difference. Results depend on sampling intervals, camera stability, and lighting.

### 8.3 Audio energy analysis

Audio processing calculates one-second RMS energy windows and applies an adaptive activity threshold:

`max(0.015, 2 × 20th-percentile RMS)`

The output includes sound-active intervals and a duration fraction. This is an energy-based signal, not speech recognition, transcription, or speaker attribution.

### 8.4 Rule-based recommendations

The documented recommendation rules include heuristic triggers for:

- Outstanding attendance.
- Low sampled scene change below 3% for at least 120 seconds.
- Scene-change range above 15 percentage points.
- Sound-active fraction below 20%.

These thresholds are prompts for instructor review, not validated educational diagnoses. Camera movement, recording conditions, and environmental noise can affect the underlying signals.

### 8.5 Multimodal interpretation

The system presents available observations from video and audio processing, but those observations should not be interpreted as definitive evidence of student engagement, emotion, understanding, or learning.

The system does not implement facial identification, emotion detection, covert recording, or individual attention scoring.

## 9. Privacy and Security

Classroom Insight is designed for a trusted, single-user local computer.

- The database and media remain in local application storage.
- Operational routes require demo access.
- The frontend does not contain database credentials or provider API keys.
- Gemini dashboard requests are explicitly triggered and use aggregate metrics rather than student names, identifiers, or media.
- Readiness generation sends user-entered workflow information to Gemini only after an explicit request.
- Public enquiry records are not exposed through a public listing endpoint.
- Exported files may contain student information and must be handled carefully.
- Retention is manual rather than automatic.

The local demo session mechanism is not a substitute for real authentication. Local rate limits are not distributed abuse protection, and application-level checks do not eliminate risks from untrusted media decoders.

## 10. Verification Summary

The verification record dated 29 October 2026 reported:

- 45 backend pytest tests passed.
- 19 frontend Vitest tests passed across three files.
- TypeScript and Vite production build passed.
- `pip check` passed.
- Live Flask/Vite integration and portal persistence checks passed.
- Synthetic WAV and AVI analysis workflows passed for the tested paths.
- A real Gemini readiness request returned HTTP 200 and passed schema validation.
- A recorded source and production-bundle secret-pattern scan found no matching configured credentials.

These are recorded results from the verification report, not a claim that every test was rerun for this document revision.

Eleven screenshot PNG files were included in the initial Git commit. The readiness-brief and mobile-homepage screenshots remain pending. The final public homepage's complete browser visual review and native modal keyboard behavior were not verified because local browser automation was unavailable during the final phase.

Synthetic tests demonstrate execution and expected behavior for tested inputs. They do not establish real-world attendance accuracy, engagement validity, or production reliability.

See [VERIFICATION.md](VERIFICATION.md) for detailed evidence, historical test results, and remaining limitations.

## 11. Scope and Future Work

Before institutional deployment, the project would require:

- Real authentication and role-based institutional authorization.
- Tenant isolation and secure account management.
- HTTPS and production cookie configuration.
- Managed backups and enforceable retention policies.
- Explicit consent and governance procedures for classroom recordings.
- Configured enquiry notifications.
- Isolated media-processing workers, resource quotas, and robust job management.
- Independent privacy and security review.
- Real-browser accessibility and responsive testing.
- Evaluation using consented classroom recordings and documented accuracy metrics.

Future detection models should report validation data and uncertainty and must not replace instructor confirmation.

Cloud and integration preferences in consultation forms are discovery inputs, not proof that those integrations are implemented.

## 12. Conclusion

Classroom Insight provides a local instructor workspace combining attendance management, session analytics, media-derived observations, reporting, and optional AI-assisted guidance.

Its principal design goal is to keep recorded facts, heuristic signals, synthetic demonstration data, and generated suggestions distinguishable. The system is suitable for local demonstration and evaluation within its documented limitations.

It should not be treated as a validated classroom surveillance, student-attention measurement, or automated educational decision-making system.

**Related documentation**

- [README](../README.md)
- [Implementation architecture](ARCHITECTURE.md)
- [REST API reference](API.md)
- [Screenshot guide](SCREENSHOTS.md)
- [Screenshot index](screenshots/README.md)
- [Verification record](VERIFICATION.md)
