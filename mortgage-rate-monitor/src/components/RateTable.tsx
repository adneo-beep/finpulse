import type { FilterType, InstitutionRate, InstitutionType } from '@/types/mortgage';
import { formatRate, getRateColor } from '@/lib/utils';

// ─── 서브 컴포넌트 ────────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1 ? 'bg-yellow-400 text-yellow-900' :
    rank === 2 ? 'bg-gray-300 text-gray-700' :
    rank === 3 ? 'bg-amber-600 text-amber-100' :
                 'bg-gray-100 text-gray-500';

  return (
    <span
      className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${cls}`}
    >
      {rank}
    </span>
  );
}

function InstitutionBadge({ type }: { type: InstitutionType }) {
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        type === 'bank'
          ? 'bg-blue-100 text-blue-800'
          : 'bg-purple-100 text-purple-800',
      ].join(' ')}
    >
      {type === 'bank' ? '🏦 은행' : '🛡️ 보험사'}
    </span>
  );
}

// ─── 테이블 헤더 ─────────────────────────────────────────────────────────────────

const HEADERS = [
  { label: '순위',       align: 'text-center' },
  { label: '금융권역',   align: 'text-left'   },
  { label: '금융기관명', align: 'text-left'   },
  { label: '금리방식',   align: 'text-left'   },
  { label: '최저금리',   align: 'text-right'  },
  { label: '최고금리',   align: 'text-right'  },
  { label: '전월평균금리', align: 'text-right' },
];

// ─── 메인 테이블 ─────────────────────────────────────────────────────────────────

interface RateTableProps {
  rates:  InstitutionRate[];
  filter: FilterType;
}

export function RateTable({ rates, filter }: RateTableProps) {
  const filtered = rates.filter(
    (r) => filter === 'all' || r.institutionType === filter,
  );

  // 필터 후 순위 재부여
  const ranked = filtered.map((r, i) => ({ ...r, rank: i + 1 }));

  if (ranked.length === 0) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-14 text-center">
        <p className="text-4xl mb-3">📭</p>
        <p className="text-sm text-gray-500">해당 조건의 금리 데이터가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full">
          {/* 헤더 */}
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {HEADERS.map(({ label, align }) => (
                <th
                  key={label}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap ${align}`}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>

          {/* 바디 */}
          <tbody className="divide-y divide-gray-100">
            {ranked.map((rate) => (
              <tr
                key={rate.institutionName}
                className="transition-colors hover:bg-gray-50"
              >
                {/* 순위 */}
                <td className="px-4 py-4 text-center">
                  <RankBadge rank={rate.rank} />
                </td>

                {/* 금융권역 */}
                <td className="px-4 py-4">
                  <InstitutionBadge type={rate.institutionType} />
                </td>

                {/* 금융기관명 + 상품명 */}
                <td className="px-4 py-4">
                  <p className="text-sm font-semibold text-gray-900">
                    {rate.institutionName}
                  </p>
                  <p
                    className="mt-0.5 max-w-[180px] truncate text-xs text-gray-400"
                    title={rate.productName}
                  >
                    {rate.productName}
                  </p>
                </td>

                {/* 금리방식 */}
                <td className="px-4 py-4">
                  <span className="text-sm text-gray-600">{rate.rateTypeName}</span>
                </td>

                {/* 최저금리 */}
                <td className="px-4 py-4 text-right">
                  <span className={`text-sm font-bold ${getRateColor(rate.minRate)}`}>
                    {formatRate(rate.minRate)}
                  </span>
                </td>

                {/* 최고금리 */}
                <td className="px-4 py-4 text-right">
                  <span className={`text-sm font-medium ${getRateColor(rate.maxRate)}`}>
                    {formatRate(rate.maxRate)}
                  </span>
                </td>

                {/* 전월평균금리 */}
                <td className="px-4 py-4 text-right">
                  <span className="text-sm text-gray-500">
                    {formatRate(rate.avgRate)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 테이블 푸터 */}
      <div className="border-t border-gray-100 bg-gray-50 px-4 py-2.5">
        <p className="text-xs text-gray-400">
          ※ 각 금융기관의 동일 금리방식 상품 중 최저금리 기준으로 1개 노출 |{' '}
          아파트 담보 · 원리금균등상환 기준
        </p>
      </div>
    </div>
  );
}
