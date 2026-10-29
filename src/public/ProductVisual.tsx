import { useId } from "react";
import {
  Activity,
  ArrowUpRight,
  BookOpen,
  LayoutDashboard,
  Users,
} from "lucide-react";
export const examples = [
  {
    title: "Ecology · seminar",
    format: "Discussion & group exercise",
    present: 26,
    absent: 3,
    unconfirmed: 1,
    points: [13, 17, 14, 12, 16, 30, 55, 48, 63, 52, 37, 32, 47],
    note: "Scene movement increases after the group exercise begins.",
    advice:
      "Use the transition at minute 20 as a discussion prompt when reviewing the session with the instructor.",
    change: "Group exercise",
    minute: "20 min",
  },
  {
    title: "Design methods · workshop",
    format: "Demonstration & independent practice",
    present: 22,
    absent: 1,
    unconfirmed: 2,
    points: [48, 53, 39, 44, 27, 16, 12, 18, 14, 20, 19, 36, 42],
    note: "Scene movement is lower during the independent practice interval.",
    advice:
      "Check the lesson plan before interpreting the quiet interval. Independent work may involve little visible movement.",
    change: "Independent practice",
    minute: "15 min",
  },
];
export function ActivityTimeline({ index = 0 }: { index?: number }) {
  const item = examples[index];
  const id = useId();
  const points = item.points
    .map((v, i) => `${36 + i * 34},${143 - v * 1.6}`)
    .join(" ");
  return (
    <div className="activity-visual">
      <div className="flex justify-between items-center gap-3">
        <h3>Scene activity</h3>
        <span className="text-xs text-muted">
          Frame change · relative units
        </span>
      </div>
      <svg viewBox="0 0 480 180" role="img" aria-labelledby={id}>
        <title id={id}>
          Illustrative activity over a 60-minute session. {item.note} These
          values are sample frame-change indicators, not attention scores.
        </title>
        {[35, 85, 135].map((y) => (
          <line
            key={y}
            x1="36"
            x2="444"
            y1={y}
            y2={y}
            stroke="var(--color-line)"
            strokeDasharray="3 5"
          />
        ))}
        <path
          d={`M ${points.replaceAll(" ", " L ")} L444 150 L36 150 Z`}
          fill="var(--color-sage)"
          opacity=".65"
        />
        <polyline
          points={points}
          fill="none"
          stroke="var(--color-forest)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <line
          x1={index === 0 ? 172 : 138}
          x2={index === 0 ? 172 : 138}
          y1="20"
          y2="150"
          stroke="var(--color-amber)"
          strokeDasharray="4 4"
        />
        {["00", "15", "30", "45", "60 min"].map((n, i) => (
          <text
            key={n}
            x={36 + i * 102}
            y="173"
            textAnchor={i === 4 ? "end" : "start"}
            fill="#73776d"
            fontSize="11"
          >
            {n}
          </text>
        ))}
      </svg>
      <p className="chart-annotation">
        <span />
        {item.minute} · {item.change}. {item.note}
      </p>
    </div>
  );
}
export function AttendanceGraphic({ index = 0 }: { index?: number }) {
  const item = examples[index];
  const total = item.present + item.absent + item.unconfirmed;
  return (
    <div className="attendance-visual">
      <p className="eyebrow">Instructor-confirmed register</p>
      <div className="attendance-number">
        <strong>
          {item.present}
          <span> / {total}</span>
        </strong>
        <span>marked present</span>
      </div>
      <div
        className="attendance-bars"
        role="img"
        aria-label={`${item.present} present, ${item.absent} absent and ${item.unconfirmed} unconfirmed. Illustrative data.`}
      >
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            data-status={
              i < item.present
                ? "present"
                : i < item.present + item.absent
                  ? "absent"
                  : "unconfirmed"
            }
          />
        ))}
      </div>
      <div className="attendance-legend">
        <span>Present {item.present}</span>
        <span>Absent {item.absent}</span>
        <span>Unconfirmed {item.unconfirmed}</span>
      </div>
    </div>
  );
}
export function Advisory({ index = 0 }: { index?: number }) {
  return (
    <aside className="advisory">
      <div className="eyebrow flex items-center gap-2">
        <BookOpen size={15} />
        Instructor review · illustrative advisory
      </div>
      <p>{examples[index].advice}</p>
      <span>Activity is context, not a measure of attention.</span>
    </aside>
  );
}
export default function ProductVisual() {
  return (
    <div className="product-frame">
      <div className="browser-bar">
        <span className="browser-dots" aria-hidden="true">
          •••
        </span>
        <span>Classroom Insight / Session review</span>
        <span className="sample-label">Illustrative data</span>
      </div>
      <div className="preview-workspace">
        <aside className="preview-rail" aria-hidden="true">
          <LayoutDashboard />
          <Users />
          <Activity />
          <BookOpen />
        </aside>
        <div className="preview-main">
          <div className="preview-title">
            <div>
              <p className="eyebrow">SESSION NOTEBOOK / 01</p>
              <h2>Ecology seminar</h2>
            </div>
            <ArrowUpRight size={19} />
          </div>
          <AttendanceGraphic />
          <ActivityTimeline />
          <Advisory />
        </div>
      </div>
      <div className="frame-caption">
        <span>01 / THE SESSION, IN CONTEXT</span>
        <span>A faithful product preview</span>
      </div>
    </div>
  );
}
