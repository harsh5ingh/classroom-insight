# Optional Streamlit analytics dashboard

Activity 6.2 extends Classroom Insight without replacing React. `streamlit_app.py` renders existing session reports fetched by `dashboard_client.py::DashboardClient` from Flask. It never imports the backend, opens SQLite, manages provider keys, starts recordings, or writes attendance. Login/logout use the same backend demo session API; report reads do not generate cloud requests.

## Launch on Windows

Run from `D:\Coding\classroom-insight`:

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dashboard.txt -c requirements-lock-python313-windows.txt
.\.venv\Scripts\python.exe -m streamlit run streamlit_app.py --server.address 127.0.0.1 --server.port 8501
```

Flask must already be running on 127.0.0.1:5000 with `.\.venv\Scripts\python.exe -m backend.app`. React remains at 127.0.0.1:5173 using `npm run dev`. Visit http://127.0.0.1:8501 and sign in using the core application's documented **demo-only** credentials (`instructor@classroom.demo` / `ClassroomDemo!2026`, unless locally overridden). Never enter a Gemini/Groq API key here. The password form clears on submit.

## Working interactions

Choose a session to view attendance counts/roster, anonymous credited-presence charts where available, visual/audio/index time series, RMS energy, saved evidence-linked recommendations, audit history and provenance. Compare up to three additional sessions. Download CSV attendance or the full sanitized JSON report. Missing observations remain unavailable; recommendations must first be requested in React. No seed data is created on an empty database. Sign out clears this dashboard's backend session and client cookies.

## Security and privacy

The server-side requests client is restricted to loopback HTTP, ignores environment proxies, rejects redirects and uses timeouts. Each Streamlit session holds its own HTTP cookie in server memory, without global caching or a second database. API credentials never enter this interface. CSV formula-like cells are escaped. Reports omit face images/boxes/raw media and credentials, but include authorized roster data; downloaded files require careful handling. `.streamlit/config.toml` binds loopback, enables CORS/XSRF protection and disables usage telemetry; `.streamlit/secrets.toml` is ignored. Do not expose Streamlit or Flask publicly with shared demo authentication. Real deployment needs identity, roles/ownership, TLS, session isolation review and institutional governance.

## Verified evidence

`tests/test_streamlit_dashboard.py` has three executed tests: loopback/error sanitization; AppTest plus real ephemeral Flask HTTP login, session/track/activity charts, recommendations, comparison and logout; actionable backend failure. All use disposable synthetic records, never the real classroom DB. The expanded content test passed, with six upstream Streamlit/Pandas future deprecation warnings (`DataFrame.reset_index(inplace=True)`); no functional failure. Both `GET /_stcore/health` and `/` returned 200 on the launched service. AppTest is a simulated Streamlit runtime, not browser visual or physical-device evidence.

If Flask is unavailable or login expires, an actionable error replaces results; Retry reruns reads. No new browser screenshot exists because browser-tool permission was denied. Official testing reference: https://docs.streamlit.io/develop/api-reference/app-testing/st.testing.v1.apptest
