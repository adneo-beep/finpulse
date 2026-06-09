'use client';

import type { RateType } from '@/types/mortgage';
import { RATE_TYPE_LABELS } from '@/lib/constants';

interface RateTabsProps {
  activeTab:     RateType;
  onTabChange:   (tab: RateType) => void;
  variableCount: number;
  fixedCount:    number;
}

const TABS: {
  value:      RateType;
  activeAccent: string;
  countAccent:  string;
}[] = [
  {
    value:       'variable',
    activeAccent: 'text-orange-700',
    countAccent:  'bg-orange-100 text-orange-700',
  },
  {
    value:       'fixed',
    activeAccent: 'text-blue-700',
    countAccent:  'bg-blue-100 text-blue-700',
  },
];

export function RateTabs({
  activeTab,
  onTabChange,
  variableCount,
  fixedCount,
}: RateTabsProps) {
  const counts: Record<RateType, number> = {
    variable: variableCount,
    fixed:    fixedCount,
  };

  return (
    <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
      {TABS.map(({ value, activeAccent, countAccent }) => {
        const isActive = activeTab === value;
        return (
          <button
            key={value}
            onClick={() => onTabChange(value)}
            className={[
              'flex items-center justify-center gap-2 rounded-md px-6 py-2 text-sm font-medium transition-all',
              isActive
                ? `bg-white shadow-sm ${activeAccent}`
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            <span>{RATE_TYPE_LABELS[value]}</span>
            <span
              className={[
                'rounded-full px-1.5 py-0.5 text-xs',
                isActive ? countAccent : 'bg-gray-200 text-gray-500',
              ].join(' ')}
            >
              {counts[value]}
            </span>
          </button>
        );
      })}
    </div>
  );
}
