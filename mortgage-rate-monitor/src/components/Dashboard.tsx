'use client';

import { useState } from 'react';
import type { FilterType, RateType } from '@/types/mortgage';
import { useMortgageRates } from '@/hooks/useMortgageRates';
import { ConditionsBanner } from './ConditionsBanner';
import { ErrorDisplay }     from './ErrorDisplay';
import { FilterBar }        from './FilterBar';
import { RateTabs }         from './RateTabs';
import { RateTable }        from './RateTable';
import { SkeletonLoader }   from './SkeletonLoader';
import { SummaryCards }     from './SummaryCards';

export function Dashboard() {
  const { data, isLoading, error, refresh } = useMortgageRates();

  const [activeTab, setActiveTab] = useState<RateType>('variable');
  const [filter,    setFilter]    = useState<FilterType>('all');

  const currentRates =
    data
      ? activeTab === 'variable'
        ? data.variableRates
        : data.fixedRates
      : [];

  return (
    <div className="space-y-6">
      {/* 조회 기준 조건 배너 */}
      <ConditionsBanner />

      {/* 섹션 헤더 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">주요 금융사 금리 비교</h2>
          {data && (
            <p className="mt-0.5 text-sm text-gray-500">
              공시기준: {data.disclosureMonth}
              {data.disclosureMonth && ' · '}
              업데이트: {data.lastUpdated}
            </p>
          )}
        </div>

        <button
          onClick={refresh}
          disabled={isLoading}
          className="flex items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50 sm:self-auto"
        >
          <span className={isLoading ? 'animate-spin inline-block' : ''}>🔄</span>
          {isLoading ? '불러오는 중…' : '새로고침'}
        </button>
      </div>

      {/* 로딩 중 */}
      {isLoading && <SkeletonLoader />}

      {/* 에러 */}
      {!isLoading && error && (
        <ErrorDisplay message={error} onRetry={refresh} />
      )}

      {/* 데이터 */}
      {!isLoading && !error && data && (
        <>
          {/* 최저금리 요약 카드 */}
          <SummaryCards
            variableRates={data.variableRates}
            fixedRates={data.fixedRates}
          />

          {/* 필터 + 탭 */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <FilterBar selected={filter} onChange={setFilter} />
            <RateTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              variableCount={data.variableRates.length}
              fixedCount={data.fixedRates.length}
            />
          </div>

          {/* 금리 테이블 */}
          <RateTable rates={currentRates} filter={filter} />
        </>
      )}

      {/* 면책 고지 */}
      <p className="text-center text-xs text-gray-400">
        본 데이터는 금융감독원 금융상품 한눈에 API(finlife.fss.or.kr) 기반이며,
        실제 대출 조건은 각 금융사에 문의하세요.
      </p>
    </div>
  );
}
