/** Bounded, opt-in browser capture. No network requests or automatic device access. */
export type CaptureResult =
  | { mode: "camera"; frames: Blob[]; seconds: number[] }
  | { mode: "microphone"; wav: Blob; seconds: number };
export function pcmWav(chunks: Float32Array[], rate: number): Blob {
  const length = chunks.reduce((n, c) => n + c.length, 0);
  if (
    !length ||
    !Number.isInteger(rate) ||
    rate < 8000 ||
    rate > 96000 ||
    length > rate * 120
  )
    throw new Error("No usable microphone samples or capture limit exceeded.");
  const buffer = new ArrayBuffer(44 + length * 2),
    view = new DataView(buffer);
  const word = (at: number, value: string) => {
    for (let i = 0; i < value.length; i++)
      view.setUint8(at + i, value.charCodeAt(i));
  };
  word(0, "RIFF");
  view.setUint32(4, 36 + length * 2, true);
  word(8, "WAVE");
  word(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  word(36, "data");
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks)
    for (const sample of chunk) {
      const value = Number.isFinite(sample)
        ? Math.max(-1, Math.min(1, sample))
        : 0;
      view.setInt16(
        offset,
        Math.round(value * (value < 0 ? 32768 : 32767)),
        true,
      );
      offset += 2;
    }
  return new Blob([buffer], { type: "audio/wav" });
}
export function captureError(error: unknown) {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Device permission denied. Allow this site in browser settings, then start again. Nothing was uploaded.";
  if (name === "NotFoundError")
    return "No matching camera or microphone was found. Connect a device or upload a recording.";
  if (name === "NotReadableError")
    return "The device is busy or unavailable. Close other recording apps and retry.";
  return error instanceof Error
    ? error.message
    : "Capture failed. Use a recorded file instead.";
}
export class LocalCapture {
  private stream?: MediaStream;
  private audio?: AudioContext;
  private processor?: ScriptProcessorNode;
  private source?: MediaStreamAudioSourceNode;
  private mute?: GainNode;
  private interval?: ReturnType<typeof setInterval>;
  private deadline?: ReturnType<typeof setTimeout>;
  private closed = false;
  private started = 0;
  private frames: Blob[] = [];
  private seconds: number[] = [];
  private chunks: Float32Array[] = [];
  private sampleCount = 0;
  private drawing = false;
  constructor(
    private mode: "camera" | "microphone",
    private video: HTMLVideoElement,
    private tick: (samples: number) => void,
    private done: (result: CaptureResult | null, error?: string) => void,
  ) {}
  async start() {
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Capture requires a supported browser on localhost or HTTPS. Upload a recording instead.",
        );
      // Create audio context during the user gesture, before the permission await.
      if (this.mode === "microphone") {
        if (!window.AudioContext)
          throw new Error(
            "Microphone capture is unsupported in this browser. Upload PCM WAV instead.",
          );
        this.audio = new AudioContext({ sampleRate: 16000 });
        await this.audio.resume();
      }
      if (this.closed) return;
      const stream = await navigator.mediaDevices.getUserMedia(
        this.mode === "camera"
          ? {
              video: { width: { ideal: 640 }, height: { ideal: 480 } },
              audio: false,
            }
          : { video: false, audio: { channelCount: 1 } },
      );
      if (this.closed) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      stream
        .getTracks()
        .forEach((t) =>
          t.addEventListener("ended", () =>
            this.finish(
              "Device disconnected; inspect the partial capture before uploading.",
            ),
          ),
        );
      this.started = performance.now();
      if (this.mode === "camera") {
        this.video.srcObject = stream;
        await this.video.play();
        if (this.closed) return;
        this.started = performance.now();
        await this.snapshot();
        if (this.closed) return;
        this.interval = setInterval(() => void this.snapshot(), 2000);
      } else {
        const context = this.audio!;
        this.source = context.createMediaStreamSource(stream);
        // Compatibility PCM fallback: bounded ScriptProcessor, no audible monitoring.
        this.processor = context.createScriptProcessor(4096, 1, 1);
        this.mute = context.createGain();
        this.mute.gain.value = 0;
        this.processor.onaudioprocess = (event) => {
          if (this.closed) return;
          const input = event.inputBuffer.getChannelData(0);
          const remaining = Math.max(
            0,
            context.sampleRate * 120 - this.sampleCount,
          );
          const chunk = input.slice(0, remaining);
          this.chunks.push(chunk);
          this.sampleCount += chunk.length;
          this.tick(Math.floor(this.sampleCount / context.sampleRate));
          if (!remaining || performance.now() - this.started >= 120000)
            this.finish();
        };
        this.source.connect(this.processor);
        this.processor.connect(this.mute);
        this.mute.connect(context.destination);
      }
      if (!this.closed) this.deadline = setTimeout(() => this.finish(), 120000);
    } catch (error) {
      if (!this.closed) {
        this.release();
        this.done(null, captureError(error));
      }
    }
  }
  private async snapshot() {
    if (this.closed || this.drawing) return;
    this.drawing = true;
    try {
      const seconds = (performance.now() - this.started) / 1000;
      if (seconds > 120 || this.frames.length >= 60) {
        this.finish();
        return;
      }
      if (!this.video.videoWidth || !this.video.videoHeight)
        throw new Error(
          "Camera produced an empty frame. Check the device or upload a video.",
        );
      const canvas = document.createElement("canvas");
      const scale = Math.min(
        1,
        640 / this.video.videoWidth,
        480 / this.video.videoHeight,
      );
      canvas.width = Math.round(this.video.videoWidth * scale);
      canvas.height = Math.round(this.video.videoHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Camera canvas is unavailable.");
      context.drawImage(this.video, 0, 0, canvas.width, canvas.height);
      const frame = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.8),
      );
      if (this.closed) return;
      if (!frame || frame.size > 512 * 1024)
        throw new Error(
          "Camera frame could not be encoded within the size limit.",
        );
      this.frames.push(frame);
      this.seconds.push(Number(seconds.toFixed(3)));
      this.tick(this.frames.length);
      if (this.frames.length >= 60) this.finish();
    } catch (error) {
      if (!this.closed) {
        this.release();
        this.done(null, captureError(error));
      }
    } finally {
      this.drawing = false;
    }
  }
  finish(note?: string) {
    if (this.closed) return;
    const rate = this.audio?.sampleRate || 16000;
    this.release();
    try {
      if (this.mode === "camera") {
        if (this.frames.length < 2)
          throw new Error(
            "Capture at least two camera samples before saving. Nothing was uploaded.",
          );
        this.done(
          { mode: "camera", frames: this.frames, seconds: this.seconds },
          note,
        );
      } else
        this.done(
          {
            mode: "microphone",
            wav: pcmWav(this.chunks, rate),
            seconds: this.sampleCount / rate,
          },
          note,
        );
    } catch (error) {
      this.done(null, captureError(error));
    }
    this.chunks = [];
    this.frames = [];
  }
  private release() {
    this.closed = true;
    clearInterval(this.interval);
    clearTimeout(this.deadline);
    this.stream?.getTracks().forEach((t) => t.stop());
    if (this.processor) this.processor.onaudioprocess = null;
    this.source?.disconnect();
    this.processor?.disconnect();
    this.mute?.disconnect();
    if (this.audio && this.audio.state !== "closed")
      void this.audio.close().catch(() => {});
    this.video.srcObject = null;
  }
  dispose() {
    this.release();
    this.chunks = [];
    this.frames = [];
  }
}
