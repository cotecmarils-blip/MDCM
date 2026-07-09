import React from 'react';
import MopOptionCard from './MopOptionCard';

function MopOptionCardPicker({
  label,
  options,
  value,
  onChange,
  getMeta,
  disabled = false,
  compact = false,
  name,
  required = false,
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className={`font-medium text-gray-700 dark:text-gray-300 ${compact ? 'text-xs mb-1' : 'text-sm mb-1.5'}`}>
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </legend>

      {required && (
        <input type="hidden" name={name} value={value || ''} required readOnly />
      )}

      <div
        className="grid gap-1.5 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((opt) => {
          const meta = getMeta ? getMeta(opt.value) : {};
          return (
            <MopOptionCard
              key={opt.value}
              name={name}
              selected={value === opt.value}
              label={opt.label}
              latex={meta.latex}
              disabled={disabled}
              onSelect={() => onChange(opt.value)}
            />
          );
        })}
      </div>
    </fieldset>
  );
}

export default MopOptionCardPicker;
