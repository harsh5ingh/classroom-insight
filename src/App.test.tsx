import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import Dashboard from "./Dashboard";

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
  retention: "Local retention.",
  privacy: "Media stays local.",
};
let requests: { path: string; options: RequestInit }[] = [];
beforeEach(() => {
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, options: RequestInit = {}) => {
      requests.push({ path, options });
      let data: unknown = [];
      if (path.startsWith("/api/analytics"))
        data = { summary, trend: [], sessions: [], events: [], demo: false };
      if (path === "/api/config") data = config;
      if (path === "/api/settings/ai") {
        const provider = {
          model: "",
          configured: false,
          managed: false,
          source: "none",
          mask: "",
          active: false,
          access: "not_configured",
          checked_at: null,
          last_success_at: null,
          message: "",
          error_code: null,
        };
        data = {
          revision: 0,
          active: null,
          providers: { gemini: provider, groq: provider },
        };
      }
      if (options.method) data = { id: 1 };
      return { ok: true, json: async () => data };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const setup = (path = "/") =>
  render(
    <MemoryRouter initialEntries={["/app" + (path === "/" ? "" : path)]}>
      <Routes>
        <Route path="/app/*" element={<Dashboard />} />
      </Routes>
    </MemoryRouter>,
  );
test("empty overview offers a real sample-data action", async () => {
  setup();
  await userEvent.click(
    await screen.findByRole("button", { name: /Explore sample data/ }),
  );
  await waitFor(() =>
    expect(
      requests.some(
        (r) => r.path === "/api/demo" && r.options.method === "POST",
      ),
    ).toBe(true),
  );
});
// Each route has its own assertion budget; eight full DOM transitions in one
// five-second test were intermittently timing out on the submission machine.
test.each([
  ["Attendance", "Create a session to take attendance"],
  ["Sessions", "Your session library"],
  ["Engagement Analytics", "Observe patterns. Keep the context."],
  ["Recommendations", "From observation to a next step"],
  ["Students", "The people in your classroom"],
  ["Reports", "A record worth keeping"],
  ["Settings", "Your classroom. Your controls."],
  ["Overview", "A clearer view of learning."],
])(
  "navigation opens %s",
  async (route, heading) => {
    setup(route === "Overview" ? "/settings" : "/");
    await screen.findByRole("heading", {
      name:
        route === "Overview"
          ? "Your classroom. Your controls."
          : "A clearer view of learning.",
    });
    await userEvent.click(screen.getByRole("link", { name: route }));
    await screen.findByRole("heading", { name: heading });
    if (route === "Settings")
      expect(
        await screen.findByText(/Local mode · Both cloud providers are off/),
      ).toBeInTheDocument();
  },
  15000,
);
test("register student submits validated fields through backend", async () => {
  setup("/students");
  await userEvent.click(
    await screen.findByRole("button", { name: "Register student" }),
  );
  await userEvent.type(screen.getByLabelText("Full name"), "Alex Green");
  await userEvent.type(screen.getByLabelText("Student identifier"), "STU-101");
  await userEvent.type(screen.getByLabelText("Cohort"), "Science");
  await userEvent.click(screen.getByRole("button", { name: "Save student" }));
  await waitFor(() =>
    expect(
      requests.some(
        (r) =>
          r.path === "/api/students" &&
          String(r.options.body).includes("Alex Green"),
      ),
    ).toBe(true),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
});
test("new session form sends title, date and instructor", async () => {
  setup();
  await userEvent.click(
    await screen.findByRole("button", { name: "New Session" }),
  );
  await userEvent.type(screen.getByLabelText("Session title"), "Ecology");
  await userEvent.type(screen.getByLabelText("Instructor"), "Dr Green");
  await userEvent.click(screen.getByRole("button", { name: "Create session" }));
  await waitFor(() =>
    expect(
      requests.some(
        (r) =>
          r.path === "/api/sessions" &&
          String(r.options.body).includes("Ecology"),
      ),
    ).toBe(true),
  );
});
test("backend failures provide a retry state", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Server unavailable")),
  );
  setup();
  await screen.findByText("Server unavailable");
  expect(
    screen.getByRole("button", { name: "Retry connection" }),
  ).toBeInTheDocument();
});
test("reset sample data requires concrete confirmation", async () => {
  setup("/settings");
  await userEvent.click(
    await screen.findByRole("button", { name: "Reset sample data" }),
  );
  expect(requests.some((r) => r.options.method === "DELETE")).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
  await waitFor(() =>
    expect(
      requests.some(
        (r) => r.path === "/api/demo" && r.options.method === "DELETE",
      ),
    ).toBe(true),
  );
});
