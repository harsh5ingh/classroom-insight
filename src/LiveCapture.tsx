import { useEffect, useRef, useState } from "react";
import { Camera, Mic, Square } from "lucide-react";
import { LocalCapture, type CaptureResult } from "./capture";
import { api } from "./api";
import { useData } from "./data";
import { Alert, Button } from "./ui";

export function LiveCapture({
  sessionId,
  onClose,
}: {
  sessionId?: number;
  onClose: () => void;
}) {
  const { sessions, refresh } = useData();
  const available = sessions.filter((s) => !s.is_demo);
  const [selected, setSelected] = useState(
    String(sessionId || available[0]?.id || ""),
  );
  const [mode, setMode] = useState<"camera" | "microphone">("camera");
  const [consent, setConsent] = useState(false),
    [active, setActive] = useState(false),
    [count, setCount] = useState(0);
  const [result, setResult] = useState<CaptureResult | null>(null),
    [error, setError] = useState("");
  const [uploading, setUploading] = useState(false),
    [attempted, setAttempted] = useState(false),
    [accepted, setAccepted] = useState(false);
  const [preview, setPreview] = useState("");
  const video = useRef<HTMLVideoElement>(null),
    capture = useRef<LocalCapture | null>(null),
    alive = useRef(true);
  const upload = useRef<AbortController | null>(null);
  useEffect(() => {
    alive.current = true;
    const hidden = () => {
      if (document.hidden)
        capture.current?.finish(
          "Capture stopped because the tab became hidden. Review before uploading.",
        );
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      alive.current = false;
      capture.current?.dispose();
      upload.current?.abort();
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  useEffect(() => {
    if (!result) return;
    const url = URL.createObjectURL(
      result.mode === "microphone" ? result.wav : result.frames[0],
    );
    setPreview(url);
    return () => {
      URL.revokeObjectURL(url);
      setPreview("");
    };
  }, [result]);
  const start = () => {
    setError("");
    setResult(null);
    setCount(0);
    setAttempted(false);
    setAccepted(false);
    setActive(true);
    const controller = new LocalCapture(
      mode,
      video.current!,
      (n) => {
        if (alive.current) setCount(n);
      },
      (value, note) => {
        if (alive.current) {
          setActive(false);
          setResult(value);
          setError(note || "");
        }
      },
    );
    capture.current = controller;
    void controller.start();
  };
  const save = async () => {
    if (!result || attempted) return;
    setUploading(true);
    setAttempted(true);
    setError("");
    const body = new FormData();
    let endpoint = `/sessions/${selected}/media`;
    if (result.mode === "camera") {
      endpoint = `/sessions/${selected}/capture`;
      body.append("consent", "true");
      body.append("timestamps", JSON.stringify(result.seconds));
      result.frames.forEach((frame, i) =>
        body.append("frames", frame, `${i}.jpg`),
      );
    } else
      body.append(
        "file",
        new File([result.wav], "Microphone-capture.wav", { type: "audio/wav" }),
      );
    const abort = new AbortController();
    upload.current = abort;
    const timeout = setTimeout(() => abort.abort(), 180000);
    try {
      await api(endpoint, { method: "POST", body, signal: abort.signal });
      if (!alive.current) return;
      setAccepted(true);
      await refresh();
      if (alive.current) onClose();
    } catch (e) {
      if (alive.current)
        setError(
          `${e instanceof Error ? e.message : "Upload failed"} Check Sessions before attempting another upload; the server may already have received this capture.`,
        );
    } finally {
      clearTimeout(timeout);
      if (alive.current) setUploading(false);
    }
  };
  return (
    <div className="space-y-4">
      <Alert>
        Visible, opt-in local capture. Camera: snapshots every 2 seconds (no
        audio), up to 60 frames. Microphone: PCM WAV, up to 2 minutes. Analysis
        runs after you stop and explicitly upload. Nothing is sent to Gemini.
      </Alert>
      <label className="field">
        Capture session
        <select
          value={selected}
          disabled={active || !!result || uploading}
          onChange={(e) => setSelected(e.target.value)}
        >
          {available.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      {!available.length && (
        <p>
          Create a real session first; sample sessions cannot receive capture
          data.
        </p>
      )}
      <label className="field">
        Device mode
        <select
          value={mode}
          disabled={active || !!result || uploading}
          onChange={(e) => setMode(e.target.value as typeof mode)}
        >
          <option value="camera">Camera snapshots</option>
          <option value="microphone">Microphone audio</option>
        </select>
      </label>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={consent}
          disabled={active || !!result}
          onChange={(e) => setConsent(e.target.checked)}
        />
        I have authorization to capture and locally analyze the people or audio
        in this session.
      </label>
      <video
        ref={video}
        muted
        playsInline
        aria-label="Live camera preview"
        hidden={mode !== "camera" || !active}
        className="w-full max-h-64 bg-secondary"
      />
      {active && (
        <p role="status" className="font-semibold text-forest">
          Capture active · {count}{" "}
          {mode === "camera" ? "snapshots" : "seconds of audio"}. Closing this
          dialog releases the device and discards unsaved capture.
        </p>
      )}
      {result && (
        <div className="space-y-2">
          <p>
            Review before upload ·{" "}
            {result.mode === "camera"
              ? `${result.frames.length} snapshots / ${result.seconds.at(-1)?.toFixed(1)}s`
              : `${result.seconds.toFixed(1)}s audio`}
          </p>
          {result.mode === "microphone" ? (
            <audio
              controls
              src={preview}
              aria-label="Review microphone capture"
            />
          ) : (
            <img
              src={preview}
              alt="First camera snapshot; original snapshots will be available after analysis"
              className="max-h-48"
            />
          )}
        </div>
      )}
      {error && <Alert error>{error}</Alert>}
      {accepted && (
        <p role="status">
          Capture received. Check Sessions for analysis status; do not upload it
          again.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {!active && !result && (
          <Button
            type="button"
            variant="primary"
            disabled={!consent || !selected}
            onClick={start}
          >
            {mode === "camera" ? <Camera size={16} /> : <Mic size={16} />}Start
            visible capture
          </Button>
        )}
        {active && (
          <Button type="button" onClick={() => capture.current?.finish()}>
            <Square size={16} />
            Stop capture
          </Button>
        )}
        {result && (
          <>
            <Button
              type="button"
              disabled={uploading}
              onClick={() => {
                setResult(null);
                setError("");
                setAttempted(false);
                setAccepted(false);
              }}
            >
              Discard local capture
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={attempted || uploading}
              onClick={() => void save()}
            >
              {uploading ? "Uploading capture…" : "Upload capture & analyze"}
            </Button>
          </>
        )}
      </div>
      <p className="subtle text-xs">
        Use localhost or HTTPS. Denied permissions and unsupported hardware can
        be handled by uploading a recording. Camera snapshots are not continuous
        video or verified head pose. Capture stops when this tab is hidden.
      </p>
    </div>
  );
}
