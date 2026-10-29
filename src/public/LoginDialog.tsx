import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, ArrowRight, Check } from "lucide-react";
import { api, write } from "../api";
import { Alert, Button, Dialog } from "../ui";
import { Brand } from "../Brand";
import { Input } from "./Fields";
export default function LoginDialog({
  onClose,
  onSignedIn,
}: {
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(false);
  useEffect(() => () => clearTimeout(timer.current), []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy.current) return;
    const next: Record<string, string> = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      next.email = "Enter a valid work email.";
    if (!password) next.password = "Enter the demo password.";
    setErrors(next);
    if (Object.keys(next).length) return;
    busy.current = true;
    setPending(true);
    try {
      await api("/auth/login", write("POST", { email, password, remember }));
      setSuccess(true);
      timer.current = setTimeout(onSignedIn, 450);
    } catch (error) {
      setErrors({
        form:
          error instanceof Error
            ? error.message
            : "Sign-in failed. Please retry.",
      });
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <Dialog title="Employee Login" onClose={success ? onSignedIn : onClose}>
      <div className="portal-intro">
        <Brand />
        <p>Welcome to your classroom workspace.</p>
      </div>
      {success ? (
        <div role="status" className="success-panel">
          <Check />
          <h3>Demo access granted</h3>
          <p>Opening your workspace…</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="form-stack">
          {errors.form && <Alert error>{errors.form}</Alert>}
          <Input
            label="Work email"
            type="email"
            autoComplete="username"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={errors.email}
          />
          <div className="password-field">
            <Input
              label="Password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              error={errors.password}
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me for 7 days
          </label>
          <Button variant="primary" disabled={pending} type="submit">
            {pending ? "Signing in…" : "Sign in"}
            <ArrowRight size={16} />
          </Button>
          <aside className="demo-account">
            <strong>Public demo account · no real account security</strong>
            <p>
              Work email: <code>instructor@classroom.demo</code>
              <br />
              Password: <code>ClassroomDemo!2026</code>
            </p>
            <p>
              Local demonstration only. Everyone using this account shares the
              same workspace. Use the credentials supplied by your operator if
              these defaults were changed.
            </p>
          </aside>
        </form>
      )}
    </Dialog>
  );
}
