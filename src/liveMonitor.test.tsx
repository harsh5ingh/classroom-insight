import { afterEach, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LiveMonitor, AudioWindows, rms, type LiveState } from "./liveMonitor";
import LiveDashboard from "./LiveDashboard";
import { Context, type DataContext } from "./data";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const snapshot: LiveState = {
  id: "live-test",
  session_id: 1,
  analysis_id: 2,
  started_at: "2026-10-30T00:00:00Z",
  elapsed_seconds: 0,
  frames_processed: 0,
  processing_ms: 0,
  processed_fps: 0,
  tracks: [],
  windows: [],
  visible: 0,
  qualified: 0,
  confirmed: 0,
  audio: null,
  scene_change: null,
  warning: "",
  closed: false,
  track_limit_reached: false,
  audio_intervals: [],
};
const settings = {
  session_id: 1,
  consent: true,
  fps: 4,
  minimum_seconds: 20,
  minimum_samples: 3,
  maximum_gap: 10,
};
function device() {
  const stop = vi.fn();
  const events: Record<string, () => void> = {};
  return {
    stop,
    events,
    stream: {
      getTracks: () => [
        {
          stop,
          addEventListener: (n: string, f: () => void) => {
            events[n] = f;
          },
        },
      ],
    },
  } as unknown as {
    stop: ReturnType<typeof vi.fn>;
    events: Record<string, () => void>;
    stream: MediaStream;
  };
}
function setup() {
  vi.useFakeTimers();
  vi.stubGlobal("isSecureContext", true);
  const camera = device();
  const get = vi.fn().mockResolvedValue(camera.stream);
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: get } });
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", {
    value: 640,
    configurable: true,
  });
  Object.defineProperty(video, "videoHeight", { value: 480 });
  Object.defineProperty(video, "readyState", { value: 2, configurable: true });
  vi.spyOn(video, "play").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) =>
    cb(new Blob(["synthetic-test-only"], { type: "image/jpeg" })),
  );
  const fetcher = vi.fn(async (path: string) => ({
    ok: true,
    status: 200,
    json: async () =>
      path.endsWith("/start") ? snapshot : { ...snapshot, frames_processed: 1 },
  }));
  vi.stubGlobal("fetch", vi.fn((path: string) => path === "/api/health"
    ? Promise.resolve({ok: true, status: 200, json: async () => ({live_monitor: {protocol: 1}})})
    : fetcher(path)));
  const update = vi.fn(),
    status = vi.fn(),
    micStatus = vi.fn();
  const monitor = new LiveMonitor(video, update, status, micStatus);
  return { camera, get, video, fetcher, update, status, micStatus, monitor };
}
test("RMS and acoustic windows use supplied samples, not speech labels", () => {
  expect(rms(new Float32Array([0.5, -0.5]))).toBe(0.5);
  expect(rms(new Float32Array([0, 0]))).toBe(0);
  const w = new AudioWindows();
  w.add(0, 0.1);
  w.add(0.05, 0.1);
  w.add(0.1, 0);
  const packet = w.take()!;
  expect(packet.active_fraction).toBeCloseTo(2 / 3);
  expect(packet.intervals).toEqual([
    { start: 0, end: 0.05 },
    { start: 0.05, end: 0.1 },
  ]);
  expect(w.take()).toBeNull();
});

test("audio metadata remains bounded during delayed encoding", () => {
  const windows = new AudioWindows();
  for (let i = 0; i < 1000; i++) windows.add(i * 0.05, 0.1);
  expect(windows.count).toBeLessThanOrEqual(100);
  expect(windows.intervals.length).toBeLessThanOrEqual(100);
});

test("stalled camera playback releases the stream after the startup deadline", async () => {
  const x = setup();
  vi.spyOn(x.video, "play").mockImplementation(() => new Promise(() => {}));
  void x.monitor.start(settings);
  await vi.advanceTimersByTimeAsync(10001);
  expect(x.camera.stop).toHaveBeenCalled();
  expect(x.status).toHaveBeenLastCalledWith(
    "stopped",
    expect.stringContaining("startup timed out"),
  );
});
test("camera permission denial creates no backend run", async () => {
  const x = setup();
  x.get.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  await x.monitor.start(settings);
  expect(x.status).toHaveBeenLastCalledWith(
    "stopped",
    expect.stringContaining("permission denied"),
  );
  expect(x.fetcher).not.toHaveBeenCalled();
});
test("late camera permission after stop releases the device", async () => {
  const x = setup();
  let resolve!: (s: MediaStream) => void;
  x.get.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const pending = x.monitor.start(settings);
  await vi.advanceTimersByTimeAsync(0);
  x.monitor.stop();
  resolve(x.camera.stream);
  await pending;
  expect(x.camera.stop).toHaveBeenCalled();
  expect(x.fetcher).not.toHaveBeenCalled();
});
test("continuous frame processing uses a bounded one-request pipeline", async () => {
  const x = setup();
  let frames = 0;
  x.fetcher.mockImplementation(async (path: string) => {
    if (path.endsWith("/frame")) {
      frames++;
      return await new Promise(() => {});
    }
    return { ok: true, status: 200, json: async () => snapshot };
  });
  await x.monitor.start(settings);
  await vi.advanceTimersByTimeAsync(1200);
  expect(frames).toBe(1);
  expect(x.monitor.dropped).toBeGreaterThan(0);
  x.monitor.stop();
  expect(x.camera.stop).toHaveBeenCalled();
  expect(x.video.srcObject).toBeNull();
});
test("camera disconnect releases resources and ends the backend run", async () => {
  const x = setup();
  await x.monitor.start(settings);
  await vi.advanceTimersByTimeAsync(1);
  x.camera.events.ended();
  expect(x.status).toHaveBeenLastCalledWith(
    "stopped",
    expect.stringContaining("Camera disconnected"),
  );
  expect(x.camera.stop).toHaveBeenCalled();
  expect(x.fetcher.mock.calls.some(([p]) => p.endsWith("/end"))).toBe(true);
});
test("camera without usable frames times out before creating a backend run", async () => {
  const x = setup();
  Object.defineProperty(x.video, "videoWidth", { value: 0 });
  const pending = x.monitor.start(settings);
  await vi.advanceTimersByTimeAsync(10001);
  await pending;
  expect(x.status).toHaveBeenLastCalledWith(
    "stopped",
    expect.stringContaining("startup timed out"),
  );
  expect(x.camera.stop).toHaveBeenCalled();
});
test.each([410, 503])(
  "backend %s stops devices and requires an explicit restart",
  async (code) => {
    const x = setup();
    x.fetcher.mockImplementation(async (path: string) =>
      path.endsWith("/frame")
        ? {
            ok: false,
            status: code,
            json: async () =>
              ({
                error: { message: "Backend unavailable or restarted" },
              }) as unknown as LiveState,
          }
        : { ok: true, status: 200, json: async () => snapshot },
    );
    await x.monitor.start(settings);
    await vi.advanceTimersByTimeAsync(1);
    expect(x.camera.stop).toHaveBeenCalled();
    expect(x.status).toHaveBeenLastCalledWith(
      "stopped",
      expect.stringContaining("start again"),
    );
  },
);
test("a busy backend drops frames without creating a retry queue", async () => {
  const x = setup();
  x.fetcher.mockImplementation(async (path: string) => ({
    ok: !path.endsWith("/frame"),
    status: path.endsWith("/frame") ? 429 : 200,
    json: async () => snapshot,
  }));
  await x.monitor.start(settings);
  await vi.advanceTimersByTimeAsync(750);
  expect(x.monitor.dropped).toBeGreaterThan(0);
  expect(x.camera.stop).not.toHaveBeenCalled();
  x.monitor.stop();
});
test("microphone denial leaves camera running and closes audio resources", async () => {
  const x = setup();
  const close = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal(
    "AudioContext",
    class {
      resume = async () => {};
      close = close;
    },
  );
  await x.monitor.start(settings);
  x.get.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  await x.monitor.startMicrophone();
  expect(x.micStatus).toHaveBeenLastCalledWith(
    "error",
    expect.stringContaining("permission denied"),
  );
  expect(close).toHaveBeenCalled();
  expect(x.camera.stop).not.toHaveBeenCalled();
  x.monitor.stop();
});
test("microphone processing sends numeric windows only and releases both devices", async () => {
  const x = setup();
  const mic = device();
  const close = vi.fn().mockResolvedValue(undefined);
  const disconnect = vi.fn();
  vi.stubGlobal(
    "AudioContext",
    class {
      resume = async () => {};
      close = close;
      createMediaStreamSource = () => ({ connect: vi.fn(), disconnect });
      createAnalyser = () => ({
        fftSize: 2048,
        disconnect,
        getFloatTimeDomainData: (samples: Float32Array) => samples.fill(0.1),
      });
    },
  );
  await x.monitor.start(settings);
  x.get.mockResolvedValue(mic.stream);
  await x.monitor.startMicrophone();
  await vi.advanceTimersByTimeAsync(600);
  expect(x.micStatus).toHaveBeenCalledWith("live");
  x.monitor.stop();
  expect(mic.stop).toHaveBeenCalled();
  expect(close).toHaveBeenCalled();
  expect(disconnect).toHaveBeenCalled();
  expect(x.camera.stop).toHaveBeenCalled();
});
function renderDashboard() {
  return render(
    <MemoryRouter>
      <Context.Provider
        value={
          {
            sessions: [{ id: 1, title: "QA session", is_demo: 0 }],
            newSession: vi.fn(),
            refresh: vi.fn().mockResolvedValue(undefined),
          } as unknown as DataContext
        }
      >
        <LiveDashboard />
      </Context.Provider>
    </MemoryRouter>,
  );
}
test("dashboard is opt-in and shows unavailable observations honestly", async () => {
  const get = vi.fn();
  vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: get } });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => ({ records: [] }) })),
  );
  renderDashboard();
  expect(
    screen.getByRole("button", { name: "Start camera monitoring" }),
  ).toBeDisabled();
  expect(get).not.toHaveBeenCalled();
  expect(
    screen.getByText("No anonymous face tracks observed yet."),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Classroom session"), {target: {value: "1"}});
  fireEvent.click(screen.getByLabelText(/I have authorization/));
  expect(
    screen.getByRole("button", { name: "Start camera monitoring" }),
  ).toBeEnabled();
  await act(async () => {});
});
test("dashboard shows roster API errors and releases on hide/unmount", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: "Backend disconnected" } }),
    })),
  );
  const stop = vi
    .spyOn(LiveMonitor.prototype, "stop")
    .mockImplementation(() => {});
  vi.spyOn(LiveMonitor.prototype, "start").mockResolvedValue();
  const view = renderDashboard();
  fireEvent.change(screen.getByLabelText("Classroom session"), {target: {value: "1"}});
  await screen.findByText("Backend disconnected");
  fireEvent.click(screen.getByLabelText(/I have authorization/));
  fireEvent.click(
    screen.getByRole("button", { name: "Start camera monitoring" }),
  );
  Object.defineProperty(document, "hidden", {
    value: true,
    configurable: true,
  });
  fireEvent(document, new Event("visibilitychange"));
  expect(stop).toHaveBeenCalled();
  view.unmount();
  expect(stop.mock.calls.length).toBeGreaterThan(1);
  Object.defineProperty(document, "hidden", {
    value: false,
    configurable: true,
  });
});


test("stale backend is rejected before camera access or a live POST", async () => {
  const x = setup();
  const request = vi.fn().mockResolvedValue({ok: true, status: 200, json: async () => ({status: "ok"})});
  vi.stubGlobal("fetch", request);
  await x.monitor.start(settings);
  expect(request).toHaveBeenCalledWith("/api/health", expect.anything());
  expect(request).toHaveBeenCalledTimes(1);
  expect(x.get).not.toHaveBeenCalled();
  expect(x.status).toHaveBeenLastCalledWith("stopped", expect.stringContaining("Restart the Flask backend"));
});

test("camera waits for usable video dimensions before starting frame processing", async () => {
  const x = setup();
  Object.defineProperty(x.video, "readyState", {value: 0, configurable: true});
  const pending = x.monitor.start(settings);
  await vi.advanceTimersByTimeAsync(100);
  expect(x.fetcher).not.toHaveBeenCalled();
  expect(x.video.srcObject).toBe(x.camera.stream);
  Object.defineProperty(x.video, "readyState", {value: 2});
  await vi.advanceTimersByTimeAsync(50);
  await pending;
  expect(x.fetcher.mock.calls.some(([path]) => path.endsWith("/start"))).toBe(true);
  x.monitor.stop();
});

test("late microphone permission after cancellation cannot restart monitoring", async () => {
  const x = setup();
  vi.stubGlobal("AudioContext", class {
    resume = async () => {};
    close = vi.fn().mockResolvedValue(undefined);
  });
  await x.monitor.start(settings);
  const mic = device();
  let resolve!: (stream: MediaStream) => void;
  x.get.mockImplementation(() => new Promise<MediaStream>(r => { resolve = r; }));
  const pending = x.monitor.startMicrophone();
  await vi.advanceTimersByTimeAsync(0);
  x.monitor.stopMicrophone();
  resolve(mic.stream);
  await pending;
  expect(mic.stop).toHaveBeenCalled();
  expect(x.micStatus).toHaveBeenLastCalledWith("off");
  x.monitor.stop();
});

test("session selection is explicit even when non-sample QA sessions exist", async () => {
  vi.stubGlobal("fetch", vi.fn());
  renderDashboard();
  expect(screen.getByLabelText("Classroom session")).toHaveValue("");
  fireEvent.click(screen.getByLabelText(/I have authorization/));
  expect(screen.getByRole("button", {name: "Start camera monitoring"})).toBeDisabled();
  expect(screen.getByRole("button", {name: "New session"})).toBeEnabled();
  expect(fetch).not.toHaveBeenCalled();
});
