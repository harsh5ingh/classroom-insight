import { useState } from "react";
import { useData } from "./data";
import { api, write } from "./api";
import { Alert, Button, SectionHead } from "./ui";
export default function ScoringPreferences() {
  const { config, run } = useData();
  const p = config.preferences;
  const [visual, setVisual] = useState(p.visual_weight ?? 1),
    [audio, setAudio] = useState(p.audio_weight ?? 1),
    [threshold, setThreshold] = useState(p.audio_rms_threshold ?? 0.015);
  return (
    <form
      className="panel p-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            api(
              "/settings",
              write("PUT", {
                ...config.preferences,
                visual_weight: visual,
                audio_weight: audio,
                audio_rms_threshold: threshold,
              }),
            ),
          "Scoring preferences saved",
        );
      }}
    >
      <SectionHead
        title="Explainable activity settings"
        description="Applies to future analysis. Existing results retain their saved formula."
      />
      <div className="grid md:grid-cols-3 gap-4">
        <label className="field">
          Visual weight
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            required
            value={visual}
            onChange={(e) => setVisual(Number(e.target.value))}
          />
        </label>
        <label className="field">
          Audio weight
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            required
            value={audio}
            onChange={(e) => setAudio(Number(e.target.value))}
          />
        </label>
        <label className="field">
          Recorded-audio RMS threshold
          <input
            type="number"
            min="0.001"
            max="0.5"
            step="0.001"
            required
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
          />
        </label>
      </div>
      <Alert>
        Weights are relative, with at least one positive. Missing signals are
        excluded. Coverage is data availability, not confidence in student
        engagement. Live microphone RMS threshold remains 0.02.
      </Alert>
      <Button type="submit" disabled={visual + audio <= 0}>
        Save activity settings
      </Button>
    </form>
  );
}
