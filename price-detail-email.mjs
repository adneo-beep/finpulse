/**
 * price-detail-email.mjs
 * 주택시장동향 주간 리포트 Excel → 이메일 발송
 * Sheet1: 주택시장동향 총괄  /  Sheet2: KB 심리지수 상세  /  Sheet3: 시군구 세부
 * 실행: node price-detail-email.mjs
 */
import axios from 'axios';
import * as XLSX from 'xlsx';
import nodemailer from 'nodemailer';

const RBONE_KEY      = '66acad414a424d12a853912b18d8b011';
const RBONE_URL      = 'https://www.reb.or.kr/r-one/openapi/SttsApiTblData.do';
const RBONE_SALE_ID  = 'T244183132827305';
const RBONE_LEASE_ID = 'T247713133046872';
const KB_BASE        = 'https://data-api.kbland.kr/bfmstat/hrtIndx';
const KB_HEADERS     = { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://data.kbland.kr/' };

const MAIL_TO   = process.env.MAIL_TO   || 'sicimi.lim@samsung.com,bh.won@samsung.com';
const MAIL_FROM = process.env.MAIL_FROM || 'adneo@naver.com';
const APP_PASS  = process.env.NAVER_APP_PASS || 'XTC6KT41MEXS';

// ────────────────────────────────────────────────────────────
// 공통 유틸
// ────────────────────────────────────────────────────────────
function getWeekCode(date) {
  const d = new Date(date);
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d - jan1) / 86400000 + jan1.getDay() + 1) / 7);
  return String(d.getFullYear()) + String(week).padStart(2, '0');
}

function getWeeks() {
  const today = new Date();
  const daysFromWed = (today.getDay() + 7 - 3) % 7;
  const lastWed = new Date(today);
  lastWed.setDate(today.getDate() - daysFromWed);
  const base = new Date(lastWed);
  base.setDate(lastWed.getDate() - 3);
  const weeks = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i * 7);
    weeks.push(getWeekCode(d));
  }
  return weeks;
}

const fmtRate = v => v == null ? '' : (v >= 0 ? `+${v.toFixed(2)}%` : `${v.toFixed(2)}%`);
const fmtChg  = v => {
  if (v == null) return '';
  if (v > 0) return `+${v.toFixed(2)}%`;
  if (v < 0) return `△${Math.abs(v).toFixed(2)}%`;
  return '―';
};
const fmtVal1 = v => v == null ? '' : Number(v).toFixed(1);
const fmtChg1 = v => {
  if (v == null) return '';
  if (v > 0) return `+${v.toFixed(1)}`;
  if (v < 0) return `△${Math.abs(v).toFixed(1)}`;
  return '―';
};

// ────────────────────────────────────────────────────────────
// R-ONE API
// ────────────────────────────────────────────────────────────
const weekDateCache = {};

async function roneVal(statblId, clsId, week) {
  try {
    const r = await axios.get(RBONE_URL, {
      params: { STATBL_ID: statblId, DTACYCLE_CD: 'WK', apiKey: RBONE_KEY, WRTTIME_IDTFR_ID: week, CLS_ID: clsId },
      timeout: 10000
    });
    const xml = String(r.data);
    const valM  = xml.match(/<DTA_VAL>([\d.]+)<\/DTA_VAL>/);
    const dateM = xml.match(/<WRTTIME_DESC>([^<]+)<\/WRTTIME_DESC>/);
    if (dateM && !weekDateCache[week]) weekDateCache[week] = dateM[1];
    return valM ? parseFloat(valM[1]) : null;
  } catch { return null; }
}

async function roneRows(statblId, regions, weeks) {
  const BATCH = 30;
  const results = [];
  for (let b = 0; b < regions.length; b += BATCH) {
    const batch = regions.slice(b, b + BATCH);
    const res = await Promise.all(batch.map(async reg => {
      const vals = await Promise.all(weeks.map(w => roneVal(statblId, reg.id, w)));
      const trend = vals.slice(1).map((v, i) => {
        const pre = vals[i];
        return (v != null && pre != null) ? parseFloat(((v - pre) / pre * 100).toFixed(4)) : null;
      });
      const change = (trend[3] != null && trend[2] != null)
        ? parseFloat((trend[3] - trend[2]).toFixed(4)) : null;
      return { ...reg, trend, change, value: trend[3] };
    }));
    results.push(...res);
  }
  return results;
}

// ────────────────────────────────────────────────────────────
// KB API
// ────────────────────────────────────────────────────────────
const KB_TO_RBONE = {
  '0000000000': '50001', '1100000000': '50008', '2600000000': '50025',
  '2700000000': '50150', '2800000000': '50124', '2900000000': '50159',
  '3000000000': '50165', '3100000000': '50171', '3600000000': '50033',
  '4100000000': '50016', '4300000000': '50185', '4400000000': '50194',
  '4600000000': '50216', '4700000000': '50223', '4800000000': '50237',
  '5000000000': '50250', '5100000000': '50177', '5200000000': '50207',
};

const KB_REGIONS = [
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

// 출력 순서 (주택시장동향 기준)
const SIDO_ORDER = ['50001','50002','50003','50008','50016','50124','50177','50033',
  '50165','50185','50194','50207','50216','50159','50250','50150','50223','50171','50025','50237'];
const SIDO_NAMES = {
  '50001':'전국','50002':'수도권','50003':'지방권','50008':'서울','50016':'경기',
  '50124':'인천','50177':'강원','50033':'세종','50165':'대전','50185':'충북',
  '50194':'충남','50207':'전북','50216':'전남','50159':'광주','50250':'제주',
  '50150':'대구','50223':'경북','50171':'울산','50025':'부산','50237':'경남',
};

async function kbAreaData(code, weekDateStrings) {
  // areaHrtIndx: 복합 지수
  const results = await Promise.all(weekDateStrings.map(ds =>
    axios.get(`${KB_BASE}/areaHrtIndx`, {
      params: { '매매전세코드': code, '월간주간구분코드': '02', '조회시작일자': ds, '조회종료일자': ds },
      timeout: 8000, headers: KB_HEADERS
    }).then(r => r.data.dataBody?.data || []).catch(() => [])
  ));
  return results; // [week0[], week1[], ...]
}

async function kbBreakdownData(endpoint, code, regionCode, weekDateStrings) {
  const r = await axios.get(`${KB_BASE}/${endpoint}`, {
    params: { '매매전세코드': code, '월간주간구분코드': '02', '법정동코드': regionCode, '기준날짜': weekDateStrings[weekDateStrings.length-1] },
    timeout: 8000, headers: KB_HEADERS
  }).then(r => r.data?.dataBody?.data?.stack || []).catch(() => []);
  return weekDateStrings.map(ds => {
    const iso = `${ds.slice(0,4)}-${ds.slice(4,6)}-${ds.slice(6,8)}`;
    return r.find(s => s.기준날짜 === iso) || null;
  });
}

async function fetchKbAll(weekDateStrings) {
  console.log('  KB areaHrtIndx 조회 중...');
  const [saleWeeks, leaseWeeks] = await Promise.all([
    kbAreaData('01', weekDateStrings),
    kbAreaData('02', weekDateStrings),
  ]);

  const byRegion = {};
  saleWeeks.forEach((weekData, wi) => {
    weekData.forEach(item => {
      const rid = KB_TO_RBONE[item.법정동코드]; if (!rid) return;
      if (!byRegion[rid]) byRegion[rid] = { name: item.지역명, s: Array(5).fill(null), t: Array(5).fill(null), ls: Array(5).fill(null), lt: Array(5).fill(null) };
      byRegion[rid].s[wi]  = item['매수우위지수']     ?? null;
      byRegion[rid].t[wi]  = item['매매거래활발지수'] ?? null;
    });
  });
  leaseWeeks.forEach((weekData, wi) => {
    weekData.forEach(item => {
      const rid = KB_TO_RBONE[item.법정동코드]; if (!rid) return;
      if (!byRegion[rid]) byRegion[rid] = { name: item.지역명, s: Array(5).fill(null), t: Array(5).fill(null), ls: Array(5).fill(null), lt: Array(5).fill(null) };
      byRegion[rid].ls[wi] = item['전세수급지수']     ?? null;
      byRegion[rid].lt[wi] = item['전세거래활발지수'] ?? null;
    });
  });

  console.log('  KB trmSppsIndx + trmTranIndx 조회 중...');
  const breakdownSale  = {};
  const breakdownLease = {};
  const breakdownSaleTran  = {};
  const breakdownLeaseTran = {};
  await Promise.all(KB_REGIONS.map(async reg => {
    const [sale, lease, saleTran, leaseTran] = await Promise.all([
      kbBreakdownData('trmSppsIndx', '01', reg.code, weekDateStrings),
      kbBreakdownData('trmSppsIndx', '02', reg.code, weekDateStrings),
      kbBreakdownData('trmTranIndx', '01', reg.code, weekDateStrings),
      kbBreakdownData('trmTranIndx', '02', reg.code, weekDateStrings),
    ]);
    breakdownSale[reg.code]      = sale;
    breakdownLease[reg.code]     = lease;
    breakdownSaleTran[reg.code]  = saleTran;
    breakdownLeaseTran[reg.code] = leaseTran;
  }));

  return { byRegion, breakdownSale, breakdownLease, breakdownSaleTran, breakdownLeaseTran };
}

function calcTrend(vals5) {
  // vals5: [w0, w1, w2, w3, w4] → trend = [w1-w0, w2-w1, w3-w2, w4-w3] (difference)
  const trend = vals5.slice(1).map((v, i) => {
    const pre = vals5[i];
    return (v != null && pre != null) ? parseFloat((v - pre).toFixed(2)) : null;
  });
  const change = (trend[3] != null && trend[2] != null) ? parseFloat((trend[3] - trend[2]).toFixed(2)) : null;
  return { trend: vals5.slice(1), change };
}

// ────────────────────────────────────────────────────────────
// 지역 계층 (Sheet3)
// ────────────────────────────────────────────────────────────
const HIERARCHY = [
  { id: '50001', name: '전국',   level: 0 },
  { id: '50002', name: '수도권', level: 0 },
  { id: '50003', name: '지방권', level: 0 },
  { id: '50008', name: '서울', level: 1 },
  { id: '50043', name: '  종로구',   level: 2 }, { id: '50044', name: '  중구',     level: 2 },
  { id: '50045', name: '  용산구',   level: 2 }, { id: '50047', name: '  성동구',   level: 2 },
  { id: '50048', name: '  광진구',   level: 2 }, { id: '50049', name: '  동대문구', level: 2 },
  { id: '50050', name: '  중랑구',   level: 2 }, { id: '50051', name: '  성북구',   level: 2 },
  { id: '50052', name: '  강북구',   level: 2 }, { id: '50053', name: '  도봉구',   level: 2 },
  { id: '50054', name: '  노원구',   level: 2 }, { id: '50056', name: '  은평구',   level: 2 },
  { id: '50057', name: '  서대문구', level: 2 }, { id: '50058', name: '  마포구',   level: 2 },
  { id: '50060', name: '  양천구',   level: 2 }, { id: '50061', name: '  강서구',   level: 2 },
  { id: '50062', name: '  구로구',   level: 2 }, { id: '50063', name: '  금천구',   level: 2 },
  { id: '50064', name: '  영등포구', level: 2 }, { id: '50065', name: '  동작구',   level: 2 },
  { id: '50066', name: '  관악구',   level: 2 }, { id: '50067', name: '  서초구',   level: 2 },
  { id: '50068', name: '  강남구',   level: 2 }, { id: '50069', name: '  송파구',   level: 2 },
  { id: '50070', name: '  강동구',   level: 2 },
  { id: '50016', name: '경기', level: 1 },
  { id: '50071', name: '  과천시',   level: 2 }, { id: '50072', name: '  안양시',   level: 2 },
  { id: '50073', name: '    만안구', level: 3 }, { id: '50074', name: '    동안구', level: 3 },
  { id: '50075', name: '  군포시',   level: 2 }, { id: '50076', name: '  의왕시',   level: 2 },
  { id: '50077', name: '  성남시',   level: 2 },
  { id: '50078', name: '    수정구', level: 3 }, { id: '50079', name: '    중원구', level: 3 }, { id: '50080', name: '    분당구', level: 3 },
  { id: '50081', name: '  안성시',   level: 2 }, { id: '50083', name: '  수원시',   level: 2 },
  { id: '50084', name: '    장안구', level: 3 }, { id: '50085', name: '    권선구', level: 3 }, { id: '50086', name: '    팔달구', level: 3 }, { id: '50087', name: '    영통구', level: 3 },
  { id: '50088', name: '  용인시',   level: 2 },
  { id: '50089', name: '    처인구', level: 3 }, { id: '50090', name: '    기흥구', level: 3 }, { id: '50091', name: '    수지구', level: 3 },
  { id: '50093', name: '  부천시',   level: 2 },
  { id: '50094', name: '    원미구', level: 3 }, { id: '50095', name: '    소사구', level: 3 }, { id: '50096', name: '    오정구', level: 3 },
  { id: '50097', name: '  광명시',   level: 2 }, { id: '50098', name: '  평택시',   level: 2 },
  { id: '50099', name: '  안산시',   level: 2 },
  { id: '50100', name: '    상록구', level: 3 }, { id: '50101', name: '    단원구', level: 3 },
  { id: '50102', name: '  오산시',   level: 2 }, { id: '50103', name: '  시흥시',   level: 2 },
  { id: '50104', name: '  화성시',   level: 2 },
  { id: '50256', name: '    만세구', level: 3 }, { id: '50257', name: '    효행구', level: 3 }, { id: '50258', name: '    병점구', level: 3 }, { id: '50259', name: '    동탄구', level: 3 },
  { id: '50106', name: '  구리시',   level: 2 }, { id: '50107', name: '  남양주시', level: 2 },
  { id: '50108', name: '  하남시',   level: 2 }, { id: '50109', name: '  광주시',   level: 2 },
  { id: '50111', name: '  이천시',   level: 2 }, { id: '50112', name: '  여주시',   level: 2 },
  { id: '50114', name: '  고양시',   level: 2 },
  { id: '50115', name: '    덕양구', level: 3 }, { id: '50116', name: '    일산동구', level: 3 }, { id: '50117', name: '    일산서구', level: 3 },
  { id: '50118', name: '  김포시',   level: 2 }, { id: '50120', name: '  의정부시', level: 2 },
  { id: '50121', name: '  동두천시', level: 2 }, { id: '50122', name: '  양주시',   level: 2 },
  { id: '50123', name: '  포천시',   level: 2 }, { id: '50253', name: '  파주시',   level: 2 },
  { id: '50124', name: '인천', level: 1 },
  { id: '50125', name: '  중구',     level: 2 }, { id: '50126', name: '  동구',     level: 2 },
  { id: '50127', name: '  연수구',   level: 2 }, { id: '50128', name: '  남동구',   level: 2 },
  { id: '50129', name: '  부평구',   level: 2 }, { id: '50130', name: '  계양구',   level: 2 },
  { id: '50131', name: '  서구',     level: 2 }, { id: '50254', name: '  미추홀구', level: 2 },
  { id: '50177', name: '강원', level: 1 },
  { id: '50178', name: '  춘천시', level: 2 }, { id: '50179', name: '  원주시', level: 2 },
  { id: '50180', name: '  강릉시', level: 2 }, { id: '50181', name: '  동해시', level: 2 },
  { id: '50182', name: '  태백시', level: 2 }, { id: '50183', name: '  속초시', level: 2 }, { id: '50184', name: '  삼척시', level: 2 },
  { id: '50033', name: '세종', level: 1 },
  { id: '50165', name: '대전', level: 1 },
  { id: '50166', name: '  동구', level: 2 }, { id: '50167', name: '  중구', level: 2 }, { id: '50168', name: '  서구', level: 2 }, { id: '50169', name: '  유성구', level: 2 }, { id: '50170', name: '  대덕구', level: 2 },
  { id: '50185', name: '충북', level: 1 },
  { id: '50186', name: '  청주시', level: 2 },
  { id: '50187', name: '    상당구', level: 3 }, { id: '50188', name: '    서원구', level: 3 }, { id: '50189', name: '    흥덕구', level: 3 }, { id: '50190', name: '    청원구', level: 3 },
  { id: '50191', name: '  충주시', level: 2 }, { id: '50192', name: '  제천시', level: 2 }, { id: '50193', name: '  음성군', level: 2 },
  { id: '50194', name: '충남', level: 1 },
  { id: '50195', name: '  천안시', level: 2 },
  { id: '50196', name: '    동남구', level: 3 }, { id: '50197', name: '    서북구', level: 3 },
  { id: '50198', name: '  공주시', level: 2 }, { id: '50199', name: '  보령시', level: 2 }, { id: '50200', name: '  아산시', level: 2 },
  { id: '50201', name: '  서산시', level: 2 }, { id: '50202', name: '  논산시', level: 2 }, { id: '50203', name: '  계룡시', level: 2 },
  { id: '50204', name: '  당진시', level: 2 }, { id: '50205', name: '  홍성군', level: 2 }, { id: '50206', name: '  예산군', level: 2 },
  { id: '50207', name: '전북', level: 1 },
  { id: '50208', name: '  전주시', level: 2 },
  { id: '50209', name: '    완산구', level: 3 }, { id: '50210', name: '    덕진구', level: 3 },
  { id: '50211', name: '  군산시', level: 2 }, { id: '50212', name: '  익산시', level: 2 }, { id: '50213', name: '  정읍시', level: 2 }, { id: '50214', name: '  남원시', level: 2 }, { id: '50215', name: '  김제시', level: 2 },
  { id: '50216', name: '전남', level: 1 },
  { id: '50217', name: '  목포시', level: 2 }, { id: '50218', name: '  여수시', level: 2 }, { id: '50219', name: '  순천시', level: 2 },
  { id: '50220', name: '  나주시', level: 2 }, { id: '50221', name: '  광양시', level: 2 }, { id: '50222', name: '  무안군', level: 2 },
  { id: '50159', name: '광주', level: 1 },
  { id: '50160', name: '  동구', level: 2 }, { id: '50161', name: '  서구', level: 2 }, { id: '50162', name: '  남구', level: 2 }, { id: '50163', name: '  북구', level: 2 }, { id: '50164', name: '  광산구', level: 2 },
  { id: '50250', name: '제주', level: 1 },
  { id: '50251', name: '  제주시', level: 2 }, { id: '50252', name: '  서귀포시', level: 2 },
  { id: '50150', name: '대구', level: 1 },
  { id: '50151', name: '  중구', level: 2 }, { id: '50152', name: '  동구', level: 2 }, { id: '50153', name: '  서구', level: 2 }, { id: '50154', name: '  남구', level: 2 },
  { id: '50155', name: '  북구', level: 2 }, { id: '50156', name: '  수성구', level: 2 }, { id: '50157', name: '  달서구', level: 2 }, { id: '50158', name: '  달성군', level: 2 },
  { id: '50223', name: '경북', level: 1 },
  { id: '50224', name: '  포항시', level: 2 },
  { id: '50225', name: '    남구', level: 3 }, { id: '50226', name: '    북구', level: 3 },
  { id: '50227', name: '  경주시', level: 2 }, { id: '50228', name: '  김천시', level: 2 }, { id: '50229', name: '  안동시', level: 2 }, { id: '50230', name: '  구미시', level: 2 },
  { id: '50231', name: '  영주시', level: 2 }, { id: '50232', name: '  영천시', level: 2 }, { id: '50233', name: '  상주시', level: 2 }, { id: '50234', name: '  문경시', level: 2 },
  { id: '50235', name: '  경산시', level: 2 }, { id: '50236', name: '  칠곡군', level: 2 },
  { id: '50171', name: '울산', level: 1 },
  { id: '50172', name: '  중구', level: 2 }, { id: '50173', name: '  남구', level: 2 }, { id: '50174', name: '  동구', level: 2 }, { id: '50175', name: '  북구', level: 2 }, { id: '50176', name: '  울주군', level: 2 },
  { id: '50025', name: '부산', level: 1 },
  { id: '50132', name: '  중구',     level: 2 }, { id: '50133', name: '  서구',     level: 2 }, { id: '50134', name: '  동구',     level: 2 }, { id: '50135', name: '  영도구',   level: 2 },
  { id: '50136', name: '  남구',     level: 2 }, { id: '50137', name: '  부산진구', level: 2 }, { id: '50138', name: '  연제구',   level: 2 }, { id: '50139', name: '  수영구',   level: 2 },
  { id: '50141', name: '  동래구',   level: 2 }, { id: '50142', name: '  해운대구', level: 2 }, { id: '50143', name: '  금정구',   level: 2 }, { id: '50144', name: '  기장군',   level: 2 },
  { id: '50146', name: '  북구',     level: 2 }, { id: '50147', name: '  사하구',   level: 2 }, { id: '50148', name: '  강서구',   level: 2 }, { id: '50149', name: '  사상구',   level: 2 },
  { id: '50237', name: '경남', level: 1 },
  { id: '50238', name: '  창원시',   level: 2 },
  { id: '50239', name: '    의창구', level: 3 }, { id: '50240', name: '    성산구', level: 3 }, { id: '50241', name: '    마산합포구', level: 3 }, { id: '50242', name: '    마산회원구', level: 3 }, { id: '50243', name: '    진해구', level: 3 },
  { id: '50244', name: '  통영시',   level: 2 }, { id: '50245', name: '  사천시',   level: 2 }, { id: '50246', name: '  김해시',   level: 2 },
  { id: '50247', name: '  밀양시',   level: 2 }, { id: '50248', name: '  거제시',   level: 2 }, { id: '50249', name: '  양산시',   level: 2 }, { id: '50255', name: '  진주시',   level: 2 },
];

const SIDO_20 = [
  { id: '50001', name: '전국' }, { id: '50002', name: '수도권' }, { id: '50003', name: '지방권' },
  { id: '50008', name: '서울' }, { id: '50016', name: '경기' },   { id: '50124', name: '인천' },
  { id: '50177', name: '강원' }, { id: '50033', name: '세종' },   { id: '50165', name: '대전' },
  { id: '50185', name: '충북' }, { id: '50194', name: '충남' },   { id: '50207', name: '전북' },
  { id: '50216', name: '전남' }, { id: '50159', name: '광주' },   { id: '50250', name: '제주' },
  { id: '50150', name: '대구' }, { id: '50223', name: '경북' },   { id: '50171', name: '울산' },
  { id: '50025', name: '부산' }, { id: '50237', name: '경남' },
];

// ────────────────────────────────────────────────────────────
// Sheet1: 주택시장동향 총괄
// ────────────────────────────────────────────────────────────
function buildSheet1(weekLabels, weekDates, saleRows, leaseRows, kbData) {
  const wh = weekLabels.map((w, i) => `${w}\n(${weekDates[i]})`);
  const header = ['구분', '지역', '지수/변동율', '전주비', ...wh];
  const rows = [header];

  const addSection = (label, data) => {
    rows.push([label, '', '', '', '', '', '', '']);
    data.forEach(r => {
      rows.push([
        '', r.name,
        fmtRate(r.value), fmtChg(r.change),
        ...r.trend.map(fmtRate),
      ]);
    });
    rows.push([]);
  };

  addSection('Ⅰ. 아파트 매매변동율 (한국부동산원 R-ONE)', saleRows);
  addSection('Ⅰ. 아파트 전세변동율 (한국부동산원 R-ONE)', leaseRows);

  // KB 심리지수 (복합)
  const KB_CATS = ['매수우위지수', '매매거래활발지수', '전세수급지수', '전세거래활발지수'];
  KB_CATS.forEach(cat => {
    const catRows = SIDO_ORDER.map(rid => {
      const kbRow = kbData.find(r => r.regionId === rid && r.category === cat);
      return { name: SIDO_NAMES[rid] || rid, value: kbRow?.value ?? null, change: kbRow?.change ?? null, trend: kbRow?.trend || [null,null,null,null] };
    });
    addSection(`Ⅲ. KB 소비자심리지수 · ${cat}`, catRows);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 32 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  return ws;
}

// ────────────────────────────────────────────────────────────
// Sheet2: KB 심리지수 상세
// ────────────────────────────────────────────────────────────
function buildSheet2(weekLabels, weekDates, kbComposite, breakdownSale, breakdownLease, breakdownSaleTran, breakdownLeaseTran) {
  const wh = weekLabels.map((w, i) => `${w}\n(${weekDates[i]})`);
  const header = ['지역', '지표명', '지수변동', '전주비', ...wh];
  const rows = [header];

  const DISPLAY_ORDER = [
    { rid: '50001', name: '전국',   code: '0000000000' },
    { rid: '50002', name: '수도권', code: null },
    { rid: '50003', name: '지방권', code: null },
    { rid: '50008', name: '서울',   code: '1100000000' },
    { rid: '50016', name: '경기',   code: '4100000000' },
    { rid: '50124', name: '인천',   code: '2800000000' },
    { rid: '50177', name: '강원',   code: '5100000000' },
    { rid: '50033', name: '세종',   code: '3600000000' },
    { rid: '50165', name: '대전',   code: '3000000000' },
    { rid: '50185', name: '충북',   code: '4300000000' },
    { rid: '50194', name: '충남',   code: '4400000000' },
    { rid: '50207', name: '전북',   code: '5200000000' },
    { rid: '50216', name: '전남',   code: '4600000000' },
    { rid: '50159', name: '광주',   code: '2900000000' },
    { rid: '50250', name: '제주',   code: '5000000000' },
    { rid: '50150', name: '대구',   code: '2700000000' },
    { rid: '50223', name: '경북',   code: '4700000000' },
    { rid: '50171', name: '울산',   code: '3100000000' },
    { rid: '50025', name: '부산',   code: '2600000000' },
    { rid: '50237', name: '경남',   code: '4800000000' },
  ];

  DISPLAY_ORDER.forEach(reg => {
    const noData = !reg.code;
    const comp = kbComposite[reg.rid];

    const indicators = [
      // 매수우위지수 그룹
      { label: '매수자많음', getData: () => { const s = breakdownSale[reg.code]; return s ? s.map(w => w?.['매수자많음'] ?? null) : null; } },
      { label: '비슷함',     getData: () => { const s = breakdownSale[reg.code]; return s ? s.map(w => w?.['비슷함']    ?? null) : null; } },
      { label: '매도자많음', getData: () => { const s = breakdownSale[reg.code]; return s ? s.map(w => w?.['매도자많음'] ?? null) : null; } },
      { label: '매수우위지수',     getData: () => comp ? comp.s  : null },
      // 매매거래활발지수 그룹
      { label: '활발함(매매)', getData: () => { const s = breakdownSaleTran[reg.code]; return s ? s.map(w => w?.['활발함'] ?? null) : null; } },
      { label: '보통(매매)',   getData: () => { const s = breakdownSaleTran[reg.code]; return s ? s.map(w => w?.['보통']   ?? null) : null; } },
      { label: '한산함(매매)', getData: () => { const s = breakdownSaleTran[reg.code]; return s ? s.map(w => w?.['한산함'] ?? null) : null; } },
      { label: '매매거래활발지수', getData: () => comp ? comp.t  : null },
      // 전세수급지수 그룹
      { label: '공급충분', getData: () => { const l = breakdownLease[reg.code]; return l ? l.map(w => w?.['공급충분'] ?? null) : null; } },
      { label: '적절',     getData: () => { const l = breakdownLease[reg.code]; return l ? l.map(w => w?.['적절']    ?? null) : null; } },
      { label: '공급부족', getData: () => { const l = breakdownLease[reg.code]; return l ? l.map(w => w?.['공급부족'] ?? null) : null; } },
      { label: '전세수급지수',     getData: () => comp ? comp.ls : null },
      // 전세거래활발지수 그룹
      { label: '활발함(전세)', getData: () => { const l = breakdownLeaseTran[reg.code]; return l ? l.map(w => w?.['활발함'] ?? null) : null; } },
      { label: '보통(전세)',   getData: () => { const l = breakdownLeaseTran[reg.code]; return l ? l.map(w => w?.['보통']   ?? null) : null; } },
      { label: '한산함(전세)', getData: () => { const l = breakdownLeaseTran[reg.code]; return l ? l.map(w => w?.['한산함'] ?? null) : null; } },
      { label: '전세거래활발지수', getData: () => comp ? comp.lt : null },
    ];

    indicators.forEach(ind => {
      const vals5 = noData ? null : ind.getData();
      if (!vals5) {
        rows.push([reg.name, ind.label, '', '', '', '', '', '']);
        return;
      }
      const trend4 = vals5.slice(1);
      const latest = vals5[4];
      const prev   = vals5[3];
      const chg    = (latest != null && prev != null) ? parseFloat((latest - prev).toFixed(1)) : null;
      rows.push([
        reg.name, ind.label,
        fmtVal1(latest), fmtChg1(chg),
        ...trend4.map(fmtVal1),
      ]);
    });
    rows.push([]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 10 }, { wch: 16 }, { wch: 10 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  return ws;
}

// ────────────────────────────────────────────────────────────
// Sheet3: 시군구 세부
// ────────────────────────────────────────────────────────────
function buildSheet3(weekLabels, weekDates, detailData) {
  const wh = weekLabels.map((w, i) => `${w}\n(${weekDates[i]})`);
  const header = ['지역', '지수/변동율', '전주비', ...wh];
  const rows = [header];
  detailData.forEach(r => {
    rows.push([r.name, fmtRate(r.value), fmtChg(r.change), ...r.trend.map(fmtRate)]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  return ws;
}

// ────────────────────────────────────────────────────────────
// 이메일 발송
// ────────────────────────────────────────────────────────────
async function sendEmail(excelBuf, weekLabels, weekDates) {
  const latestWeek = weekLabels[weekLabels.length - 1];
  const latestDate = weekDates[weekDates.length - 1];
  const today = new Date();
  const todayStr = `${today.getFullYear()}.${today.getMonth()+1}.${today.getDate()}`;

  const transporter = nodemailer.createTransport({
    host: 'smtp.naver.com', port: 465, secure: true,
    auth: { user: MAIL_FROM, pass: APP_PASS },
  });

  const subject = `[부동산 주간동향] ${latestWeek} (${latestDate} 기준)`;
  const html = `
<div style="font-family:맑은 고딕,sans-serif;font-size:13px;color:#222;max-width:620px">
  <div style="background:#1a3a6b;color:#fff;padding:14px 20px;border-radius:6px 6px 0 0">
    <h2 style="margin:0;font-size:16px">📊 주간 주택시장 동향 리포트</h2>
    <p style="margin:4px 0 0;font-size:12px;opacity:.8">한국부동산원 R-ONE · KB부동산 데이터 기준</p>
  </div>
  <div style="background:#f8f9fc;padding:16px 20px;border:1px solid #dde">
    <table style="border-collapse:collapse;font-size:12px">
      <tr><td style="padding:3px 12px 3px 0;color:#666">기준일</td><td><b>${latestDate} (${latestWeek})</b></td></tr>
      <tr><td style="padding:3px 12px 3px 0;color:#666">발송일</td><td>${todayStr}</td></tr>
    </table>
    <br>
    <table style="border-collapse:collapse;font-size:12px;width:100%">
      <tr style="background:#1a3a6b;color:#fff">
        <th style="padding:6px 10px;text-align:left">시트</th>
        <th style="padding:6px 10px;text-align:left">내용</th>
      </tr>
      <tr style="background:#fff">
        <td style="padding:5px 10px;border-bottom:1px solid #eee">Sheet 1</td>
        <td style="padding:5px 10px;border-bottom:1px solid #eee">주택시장동향 총괄 (매매/전세 20개 시도 + KB 심리지수)</td>
      </tr>
      <tr style="background:#f5f7fb">
        <td style="padding:5px 10px;border-bottom:1px solid #eee">Sheet 2</td>
        <td style="padding:5px 10px;border-bottom:1px solid #eee">KB 소비자심리지수 상세 (지역별 세부 구성 비율)</td>
      </tr>
      <tr style="background:#fff">
        <td style="padding:5px 10px">Sheet 3</td>
        <td style="padding:5px 10px">한국부동산원 아파트 매매 시군구 세부 (약 213개 지역)</td>
      </tr>
    </table>
    <p style="margin:12px 0 0;font-size:12px;color:#555">첨부 Excel 파일을 확인해 주세요.</p>
  </div>
  <div style="padding:8px 20px;border:1px solid #dde;border-top:0;background:#fff;font-size:11px;color:#999;border-radius:0 0 6px 6px">
    출처: 한국부동산원 R-ONE Open API · KB부동산 데이터허브
  </div>
</div>`;

  const filename = `주택시장동향_${latestWeek}_${latestDate.replace('.','')}.xlsx`;
  await transporter.sendMail({
    from: `"부동산 동향" <${MAIL_FROM}>`,
    to: MAIL_TO, subject, html,
    attachments: [{ filename, content: excelBuf }],
  });
  console.log(`✉️  발송 완료 → ${MAIL_TO}`);
  console.log(`   제목: ${subject}`);
  console.log(`   첨부: ${filename} (${(excelBuf.length/1024).toFixed(0)}KB)`);
}

// ────────────────────────────────────────────────────────────
// 메인
// ────────────────────────────────────────────────────────────
async function main() {
  console.log('🏘️  주간 주택시장 동향 리포트 생성 시작');
  const weeks = getWeeks();
  const weekLabels = weeks.slice(1).map(w => `${w.slice(0,4)}년${w.slice(4)}주`);

  // KB 주간 날짜 문자열 (YYYYMMDD)
  const kbLatestRes = await axios.get(`${KB_BASE}/latestDate`, {
    params: { '매매전세코드': '01', '월간주간구분코드': '02', 'selectedTab': '0', 'period': '5', '탭구분코드': '0' },
    timeout: 8000, headers: KB_HEADERS
  });
  const kbLatestDate = new Date(kbLatestRes.data.dataBody.data.최종일자);
  const kbWeekDateStrings = [];
  for (let i = 4; i >= 0; i--) {
    const d = new Date(kbLatestDate);
    d.setDate(kbLatestDate.getDate() - i * 7);
    kbWeekDateStrings.push(
      String(d.getFullYear()) + String(d.getMonth()+1).padStart(2,'0') + String(d.getDate()).padStart(2,'0')
    );
  }

  console.log('📡 [1/3] R-ONE 20개 시도 매매/전세 조회 중...');
  const [saleRows20, leaseRows20] = await Promise.all([
    roneRows(RBONE_SALE_ID,  SIDO_20, weeks),
    roneRows(RBONE_LEASE_ID, SIDO_20, weeks),
  ]);

  const weekDates = weeks.slice(1).map(w => {
    const raw = weekDateCache[w];
    if (!raw) return '';
    const d = new Date(raw);
    return `${d.getMonth()+1}.${d.getDate()}`;
  });
  const kbWeekDates = kbWeekDateStrings.slice(1).map(ds => `${parseInt(ds.slice(4,6))}.${parseInt(ds.slice(6,8))}`);

  console.log('📡 [2/3] KB 심리지수 조회 중...');
  const { byRegion: kbByRegion, breakdownSale, breakdownLease, breakdownSaleTran, breakdownLeaseTran } = await fetchKbAll(kbWeekDateStrings);

  // Sheet1용 KB 복합 지수 (kb-sentiment 형식)
  const kbCompositeRows = [];
  Object.entries(kbByRegion).forEach(([rid, d]) => {
    ['s','t','ls','lt'].forEach((key, ki) => {
      const catName = ['매수우위지수','매매거래활발지수','전세수급지수','전세거래활발지수'][ki];
      const vals5 = d[key];
      const trend4 = vals5.slice(1);
      const latest = vals5[4]; const prev = vals5[3];
      const change = (latest != null && prev != null) ? parseFloat((latest-prev).toFixed(1)) : null;
      kbCompositeRows.push({ category: catName, regionId: rid, value: latest, change, trend: trend4 });
    });
  });

  console.log('📡 [3/3] R-ONE 시군구 세부 (~213개) 조회 중...');
  const detailData = await roneRows(RBONE_SALE_ID, HIERARCHY, weeks);

  console.log('📊 Excel 생성 중...');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet1(weekLabels, weekDates, saleRows20, leaseRows20, kbCompositeRows), '주택시장동향 총괄');
  XLSX.utils.book_append_sheet(wb, buildSheet2(weekLabels, kbWeekDates, kbByRegion, breakdownSale, breakdownLease, breakdownSaleTran, breakdownLeaseTran), 'KB 심리지수 상세');
  XLSX.utils.book_append_sheet(wb, buildSheet3(weekLabels, weekDates, detailData), '시군구 세부');

  const excelBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  console.log(`✅ Excel 완성 (${(excelBuf.length/1024).toFixed(0)}KB, 시트 3개)`);

  await sendEmail(excelBuf, weekLabels, weekDates);
  console.log('🎉 완료');
}

main().catch(e => { console.error('❌ 오류:', e.message); process.exit(1); });
