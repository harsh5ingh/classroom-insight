import { useState, type FormEvent } from "react";
import { UploadCloud } from "lucide-react";
import { api, today, write } from "./api";
import { useData } from "./data";
import { Alert, Button, Dialog } from "./ui";
import type { Session, Student } from "./types";

export function SessionForm({
  onClose,
  session,
}: {
  onClose: () => void;
  session?: Session;
}) {
  const { run, busy } = useData();
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setError("");
    const ok = await run(
      async () => {
        try {
          await api(
            session ? `/sessions/${session.id}` : "/sessions",
            write(session ? "PUT" : "POST", data),
          );
        } catch (err) {
          setError((err as Error).message);
          throw err;
        }
      },
      session ? "Session updated" : "Session created",
    );
    if (ok) onClose();
  };
  return (
    <Dialog
      title={session ? "Edit session" : "Start a new session"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-5">
        <p className="subtle">
          Your registered students form this session’s roster. Attendance starts
          unconfirmed.
        </p>
        <label className="field">
          Session title
          <input
            name="title"
            required
            maxLength={160}
            defaultValue={session?.title}
            placeholder="e.g. Systems & interdependence"
            autoFocus
          />
        </label>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="field">
            Date
            <input
              type="date"
              name="date"
              required
              defaultValue={session?.date || today()}
            />
          </label>
          <label className="field">
            Instructor
            <input
              name="instructor"
              required
              maxLength={100}
              defaultValue={session?.instructor}
              placeholder="Instructor name"
            />
          </label>
        </div>
        {error && <Alert error>{error}</Alert>}
        <div className="flex justify-end gap-3 pt-3">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy}>
            {busy ? "Saving…" : session ? "Save changes" : "Create session"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function StudentForm({
  onClose,
  student,
}: {
  onClose: () => void;
  student?: Student;
}) {
  const { run, busy } = useData();
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setError("");
    const ok = await run(
      async () => {
        try {
          await api(
            student ? `/students/${student.id}` : "/students",
            write(student ? "PUT" : "POST", data),
          );
        } catch (err) {
          setError((err as Error).message);
          throw err;
        }
      },
      student ? "Student updated" : "Student registered",
    );
    if (ok) onClose();
  };
  return (
    <Dialog
      title={student ? "Edit student" : "Register a student"}
      onClose={onClose}
    >
      <form onSubmit={submit} className="space-y-5">
        <label className="field">
          Full name
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={student?.name}
            autoFocus
          />
        </label>
        <label className="field">
          Student identifier
          <input
            name="identifier"
            required
            maxLength={40}
            pattern="[A-Za-z0-9_\-]+"
            defaultValue={student?.identifier}
            placeholder="e.g. STU-2026-001"
          />
        </label>
        <label className="field">
          Cohort
          <input
            name="cohort"
            maxLength={80}
            defaultValue={student?.cohort}
            placeholder="e.g. Environmental Studies · A"
          />
        </label>
        <p className="subtle">
          Use an institutional identifier. No facial matching or biometric
          registration is performed.
        </p>
        {error && <Alert error>{error}</Alert>}
        <div className="flex justify-end gap-3">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy}>
            {busy ? "Saving…" : "Save student"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
export function UploadForm({
  onClose,
  sessionId,
}: {
  onClose: () => void;
  sessionId?: number;
}) {
  const { sessions, refresh } = useData();
  const available = sessions.filter((s) => !s.is_demo);
  const [selected, setSelected] = useState(
    String(sessionId || available[0]?.id || ""),
  );
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file || accepted) return;
    if (file.size > 100 * 1024 * 1024) {
      setError("Choose a file smaller than 100 MB.");
      return;
    }
    setError("");
    setProgress(0);
    const body = new FormData();
    body.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/sessions/${selected}/media`);
    xhr.timeout = 180000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        setProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = async () => {
      if (xhr.status === 202) {
        setAccepted(true);
        try {
          await refresh();
          onClose();
        } catch {
          setError(
            "Recording received, but its status could not be refreshed. Close this dialog and refresh the page to check processing. Do not upload it again.",
          );
          setProgress(null);
        }
      } else {
        let message = "Upload failed. Please retry.";
        try {
          message = JSON.parse(xhr.responseText).error.message;
        } catch {
          /* unreadable server response */
        }
        setError(message);
        setProgress(null);
      }
    };
    xhr.onerror = () => {
      setError("Connection lost. Check the server and try again.");
      setProgress(null);
    };
    xhr.ontimeout = () => {
      setError("Upload timed out. Try a smaller recording.");
      setProgress(null);
    };
    xhr.send(body);
  };
  return (
    <Dialog
      title="Analyze a recording"
      onClose={() => {
        if (progress === null) onClose();
      }}
    >
      <form onSubmit={submit} className="space-y-5">
        <Alert>
          Original media stays on this computer. Confirm that you have
          permission to analyze this classroom recording.
        </Alert>
        {available.length ? (
          <>
            <label className="field">
              Session
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={progress !== null}
              >
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="block border border-dashed border-forest/40 bg-sage/25 rounded-lg p-7 text-center">
              <UploadCloud size={28} className="mx-auto text-forest mb-3" />
              <span className="font-medium">Choose a classroom recording</span>
              <span className="subtle block text-xs mt-2 mb-4">
                Video or audio · up to 100 MB / 2 hours
              </span>
              <input
                aria-label="Recording file"
                type="file"
                required
                accept=".mp4,.mov,.avi,.webm,.mkv,.wav,.mp3,.m4a,.flac,.ogg"
                disabled={progress !== null}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-xs"
              />
            </label>
            <p className="subtle text-xs">
              PCM WAV audio works directly. Other audio formats and video audio
              extraction require FFmpeg. Visible counts are anonymous estimates.
            </p>
          </>
        ) : (
          <p className="subtle">
            Create a real session first. Recordings cannot be attached to
            fictional sample sessions.
          </p>
        )}
        {error && <Alert error>{error}</Alert>}
        {progress !== null && (
          <div aria-live="polite">
            <div className="flex justify-between text-xs mb-2">
              <span>
                {progress === 100
                  ? "Upload received · starting analysis"
                  : "Uploading recording"}
              </span>
              <span>{progress}%</span>
            </div>
            <progress
              className="w-full accent-forest"
              value={progress}
              max={100}
            />
          </div>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" onClick={onClose} disabled={progress !== null}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!file || !selected || progress !== null || accepted}
          >
            Upload & analyze
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
