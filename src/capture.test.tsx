import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import {
  LocalCapture,
  pcmWav,
  captureError,
  type CaptureResult,
} from "./capture";
import { LiveCapture } from "./LiveCapture";
import { Context, type DataContext } from "./data";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function device() {
  const stop = vi.fn(),
    ended = vi.fn();
  return {
    stop,
    stream: {
      getTracks: () => [{ stop, addEventListener: ended }],
    } as unknown as MediaStream,
  };
}
function camera() {
  vi.useFakeTimers();
  vi.stubGlobal("isSecureContext", true);
  const d = device();
  vi.stubGlobal("navigator", {
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(d.stream) },
  });
  const video = document.createElement("video");
  Object.defineProperty(video, "videoWidth", {
    value: 640,
    configurable: true,
  });
  Object.defineProperty(video, "videoHeight", { value: 480 });
  vi.spyOn(video, "play").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
    (callback) =>
      callback(new Blob(["synthetic-image"], { type: "image/jpeg" })),
  );
  return { ...d, video };
}
function read(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
}

test("PCM encoding preserves real sample values in a valid mono WAV header", async () => {
  const bytes = new DataView(
    await read(pcmWav([new Float32Array([-2, -0.5, 0, 0.5, 2])], 16000)),
  );
  expect(bytes.getUint32(24, true)).toBe(16000);
  expect(bytes.getUint32(40, true)).toBe(10);
  expect([0, 1, 2, 3, 4].map((i) => bytes.getInt16(44 + i * 2, true))).toEqual([
    -32768, -16384, 0, 16384, 32767,
  ]);
  expect(() => pcmWav([], 16000)).toThrow(/No usable/);
});
test("camera snapshots use elapsed timestamps and stop every media track", async () => {
  const { video, stop } = camera(),
    done = vi.fn();
  const capture = new LocalCapture("camera", video, vi.fn(), done);
  await capture.start();
  await vi.advanceTimersByTimeAsync(4000);
  capture.finish();
  const result = done.mock.calls[0][0] as CaptureResult;
  expect(result.mode).toBe("camera");
  if (result.mode !== "camera") throw Error("wrong mode");
  expect(result.seconds).toEqual([0, 2, 4]);
  expect(result.frames).toHaveLength(3);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(video.srcObject).toBeNull();
  await vi.advanceTimersByTimeAsync(10000);
  expect(done).toHaveBeenCalledTimes(1);
});
test("camera auto-stop limits capture to sixty frames and releases hardware", async () => {
  const { video, stop } = camera(),
    done = vi.fn();
  const capture = new LocalCapture("camera", video, vi.fn(), done);
  await capture.start();
  await vi.advanceTimersByTimeAsync(120000);
  expect(done.mock.calls[0][0].frames).toHaveLength(60);
  expect(stop).toHaveBeenCalledTimes(1);
});
test("cancelled permission request stops a stream that resolves after disposal", async () => {
  const { video, stream, stop } = camera();
  let resolve!: (s: MediaStream) => void;
  vi.mocked(navigator.mediaDevices.getUserMedia).mockReturnValue(
    new Promise((r) => (resolve = r)),
  );
  const done = vi.fn(),
    capture = new LocalCapture("camera", video, vi.fn(), done);
  const pending = capture.start();
  capture.dispose();
  resolve(stream);
  await pending;
  expect(stop).toHaveBeenCalledTimes(1);
  expect(done).not.toHaveBeenCalled();
});
test("empty camera frames release resources and expose an error", async () => {
  const { video, stop } = camera();
  Object.defineProperty(video, "videoWidth", { value: 0 });
  const done = vi.fn();
  await new LocalCapture("camera", video, vi.fn(), done).start();
  expect(stop).toHaveBeenCalledTimes(1);
  expect(done.mock.calls[0][0]).toBeNull();
  expect(done.mock.calls[0][1]).toMatch(/empty frame/);
});
test("insecure and denied device access provide useful errors without uploads", async () => {
  const { video } = camera(),
    done = vi.fn();
  vi.stubGlobal("isSecureContext", false);
  await new LocalCapture("camera", video, vi.fn(), done).start();
  expect(done.mock.calls[0][1]).toMatch(/localhost or HTTPS/);
  vi.stubGlobal("isSecureContext", true);
  vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
    new DOMException("Denied", "NotAllowedError"),
  );
  await new LocalCapture("camera", video, vi.fn(), done).start();
  expect(done.mock.calls[1][1]).toMatch(/permission denied/);
  expect(captureError(new DOMException("missing", "NotFoundError"))).toMatch(
    /No matching/,
  );
  expect(captureError(new DOMException("busy", "NotReadableError"))).toMatch(
    /busy/,
  );
});
test("microphone produces PCM audio without monitoring and closes audio resources", async () => {
  const { video, stop } = camera();
  const disconnect = vi.fn(),
    close = vi.fn().mockResolvedValue(undefined);
  const processor = {
    connect: vi.fn(),
    disconnect,
    onaudioprocess: null as
      | null
      | ((e: { inputBuffer: { getChannelData: () => Float32Array } }) => void),
  };
  const mute = { connect: vi.fn(), disconnect, gain: { value: 1 } };
  class FakeAudio {
    sampleRate = 16000;
    state = "running";
    destination = {};
    resume = vi.fn().mockResolvedValue(undefined);
    close = close;
    createMediaStreamSource() {
      return { connect: vi.fn(), disconnect };
    }
    createScriptProcessor() {
      return processor;
    }
    createGain() {
      return mute;
    }
  }
  vi.stubGlobal("AudioContext", FakeAudio);
  const done = vi.fn(),
    capture = new LocalCapture("microphone", video, vi.fn(), done);
  await capture.start();
  processor.onaudioprocess!({
    inputBuffer: { getChannelData: () => new Float32Array(1600).fill(0.2) },
  });
  capture.finish();
  expect(done.mock.calls[0][0].wav.type).toBe("audio/wav");
  expect(done.mock.calls[0][0].seconds).toBe(0.1);
  expect(mute.gain.value).toBe(0);
  expect(close).toHaveBeenCalledTimes(1);
  expect(stop).toHaveBeenCalledTimes(1);
  expect(processor.onaudioprocess).toBeNull();
  expect(disconnect).toHaveBeenCalledTimes(3);
});
test("capture UI requires authorization and reports permission denial", async () => {
  vi.stubGlobal("isSecureContext", true);
  const getUserMedia = vi
    .fn()
    .mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(navigator), { mediaDevices: { getUserMedia } }),
  );
  render(
    <Context.Provider
      value={
        {
          sessions: [{ id: 7, title: "Test lesson", is_demo: 0 }],
          refresh: vi.fn(),
        } as unknown as DataContext
      }
    >
      <LiveCapture sessionId={7} onClose={vi.fn()} />
    </Context.Provider>,
  );
  expect(getUserMedia).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: /Start visible/ })).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(screen.getByRole("button", { name: /Start visible/ }));
  await screen.findByText(/Device permission denied/);
  expect(screen.getByRole("button", { name: /Start visible/ })).toBeEnabled();
});
test("capture UI unmount cancels outstanding permission and releases late stream", async () => {
  vi.stubGlobal("isSecureContext", true);
  const d = device();
  let resolve!: (s: MediaStream) => void;
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(navigator), {
      mediaDevices: {
        getUserMedia: () => new Promise<MediaStream>((r) => (resolve = r)),
      },
    }),
  );
  const { unmount } = render(
    <Context.Provider
      value={
        {
          sessions: [{ id: 7, title: "Test lesson", is_demo: 0 }],
          refresh: vi.fn(),
        } as unknown as DataContext
      }
    >
      <LiveCapture sessionId={7} onClose={vi.fn()} />
    </Context.Provider>,
  );
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: /Start visible/ }));
  unmount();
  await act(async () => resolve(d.stream));
  expect(d.stop).toHaveBeenCalledTimes(1);
});

test("reviewed camera capture uploads once through the real form contract", async () => {
  camera();
  Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", {
    get: () => 640,
    configurable: true,
  });
  Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", {
    get: () => 480,
    configurable: true,
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const OriginalURL = URL;
  vi.stubGlobal(
    "URL",
    class extends OriginalURL {
      static createObjectURL() {
        return "blob:review";
      }
      static revokeObjectURL() {}
    },
  );
  const fetch = vi
    .fn()
    .mockResolvedValue({
      ok: true,
      json: async () => ({ id: 1, status: "queued" }),
    });
  vi.stubGlobal("fetch", fetch);
  const close = vi.fn(),
    refresh = vi.fn().mockResolvedValue(undefined);
  render(
    <Context.Provider
      value={
        {
          sessions: [{ id: 7, title: "Test lesson", is_demo: 0 }],
          refresh,
        } as unknown as DataContext
      }
    >
      <LiveCapture sessionId={7} onClose={close} />
    </Context.Provider>,
  );
  fireEvent.click(screen.getByRole("checkbox"));
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Start visible/ }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000);
  });
  fireEvent.click(screen.getByRole("button", { name: "Stop capture" }));
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(
      screen.getByRole("button", { name: "Upload capture & analyze" }),
    );
  });
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, options] = fetch.mock.calls[0];
  expect(url).toBe("/api/sessions/7/capture");
  expect(options.body.get("consent")).toBe("true");
  expect(options.body.getAll("frames")).toHaveLength(2);
  expect(JSON.parse(options.body.get("timestamps"))).toEqual([0, 2]);
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(close).toHaveBeenCalledTimes(1);
});
