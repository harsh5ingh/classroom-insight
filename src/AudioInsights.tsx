import { Chart } from "./ChartView";
import { Alert, SectionHead } from "./ui";
export interface SpectralAudio {
  engine: string;
  normalized_sample_rate: number | null;
  threshold: number;
  features: {
    seconds: number;
    end_seconds: number;
    rms: number;
    energy: number;
    zcr: number;
    centroid_hz: number;
    rolloff_hz: number;
    flatness: number;
    category: string;
  }[];
  waveform: { seconds: number; minimum: number; maximum: number }[];
  spectrogram: { seconds: number; db: number[] }[];
  feature_stride_seconds: number;
  broadband_activity_fraction: number | null;
  silence_fraction: number | null;
  method: string;
  limitations: string;
}
export function AudioInsights({ data }: { data: SpectralAudio }) {
  return (
    <section className="panel p-5 space-y-4">
      <SectionHead
        title="Acoustic observations"
        description={`${data.engine} · ${data.normalized_sample_rate ? data.normalized_sample_rate + " Hz mono" : "source sample rate"} · RMS threshold ${data.threshold}`}
      />
      <p className="subtle">
        Sampled waveform envelope; {data.feature_stride_seconds}s display
        stride. Broadband sound is not verified classroom noise or speech.
      </p>
      <Chart
        data={data.waveform}
        xKey="seconds"
        label="Sampled waveform minimum and maximum"
        series={[
          { key: "minimum", label: "Minimum", color: "#9AB194" },
          { key: "maximum", label: "Maximum", color: "#285943" },
        ]}
      />
      <Chart
        data={data.features}
        xKey="seconds"
        label="RMS audio level over time"
        series={[{ key: "rms", label: "RMS", color: "#285943" }]}
      />
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label="Coarse spectrogram: time left to right, frequency bands bottom to top; relative power, not calibrated loudness"
          viewBox={`0 0 ${Math.max(1, data.spectrogram.length)} 32`}
          preserveAspectRatio="none"
          className="w-full h-40"
        >
          {data.spectrogram.flatMap((p, x) =>
            p.db.map((db, y) => (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={31 - y}
                width={1}
                height={1}
                fill="#285943"
                opacity={Math.max(0.05, (db + 100) / 100)}
              />
            )),
          )}
        </svg>
      </div>
      <p className="text-xs subtle">
        32 frequency bands; darker means greater relative spectral power.
        Display samples may omit intervening windows. Silence:{" "}
        {data.silence_fraction == null
          ? "unavailable"
          : (data.silence_fraction * 100).toFixed(1) + "%"}
        ; broadband activity:{" "}
        {data.broadband_activity_fraction == null
          ? "unavailable"
          : (data.broadband_activity_fraction * 100).toFixed(1) + "%"}
        .
      </p>
      <details>
        <summary>Features and noise/activity timeline</summary>
        <div className="overflow-auto max-h-72">
          <table>
            <thead>
              <tr>
                <th>Seconds</th>
                <th>RMS</th>
                <th>ZCR</th>
                <th>Centroid Hz</th>
                <th>Rolloff Hz</th>
                <th>Classification</th>
              </tr>
            </thead>
            <tbody>
              {data.features.map((p) => (
                <tr key={p.seconds}>
                  <td>{p.seconds}</td>
                  <td>{p.rms}</td>
                  <td>{p.zcr}</td>
                  <td>{p.centroid_hz}</td>
                  <td>{p.rolloff_hz}</td>
                  <td>{p.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="subtle text-xs">{data.method}</p>
      <Alert>{data.limitations}</Alert>
    </section>
  );
}
