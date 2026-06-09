// ─── FSS API Raw Response Types ───────────────────────────────────────────────
// 실제 API 응답 기반으로 검증된 타입 (2026-05 기준)

/** 금감원 API - 주택담보대출 기본 상품 정보 */
export interface FssBaseProduct {
  dcls_month:     string;       // 공시 제출월 (YYYYMM)
  fin_co_no:      string;       // 금융회사 코드
  fin_prdt_cd:    string;       // 금융상품 코드
  kor_co_nm:      string;       // 금융회사명 (한글)
  fin_prdt_nm:    string;       // 금융상품명
  join_way:       string;       // 가입방법
  loan_inci_expn: string;       // 부대비용 (API 실제 필드명)
  erly_rpay_fee:  string;       // 중도상환수수료
  dly_rate:       string;       // 연체이자율
  loan_lmt:       string;       // 대출한도
  dcls_strt_day:  string;       // 공시 시작일
  dcls_end_day:   string | null; // 공시 종료일
  fin_co_subm_day: string;      // 금융회사 제출일
}

/** 금감원 API - 주택담보대출 옵션 정보 */
export interface FssOptionProduct {
  dcls_month:         string;  // 공시 제출월
  fin_co_no:          string;  // 금융회사 코드
  fin_prdt_cd:        string;  // 금융상품 코드
  mrtg_type:          string;  // 담보유형 코드 (A=아파트, E=아파트외)  ← 실제값
  mrtg_type_nm:       string;  // 담보유형명
  rpay_type:          string;  // 상환방식 코드 (D=분할상환, S=만기일시) ← 실제값
  rpay_type_nm:       string;  // 상환방식명
  lend_rate_type:     string;  // 금리방식 코드 (C=변동금리, F=고정금리) ← 실제값
  lend_rate_type_nm:  string;  // 금리방식명
  lend_rate_min:      number;  // 최저금리 (%)
  lend_rate_max:      number;  // 최고금리 (%)
  lend_rate_avg:      number;  // 전월평균금리 (%)
}

/** 금감원 API 응답 래퍼 */
export interface FssApiResponse {
  result: {
    prdt_div:    string;
    total_count: number;
    max_page_no: number;
    now_page_no: number;
    err_cd:      string;   // '000' = 정상
    err_msg:     string;
    baseList:    FssBaseProduct[];
    optionList:  FssOptionProduct[];
  };
}

/** 내부 API Route 응답 */
export interface ApiRouteResponse {
  baseList:   FssBaseProduct[];
  optionList: FssOptionProduct[];
  fetchedAt:  string;
  error?:     string;
}

// ─── Application Domain Types ─────────────────────────────────────────────────

/** 금리 방식 탭 */
export type RateType = 'variable' | 'fixed';

/** 금융권역 필터 */
export type FilterType = 'all' | 'bank' | 'insurance';

/** 금융기관 유형 */
export type InstitutionType = 'bank' | 'insurance';

/** 처리된 주담대 상품 (원시 데이터) */
export interface MortgageProduct {
  id:              string;
  institutionCode: string;
  institutionName: string;
  institutionType: InstitutionType;
  productCode:     string;
  productName:     string;
  rateType:        RateType;
  rateTypeCode:    string;
  rateTypeName:    string;
  repayTypeName:   string;
  minRate:         number;
  maxRate:         number;
  avgRate:         number;
}

/** 금융기관별 최적 금리 (집계 결과) */
export interface InstitutionRate {
  rank:            number;
  institutionName: string;
  institutionType: InstitutionType;
  rateTypeName:    string;
  productName:     string;
  minRate:         number;
  maxRate:         number;
  avgRate:         number;
}

/** Dashboard에서 사용하는 데이터 구조 */
export interface MortgageRatesData {
  variableRates:    InstitutionRate[];
  fixedRates:       InstitutionRate[];
  lastUpdated:      string;
  disclosureMonth:  string;
}
