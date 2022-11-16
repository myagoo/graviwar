
export const SettingsController = ({
  settings,
}: {
  settings: Record<string, { value: number; min: number; max: number }>;
}) => {
  return (
    <div className="overlay top right flex-column">
      {Object.entries(settings).map(([key, { value, min, max }]) => {
        return (
          <label key={key}>
            {key}
            <input type="number" step={1} defaultValue={value} min={min} max={max} onChange={e => settings[key].value = e.target.valueAsNumber} />
          </label>
        );
      })}
    </div>
  );
};
