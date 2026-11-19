import React from 'react';
import type { DMSValue } from '../types/survey';

interface DmsInputProps {
  value: DMSValue;
  onChange: (next: DMSValue) => void;
  ariaLabelPrefix: string;
  allowNegative?: boolean;
  compact?: boolean;
}

export const DmsInput: React.FC<DmsInputProps> = ({
  value,
  onChange,
  ariaLabelPrefix,
  allowNegative = false,
  compact = true,
}) => {
  const inputCls = compact
    ? 'w-10 px-1 py-1 text-right text-xs font-mono tabular-nums bg-white border border-slate-200 rounded focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]/30'
    : 'w-14 px-2 py-1.5 text-right text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E] focus:ring-1 focus:ring-[#0F766E]/30';

  const handleDegChange = (raw: string) => {
    // Allow "-0", "-", digits so negative zero degree is preserved cleanly
    const pattern = allowNegative ? /^-?\d*$/ : /^\d*$/;
    if (pattern.test(raw)) {
      onChange({ ...value, deg: raw });
    }
  };

  const handleMinChange = (raw: string) => {
    if (/^\d{0,2}$/.test(raw)) {
      onChange({ ...value, min: raw });
    }
  };

  const handleSecChange = (raw: string) => {
    if (/^\d{0,2}(\.\d?)?$/.test(raw)) {
      onChange({ ...value, sec: raw });
    }
  };

  return (
    <div className="inline-flex items-center gap-0.5 shrink-0">
      <input
        type="text"
        inputMode={allowNegative ? 'text' : 'numeric'}
        value={value.deg}
        onChange={(e) => handleDegChange(e.target.value)}
        aria-label={`${ariaLabelPrefix} độ`}
        placeholder={allowNegative ? '-0' : '0'}
        className={`${inputCls} ${allowNegative ? 'w-11' : ''}`}
      />
      <span className="text-[11px] text-slate-400 select-none">°</span>
      <input
        type="text"
        inputMode="numeric"
        value={value.min}
        onChange={(e) => handleMinChange(e.target.value)}
        aria-label={`${ariaLabelPrefix} phút`}
        placeholder="00"
        className={compact ? 'w-8 px-1 py-1 text-right text-xs font-mono tabular-nums bg-white border border-slate-200 rounded focus:outline-none focus:border-[#0F766E]' : 'w-12 px-1.5 py-1.5 text-right text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E]'}
      />
      <span className="text-[11px] text-slate-400 select-none">'</span>
      <input
        type="text"
        inputMode="decimal"
        value={value.sec}
        onChange={(e) => handleSecChange(e.target.value)}
        aria-label={`${ariaLabelPrefix} giây`}
        placeholder="00"
        className={compact ? 'w-9 px-1 py-1 text-right text-xs font-mono tabular-nums bg-white border border-slate-200 rounded focus:outline-none focus:border-[#0F766E]' : 'w-12 px-1.5 py-1.5 text-right text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-md focus:outline-none focus:border-[#0F766E]'}
      />
      <span className="text-[11px] text-slate-400 select-none">"</span>
    </div>
  );
};
