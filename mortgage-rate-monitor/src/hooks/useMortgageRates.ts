'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ApiRouteResponse, MortgageRatesData } from '@/types/mortgage';
import { aggregateByInstitution, formatDisclosureMonth, processApiData } from '@/lib/utils';

interface UseMortgageRatesResult {
  data:      MortgageRatesData | null;
  isLoading: boolean;
  error:     string | null;
  refresh:   () => void;
}

export function useMortgageRates(): UseMortgageRatesResult {
  const [data,      setData]      = useState<MortgageRatesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error,     setError]     = useState<string | null>(null);

  const fetchRates = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/mortgage-rates');

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          (body as { error?: string }).error ??
            `서버 오류 (HTTP ${res.status})`,
        );
      }

      const raw: ApiRouteResponse = await res.json();

      // 원시 데이터 처리 (필터링 + 정제)
      const allProducts    = processApiData(raw.baseList, raw.optionList);
      const variableProducts = allProducts.filter((p) => p.rateType === 'variable');
      const fixedProducts    = allProducts.filter((p) => p.rateType === 'fixed');

      // 금융기관별 집계 + 순위 부여
      const variableRates = aggregateByInstitution(variableProducts);
      const fixedRates    = aggregateByInstitution(fixedProducts);

      // 공시월 포매팅
      const dcls_month    = raw.baseList[0]?.dcls_month ?? '';
      const disclosureMonth = formatDisclosureMonth(dcls_month);

      setData({
        variableRates,
        fixedRates,
        lastUpdated:    new Date(raw.fetchedAt).toLocaleString('ko-KR'),
        disclosureMonth,
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : '알 수 없는 오류가 발생했습니다.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
  }, [fetchRates]);

  return { data, isLoading, error, refresh: fetchRates };
}
