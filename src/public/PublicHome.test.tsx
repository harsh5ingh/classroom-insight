import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import App from "../App";

type Request = { path: string; options: RequestInit };
let requests: Request[] = [];
let authenticated = false;
let enquiryFailure = false;
let readinessFailure = false;
const summary = {
  present: 0,
  absent: 0,
  unconfirmed: 0,
  total: 0,
  rate: null,
  sessions: 0,
  analyzed: 0,
};
const config = {
  gemini: {
    credential_supplied: false,
    access: "not_configured",
    model: "gemini-2.5-flash",
  },
  preferences: { sample_seconds: 10, person_detection: true },
  ffmpeg_available: false,
};
const brief = {
  source: "gemini",
  capability_version: "2026-10-29",
  notice: "Advisory only.",
  brief: {
    summary: "A small local attendance pilot with instructor review.",
    capabilities: [
      {
        title: "Instructor-confirmed attendance",
        description: "Records confirmed manually.",
      },
    ],
    pilot_scope: ["Start with a single instructor."],
    privacy_considerations: ["Review retention and consent first."],
    implementation_questions: ["Who manages the local machine?"],
    next_steps: ["Define pilot success criteria."],
    unanswered_questions: ["Cloud hosting needs separate review."],
    limitations: ["No institutional identity system."],
  },
};
beforeEach(() => {
  requests = [];
  authenticated = false;
  enquiryFailure = false;
  readinessFailure = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options: RequestInit = {}) => {
      requests.push({ path, options });
      let data: unknown = [];
      let status = 200;
      if (path === "/api/auth/session") data = { authenticated, mode: "demo" };
      if (path === "/api/auth/login") {
        const body = JSON.parse(String(options.body));
        if (
          body.email === "instructor@classroom.demo" &&
          body.password === "ClassroomDemo!2026"
        ) {
          authenticated = true;
          data = { authenticated: true };
        } else {
          status = 401;
          data = { error: { message: "Those demo credentials do not match." } };
        }
      }
      if (path === "/api/auth/logout") {
        authenticated = false;
        data = { authenticated: false };
      }
      if (path.startsWith("/api/analytics"))
        data = { summary, trend: [], sessions: [], events: [], demo: false };
      if (path === "/api/config") data = config;
      if (path === "/api/sessions/1/attendance")
        data = { records: [], summary };
      if (path === "/api/enquiries") {
        if (enquiryFailure) {
          status = 503;
          data = { error: { message: "Storage is temporarily unavailable." } };
        } else
          data = {
            reference: "CI-EVALUATION01",
            email_sent: false,
            saved_locally: true,
          };
      }
      if (path === "/api/readiness-brief") {
        if (readinessFailure) {
          status = 503;
          data = {
            error: {
              message: "Gemini is unavailable. No AI brief was generated.",
            },
          };
        } else data = brief;
      }
      return { ok: status < 400, status, json: async () => data };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function setup(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}
const calls = (path: string) => requests.filter((r) => r.path === path);
async function login() {
  await userEvent.click(
    screen.getAllByRole("button", { name: "Employee Login" })[0],
  );
  await screen.findByRole("dialog");
  await userEvent.type(
    screen.getByLabelText("Work email"),
    "instructor@classroom.demo",
  );
  await userEvent.type(screen.getByLabelText("Password"), "ClassroomDemo!2026");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Demo access granted");
  // Login intentionally waits 450 ms, then lazy-loads the dashboard. Give that
  // transition its own bounded wait instead of the default one-second query.
  await screen.findByRole(
    "heading",
    { name: "A clearer view of learning." },
    { timeout: 5000 },
  );
}

test("public homepage has section anchors and independent illustrative examples", async () => {
  setup();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
    "Understand",
  );
  for (const name of [
    "Product",
    "How it works",
    "For institutions",
    "Privacy",
  ]) {
    const link = within(
      screen.getByRole("navigation", { name: "Public navigation" }),
    ).getByRole("link", { name });
    expect(document.querySelector(link.getAttribute("href")!)).not.toBeNull();
  }
  expect(screen.getAllByText("Illustrative data").length).toBeGreaterThan(0);
  await userEvent.click(
    screen.getByRole("button", { name: "Design methods · workshop" }),
  );
  expect(
    screen.getByRole("button", { name: "Design methods · workshop" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(
    screen.getByText(/Check the lesson plan before interpreting/),
  ).toBeInTheDocument();
  expect(calls("/api/readiness-brief")).toHaveLength(0);
  await userEvent.click(
    screen.getByRole("button", { name: "Open navigation" }),
  );
  expect(
    screen.getByRole("button", { name: "Close navigation" }),
  ).toHaveAttribute("aria-expanded", "true");
});

test("login modal validates, toggles password, locks scroll and restores focus on close", async () => {
  setup();
  const trigger = screen.getAllByRole("button", { name: "Employee Login" })[0];
  await userEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  expect(document.body.style.overflow).toBe("hidden");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(screen.getByText("Enter a valid work email.")).toBeInTheDocument();
  expect(calls("/api/auth/login")).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "Show password" }));
  expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
  fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(document.body.style.overflow).toBe("");
  expect(trigger).toHaveFocus();
  await userEvent.click(trigger);
  fireEvent.click(await screen.findByRole("dialog"));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("demo sign-in, dashboard navigation, sign-out and route protection work", async () => {
  setup();
  await login();
  expect(screen.getByText(/Demo Mode/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("link", { name: "Students" }));
  await screen.findByRole("heading", { name: "The people in your classroom" });
  await userEvent.click(
    screen.getByRole("button", { name: "Open profile menu" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Sign Out" }));
  await screen.findByRole("heading", { level: 1 });
  expect(calls("/api/auth/logout")).toHaveLength(1);
  expect(authenticated).toBe(false);
  cleanup();
  setup("/app/settings");
  expect(await screen.findByRole("dialog")).toHaveAccessibleName(
    "Employee Login",
  );
  expect(
    screen.queryByText("Your classroom. Your controls."),
  ).not.toBeInTheDocument();
});

test("signed-in refresh and legacy route retain existing dashboard access", async () => {
  authenticated = true;
  setup("/attendance?session=1");
  await screen.findByRole("heading", {
    name: "Create a session to take attendance",
  });
  expect(calls("/api/auth/session")).toHaveLength(1);
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("invalid demo credentials return an accessible error without leaving homepage", async () => {
  setup();
  await userEvent.click(
    screen.getAllByRole("button", { name: "Employee Login" })[0],
  );
  await screen.findByRole("dialog");
  await userEvent.type(
    screen.getByLabelText("Work email"),
    "wrong@example.org",
  );
  await userEvent.type(screen.getByLabelText("Password"), "bad");
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Those demo credentials do not match.");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

async function fillConsultation() {
  await userEvent.click(
    screen.getAllByRole("button", { name: "Request a Consultation" })[0],
  );
  await screen.findByRole("dialog");
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getAllByText("This field is required.").length).toBeGreaterThan(
    0,
  );
  for (const [label, value] of [
    ["Full name", "Evaluation Contact"],
    ["Work email", "evaluation@example.org"],
    ["Job title or role", "Teaching lead"],
    ["Organization or institution name", "Illustrative College"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await userEvent.selectOptions(
    screen.getByLabelText("Organization type"),
    "College or university",
  );
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  for (const [label, value] of [
    ["Country", "India"],
    ["State or region", "Delhi"],
    ["Approximate number of learners or employees", "200"],
    ["Number of campuses or training locations", "1"],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await userEvent.selectOptions(
    screen.getByLabelText("Current attendance tracking method"),
    "Spreadsheets",
  );
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  const modal = within(screen.getByRole("dialog"));
  await userEvent.click(modal.getByLabelText("Digital attendance records"));
  fireEvent.change(
    screen.getByLabelText("What problem are you trying to solve?"),
    {
      target: {
        value: "We need consistent attendance across teaching sessions.",
      },
    },
  );
  fireEvent.change(
    screen.getByLabelText("What would a successful pilot look like?"),
    { target: { value: "A small pilot that reduces reconciliation work." } },
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Preferred deployment model"),
    "Local/on-premises",
  );
  await userEvent.selectOptions(
    screen.getByLabelText("Approximate implementation timeline"),
    "Exploring options",
  );
  expect(screen.getByLabelText(/I agree to be contacted/)).not.toBeChecked();
  await userEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Review before submitting");
}

test("consultation validates each step, reviews all details and submits once with consent optional", async () => {
  setup();
  await fillConsultation();
  expect(screen.getByText("Evaluation Contact")).toBeInTheDocument();
  expect(screen.getByText("Not given")).toBeInTheDocument();
  await userEvent.dblClick(
    screen.getByRole("button", { name: "Submit enquiry" }),
  );
  await screen.findByText("CI-EVALUATION01");
  expect(calls("/api/enquiries")).toHaveLength(1);
  const request = calls("/api/enquiries")[0];
  const body = JSON.parse(String(request.options.body));
  expect(body.location_count).toBe(1);
  expect(body.contact_consent).toBe(false);
  expect(body.work_phone).toBe("");
  expect(
    (request.options.headers as Record<string, string>)["Idempotency-Key"],
  ).toHaveLength(36);
  expect(screen.getByText(/No email was sent/)).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

test("consultation retry preserves the submission key and entered details", async () => {
  setup();
  await fillConsultation();
  enquiryFailure = true;
  await userEvent.click(screen.getByRole("button", { name: "Submit enquiry" }));
  await screen.findByText("Storage is temporarily unavailable.");
  enquiryFailure = false;
  await userEvent.click(screen.getByRole("button", { name: "Submit enquiry" }));
  await screen.findByText("CI-EVALUATION01");
  const [one, two] = calls("/api/enquiries");
  expect(one.options.body).toBe(two.options.body);
  expect(one.options.headers).toEqual(two.options.headers);
});

test("readiness only generates explicitly and renders authoritative capability objects", async () => {
  setup();
  await userEvent.click(
    screen.getByRole("button", { name: "Use sample information" }),
  );
  expect(calls("/api/readiness-brief")).toHaveLength(0);
  await userEvent.click(screen.getByRole("button", { name: "Generate Brief" }));
  await screen.findByText("Generated by Gemini · advisory");
  expect(
    screen.getByText("Instructor-confirmed attendance."),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Who manages the local machine?"),
  ).toBeInTheDocument();
  expect(calls("/api/readiness-brief")).toHaveLength(1);
});

test("readiness errors never substitute sample output and have an explicit retry", async () => {
  readinessFailure = true;
  setup();
  await userEvent.click(
    screen.getByRole("button", { name: "Use sample information" }),
  );
  await userEvent.click(screen.getByRole("button", { name: "Generate Brief" }));
  await screen.findByText("Gemini is unavailable. No AI brief was generated.");
  expect(
    screen.queryByText("Generated by Gemini · advisory"),
  ).not.toBeInTheDocument();
  readinessFailure = false;
  await userEvent.click(screen.getByRole("button", { name: "Retry brief" }));
  await screen.findByText("Generated by Gemini · advisory");
});

test("public website remains usable when session check fails", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  setup();
  await screen.findByText(/The public website is still available/);
  expect(
    screen.getByRole("link", { name: "Explore the Platform" }),
  ).toHaveAttribute("href", "#product");
  await userEvent.click(
    screen.getAllByRole("button", { name: "Request a Consultation" })[0],
  );
  expect(await screen.findByRole("dialog")).toHaveAccessibleName(
    "Let’s understand your institution.",
  );
});
