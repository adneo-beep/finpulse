/**
 * 국세청 상업용건물/오피스텔 기준시가 API 데이터 수집
 * Base: https://api.odcloud.kr/api/3036455/v1/
 */

const SERVICE_KEY = '5039af0d3b48f2540373d371810bec76d3ce3f1bdcd0c87532b348fa3d3c5f69';

// 연도별 UDDI 엔드포인트 목록
const ENDPOINTS = {
  2026: 'uddi:c13c2f31-9e7d-4823-9c5f-cacbfc92c1c9',           // 활용신청 필요
  2025: null,                                                    // 별도 확인 필요
  2020: 'uddi:04e7fcee-3162-40ae-90e9-b1330f2e9b11',
  '2020b': 'uddi:24153db7-f856-4e76-aafd-c196e79f7dd2',
  2019: 'uddi:45bfecd8-456a-430d-8a59-bd3d1145835e',
  '2019b': 'uddi:4668bee5-fbfd-41b1-a521-c839c3e01615_201909281433',
  2018: 'uddi:e013f8f6-0e25-49bb-b04b-966dbf65a17f_201809272229',
  '2018b': 'uddi:3962fe10-9f4f-4dd5-94c9-dbf7f3050b48_201809272231',
  2017: 'uddi:1e77cb59-e03a-4440-a9e3-fc3460330fe9_201808021102',
  2016: 'uddi:0baa629b-05aa-440a-a1fd-ad733c00b5bf_201810041325',
  2015: 'uddi:a3728396-464e-4cd6-8fe3-81920479b6df_201809262001',
  2014: 'uddi:9fb3218d-0789-4399-abe1-f3a67588658c_201809262004',
  2013: 'uddi:900bec93-7e97-4c90-9ce0-878cd47d0cbd_201808021104',
  2012: 'uddi:f4f61d99-dc4f-499b-b1c5-d3566b3cb851_201809272205',
  2011: 'uddi:0baa629b-05aa-440a-a1fd-ad733c00b5bf_201810041325',
  2010: 'uddi:0d1e3d92-d27f-4a64-be05-80ed4e4248a0_201808021104',
  2009: 'uddi:f05c2070-df5d-4a68-be1c-cd96153ba49e_201808021102',
  2008: 'uddi:d0ad6495-47cc-4946-91f3-9f0e01406cba_201809191732',
  2007: 'uddi:331b9be1-0716-4c03-bd77-ca91f26a2442_201809191718',
  2006: 'uddi:64b5c32e-24ea-4077-a584-8800beb329d4_201808021105',
  2005: 'uddi:7942633b-648d-43da-b1be-98658c9ea42e_201908260940',
};

const BASE_URL = 'https://api.odcloud.kr/api/3036455/v1';

/**
 * 특정 연도의 기준시가 데이터를 페이지 단위로 조회
 * @param {string|number} year - 조회 연도
 * @param {number} page - 페이지 번호 (1부터)
 * @param {number} perPage - 페이지당 건수 (최대 1000)
 * @param {object} filter - 필터 옵션 { 법정동코드, 상가종류코드 }
 */
async function fetchBldStdPric(year, page = 1, perPage = 100, filter = {}) {
  const uddi = ENDPOINTS[year];
  if (!uddi) {
    throw new Error(`연도 ${year}의 엔드포인트가 없습니다. 활용신청이 필요할 수 있습니다.`);
  }

  const params = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    serviceKey: SERVICE_KEY,
  });

  // 필터 파라미터 추가 (cond[필드명]::EQ=값 형식)
  if (filter.법정동코드) params.append('cond[법정동코드::EQ]', filter.법정동코드);
  if (filter.상가종류코드) params.append('cond[상가종류코드::EQ]', filter.상가종류코드);
  if (filter.고시일자) params.append('cond[고시일자::EQ]', filter.고시일자);

  const url = `${BASE_URL}/${uddi}?${params}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

/**
 * 특정 연도의 전체 데이터 수집 (페이지 자동 순회)
 * @param {string|number} year - 조회 연도
 * @param {object} filter - 필터 옵션
 * @param {number} maxPages - 최대 수집 페이지 수 (0 = 전체)
 */
async function fetchAllPages(year, filter = {}, maxPages = 0) {
  const allData = [];
  let page = 1;
  let totalCount = null;

  while (true) {
    console.log(`[${year}] 페이지 ${page} 조회 중...`);
    const result = await fetchBldStdPric(year, page, 1000, filter);

    if (totalCount === null) {
      totalCount = result.totalCount;
      console.log(`[${year}] 전체 ${totalCount.toLocaleString()}건`);
    }

    allData.push(...result.data);

    const hasMore = allData.length < result.totalCount;
    const reachedMax = maxPages > 0 && page >= maxPages;

    if (!hasMore || reachedMax) break;
    page++;

    // 요청 과부하 방지
    await new Promise(r => setTimeout(r, 100));
  }

  return { totalCount, fetchedCount: allData.length, data: allData };
}

// ── 실행 예시 ──────────────────────────────────────────────

async function main() {
  // 예시 1: 2020년 데이터 첫 3건 조회
  console.log('\n=== 2020년 기준시가 샘플 조회 ===');
  const sample = await fetchBldStdPric(2020, 1, 3);
  console.log(`총 ${sample.totalCount.toLocaleString()}건`);
  console.table(sample.data);

  // 예시 2: 특정 법정동 필터 (서울 종로구 청운효자동 = 1111010700)
  console.log('\n=== 서울 종로구 청운효자동 상가 조회 ===');
  const filtered = await fetchBldStdPric(2020, 1, 10, {
    법정동코드: '1111010700',
    상가종류코드: '상가',
  });
  console.log(`해당 지역 ${filtered.totalCount.toLocaleString()}건`);
  console.table(filtered.data);

  // 예시 3: 2026년 데이터 (활용신청 완료 후 사용)
  // console.log('\n=== 2026년 기준시가 조회 ===');
  // const data2026 = await fetchBldStdPric(2026, 1, 10);
  // console.table(data2026.data);
}

main().catch(console.error);
