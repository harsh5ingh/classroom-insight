import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Mic, Square, Activity, ShieldCheck } from "lucide-react";
import { useData } from "./data";
import { api } from "./api";
import { Button, Alert, Dialog, SectionHead } from "./ui";
import { Chart } from "./ChartView";
import {
  LiveMonitor,
  liveWrite,
  type LiveState,
  type LiveTrack,
} from "./liveMonitor";

export default function LiveDashboard() {
  const { sessions, newSession, refresh } = useData();
  const available = sessions.filter((s) => !s.is_demo);
  const [selected, setSelected] = useState(""),
    [consent, setConsent] = useState(false);
  const [fps, setFps] = useState(4),
    [minimum, setMinimum] = useState(20),
    [samples, setSamples] = useState(3),
    [gap, setGap] = useState(10);
  const [state, setState] = useState("idle"),
    [message, setMessage] = useState(""),
    [mic, setMic] = useState("off"),
    [micError, setMicError] = useState("");
  const [live, setLive] = useState<LiveState | null>(null),
    [elapsed, setElapsed] = useState(0),
    [roster, setRoster] = useState<
      { id: number; name: string; identifier: string; status: string }[]
    >([]);
  const [track, setTrack] = useState<LiveTrack | null>(null),
    [student, setStudent] = useState(""),
    [identity, setIdentity] = useState(false),
    [busy, setBusy] = useState(false);
  const [cloud, setCloud] = useState(false),
    [suggestions, setSuggestions] = useState<{
      source: string;
      note: string;
      items: { title: string; body: string; evidence: string }[];
    } | null>(null);
  const video = useRef<HTMLVideoElement>(null),
    monitor = useRef<LiveMonitor | null>(null),
    mounted = useRef(true);
  const active = state === "live" || state === "requesting";
  useEffect(() => {
    mounted.current = true;
    const hidden = () => {
      if (document.hidden)
        monitor.current?.stop(
          "Tab hidden: devices stopped for privacy. Start again to resume.",
        );
    };
    const leave = () => monitor.current?.stop();
    document.addEventListener("visibilitychange", hidden);
    window.addEventListener("pagehide", leave);
    return () => {
      mounted.current = false;
      monitor.current?.stop();
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("pagehide", leave);
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    let keep = true;
    api<{ records: typeof roster }>(`/sessions/${selected}/attendance`)
      .then((r) => {
        if (keep) setRoster(r.records);
      })
      .catch((e) => {
        if (keep) setMessage(e.message);
      });
    return () => {
      keep = false;
    };
  }, [selected]);
  useEffect(() => {
    if (state !== "live") return;
    const timer = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);
  function start() {
    setMessage("");
    setLive(null);
    setElapsed(0);
    setSuggestions(null);
    setMicError("");
    const controller = new LiveMonitor(
      video.current!,
      (v) => {
        if (mounted.current) setLive(v);
      },
      (s, m) => {
        if (mounted.current) {
          setState(s);
          setMessage(m || "");
        }
      },
      (s, m) => {
        if (mounted.current) {
          setMic(s);
          setMicError(m || "");
        }
      },
    );
    monitor.current = controller;
    void controller.start({
      session_id: Number(selected),
      consent,
      fps,
      minimum_seconds: minimum,
      minimum_samples: samples,
      maximum_gap: gap,
    });
  }
  async function confirm() {
    if (!live || !track) return;
    setBusy(true);
    try {
      const result = await api<{ confirmed: number; duplicate: boolean }>(
        `/live/${live.id}/confirm`,
        liveWrite({
          track_id: track.id,
          student_id: Number(student),
          identity_confirmed: identity,
        }),
      );
      setLive((old) => (old ? { ...old, confirmed: result.confirmed } : old));
      setMessage(
        result.duplicate
          ? "This student was already present; no duplicate attendance was created."
          : "Attendance confirmed with a timestamp and audit history.",
      );
      setTrack(null);
      await refresh();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function suggest() {
    if (!live) return;
    setBusy(true);
    try {
      setSuggestions(
        await api(`/live/${live.id}/suggestions`, liveWrite({ cloud })),
      );
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const last = live?.windows.at(-1);
  return (
    <div className="space-y-6">
      <SectionHead
        title="Live classroom monitor"
        description="Anonymous observations. Instructor-confirmed attendance. No raw recording retained."
      />
      {!available.length && (
        <Alert>
          Create a non-sample session before monitoring.{" "}
          <Button onClick={newSession}>New session</Button>
        </Alert>
      )}
      {message && (
        <Alert
          error={state === "stopped" && !message.startsWith("Monitoring ended")}
        >
          {message}
        </Alert>
      )}
      <div className="live-workspace">
        <aside className="live-sidebar space-y-4">
          <div className="flex gap-2 items-center">
            <ShieldCheck size={18} />
            <h2>Session controls</h2>
          </div>
          <label className="field">
            Classroom session
            <select
              value={selected}
              disabled={active}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a classroom session</option>
              {available.map((s) => (
                <option value={s.id} key={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <Button disabled={active} onClick={newSession}>New session</Button>
          <p className="text-xs opacity-80">Choose an actual classroom session. Synthetic live HTTP QA entries are test records; create a new session for real monitoring.</p>
          <p role="status">Camera: {state}</p>
          <p className="font-mono text-3xl">
            {Math.floor(elapsed / 60)
              .toString()
              .padStart(2, "0")}
            :{(elapsed % 60).toString().padStart(2, "0")}
          </p>
          <p>
            Confirmed attendance:{" "}
            <strong>
              {live?.confirmed ??
                roster.filter((s) => s.status === "present").length}
            </strong>
          </p>
          <details>
            <summary>Sampling & presence thresholds</summary>
            <div className="space-y-3 mt-3">
              {[
                ["Processed FPS target", fps, setFps, 1, 5],
                ["Minimum presence seconds", minimum, setMinimum, 20, 300],
                ["Minimum observations", samples, setSamples, 3, 100],
                ["Maximum observation gap", gap, setGap, 1, 10],
              ].map(([label, value, set, min, max]) => (
                <label key={String(label)} className="field">
                  {String(label)}
                  <input
                    type="number"
                    value={Number(value)}
                    min={Number(min)}
                    max={Number(max)}
                    disabled={active}
                    onChange={(e) =>
                      (set as (n: number) => void)(Number(e.target.value))
                    }
                  />
                </label>
              ))}
            </div>
          </details>
          <label className="flex gap-2 text-sm items-start">
            <input
              type="checkbox"
              checked={consent}
              disabled={active}
              onChange={(e) => setConsent(e.target.checked)}
            />
            I have authorization and have informed participants about local
            camera/microphone analysis and manual attendance confirmation.
          </label>
          {!active ? (
            <Button
              variant="primary"
              disabled={!selected || !consent}
              onClick={start}
            >
              <Camera size={16} />
              Start camera monitoring
            </Button>
          ) : (
            <Button onClick={() => monitor.current?.stop()}>
              <Square size={16} />
              End session
            </Button>
          )}
          <Link className="block underline" to="/app">
            Overview
          </Link>
          <Link className="block underline" to="/app/settings">
            Settings & AI providers
          </Link>
          <p className="text-xs opacity-80">
            One live run per local server; one hour maximum. Hiding or closing
            this page stops devices. End monitoring before navigating.
          </p>
        </aside>
        <section className="live-video space-y-3">
          <div className="flex justify-between gap-3">
            <h2>Camera · anonymous tracks</h2>
            <span>
              {state === "live"
                ? "Processing sampled frames"
                : "Not processing"}
            </span>
          </div>
          <div className="relative bg-black rounded-md overflow-hidden">
            <video
              ref={video}
              muted
              playsInline
              aria-label="Continuous live classroom camera preview"
              className="w-full h-auto min-h-48"
            />
            {state === "live" &&
              live?.tracks
                .filter((t) => t.visible)
                .map((t) => (
                  <div
                    key={t.id}
                    className="live-box"
                    style={{
                      left: `${t.box[0] * 100}%`,
                      top: `${t.box[1] * 100}%`,
                      width: `${t.box[2] * 100}%`,
                      height: `${t.box[3] * 100}%`,
                    }}
                  >
                    <span>
                      Track {t.id}
                      {t.qualified ? " · Qualified" : ""}
                    </span>
                  </div>
                ))}
          </div>
          <p className="text-xs">
            {live
              ? `${live.processed_fps.toFixed(1)} observed FPS · ${live.processing_ms.toFixed(0)} ms server processing · ${monitor.current?.dropped || 0} dropped sampling opportunities`
              : "FPS and latency appear after actual processing."}
          </p>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <p>
              Detected tracks
              <br />
              <strong>{live?.tracks.length ?? "—"}</strong>
            </p>
            <p>
              Currently visible
              <br />
              <strong>{live?.visible ?? "—"}</strong>
            </p>
            <p>
              Qualified
              <br />
              <strong>{live?.qualified ?? "—"}</strong>
            </p>
          </div>
          {live?.warning && <Alert>{live.warning}</Alert>}
          {live?.track_limit_reached && (
            <Alert>
              200-track limit reached. End this run before monitoring further
              participants.
            </Alert>
          )}
          <p className="text-xs opacity-80">
            Boxes use the last processed frame and can lag the preview. Haar
            detection has no calibrated confidence score. Small/non-frontal
            faces, occlusion and lighting can fragment tracks. Head pose and
            gaze: unsupported.
          </p>
        </section>
        <aside className="live-audio space-y-4">
          <h2 className="flex gap-2 items-center">
            <Mic size={18} />
            Audio observations
          </h2>
          <p>Microphone: {mic}</p>
          {mic === "live" ? (
            <Button onClick={() => monitor.current?.stopMicrophone()}>
              Stop microphone
            </Button>
          ) : (
            <Button
              disabled={state !== "live" || mic === "requesting"}
              onClick={() => void monitor.current?.startMicrophone()}
            >
              Start microphone
            </Button>
          )}
          {micError && <Alert error>{micError}</Alert>}
          <label className="block text-sm">
            RMS audio level (relative)
            <meter
              min="0"
              max="1"
              value={live?.audio?.rms ?? 0}
              className="w-full"
            />
          </label>
          <p>
            {live?.audio
              ? `${live.audio.rms.toFixed(3)} RMS · ${(live.audio.active_fraction * 100).toFixed(0)}% sampled sound activity`
              : "No current acoustic window."}
          </p>
          <details>
            <summary>Recent acoustic intervals</summary>
            {live?.audio_intervals.slice(-10).map((i, n) => (
              <p key={n} className="text-xs">
                {i.start.toFixed(2)}�{i.end.toFixed(2)}s above threshold
              </p>
            ))}
          </details>
          <h3 className="flex gap-2">
            <Activity size={18} />
            Activity index
          </h3>
          <p className="text-3xl font-semibold">
            {last?.score == null ? "—" : last.score.toFixed(1)}
            <span className="text-sm"> / 100</span>
          </p>
          <p>
            {last
              ? `${last.modalities} contributing signals · window ${last.seconds}–${last.end_seconds.toFixed(1)}s`
              : "Waiting for measured windows."}
          </p>
          <p className="text-xs opacity-80">
            Experimental activity only. RMS ≥ 0.02 is an acoustic heuristic, not
            speech, speaker identity or verified conversation. Audio samples
            stay in ephemeral browser buffers.
          </p>
        </aside>
      </div>
      <section className="panel p-5 space-y-3">
        <SectionHead
          title="Anonymous tracks & attendance review"
          description="Detection → track continuity → sustained presence → explicit instructor confirmation."
        />
        <p className="subtle text-xs">
          Qualification: credited presence ≥ {minimum}s and ≥ {samples}{" "}
          detections, each matched gap ≤ {gap}s. Credit per matched interval is
          capped at 2 / target FPS seconds; missing time is not inactivity. IDs
          are never student identities.
        </p>
        {!live?.tracks.length ? (
          <p>No anonymous face tracks observed yet.</p>
        ) : (
          <div className="overflow-auto max-h-96">
            <table>
              <thead>
                <tr>
                  <th>Track / state</th>
                  <th>Presence</th>
                  <th>Observations</th>
                  <th>First / last seen</th>
                  <th>Movement / inactivity</th>
                  <th>Review</th>
                </tr>
              </thead>
              <tbody>
                {live.tracks.map((t) => (
                  <tr key={t.id}>
                    <td>
                      Track {t.id}
                      <br />
                      {t.state.replaceAll("_", " ")}
                    </td>
                    <td>
                      {t.presence_seconds.toFixed(1)}s credited
                      <br />
                      {t.qualified ? "Qualified" : "Waiting"}
                    </td>
                    <td>{t.samples}</td>
                    <td className="text-xs">
                      {new Date(t.first_detected_at).toLocaleTimeString()}
                      <br />
                      {new Date(t.last_detected_at).toLocaleTimeString()}
                    </td>
                    <td>
                      {t.movement == null
                        ? "Unavailable"
                        : `${t.movement.toFixed(3)} face-widths/s`}
                      <br />
                      {t.longest_still_seconds.toFixed(1)}s longest observed
                      still interval
                      <br />
                      {t.inactivity_intervals.at(-1) &&
                        `Latest: ${t.inactivity_intervals.at(-1)!.start.toFixed(1)}�${t.inactivity_intervals.at(-1)!.end.toFixed(1)}s`}
                    </td>
                    <td>
                      <Button
                        disabled={
                          state !== "live" ||
                          !t.qualified ||
                          !t.visible ||
                          !!t.confirmed_student_id
                        }
                        onClick={() => {
                          setTrack(t);
                          setStudent("");
                          setIdentity(false);
                        }}
                      >
                        {t.confirmed_student_id
                          ? "Confirmed"
                          : "Confirm attendance"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel p-5">
        <SectionHead
          title="Aligned session activity"
          description="Ten-second windows on the browser monotonic clock; transport latency limits precision."
        />
        {live?.windows.length ? (
          <Chart
            data={live.windows.map((p) => ({ ...p }))}
            xKey="seconds"
            series={[
              { key: "visual", label: "Visual activity", color: "#285943" },
              { key: "sound", label: "Acoustic activity", color: "#C58B43" },
              { key: "score", label: "Experimental index", color: "#73776D" },
            ]}
            label="Measured live visual and acoustic activity, not attention"
          />
        ) : (
          <p>Start monitoring to collect real activity windows.</p>
        )}
        <p className="subtle text-xs mt-3">
          Visual = min(scene intensity change / 10%, 1). Audio = fraction of RMS
          samples ≥ 0.02. Index = configured weighted mean of available signals × 100. Missing
          modalities are excluded, never replaced with zero. Camera
          movement/background noise affect results; this is not attention,
          emotion, understanding or learning success.
        </p>
        <details className="mt-3 text-sm">
          <summary>Acoustic windows & signal coverage</summary>
          {live?.windows.map((w) => (
            <p key={w.seconds}>
              {w.seconds}–{w.end_seconds.toFixed(1)}s: acoustic{" "}
              {w.sound == null
                ? "unavailable"
                : `${w.sound.toFixed(0)}% active`}
              ; visual coverage {(w.visual_coverage * 100).toFixed(0)}%, audio
              coverage {(w.audio_coverage * 100).toFixed(0)}%.
            </p>
          ))}
        </details>
      </section>
      <section className="panel p-5 space-y-3">
        <SectionHead
          title="Teaching suggestions"
          description="Requested explicitly from actual observations; local rules remain available."
        />
        <label className="flex gap-2 items-center">
          <input
            type="checkbox"
            checked={cloud}
            onChange={(e) => setCloud(e.target.checked)}
          />
          Use selected cloud provider (aggregate measurements only)
        </label>
        <Button
          disabled={state !== "live" || busy || !live?.frames_processed}
          onClick={() => void suggest()}
        >
          Generate session suggestions
        </Button>
        {suggestions && (
          <>
            <p className="subtle">
              Source: {suggestions.source} · {suggestions.note}
            </p>
            {suggestions.items.map((item, i) => (
              <article key={i} className="border-t border-line pt-3">
                <h3>{item.title}</h3>
                <p>{item.body}</p>
                <p className="subtle text-xs">Evidence: {item.evidence}</p>
              </article>
            ))}
          </>
        )}
      </section>
      {track && (
        <Dialog
          title={`Confirm attendance from Track ${track.id}`}
          onClose={() => setTrack(null)}
          footer={
            <>
              <Button onClick={() => setTrack(null)}>Cancel</Button>
              <Button
                disabled={busy || !student || !identity}
                variant="primary"
                onClick={() => void confirm()}
              >
                Record confirmed attendance
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p>
              Use your direct classroom knowledge to identify the person. This
              system cannot identify them. The track must still be visible when
              you confirm.
            </p>
            <label className="field">
              Roster student
              <select
                value={student}
                onChange={(e) => setStudent(e.target.value)}
              >
                <option value="">Select a student</option>
                {roster.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.identifier}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex gap-2">
              <input
                type="checkbox"
                checked={identity}
                onChange={(e) => setIdentity(e.target.checked)}
              />
              I have explicitly verified this student's identity and authorize
              the attendance entry.
            </label>
          </div>
        </Dialog>
      )}
    </div>
  );
}
