import type { InstitutionRate } from '@/types/mortgage';
import { formatRate } from '@/lib/utils';

interface SummaryCardsProps {
  variableRates: InstitutionRate[];
  fixedRates:    InstitutionRate[];
}

interface CardProps {
  title:      string;
  emoji:      string;
  rate:       InstitutionRate | undefined;
  colorClass: string; // Tailwind gradient/border classes
  badgeBg:    string;
}

function BestRateCard({ title, emoji, rate, colorClass, badgeBg }: CardProps) {
  return (
    <div className={`rounded-xl border p-5 ${colorClass}`}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">{emoji} {title} 최저</span>
        {rate && (
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badgeBg}`}>
            {rate.institutionType === 'bank' ? '🏦 은행' : '🛡️ 보험사'}
          </span>
        )}
      </div>

      {rate ? (
        <>
          <p className="text-3xl font-bold">{formatRate(rate.minRate)}</p>
          <p className="mt-1 text-sm opacity-80">{rate.institutionName}</p>
          <p className="mt-0.5 truncate text-xs opacity-60">{rate.rateTypeName}</p>
        </>
      ) : (
        <p className="text-sm opacity-50">데이터 없음</p>
      )}
    </div>
  );
}

export function SummaryCards({ variableRates, fixedRates }: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <BestRateCard
        title="변동금리"
        emoji="🔄"
        rate={variableRates[0]}
        colorClass="border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 text-orange-800"
        badgeBg="bg-orange-200 text-orange-800"
      />
      <BestRateCard
        title="고정금리"
        emoji="📌"
        rate={fixedRates[0]}
        colorClass="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-800"
        badgeBg="bg-blue-200 text-blue-800"
      />
    </div>
  );
}
