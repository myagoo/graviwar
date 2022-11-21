import React from "react";

export const SettingsController = <T extends Record<string, number>>({
  settingsRef,
  onChange,
}: {
  settingsRef: React.MutableRefObject<T>;
  onChange: (key: keyof T, value: number) => any;
}) => {
  return (
    <div className="overlay top right flex-column">
      {Object.entries(settingsRef.current).map(([key, value]) => {
        return (
          <label key={key}>
            {key}
            <input
              type="number"
              step={1}
              defaultValue={value}
              min={0}
              onChange={(e) => onChange(key, e.target.valueAsNumber)}
            />
          </label>
        );
      })}
    </div>
  );
};
