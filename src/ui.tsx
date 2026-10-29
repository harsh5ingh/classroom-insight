import {
  useEffect,
  useRef,
  useId,
  type ReactNode,
  type ButtonHTMLAttributes,
} from "react";
import { ArrowUpRight, Inbox, X, AlertCircle } from "lucide-react";
export function Button({
  children,
  variant = "",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) {
  return (
    <button
      className={`btn ${variant === "primary" ? "btn-primary" : variant === "danger" ? "btn-danger" : ""} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
export function Badge({
  children,
  green = false,
}: {
  children: ReactNode;
  green?: boolean;
}) {
  return (
    <span className={`badge ${green ? "badge-green" : ""}`}>{children}</span>
  );
}
export function SectionHead({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-head">
      <div>
        <h2>{title}</h2>
        {description && <p className="subtle mt-1">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="py-14 px-6 text-center">
      <Inbox className="mx-auto text-forest mb-4" size={30} />
      <h2>{title}</h2>
      <div className="subtle max-w-lg mx-auto mt-2 mb-5">{children}</div>
      {action}
    </div>
  );
}
export function Alert({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      role={error ? "alert" : "note"}
      className={`flex items-start gap-3 p-4 rounded-md text-sm leading-relaxed ${error ? "bg-error/5 text-error border border-error/20" : "bg-secondary text-muted"}`}
    >
      <AlertCircle size={18} className="shrink-0 mt-0.5" />
      <div>{children}</div>
    </div>
  );
}
export function Dialog({
  title,
  children,
  onClose,
  wide = false,
  footer,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-labelledby={titleId}
      className={wide ? "dialog-wide" : ""}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-shell">
        <div className="dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="p-1">
            <X size={20} />
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </dialog>
  );
}
export function TextLink({
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="inline-flex items-center gap-1 text-forest font-medium text-sm hover:underline"
      {...props}
    >
      {children}
      <ArrowUpRight size={15} />
    </button>
  );
}
export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string | number;
  detail: string;
}) {
  return (
    <div className="metric">
      <p className="text-muted text-xs font-medium">{label}</p>
      <p className="text-3xl font-editorial my-3 tabular-nums">{value}</p>
      <p className="text-xs text-muted">{detail}</p>
    </div>
  );
}
