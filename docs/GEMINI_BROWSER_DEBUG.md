# Gemini Settings browser investigation — 30 October 2026 (IST)

## Scope and observed result

Opened the actual Vite application at `http://127.0.0.1:5173/` in the ChatGPT in-app browser, signed into the documented demo account, navigated to Settings, clicked **Verify Gemini generation**, and inspected its rendered status and browser console. Both local servers initially were unavailable; they were started from `D:\Coding\classroom-insight`.

The original spontaneous reversion could not be reproduced with a freshly started backend: the first genuine generation and following configuration request both succeeded. The prior process was no longer running, so attributing the user's earlier click conclusively to a stale Flask process would be speculation.

A specific reversion bug was confirmed separately by a failing frontend regression test: Settings unconditionally called `setVerifiedStatus(null)` whenever a new configuration object arrived. A delayed pre-verification response therefore replaced a completed verified/failed result with `unverified`. The test failed before the change and passed afterward. The old UI also accepted a metadata-only verification response without validating the generation-status contract.

## Targeted fix

- Backend status now carries a random `connection_id` and a monotonic `revision`; neither is a credential or a credential fingerprint. Restarting the backend or changing effective credentials/model creates a new connection identifier.
- Settings retains the newer revision from the same connection. A new connection correctly invalidates the old result; success is not pinned indefinitely.
- Incomplete/older backend responses produce an explicit restart-and-retry error. Transport failures remain visible in the Gemini section.
- The button displays a pending generation state. All success still requires the existing real model lookup, authenticated generation and JSON validation.

## Browser request evidence

The available browser API exposes console logs but does not expose a Network-panel API. Temporary, development-only instrumentation logged the actual fetch method, endpoint, HTTP status and allowlisted Gemini status fields during browser clicks. No request headers, cookies, keys, request bodies or classroom records were logged. That instrumentation was removed from `src/api.ts` after inspection. This was inspection of actual request/response data, **not a manual DevTools Network-tab inspection**.

Successful click at **15:54:38 IST**:

```json
{
  "method": "POST",
  "path": "/api/config/verify-gemini",
  "httpStatus": 200,
  "response": {
    "access": "verified",
    "credential_supplied": true,
    "model": "gemini-2.5-flash",
    "checked_at": "2026-10-30T10:24:38+00:00",
    "message": "Authenticated Gemini generation succeeded and the response was validated. This is a point-in-time check, not a guarantee of future quota.",
    "error_code": null
  }
}
```

The immediately following `GET /api/config` was HTTP 200 and returned the same verified Gemini fields. A full page reload also returned `verified`, `revision: 1`, and `connection_id: "9b65688cad9e41eea5b544faa0745f6d"`. Those two ordering fields were added to the diagnostic allowlist for the reload inspection. The rendered badge remained **Verified successfully**; a real viewport screenshot was inspected. No JavaScript errors or warnings were observed in the browser console for this flow.

Controlled real failure at **15:57:19 IST**:

```json
{
  "method": "POST",
  "path": "/api/config/verify-gemini",
  "httpStatus": 200,
  "response": {
    "access": "failed",
    "credential_supplied": true,
    "model": "classroom-insight-unavailable-test-model",
    "checked_at": "2026-10-30T10:27:19+00:00",
    "message": "The configured model was not found or is unavailable to this key. Check GEMINI_MODEL against models available to your project, then restart Flask.",
    "error_code": "model_unavailable",
    "connection_id": "fb04f23946c343fe9f405d42640354df",
    "revision": 1
  }
}
```

The model name was intentionally overridden only inside the disposable QA process; `.env` was not edited. Google actually rejected that model lookup; no fake provider response was installed. The application deliberately represents expected provider failures in a HTTP 200 status envelope. The following GET and full reload retained **Verification failed** and the actionable message. The override was removed by stopping that process, and normal configured generation succeeded again through a browser click at **15:59:16 IST**, after diagnostic logging had been removed.

## Tests and preservation

- Backend: `PYTEST_DISABLE_PLUGIN_AUTOLOAD=1`; `.\.venv\Scripts\python.exe -B -m pytest -p no:cacheprovider --basetemp=data/gemini-race-tests-20261030-01 -q` — **90 passed**.
- Frontend: `npm test -- --maxWorkers=1` — **49 passed**. Includes successful/failed refresh and reload, stale responses for both outcomes, backend restart invalidation, legacy response rejection and transport errors.
- `node node_modules/typescript/bin/tsc --noEmit --incremental false -p tsconfig.json` — passed.
- `npm run build` — passed.
- Browser authentication and failure tests used a SQLite backup snapshot under ignored `data/gemini-browser-debug-20261030/`; no classroom records were changed in the original database. No schema migration, reseed, commit or push was performed.
- Screenshot inspection succeeded, but saving from the browser tool to the project was denied by its filesystem permission (`EPERM`). No placeholder screenshot was created or embedded.

The tests prove response handling and ordering, not provider uptime or quota guarantees. Multi-worker deployments still need shared verification state; this project remains a local single-process application. The earlier reported production/runtime failure is not conclusively reconstructed, despite the independently reproduced refresh bug and successful current browser checks.

Final cleanup: the temporary fetch diagnostic was removed; the six focused Gemini frontend tests, explicit TypeScript check and production build passed again. A final full reload still displayed the 15:59:16 successful verification, with no console warnings/errors. All eleven original database table fingerprints and the `.env` hash matched the start-of-task baseline. A scan of changed/untracked source and built assets found none of the configured secret values. The isolated QA server was then stopped and the normal Flask server restored on port 5000 with the original database; Vite remains on 5173. This deliberate backend restart resets verification, so sign in and run verification once in the restored application. No failure-model override remains.
