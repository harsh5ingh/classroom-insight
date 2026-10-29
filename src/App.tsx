import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { api, write } from "./api";
import { Alert, Button } from "./ui";
import PublicHome from "./public/PublicHome";
const Dashboard = lazy(() => import("./Dashboard"));
function LegacyRedirect() {
  const location = useLocation();
  return <Navigate to={"/app" + location.pathname + location.search} replace />;
}
export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const check = useCallback(async () => {
    try {
      const result = await api<{ authenticated: boolean }>("/auth/session");
      setAuthenticated(result.authenticated);
      setError("");
    } catch {
      setError(
        "The employee portal could not connect. The public website is still available.",
      );
      setAuthenticated(false);
    }
  }, []);
  useEffect(() => {
    void check();
  }, [check]);
  useEffect(() => {
    const expired = () => {
      setAuthenticated(false);
      navigate("/", { state: { login: true }, replace: true });
    };
    window.addEventListener("demo-session-expired", expired);
    return () => window.removeEventListener("demo-session-expired", expired);
  }, [navigate]);
  const signedIn = () => {
    setAuthenticated(true);
    setError("");
    navigate("/app");
  };
  const signOut = async () => {
    await api("/auth/logout", write("POST"));
    setAuthenticated(false);
    navigate("/", { replace: true });
  };
  return (
    <>
      {error && (
        <div className="px-4 pt-3">
          <Alert error>
            {error}
            <Button className="ml-3" onClick={() => void check()}>
              Retry connection
            </Button>
          </Alert>
        </div>
      )}
      <Suspense
        fallback={
          <p className="p-12 text-center subtle" role="status">
            Opening your workspace…
          </p>
        }
      >
        <Routes>
          <Route
            path="/"
            element={
              <PublicHome
                onSignedIn={signedIn}
                authenticated={authenticated === true}
              />
            }
          />
          <Route
            path="/app/*"
            element={
              authenticated === null ? (
                <p className="p-12 subtle" role="status">
                  Checking demo access…
                </p>
              ) : authenticated ? (
                <Dashboard onSignOut={signOut} />
              ) : (
                <Navigate to="/" replace state={{ login: true }} />
              )
            }
          />
          {[
            "attendance",
            "sessions",
            "analytics",
            "recommendations",
            "students",
            "reports",
            "settings",
          ].map((path) => (
            <Route key={path} path={"/" + path} element={<LegacyRedirect />} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}
