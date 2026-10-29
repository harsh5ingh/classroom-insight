import {
  cleanup,
  render,
  screen,
  waitFor,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { Context, type DataContext } from "./data";
import {
  AttendanceHistory,
  PresenceReview,
  FusionForm,
  FusionPanel,
} from "./Observations";
import type { Analysis, ActivityFusion } from "./types";
import { Reports } from "./pages";

vi.mock("./ChartView", () => ({
  Chart: ({ label }: { label: string }) => <div>{label}</div>,
}));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const track = {
  id: 1,
  first_seen: 0,
  last_seen: 20,
  samples: 3,
  span_seconds: 20,
  qualified: true,
  preview: null,
  longest_still_seconds: 20,
  mean_motion_face_widths_per_second: 0,
  mean_eye_line_roll_degrees: null,
  roll_samples: 0,
};
function recording(qualified = true, has_media = true): Analysis {
  return {
    id: 1,
    session_id: 7,
    filename: "class.avi",
    status: "complete",
    progress: 100,
    error: null,
    is_demo: 0,
    has_media,
    created_at: "2026-10-29",
    result: {
      kind: "measured",
      audio: null,
      unavailable: [],
      notes: [],
      video: {
        duration_seconds: 30,
        sample_seconds: 10,
        frames_sampled: 3,
        points: [],
        detector: null,
        method: "Measured",
        limitations: "Limited",
        face_tracking: {
          method: "Haar",
          minimum_seconds: 20,
          minimum_samples: 3,
          eligible_sampling: true,
          limitations: "Anonymous only",
          pose_method: "Roll only",
          tracks: [{ ...track, qualified }],
        },
      },
    },
  };
}
function setup(element: React.ReactNode, analyses: Analysis[] = [recording()]) {
  const requests: { path: string; options?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options?: RequestInit) => {
      requests.push({ path, options });
      return {
        ok: true,
        json: async () =>
          path.endsWith("/attendance")
            ? {
                records: [{ id: 3, name: "Test learner", identifier: "TEST1" }],
                changes: [],
              }
            : { id: 9 },
      };
    }),
  );
  const context = {
    sessions: [
      {
        id: 7,
        title: "Evaluation",
        is_demo: 0,
        date: "2026-10-29",
        instructor: "QA",
        analysis: null,
        attendance: {
          present: 0,
          absent: 0,
          unconfirmed: 1,
          total: 1,
          rate: 0,
        },
      },
    ],
    analytics: { summary: { unconfirmed: 1 } },
    recommendations: [],
    analyses,
    busy: false,
    run: vi.fn(async (work: () => Promise<unknown>) => {
      await work();
      return true;
    }),
  } as unknown as DataContext;
  render(<Context.Provider value={context}>{element}</Context.Provider>);
  return requests;
}

test("presence review requires a roster choice and explicit identity confirmation", async () => {
  const requests = setup(<PresenceReview analysis={recording()} />);
  const button = screen.getByRole("button", {
    name: "Confirm reviewed student present",
  });
  expect(button).toBeDisabled();
  await screen.findByRole("option", { name: "Test learner · TEST1" });
  await userEvent.selectOptions(
    screen.getByLabelText("Verified roster student for track 1"),
    "3",
  );
  expect(button).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(button);
  await screen.findByText(/This track was reviewed/);
  const call = requests.find((r) => r.path.endsWith("/presence-confirmations"));
  expect(JSON.parse(String(call?.options?.body))).toEqual({
    analysis_id: 1,
    track_id: 1,
    student_id: 3,
    identity_confirmed: true,
  });
  expect(requests.filter((r) => r.options?.method === "POST")).toHaveLength(1);
});

test("single-frame or deleted-media tracks offer no attendance confirmation", async () => {
  setup(<PresenceReview analysis={recording(false)} />);
  expect(
    screen.queryByRole("button", { name: "Confirm reviewed student present" }),
  ).not.toBeInTheDocument();
  await screen.findByText(/Insufficient sustained evidence/);
  cleanup();
  setup(<PresenceReview analysis={recording(true, false)} />);
  expect(
    screen.queryByRole("button", { name: "Confirm reviewed student present" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText(/Original media unavailable/)).toBeInTheDocument();
});

test("attendance history exposes timestamp source and status changes", () => {
  render(
    <AttendanceHistory
      changes={[
        {
          id: 1,
          student_id: 3,
          name: "Test learner",
          previous_status: "unconfirmed",
          status: "present",
          recorded_at: "2026-10-29T12:00:00+00:00",
          source: "instructor_reviewed_track",
          actor: "Demo instructor",
          analysis_id: 1,
          track_id: 1,
        },
      ]}
    />,
  );
  expect(screen.getByText("unconfirmed → present")).toBeInTheDocument();
  expect(
    screen.getByText(/Reviewed track 1 \/ analysis 1/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(new Date("2026-10-29T12:00:00+00:00").toLocaleString()),
  ).toBeInTheDocument();
});

test("combining recordings requires reviewed alignment and sends the supplied offset", async () => {
  const audio = {
    ...recording(),
    id: 2,
    filename: "class.wav",
    result: {
      kind: "measured",
      video: null,
      audio: {
        duration_seconds: 30,
        energy: [],
        active_fraction: 0.5,
        threshold: 0.015,
        method: "RMS",
        active_intervals: [],
      },
      unavailable: [],
      notes: [],
    },
  };
  const requests = setup(<FusionForm />, [recording(), audio]);
  await userEvent.click(
    screen.getByText("Combine separate video and audio recordings"),
  );
  await userEvent.selectOptions(screen.getByLabelText("Session to align"), "7");
  await userEvent.selectOptions(
    screen.getByLabelText("Video observations"),
    "1",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Audio observations"),
    "2",
  );
  fireEvent.change(screen.getByLabelText("Audio start offset (seconds)"), {
    target: { value: "2.5" },
  });
  const button = screen.getByRole("button", {
    name: "Create combined activity analysis",
  });
  expect(button).toBeDisabled();
  await userEvent.click(screen.getByRole("checkbox"));
  await userEvent.click(button);
  await waitFor(() =>
    expect(requests.some((r) => r.path === "/api/sessions/7/fusion")).toBe(
      true,
    ),
  );
  expect(JSON.parse(String(requests[0].options?.body))).toEqual({
    video_analysis_id: 1,
    audio_analysis_id: 2,
    audio_offset_seconds: 2.5,
  });
});

test("activity index exposes formula limitations and missing-signal coverage", () => {
  const fusion: ActivityFusion = {
    version: "v1",
    label: "Observable activity index",
    score: 50,
    window_seconds: 10,
    joint_windows: 0,
    audio_offset_seconds: 0,
    method: "Equal-weight mean of available signals",
    limitations: "Not a validated engagement score",
    points: [
      {
        seconds: 0,
        end_seconds: 10,
        visual: 50,
        sound: null,
        score: 50,
        modalities: 1,
        visual_coverage: 1,
        audio_coverage: 0,
      },
    ],
  };
  render(<FusionPanel fusion={fusion} />);
  expect(
    screen.getByText("Equal-weight mean of available signals"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Not a validated engagement score"),
  ).toBeInTheDocument();
  expect(screen.getByText("0%")).toBeInTheDocument();
});

test("JSON report loads attendance history and excludes private face thumbnails", async () => {
  const analysis = recording();
  analysis.result!.video!.face_tracking!.tracks[0].preview =
    "private-face-thumbnail";
  let captured: Blob | undefined;
  const OriginalURL = URL;
  vi.stubGlobal(
    "URL",
    class extends OriginalURL {
      static createObjectURL(blob: Blob) {
        captured = blob;
        return "blob:test-report";
      }
      static revokeObjectURL() {}
    },
  );
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const requests = setup(<Reports />, [analysis]);
  await userEvent.click(
    screen.getByRole("button", { name: "Full report JSON" }),
  );
  await waitFor(() => expect(captured).toBeDefined());
  const text = await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(captured!);
  });
  const report = JSON.parse(text);
  expect(requests.some((r) => r.path === "/api/sessions/7/attendance")).toBe(
    true,
  );
  expect(report.attendance[0].records[0].name).toBe("Test learner");
  expect(report.attendance[0].changes).toEqual([]);
  expect(text).not.toContain("private-face-thumbnail");
  expect(report.analyses[0].result.video.face_tracking.tracks[0].samples).toBe(
    3,
  );
});

test("report download failure exposes a recoverable error", async () => {
  setup(<Reports />);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Report service unavailable")),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Full report JSON" }),
  );
  await screen.findByText("Report service unavailable");
  expect(
    screen.getByRole("button", { name: "Full report JSON" }),
  ).toBeEnabled();
});
