// ─── 금감원 API 설정 ────────────────────────────────────────────────────────────
// 실제 API 호출로 검증된 엔드포인트 (2026-05 기준)

export const FSS_ENDPOINT =
  'http://finlife.fss.or.kr/finlifeapi/mortgageLoanProductsSearch.json';

/** 금융권 그룹 코드 */
export const FIN_GROUP_CODES = {
  BANK:             '020000', // 은행
  LIFE_INSURANCE:   '050000', // 생명보험 + 손해보험
} as const;

// ─── 대상 금융회사 매핑 ──────────────────────────────────────────────────────────
// key: API kor_co_nm 에 포함된 키워드 (includes 방식 매칭)
// value: 화면 표시명 + 금융권역

/**
 * 실제 API kor_co_nm 매핑표 (2026-05 확인):
 *   은행: '국민은행', '신한은행', '우리은행', '주식회사 하나은행', '농협은행주식회사'
 *   보험: '삼성생명보험주식회사', '한화생명보험주식회사', '교보생명보험주식회사'
 */
export const INSTITUTION_NAME_MAP: Record<
  string,
  { displayName: string; type: 'bank' | 'insurance' }
> = {
  '국민은행':   { displayName: 'KB국민은행',   type: 'bank'      },
  '신한은행':   { displayName: '신한은행',      type: 'bank'      },
  '우리은행':   { displayName: '우리은행',      type: 'bank'      },
  '하나은행':   { displayName: '하나은행',      type: 'bank'      },
  '농협은행':   { displayName: 'NH농협은행',    type: 'bank'      },
  '삼성생명':   { displayName: '삼성생명보험',  type: 'insurance' },
  '한화생명':   { displayName: '한화생명보험',  type: 'insurance' },
  '교보생명':   { displayName: '교보생명보험',  type: 'insurance' },
};

// ─── 금리 방식 코드 분류 (실제 API 기반) ─────────────────────────────────────────
// lend_rate_type 실제값: 'C' = 변동금리, 'F' = 고정금리

/** 변동금리 코드 집합 */
export const VARIABLE_RATE_CODES = new Set(['C']);

/** 고정금리 코드 집합 */
export const FIXED_RATE_CODES = new Set(['F']);

// ─── 기본 조회 조건 (Default Fixed) ─────────────────────────────────────────────
// 실제 API 코드값 기준

export const DEFAULT_CONDITIONS = {
  housePrice:       300_000_000, // 주택가격: 3억
  loanAmount:       100_000_000, // 대출금액: 1억
  ltv:              33.3,        // LTV: 33.3%
  loanPeriodYears:  30,          // 대출기간: 30년
  mortgageTypeCode: 'A',         // 담보유형: 아파트 (실제 API 코드)
  mortgageTypeName: '아파트',
  repayTypeCode:    'D',         // 상환방식: 분할상환 (실제 API 코드)
  repayTypeName:    '분할상환',
} as const;

// ─── UI 레이블 ───────────────────────────────────────────────────────────────────

export const RATE_TYPE_LABELS = {
  variable: '변동금리',
  fixed:    '고정금리',
} as const;

export const INSTITUTION_TYPE_LABELS = {
  all:       '전체',
  bank:      '은행',
  insurance: '보험사',
} as const;
