import { useId, type InputHTMLAttributes, type ReactNode } from "react";
export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="subtle">{hint}</small>}
      {error && (
        <small role="alert" className="text-error">
          {error}
        </small>
      )}
    </div>
  );
}
export function Input({
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        required={!label.includes('(optional)')}
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={error ? id + "-error" : undefined}
      />
      {error && (
        <small role="alert" id={id + "-error"} className="text-error">
          {error}
        </small>
      )}
    </div>
  );
}
export function Select({
  label,
  value,
  onChange,
  options,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  error?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        required
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? id + "-error" : undefined}
      >
        <option value="">Choose an option</option>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      {error && (
        <small id={id + "-error"} role="alert" className="text-error">
          {error}
        </small>
      )}
    </div>
  );
}
export function TextArea({
  label,
  value,
  onChange,
  error,
  maxLength = 2000,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maxLength?: number;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea
        required={!label.includes('(optional)')}
        id={id}
        rows={3}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? id + "-error" : undefined}
      />
      {error && (
        <small id={id + "-error"} role="alert" className="text-error">
          {error}
        </small>
      )}
    </div>
  );
}
