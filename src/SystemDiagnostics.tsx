import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import { Alert, Button, SectionHead } from "./ui";
interface Diagnostics {
  python: string;
  supported_python: boolean;
  virtual_environment: boolean;
  packages: Record<string, string | null>;
  database: string;
  backend: string;
  ffmpeg: boolean;
  ai: { active: string; model: string | null; verification: string };
  offline: {
    local_analysis: boolean;
    local_recommendations: boolean;
    cloud_requires_network: boolean;
  };
  privacy: {
    retained_media_records: number;
    live_raw_retention: string;
    uploaded_media_retention: string;
    head_pose: string;
    mediapipe: string;
  };
}
export default function SystemDiagnostics() {
  const [data, setData] = useState<Diagnostics | null>(null),
    [error, setError] = useState(""),
    [devices, setDevices] = useState(
      "Not checked. Devices are never opened automatically.",
    );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let keep = true;
    api<Diagnostics>("/analytics/diagnostics")
      .then((v) => {
        if (keep) setData(v);
      })
      .catch((e) => {
        if (keep) setError(e.message);
      });
    return () => {
      keep = false;
    };
  }, []);
  async function check() {
    setBusy(true);
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.enumerateDevices)
        throw new Error(
          "Use localhost or HTTPS with a browser supporting media devices.",
        );
      const inputs = await navigator.mediaDevices.enumerateDevices();
      const permissions = [];
      for (const name of ["camera", "microphone"]) {
        try {
          permissions.push(
            name +
              ": " +
              (
                await navigator.permissions.query({
                  name: name as PermissionName,
                })
              ).state,
          );
        } catch {
          permissions.push(name + ": permission query unavailable");
        }
      }
      setDevices(
        `${inputs.filter((d) => d.kind === "videoinput").length} visible camera inputs; ${inputs.filter((d) => d.kind === "audioinput").length} visible microphone inputs. ${permissions.join("; ")}. Browsers may hide devices before permission; this is not a capture test. Use Live Monitor for an explicit hardware test.`,
      );
    } catch (e) {
      setDevices((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <SectionHead
        title="System diagnostics"
        description="Read-only readiness and privacy checks; no credentials or media are returned."
      />
      {error && <Alert error>{error}</Alert>}
      {!data && !error && <p role="status">Checking backend readiness…</p>}
      {data && (
        <>
          <section className="panel p-5 space-y-3">
            <h2>Runtime and connectivity</h2>
            <p>
              Frontend → backend: connected · SQLite: {data.database} · Backend:{" "}
              {data.backend}
            </p>
            <p>
              Python {data.python} · Virtual environment:{" "}
              {data.virtual_environment ? "yes" : "no"} · Supported baseline:{" "}
              {data.supported_python ? "yes" : "no"}
            </p>
            <p>
              FFmpeg:{" "}
              {data.ffmpeg
                ? "available"
                : "unavailable — upload PCM WAV separately"}
            </p>
            <table>
              <thead>
                <tr>
                  <th>Package</th>
                  <th>Installed version (not an import test)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.packages).map(([k, v]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{v || "Not installed / optional"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs subtle">
              {data.privacy.mediapipe} Head pose: {data.privacy.head_pose}.
            </p>
          </section>
          <section className="panel p-5 space-y-3">
            <h2>Devices</h2>
            <Button disabled={busy} onClick={check}>
              Check device availability
            </Button>
            <p role="status">{devices}</p>
            <Link className="text-forest underline" to="/app/live">
              Open Live Monitor
            </Link>
          </section>
          <section className="panel p-5 space-y-3">
            <h2>Local-first privacy</h2>
            <p>
              Active AI: {data.ai.active}{" "}
              {data.ai.model && `· ${data.ai.model}`}
            </p>
            <p>{data.ai.verification}</p>
            <p>
              Local analysis and local rules available.{" "}
              {data.offline.cloud_requires_network
                ? "Selected cloud AI requires network when requested."
                : "Cloud AI is disabled."}
            </p>
            <p>
              Retained upload records: {data.privacy.retained_media_records}.
              Live raw retention: {data.privacy.live_raw_retention}.
            </p>
            <p>{data.privacy.uploaded_media_retention}</p>
            <Link className="text-forest underline" to="/app/settings">
              Manage media retention and AI providers
            </Link>
          </section>
        </>
      )}
    </div>
  );
}
