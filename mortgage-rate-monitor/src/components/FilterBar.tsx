'use client';

import type { FilterType } from '@/types/mortgage';
import { INSTITUTION_TYPE_LABELS } from '@/lib/constants';

interface FilterBarProps {
  selected:  FilterType;
  onChange:  (f: FilterType) => void;
}

const FILTER_OPTIONS: { value: FilterType; emoji: string }[] = [
  { value: 'all',       emoji: '🏢' },
  { value: 'bank',      emoji: '🏦' },
  { value: 'insurance', emoji: '🛡️' },
];

export function FilterBar({ selected, onChange }: FilterBarProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-gray-500">금융권역</span>
      <div className="flex gap-1.5">
        {FILTER_OPTIONS.map(({ value, emoji }) => {
          const isActive = selected === value;
          return (
            <button
              key={value}
              onClick={() => onChange(value)}
              className={[
                'flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-all',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              ].join(' ')}
            >
              <span>{emoji}</span>
              <span>{INSTITUTION_TYPE_LABELS[value]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
