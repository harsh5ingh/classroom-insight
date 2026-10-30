import { useEffect, useState } from "react";
import { api } from "./api";
import { useData } from "./data";
import { Alert, Button, SectionHead } from "./ui";
import { FusionPanel } from "./Observations";
import type { Analysis, ActivityFusion, AttendanceChange } from "./types";
interface Report {
  session: { id: number; title: string; is_demo: number };
  summary: {
    present: number;
    absent: number;
    unconfirmed: number;
    rate: number | null;
  };
  analyses: { id: number; status: string; result: Analysis["result"] }[];
  tracks: {
    id: number;
    analysis_id: number;
    first_seen: number;
    last_seen: number;
    observed_presence_seconds: number | null;
    qualified: boolean;
    confirmations: AttendanceChange[];
  }[];
  attendance_changes: (AttendanceChange & { student_id: number })[];
  history_truncated: boolean;
  limitations: string[];
}
interface StudentEvidence {
  history: {
    session_id: number;
    title: string;
    status: string;
    confirmed_at: string | null;
  }[];
  confirmed_tracks: {
    id: number;
    session_id: number;
    track_id: number;
    observed_presence_seconds: number | null;
    first_seen: number | null;
    last_seen: number | null;
  }[];
  limitations: string;
}
type Explained = Omit<ActivityFusion, "points"> & {
  anomalies?: { seconds: number; delta: number; message: string }[];
  points: (ActivityFusion["points"][number] & {
    contributions?: Record<string, number>;
    coverage?: number;
    period?: string;
  })[];
};
export default function SessionInsights() {
  const { sessions, students } = useData();
  const [selected, setSelected] = useState(""),
    [compare, setCompare] = useState(""),
    [student, setStudent] = useState("");
  const [report, setReport] = useState<Report | null>(null),
    [other, setOther] = useState<Report | null>(null),
    [evidence, setEvidence] = useState<StudentEvidence | null>(null),
    [error, setError] = useState("");
  const [weights, setWeights] = useState<{
      visual: number;
      audio: number;
    } | null>(null),
    [vw, setVw] = useState(1),
    [aw, setAw] = useState(1);
  useEffect(() => {
    let keep = true;
    setReport(null);
    setOther(null);
    setError("");
    if (!selected) return;
    const q = weights
      ? `?visual_weight=${weights.visual}&audio_weight=${weights.audio}`
      : "";
    Promise.all([
      api<Report>(`/analytics/sessions/${selected}/report${q}`),
      compare
        ? api<Report>(`/analytics/sessions/${compare}/report${q}`)
        : Promise.resolve(null),
    ])
      .then(([a, b]) => {
        if (keep) {
          setReport(a);
          setOther(b);
        }
      })
      .catch((e) => {
        if (keep) setError(e.message);
      });
    return () => {
      keep = false;
    };
  }, [selected, compare, weights]);
  useEffect(() => {
    let keep = true;
    setEvidence(null);
    if (student)
      api<StudentEvidence>(`/analytics/students/${student}`)
        .then((v) => {
          if (keep) setEvidence(v);
        })
        .catch((e) => {
          if (keep) setError(e.message);
        });
    return () => {
      keep = false;
    };
  }, [student]);
  const fusion = report?.analyses.find((a) => a.result?.fusion)?.result
    ?.fusion as Explained | undefined;
  return (
    <div className="space-y-6">
      <SectionHead
        title="Session evidence & comparison"
        description="Read-only reports, transparent scoring, and instructor-confirmed student associations."
      />
      <div className="grid md:grid-cols-2 gap-4">
        <label className="field">
          Session
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              if (e.target.value === compare) setCompare("");
            }}
          >
            <option value="">Choose a session</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {s.is_demo ? " · sample" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Compare with
          <select value={compare} onChange={(e) => setCompare(e.target.value)}>
            <option value="">No comparison</option>
            {sessions
              .filter((s) => String(s.id) !== selected)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.is_demo ? " · sample" : ""}
                </option>
              ))}
          </select>
        </label>
      </div>
      {error && <Alert error>{error}</Alert>}
      {selected && !report && !error && (
        <p role="status">Loading session evidence…</p>
      )}
      {report && (
        <>
          <div className="flex gap-4 flex-wrap">
            <a
              className="btn"
              href={`/api/analytics/sessions/${selected}/report?format=json`}
              download={`session-${selected}.json`}
            >
              Download JSON report
            </a>
            <a
              className="btn"
              href={`/api/analytics/sessions/${selected}/report?format=csv`}
            >
              Attendance CSV
            </a>
            <Button onClick={() => window.print()}>Print / save PDF</Button>
          </div>
          <p className="subtle">
            Exports use stored analysis weights. A weight preview below is not
            saved or substituted into exports.
          </p>
          <div className="overflow-auto">
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Data source</th>
                  <th>Present</th>
                  <th>Absent</th>
                  <th>Unconfirmed</th>
                  <th>Attendance rate</th>
                </tr>
              </thead>
              <tbody>
                {[report, other]
                  .filter((r): r is Report => !!r)
                  .map((r) => (
                    <tr key={r.session.id}>
                      <td>{r.session.title}</td>
                      <td>
                        {r.session.is_demo
                          ? "Illustrative sample"
                          : "Registered session"}
                      </td>
                      <td>{r.summary.present}</td>
                      <td>{r.summary.absent}</td>
                      <td>{r.summary.unconfirmed}</td>
                      <td>
                        {r.summary.rate == null
                          ? "Unavailable"
                          : `${r.summary.rate.toFixed(1)}%`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <form
            className="panel p-5 flex gap-4 flex-wrap items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setWeights({ visual: vw, audio: aw });
            }}
          >
            <label className="field">
              Preview visual weight
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={vw}
                onChange={(e) => setVw(Number(e.target.value))}
              />
            </label>
            <label className="field">
              Preview audio weight
              <input
                type="number"
                min="0"
                max="10"
                step="0.1"
                value={aw}
                onChange={(e) => setAw(Number(e.target.value))}
              />
            </label>
            <Button type="submit" disabled={vw + aw <= 0}>
              Preview score weights
            </Button>
            <Button type="button" onClick={() => setWeights(null)}>
              Restore stored formula
            </Button>
          </form>
          <p className="subtle">
            Activity provenance:{" "}
            {report.analyses.find((a) => a.result?.fusion)?.result?.kind ??
              "No analysis"}
            . Registered sessions may contain sample or test observations;
            review the source before comparison.
          </p>
          {fusion ? (
            <>
              <FusionPanel fusion={fusion} />
              <details className="panel p-5">
                <summary>Scoring contributions and experimental alerts</summary>
                <table>
                  <thead>
                    <tr>
                      <th>Window</th>
                      <th>Visual contribution</th>
                      <th>Audio contribution</th>
                      <th>Weighted coverage</th>
                      <th>Period</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fusion.points.map((p) => (
                      <tr key={p.seconds}>
                        <td>
                          {p.seconds}–{p.end_seconds}s
                        </td>
                        <td>{p.contributions?.visual ?? "Missing/excluded"}</td>
                        <td>{p.contributions?.sound ?? "Missing/excluded"}</td>
                        <td>
                          {p.coverage == null
                            ? "Unavailable"
                            : `${(p.coverage * 100).toFixed(0)}%`}
                        </td>
                        <td>{p.period}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {fusion.anomalies?.length ? (
                  fusion.anomalies.map((a) => (
                    <Alert key={a.seconds}>
                      {a.seconds}s: {a.delta} points. {a.message}
                    </Alert>
                  ))
                ) : (
                  <p>
                    No qualifying abrupt changes detected. This does not
                    establish teaching effectiveness.
                  </p>
                )}
              </details>
            </>
          ) : (
            <Alert>No measured activity windows available.</Alert>
          )}
          {other?.analyses.find((a) => a.result?.fusion)?.result?.fusion && (
            <section>
              <h2>{other.session.title} — comparison</h2>
              <FusionPanel
                fusion={
                  other.analyses.find((a) => a.result?.fusion)!.result!.fusion!
                }
              />
            </section>
          )}
          <section className="panel p-5">
            <SectionHead
              title="Track timeline and confirmation history"
              description="Observed spans do not fill gaps or establish identity. Only explicit instructor confirmations link a track."
            />
            {!report.tracks.length ? (
              <p>No tracks available.</p>
            ) : (
              <div className="overflow-auto">
                <table>
                  <thead>
                    <tr>
                      <th>Analysis / track</th>
                      <th>First–last observation</th>
                      <th>Credited presence</th>
                      <th>Qualified</th>
                      <th>Confirmation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.tracks.map((t) => (
                      <tr key={`${t.analysis_id}-${t.id}`}>
                        <td>
                          {t.analysis_id} / Track {t.id}
                        </td>
                        <td>
                          {t.first_seen}–{t.last_seen}s
                        </td>
                        <td>
                          {t.observed_presence_seconds == null
                            ? "Unknown (sparse recording)"
                            : `${t.observed_presence_seconds}s`}
                        </td>
                        <td>{t.qualified ? "Yes" : "No"}</td>
                        <td>
                          {t.confirmations
                            .map(
                              (c) =>
                                `${c.name}: ${c.recorded_at} (${c.source})`,
                            )
                            .join("; ") || "Not associated"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <details className="panel p-5">
            <summary>
              Attendance audit timeline ({report.attendance_changes.length}{" "}
              changes)
            </summary>
            {report.history_truncated && (
              <Alert>
                Report truncated at 5000 changes; original history remains in
                SQLite.
              </Alert>
            )}
            <ol>
              {report.attendance_changes.map((c) => (
                <li key={c.id}>
                  {c.recorded_at} · {c.name} · {c.previous_status} → {c.status}{" "}
                  · {c.source}
                </li>
              ))}
            </ol>
          </details>
          <Alert>{report.limitations.join(" ")}</Alert>
        </>
      )}
      <section className="panel p-5 space-y-4">
        <SectionHead
          title="Student evidence"
          description="No individual attention scores or rankings."
        />
        <label className="field">
          Student
          <select value={student} onChange={(e) => setStudent(e.target.value)}>
            <option value="">Choose a registered student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {evidence && (
          <>
            <Alert>{evidence.limitations}</Alert>
            <table>
              <thead>
                <tr>
                  <th>Session</th>
                  <th>Status</th>
                  <th>Confirmed at</th>
                </tr>
              </thead>
              <tbody>
                {evidence.history.map((h) => (
                  <tr key={h.session_id}>
                    <td>{h.title}</td>
                    <td>{h.status}</td>
                    <td>{h.confirmed_at || "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p>Confirmed track observations:</p>
            {evidence.confirmed_tracks.length ? (
              evidence.confirmed_tracks.map((t) => (
                <p key={t.id}>
                  Session {t.session_id} · Track {t.track_id} · {t.first_seen}–
                  {t.last_seen}s · observed credit{" "}
                  {t.observed_presence_seconds ?? "unknown"}s
                </p>
              ))
            ) : (
              <p>No instructor-linked track evidence.</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
