import { useState } from "react";
import { DEFAULT_SOLO_SETTINGS, loadSoloSettings, SOLO_SETTINGS_KEY, soloSettingsSchema, settingsSections, type SoloSettings } from "./solo-settings";

export function SoloSetup({ onStart, onBack }: { onStart: (settings: SoloSettings) => void; onBack: () => void }) {
  const [editing, setEditing] = useState(false);
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

  return <main className="setup-page menu-ui">
    <form className="setup-card menu-card" onSubmit={event => {
      event.preventDefault();
      const parsed = soloSettingsSchema.safeParse(settings);
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
      save(parsed.data);
      onStart(parsed.data);
    }}>
      <header className="menu-header"><button type="button" className="menu-back" aria-label={editing ? "Back to solo" : "Back to menu"} onClick={() => editing ? setEditing(false) : onBack()}>←</button><h1>{editing ? "Solo settings" : "Solo"}</h1></header>
      {!editing && <><p>Play at your pace, with your rules.</p><p>{settings.bodyCount} bodies · {settings.aiCount} AI rivals</p><button type="button" onClick={() => setEditing(true)}>Settings</button></>}
      {editing && <>
      <p>Saved automatically in this browser. All sizes are radii in arena units. AI rivals are included in the total and start at your size.</p>
      {settingsSections.map(section => <details className="settings-section" key={section.label}>
        <summary>{section.label}</summary>
        <div className="setup-fields">
        {section.fields.map(field => <label key={field.key}>
          <span className="setup-slider-label">{field.label}<output aria-hidden="true">{settings[field.key]}</output></span>
          <input aria-label={field.label} type="range" disabled={!settings.arenaShrinks && field.key === "shrinkSeconds"} min={field.min} max={field.max} step={field.step}
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
      {section.label === "Arena" && <><label className="setup-checkbox">
        <input type="checkbox" checked={settings.arenaShrinks}
          onChange={event => update({ ...settings, arenaShrinks: event.target.checked })} />
        Shrink arena over time
      </label>
      <p className="setup-note">When enabled, the arena shrinks steadily to zero over the chosen duration. Gravity remains constant.</p></>}
      </details>)}
      <button type="button" onClick={() => update({ ...DEFAULT_SOLO_SETTINGS })}>Reset defaults</button>
      </>}
      {error && <p role="alert">{error}</p>}
      {storageError && <p role="status">{storageError}</p>}
      {!editing && <div className="setup-actions"><button type="submit" className="setup-start">Start solo game</button></div>}
    </form>
  </main>;
}
