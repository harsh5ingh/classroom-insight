# Genuine Application Screenshots

## Capture status — 29 October 2026

**Screenshot gallery status: Incomplete.** The browser automation tool returned `Local browser use is disabled in Work settings`, including after the user reported enabling it twice and the tool session was reset. The browser permission restriction was not bypassed using another browser driver or native-window control.

No new screenshots were captured in that attempt. No synthetic UI images, placeholder PNGs, edited mockups, or generated application screenshots were created. The root README therefore should not embed screenshots that do not exist.

The repository does not have an installed `playwright` or `@playwright/test` dependency/configuration. No automation dependency was added solely to work around the browser restriction.

The backend health endpoint previously returned HTTP 200. The existing Vite process was left intact; a frontend launch attempt reported port 5173 occupied, and a subsequent connection check failed. The existing production build may be served by Flask at `http://127.0.0.1:5000/` if it is available and current. This is the real application, not a screenshot substitute.

No new Gemini readiness generation was triggered during that attempt because the result could not be captured through the browser. Refer to [verification evidence](../VERIFICATION.md) for previously recorded generation checks.

**Important:** The inventory below describes planned screenshots. It does not assert that these files currently exist.

## Intended capture index

Use a desktop viewport of 1440 × 1000 CSS pixels at device scale factor 1 where possible. Save actual PNG captures in this directory using the exact filenames below.

| File | Route / state | Capture requirements |
|---|---|---|
| `public-homepage.png` | `/`, top of page | Hero, navigation, consultation CTA, and labelled illustrative product preview. Viewport capture. |
| `employee-login.png` | `/`, Employee Login modal | Heading, email/password fields, Sign in button, and blurred background. Exclude the help block that prints the public demo password. Leave the password field empty. |
| `consultation-form.png` | `/`, consultation modal | Initial contact step, empty fields, and progress indicator. |
| `consultation-form-review.png` | Consultation modal, final Review step | Use fictional data from the example below. Review only; do not submit. |
| `readiness-brief.png` | `/#readiness` | Actual result after selecting **Use sample information** and clicking **Generate Brief**. Show the Gemini/advisory source label and supporting sections. |
| `readiness-brief-detail.png` | Readiness result, lower section | Optional additional capture if the complete result does not fit in one image. |
| `dashboard.png` | `/app` | Demo Mode, sample-data disclosure, overview cards, chart, and recent sessions. Use a full-page capture if needed. |
| `attendance.png` | `/app/attendance` | Sample session roster, attendance states, and filters. Do not change attendance just to stage the screenshot. |
| `engagement-analytics.png` | `/app/analytics` | Date/session filters, chart labels, sample-data indicator, and explanatory text. |
| `recommendations.png` | `/app/recommendations` | Existing suggestions, source, evidence, and sample-session context. Identify saved recommendations accurately. |
| `sessions.png` | `/app/sessions` | Existing labelled sample sessions and available controls. |
| `students.png` | `/app/students` | Fictional sample roster only; never include real student details. |
| `reports.png` | `/app/reports` | Report view and export controls. Do not include the operating-system print dialog. |
| `settings.png` | `/app/settings` | Non-secret configuration status, preferences, and retention controls. Do not reveal `.env` values or reset data. |
| `mobile-homepage.png` | `/`, 390 × 844 CSS pixels | Real mobile hero layout and primary CTA. Verify that the navigation menu opens and closes. |

## Manual browser capture procedure

### 1. Start or reuse the application

From PowerShell in the current project root, `D:\Coding\classroom-insight`, start the backend in one terminal:

```powershell
.\.venv\Scripts\python.exe -m backend.app
```

If the virtual environment or dependencies are missing, follow the setup instructions in the root [README](../../README.md).

In a separate terminal, start Vite only if the existing frontend is not already running:

```powershell
npm run dev
```

Use `http://127.0.0.1:5173/` when Vite is responsive. If port 5173 is occupied, first identify whether the existing process belongs to this project. Do not kill unrelated processes. If the current production build is available through Flask, use `http://127.0.0.1:5000/`.

Run `npm run build` first if frontend source has changed since the last build. Do not reset SQLite, overwrite `.env`, or insert duplicate demo records just to capture screenshots.

### 2. Set a consistent viewport

In Chrome, Edge, or Brave:

1. Open a dedicated tab for the local application.
2. Set page zoom to 100%.
3. Open DevTools and enable the device toolbar.
4. Select Responsive and set 1440 × 1000 with device scale factor 1 where available.
5. Use the browser's supported screenshot workflow to capture the viewport or the full page.
6. Ensure DevTools and browser chrome do not appear in the image.

Wait for locally bundled fonts and charts to render, and for loading notices to disappear. Move the pointer to a neutral area to avoid unintended tooltips. Dismiss unrelated browser popups without accepting credential-saving prompts.

For the Employee Login image, capture only the modal heading through the Sign in button and enough background to show the modal context. The current modal may print the public demo password in its help text. **Do not publish a screenshot containing that printed password.** Do not alter the application UI or fill the password field merely to stage the capture. If the sensitive block cannot be safely excluded through the capture framing, leave the screenshot uncaptured.

### 3. Use fictional data and existing records

Keep the existing classroom sample dataset unchanged. Use the documented demo login privately, keep the password masked, and verify that dashboard records are marked as sample or fictional.

If real records appear, use a sample-only filter/session or skip the capture. Do not reset the database or create unnecessary records to stage a screenshot.

For the consultation review screenshot, use this fictional example:

- **Contact:** Evaluation Contact; `evaluation@example.org`; role: Teaching lead.
- **Institution:** Illustrative College; type: College or university; phone: blank.
- **Location:** India; region: Delhi; learners: 200; locations: 1.
- **Attendance method:** Spreadsheets.
- **Requirements:** Digital attendance records; Reports and exports.
- **Problem:** “Fictional evaluation: maintain consistent attendance records across teaching sessions.”
- **Pilot success:** “Fictional evaluation: review one course with an instructor before considering a wider pilot.”
- **Deployment:** Local/on-premises.
- **Timeline:** Exploring options.
- **Notes:** “Fictional screenshot example, not a real enquiry.”
- **Consent:** Leave optional contact consent unchecked.

Advance to the Review step, capture the image, and close the dialog without submitting. This avoids creating an unnecessary database record.

### 4. Capture a genuine readiness result

1. Navigate to the readiness section.
2. Select **Use sample information**.
3. Click **Generate Brief** once.
4. Wait for the request to finish.
5. Verify that the visible result identifies its source as **Generated by Gemini · advisory** or the equivalent label used by the current UI.
6. If needed, inspect the browser Network panel and confirm that `/api/readiness-brief` returned HTTP 200 with `source: "gemini"` and a structured `brief`.
7. Close DevTools before capturing the screenshot.

Never paste an earlier JSON response into the UI or substitute a static illustrative example for a real generation. Never include credentials, environment values, cookies, or request headers in the screenshot.

If generation fails, record the sanitized error and leave the success screenshot missing. Do not relabel a failure or static example as a successful Gemini result.

### 5. Inspect and integrate the screenshots

Save each PNG in this directory using the exact filename from the index. Open each original image locally at 100% and verify:

- Text is readable.
- Dialogs, charts, and content boundaries are not unintentionally clipped.
- Sample-data and source labels are accurate.
- No loading states or unrelated popups remain.
- No secrets or real personal data are visible.
- The image depicts the actual application, without retouching application content.

Record the actual route, viewport, capture date, and whether the image is a viewport, full-page capture, or safely framed region.

Only after the files exist and have been inspected:

- Add selected screenshots to the root README using repository-relative paths, such as `docs/screenshots/public-homepage.png`.
- Add the complete gallery here using paths relative to this directory.
- Use descriptive captions that distinguish illustrative homepage visuals, persisted sample classroom records, saved recommendations, and newly generated Gemini output.

Finally, verify that all Markdown image paths resolve and each PNG can be opened. Until these checks are complete, keep the gallery marked **Incomplete**. Do not create empty image files to satisfy links.