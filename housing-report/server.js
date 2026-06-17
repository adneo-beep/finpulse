import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// 설정
const CONFIG = {
  MOLIT_API_KEY: '5039af0d3b48f2540373d371810bec76d3ce3f1bdcd0c87532b348fa3d3c5f69',
  MOLIT_BASE_URL: 'https://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade',
  RBONE_API_KEY: '66acad414a424d12a853912b18d8b011',
  RBONE_BASE_URL: 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do',
  RBONE_SALE_ID: 'T244183132827305',   // (주) 매매가격지수
  RBONE_LEASE_ID: 'T247713133046872',  // (주) 전세가격지수
};

// 미들웨어
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 정적 파일 제공

console.log(`📁 정적 파일 경로: ${__dirname}`);

// ============================================================
// 🏘️ API 엔드포인트
// ============================================================

/**
 * ✅ GET /api/health
 * API 상태 확인
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: '🏘️ 부동산 시장동향 대시보드 API 서버 정상 운영 중'
  });
});

/**
 * ✅ GET /api/apartment/price-change
 * 한국부동산원 R-ONE API - 아파트 매매/전세 주간 가격변동율
 */
app.get('/api/apartment/price-change', async (req, res) => {
  try {
    console.log('\n📊 R-ONE 주간 가격변동율 조회 중...');

    // 현재 주차 계산 (YYYYWW 형식)
    function getWeekCode(date) {
      const d = new Date(date);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
      return String(d.getFullYear()) + String(week).padStart(2, '0');
    }

    // 매주 수요일 기준으로 주차 갱신: 가장 최근 수요일 - 3일 = 전주 일요일(데이터 기준일)
    // 수요일(6.11) → 6.8(24주), 다음 수요일(6.18) → 6.15(25주)
    const today = new Date();
    const daysFromWed = (today.getDay() + 7 - 3) % 7; // 0=수요일, 1=목요일, ..., 6=화요일
    const lastWednesday = new Date(today);
    lastWednesday.setDate(today.getDate() - daysFromWed);
    const latestBase = new Date(lastWednesday);
    latestBase.setDate(lastWednesday.getDate() - 3);
    const weeks = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(latestBase);
      d.setDate(latestBase.getDate() - i * 7);
      weeks.push(getWeekCode(d));
    }

    // 주요 지역 CLS_ID 매핑
    const regions = [
      { id: '50001', name: '전국' },
      { id: '50002', name: '수도권' },
      { id: '50003', name: '지방권' },
      { id: '50008', name: '서울' },
      { id: '50016', name: '경기' },
      { id: '50124', name: '인천' },
      { id: '50177', name: '강원' },
      { id: '50033', name: '세종' },
      { id: '50165', name: '대전' },
      { id: '50185', name: '충북' },
      { id: '50194', name: '충남' },
      { id: '50207', name: '전북' },
      { id: '50216', name: '전남' },
      { id: '50159', name: '광주' },
      { id: '50250', name: '제주' },
      { id: '50150', name: '대구' },
      { id: '50223', name: '경북' },
      { id: '50171', name: '울산' },
      { id: '50025', name: '부산' },
      { id: '50237', name: '경남' },
    ];

    const weekDateCache = {};
    async function fetchVal(statblId, week, clsId) {
      try {
        const r = await axios.get(CONFIG.RBONE_BASE_URL, {
          params: { STATBL_ID: statblId, DTACYCLE_CD: 'WK', apiKey: CONFIG.RBONE_API_KEY, WRTTIME_IDTFR_ID: week, CLS_ID: clsId },
          timeout: 8000
        });
        const xml = String(r.data);
        const valMatch = xml.match(/<DTA_VAL>([\d.]+)<\/DTA_VAL>/);
        const dateMatch = xml.match(/<WRTTIME_DESC>([^<]+)<\/WRTTIME_DESC>/);
        if (dateMatch && !weekDateCache[week]) weekDateCache[week] = dateMatch[1];
        return valMatch ? parseFloat(valMatch[1]) : null;
      } catch { return null; }
    }

    async function buildRows(statblId, categoryLabel) {
      const rows = [];
      // 모든 지역 × 5주 데이터 병렬 조회
      const allData = await Promise.all(
        regions.map(async region => {
          const vals = await Promise.all(weeks.map(w => fetchVal(statblId, w, region.id)));
          return { region, vals };
        })
      );

      // 전국 기준으로 변동률 계산
      const nationalData = allData.find(d => d.region.id === '50001');
      const latest = nationalData?.vals[4];
      const prev = nationalData?.vals[3];
      const nationalChange = (latest && prev) ? ((latest - prev) / prev * 100) : null;

      // TOP3: 시도 단위 지역 중 금주 변동율 상위 3개
      const top3 = allData
        .filter(d => !['50001', '50002', '50003'].includes(d.region.id))
        .map(d => {
          const cur = d.vals[4], pre = d.vals[3];
          const chg = (cur && pre) ? ((cur - pre) / pre * 100) : null;
          return { region: d.region.name, value: chg ? parseFloat(chg.toFixed(4)) : null };
        })
        .filter(d => d.value !== null)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 3);

      // 지역별 행 생성 (전국, 수도권, 지방권, 서울, 경기)
      for (const d of allData) {
        const trend = d.vals.slice(1).map((v, i) => {
          const pre = d.vals[i];
          return (v && pre) ? parseFloat(((v - pre) / pre * 100).toFixed(4)) : null;
        });
        // 전주비: 금주 변동율 - 전주 변동율 (trend[3] - trend[2])
        const weeklyChange = (trend[3] != null && trend[2] != null)
          ? parseFloat((trend[3] - trend[2]).toFixed(4))
          : null;

        rows.push({
          category: categoryLabel,
          name: `아파트 ${categoryLabel === '매매변동율' ? '매매' : '전세'} (${d.region.name})`,
          regionId: d.region.id,
          regionName: d.region.name,
          value: trend[3],       // 금주 변동율
          change: weeklyChange,  // 전주비 = 금주변동율 - 전주변동율
          trend,
          top3: d.region.id === '50001' ? top3 : []
        });
      }
      return rows;
    }

    const [saleRows, leaseRows] = await Promise.all([
      buildRows(CONFIG.RBONE_SALE_ID, '매매변동율'),
      buildRows(CONFIG.RBONE_LEASE_ID, '전세변동율'),
    ]);

    // 주차 레이블 및 날짜 (마지막 4주)
    const weekLabels = weeks.slice(1).map(w => `${w.slice(0,4)}년${w.slice(4)}주`);
    // 날짜: WRTTIME_DESC는 해당 주 기준일 → 다음주 월요일(발표일)
    const weekDates = weeks.slice(1).map(w => {
      const raw = weekDateCache[w];
      if (!raw) return '';
      const d = new Date(raw);
      return `${d.getMonth()+1}.${d.getDate()}`;
    });

    console.log(`✅ R-ONE 가격변동율 조회 완료: 매매 ${saleRows.length}행, 전세 ${leaseRows.length}행`);

    res.json({
      success: true,
      weeks: weekLabels,
      weekDates,
      latestWeek: weeks[4],
      baseDate: '2026.02.02 = 100.0',
      data: [...saleRows, ...leaseRows]
    });
  } catch (error) {
    console.error('❌ R-ONE 가격변동율 조회 오류:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ✅ GET /api/apartment/trades?region=11110&month=202605
 * 국토교통부 실거래가 API - 아파트 매매거래량
 * @param region 지역코드 (11110=서울, 41000=경기, 28000=인천)
 * @param month 거래년월 (YYYYMM)
 */
app.get('/api/apartment/trades', async (req, res) => {
  try {
    const { region = '11110', month = '202605' } = req.query;

    console.log(`\n📊 거래량 조회: 지역=${region}, 월=${month}`);

    const response = await axios.get(CONFIG.MOLIT_BASE_URL, {
      params: {
        serviceKey: CONFIG.MOLIT_API_KEY,
        LAWD_CD: region,
        DEAL_YM: month,
        pageNo: 1,
        numOfRows: 1000,
      },
      timeout: 10000
    });

    const items = response.data?.response?.body?.items?.item || [];
    console.log(`✅ 조회 결과: ${items.length}건`);

    // 거래 데이터를 주간별로 집계
    const weeklyData = aggregateByWeek(items);

    res.json({
      success: true,
      region,
      month,
      totalCount: items.length,
      weeklyData,
      rawData: items.slice(0, 10) // 첫 10건만 반환 (크기 최소화)
    });
  } catch (error) {
    console.error('❌ 거래량 조회 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: '거래량 데이터 조회 실패'
    });
  }
});

/**
 * ✅ GET /api/apartment/trades/weekly
 * 주간별 아파트 매매거래량 (모든 지역)
 * 자동 집계
 */
app.get('/api/apartment/trades/weekly', async (req, res) => {
  try {
    const { month = '202605' } = req.query;

    console.log(`\n📈 주간별 거래량 집계: 월=${month}`);

    // 주요 지역별 거래량 조회
    const regions = [
      { code: '11110', name: '서울' },
      { code: '41000', name: '경기' },
      { code: '28000', name: '인천' }
    ];

    const results = await Promise.all(
      regions.map(async (region) => {
        try {
          const response = await axios.get(CONFIG.MOLIT_BASE_URL, {
            params: {
              serviceKey: CONFIG.MOLIT_API_KEY,
              LAWD_CD: region.code,
              DEAL_YM: month,
              pageNo: 1,
              numOfRows: 1000,
            },
            timeout: 10000
          });

          const items = response.data?.response?.body?.items?.item || [];
          const weeklyData = aggregateByWeek(items);

          return {
            region: region.name,
            code: region.code,
            totalCount: items.length,
            weeklyData
          };
        } catch (error) {
          console.warn(`⚠️ ${region.name} 조회 실패:`, error.message);
          return {
            region: region.name,
            code: region.code,
            totalCount: 0,
            weeklyData: []
          };
        }
      })
    );

    res.json({
      success: true,
      month,
      regions: results
    });
  } catch (error) {
    console.error('❌ 주간별 거래량 집계 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      message: '주간별 거래량 집계 실패'
    });
  }
});

/**
 * ✅ POST /api/apartment/trades/batch
 * 여러 지역/월의 거래량 일괄 조회
 */
app.post('/api/apartment/trades/batch', async (req, res) => {
  try {
    const { queries = [] } = req.body;

    if (!Array.isArray(queries) || queries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'queries 배열이 필요합니다'
      });
    }

    console.log(`\n📋 일괄 거래량 조회: ${queries.length}건`);

    const results = await Promise.all(
      queries.map(async (query) => {
        try {
          const response = await axios.get(CONFIG.MOLIT_BASE_URL, {
            params: {
              serviceKey: CONFIG.MOLIT_API_KEY,
              LAWD_CD: query.region || '11110',
              DEAL_YM: query.month || '202605',
              pageNo: 1,
              numOfRows: 1000,
            },
            timeout: 10000
          });

          const items = response.data?.response?.body?.items?.item || [];
          const weeklyData = aggregateByWeek(items);

          return {
            region: query.region,
            month: query.month,
            success: true,
            totalCount: items.length,
            weeklyData
          };
        } catch (error) {
          return {
            region: query.region,
            month: query.month,
            success: false,
            error: error.message
          };
        }
      })
    );

    res.json({
      success: true,
      totalQueries: queries.length,
      results
    });
  } catch (error) {
    console.error('❌ 일괄 조회 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * ✅ GET /api/apartment/kb-sentiment
 * KB부동산 소비자 심리지수 (data-api.kbland.kr 실제 데이터)
 */
app.get('/api/apartment/kb-sentiment', async (req, res) => {
  try {
    console.log('\n📊 KB부동산 소비자 심리지수 조회 중...');

    const KB_BASE = 'https://data-api.kbland.kr/bfmstat/hrtIndx';
    const KB_HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.kbland.kr/' };

    // 1. 최신 기준일 조회 (주간)
    const latestRes = await axios.get(`${KB_BASE}/latestDate`, {
      params: { '매매전세코드': '01', '월간주간구분코드': '02', 'selectedTab': '0', 'period': '5', '탭구분코드': '0' },
      timeout: 8000, headers: KB_HEADERS
    });
    const latestDateStr = latestRes.data.dataBody.data.최종일자; // e.g. '2026-06-01'
    const latestDate = new Date(latestDateStr);

    // 2. 최근 5주 날짜 생성 (7일씩 거슬러 올라가기)
    const weekDates = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(latestDate);
      d.setDate(latestDate.getDate() - i * 7);
      weekDates.push(d);
    }
    // YYYYMMDD 형식
    const weekDateStrings = weekDates.map(d =>
      String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
    );
    // M.D 레이블 (마지막 4주)
    const kbWeekDates = weekDates.slice(1).map(d => `${d.getMonth() + 1}.${d.getDate()}`);

    // 3. 5주 × (매매+전세) 병렬 조회
    const commonParams = { '월간주간구분코드': '02', 'selectedTab': '0', 'period': '5', '탭구분코드': '0' };
    const [saleMonths, leaseMonths] = await Promise.all([
      Promise.all(weekDateStrings.map(ds => axios.get(`${KB_BASE}/areaHrtIndx`, {
        params: { ...commonParams, '매매전세코드': '01', '조회시작일자': ds, '조회종료일자': ds },
        timeout: 8000, headers: KB_HEADERS
      }).then(r => ({ month: ds, data: r.data.dataBody?.data || [] })).catch(() => ({ month: ds, data: [] })))),
      Promise.all(weekDateStrings.map(ds => axios.get(`${KB_BASE}/areaHrtIndx`, {
        params: { ...commonParams, '매매전세코드': '02', '조회시작일자': ds, '조회종료일자': ds },
        timeout: 8000, headers: KB_HEADERS
      }).then(r => ({ month: ds, data: r.data.dataBody?.data || [] })).catch(() => ({ month: ds, data: [] }))))
    ]);

    // 4. KB 법정동코드 → R-ONE regionId 매핑
    const KB_TO_RBONE = {
      '0000000000': '50001', '1100000000': '50008', '2600000000': '50025',
      '2700000000': '50150', '2800000000': '50124', '2900000000': '50159',
      '3000000000': '50165', '3100000000': '50171', '3600000000': '50033',
      '4100000000': '50016', '4300000000': '50185', '4400000000': '50194',
      '4600000000': '50216', '4700000000': '50223', '4800000000': '50237',
      '5000000000': '50250', '5100000000': '50177', '5200000000': '50207',
    };

    // 5. 지역별 × 지표별 데이터 빌드
    function buildIndicatorRows(monthDataArr, indicatorKey, categoryLabel) {
      // regionId → [val0, val1, val2, val3, val4]
      const byRegion = {};
      monthDataArr.forEach(({ month, data }, mIdx) => {
        data.forEach(item => {
          const rid = KB_TO_RBONE[item.법정동코드];
          if (!rid) return;
          if (!byRegion[rid]) byRegion[rid] = { regionId: rid, regionName: item.지역명, vals: [null, null, null, null, null] };
          byRegion[rid].vals[mIdx] = item[indicatorKey] ?? null;
        });
      });

      const rows = Object.values(byRegion).map(r => {
        const latest = r.vals[4];
        const prev = r.vals[3];
        const change = (latest != null && prev != null) ? parseFloat((latest - prev).toFixed(1)) : null;
        return {
          category: categoryLabel,
          regionId: r.regionId,
          regionName: r.regionName,
          value: latest,
          change,
          trend: r.vals.slice(1), // 마지막 4개월 값
        };
      });

      // TOP3: 전국 제외, 절댓값 기준
      const rankable = rows.filter(r => r.regionId !== '50001' && r.value != null)
        .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
        .slice(0, 3);
      const rankMap = {};
      rankable.forEach((r, i) => { rankMap[r.regionId] = i + 1; });
      rows.forEach(r => { r.rank = rankMap[r.regionId] || null; });

      return rows;
    }

    const data = [
      ...buildIndicatorRows(saleMonths, '매수우위지수', '매수우위지수'),
      ...buildIndicatorRows(saleMonths, '매매거래활발지수', '매매거래활발지수'),
      ...buildIndicatorRows(leaseMonths, '전세수급지수', '전세수급지수'),
      ...buildIndicatorRows(leaseMonths, '전세거래활발지수', '전세거래활발지수'),
    ];

    console.log(`✅ KB 소비자심리지수 조회 완료: ${data.length}행, 최신일: ${latestDateStr}`);

    res.json({
      success: true,
      kbWeekDates,        // M.D 형식 4주 날짜 (R-ONE weekDates와 매핑용)
      latestDate: latestDateStr,
      data
    });
  } catch (error) {
    console.error('❌ KB 심리지수 조회 오류:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ✅ GET /api/apartment/price-detail
 * 한국부동산원 R-ONE - 아파트 매매 주간 가격변동율 (시군구 세부)
 */
app.get('/api/apartment/price-detail', async (req, res) => {
  try {
    console.log('\n📊 R-ONE 시군구 매매 가격변동율 조회 중...');

    function getWeekCode(date) {
      const d = new Date(date);
      const jan1 = new Date(d.getFullYear(), 0, 1);
      const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
      return String(d.getFullYear()) + String(week).padStart(2, '0');
    }

    const today = new Date();
    const daysFromWed = (today.getDay() + 7 - 3) % 7;
    const lastWednesday = new Date(today);
    lastWednesday.setDate(today.getDate() - daysFromWed);
    const latestBase = new Date(lastWednesday);
    latestBase.setDate(lastWednesday.getDate() - 3);
    const weeks = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(latestBase);
      d.setDate(latestBase.getDate() - i * 7);
      weeks.push(getWeekCode(d));
    }

    // 전국 시군구 계층 구조
    const HIERARCHY = [
      { id: '50001', name: '전국',   level: 0 },
      { id: '50002', name: '수도권', level: 0 },
      { id: '50003', name: '지방권', level: 0 },
      // 서울
      { id: '50008', name: '서울', level: 1, sido: '서울' },
      { id: '50043', name: '종로구',   level: 2, sido: '서울' },
      { id: '50044', name: '중구',     level: 2, sido: '서울' },
      { id: '50045', name: '용산구',   level: 2, sido: '서울' },
      { id: '50047', name: '성동구',   level: 2, sido: '서울' },
      { id: '50048', name: '광진구',   level: 2, sido: '서울' },
      { id: '50049', name: '동대문구', level: 2, sido: '서울' },
      { id: '50050', name: '중랑구',   level: 2, sido: '서울' },
      { id: '50051', name: '성북구',   level: 2, sido: '서울' },
      { id: '50052', name: '강북구',   level: 2, sido: '서울' },
      { id: '50053', name: '도봉구',   level: 2, sido: '서울' },
      { id: '50054', name: '노원구',   level: 2, sido: '서울' },
      { id: '50056', name: '은평구',   level: 2, sido: '서울' },
      { id: '50057', name: '서대문구', level: 2, sido: '서울' },
      { id: '50058', name: '마포구',   level: 2, sido: '서울' },
      { id: '50060', name: '양천구',   level: 2, sido: '서울' },
      { id: '50061', name: '강서구',   level: 2, sido: '서울' },
      { id: '50062', name: '구로구',   level: 2, sido: '서울' },
      { id: '50063', name: '금천구',   level: 2, sido: '서울' },
      { id: '50064', name: '영등포구', level: 2, sido: '서울' },
      { id: '50065', name: '동작구',   level: 2, sido: '서울' },
      { id: '50066', name: '관악구',   level: 2, sido: '서울' },
      { id: '50067', name: '서초구',   level: 2, sido: '서울' },
      { id: '50068', name: '강남구',   level: 2, sido: '서울' },
      { id: '50069', name: '송파구',   level: 2, sido: '서울' },
      { id: '50070', name: '강동구',   level: 2, sido: '서울' },
      // 경기
      { id: '50016', name: '경기', level: 1, sido: '경기' },
      { id: '50071', name: '과천시',   level: 2, sido: '경기' },
      { id: '50072', name: '안양시',   level: 2, sido: '경기' },
      { id: '50073', name: '만안구',   level: 3, sido: '경기', parent: '안양시' },
      { id: '50074', name: '동안구',   level: 3, sido: '경기', parent: '안양시' },
      { id: '50075', name: '군포시',   level: 2, sido: '경기' },
      { id: '50076', name: '의왕시',   level: 2, sido: '경기' },
      { id: '50077', name: '성남시',   level: 2, sido: '경기' },
      { id: '50078', name: '수정구',   level: 3, sido: '경기', parent: '성남시' },
      { id: '50079', name: '중원구',   level: 3, sido: '경기', parent: '성남시' },
      { id: '50080', name: '분당구',   level: 3, sido: '경기', parent: '성남시' },
      { id: '50081', name: '안성시',   level: 2, sido: '경기' },
      { id: '50083', name: '수원시',   level: 2, sido: '경기' },
      { id: '50084', name: '장안구',   level: 3, sido: '경기', parent: '수원시' },
      { id: '50085', name: '권선구',   level: 3, sido: '경기', parent: '수원시' },
      { id: '50086', name: '팔달구',   level: 3, sido: '경기', parent: '수원시' },
      { id: '50087', name: '영통구',   level: 3, sido: '경기', parent: '수원시' },
      { id: '50088', name: '용인시',   level: 2, sido: '경기' },
      { id: '50089', name: '처인구',   level: 3, sido: '경기', parent: '용인시' },
      { id: '50090', name: '기흥구',   level: 3, sido: '경기', parent: '용인시' },
      { id: '50091', name: '수지구',   level: 3, sido: '경기', parent: '용인시' },
      { id: '50093', name: '부천시',   level: 2, sido: '경기' },
      { id: '50094', name: '원미구',   level: 3, sido: '경기', parent: '부천시' },
      { id: '50095', name: '소사구',   level: 3, sido: '경기', parent: '부천시' },
      { id: '50096', name: '오정구',   level: 3, sido: '경기', parent: '부천시' },
      { id: '50097', name: '광명시',   level: 2, sido: '경기' },
      { id: '50098', name: '평택시',   level: 2, sido: '경기' },
      { id: '50099', name: '안산시',   level: 2, sido: '경기' },
      { id: '50100', name: '상록구',   level: 3, sido: '경기', parent: '안산시' },
      { id: '50101', name: '단원구',   level: 3, sido: '경기', parent: '안산시' },
      { id: '50102', name: '오산시',   level: 2, sido: '경기' },
      { id: '50103', name: '시흥시',   level: 2, sido: '경기' },
      { id: '50104', name: '화성시',   level: 2, sido: '경기' },
      { id: '50256', name: '만세구',   level: 3, sido: '경기', parent: '화성시' },
      { id: '50257', name: '효행구',   level: 3, sido: '경기', parent: '화성시' },
      { id: '50258', name: '병점구',   level: 3, sido: '경기', parent: '화성시' },
      { id: '50259', name: '동탄구',   level: 3, sido: '경기', parent: '화성시' },
      { id: '50106', name: '구리시',   level: 2, sido: '경기' },
      { id: '50107', name: '남양주시', level: 2, sido: '경기' },
      { id: '50108', name: '하남시',   level: 2, sido: '경기' },
      { id: '50109', name: '광주시',   level: 2, sido: '경기' },
      { id: '50111', name: '이천시',   level: 2, sido: '경기' },
      { id: '50112', name: '여주시',   level: 2, sido: '경기' },
      { id: '50114', name: '고양시',   level: 2, sido: '경기' },
      { id: '50115', name: '덕양구',   level: 3, sido: '경기', parent: '고양시' },
      { id: '50116', name: '일산동구', level: 3, sido: '경기', parent: '고양시' },
      { id: '50117', name: '일산서구', level: 3, sido: '경기', parent: '고양시' },
      { id: '50118', name: '김포시',   level: 2, sido: '경기' },
      { id: '50120', name: '의정부시', level: 2, sido: '경기' },
      { id: '50121', name: '동두천시', level: 2, sido: '경기' },
      { id: '50122', name: '양주시',   level: 2, sido: '경기' },
      { id: '50123', name: '포천시',   level: 2, sido: '경기' },
      { id: '50253', name: '파주시',   level: 2, sido: '경기' },
      // 인천
      { id: '50124', name: '인천', level: 1, sido: '인천' },
      { id: '50125', name: '중구',     level: 2, sido: '인천' },
      { id: '50126', name: '동구',     level: 2, sido: '인천' },
      { id: '50127', name: '연수구',   level: 2, sido: '인천' },
      { id: '50128', name: '남동구',   level: 2, sido: '인천' },
      { id: '50129', name: '부평구',   level: 2, sido: '인천' },
      { id: '50130', name: '계양구',   level: 2, sido: '인천' },
      { id: '50131', name: '서구',     level: 2, sido: '인천' },
      { id: '50254', name: '미추홀구', level: 2, sido: '인천' },
      // 강원
      { id: '50177', name: '강원', level: 1, sido: '강원' },
      { id: '50178', name: '춘천시', level: 2, sido: '강원' },
      { id: '50179', name: '원주시', level: 2, sido: '강원' },
      { id: '50180', name: '강릉시', level: 2, sido: '강원' },
      { id: '50181', name: '동해시', level: 2, sido: '강원' },
      { id: '50182', name: '태백시', level: 2, sido: '강원' },
      { id: '50183', name: '속초시', level: 2, sido: '강원' },
      { id: '50184', name: '삼척시', level: 2, sido: '강원' },
      // 세종
      { id: '50033', name: '세종', level: 1, sido: '세종' },
      // 대전
      { id: '50165', name: '대전', level: 1, sido: '대전' },
      { id: '50166', name: '동구',   level: 2, sido: '대전' },
      { id: '50167', name: '중구',   level: 2, sido: '대전' },
      { id: '50168', name: '서구',   level: 2, sido: '대전' },
      { id: '50169', name: '유성구', level: 2, sido: '대전' },
      { id: '50170', name: '대덕구', level: 2, sido: '대전' },
      // 충북
      { id: '50185', name: '충북', level: 1, sido: '충북' },
      { id: '50186', name: '청주시', level: 2, sido: '충북' },
      { id: '50187', name: '상당구', level: 3, sido: '충북', parent: '청주시' },
      { id: '50188', name: '서원구', level: 3, sido: '충북', parent: '청주시' },
      { id: '50189', name: '흥덕구', level: 3, sido: '충북', parent: '청주시' },
      { id: '50190', name: '청원구', level: 3, sido: '충북', parent: '청주시' },
      { id: '50191', name: '충주시', level: 2, sido: '충북' },
      { id: '50192', name: '제천시', level: 2, sido: '충북' },
      { id: '50193', name: '음성군', level: 2, sido: '충북' },
      // 충남
      { id: '50194', name: '충남', level: 1, sido: '충남' },
      { id: '50195', name: '천안시', level: 2, sido: '충남' },
      { id: '50196', name: '동남구', level: 3, sido: '충남', parent: '천안시' },
      { id: '50197', name: '서북구', level: 3, sido: '충남', parent: '천안시' },
      { id: '50198', name: '공주시', level: 2, sido: '충남' },
      { id: '50199', name: '보령시', level: 2, sido: '충남' },
      { id: '50200', name: '아산시', level: 2, sido: '충남' },
      { id: '50201', name: '서산시', level: 2, sido: '충남' },
      { id: '50202', name: '논산시', level: 2, sido: '충남' },
      { id: '50203', name: '계룡시', level: 2, sido: '충남' },
      { id: '50204', name: '당진시', level: 2, sido: '충남' },
      { id: '50205', name: '홍성군', level: 2, sido: '충남' },
      { id: '50206', name: '예산군', level: 2, sido: '충남' },
      // 전북
      { id: '50207', name: '전북', level: 1, sido: '전북' },
      { id: '50208', name: '전주시', level: 2, sido: '전북' },
      { id: '50209', name: '완산구', level: 3, sido: '전북', parent: '전주시' },
      { id: '50210', name: '덕진구', level: 3, sido: '전북', parent: '전주시' },
      { id: '50211', name: '군산시', level: 2, sido: '전북' },
      { id: '50212', name: '익산시', level: 2, sido: '전북' },
      { id: '50213', name: '정읍시', level: 2, sido: '전북' },
      { id: '50214', name: '남원시', level: 2, sido: '전북' },
      { id: '50215', name: '김제시', level: 2, sido: '전북' },
      // 전남
      { id: '50216', name: '전남', level: 1, sido: '전남' },
      { id: '50217', name: '목포시', level: 2, sido: '전남' },
      { id: '50218', name: '여수시', level: 2, sido: '전남' },
      { id: '50219', name: '순천시', level: 2, sido: '전남' },
      { id: '50220', name: '나주시', level: 2, sido: '전남' },
      { id: '50221', name: '광양시', level: 2, sido: '전남' },
      { id: '50222', name: '무안군', level: 2, sido: '전남' },
      // 광주
      { id: '50159', name: '광주', level: 1, sido: '광주' },
      { id: '50160', name: '동구',   level: 2, sido: '광주' },
      { id: '50161', name: '서구',   level: 2, sido: '광주' },
      { id: '50162', name: '남구',   level: 2, sido: '광주' },
      { id: '50163', name: '북구',   level: 2, sido: '광주' },
      { id: '50164', name: '광산구', level: 2, sido: '광주' },
      // 제주
      { id: '50250', name: '제주', level: 1, sido: '제주' },
      { id: '50251', name: '제주시',   level: 2, sido: '제주' },
      { id: '50252', name: '서귀포시', level: 2, sido: '제주' },
      // 대구
      { id: '50150', name: '대구', level: 1, sido: '대구' },
      { id: '50151', name: '중구',   level: 2, sido: '대구' },
      { id: '50152', name: '동구',   level: 2, sido: '대구' },
      { id: '50153', name: '서구',   level: 2, sido: '대구' },
      { id: '50154', name: '남구',   level: 2, sido: '대구' },
      { id: '50155', name: '북구',   level: 2, sido: '대구' },
      { id: '50156', name: '수성구', level: 2, sido: '대구' },
      { id: '50157', name: '달서구', level: 2, sido: '대구' },
      { id: '50158', name: '달성군', level: 2, sido: '대구' },
      // 경북
      { id: '50223', name: '경북', level: 1, sido: '경북' },
      { id: '50224', name: '포항시', level: 2, sido: '경북' },
      { id: '50225', name: '남구',   level: 3, sido: '경북', parent: '포항시' },
      { id: '50226', name: '북구',   level: 3, sido: '경북', parent: '포항시' },
      { id: '50227', name: '경주시', level: 2, sido: '경북' },
      { id: '50228', name: '김천시', level: 2, sido: '경북' },
      { id: '50229', name: '안동시', level: 2, sido: '경북' },
      { id: '50230', name: '구미시', level: 2, sido: '경북' },
      { id: '50231', name: '영주시', level: 2, sido: '경북' },
      { id: '50232', name: '영천시', level: 2, sido: '경북' },
      { id: '50233', name: '상주시', level: 2, sido: '경북' },
      { id: '50234', name: '문경시', level: 2, sido: '경북' },
      { id: '50235', name: '경산시', level: 2, sido: '경북' },
      { id: '50236', name: '칠곡군', level: 2, sido: '경북' },
      // 울산
      { id: '50171', name: '울산', level: 1, sido: '울산' },
      { id: '50172', name: '중구',   level: 2, sido: '울산' },
      { id: '50173', name: '남구',   level: 2, sido: '울산' },
      { id: '50174', name: '동구',   level: 2, sido: '울산' },
      { id: '50175', name: '북구',   level: 2, sido: '울산' },
      { id: '50176', name: '울주군', level: 2, sido: '울산' },
      // 부산
      { id: '50025', name: '부산', level: 1, sido: '부산' },
      { id: '50132', name: '중구',     level: 2, sido: '부산' },
      { id: '50133', name: '서구',     level: 2, sido: '부산' },
      { id: '50134', name: '동구',     level: 2, sido: '부산' },
      { id: '50135', name: '영도구',   level: 2, sido: '부산' },
      { id: '50136', name: '남구',     level: 2, sido: '부산' },
      { id: '50137', name: '부산진구', level: 2, sido: '부산' },
      { id: '50138', name: '연제구',   level: 2, sido: '부산' },
      { id: '50139', name: '수영구',   level: 2, sido: '부산' },
      { id: '50141', name: '동래구',   level: 2, sido: '부산' },
      { id: '50142', name: '해운대구', level: 2, sido: '부산' },
      { id: '50143', name: '금정구',   level: 2, sido: '부산' },
      { id: '50144', name: '기장군',   level: 2, sido: '부산' },
      { id: '50146', name: '북구',     level: 2, sido: '부산' },
      { id: '50147', name: '사하구',   level: 2, sido: '부산' },
      { id: '50148', name: '강서구',   level: 2, sido: '부산' },
      { id: '50149', name: '사상구',   level: 2, sido: '부산' },
      // 경남
      { id: '50237', name: '경남', level: 1, sido: '경남' },
      { id: '50238', name: '창원시',   level: 2, sido: '경남' },
      { id: '50239', name: '의창구',   level: 3, sido: '경남', parent: '창원시' },
      { id: '50240', name: '성산구',   level: 3, sido: '경남', parent: '창원시' },
      { id: '50241', name: '마산합포구', level: 3, sido: '경남', parent: '창원시' },
      { id: '50242', name: '마산회원구', level: 3, sido: '경남', parent: '창원시' },
      { id: '50243', name: '진해구',   level: 3, sido: '경남', parent: '창원시' },
      { id: '50244', name: '통영시',   level: 2, sido: '경남' },
      { id: '50245', name: '사천시',   level: 2, sido: '경남' },
      { id: '50246', name: '김해시',   level: 2, sido: '경남' },
      { id: '50247', name: '밀양시',   level: 2, sido: '경남' },
      { id: '50248', name: '거제시',   level: 2, sido: '경남' },
      { id: '50249', name: '양산시',   level: 2, sido: '경남' },
      { id: '50255', name: '진주시',   level: 2, sido: '경남' },
    ];

    const weekDateCache = {};
    async function fetchVal(clsId, week) {
      try {
        const r = await axios.get(CONFIG.RBONE_BASE_URL, {
          params: { STATBL_ID: CONFIG.RBONE_SALE_ID, DTACYCLE_CD: 'WK', apiKey: CONFIG.RBONE_API_KEY, WRTTIME_IDTFR_ID: week, CLS_ID: clsId },
          timeout: 10000
        });
        const xml = String(r.data);
        const valMatch = xml.match(/<DTA_VAL>([\d.]+)<\/DTA_VAL>/);
        const dateMatch = xml.match(/<WRTTIME_DESC>([^<]+)<\/WRTTIME_DESC>/);
        if (dateMatch && !weekDateCache[week]) weekDateCache[week] = dateMatch[1];
        return valMatch ? parseFloat(valMatch[1]) : null;
      } catch { return null; }
    }

    // 전체 지역 × 5주 데이터 병렬 조회 (배치 처리)
    const BATCH = 30;
    const allData = [];
    for (let b = 0; b < HIERARCHY.length; b += BATCH) {
      const batch = HIERARCHY.slice(b, b + BATCH);
      const batchResults = await Promise.all(
        batch.map(async region => {
          const vals = await Promise.all(weeks.map(w => fetchVal(region.id, w)));
          const trend = vals.slice(1).map((v, i) => {
            const pre = vals[i];
            return (v && pre) ? parseFloat(((v - pre) / pre * 100).toFixed(4)) : null;
          });
          const weeklyChange = (trend[3] != null && trend[2] != null)
            ? parseFloat((trend[3] - trend[2]).toFixed(4))
            : null;
          return { ...region, trend, change: weeklyChange, value: trend[3] };
        })
      );
      allData.push(...batchResults);
    }

    const weekLabels = weeks.slice(1).map(w => `${w.slice(0,4)}년${w.slice(4)}주`);
    const weekDates = weeks.slice(1).map(w => {
      const raw = weekDateCache[w];
      if (!raw) return '';
      const d = new Date(raw);
      return `${d.getMonth()+1}.${d.getDate()}`;
    });

    console.log(`✅ R-ONE 시군구 조회 완료: ${allData.length}개 지역`);
    res.json({ success: true, weeks: weekLabels, weekDates, data: allData });
  } catch (error) {
    console.error('❌ R-ONE 시군구 조회 오류:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ✅ GET /api/apartment/kb-breakdown
 * KB부동산 소비자 심리지수 - 지역별 세부 구성 비율 (매수자많음/비슷함/매도자많음 등)
 */
app.get('/api/apartment/kb-breakdown', async (req, res) => {
  try {
    console.log('\n📊 KB부동산 세부 심리지수 조회 중...');

    const KB_BASE = 'https://data-api.kbland.kr/bfmstat/hrtIndx';
    const KB_HEADERS = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.kbland.kr/' };

    // 지역 코드 목록 (법정동코드 → 이름)
    const REGIONS = [
      { code: '0000000000', name: '전국' },
      { code: '1100000000', name: '서울' },
      { code: '2600000000', name: '부산' },
      { code: '2700000000', name: '대구' },
      { code: '2800000000', name: '인천' },
      { code: '2900000000', name: '광주' },
      { code: '3000000000', name: '대전' },
      { code: '3100000000', name: '울산' },
      { code: '3600000000', name: '세종' },
      { code: '4100000000', name: '경기' },
      { code: '4300000000', name: '충북' },
      { code: '4400000000', name: '충남' },
      { code: '4600000000', name: '전남' },
      { code: '4700000000', name: '경북' },
      { code: '4800000000', name: '경남' },
      { code: '5000000000', name: '제주' },
      { code: '5100000000', name: '강원' },
      { code: '5200000000', name: '전북' },
    ];

    // 1. 최신 기준일 조회 (주간)
    const latestRes = await axios.get(`${KB_BASE}/latestDate`, {
      params: { '매매전세코드': '01', '월간주간구분코드': '02', 'selectedTab': '0', 'period': '5', '탭구분코드': '0' },
      timeout: 8000, headers: KB_HEADERS
    });
    const latestDateStr = latestRes.data.dataBody.data.최종일자;
    const latestDate = new Date(latestDateStr);

    // 2. 최근 5주 날짜 생성
    const weekDates = [];
    for (let i = 4; i >= 0; i--) {
      const d = new Date(latestDate);
      d.setDate(latestDate.getDate() - i * 7);
      weekDates.push(d);
    }
    const weekDateStrings = weekDates.map(d =>
      String(d.getFullYear()) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0')
    );
    const kbWeekDates = weekDates.slice(1).map(d => `${d.getMonth() + 1}.${d.getDate()}`);

    // 3. 지역 × 주간 × 지표(매매/전세) 세부 데이터 병렬 조회
    // trmSppsIndx: 매매전세코드=01 → {매도자많음, 비슷함, 매수자많음}
    //              매매전세코드=02 → {공급충분, 적절, 공급부족}
    const fetchBreakdown = async (code, regionCode, dateStr) => {
      try {
        const r = await axios.get(`${KB_BASE}/trmSppsIndx`, {
          params: { '매매전세코드': code, '월간주간구분코드': '02', '법정동코드': regionCode, '기준날짜': dateStr },
          timeout: 8000, headers: KB_HEADERS
        });
        const stack = r.data?.dataBody?.data?.stack || [];
        // Find entry matching the date
        const target = stack.find(s => s.기준날짜 === `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`);
        return target || null;
      } catch { return null; }
    };

    // trmTranIndx: 매매전세코드=01 → {활발함, 보통, 한산함} (매매거래활발지수 세부)
    //              매매전세코드=02 → {활발함, 보통, 한산함} (전세거래활발지수 세부)
    const fetchTranBreakdown = async (code, regionCode, dateStr) => {
      try {
        const r = await axios.get(`${KB_BASE}/trmTranIndx`, {
          params: { '매매전세코드': code, '월간주간구분코드': '02', '법정동코드': regionCode, '기준날짜': dateStr },
          timeout: 8000, headers: KB_HEADERS
        });
        const stack = r.data?.dataBody?.data?.stack || [];
        const target = stack.find(s => s.기준날짜 === `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`);
        return target || null;
      } catch { return null; }
    };

    // Parallel: all regions × all weeks × (trmSppsIndx 매매+전세) × (trmTranIndx 매매+전세)
    const allResults = await Promise.all(
      REGIONS.map(async region => {
        const [saleWeeks, leaseWeeks, saleTranWeeks, leaseTranWeeks] = await Promise.all([
          Promise.all(weekDateStrings.map(ds => fetchBreakdown('01', region.code, ds))),
          Promise.all(weekDateStrings.map(ds => fetchBreakdown('02', region.code, ds))),
          Promise.all(weekDateStrings.map(ds => fetchTranBreakdown('01', region.code, ds))),
          Promise.all(weekDateStrings.map(ds => fetchTranBreakdown('02', region.code, ds))),
        ]);
        return { region, saleWeeks, leaseWeeks, saleTranWeeks, leaseTranWeeks };
      })
    );

    // 4. 지표별로 데이터 구조화
    const buildBreakdownRows = (allResults, type) => {
      const indicators = type === 'sale'
        ? [
            { key: '매수자많음', label: '매수자많음', weekKey: 'saleWeeks' },
            { key: '비슷함',     label: '비슷함',     weekKey: 'saleWeeks' },
            { key: '매도자많음', label: '매도자많음', weekKey: 'saleWeeks' },
          ]
        : type === 'saleTran'
        ? [
            { key: '활발함', label: '활발함', weekKey: 'saleTranWeeks' },
            { key: '보통',   label: '보통',   weekKey: 'saleTranWeeks' },
            { key: '한산함', label: '한산함', weekKey: 'saleTranWeeks' },
          ]
        : type === 'lease'
        ? [
            { key: '공급충분', label: '공급충분', weekKey: 'leaseWeeks' },
            { key: '적절',     label: '적절',     weekKey: 'leaseWeeks' },
            { key: '공급부족', label: '공급부족', weekKey: 'leaseWeeks' },
          ]
        : [ // leaseTran
            { key: '활발함', label: '활발함', weekKey: 'leaseTranWeeks' },
            { key: '보통',   label: '보통',   weekKey: 'leaseTranWeeks' },
            { key: '한산함', label: '한산함', weekKey: 'leaseTranWeeks' },
          ];

      return indicators.map(ind => ({
        label: ind.label,
        regions: allResults.map(row => {
          const weekData = row[ind.weekKey];
          const vals = weekData.map(w => w?.[ind.key] ?? null);
          const latest = vals[4];
          const prev = vals[3];
          const change = (latest != null && prev != null) ? parseFloat((latest - prev).toFixed(1)) : null;
          return {
            regionCode: row.region.code,
            regionName: row.region.name,
            trend: vals.slice(1),
            value: latest,
            change,
          };
        })
      }));
    };

    const saleBreakdown   = buildBreakdownRows(allResults, 'sale');
    const saleTranBreakdown = buildBreakdownRows(allResults, 'saleTran');
    const leaseBreakdown  = buildBreakdownRows(allResults, 'lease');
    const leaseTranBreakdown = buildBreakdownRows(allResults, 'leaseTran');

    console.log(`✅ KB 세부 심리지수 조회 완료: ${REGIONS.length}개 지역, 최신일: ${latestDateStr}`);

    res.json({
      success: true,
      kbWeekDates,
      latestDate: latestDateStr,
      regions: REGIONS.map(r => ({ code: r.code, name: r.name })),
      saleBreakdown,
      saleTranBreakdown,
      leaseBreakdown,
      leaseTranBreakdown,
    });
  } catch (error) {
    console.error('❌ KB 세부 심리지수 조회 오류:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * ✅ GET /api/apartment/summary
 * 대시보드 요약 데이터 (가격 + 거래량 + 심리지수)
 */
app.get('/api/apartment/summary', async (req, res) => {
  try {
    const { month = '202605' } = req.query;

    console.log(`\n📊 대시보드 요약 데이터 조회: ${month}`);

    // 병렬 로드
    const [trades, sentiment] = await Promise.all([
      axios.get(`${req.protocol}://${req.get('host')}/api/apartment/trades/weekly?month=${month}`)
        .then(r => r.data)
        .catch(() => ({ success: false })),
      axios.get(`${req.protocol}://${req.get('host')}/api/apartment/kb-sentiment`)
        .then(r => r.data)
        .catch(() => ({ success: false }))
    ]);

    res.json({
      success: true,
      month,
      data: {
        trades,
        sentiment,
        note: '✅ 가격지수는 R-ONE API, 심리지수는 KB부동산에서 실시간 로드'
      }
    });
  } catch (error) {
    console.error('❌ 요약 데이터 조회 오류:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// 🔧 유틸리티 함수
// ============================================================

/**
 * KB부동산 심리지수 데이터 파싱 (실제 데이터만)
 */
function parseKBSentimentData(data) {
  if (!data) {
    throw new Error('KB부동산 API 응답 데이터가 없습니다');
  }

  try {
    // KB API 응답 구조 분석 및 변환
    const sentiment = {
      marketSentiment: {
        name: '부동산 매수심리지수',
        value: data.marketSentix?.latest?.value,
        change: data.marketSentix?.latest?.change,
        direction: (data.marketSentix?.latest?.change || 0) > 0 ? 'up' : 'down',
        trend: data.marketSentix?.weeklyTrend || [],
        top3: data.marketSentix?.topRegions || []
      },
      tradingActivity: {
        name: '부동산 매매거래활발지수',
        value: data.tradingActInx?.latest?.value,
        change: data.tradingActInx?.latest?.change,
        direction: (data.tradingActInx?.latest?.change || 0) > 0 ? 'up' : 'down',
        trend: data.tradingActInx?.weeklyTrend || [],
        top3: data.tradingActInx?.topRegions || []
      },
      leaseSupply: {
        name: '부동산 전세수급지수',
        value: data.leaseSupplyInx?.latest?.value,
        change: data.leaseSupplyInx?.latest?.change,
        direction: (data.leaseSupplyInx?.latest?.change || 0) > 0 ? 'up' : 'down',
        trend: data.leaseSupplyInx?.weeklyTrend || [],
        top3: data.leaseSupplyInx?.topRegions || []
      },
      timestamp: new Date().toISOString()
    };

    return sentiment;
  } catch (error) {
    console.error('❌ KB 데이터 파싱 오류:', error.message);
    throw error;
  }
}

/**
 * 거래 데이터를 주간별로 집계
 * @param items 거래 항목 배열
 * @returns {Array} 주간별 집계된 데이터
 */
function aggregateByWeek(items = []) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  const weeklyMap = {};

  items.forEach(item => {
    const dealDate = item.dealMonth || item.dealYm;
    if (!dealDate) return;

    try {
      // YYYYMMDD 또는 YYYYMM 형식 처리
      let year, month, day;

      if (dealDate.length === 8) {
        // YYYYMMDD
        year = parseInt(dealDate.slice(0, 4));
        month = parseInt(dealDate.slice(4, 6));
        day = parseInt(dealDate.slice(6, 8));
      } else if (dealDate.length === 6) {
        // YYYYMM
        year = parseInt(dealDate.slice(0, 4));
        month = parseInt(dealDate.slice(4, 6));
        day = 15; // 중간값
      } else {
        return;
      }

      const date = new Date(year, month - 1, day);
      const weekNum = Math.ceil(date.getDate() / 7);
      const weekKey = `${year}-${String(month).padStart(2, '0')}-W${weekNum}`;

      if (!weeklyMap[weekKey]) {
        weeklyMap[weekKey] = {
          week: weekKey,
          count: 0,
          avgPrice: 0,
          minPrice: Infinity,
          maxPrice: -Infinity,
          items: []
        };
      }

      weeklyMap[weekKey].count++;
      weeklyMap[weekKey].items.push(item);

      // 가격 통계
      const price = parseInt(item.dealPrice || 0);
      if (price > 0) {
        weeklyMap[weekKey].minPrice = Math.min(weeklyMap[weekKey].minPrice, price);
        weeklyMap[weekKey].maxPrice = Math.max(weeklyMap[weekKey].maxPrice, price);
      }
    } catch (e) {
      console.warn('⚠️ 데이터 파싱 오류:', dealDate, e.message);
    }
  });

  // 결과 정렬 및 반환
  return Object.values(weeklyMap)
    .map(week => ({
      ...week,
      minPrice: week.minPrice === Infinity ? 0 : week.minPrice,
      maxPrice: week.maxPrice === -Infinity ? 0 : week.maxPrice,
      items: [] // 응답 크기 최소화를 위해 items 제거
    }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

// ============================================================
// 🏦 아파트담보대출 금리표 스크래핑
// ============================================================

let ratesCache = null;
let ratesCacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10분

app.get('/api/loan-rates', async (req, res) => {
  try {
    const now = Date.now();
    if (ratesCache && (now - ratesCacheTime) < CACHE_TTL) {
      return res.json(ratesCache);
    }

    console.log('\n🏦 아파트담보대출 금리표 스크래핑 시작...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    await page.goto('https://findsr.kr/new1/product.html', { waitUntil: 'domcontentloaded', timeout: 20000 });

    // 목록에서 아파트담보대출 금리표 행 수집
    const rows = await page.evaluate(() => {
      const results = [];
      document.querySelectorAll('tr').forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length < 4) return;
        const title = cells[1]?.textContent?.trim() || '';
        const date = cells[3]?.textContent?.trim() || '';
        if (title.includes('아파트담보대출') && title.includes('금리표') && !title.includes('[공지]')) {
          // onclick 또는 data 속성에서 게시물 id 추출
          const clickEl = cells[1].querySelector('[onclick]');
          const onclick = clickEl?.getAttribute('onclick') || '';
          const idMatch = onclick.match(/\d{5,}/);
          results.push({ title, date, id: idMatch ? idMatch[0] : null });
        }
      });
      return results;
    });

    console.log(`📋 발견된 금리표 수: ${rows.length}`);

    if (rows.length === 0) {
      // 첫 번째 아파트담보대출 텍스트를 포함한 링크로 직접 클릭 시도
      const link = page.getByText('아파트담보대출 금리표').first();
      await link.click();
    } else {
      const latest = rows.sort((a, b) => b.date.localeCompare(a.date))[0];
      console.log(`📋 최신 금리표: ${latest.title} (${latest.date})`);

      if (latest.id) {
        await page.goto(`https://findsr.kr/new1/board_ver3_view.html?id=${latest.id}`, {
          waitUntil: 'domcontentloaded', timeout: 20000
        });
      } else {
        await page.getByText(latest.title).first().click();
      }
    }

    await page.waitForLoadState('domcontentloaded');

    const postTitle = await page.evaluate(() => document.querySelector('h4')?.textContent?.trim() || document.title);
    const postDate = rows.length > 0 ? rows[0].date : new Date().toLocaleDateString('ko-KR');

    // 이미지 URL 수집 (qnafile 경로 우선)
    const imgUrls = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('img'))
        .map(img => img.src)
        .filter(src => src && src.includes('qnafile'));
    });

    const fallbackUrls = imgUrls.length === 0 ? await page.evaluate(() => {
      return Array.from(document.querySelectorAll('figure img, .content img, article img'))
        .map(img => img.src)
        .filter(src => src && !src.includes('logo') && !src.includes('icon'));
    }) : [];

    await browser.close();

    const allImgUrls = imgUrls.length > 0 ? imgUrls : fallbackUrls;

    const result = {
      success: true,
      title: postTitle,
      date: postDate,
      images: allImgUrls,
      fetchedAt: new Date().toISOString()
    };

    ratesCache = result;
    ratesCacheTime = now;
    console.log(`✅ 금리표 스크래핑 완료: 이미지 ${allImgUrls.length}개`);
    res.json(result);
  } catch (error) {
    console.error('❌ 금리표 스크래핑 오류:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 🏦 금리표 파싱 (Claude Vision)
// ============================================================

let parsedCache = null;
let parsedCacheTime = 0;

// Google Cloud Vision OCR → 금리 데이터 구조화
async function parseRateImageWithVision(base64, apiKey) {
  const visionRes = await axios.post(
    `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
    {
      requests: [{
        image: { content: base64 },
        features: [{ type: 'TEXT_DETECTION', maxResults: 1 }]
      }]
    }
  );

  const fullText = visionRes.data.responses?.[0]?.fullTextAnnotation?.text || '';
  if (!fullText) throw new Error('OCR 텍스트 추출 실패');

  return structureRateText(fullText);
}

// OCR 텍스트를 은행별 금리 데이터로 구조화
function structureRateText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // 금리 패턴: 숫자.숫자숫자 (예: 4.49, 5.00)
  const ratePattern = /^\d+\.\d+$/;
  // 금리유형 키워드
  const typeKeywords = ['3개월', '6개월', '1년', '2년', '3년', '5년주기', '5년(수기)', '5년', '혼합형', '고정'];
  // 은행명 키워드
  const bankKeywords = ['국민', '신한', '우리', '하나', '농협', 'NH', '기업', 'IBK', '부산', 'BNK', 'KB', '경남', '전북', '광주'];

  const banks = [];
  let currentBank = null;
  let currentRates = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 은행명 감지
    const isBankLine = bankKeywords.some(k => line.includes(k)) &&
      !ratePattern.test(line) && line.length < 20;

    if (isBankLine) {
      if (currentBank && currentRates.length > 0) {
        banks.push({ name: currentBank, rates: currentRates });
      }
      currentBank = line.replace(/은행$/, '').trim();
      // 은행명 뒤에 "은행" 복원
      if (!currentBank.endsWith('은행') && !currentBank.endsWith('농협') && !currentBank.endsWith('기업')) {
        currentBank = currentBank + '은행';
      }
      currentRates = [];
      continue;
    }

    // 금리유형 감지
    const matchedType = typeKeywords.find(k => line.includes(k));
    if (matchedType && currentBank) {
      // 다음 줄들에서 숫자 2개(매매, 가계) 찾기
      let 매매 = '-', 가계 = '-';
      const candidates = [];
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (ratePattern.test(lines[j])) candidates.push(lines[j] + '%');
        if (candidates.length === 2) break;
        // 다음 은행명이 나오면 중단
        if (bankKeywords.some(k => lines[j].includes(k)) && lines[j].length < 20) break;
      }
      if (candidates[0]) 매매 = candidates[0];
      if (candidates[1]) 가계 = candidates[1];
      currentRates.push({ type: matchedType, 매매, 가계 });
    }
  }

  if (currentBank && currentRates.length > 0) {
    banks.push({ name: currentBank, rates: currentRates });
  }

  return { banks };
}

app.get('/api/loan-rates/parsed', async (req, res) => {
  try {
    const now = Date.now();
    if (parsedCache && (now - parsedCacheTime) < CACHE_TTL) {
      return res.json(parsedCache);
    }

    const apiKey = process.env.GOOGLE_VISION_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'GOOGLE_VISION_API_KEY 환경변수가 설정되지 않았습니다.' });
    }

    // 1. 이미지 URL 가져오기
    const ratesRes = await axios.get(`http://localhost:${PORT}/api/loan-rates`);
    const ratesData = ratesRes.data;
    if (!ratesData.success || !ratesData.images || ratesData.images.length === 0) {
      return res.status(500).json({ success: false, error: '금리표 이미지를 찾을 수 없습니다.' });
    }

    // 2. 이미지 다운로드 → base64
    const imgUrl = ratesData.images[0];
    const imgResponse = await axios.get(imgUrl, { responseType: 'arraybuffer' });
    const base64 = Buffer.from(imgResponse.data).toString('base64');

    // 3. Google Cloud Vision OCR + 구조화
    const parsed = await parseRateImageWithVision(base64, apiKey);

    const result = {
      success: true,
      title: ratesData.title,
      date: ratesData.date,
      banks: parsed.banks || [],
      fetchedAt: new Date().toISOString()
    };
    parsedCache = result;
    parsedCacheTime = now;
    console.log(`✅ 금리표 파싱 완료: ${result.banks.length}개 은행`);
    res.json(result);
  } catch (error) {
    console.error('❌ 금리표 파싱 오류:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 🚀 서버 시작
// ============================================================

app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🏘️  부동산 시장동향 대시보드 API 서버');
  console.log('='.repeat(60));
  console.log(`📡 포트: ${PORT}`);
  console.log(`🌐 주소: http://localhost:${PORT}`);
  console.log(`📊 대시보드: http://localhost:${PORT}/housing-dashboard.html`);
  console.log('');
  console.log('📍 API 엔드포인트:');
  console.log(`  ✅ GET  /api/health                    - API 상태 확인`);
  console.log(`  📋 GET  /api/apartment/trades         - 거래량 조회`);
  console.log(`  📈 GET  /api/apartment/trades/weekly  - 주간별 거래량`);
  console.log(`  📦 POST /api/apartment/trades/batch   - 일괄 거래량 조회`);
  console.log(`  📊 GET  /api/apartment/summary        - 대시보드 요약`);
  console.log('');
  console.log(`🔑 MOLIT API 키: ${CONFIG.MOLIT_API_KEY.slice(0, 10)}...`);
  console.log('='.repeat(60) + '\n');
});

export default app;
