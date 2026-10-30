import { afterEach, expect, test, vi } from "vitest";
import {
  cleanup,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AIProviders, { type ProviderState } from "./AIProviders";
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function initial(): ProviderState {
  const item = {
    model: "gemini-2.5-flash",
    configured: true,
    managed: false,
    source: "environment",
    mask: "••••••••",
    active: false,
    access: "unverified" as const,
    checked_at: null,
    last_success_at: null,
    message: "",
    error_code: null,
  };
  return {
    revision: 0,
    active: null,
    providers: {
      gemini: { ...item },
      groq: {
        ...item,
        model: "",
        configured: false,
        source: "none",
        mask: "",
        access: "not_configured",
      },
    },
  };
}
const reply = (value: unknown) => ({
  ok: true,
  json: async () => structuredClone(value),
});
test.each(["verified", "failed"] as const)(
  "Gemini %s survives stale refresh and remount",
  async (access) => {
    let state = initial();
    const stale = structuredClone(state);
    let reads = 0;
    const fetcher = vi.fn(async (url: string, options: RequestInit = {}) => {
      if (options.method === "POST") {
        expect(options.headers).toMatchObject({ "X-Classroom-Settings": "1" });
        state = {
          ...state,
          revision: 1,
          providers: {
            ...state.providers,
            gemini: {
              ...state.providers.gemini,
              access,
              checked_at: "2026-10-30T10:00:00Z",
              message:
                access === "verified"
                  ? "Real generation confirmed."
                  : "Quota exceeded. Retry later.",
            },
          },
        };
        return reply(state);
      }
      reads++;
      return reply(reads === 2 ? stale : state);
    });
    vi.stubGlobal("fetch", fetcher);
    const view = render(<AIProviders />);
    await screen.findByText("Configured · not verified");
    expect(fetcher.mock.calls.every(([, options]) => !options?.method)).toBe(
      true,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Test Google Gemini connection" }),
    );
    const label =
      access === "verified" ? "Verified successfully" : "Verification failed";
    await screen.findByText(label);
    await waitFor(() => expect(reads).toBe(2));
    expect(screen.getByText(label)).toBeInTheDocument();
    view.unmount();
    render(<AIProviders />);
    await screen.findByText(label);
  },
);
test.each(["legacy", "transport"])(
  "Explains %s failures without false success",
  async (mode) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (mode === "transport") throw new Error("Backend unavailable.");
        return reply({ access: "verified" });
      }),
    );
    render(<AIProviders />);
    await screen.findByText(
      mode === "transport"
        ? "Backend unavailable."
        : /outdated provider response/,
    );
    expect(screen.queryByText("Verified successfully")).not.toBeInTheDocument();
  },
);
test("Save clears secret, replacement and deletion require explicit action", async () => {
  let state = initial();
  const calls: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      if (options.method === "POST") {
        const payload = JSON.parse(options.body as string);
        calls.push(payload);
        const deletion = url.endsWith("/delete");
        state = {
          ...state,
          revision: state.revision + 1,
          providers: {
            ...state.providers,
            gemini: {
              ...state.providers.gemini,
              managed: !deletion,
              configured: !deletion,
              source: deletion ? "none" : "settings",
              access: deletion ? "not_configured" : "unverified",
            },
          },
        };
      }
      return reply(state);
    }),
  );
  render(<AIProviders />);
  await screen.findByText("Configured · not verified");
  const card = within(
    screen.getByRole("region", { name: "Google Gemini settings" }),
  );
  const input = card.getByLabelText("Google Gemini API key");
  expect(input).toHaveValue("");
  await userEvent.type(input, "fictional-key-1234567890");
  await userEvent.click(
    card.getByRole("button", { name: "Show Google Gemini key" }),
  );
  expect(input).toHaveAttribute("type", "text");
  await userEvent.click(card.getByRole("button", { name: "Save key" }));
  await waitFor(() => expect(input).toHaveValue(""));
  expect(input).toHaveAttribute("type", "password");
  expect(card.getByRole("button", { name: "Replace key" })).toBeInTheDocument();
  await userEvent.click(card.getByRole("button", { name: "Delete saved key" }));
  expect(calls).toHaveLength(1);
  await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(calls).toHaveLength(1);
  await userEvent.click(card.getByRole("button", { name: "Delete saved key" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Confirm deletion" }),
  );
  await waitFor(() => expect(calls).toHaveLength(2));
  expect(calls[1]).toEqual({ confirm: true });
});
test("Switching updates both cards and both off shows local fallback", async () => {
  let state = initial();
  state.providers.groq = {
    ...state.providers.groq,
    configured: true,
    model: "account-model",
    access: "unverified",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, options: RequestInit = {}) => {
      if (options.method === "POST") {
        const name = url.includes("/groq/") ? "groq" : "gemini";
        state = {
          ...state,
          revision: state.revision + 1,
          active: JSON.parse(options.body as string).enabled ? name : null,
        };
        state.providers.gemini.active = state.active === "gemini";
        state.providers.groq.active = state.active === "groq";
      }
      return reply(state);
    }),
  );
  render(<AIProviders />);
  await screen.findByRole("button", { name: "Enable Google Gemini" });
  await userEvent.click(
    screen.getByRole("button", { name: "Enable Google Gemini" }),
  );
  await screen.findByRole("button", { name: "Disable Google Gemini" });
  await userEvent.click(screen.getByRole("button", { name: "Enable Groq" }));
  await screen.findByRole("button", { name: "Disable Groq" });
  expect(
    screen.getByRole("button", { name: "Enable Google Gemini" }),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: "Disable Groq" }));
  await screen.findByText(/Local mode · Both/);
});
test("Activation failure is visible and does not pretend the provider is enabled", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, options: RequestInit = {}) =>
      options.method
        ? {
            ok: false,
            status: 400,
            json: async () => ({
              error: {
                message: "Configure an API key before enabling this provider.",
              },
            }),
          }
        : reply(initial()),
    ),
  );
  render(<AIProviders />);
  await screen.findByRole("button", { name: "Enable Groq" });
  await userEvent.click(screen.getByRole("button", { name: "Enable Groq" }));
  await screen.findByText(
    "Configure an API key before enabling this provider.",
  );
  expect(
    screen.getByRole("button", { name: "Enable Groq" }),
  ).toBeInTheDocument();
});

test("A claimed success without a generation timestamp is rejected", async () => {
  const invalid = initial();
  invalid.providers.gemini.access = "verified";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => reply(invalid)),
  );
  render(<AIProviders />);
  await screen.findByText(/status could not be validated/);
  expect(screen.queryByText("Verified successfully")).not.toBeInTheDocument();
});
