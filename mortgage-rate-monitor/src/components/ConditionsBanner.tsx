import { DEFAULT_CONDITIONS } from '@/lib/constants';
import { formatCurrency } from '@/lib/utils';

const conditions = [
  { label: '주택가격',   value: formatCurrency(DEFAULT_CONDITIONS.housePrice) },
  { label: '대출금액',   value: formatCurrency(DEFAULT_CONDITIONS.loanAmount) },
  { label: 'LTV',        value: `${DEFAULT_CONDITIONS.ltv}%` },
  { label: '대출기간',   value: `${DEFAULT_CONDITIONS.loanPeriodYears}년` },
  { label: '주택종류',   value: DEFAULT_CONDITIONS.mortgageTypeName },
  { label: '상환방식',   value: DEFAULT_CONDITIONS.repayTypeName },
];

export function ConditionsBanner() {
  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-sm font-semibold text-blue-800">📋 조회 기준 조건</span>
        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-600">
          기본값 고정
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {conditions.map(({ label, value }) => (
          <div
            key={label}
            className="rounded-lg border border-blue-100 bg-white p-3"
          >
            <p className="mb-1 text-xs text-gray-500">{label}</p>
            <p className="text-sm font-semibold text-gray-800">{value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
