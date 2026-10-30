import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { api, write } from "./api";
import { Alert, Badge, Button, Dialog, SectionHead } from "./ui";

export type ProviderName = "gemini" | "groq";
export type ProviderMetadata = {
  model: string;
  configured: boolean;
  managed: boolean;
  source: string;
  mask: string;
  active: boolean;
  access: "not_configured" | "unverified" | "verified" | "failed";
  checked_at: string | null;
  last_success_at: string | null;
  message: string;
  error_code: string | null;
};
export type ProviderState = {
  revision: number;
  active: ProviderName | null;
  providers: Record<ProviderName, ProviderMetadata>;
};
const labels = { gemini: "Google Gemini", groq: "Groq" };
const states = {
  not_configured: "Not configured",
  unverified: "Configured · not verified",
  verified: "Verified successfully",
  failed: "Verification failed",
};

export default function AIProviders() {
  const [data, setData] = useState<ProviderState | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const lock = useRef(false);
  const [deleting, setDeleting] = useState<ProviderName | null>(null);
  const [keys, setKeys] = useState({ gemini: "", groq: "" });
  const [visible, setVisible] = useState({ gemini: false, groq: false });
  const [models, setModels] = useState<Partial<Record<ProviderName, string>>>(
    {},
  );
  const [available, setAvailable] = useState<string[]>([]);
  function accept(next: ProviderState) {
    if (
      !Number.isInteger(next.revision) ||
      !next.providers?.gemini ||
      !next.providers?.groq
    )
      throw new Error(
        "The backend returned an outdated provider response. Restart Flask from this project and retry.",
      );
    if (
      !([null, "gemini", "groq"] as unknown[]).includes(next.active) ||
      Object.entries(next.providers).some(
        ([name, p]) =>
          !Object.hasOwn(states, p.access) ||
          p.active !== (next.active === name) ||
          (p.access === "verified" && !p.checked_at),
      )
    )
      throw new Error(
        "The provider status could not be validated. Refresh Settings; generation has not been confirmed.",
      );
    setData((old) => (old && old.revision > next.revision ? old : next));
  }
  async function refresh() {
    try {
      accept(await api<ProviderState>("/settings/ai"));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Provider settings could not load.",
      );
    }
  }
  useEffect(() => {
    void refresh();
  }, []);
  async function action(
    name: ProviderName,
    operation: string,
    payload: unknown = {},
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(`${name}/${operation}`);
    setError("");
    try {
      const options = {
        ...write("POST", payload),
        headers: { "X-Classroom-Settings": "1" },
      };
      if (operation === "models") {
        const result = await api<{ models: string[] }>(
          `/settings/ai/${name}/${operation}`,
          options,
        );
        setAvailable(result.models);
      } else {
        accept(
          await api<ProviderState>(
            `/settings/ai/${name}/${operation}`,
            options,
          ),
        );
        if (operation === "credential") {
          setKeys((old) => ({ ...old, [name]: "" }));
          setVisible((old) => ({ ...old, [name]: false }));
        }
        if (operation === "delete") setDeleting(null);
        await refresh();
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "The provider action failed. Retry when ready.",
      );
    } finally {
      lock.current = false;
      setBusy("");
    }
  }
  return (
    <section className="space-y-5 border-b border-line pb-8">
      <SectionHead
        title="AI providers"
        description="One cloud provider at a time. Your choice is saved on this computer."
        action={
          <Button disabled={!!busy} onClick={() => void refresh()}>
            Refresh provider status
          </Button>
        }
      />
      <p className="subtle text-sm flex items-start gap-2">
        <ShieldCheck size={18} className="shrink-0 text-forest" />
        Settings-managed keys are saved in your Windows credential vault. Saved
        secrets are never returned to this page. Environment credentials remain
        an optional development fallback.
      </p>
      {error && <Alert error>{error}</Alert>}
      {!data ? (
        <p role="status">Loading provider settings…</p>
      ) : (
        <>
          <Alert>
            {data.active
              ? `Active provider: ${labels[data.active]}. If a cloud request fails, recommendations use local rules.`
              : "Local mode · Both cloud providers are off. Recommendations use local rules; no cloud generation is requested."}
          </Alert>
          <div className="grid xl:grid-cols-2 gap-6">
            {(["gemini", "groq"] as const).map((name) => {
              const provider = data.providers[name];
              return (
                <section
                  key={name}
                  aria-label={`${labels[name]} settings`}
                  className="panel p-6 space-y-4 min-w-0"
                >
                  <div className="flex justify-between gap-3">
                    <div>
                      <h3>{labels[name]}</h3>
                      <p className="subtle text-xs mt-1">
                        {provider.active ? "Active cloud provider" : "Inactive"}{" "}
                        ·{" "}
                        {provider.source === "environment"
                          ? "Environment credential (development)"
                          : provider.source === "settings"
                            ? "Windows Credential Manager"
                            : "No credential"}
                      </p>
                    </div>
                    <Badge green={provider.access === "verified"}>
                      {states[provider.access]}
                    </Badge>
                  </div>
                  <Button
                    disabled={!!busy}
                    aria-pressed={provider.active}
                    onClick={() =>
                      void action(name, "activation", {
                        enabled: !provider.active,
                      })
                    }
                  >
                    {provider.active ? "Disable" : "Enable"} {labels[name]}
                  </Button>
                  {provider.configured && (
                    <p className="text-sm">Saved credential: {provider.mask}</p>
                  )}
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(name, "credential", { key: keys[name] });
                    }}
                  >
                    <label
                      className="block text-sm font-medium"
                      htmlFor={`${name}-key`}
                    >
                      {labels[name]} API key
                    </label>
                    <div className="flex gap-2">
                      <input
                        id={`${name}-key`}
                        className="field min-w-0 flex-1"
                        type={visible[name] ? "text" : "password"}
                        autoComplete="off"
                        spellCheck={false}
                        value={keys[name]}
                        minLength={16}
                        maxLength={512}
                        required
                        onChange={(e) =>
                          setKeys((old) => ({ ...old, [name]: e.target.value }))
                        }
                      />
                      <Button
                        type="button"
                        aria-label={`${visible[name] ? "Hide" : "Show"} ${labels[name]} key`}
                        onClick={() =>
                          setVisible((old) => ({ ...old, [name]: !old[name] }))
                        }
                      >
                        {visible[name] ? (
                          <EyeOff size={18} />
                        ) : (
                          <Eye size={18} />
                        )}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="submit" disabled={!!busy || !keys[name]}>
                        {provider.managed ? "Replace key" : "Save key"}
                      </Button>
                      <Button
                        type="button"
                        disabled={!!busy || !provider.configured}
                        onClick={() => setDeleting(name)}
                      >
                        {provider.managed
                          ? "Delete saved key"
                          : "Disable environment fallback"}
                      </Button>
                    </div>
                    <p className="subtle text-xs">
                      Saving replaces this provider’s credential and resets
                      verification. It does not enable the provider or change
                      your .env file.
                    </p>
                  </form>
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action(name, "model", {
                        model: models[name] ?? provider.model,
                      });
                    }}
                  >
                    <label
                      htmlFor={`${name}-model`}
                      className="block text-sm font-medium"
                    >
                      {labels[name]} model
                    </label>
                    <input
                      id={`${name}-model`}
                      className="field w-full"
                      maxLength={160}
                      required
                      value={models[name] ?? provider.model}
                      onChange={(e) =>
                        setModels((old) => ({ ...old, [name]: e.target.value }))
                      }
                      list={name === "groq" ? "groq-models" : undefined}
                      placeholder="Choose a model available to your account"
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={!!busy} type="submit">
                        Save model
                      </Button>
                      {name === "groq" && (
                        <Button
                          type="button"
                          disabled={!!busy || !provider.configured}
                          onClick={() => void action(name, "models")}
                        >
                          Find available models
                        </Button>
                      )}
                    </div>
                    {name === "groq" && (
                      <>
                        <datalist id="groq-models">
                          {available.map((m) => (
                            <option key={m} value={m} />
                          ))}
                        </datalist>
                        <p className="subtle text-xs">
                          Discovery lists account models. Select a text model
                          with JSON support; only a successful generation test
                          verifies compatibility.
                        </p>
                      </>
                    )}
                  </form>
                  <Button
                    disabled={!!busy || !provider.configured}
                    variant="primary"
                    onClick={() => void action(name, "test")}
                  >
                    {busy === `${name}/test`
                      ? "Testing generation…"
                      : `Test ${labels[name]} connection`}
                  </Button>
                  {provider.message && (
                    <Alert error={provider.access === "failed"}>
                      {provider.message}
                    </Alert>
                  )}
                  {provider.last_success_at && (
                    <p className="subtle text-xs">
                      Last successful verification:{" "}
                      {new Date(provider.last_success_at).toLocaleString()}
                    </p>
                  )}
                  {provider.checked_at && (
                    <p className="subtle text-xs">
                      Last attempt:{" "}
                      {new Date(provider.checked_at).toLocaleString()}
                    </p>
                  )}
                  <p className="subtle text-xs">
                    Testing sends only a fixed connection prompt, even while
                    inactive. It uses provider quota and does not activate the
                    provider.
                  </p>
                </section>
              );
            })}
          </div>
        </>
      )}
      {deleting && (
        <Dialog
          title={`Delete ${labels[deleting]} credential?`}
          onClose={() => !busy && setDeleting(null)}
          footer={
            <>
              <Button disabled={!!busy} onClick={() => setDeleting(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                disabled={!!busy}
                onClick={() =>
                  void action(deleting, "delete", { confirm: true })
                }
              >
                Confirm deletion
              </Button>
            </>
          }
        >
          <p>
            This removes the Settings-managed key, disables this provider if
            active, and prevents automatic reuse of its environment key. Your
            .env file is not changed. Save a new key to configure it again.
          </p>
        </Dialog>
      )}
    </section>
  );
}
