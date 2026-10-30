import { useRef, useState } from "react";
import { ArrowRight, FileText, RefreshCw } from "lucide-react";
import options from "../../shared/institution-options.json";
import { api, write, ApiError } from "../api";
import { Alert, Button } from "../ui";
import { Select, TextArea } from "./Fields";
type Brief = {
  summary: string;
  capabilities: { title: string; description: string }[];
  pilot_scope: string[];
  privacy_considerations: string[];
  implementation_questions: string[];
  next_steps: string[];
  unanswered_questions: string[];
  limitations: string[];
};
type Result = {
  source: "gemini" | "groq";
  brief: Brief;
  notice: string;
  capability_version: string;
};
export default function Readiness() {
  const [organization, setOrganization] = useState("");
  const [workflow, setWorkflow] = useState("");
  const [goals, setGoals] = useState("");
  const [deployment, setDeployment] = useState("");
  const [requirements, setRequirements] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [sample, setSample] = useState(false);
  const busy = useRef(false);
  const output = useRef<HTMLDivElement>(null);
  function useSample() {
    setOrganization("College or university");
    setWorkflow(
      "Instructors maintain attendance in spreadsheets. Session review is informal and recordings are only used with permission.",
    );
    setGoals(
      "Pilot a consistent attendance register and review session-level activity with instructors before deciding whether recording analysis is useful.",
    );
    setDeployment("Local/on-premises");
    setRequirements([
      "Digital attendance records",
      "Session-level analytics",
      "Reports and exports",
    ]);
    setSample(true);
    setResult(null);
    setErrors({});
  }
  async function generate() {
    if (busy.current) return;
    const next: Record<string, string> = {};
    if (!organization) next.organization = "Choose your organization type.";
    if (workflow.trim().length < 20)
      next.workflow = "Describe the workflow in at least 20 characters.";
    if (goals.trim().length < 20)
      next.goals = "Describe your needs in at least 20 characters.";
    if (!deployment) next.deployment = "Select a preference, including unsure.";
    if (!requirements.length)
      next.requirements = "Select at least one capability.";
    setErrors(next);
    if (Object.keys(next).length) return;
    busy.current = true;
    setPending(true);
    setResult(null);
    try {
      const response = await api<Result>(
        "/readiness-brief",
        write("POST", {
          organization_type: organization,
          workflow,
          goals,
          deployment_model: deployment,
          requirements,
        }),
      );
      setResult(response);
      requestAnimationFrame(() => output.current?.focus());
    } catch (e) {
      setErrors(
        e instanceof ApiError
          ? { form: e.message, ...e.fields }
          : {
              form: "The brief could not be generated. Check your connection and retry.",
            },
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <section id="readiness" className="public-section readiness-section">
      <div className="section-index">05 / A CONSIDERED START</div>
      <div className="readiness-layout">
        <div>
          <h2 className="editorial">Start with the right questions.</h2>
          <p className="section-copy">Institution Readiness Brief</p>
          <p className="subtle">
            Describe your workflow and receive an advisory pilot brief grounded
            in the capabilities available today.
          </p>
          <div className="readiness-note">
            <FileText size={22} />
            <p>
              Only these descriptions are sent to the active cloud provider when
              you choose Generate Brief. Leave out names, contact details,
              student records and private classroom information.
            </p>
          </div>
          <Button onClick={useSample} disabled={pending}>
            Use sample information
            <ArrowRight size={16} />
          </Button>
          {sample && (
            <p className="mt-3 text-xs text-muted">
              Sample workflow loaded. Generation still requires an explicit
              request.
            </p>
          )}
        </div>
        <div className="readiness-form form-stack">
          <div className="form-grid">
            <Select
              label="Institution type"
              value={organization}
              onChange={setOrganization}
              options={options.organization_types}
              error={errors.organization || errors.organization_type}
            />
            <Select
              label="Deployment preference"
              value={deployment}
              onChange={setDeployment}
              options={options.deployment_models}
              error={errors.deployment || errors.deployment_model}
            />
          </div>
          <TextArea
            label="Your current workflow"
            value={workflow}
            onChange={setWorkflow}
            maxLength={1600}
            error={errors.workflow}
          />
          <TextArea
            label="What would you like to improve?"
            value={goals}
            onChange={setGoals}
            maxLength={1600}
            error={errors.goals}
          />
          <fieldset>
            <legend className="font-semibold mb-3">
              Capabilities to explore
            </legend>
            <div className="requirements-grid">
              {options.requirements.slice(0, 6).map((v) => (
                <label className="check-label" key={v}>
                  <input
                    type="checkbox"
                    checked={requirements.includes(v)}
                    onChange={(e) =>
                      setRequirements((prev) =>
                        e.target.checked
                          ? [...prev, v]
                          : prev.filter((x) => x !== v),
                      )
                    }
                  />
                  {v}
                </label>
              ))}
            </div>
            {errors.requirements && (
              <p role="alert" className="text-error mt-2">
                {errors.requirements}
              </p>
            )}
          </fieldset>
          {errors.form && <Alert error>{errors.form}</Alert>}
          <div className="flex flex-wrap items-center gap-4">
            <Button
              variant="primary"
              disabled={pending}
              onClick={() => void generate()}
            >
              {pending
                ? "Preparing your brief…"
                : errors.form
                  ? "Retry brief"
                  : "Generate Brief"}
              {errors.form ? <RefreshCw size={16} /> : <ArrowRight size={16} />}
            </Button>
            <span className="subtle">
              Requires an enabled cloud provider in Settings.
            </span>
          </div>
          {pending && (
            <p role="status" className="subtle">
              Checking model access and synthesizing a structured pilot brief.
              This can take up to a minute.
            </p>
          )}
        </div>
      </div>
      {result && (
        <div className="brief-output" ref={output} tabIndex={-1}>
          <div className="section-head">
            <div>
              <p className="eyebrow">
                Generated by {result.source === "groq" ? "Groq" : "Gemini"} ·
                advisory
              </p>
              <h3 className="editorial">Your institution readiness brief</h3>
            </div>
            <FileText size={24} />
          </div>
          <p className="brief-summary">{result.brief.summary}</p>
          <div className="brief-grid">
            {(
              [
                "capabilities",
                "pilot_scope",
                "privacy_considerations",
                "implementation_questions",
                "next_steps",
                "unanswered_questions",
                "limitations",
              ] as const
            ).map((key) => (
              <section key={key}>
                <h4>
                  {
                    {
                      capabilities: "Relevant existing capabilities",
                      pilot_scope: "Suggested pilot scope",
                      privacy_considerations: "Data & privacy",
                      implementation_questions: "Implementation questions",
                      next_steps: "Recommended next steps",
                      unanswered_questions: "Unanswered questions",
                      limitations: "Product limitations",
                    }[key]
                  }
                </h4>
                <ul>
                  {result.brief[key].map((text, i) => (
                    <li key={i}>
                      {typeof text === "string" ? (
                        text
                      ) : (
                        <>
                          <strong>{text.title}.</strong> {text.description}
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="subtle mt-6">
            {result.notice} Capability description: {result.capability_version}.
          </p>
        </div>
      )}
    </section>
  );
}
