import { api, write } from "./api";
import { captureError } from "./capture";

export interface LiveTrack {
  id: number;
  first_detected_at: string;
  last_detected_at: string;
  samples: number;
  presence_seconds: number;
  span_seconds: number;
  qualified: boolean;
  visible: boolean;
  state: string;
  box: number[];
  movement: number | null;
  longest_still_seconds: number;
  inactivity_intervals: { start: number; end: number }[];
  confirmed_student_id: number | null;
}
export interface LiveWindow {
  seconds: number;
  end_seconds: number;
  visual: number | null;
  sound: number | null;
  score: number | null;
  modalities: number;
  visual_coverage: number;
  audio_coverage: number;
}
export interface LiveState {
  id: string;
  session_id: number;
  analysis_id: number;
  started_at: string;
  elapsed_seconds: number;
  frames_processed: number;
  processing_ms: number;
  processed_fps: number;
  tracks: LiveTrack[];
  windows: LiveWindow[];
  visible: number;
  qualified: number;
  confirmed: number;
  audio: null | { rms: number; active_fraction: number };
  scene_change: number | null;
  warning: string;
  closed: boolean;
  track_limit_reached: boolean;
  audio_intervals: { start: number; end: number }[];
}
export const liveWrite = (data: unknown = {}) => ({
  ...write("POST", data),
  headers: { "X-Classroom-Live": "1" },
});
export function rms(samples: Float32Array) {
  return Math.sqrt(
    samples.reduce((sum, v) => sum + (Number.isFinite(v) ? v * v : 0), 0) /
      Math.max(1, samples.length),
  );
}

export class AudioWindows {
  start: number | null = null;
  end = 0;
  sum = 0;
  active = 0;
  count = 0;
  intervals: { start: number; end: number }[] = [];
  lastLevel = 0;
  add(second: number, level: number) {
    // Bound metadata even if encoding stalls or the event loop is delayed.
    if (this.count >= 100 || (this.start !== null && second - this.start > 5))
      this.take();
    if (
      this.count &&
      this.lastLevel >= 0.02 &&
      second > this.end &&
      second - this.end <= 0.15
    ) {
      this.intervals.push({ start: this.end, end: second });
    }
    this.lastLevel = level;
    if (this.start === null) this.start = second;
    this.end = second;
    this.sum += level;
    this.active += Number(level >= 0.02);
    this.count++;
  }
  take() {
    const result =
      this.count > 1 &&
      this.start !== null &&
      this.end > this.start &&
      this.end - this.start <= 5
        ? {
            start: this.start,
            end: this.end,
            rms: this.sum / this.count,
            active_fraction: this.active / this.count,
            intervals: this.intervals,
          }
        : null;
    this.start = null;
    this.sum = 0;
    this.active = 0;
    this.count = 0;
    this.intervals = [];
    return result;
  }
}

/** At most one encoded frame/request in flight. No accumulated media or retry queue. */
export class LiveMonitor {
  private stream?: MediaStream;
  private mic?: MediaStream;
  private audio?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private analyser?: AnalyserNode;
  private timer?: ReturnType<typeof setInterval>;
  private audioTimer?: ReturnType<typeof setInterval>;
  private deadline?: ReturnType<typeof setTimeout>;
  private abort?: AbortController;
  private cancelReady?: () => void;
  private micStarting = false;
  private micEpoch = 0;
  private closed = false;
  private busy = false;
  private begun = 0;
  private id = "";
  private windows = new AudioWindows();
  dropped = 0;
  constructor(
    private video: HTMLVideoElement,
    private update: (value: LiveState) => void,
    private status: (state: string, message?: string) => void,
    private micStatus: (state: string, message?: string) => void,
  ) {}
  async start(settings: {
    session_id: number;
    consent: boolean;
    fps: number;
    minimum_seconds: number;
    minimum_samples: number;
    maximum_gap: number;
  }) {
    this.status("requesting");
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Live devices require localhost or HTTPS and a supported browser.",
        );
      // Reject a stale server before asking for camera permission or sending media.
      const probe = new AbortController();
      this.abort = probe;
      const timeout = setTimeout(() => probe.abort(), 5000);
      try {
        const health = await api<{ live_monitor?: { protocol: number } }>(
          "/health", { signal: probe.signal },
        );
        if (health.live_monitor?.protocol !== 1)
          throw new Error("The backend on port 5000 does not support this Live Monitor version. Restart the Flask backend from this project, then retry. No camera was opened.");
      } finally { clearTimeout(timeout); }
      if (this.closed) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      if (this.closed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      this.deadline = setTimeout(
        () =>
          this.stop(
            "Camera/backend startup timed out: no usable preview or backend response. Devices released; check camera access and the backend, then retry.",
          ),
        10000,
      );
      stream
        .getTracks()
        .forEach((t) =>
          t.addEventListener("ended", () =>
            this.stop(
              "Camera disconnected. Monitoring ended; restart after reconnecting.",
            ),
          ),
        );
      this.video.srcObject = stream;
      await this.video.play();
      if (this.closed) return;
      if (this.video.readyState < 2 || !this.video.videoWidth || !this.video.videoHeight)
        await new Promise<void>((resolve) => {
          const ready = () => {
            if (this.video.readyState >= 2 && this.video.videoWidth && this.video.videoHeight) finish();
          };
          const timer = setInterval(ready, 50);
          const finish = () => {
            clearInterval(timer);
            this.cancelReady = undefined;
            resolve();
          };
          this.cancelReady = finish;
          ready();
        });
      if (this.closed) return;
      const initial = await api<LiveState>("/live/start", liveWrite(settings));
      this.id = initial.id;
      if (this.closed) {
        void this.endBackend();
        return;
      }
      this.begun = performance.now();
      clearTimeout(this.deadline);
      this.update(initial);
      this.status("live");
      this.timer = setInterval(() => void this.frame(), 1000 / settings.fps);
      this.deadline = setTimeout(
        () => this.stop("One-hour monitoring limit reached."),
        3600000,
      );
      void this.frame();
    } catch (e) {
      this.stop(captureError(e));
    }
  }
  async startMicrophone() {
    if (this.closed || !this.id || this.mic || this.micStarting) return;
    this.micStarting = true;
    const epoch = ++this.micEpoch;
    this.micStatus("requesting");
    let context: AudioContext | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined")
        throw new Error("Microphone monitoring requires a browser with Web Audio and device access on localhost or HTTPS.");
      context = new AudioContext();
      this.audio = context;
      await context.resume();
      if (this.closed || epoch !== this.micEpoch) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
        video: false,
      });
      if (this.closed || epoch !== this.micEpoch) {
        stream.getTracks().forEach((t) => t.stop());
        void context.close().catch(() => {});
        return;
      }
      this.audio = context;
      this.mic = stream;
      this.source = context.createMediaStreamSource(stream);
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = 2048;
      this.source.connect(this.analyser);
      stream.getTracks().forEach((t) =>
        t.addEventListener("ended", () => {
          this.stopMicrophone();
          this.micStatus(
            "error",
            "Microphone disconnected. Camera monitoring continues.",
          );
        }),
      );
      const buffer = new Float32Array(this.analyser.fftSize);
      this.audioTimer = setInterval(() => {
        if (!this.analyser) return;
        this.analyser.getFloatTimeDomainData(buffer);
        this.windows.add((performance.now() - this.begun) / 1000, rms(buffer));
      }, 50);
      this.micStatus("live");
    } catch (e) {
      if (context) void context.close().catch(() => {});
      if (epoch === this.micEpoch) {
        this.stopMicrophone();
        this.micStatus("error", captureError(e));
      }
    } finally {
      if (epoch === this.micEpoch) this.micStarting = false;
    }
  }
  stopMicrophone() {
    this.micEpoch++;
    this.micStarting = false;
    clearInterval(this.audioTimer);
    this.audioTimer = undefined;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = undefined;
    this.source?.disconnect();
    this.analyser?.disconnect();
    if (this.audio) void this.audio.close().catch(() => {});
    this.source = undefined;
    this.analyser = undefined;
    this.audio = undefined;
    this.windows = new AudioWindows();
    this.micStatus("off");
  }
  private async frame() {
    if (this.closed) return;
    if (this.busy) {
      this.dropped++;
      return;
    }
    this.busy = true;
    try {
      if (!this.video.videoWidth || !this.video.videoHeight)
        throw new Error(
          "Camera delivered an empty frame. Restart or choose another device.",
        );
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        640 / this.video.videoWidth,
        480 / this.video.videoHeight,
      );
      canvas.width = Math.round(this.video.videoWidth * scale);
      canvas.height = Math.round(this.video.videoHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas capture is unavailable.");
      ctx.drawImage(this.video, 0, 0, canvas.width, canvas.height);
      const seconds = (performance.now() - this.begun) / 1000;
      const audio = this.windows.take();
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error("Frame encoding failed."))),
          "image/jpeg",
          0.7,
        ),
      );
      if (this.closed) return;
      const body = new FormData();
      body.append("frame", blob, "frame.jpg");
      body.append("seconds", String(seconds));
      if (audio) body.append("audio", JSON.stringify(audio));
      this.abort = new AbortController();
      const timeout = setTimeout(() => this.abort?.abort(), 5000);
      try {
        const response = await fetch(`/api/live/${this.id}/frame`, {
          method: "POST",
          headers: { "X-Classroom-Live": "1" },
          body,
          signal: this.abort.signal,
        });
        if (response.status === 429) {
          this.dropped++;
          return;
        }
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            result.error?.message || "Backend connection failed.",
          );
        if (!this.closed) this.update(result);
      } finally {
        clearTimeout(timeout);
      }
    } catch (e) {
      if (!this.closed)
        this.stop(
          `Monitoring stopped: ${captureError(e)} Reconnect and start again; tracks are not joined across restarts.`,
        );
    } finally {
      this.busy = false;
    }
  }
  private async endBackend() {
    if (!this.id) return;
    try {
      await fetch(`/api/live/${this.id}/end`, {
        ...liveWrite(),
        headers: {
          "Content-Type": "application/json",
          "X-Classroom-Live": "1",
        },
        keepalive: true,
      });
    } catch {
      /* Server expires inactive runs after 20 seconds. */
    }
  }
  stop(
    message = "Monitoring ended. Numerical summaries remain available in Sessions.",
  ) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    clearTimeout(this.deadline);
    this.abort?.abort();
    this.cancelReady?.();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
    this.video.srcObject = null;
    this.stopMicrophone();
    void this.endBackend();
    this.status("stopped", message);
  }
}
