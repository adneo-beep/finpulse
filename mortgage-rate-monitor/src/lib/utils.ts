import {
  FssBaseProduct,
  FssOptionProduct,
  InstitutionRate,
  InstitutionType,
  MortgageProduct,
  RateType,
} from '@/types/mortgage';
import {
  DEFAULT_CONDITIONS,
  INSTITUTION_NAME_MAP,
  VARIABLE_RATE_CODES,
} from './constants';

// ─── 금융회사명 매칭 ─────────────────────────────────────────────────────────────

/**
 * FSS API에서 반환하는 kor_co_nm을 대상 금융회사 목록과 매칭
 * 예: '삼성생명보험㈜' → { displayName: '삼성생명보험', type: 'insurance' }
 */
export function matchInstitutionName(
  korCoNm: string,
): { displayName: string; type: InstitutionType } | null {
  for (const [keyword, info] of Object.entries(INSTITUTION_NAME_MAP)) {
    if (korCoNm.includes(keyword)) {
      return info;
    }
  }
  return null;
}

// ─── 금리 방식 분류 ──────────────────────────────────────────────────────────────

export function classifyRateType(rateCode: string): RateType {
  return VARIABLE_RATE_CODES.has(rateCode) ? 'variable' : 'fixed';
}

// ─── 원시 API 데이터 처리 ────────────────────────────────────────────────────────

/**
 * FSS API의 baseList + optionList를 받아
 * 대상 금융회사 + 아파트 + 원리금균등 필터 후 MortgageProduct[] 반환
 */
export function processApiData(
  baseList: FssBaseProduct[],
  optionList: FssOptionProduct[],
): MortgageProduct[] {
  const products: MortgageProduct[] = [];

  for (const base of baseList) {
    const institutionInfo = matchInstitutionName(base.kor_co_nm);
    if (!institutionInfo) continue; // 대상 외 금융회사 건너뜀

    const matchingOptions = optionList.filter(
      (opt) =>
        opt.fin_co_no === base.fin_co_no &&
        opt.fin_prdt_cd === base.fin_prdt_cd &&
        opt.mrtg_type === DEFAULT_CONDITIONS.mortgageTypeCode && // 아파트
        opt.rpay_type === DEFAULT_CONDITIONS.repayTypeCode &&    // 원리금균등
        opt.lend_rate_min > 0,                                   // 유효한 금리만
    );

    for (const option of matchingOptions) {
      products.push({
        id: `${base.fin_co_no}-${base.fin_prdt_cd}-${option.lend_rate_type}`,
        institutionCode:  base.fin_co_no,
        institutionName:  institutionInfo.displayName,
        institutionType:  institutionInfo.type,
        productCode:      base.fin_prdt_cd,
        productName:      base.fin_prdt_nm,
        rateType:         classifyRateType(option.lend_rate_type),
        rateTypeCode:     option.lend_rate_type,
        rateTypeName:     option.lend_rate_type_nm,
        repayTypeName:    option.rpay_type_nm,
        minRate:          option.lend_rate_min,
        maxRate:          option.lend_rate_max,
        avgRate:          option.lend_rate_avg,
      });
    }
  }

  return products;
}

// ─── 금융기관별 집계 (최저금리 기준 베스트 1) ────────────────────────────────────

/**
 * 동일 금융기관의 여러 상품 중 최저금리(minRate) 기준으로 1개만 선택,
 * 오름차순 정렬 후 순위 부여
 */
export function aggregateByInstitution(
  products: MortgageProduct[],
): InstitutionRate[] {
  const bestMap = new Map<string, MortgageProduct>();

  for (const product of products) {
    const existing = bestMap.get(product.institutionName);
    if (!existing || product.minRate < existing.minRate) {
      bestMap.set(product.institutionName, product);
    }
  }

  return Array.from(bestMap.values())
    .sort((a, b) => a.minRate - b.minRate)
    .map((p, i) => ({
      rank:            i + 1,
      institutionName: p.institutionName,
      institutionType: p.institutionType,
      rateTypeName:    p.rateTypeName,
      productName:     p.productName,
      minRate:         p.minRate,
      maxRate:         p.maxRate,
      avgRate:         p.avgRate,
    }));
}

// ─── 포매팅 유틸 ─────────────────────────────────────────────────────────────────

export function formatRate(rate: number | null | undefined): string {
  if (!rate || rate <= 0) return '-';
  return `${rate.toFixed(2)}%`;
}

export function formatCurrency(amount: number): string {
  if (amount >= 100_000_000) {
    const eok = amount / 100_000_000;
    return `${eok % 1 === 0 ? eok.toFixed(0) : eok.toFixed(1)}억원`;
  }
  if (amount >= 10_000) {
    return `${(amount / 10_000).toFixed(0)}만원`;
  }
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** 금리 수준에 따른 색상 클래스 (최저금리 기준) */
export function getRateColor(rate: number): string {
  if (rate < 3.5) return 'text-emerald-600';
  if (rate < 4.5) return 'text-blue-600';
  if (rate < 5.5) return 'text-amber-600';
  return 'text-red-600';
}

export function formatDisclosureMonth(dcls_month: string): string {
  if (!dcls_month || dcls_month.length < 6) return '';
  return `${dcls_month.slice(0, 4)}년 ${dcls_month.slice(4, 6)}월`;
}
