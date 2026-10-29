import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Download,
  FileText,
  Leaf,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  WandSparkles,
} from "lucide-react";
import { api, formatDate, percent, write } from "./api";
import { useData } from "./data";
import { Chart } from "./ChartView";
import { StudentForm } from "./forms";
import {
  AttendanceHistory,
  PresenceReview,
  FusionPanel,
  FusionForm,
} from "./Observations";
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Empty,
  Metric,
  SectionHead,
  TextLink,
} from "./ui";
import type {
  Analysis,
  Analytics,
  AttendanceStatus,
  AttendanceChange,
  Session,
  Student,
} from "./types";

const green = "#285943",
  sage = "#9AB194",
  amber = "#C58B43";
export function SampleNote() {
  return (
    <div className="flex flex-wrap gap-2 items-center text-xs border border-amber/25 bg-amber/5 rounded-md px-4 py-3 text-muted">
      <span className="w-1.5 h-1.5 rounded-full bg-amber" />
      <strong className="font-medium text-ink">
        Sample data is included.
      </strong>{" "}
      Fictional students and simulated measurements are marked “Sample”.
      <Link
        to="/app/settings"
        className="ml-auto text-forest underline underline-offset-2"
      >
        Manage data
      </Link>
    </div>
  );
}
function RateBar({ value }: { value: number | null }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-16 h-1.5 bg-secondary rounded-full">
        <div
          className="h-full bg-forest rounded-full"
          style={{ width: `${value || 0}%` }}
        />
      </div>
      <span className="tabular-nums text-xs">{percent(value)}</span>
    </div>
  );
}
export function SessionTable({ sessions }: { sessions: Session[] }) {
  const { editSession, confirm, run, upload } = useData();
  return (
    <div className="overflow-x-auto">
      <table>
        <thead>
          <tr>
            <th>Session</th>
            <th>Date</th>
            <th>Attendance</th>
            <th>Analysis</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => (
            <tr key={s.id}>
              <td>
                <Link
                  to={`/app/attendance?session=${s.id}`}
                  className="font-medium hover:text-forest"
                >
                  {s.title}
                </Link>
                <div className="text-xs text-muted mt-1.5">
                  {s.instructor}{" "}
                  {s.is_demo === 1 && (
                    <span className="ml-2 text-amber">· Sample</span>
                  )}
                </div>
              </td>
              <td className="whitespace-nowrap text-muted text-xs">
                {formatDate(s.date)}
              </td>
              <td>
                <RateBar value={s.attendance.rate} />
                <div className="text-xs text-muted mt-1">
                  {s.attendance.present} / {s.attendance.total} present
                </div>
              </td>
              <td>
                <Link to={`/app/analytics?session=${s.id}`}>
                  <Badge green={s.analysis?.status === "complete"}>
                    {s.analysis?.status === "complete"
                      ? "Analyzed"
                      : s.analysis?.status || "No recording"}
                  </Badge>
                </Link>
              </td>
              <td>
                <div className="flex gap-1 justify-end">
                  <button
                    aria-label={`Edit ${s.title}`}
                    className="p-2 text-muted hover:text-forest"
                    onClick={() => editSession(s)}
                  >
                    <Pencil size={15} />
                  </button>
                  {!s.is_demo && (
                    <button
                      aria-label={`Upload to ${s.title}`}
                      className="p-2 text-muted hover:text-forest"
                      onClick={() => upload(s.id)}
                    >
                      <Upload size={15} />
                    </button>
                  )}
                  <button
                    aria-label={`Delete ${s.title}`}
                    className="p-2 text-muted hover:text-error"
                    onClick={() =>
                      confirm(
                        "Delete session?",
                        `“${s.title}”, its attendance, media, analyses and suggestions will be permanently removed.`,
                        () =>
                          run(
                            () => api(`/sessions/${s.id}`, write("DELETE")),
                            "Session deleted",
                          ),
                      )
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Overview() {
  const { analytics, run, busy, newSession, upload, recommendations } =
    useData();
  const [period, setPeriod] = useState("30");
  const [filtered, setFiltered] = useState<Analytics | null>(null);
  const [filterError, setFilterError] = useState("");
  useEffect(() => {
    let alive = true;
    const start = new Date();
    start.setDate(start.getDate() - Number(period));
    setFilterError("");
    api<Analytics>(
      `/analytics${period === "all" ? "" : `?start=${start.toISOString().slice(0, 10)}`}`,
    )
      .then((v) => {
        if (alive) setFiltered(v);
      })
      .catch((e) => {
        if (alive) setFilterError(e.message);
      });
    return () => {
      alive = false;
    };
  }, [period, analytics]);
  const data = filtered || analytics;
  const { summary } = data;
  return (
    <div className="space-y-6">
      <div className="section-head">
        <div>
          <p className="eyebrow mb-2">Your classroom, in perspective</p>
          <h1>A clearer view of learning.</h1>
          <p className="subtle mt-2">
            Attendance, observable activity, and thoughtful next steps.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => upload()}>
            <Upload size={16} />
            Upload recording
          </Button>
          <Button variant="primary" onClick={newSession}>
            <Plus size={17} />
            New Session
          </Button>
        </div>
      </div>
      {analytics.demo && <SampleNote />}
      {filterError && <Alert error>{filterError}</Alert>}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="w-1.5 h-1.5 bg-forest rounded-full" />
          Classroom overview <span className="mx-1">/</span>{" "}
          {formatDate(new Date().toISOString())}
        </div>
        <select
          aria-label="Overview period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="w-auto text-xs py-2"
        >
          <option value="30">Last 30 days</option>
          <option value="7">Last 7 days</option>
          <option value="all">All time</option>
        </select>
      </div>
      {analytics.sessions.length === 0 ? (
        <div className="panel">
          <Empty
            title="Every classroom has a story. Start yours."
            action={
              <div className="flex flex-wrap justify-center gap-3">
                <Button variant="primary" onClick={newSession}>
                  <Plus size={16} />
                  Create your first session
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => api("/demo", write("POST")),
                      "Sample dataset loaded",
                    )
                  }
                >
                  Explore sample data
                  <ArrowRight size={16} />
                </Button>
              </div>
            }
          >
            Register your students, confirm attendance, and add a recording when
            you’re ready. Or explore a clearly labelled fictional classroom.
          </Empty>
        </div>
      ) : (
        <>
          <div className="panel grid grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Attendance rate"
              value={percent(summary.rate)}
              detail="Confirmed present / all roster entries"
            />
            <Metric
              label="Present / absent"
              value={`${summary.present} / ${summary.absent}`}
              detail={`${summary.unconfirmed} still unconfirmed`}
            />
            <Metric
              label="Sessions analyzed"
              value={summary.analyzed || 0}
              detail={`Across ${summary.sessions || 0} recorded sessions`}
            />
            <Metric
              label="Attendance records"
              value={summary.total}
              detail="Student-session entries in selected period"
            />
          </div>
          <div className="grid xl:grid-cols-[1.65fr_1fr] gap-6">
            <section className="panel p-6 min-w-0">
              <SectionHead
                title="The rhythm of your sessions"
                description="Mean scene change across sampled frames"
                action={
                  <Link
                    to="/app/analytics"
                    className="text-xs text-forest flex items-center gap-1"
                  >
                    Explore analytics
                    <ChevronRight size={14} />
                  </Link>
                }
              />
              <Chart
                data={data.trend.map((t) => ({ ...t }))}
                series={[
                  {
                    key: "activity",
                    label: "Scene change · % of intensity range",
                    color: green,
                  },
                ]}
                type="area"
                label="Session-level mean scene changes"
              />
              <p className="text-xs text-muted mt-4 border-t border-line pt-4">
                Visual change is an observation, not a measure of attention or
                learning.
              </p>
            </section>
            <section className="bg-deep text-white rounded-lg p-6 flex flex-col">
              <div className="flex justify-between items-center">
                <p className="eyebrow text-white/60">A moment for reflection</p>
                <Leaf size={21} className="text-sage" />
              </div>
              <h2 className="font-editorial font-normal text-2xl leading-snug mt-6">
                Small observations.
                <br />
                More intentional teaching.
              </h2>
              <p className="text-white/65 leading-relaxed mt-4 text-sm">
                {recommendations[0]?.items[0]?.body ||
                  "Use session observations alongside your own classroom context to plan your next lesson."}
              </p>
              <div className="border-t border-white/15 pt-5 mt-auto">
                <p className="text-[11px] text-white/55 mt-6 mb-3">
                  ADVISORY ·{" "}
                  {recommendations[0]?.is_demo
                    ? "BASED ON SAMPLE DATA"
                    : "INSTRUCTOR REVIEW"}
                </p>
                <Link
                  to="/app/recommendations"
                  className="inline-flex items-center gap-2 text-sm text-sage"
                >
                  Review teaching suggestions
                  <ArrowRight size={16} />
                </Link>
              </div>
            </section>
          </div>
          <section className="panel overflow-hidden">
            <div className="p-6 pb-0">
              <SectionHead
                title="Recent sessions"
                description="A record of what happened, and what to review next."
                action={
                  <Link to="/app/sessions" className="text-forest text-xs">
                    View all sessions →
                  </Link>
                }
              />
            </div>
            <SessionTable sessions={data.sessions.slice(0, 4)} />
          </section>
        </>
      )}
      <div className="grid lg:grid-cols-[1.65fr_1fr] gap-6">
        <section className="pt-2">
          <SectionHead title="Recent activity" />
          {analytics.events.length ? (
            <div className="divide-y divide-line">
              {analytics.events.slice(0, 4).map((e) => (
                <div key={e.id} className="py-3 flex gap-3 items-center">
                  <span className="rounded-full bg-sage p-1.5 text-forest">
                    <Check size={13} />
                  </span>
                  <span className="text-sm flex-1">
                    {e.message}
                    {!!e.is_demo && (
                      <span className="text-xs text-muted ml-2">Sample</span>
                    )}
                  </span>
                  <span className="text-xs text-muted">
                    {formatDate(e.created_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="subtle">
              Your session and attendance updates will appear here.
            </p>
          )}
        </section>
        <section className="border-l border-line pl-6 py-2">
          <ShieldCheck size={21} className="text-forest mb-3" />
          <h3>Built around trust</h3>
          <p className="subtle mt-2 text-xs">
            Attendance is confirmed by you. Recordings stay local. Observations
            are kept separate from identity and interpretation.
          </p>
          <Link
            to="/app/settings"
            className="inline-block text-forest text-xs mt-3"
          >
            Privacy & data settings →
          </Link>
        </section>
      </div>
    </div>
  );
}

export function Sessions() {
  const { sessions, newSession, upload } = useData();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const filtered = sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "all" ||
        (filter === "sample" && s.is_demo) ||
        (filter === "real" && !s.is_demo)),
  );
  return (
    <div className="space-y-6">
      <SectionHead
        title="Your session library"
        description="Create, review, and return to each classroom session."
        action={
          <div className="flex gap-2">
            <Button onClick={() => upload()}>
              <Upload size={16} />
              Upload recording
            </Button>
            <Button variant="primary" onClick={newSession}>
              <Plus size={16} />
              New Session
            </Button>
          </div>
        }
      />
      <div className="flex gap-3">
        <label className="relative max-w-sm w-full">
          <Search size={16} className="absolute top-3.5 left-3 text-muted" />
          <input
            aria-label="Search sessions"
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search sessions…"
          />
        </label>
        <select
          className="w-auto"
          aria-label="Session data source"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All sources</option>
          <option value="real">Real sessions</option>
          <option value="sample">Sample sessions</option>
        </select>
      </div>
      <div className="panel">
        {filtered.length ? (
          <SessionTable sessions={filtered} />
        ) : (
          <Empty
            title="No sessions found"
            action={<Button onClick={newSession}>Create a session</Button>}
          >
            Try another search or start a new classroom record.
          </Empty>
        )}
      </div>
      <AnalysisList />
    </div>
  );
}
export function AnalysisList({ sessionId }: { sessionId?: number }) {
  const { analyses, sessions, confirm, run } = useData();
  const list = analyses.filter((a) => !sessionId || a.session_id === sessionId);
  return (
    <section>
      <SectionHead
        title="Recording processing"
        description="Local analysis status and media controls"
      />
      {!list.length ? (
        <p className="subtle">
          Uploaded recordings will appear here with processing progress.
        </p>
      ) : (
        <div className="panel divide-y divide-line">
          {list.map((a) => (
            <div key={a.id} className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <FileText size={18} className="text-forest" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium wrap-break-words">{a.filename}</p>
                  <p className="text-xs text-muted mt-1">
                    {sessions.find((s) => s.id === a.session_id)?.title} ·{" "}
                    {a.is_demo
                      ? "Simulated sample"
                      : a.has_media
                        ? "Original stored locally"
                        : "Original media deleted"}
                  </p>
                </div>
                <Badge green={a.status === "complete"}>{a.status}</Badge>
                {a.status !== "processing" && a.status !== "queued" && (
                  <button
                    className="text-muted p-2 hover:text-error"
                    aria-label={`Delete analysis ${a.id}`}
                    onClick={() =>
                      confirm(
                        "Delete analysis?",
                        "This removes the original media, calculated metrics and saved suggestions for this session.",
                        () =>
                          run(
                            () => api(`/analyses/${a.id}`, write("DELETE")),
                            "Analysis deleted",
                          ),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
              {(a.status === "processing" || a.status === "queued") && (
                <div className="mt-3">
                  <p className="text-xs text-muted mb-1" role="status">
                    Processing sampled signals · {a.progress}%
                  </p>
                  <progress
                    value={a.progress}
                    max={100}
                    className="w-full accent-forest"
                  />
                </div>
              )}
              {a.error && (
                <div className="mt-3">
                  <Alert error>{a.error}</Alert>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function Attendance() {
  const { sessions, run, busy, confirm } = useData();
  const [params, setParams] = useSearchParams();
  const selected = Number(params.get("session")) || sessions[0]?.id;
  const session = sessions.find((s) => s.id === selected);
  const [records, setRecords] = useState<
    (Pick<Student, "id" | "name" | "identifier" | "cohort"> & {
      status: AttendanceStatus;
      confirmed_at?: string | null;
      updated_at?: string | null;
      source?: string;
    })[]
  >([]);
  const [changes, setChanges] = useState<AttendanceChange[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    if (!selected) return;
    let active = true;
    setLoading(true);
    setError("");
    api<{ records: typeof records; changes?: AttendanceChange[] }>(
      `/sessions/${selected}/attendance`,
    )
      .then((v) => {
        if (active) {
          setRecords(v.records);
          setChanges(v.changes || []);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selected, sessions]);
  const update = (id: number, status: AttendanceStatus) =>
    run(
      () =>
        api(
          `/sessions/${selected}/attendance`,
          write("PUT", { records: [{ student_id: id, status }] }),
        ),
      "Attendance saved",
    );
  const shown = records.filter(
    (r) =>
      (r.name + " " + r.identifier)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "all" || r.status === filter),
  );
  if (!sessions.length)
    return (
      <Empty
        title="Create a session to take attendance"
        action={
          <Link to="/app/sessions" className="btn btn-primary">
            Go to sessions
          </Link>
        }
      >
        Students on the roster start unconfirmed until you review them.
      </Empty>
    );
  return (
    <div className="space-y-6">
      <SectionHead
        title="Attendance, confirmed by you"
        description="Registered identities. Explicit confirmation. A reliable record."
        action={
          <a
            className="btn"
            href={`/api/export/attendance.csv?session_id=${selected}`}
          >
            <Download size={16} />
            Export CSV
          </a>
        }
      />
      <label className="field max-w-lg">
        Session
        <select
          value={selected}
          onChange={(e) => setParams({ session: e.target.value })}
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} · {formatDate(s.date)}
              {s.is_demo ? " · Sample" : ""}
            </option>
          ))}
        </select>
      </label>
      {session?.is_demo === 1 && <SampleNote />}
      {session && (
        <div className="panel grid grid-cols-2 lg:grid-cols-4">
          <Metric
            label="Attendance rate"
            value={percent(session.attendance.rate)}
            detail="Present / all roster entries"
          />
          <Metric
            label="Present"
            value={session.attendance.present}
            detail="Manually confirmed"
          />
          <Metric
            label="Absent"
            value={session.attendance.absent}
            detail="Manually confirmed"
          />
          <Metric
            label="Unconfirmed"
            value={session.attendance.unconfirmed}
            detail="Awaiting instructor review"
          />
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search attendance"
          className="max-w-xs"
          placeholder="Search name or identifier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Attendance status filter"
          className="w-auto"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          <option value="present">Present</option>
          <option value="absent">Absent</option>
          <option value="unconfirmed">Unconfirmed</option>
        </select>
        <Button
          disabled={busy}
          onClick={() =>
            run(
              () => api(`/sessions/${selected}/roster`, write("POST")),
              "New students added to roster",
            )
          }
        >
          Add newly registered students
        </Button>
        {records.length > 0 && (
          <Button
            disabled={busy}
            onClick={() =>
              confirm(
                "Confirm everyone present?",
                `This will mark all ${records.length} students on this session’s roster present. You can change individual statuses afterwards.`,
                () =>
                  run(
                    () =>
                      api(
                        `/sessions/${selected}/attendance`,
                        write("PUT", {
                          records: records.map((r) => ({
                            student_id: r.id,
                            status: "present",
                          })),
                        }),
                      ),
                    "Roster confirmed",
                  ),
              )
            }
          >
            Mark all present
          </Button>
        )}
      </div>
      {error && <Alert error>{error}</Alert>}
      <div className="panel overflow-x-auto">
        {loading ? (
          <p role="status" className="p-8 subtle">
            Loading attendance…
          </p>
        ) : shown.length ? (
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Identifier</th>
                <th>Cohort</th>
                <th>Attendance status</th>
                <th>Last confirmed</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.name}</td>
                  <td className="text-muted text-xs font-mono">
                    {r.identifier}
                  </td>
                  <td className="text-muted text-xs">{r.cohort || "—"}</td>
                  <td>
                    <select
                      aria-label={`Attendance for ${r.name}`}
                      className={`min-w-36 text-xs py-2 ${r.status === "present" ? "text-forest bg-sage/40" : ""}`}
                      value={r.status}
                      disabled={busy}
                      onChange={(e) =>
                        update(r.id, e.target.value as AttendanceStatus)
                      }
                    >
                      <option value="unconfirmed">Unconfirmed</option>
                      <option value="present">Present</option>
                      <option value="absent">Absent</option>
                    </select>
                  </td>
                  <td className="text-xs text-muted">
                    {r.confirmed_at
                      ? new Date(r.confirmed_at).toLocaleString()
                      : "Not recorded"}
                    <br />
                    {r.source === "instructor_reviewed_track"
                      ? "Instructor-reviewed track"
                      : r.source === "manual"
                        ? "Manual"
                        : "Legacy / unconfirmed"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty title="No students on this view">
            Register students, add them to this roster, or adjust the filters.
          </Empty>
        )}
      </div>
      <p className="subtle text-xs">
        Unconfirmed entries remain in the attendance-rate denominator. Anonymous
        detection never changes this record.
      </p>
      <AttendanceHistory changes={changes} />
    </div>
  );
}

export function Students() {
  const { students, confirm, run } = useData();
  const [search, setSearch] = useState("");
  const [cohort, setCohort] = useState("all");
  const [edit, setEdit] = useState<Student | true | null>(null);
  const [history, setHistory] = useState<Student | null>(null);
  const cohorts = [...new Set(students.map((s) => s.cohort).filter(Boolean))];
  const list = students.filter(
    (s) =>
      (s.name + " " + s.identifier)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (cohort === "all" || s.cohort === cohort),
  );
  return (
    <div className="space-y-6">
      <SectionHead
        title="The people in your classroom"
        description={`${students.length} registered students · Attendance linked to real roster records`}
        action={
          <Button variant="primary" onClick={() => setEdit(true)}>
            <Plus size={16} />
            Register student
          </Button>
        }
      />
      <div className="flex gap-3">
        <input
          aria-label="Search students"
          placeholder="Search name or student identifier…"
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          aria-label="Filter cohort"
          className="w-auto max-w-xs"
          value={cohort}
          onChange={(e) => setCohort(e.target.value)}
        >
          <option value="all">All cohorts</option>
          {cohorts.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="panel overflow-x-auto">
        {list.length ? (
          <table>
            <thead>
              <tr>
                <th>Student</th>
                <th>Identifier</th>
                <th>Cohort</th>
                <th>Attendance</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="flex gap-3 items-center">
                      <span className="w-9 h-9 rounded-full bg-secondary text-forest flex items-center justify-center text-xs font-medium shrink-0">
                        {s.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <div>
                        <button
                          className="font-medium hover:text-forest text-left"
                          onClick={() => setHistory(s)}
                        >
                          {s.name}
                        </button>
                        {!!s.is_demo && (
                          <p className="text-xs text-amber mt-1">
                            Sample student
                          </p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="font-mono text-xs text-muted">
                    {s.identifier}
                  </td>
                  <td className="text-xs text-muted">{s.cohort || "—"}</td>
                  <td>
                    <RateBar value={s.rate} />
                  </td>
                  <td>
                    <div className="flex gap-2">
                      <button
                        className="p-2 text-muted"
                        aria-label={`Edit ${s.name}`}
                        onClick={() => setEdit(s)}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="p-2 text-muted hover:text-error"
                        aria-label={`Delete ${s.name}`}
                        onClick={() =>
                          confirm(
                            "Delete student?",
                            `Permanently remove ${s.name} and their attendance history?`,
                            () =>
                              run(
                                () => api(`/students/${s.id}`, write("DELETE")),
                                "Student deleted",
                              ),
                          )
                        }
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty
            title="Build your classroom roster"
            action={
              <Button onClick={() => setEdit(true)}>Register a student</Button>
            }
          >
            Add students with unique identifiers to start recording attendance.
          </Empty>
        )}
      </div>
      {edit && (
        <StudentForm
          student={edit === true ? undefined : edit}
          onClose={() => setEdit(null)}
        />
      )}{" "}
      {history && (
        <Dialog
          title={`${history.name} · attendance history`}
          onClose={() => setHistory(null)}
        >
          {history.history.length ? (
            <div className="divide-y divide-line max-h-96 overflow-auto">
              {history.history.map((h) => (
                <div
                  key={h.session_id}
                  className="py-4 flex justify-between gap-4"
                >
                  <div>
                    <Link
                      to={`/app/attendance?session=${h.session_id}`}
                      className="text-forest"
                      onClick={() => setHistory(null)}
                    >
                      {h.title}
                    </Link>
                    <p className="text-xs text-muted mt-1">
                      {formatDate(h.date)}
                    </p>
                  </div>
                  <Badge green={h.status === "present"}>{h.status}</Badge>
                  <span className="text-xs text-muted">
                    {h.confirmed_at
                      ? new Date(h.confirmed_at).toLocaleString()
                      : "Confirmation time not recorded"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="subtle">No sessions in this student’s history yet.</p>
          )}
        </Dialog>
      )}
      <p className="text-xs text-muted">
        Select a student name to review attendance history. New registrations
        can be added to existing sessions from Attendance.
      </p>
    </div>
  );
}

function AnalysisDetail({ analysis }: { analysis: Analysis }) {
  const result = analysis.result;
  if (!result) return null;
  const { video, audio } = result;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3 items-center">
        <Badge green>
          {result.kind === "simulated"
            ? "Simulated sample"
            : "Calculated locally"}
        </Badge>
        <span className="subtle text-xs">
          {analysis.filename} · {formatDate(analysis.created_at)}
        </span>
      </div>
      {result.fusion && <FusionPanel fusion={result.fusion} />}
      <PresenceReview analysis={analysis} />
      {video?.face_tracking && (
        <section className="panel p-5">
          <SectionHead
            title="Detected frontal faces"
            description="Anonymous sampled detections, separate from HOG person estimates"
          />
          <Chart
            data={video.points.map((p) => ({ ...p }))}
            xKey="seconds"
            label="Detected frontal faces by sampled frame"
            series={[
              {
                key: "faces",
                label: "Frontal face detections (max 100/frame)",
                color: green,
              },
            ]}
          />
        </section>
      )}
      <div className="grid lg:grid-cols-2 gap-6">
        {video && (
          <>
            <section className="panel p-6 min-w-0">
              <SectionHead
                title="Visible person estimates"
                description={
                  video.detector || "Person count estimation unavailable"
                }
              />
              <Chart
                data={video.points.map((p) => ({ ...p }))}
                xKey="seconds"
                series={[
                  {
                    key: "count",
                    label: "Estimated visible people",
                    color: green,
                  },
                ]}
                label="Estimated visible people across sampled frames"
              />
              <p className="subtle text-xs mt-4">{video.limitations}</p>
            </section>
            <section className="panel p-6 min-w-0">
              <SectionHead
                title="Observable scene change"
                description={`${video.frames_sampled} sampled frames · about ${video.sample_seconds}s apart`}
              />
              <Chart
                data={video.points.map((p) => ({ ...p }))}
                xKey="seconds"
                series={[
                  { key: "activity", label: "Scene change (%)", color: amber },
                ]}
                label="Scene change between sampled video frames"
              />
              <p className="subtle text-xs mt-4">
                {video.method} Camera movement and lighting can affect this
                signal.
              </p>
            </section>
          </>
        )}
        {audio && (
          <section className="panel p-6 lg:col-span-2 min-w-0">
            <SectionHead
              title="The sound of the session"
              description={`Sound-active windows: ${(audio.active_fraction * 100).toFixed(1)}% · Duration: ${Math.round(audio.duration_seconds)} seconds`}
            />
            <Chart
              data={audio.energy}
              xKey="seconds"
              type="area"
              series={[
                { key: "energy", label: "RMS audio energy", color: green },
              ]}
              label="Audio energy over the recording"
            />
            <p className="subtle text-xs mt-4">
              {audio.method} Sound activity does not establish speech, speaker
              identity, or participation.
            </p>
            {audio.activity_bouts !== undefined && (
              <p className="subtle text-xs mt-3">
                Sound-active bouts: {audio.activity_bouts} ·{" "}
                {audio.bouts_per_minute} per minute. These are not speaker
                turns.
              </p>
            )}
            {audio.speech_like_fraction !== undefined && (
              <p className="subtle text-xs mt-3">
                Speech-like acoustic heuristic:{" "}
                {(audio.speech_like_fraction * 100).toFixed(1)}% of duration.{" "}
                {audio.speech_method}
              </p>
            )}
            {audio.active_intervals.length > 0 && (
              <details className="mt-4 text-xs">
                <summary className="cursor-pointer text-forest">
                  View sound-active intervals ({audio.active_intervals.length})
                </summary>
                <p className="mt-2 max-h-24 overflow-y-auto text-muted">
                  {audio.active_intervals
                    .map((i) => `${i.start.toFixed(0)}–${i.end.toFixed(0)}s`)
                    .join(" · ")}
                </p>
              </details>
            )}
          </section>
        )}
      </div>
      {result.unavailable.map((s) => (
        <Alert key={s}>{s}</Alert>
      ))}
      {result.notes.map((note, i) => (
        <p className="subtle text-xs" key={i}>
          {note}
        </p>
      ))}
    </div>
  );
}
export function AnalyticsPage() {
  const { analytics, analyses, sessions } = useData();
  const [params, setParams] = useSearchParams();
  const selected = params.get("session") || "";
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [data, setData] = useState(analytics);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const q = new URLSearchParams();
    if (start) q.set("start", start);
    if (end) q.set("end", end);
    if (selected) q.set("session_id", selected);
    setError("");
    api<Analytics>(`/analytics?${q}`)
      .then((v) => {
        if (active) setData(v);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [start, end, selected, analytics]);
  const matching = analyses.filter(
    (a) =>
      a.status === "complete" &&
      data.sessions.some((s) => s.id === a.session_id),
  );
  const [analysisId, setAnalysisId] = useState("");
  const chosen =
    matching.find((a) => String(a.id) === analysisId) || matching[0];
  return (
    <div className="space-y-6">
      <SectionHead
        title="Observe patterns. Keep the context."
        description="Session observations and an explainable activity index. Not a measurement of attention or learning."
      />
      <FusionForm />
      <div className="flex flex-wrap gap-4">
        <label className="field flex-1 min-w-48">
          Session
          <select
            value={selected}
            onChange={(e) =>
              setParams(e.target.value ? { session: e.target.value } : {})
            }
          >
            <option value="">All sessions</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
                {s.is_demo ? " · Sample" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          From
          <input
            aria-label="Analytics start date"
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </label>
        <label className="field">
          To
          <input
            aria-label="Analytics end date"
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
      </div>
      {error ? (
        <Alert error>{error}</Alert>
      ) : (
        <>
          {data.demo && <SampleNote />}
          <div className="grid lg:grid-cols-2 gap-6">
            <section className="panel p-6 min-w-0">
              <SectionHead
                title="Attendance over time"
                description="Confirmed present / full session roster"
              />
              <Chart
                data={data.trend.map((t) => ({ ...t }))}
                series={[
                  { key: "rate", label: "Attendance rate (%)", color: green },
                ]}
                percent
                label="Attendance rate by session"
              />
            </section>
            <section className="panel p-6 min-w-0">
              <SectionHead
                title="Session comparison"
                description="Mean scene change · not an attention measure"
              />
              <Chart
                data={data.trend.map((t) => ({ ...t }))}
                series={[
                  {
                    key: "activity",
                    label: "Mean scene change (%)",
                    color: sage,
                  },
                ]}
                type="bar"
                label="Mean visual change by session"
              />
            </section>
          </div>
          <p className="subtle text-xs">
            {data.summary.sessions} sessions in view · {data.summary.analyzed}{" "}
            with completed analysis · {percent(data.summary.rate)} attendance.
            Missing signals are left blank.
          </p>
          {chosen ? (
            <>
              <div className="border-t border-line pt-6">
                <SectionHead title="Inside a recording" />
                <label className="field max-w-xl">
                  Analysis
                  <select
                    value={chosen.id}
                    onChange={(e) => setAnalysisId(e.target.value)}
                  >
                    {matching.map((a) => (
                      <option key={a.id} value={a.id}>
                        {sessions.find((s) => s.id === a.session_id)?.title} ·{" "}
                        {a.filename}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <AnalysisDetail analysis={chosen} />
            </>
          ) : (
            <div className="panel">
              <Empty title="No analyzed recordings in this view">
                Upload a recording from Sessions to inspect signals over time.
              </Empty>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function Recommendations() {
  const { sessions, recommendations, run, busy } = useData();
  const [selected, setSelected] = useState(String(sessions[0]?.id || ""));
  const [gemini, setGemini] = useState(false);
  const [filter, setFilter] = useState("all");
  const list = recommendations.filter(
    (r) => filter === "all" || String(r.session_id) === filter,
  );
  return (
    <div className="space-y-6">
      <SectionHead
        title="From observation to a next step"
        description="Evidence-linked teaching suggestions. Always advisory, always yours to assess."
      />
      <div className="panel p-6">
        <div className="flex flex-wrap gap-4 items-end">
          <label className="field flex-1 min-w-48">
            Choose a session
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="" disabled>
                Select a session
              </option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                  {s.is_demo ? " · Sample" : ""}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="primary"
            disabled={busy || !selected}
            onClick={() =>
              run(
                () =>
                  api(
                    "/recommendations",
                    write("POST", {
                      session_id: Number(selected),
                      use_gemini: gemini,
                    }),
                  ),
                "Suggestions generated",
              )
            }
          >
            <WandSparkles size={16} />
            {busy ? "Generating…" : "Generate suggestions"}
          </Button>
        </div>
        <label className="flex gap-2 items-center mt-4 text-xs">
          <input
            type="checkbox"
            checked={gemini}
            onChange={(e) => setGemini(e.target.checked)}
          />
          Use Gemini if available (send aggregate metrics only)
        </label>
        <p className="subtle text-xs mt-2">
          Local rules work without a key. Gemini availability is verified when
          requested; failures fall back to local rules.
        </p>
      </div>
      <div className="flex justify-between items-center">
        <h2>Teaching notebook</h2>
        <select
          aria-label="Filter recommendations"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-auto max-w-xs text-xs"
        >
          <option value="all">All sessions</option>
          {sessions.map((s) => (
            <option value={s.id} key={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      {list.length ? (
        <div className="space-y-6">
          {list.map((r) => (
            <section className="panel p-6" key={r.id}>
              <div className="flex flex-wrap justify-between gap-3 mb-4">
                <div>
                  <p className="eyebrow mb-2">{r.title}</p>
                  <p className="text-xs text-muted">
                    {formatDate(r.created_at)}
                    {r.is_demo ? " · Based on simulated sample data" : ""}
                  </p>
                </div>
                <Badge green={r.source === "local"}>
                  {r.source === "gemini" ? "Gemini" : "Local rules"} · Advisory
                </Badge>
              </div>
              <div className="grid md:grid-cols-2 gap-6">
                {r.items.map((item, i) => (
                  <article key={i} className="border-l-2 border-sage pl-4">
                    <h3>{item.title}</h3>
                    <p className="subtle mt-2">{item.body}</p>
                    <p className="text-xs text-forest bg-sage/35 rounded p-3 mt-3">
                      <strong className="font-medium">Evidence: </strong>
                      {item.evidence}
                    </p>
                  </article>
                ))}
              </div>
              <p className="text-xs text-muted mt-5">{r.note}</p>
            </section>
          ))}
        </div>
      ) : (
        <Empty title="Your teaching notebook starts here">
          Choose a session and generate evidence-linked suggestions.
        </Empty>
      )}
    </div>
  );
}

export function Reports() {
  const { sessions, analytics, analyses, recommendations } = useData();
  const [selected, setSelected] = useState("");
  const list = selected
    ? sessions.filter((s) => String(s.id) === selected)
    : sessions;
  const total = list.reduce((v, s) => v + s.attendance.total, 0);
  const present = list.reduce((v, s) => v + s.attendance.present, 0);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const download = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      const ids = new Set(list.map((s) => s.id));
      const attendance = await Promise.all(
        list.map(async (s) => ({
          session_id: s.id,
          ...(await api<{ records: unknown[]; changes: AttendanceChange[] }>(
            `/sessions/${s.id}/attendance`,
          )),
        })),
      );
      const payload = {
        generated_at: new Date().toISOString(),
        disclaimer:
          "Counts are estimates; sample records are simulated. Attendance is manually confirmed.",
        sessions: list,
        attendance,
        attendance_history_limit:
          "Latest 500 changes per session. Face thumbnails excluded.",
        analyses: analyses
          .filter((a) => ids.has(a.session_id))
          .map((a) => ({
            ...a,
            result: a.result
              ? {
                  ...a.result,
                  video: a.result.video
                    ? {
                        ...a.result.video,
                        face_tracking: a.result.video.face_tracking
                          ? {
                              ...a.result.video.face_tracking,
                              tracks: a.result.video.face_tracking.tracks.map(
                                ({ preview: _preview, ...track }) => track,
                              ),
                            }
                          : undefined,
                      }
                    : null,
                }
              : null,
          })),
        recommendations: recommendations.filter((r) => ids.has(r.session_id)),
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "classroom-insight-report.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDownloadError(
        e instanceof Error ? e.message : "Report download failed.",
      );
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="space-y-6">
      <SectionHead
        title="A record worth keeping"
        description="Export attendance and session evidence for your own review."
      />
      <div className="flex flex-wrap gap-3 no-print">
        <select
          className="max-w-md"
          aria-label="Report scope"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">All sessions</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
              {s.is_demo ? " · Sample" : ""}
            </option>
          ))}
        </select>
        <a
          className="btn"
          href={`/api/export/attendance.csv${selected ? `?session_id=${selected}` : ""}`}
        >
          <Download size={16} />
          Attendance CSV
        </a>
        <Button onClick={() => void download()} disabled={downloading}>
          <Download size={16} />
          {downloading ? "Preparing report…" : "Full report JSON"}
        </Button>
        <Button variant="primary" onClick={() => window.print()}>
          <FileText size={16} />
          Print / save PDF
        </Button>
      </div>
      {downloadError && <Alert error>{downloadError}</Alert>}
      <article className="panel p-6 md:p-10">
        <div className="flex justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="eyebrow mb-3">Classroom Insight / Session report</p>
            <h1 className="text-2xl">
              {selected ? list[0]?.title : "Classroom observation report"}
            </h1>
            <p className="subtle mt-2">
              Prepared {formatDate(new Date().toISOString())}
            </p>
          </div>
          <BookOpen size={30} className="text-forest shrink-0" />
        </div>
        {list.some((s) => s.is_demo) && (
          <p className="text-sm text-amber mt-5">
            Includes fictional sample records. These are not live classroom
            measurements.
          </p>
        )}
        <div className="grid grid-cols-3 border-b border-line my-4">
          <Metric
            label="Sessions"
            value={list.length}
            detail="Included in this report"
          />
          <Metric
            label="Attendance"
            value={percent(total ? (present / total) * 100 : null)}
            detail="Present / full roster"
          />
          <Metric
            label="Present records"
            value={present}
            detail={`Of ${total} roster entries`}
          />
        </div>
        {list.length ? (
          <div className="space-y-7 py-5">
            {list.map((s) => (
              <div key={s.id}>
                <h3>
                  {s.title} {s.is_demo ? "(Sample)" : ""}
                </h3>
                <p className="subtle text-xs mt-1">
                  {formatDate(s.date)} · {s.instructor}
                </p>
                <p className="subtle mt-2">
                  {s.attendance.present} present · {s.attendance.absent} absent
                  · {s.attendance.unconfirmed} unconfirmed ·{" "}
                  {percent(s.attendance.rate)} attendance.
                </p>
                <p className="subtle text-xs mt-1">
                  Analysis: {s.analysis?.status || "Not uploaded"}.{" "}
                  {s.is_demo
                    ? "All sample media indicators are simulated."
                    : ""}
                </p>
                {(() => {
                  const latest = analyses.find(
                    (a) => a.session_id === s.id && a.status === "complete",
                  );
                  const fusion = latest?.result?.fusion;
                  return fusion ? (
                    <p className="subtle text-xs mt-2">
                      Observable activity index: {fusion.score ?? "unavailable"}
                      /100 · {fusion.joint_windows} joint windows. Experimental,
                      not validated engagement. {fusion.method}
                    </p>
                  ) : null;
                })()}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="No records to report">
            Create a session or load sample data from Settings.
          </Empty>
        )}
        <div className="border-t border-line pt-6">
          <h3>Interpretation & limitations</h3>
          <p className="subtle mt-2 text-xs">
            Attendance is manually confirmed against registered students.
            Anonymous visual counts are estimates, and scene change and audio
            energy are observable signals, not measures of internal attention,
            emotion or learning. Full time-series measurements and saved
            suggestions are included in the JSON export. Exported files may
            contain student records; store them responsibly.
          </p>
          <p className="text-xs text-muted mt-3">
            {analytics.summary.unconfirmed} unconfirmed entries across the
            complete database.
          </p>
        </div>
      </article>
    </div>
  );
}

export function Settings() {
  const { config, analyses, run, busy, confirm } = useData();
  const [interval, setInterval] = useState(config.preferences.sample_seconds);
  const [detection, setDetection] = useState(
    config.preferences.person_detection,
  );
  const [faces, setFaces] = useState(config.preferences.face_detection ?? true);
  const [verification, setVerification] = useState("");
  const media = analyses.filter((a) => a.has_media);
  return (
    <div className="space-y-8">
      <SectionHead
        title="Your classroom. Your controls."
        description="Local storage, transparent processing, and optional AI assistance."
      />
      <section className="grid md:grid-cols-[240px_1fr] gap-6 border-b border-line pb-8">
        <div>
          <h2>Gemini connection</h2>
          <p className="subtle text-xs mt-2">Optional cloud recommendations</p>
        </div>
        <div className="panel p-6 space-y-4">
          <div className="flex justify-between gap-4">
            <div>
              <h3>{config.gemini.model}</h3>
              <p className="subtle text-xs mt-1">
                {config.gemini.credential_supplied
                  ? "Credential supplied; API access is unverified."
                  : "No credential supplied. Local rules are available."}
              </p>
            </div>
            <Badge>
              {config.gemini.access === "not_configured"
                ? "Not configured"
                : "Unverified"}
            </Badge>
          </div>
          <p className="subtle">
            Set GEMINI_API_KEY and GEMINI_MODEL in the root .env file, then
            restart Flask. Credentials never enter the browser.
          </p>
          <Button
            disabled={busy}
            onClick={() =>
              run(async () => {
                const result = await api<{ message: string }>(
                  "/config/verify-gemini",
                  write("POST"),
                );
                setVerification(result.message);
              }, "Connection check finished")
            }
          >
            Verify model access
          </Button>
          {verification && <Alert>{verification}</Alert>}
          <p className="text-xs text-muted">
            Verification checks model access, not generation quota. Requests
            send validated aggregate metrics only.
          </p>
        </div>
      </section>
      <section className="grid md:grid-cols-[240px_1fr] gap-6 border-b border-line pb-8">
        <div>
          <h2>Analysis preferences</h2>
          <p className="subtle text-xs mt-2">Applies to future uploads</p>
        </div>
        <form
          className="panel p-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                api(
                  "/settings",
                  write("PUT", {
                    sample_seconds: interval,
                    person_detection: detection,
                    face_detection: faces,
                  }),
                ),
              "Analysis preferences saved",
            );
          }}
        >
          <label className="field max-w-xs">
            Frame sample interval (seconds)
            <input
              type="number"
              min={2}
              max={60}
              required
              value={interval}
              onChange={(e) => setInterval(Number(e.target.value))}
            />
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={detection}
              onChange={(e) => setDetection(e.target.checked)}
            />
            Estimate visible people using OpenCV HOG
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={faces}
              onChange={(e) => setFaces(e.target.checked)}
            />
            Enable anonymous face observations and local review thumbnails
          </label>
          <p className="subtle text-xs">
            Face tracks are not student identities. Review thumbnails are stored
            locally with derived metrics and removed when original media is
            deleted. Attendance requires explicit instructor confirmation. Use a
            2–10s interval and a short recording for sustained-presence review.
          </p>
          <p className="subtle text-xs">
            Up to 360 frames per recording. Long recordings use a larger
            interval. HOG often misses seated or occluded people; it is not a
            reliable classroom headcount.
          </p>
          <p className="text-xs text-muted">
            FFmpeg:{" "}
            {config.ffmpeg_available
              ? "Available for audio extraction"
              : "Not found. PCM WAV audio works without it."}
          </p>
          <Button variant="primary" disabled={busy}>
            Save preferences
          </Button>
        </form>
      </section>
      <section className="grid md:grid-cols-[240px_1fr] gap-6 border-b border-line pb-8">
        <div>
          <h2>Privacy & retention</h2>
          <p className="subtle text-xs mt-2">Stored on this computer</p>
        </div>
        <div className="space-y-4">
          <Alert>
            {config.retention} {config.privacy}
          </Alert>
          <p className="subtle text-xs">
            This is a single-user, loopback-only installation. It has no
            shared-user authentication. Obtain recording consent and follow your
            institution’s retention policy before using real classroom data.
          </p>
          <h3>Stored original recordings ({media.length})</h3>
          {media.length ? (
            media.map((a) => (
              <div
                key={a.id}
                className="flex gap-3 items-center justify-between border-b border-line pb-3"
              >
                <span className="text-sm break-all">{a.filename}</span>
                <Button
                  variant="danger"
                  disabled={a.status === "processing" || a.status === "queued"}
                  onClick={() =>
                    confirm(
                      "Delete original media?",
                      "The original recording will be permanently deleted. Calculated metrics will remain available.",
                      () =>
                        run(
                          () =>
                            api(
                              `/analyses/${a.id}?media_only=true`,
                              write("DELETE"),
                            ),
                          "Original media deleted",
                        ),
                    )
                  }
                >
                  <Trash2 size={15} />
                  Delete media
                </Button>
              </div>
            ))
          ) : (
            <p className="subtle text-xs">No original recordings are stored.</p>
          )}
        </div>
      </section>
      <section className="grid md:grid-cols-[240px_1fr] gap-6">
        <div>
          <h2>Sample classroom</h2>
          <p className="subtle text-xs mt-2">Explore before adding real data</p>
        </div>
        <div className="panel p-6">
          <p className="subtle mb-5">
            Load twelve fictional students and six simulated sessions. Sample
            data is clearly labelled and kept out of real session rosters.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy}
              onClick={() =>
                run(() => api("/demo", write("POST")), "Sample dataset ready")
              }
            >
              Load sample data
            </Button>
            <Button
              variant="danger"
              disabled={busy}
              onClick={() =>
                confirm(
                  "Reset sample data?",
                  "Remove sample students, sessions, analyses and suggestions. Real records will be preserved.",
                  () =>
                    run(
                      () => api("/demo", write("DELETE")),
                      "Sample data removed",
                    ),
                )
              }
            >
              Reset sample data
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
