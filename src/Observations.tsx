import { useEffect, useState } from "react";
import { api, write } from "./api";
import { Chart } from "./ChartView";
import { useData } from "./data";
import { Alert, Button, Empty, SectionHead } from "./ui";
import type {
  ActivityFusion,
  Analysis,
  AttendanceChange,
  PresenceTrack,
} from "./types";

export function AttendanceHistory({
  changes,
}: {
  changes: AttendanceChange[];
}) {
  return (
    <section className="panel p-5">
      <SectionHead
        title="Attendance change history"
        description="UTC timestamps converted to your local time. Earlier records have no invented confirmation time."
      />
      {!changes.length ? (
        <p className="subtle">No timestamped confirmations yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Recorded</th>
                <th>Student</th>
                <th>Change</th>
                <th>Evidence / actor</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr key={c.id}>
                  <td className="text-xs whitespace-nowrap">
                    {new Date(c.recorded_at).toLocaleString()}
                  </td>
                  <td>{c.name}</td>
                  <td>
                    {c.previous_status} → {c.status}
                  </td>
                  <td className="text-xs">
                    {c.actor} ·{" "}
                    {c.source === "instructor_reviewed_track"
                      ? `Reviewed track ${c.track_id} / analysis ${c.analysis_id}`
                      : "Manual confirmation"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted mt-3">
        Latest 500 changes. Deleting a student or session also deletes its
        linked history. “Demo instructor” is a shared demo actor, not
        authenticated employee identity.
      </p>
    </section>
  );
}

type ReviewRoster = { id: number; name: string; identifier: string }[];
function TrackReview({
  track,
  analysis,
  roster,
  reviewed,
}: {
  track: PresenceTrack;
  analysis: Analysis;
  roster: ReviewRoster;
  reviewed: boolean;
}) {
  const { run, busy, sessions } = useData();
  const [student, setStudent] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [saved, setSaved] = useState(false);
  const session = sessions.find((s) => s.id === analysis.session_id);
  const eligible = track.qualified && analysis.has_media && !session?.is_demo;
  return (
    <article className="border-t border-line py-5">
      <div className="flex gap-4 items-start">
        {track.preview && (
          <img
            src={`data:image/jpeg;base64,${track.preview}`}
            alt={`First observed face for anonymous track ${track.id}; verify in original recording`}
            className="w-20 h-20 rounded object-cover"
          />
        )}
        <div className="flex-1">
          <h3>Anonymous track {track.id}</h3>
          <p className="subtle text-xs mt-1">
            {track.first_seen.toFixed(1)}–{track.last_seen.toFixed(1)}s ·{" "}
            {track.samples} sampled detections · {track.span_seconds.toFixed(1)}
            s observed span
          </p>
          <p className="text-xs mt-2">
            {track.qualified
              ? "Meets sustained-presence review threshold"
              : "Insufficient sustained evidence — cannot confirm from this track"}
          </p>
          <p className="subtle text-xs mt-2">
            Box motion:{" "}
            {track.mean_motion_face_widths_per_second ?? "unavailable"} face
            widths/s · Longest sampled still run:{" "}
            {track.longest_still_seconds.toFixed(1)}s
          </p>
          <p className="subtle text-xs mt-1">
            Eye-line roll:{" "}
            {track.mean_eye_line_roll_degrees == null
              ? "unavailable"
              : `${track.mean_eye_line_roll_degrees}° (${track.roll_samples} samples)`}
            . Not yaw, pitch or gaze.
          </p>
        </div>
      </div>
      {saved || reviewed ? (
        <p role="status" className="text-forest mt-3">
          This track was reviewed. Use Attendance for subsequent corrections.
        </p>
      ) : (
        eligible && (
          <div className="mt-4 space-y-3">
            <label className="field">
              Verified roster student for track {track.id}
              <select
                value={student}
                onChange={(e) => {
                  setStudent(e.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">
                  Select only after reviewing the original recording
                </option>
                {roster.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.identifier}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex gap-2 items-start text-xs">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I reviewed the original recording across this interval and
              independently verified this student's identity. The anonymous
              track may be wrong.
            </label>
            <Button
              variant="primary"
              disabled={busy || !student || !confirmed}
              onClick={async () => {
                const ok = await run(
                  () =>
                    api(
                      `/sessions/${analysis.session_id}/presence-confirmations`,
                      write("POST", {
                        analysis_id: analysis.id,
                        track_id: track.id,
                        student_id: Number(student),
                        identity_confirmed: confirmed,
                      }),
                    ),
                  "Instructor-reviewed attendance saved",
                );
                if (ok) setSaved(true);
              }}
            >
              Confirm reviewed student present
            </Button>
          </div>
        )
      )}
      {!analysis.has_media && (
        <p className="subtle text-xs mt-2">
          Original media unavailable. Use manual attendance; track-assisted
          confirmation is disabled.
        </p>
      )}
    </article>
  );
}

export function PresenceReview({ analysis }: { analysis: Analysis }) {
  const tracking = analysis.result?.video?.face_tracking;
  const [roster, setRoster] = useState<ReviewRoster>([]);
  const [changes, setChanges] = useState<AttendanceChange[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    setRoster([]);
    setChanges([]);
    setError("");
    if (!tracking?.tracks.length) return;
    let active = true;
    api<{ records: ReviewRoster; changes?: AttendanceChange[] }>(
      `/sessions/${analysis.session_id}/attendance`,
    )
      .then((r) => {
        if (active) {
          setRoster(r.records);
          setChanges(r.changes || []);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [analysis.id, analysis.session_id, tracking]);
  if (!tracking) return null;
  return (
    <section className="panel p-5">
      <SectionHead
        title="Face observations & instructor review"
        description={tracking.method}
      />
      <Alert>{tracking.limitations}</Alert>
      <p className="subtle text-xs mt-3">
        {tracking.pose_method} Face thumbnails are private derived data; media
        deletion also removes these thumbnails.
      </p>
      {error && <Alert error>{error}</Alert>}
      {!tracking.eligible_sampling && (
        <p className="text-amber mt-3">
          Sampling is too sparse for sustained-presence confirmation. Use a
          shorter recording with a sampling interval of 10 seconds or less.
        </p>
      )}
      {analysis.has_media && (
        <details className="mt-4">
          <summary className="text-forest cursor-pointer">
            Review original recording locally
          </summary>
          <video
            controls
            preload="none"
            className="mt-3 w-full max-h-96 bg-secondary"
            src={`/api/analyses/${analysis.id}/media`}
          >
            Your browser cannot play this format. Review the original file
            locally before confirming identity.
          </video>
          <p className="subtle text-xs mt-2">
            Some local codecs cannot play in a browser. Review the original file
            in a compatible local player; never confirm from a thumbnail alone.
          </p>
        </details>
      )}
      {!tracking.tracks.length ? (
        <Empty title="No faces detected">
          No identities or attendance were inferred. Frontal Haar detection can
          miss seated, side-facing or occluded people.
        </Empty>
      ) : (
        tracking.tracks.map((track) => (
          <TrackReview
            key={`${analysis.id}-${track.id}`}
            track={track}
            analysis={analysis}
            roster={roster}
            reviewed={changes.some(
              (c) => c.analysis_id === analysis.id && c.track_id === track.id,
            )}
          />
        ))
      )}
    </section>
  );
}

export function FusionPanel({ fusion }: { fusion: ActivityFusion }) {
  return (
    <section className="panel p-5">
      <SectionHead
        title={fusion.label}
        description="A transparent observation score, not a validated engagement score"
      />
      <div className="flex flex-wrap gap-6 items-end mb-4">
        <strong className="text-3xl text-forest">
          {fusion.score ?? "—"}
          <span className="text-sm font-normal text-muted"> / 100</span>
        </strong>
        <p className="subtle">
          {fusion.joint_windows} windows with both signals ·{" "}
          {fusion.window_seconds}s windows · audio offset{" "}
          {fusion.audio_offset_seconds}s
        </p>
      </div>
      <Chart
        data={fusion.points.map((p) => ({ ...p }))}
        xKey="seconds"
        label="Time-aligned observable activity index"
        percent
        series={[
          { key: "score", label: "Available-signal index", color: "#285943" },
          {
            key: "visual",
            label: "Normalized visual change",
            color: "#9AB194",
          },
          {
            key: "sound",
            label: "Sound-active duration (%)",
            color: "#C58B43",
          },
        ]}
      />
      <p className="subtle text-xs mt-4">{fusion.method}</p>
      <Alert>{fusion.limitations}</Alert>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-forest">
          Inspect values and signal coverage
        </summary>
        <div className="overflow-auto max-h-64">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Index</th>
                <th>Visual coverage</th>
                <th>Audio coverage</th>
              </tr>
            </thead>
            <tbody>
              {fusion.points.map((p) => (
                <tr key={p.seconds}>
                  <td>
                    {p.seconds}–{p.end_seconds}s
                  </td>
                  <td>{p.score ?? "Unavailable"}</td>
                  <td>{Math.round(p.visual_coverage * 100)}%</td>
                  <td>{Math.round(p.audio_coverage * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function FusionForm() {
  const { analyses, sessions, run, busy } = useData();
  const [session, setSession] = useState("");
  const [video, setVideo] = useState("");
  const [audio, setAudio] = useState("");
  const [offset, setOffset] = useState("0");
  const [aligned, setAligned] = useState(false);
  const choices = analyses.filter(
    (a) =>
      a.session_id === Number(session) &&
      a.status === "complete" &&
      !a.is_demo &&
      !a.result?.derived_from,
  );
  return (
    <details className="panel p-5">
      <summary className="font-semibold cursor-pointer text-forest">
        Combine separate video and audio recordings
      </summary>
      <p className="subtle mt-3">
        Use recordings of the same lesson. This works with a separate PCM WAV
        when video audio extraction is unavailable. Set when the audio starts
        relative to the video; positive values mean audio begins later.
      </p>
      <form
        className="space-y-3 mt-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const ok = await run(
            () =>
              api(
                `/sessions/${session}/fusion`,
                write("POST", {
                  video_analysis_id: Number(video),
                  audio_analysis_id: Number(audio),
                  audio_offset_seconds: Number(offset),
                }),
              ),
            "Aligned observation analysis saved",
          );
          if (ok) setAligned(false);
        }}
      >
        <label className="field">
          Session to align
          <select
            required
            value={session}
            onChange={(e) => {
              setSession(e.target.value);
              setVideo("");
              setAudio("");
              setAligned(false);
            }}
          >
            <option value="">Select session</option>
            {sessions
              .filter((s) => !s.is_demo)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </select>
        </label>
        <div className="grid md:grid-cols-2 gap-3">
          <label className="field">
            Video observations
            <select
              required
              value={video}
              onChange={(e) => {
                setVideo(e.target.value);
                setAligned(false);
              }}
            >
              <option value="">Select analyzed video</option>
              {choices
                .filter((a) => a.result?.video)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.filename} · #{a.id}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            Audio observations
            <select
              required
              value={audio}
              onChange={(e) => {
                setAudio(e.target.value);
                setAligned(false);
              }}
            >
              <option value="">Select analyzed audio</option>
              {choices
                .filter((a) => a.result?.audio && String(a.id) !== video)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.filename} · #{a.id}
                  </option>
                ))}
            </select>
          </label>
        </div>
        <label className="field max-w-xs">
          Audio start offset (seconds)
          <input
            type="number"
            min={-7200}
            max={7200}
            step="0.1"
            required
            value={offset}
            onChange={(e) => {
              setOffset(e.target.value);
              setAligned(false);
            }}
          />
        </label>
        <label className="flex gap-2 text-xs">
          <input
            type="checkbox"
            checked={aligned}
            onChange={(e) => setAligned(e.target.checked)}
          />
          I checked that both recordings cover the same lesson and reviewed
          their time alignment.
        </label>
        <Button
          variant="primary"
          disabled={busy || !aligned || !video || !audio || video === audio}
        >
          Create combined activity analysis
        </Button>
      </form>
    </details>
  );
}
