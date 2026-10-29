# Final-phase implementation map

## Added

- `src/public/PublicHome.tsx` — public route, section navigation, editorial narrative and modal entry points.
- `src/public/public.css` — responsive public layouts, product visuals, form/progress/review styling and restrained motion.
- `src/public/ProductVisual.tsx` — labelled illustrative browser-frame preview, attendance distribution, activity timeline and advisory components.
- `src/public/LoginDialog.tsx` — demo login validation, show/hide password, remember-me and confirmation.
- `src/public/ConsultationDialog.tsx` — three input steps, review, optional consent, validation and idempotent submission.
- `src/public/Readiness.tsx` — explicit Gemini workflow submission, sample inputs, structured output and retry.
- `src/public/Fields.tsx` — consistently labelled public form controls and accessible error descriptions.
- `src/public/PublicHome.test.tsx` — ten public/portal/readiness interaction tests.
- `src/Brand.tsx` — reusable custom brand mark and wordmark.
- `src/Dashboard.tsx` — original dashboard shell retained under `/app`, with Demo Mode and Sign Out.
- `backend/portal.py` — public API blueprint, validation, cookie demo sessions, enquiry persistence and bounded request controls.
- `backend/readiness.py` — real Gemini synthesis with a validated structured response, reusing the existing connection service.
- `backend/capabilities.json` — maintained capabilities and fixed limitations.
- `shared/institution-options.json` — common validated option lists.
- `tests/test_portal.py` — 28 portal/readiness/backend tests including parametrized cases.
- `scripts/inspect_enquiries.py` — read-only local enquiry reference verification.
- `scripts/portal_smoke.py` — repeatable live HTTP portal test with one synthetic enquiry.
- `scripts/verify_readiness.py` — explicit real-generation verification with fictional workflow data.
- `scripts/security_check.py` — credential non-disclosure and ignore-rule checks without altering repository state.
- `docs/FINAL_PHASE_FILES.md` — this implementation map.

## Modified

- `src/App.tsx` — public/guarded routing, session state and legacy redirects.
- `src/pages.tsx` — preserved operational pages; internal links point to `/app/*`.
- `src/ui.tsx` — reusable dialog with labelled header, scrollable body, persistent footer, scroll locking and restored focus.
- `src/styles.css`, `src/main.tsx`, `index.html` — shared font tokens, local font loading/preloading, dialog appearance and reduced motion.
- `src/api.ts` — structured validation errors and expired-demo-session notification.
- `src/App.test.tsx` — existing dashboard regression tests mounted under `/app/*`.
- `backend/app.py` — register the portal blueprint and endpoint-specific request-size errors; existing routes preserved.
- `backend/db.py` — additive schema initialization for enquiries, hashed sessions and local rate counters.
- `backend/recommendations.py` — configurable connection timeout reused by readiness generation.
- `tests/test_api.py` — original backend tests authenticate through the demo login fixture.
- `scripts/http_smoke.py` — original media/API verification now maintains and revokes a demo session.
- `package.json`, `package-lock.json` — locally bundled Manrope and DM Serif Display.
- `requirements.txt` — explicit Pydantic dependency (already present in the verified environment).
- `tsconfig.json` — typed shared JSON imports.
- `.env.example` — public demo defaults and local HTTPS-cookie option; the existing `.env` was not overwritten.
- `README.md`, `docs/API.md`, `docs/PROJECT_REPORT.md`, `docs/SCREENSHOTS.md`, `docs/VERIFICATION.md` — startup, evaluator workflow, API, architecture and verification evidence.

The existing database and media directory remain ignored. No Git repository, commit, push or deployment was created.
