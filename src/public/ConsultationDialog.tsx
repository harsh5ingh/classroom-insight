import { useId, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Send } from "lucide-react";
import options from "../../shared/institution-options.json";
import { ApiError, api } from "../api";
import { Alert, Button, Dialog } from "../ui";
import { Input, Select, TextArea } from "./Fields";
type Details = Record<string, string>;
const initial: Details = {
  contact_name: "",
  work_email: "",
  role: "",
  organization_name: "",
  organization_type: "",
  work_phone: "",
  country: "",
  region: "",
  learner_count: "",
  location_count: "",
  attendance_method: "",
  problem: "",
  success_criteria: "",
  deployment_model: "",
  timeline: "",
  notes: "",
};
const labels: Record<string, string> = {
  contact_name: "Full name",
  work_email: "Work email",
  role: "Job title or role",
  organization_name: "Organization or institution name",
  organization_type: "Organization type",
  work_phone: "Work phone (optional)",
  country: "Country",
  region: "State or region",
  learner_count: "Approximate number of learners or employees",
  location_count: "Number of campuses or training locations",
  attendance_method: "Current attendance tracking method",
  problem: "What problem are you trying to solve?",
  success_criteria: "What would a successful pilot look like?",
  deployment_model: "Preferred deployment model",
  timeline: "Approximate implementation timeline",
  notes: "Additional notes (optional)",
};
const groups = [
  [
    "contact_name",
    "work_email",
    "role",
    "organization_name",
    "organization_type",
  ],
  ["country", "region", "learner_count", "location_count", "attendance_method"],
  ["problem", "success_criteria", "deployment_model", "timeline"],
];
export default function ConsultationDialog({
  onClose,
}: {
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [details, setDetails] = useState(initial);
  const [requirements, setRequirements] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [reference, setReference] = useState("");
  const key = useRef(crypto.randomUUID());
  const busy = useRef(false);
  const body = useRef<HTMLFormElement>(null);
  const formId = useId();
  const update = (name: string, value: string) =>
    setDetails((d) => ({ ...d, [name]: value }));
  const input = (name: string, maxLength = 100, type = "text") => (
    <Input
      key={name}
      label={labels[name]}
      value={details[name]}
      onChange={(e) => update(name, e.target.value)}
      maxLength={maxLength}
      type={type}
      error={errors[name]}
    />
  );
  const select = (name: string, values: string[]) => (
    <Select
      label={labels[name]}
      value={details[name]}
      onChange={(v) => update(name, v)}
      options={values}
      error={errors[name]}
    />
  );
  function validate(index: number) {
    const next: Record<string, string> = {};
    for (const name of groups[index]) {
      const value = details[name].trim();
      if (!value) next[name] = "This field is required.";
      else if (
        ["problem", "success_criteria"].includes(name) &&
        value.length < 20
      )
        next[name] = "Add at least 20 characters of context.";
      else if (
        ["learner_count", "location_count"].includes(name) &&
        (!/^\d+$/.test(value) ||
          Number(value) < 1 ||
          Number(value) > (name === "learner_count" ? 10000000 : 100000))
      )
        next[name] = "Enter a whole number within the allowed range.";
      else if (
        name === "work_email" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      )
        next[name] = "Enter a valid work email.";
      else if (
        !["learner_count", "location_count"].includes(name) &&
        value.length < 2
      )
        next[name] = "Enter at least 2 characters.";
    }
    if (index === 2 && !requirements.length)
      next.requirements = "Select at least one requirement.";
    setErrors(next);
    return !Object.keys(next).length;
  }
  function go(next: number) {
    setStep(next);
    requestAnimationFrame(() => {
      body.current?.closest(".dialog-body")?.scrollTo({ top: 0 });
      body.current?.focus();
    });
  }
  function advance() {
    if (validate(step)) go(step + 1);
  }
  async function submit() {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setErrors({});
    try {
      const result = await api<{ reference: string }>("/enquiries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": key.current,
        },
        body: JSON.stringify({
          ...details,
          learner_count: Number(details.learner_count),
          location_count: Number(details.location_count),
          requirements,
          contact_consent: consent,
        }),
      });
      setReference(result.reference);
    } catch (e) {
      setErrors(
        e instanceof ApiError
          ? { form: e.message, ...e.fields }
          : {
              form: "Unable to save your enquiry. Your entries are still here; please retry.",
            },
      );
      busy.current = false;
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      title={
        reference
          ? "Your enquiry is saved."
          : "Let’s understand your institution."
      }
      onClose={onClose}
      wide
      footer={
        !reference && (
          <>
            <span className="subtle">
              {step + 1} / 4 ·{" "}
              {["Contact", "Organization", "Requirements", "Review"][step]}
            </span>
            <div className="flex gap-2">
              {step > 0 && (
                <Button disabled={pending} onClick={() => go(step - 1)}>
                  <ArrowLeft size={16} />
                  Back
                </Button>
              )}
              {step < 3 ? (
                <Button variant="primary" form={formId} type="submit">
                  Continue
                  <ArrowRight size={16} />
                </Button>
              ) : (
                <Button
                  variant="primary"
                  disabled={pending}
                  form={formId}
                  type="submit"
                >
                  {pending ? "Saving enquiry…" : "Submit enquiry"}
                  <Send size={16} />
                </Button>
              )}
            </div>
          </>
        )
      }
    >
      {reference ? (
        <div className="success-panel" role="status">
          <Check size={32} />
          <p>Reference</p>
          <strong className="reference-id">{reference}</strong>
          <p>
            Your request was saved in this installation’s local database. No
            email was sent. Production follow-up requires an explicitly
            configured notification service.
          </p>
          <p>
            Keep this reference for your project evaluator or local
            administrator.
          </p>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </div>
      ) : (
        <form
          ref={body}
          id={formId}
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (step < 3) advance();
            else void submit();
          }}
          tabIndex={-1}
          className="form-stack"
        >
          <p className="subtle">
            Tell us about your organization, your current workflow, and what you
            need from classroom intelligence. These details help assess whether
            Classroom Insight fits your requirements.
          </p>
          <ol className="form-progress" aria-label="Consultation progress">
            {["Contact", "Organization", "Requirements", "Review"].map(
              (name, index) => (
                <li
                  key={name}
                  aria-current={index === step ? "step" : undefined}
                  data-complete={index < step}
                >
                  <span>{index < step ? <Check size={14} /> : index + 1}</span>
                  {name}
                </li>
              ),
            )}
          </ol>
          {errors.form && (
            <Alert error>
              {errors.form}{" "}
              {Object.keys(errors).filter((k) => k !== "form").length > 0 &&
                "Use Back to review the highlighted fields."}
            </Alert>
          )}
          {step === 0 && (
            <div className="form-grid">
              {input("contact_name")}
              {input("work_email", 254, "email")}
              {input("role", 120)}
              {input("organization_name", 160)}
              {select("organization_type", options.organization_types)}
              {input("work_phone", 40, "tel")}
            </div>
          )}
          {step === 1 && (
            <div className="form-grid">
              {input("country", 80)}
              {input("region", 100)}
              {input("learner_count", 8, "number")}
              {input("location_count", 6, "number")}
              {select("attendance_method", options.attendance_methods)}
              <p className="subtle">
                Approximate counts are enough. Do not include student names or
                records.
              </p>
            </div>
          )}
          {step === 2 && (
            <>
              <fieldset>
                <legend className="mb-3 font-semibold">
                  What would you like to explore?
                </legend>
                <div className="requirements-grid">
                  {options.requirements.map((v) => (
                    <label key={v} className="check-label">
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
              {["problem", "success_criteria"].map((name) => (
                <TextArea
                  key={name}
                  label={labels[name]}
                  value={details[name]}
                  onChange={(v) => update(name, v)}
                  error={errors[name]}
                />
              ))}
              <div className="form-grid">
                {select("deployment_model", options.deployment_models)}
                {select("timeline", options.timelines)}
              </div>
              <TextArea
                label={labels.notes}
                value={details.notes}
                onChange={(v) => update("notes", v)}
              />
              <p className="subtle">
                Deployment and integration preferences are discussion topics,
                not available services or commitments.
              </p>
              <label className="check-label">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                />
                I agree to be contacted about this specific enquiry (optional).
              </label>
            </>
          )}
          {step === 3 && (
            <>
              <h3>Review before submitting</h3>
              <dl className="review-list">
                {Object.entries(details).map(([name, value]) => (
                  <div key={name}>
                    <dt>{labels[name]}</dt>
                    <dd>{value || "Not provided"}</dd>
                  </div>
                ))}
                <div>
                  <dt>Requirements</dt>
                  <dd>{requirements.join(", ")}</dd>
                </div>
                <div>
                  <dt>Contact consent</dt>
                  <dd>
                    {consent ? "Yes, for this enquiry only" : "Not given"}
                  </dd>
                </div>
              </dl>
              <Alert>
                This saves contact details locally for evaluation. No automated
                email is configured. You can submit without consenting to
                contact.
              </Alert>
            </>
          )}
        </form>
      )}
    </Dialog>
  );
}
