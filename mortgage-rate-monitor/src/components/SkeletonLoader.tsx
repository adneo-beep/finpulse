/** 상단 요약 카드 스켈레톤 */
function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="mb-4 flex justify-between">
        <div className="h-4 w-24 rounded bg-gray-200" />
        <div className="h-5 w-12 rounded-full bg-gray-200" />
      </div>
      <div className="mb-2 h-9 w-20 rounded bg-gray-200" />
      <div className="h-4 w-28 rounded bg-gray-200" />
    </div>
  );
}

/** 테이블 행 스켈레톤 */
function SkeletonRow() {
  return (
    <tr className="animate-pulse border-b border-gray-100 last:border-0">
      <td className="px-4 py-4 text-center">
        <div className="mx-auto h-7 w-7 rounded-full bg-gray-200" />
      </td>
      <td className="px-4 py-4">
        <div className="h-5 w-16 rounded-full bg-gray-200" />
      </td>
      <td className="px-4 py-4">
        <div className="mb-1 h-4 w-28 rounded bg-gray-200" />
        <div className="h-3 w-36 rounded bg-gray-100" />
      </td>
      <td className="px-4 py-4">
        <div className="h-4 w-32 rounded bg-gray-200" />
      </td>
      <td className="px-4 py-4 text-right">
        <div className="ml-auto h-5 w-14 rounded bg-gray-200" />
      </td>
      <td className="px-4 py-4 text-right">
        <div className="ml-auto h-5 w-14 rounded bg-gray-200" />
      </td>
      <td className="px-4 py-4 text-right">
        <div className="ml-auto h-5 w-14 rounded bg-gray-200" />
      </td>
    </tr>
  );
}

/** 전체 로딩 스켈레톤 */
export function SkeletonLoader() {
  return (
    <div className="space-y-6">
      {/* 요약 카드 스켈레톤 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* 테이블 스켈레톤 */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                {['순위', '금융권역', '금융기관명', '금리방식', '최저금리', '최고금리', '전월평균금리'].map(
                  (col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 6 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
