import { afterEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SystemDiagnostics from "./SystemDiagnostics";
import SessionInsights from "./SessionInsights";
import { AudioInsights, type SpectralAudio } from "./AudioInsights";
import { Context, type DataContext } from "./data";
vi.mock("./ChartView", () => ({
  Chart: ({ label }: { label: string }) => <div>{label}</div>,
}));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const diagnostics = {
  python: "3.13.15",
  supported_python: true,
  virtual_environment: true,
  packages: { opencv: "test", mediapipe: null },
  database: "connected",
  backend: "ready",
  ffmpeg: false,
  ai: { active: "local", model: null, verification: "No cloud request made" },
  offline: {
    local_analysis: true,
    local_recommendations: true,
    cloud_requires_network: false,
  },
  privacy: {
    retained_media_records: 2,
    live_raw_retention: "none",
    uploaded_media_retention: "Until explicitly deleted",
    head_pose: "unsupported",
    mediapipe: "OpenCV active",
  },
};

test("diagnostics is read only and device enumeration requires a click", async () => {
  const enumerate = vi
    .fn()
    .mockResolvedValue([{ kind: "videoinput" }, { kind: "audioinput" }]);
  const get = vi.fn();
  vi.stubGlobal("isSecureContext", true);
  vi.stubGlobal("navigator", {
    mediaDevices: { enumerateDevices: enumerate, getUserMedia: get },
    permissions: { query: vi.fn().mockResolvedValue({ state: "prompt" }) },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ ok: true, json: async () => diagnostics }),
  );
  render(
    <MemoryRouter>
      <SystemDiagnostics />
    </MemoryRouter>,
  );
  await screen.findByText(/Frontend → backend: connected/);
  expect(enumerate).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Check device availability" }),
  );
  await screen.findByText(/1 visible camera inputs/);
  expect(get).not.toHaveBeenCalled();
  expect(screen.getByText(/not a capture test/)).toBeInTheDocument();
});

test("diagnostics surfaces backend failures and unsupported device access", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: "Backend unavailable" } }),
      }),
  );
  render(
    <MemoryRouter>
      <SystemDiagnostics />
    </MemoryRouter>,
  );
  await screen.findByText("Backend unavailable");
  expect(
    screen.queryByText(/Frontend → backend: connected/),
  ).not.toBeInTheDocument();
});

function report(id = 1) {
  return {
    session: { id, title: `Session ${id}`, is_demo: 0 },
    summary: { present: 1, absent: 0, unconfirmed: 0, rate: 100 },
    analyses: [],
    tracks: [
      {
        id: 1,
        analysis_id: 2,
        first_seen: 0,
        last_seen: 22,
        observed_presence_seconds: 20,
        qualified: true,
        confirmations: [
          {
            id: 1,
            name: "Fictional Student",
            recorded_at: "2026-10-30",
            source: "instructor_live_confirmation",
          },
        ],
      },
    ],
    attendance_changes: [],
    history_truncated: false,
    limitations: ["No verified attendance duration."],
  };
}
function evidenceView() {
  render(
    <MemoryRouter>
      <Context.Provider
        value={
          {
            sessions: [
              { id: 1, title: "One", is_demo: 0 },
              { id: 2, title: "Two", is_demo: 1 },
            ],
            students: [],
          } as unknown as DataContext
        }
      >
        <SessionInsights />
      </Context.Provider>
    </MemoryRouter>,
  );
}

test("evidence uses selected session API and weight previews never mutate records", async () => {
  const fetcher = vi.fn(async (path: string) => ({
    ok: true,
    json: async () => report(path.includes("/2/") ? 2 : 1),
  }));
  vi.stubGlobal("fetch", fetcher);
  evidenceView();
  expect(fetcher).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Session"), {
    target: { value: "1" },
  });
  await screen.findByText("No measured activity windows available.");
  expect(screen.getByText("20s")).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Download JSON report" }),
  ).toHaveAttribute("href", "/api/analytics/sessions/1/report?format=json");
  fireEvent.change(screen.getByLabelText("Preview visual weight"), {
    target: { value: "3" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Preview score weights" }),
  );
  await waitFor(() =>
    expect(
      fetcher.mock.calls.some(([path]) =>
        path.includes("visual_weight=3&audio_weight=1"),
      ),
    ).toBe(true),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Restore stored formula" }),
  );
  await waitFor(() =>
    expect(fetcher.mock.calls.at(-1)?.[0]).toBe(
      "/api/analytics/sessions/1/report",
    ),
  );
  expect(
    fetcher.mock.calls.every(
      (call) =>
        (call as unknown[])[1] === undefined ||
        !((call as unknown[])[1] as RequestInit)?.method,
    ),
  ).toBe(true);
  await act(async () => {});
});

test("evidence shows server errors without inventing session metrics", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: "Sign in again" } }),
      }),
  );
  evidenceView();
  fireEvent.change(screen.getByLabelText("Session"), {
    target: { value: "1" },
  });
  await screen.findByText("Sign in again");
  expect(screen.queryByText("20s")).not.toBeInTheDocument();
});

test("audio visualization labels sampled envelopes and acoustic limitations", () => {
  const data = {
    engine: "librosa",
    normalized_sample_rate: 16000,
    threshold: 0.015,
    features: [],
    waveform: [],
    spectrogram: [],
    feature_stride_seconds: 10,
    broadband_activity_fraction: 0,
    silence_fraction: 1,
    method: "Measured features",
    limitations: "No speech recognition",
  } as SpectralAudio;
  render(<AudioInsights data={data} />);
  expect(
    screen.getByRole("img", { name: /Coarse spectrogram/ }),
  ).toBeInTheDocument();
  expect(screen.getByText("No speech recognition")).toBeInTheDocument();
  expect(screen.getByText(/10s display stride/)).toBeInTheDocument();
});
