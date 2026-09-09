import { useState } from "react";
import { DEFAULT_SOLO_SETTINGS, loadSoloSettings, SOLO_SETTINGS_KEY, soloSettingsSchema, type SoloSettings } from "./solo-settings";

const fields: { key: Exclude<keyof SoloSettings, "gravityIncreases">; label: string; min: number; max: number; step: string }[] = [
  { key: "arenaRadius", label: "Arena radius", min: 5000, max: 50000, step: "500" },
  { key: "gravity", label: "Gravitational constant", min: 0, max: 1, step: "0.01" },
  { key: "bodyCount", label: "Total bodies (including you)", min: 10, max: 5000, step: "1" },
  { key: "playerRadius", label: "Your starting radius", min: 30, max: 300, step: "1" },
  { key: "minBodyRadius", label: "Minimum body radius", min: 10, max: 150, step: "1" },
  { key: "maxBodyRadius", label: "Maximum body radius", min: 10, max: 150, step: "1" },
];

export function SoloSetup({ onStart, onBack }: { onStart: (settings: SoloSettings) => void; onBack: () => void }) {
  const [settings, setSettings] = useState(loadSoloSettings);
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState("");
  const save = (value: SoloSettings) => {
    try {
      localStorage.setItem(SOLO_SETTINGS_KEY, JSON.stringify(value));
      setStorageError("");
    } catch { setStorageError("Your browser could not save these settings. You can still play with them."); }
  };
  const update = (next: SoloSettings) => {
    setSettings(next);
    const parsed = soloSettingsSchema.safeParse(next);
    setError(parsed.success ? "" : parsed.error.issues[0].message);
    if (parsed.success) save(parsed.data);
  };

  return <main className="setup-page">
    <form className="setup-card" onSubmit={event => {
      event.preventDefault();
      const parsed = soloSettingsSchema.safeParse(settings);
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      save(parsed.data);
      onStart(parsed.data);
    }}>
      <h1>Solo setup</h1>
      <p>Saved automatically in this browser. All sizes are radii in arena units.</p>
      <div className="setup-fields">
        {fields.map(field => <label key={field.key}>
          <span className="setup-slider-label">{field.label}<output aria-hidden="true">{settings[field.key]}</output></span>
          <input aria-label={field.label} type="range" min={field.min} max={field.max} step={field.step}
            value={Number.isFinite(settings[field.key]) ? settings[field.key] : ""}
            onChange={event => {
              const value = event.target.valueAsNumber;
              update({ ...settings, [field.key]: value,
                ...(field.key === "minBodyRadius" ? { maxBodyRadius: Math.max(value, settings.maxBodyRadius) } : {}),
                ...(field.key === "maxBodyRadius" ? { minBodyRadius: Math.min(value, settings.minBodyRadius) } : {}),
              });
            }} />
          <span className="setup-slider-range" aria-hidden="true"><span>{field.min}</span><span>{field.max}</span></span>
        </label>)}
      </div>
      <label className="setup-checkbox">
        <input type="checkbox" checked={settings.gravityIncreases}
          onChange={event => update({ ...settings, gravityIncreases: event.target.checked })} />
        Increase gravity over time
      </label>
      <p className="setup-note">When enabled, gravity increases by 0.024 per simulated second. Set gravity to 0 and disable the increase for no gravity.</p>
      {error && <p role="alert">{error}</p>}
      {storageError && <p role="status">{storageError}</p>}
      <div className="setup-actions">
        <button type="button" onClick={onBack}>Back</button>
        <button type="button" onClick={() => update({ ...DEFAULT_SOLO_SETTINGS })}>Reset defaults</button>
        <button type="submit" className="setup-start">Start solo game</button>
      </div>
    </form>
  </main>;
}
