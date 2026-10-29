import { useCallback, useEffect, useState } from "react";
import { NavLink, Route, Routes, useLocation, Link } from "react-router-dom";
import {
  LayoutDashboard,
  ClipboardCheck,
  Video,
  ChartNoAxesCombined,
  Lightbulb,
  Users,
  FileText,
  Settings as SettingsIcon,
  Menu,
  X,
  ChevronDown,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import { Brand } from "./Brand";
import { api, formatDate } from "./api";
import { Context, type Data } from "./data";
import type { Session } from "./types";
import {
  Attendance,
  AnalyticsPage,
  Overview,
  Recommendations,
  Reports,
  Sessions,
  Settings,
  Students,
} from "./pages";
import { SessionForm, UploadForm } from "./forms";
import { Alert, Button, Dialog, Empty } from "./ui";

const navigation = [
  ["/app", "Overview", LayoutDashboard],
  ["/app/attendance", "Attendance", ClipboardCheck],
  ["/app/sessions", "Sessions", Video],
  ["/app/analytics", "Engagement Analytics", ChartNoAxesCombined],
  ["/app/recommendations", "Recommendations", Lightbulb],
  ["/app/students", "Students", Users],
  ["/app/reports", "Reports", FileText],
  ["/app/settings", "Settings", SettingsIcon],
] as const;
export default function Dashboard({
  onSignOut,
}: {
  onSignOut?: () => Promise<void>;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [mobile, setMobile] = useState(false);
  const [profile, setProfile] = useState(false);
  const [modal, setModal] = useState<"session" | "upload" | null>(null);
  const [edit, setEdit] = useState<Session | undefined>();
  const [uploadSession, setUploadSession] = useState<number>();
  const [confirmation, setConfirmation] = useState<{
    title: string;
    description: string;
    action: () => Promise<unknown>;
  } | null>(null);
  const location = useLocation();
  const refresh = useCallback(async () => {
    const [students, sessions, analytics, analyses, recommendations, config] =
      await Promise.all([
        api<Data["students"]>("/students"),
        api<Data["sessions"]>("/sessions"),
        api<Data["analytics"]>("/analytics"),
        api<Data["analyses"]>("/analyses"),
        api<Data["recommendations"]>("/recommendations"),
        api<Data["config"]>("/config"),
      ]);
    setData({
      students,
      sessions,
      analytics,
      analyses,
      recommendations,
      config,
    });
    setError("");
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const processing = data?.analyses.some(
    (a) => a.status === "queued" || a.status === "processing",
  );
  useEffect(() => {
    if (!processing) return;
    const id = window.setInterval(
      () => refresh().catch((e) => setError(e.message)),
      2000,
    );
    return () => window.clearInterval(id);
  }, [processing, refresh]);
  useEffect(() => {
    setMobile(false);
    setProfile(false);
    document.querySelector("main")?.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 6000);
    return () => window.clearTimeout(id);
  }, [notice]);
  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await work();
      try {
        await refresh();
      } catch {
        setError(
          "Your change was saved, but the displayed data could not be refreshed. Retry the connection before making another change.",
        );
      }
      setNotice({ text: message });
      return true;
    } catch (e) {
      setNotice({ text: (e as Error).message, error: true });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const newSession = () => {
    setEdit(undefined);
    setModal("session");
  };
  const upload = (id?: number) => {
    setUploadSession(id);
    setModal("upload");
  };
  const editSession = (s: Session) => {
    setEdit(s);
    setModal("session");
  };
  const title =
    navigation.find((n) => n[0] === location.pathname)?.[1] || "Page not found";
  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 btn"
      >
        Skip to content
      </a>
      {mobile && (
        <button
          aria-label="Close navigation"
          className="fixed inset-0 bg-black/30 z-30 lg:hidden"
          onClick={() => setMobile(false)}
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 w-60 bg-deep text-white z-40 flex flex-col px-5 py-7 transition-transform lg:translate-x-0 ${mobile ? "translate-x-0 visible" : "-translate-x-full invisible lg:visible"}`}
      >
        <Link to="/app" className="block px-2 mb-10">
          <Brand inverse />
        </Link>
        <p className="text-[10px] tracking-[.18em] text-white/40 uppercase px-3 mb-3">
          Workspace
        </p>
        <nav aria-label="Main navigation" className="space-y-1">
          {navigation.map(([path, label, Icon], i) => (
            <NavLink
              key={path}
              to={path}
              end={path === "/app"}
              className={({ isActive }) =>
                `nav-link ${isActive ? "active" : ""} ${i === 7 ? "mt-7 border-t border-white/10 pt-5" : ""}`
              }
            >
              <Icon size={18} strokeWidth={1.6} />
              <span className="text-[13px]">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto pt-10 px-3">
          <div className="border-t border-white/15 pt-5">
            <ShieldCheck size={18} className="text-sage mb-2" />
            <p className="text-xs text-white/80">
              Local-first. Instructor-led.
            </p>
            <p className="text-[11px] leading-relaxed text-white/40 mt-2">
              A little more context.
              <br />A more thoughtful classroom.
            </p>
          </div>
          <p className="text-[10px] text-white/30 mt-6">
            CLASSROOM INSIGHT / 1.0
          </p>
        </div>
      </aside>
      <div className="lg:ml-60">
        <header className="h-[76px] border-b border-line bg-canvas flex items-center justify-between gap-4 px-5 md:px-9">
          <div className="flex min-w-0 items-center gap-2 md:gap-4">
            <button
              aria-label="Open navigation"
              className="lg:hidden"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span className="font-medium text-sm truncate">{title}</span>
            <span className="hidden md:inline text-line">/</span>
            <span className="text-xs text-forest shrink-0">
              Demo Mode
              <span className="hidden md:inline"> · Instructor workspace</span>
            </span>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden xl:block text-xs text-muted">
              {formatDate(new Date().toISOString())}
            </span>
            <div className="relative">
              <button
                className="flex items-center gap-2"
                aria-expanded={profile}
                aria-label="Open profile menu"
                onClick={() => setProfile(!profile)}
              >
                <span className="w-8 h-8 rounded-full bg-sage text-forest grid place-items-center text-xs font-semibold">
                  IN
                </span>
                <span className="hidden sm:block text-xs">Instructor</span>
                <ChevronDown size={14} />
              </button>
              {profile && (
                <div className="absolute right-0 top-11 z-20 w-56 panel p-4 shadow-lg">
                  <p className="text-sm font-medium">
                    Local instructor workspace
                  </p>
                  <p className="subtle text-xs mt-1">
                    Demonstration access only. This is not a secure employee
                    account.
                  </p>
                  <Link
                    to="/app/settings"
                    className="block text-forest mt-4 text-sm"
                    onClick={() => setProfile(false)}
                  >
                    Settings & privacy →
                  </Link>
                  <button
                    className="mt-4 text-sm text-forest"
                    onClick={async () => {
                      try {
                        await onSignOut?.();
                      } catch (e) {
                        setNotice({ text: (e as Error).message, error: true });
                      }
                    }}
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main
          id="main"
          className="max-w-[1600px] mx-auto px-5 md:px-9 py-8"
          tabIndex={-1}
        >
          {error && (
            <div className="mb-6">
              <Alert error>
                {error}{" "}
                <Button
                  onClick={() => refresh().catch((e) => setError(e.message))}
                  className="ml-3"
                >
                  <RefreshCw size={15} />
                  Retry connection
                </Button>
              </Alert>
            </div>
          )}
          {data ? (
            <Context.Provider
              value={{
                ...data,
                refresh,
                run,
                busy,
                newSession,
                upload,
                editSession,
                confirm: (title, description, action) =>
                  setConfirmation({ title, description, action }),
              }}
            >
              <Routes>
                <Route path="/" element={<Overview />} />
                <Route path="/attendance" element={<Attendance />} />
                <Route path="/sessions" element={<Sessions />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route path="/recommendations" element={<Recommendations />} />
                <Route path="/students" element={<Students />} />
                <Route path="/reports" element={<Reports />} />
                <Route path="/settings" element={<Settings />} />
                <Route
                  path="*"
                  element={
                    <Empty
                      title="This page isn’t in your workspace"
                      action={
                        <Link to="/app" className="btn">
                          Return to overview
                        </Link>
                      }
                    />
                  }
                />
              </Routes>
              {modal === "session" && (
                <SessionForm session={edit} onClose={() => setModal(null)} />
              )}{" "}
              {modal === "upload" && (
                <UploadForm
                  sessionId={uploadSession}
                  onClose={() => setModal(null)}
                />
              )}
            </Context.Provider>
          ) : (
            !error && (
              <div className="py-24 text-center subtle" role="status">
                Opening your classroom workspace…
              </div>
            )
          )}
          <footer className="mt-10 pt-5 border-t border-line text-[11px] text-muted flex flex-wrap gap-2 justify-between">
            <span>
              Classroom Insight · Multimodal Attendance & Engagement Agent
            </span>
            <span>Evidence before interpretation.</span>
          </footer>
        </main>
      </div>
      {notice && (
        <div
          role={notice.error ? "alert" : "status"}
          className={`fixed bottom-5 right-5 left-5 sm:left-auto sm:max-w-md z-50 rounded-lg shadow-lg border p-4 flex items-start gap-4 ${notice.error ? "bg-white border-error/30 text-error" : "bg-deep text-white border-forest"}`}
        >
          <span className="flex-1">{notice.text}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {confirmation && (
        <Dialog
          title={confirmation.title}
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
        >
          <p className="subtle mb-6">{confirmation.description}</p>
          <div className="flex justify-end gap-3">
            <Button disabled={busy} onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={busy}
              onClick={async () => {
                await confirmation.action();
                setConfirmation(null);
              }}
            >
              {busy ? "Working…" : "Confirm"}
            </Button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
