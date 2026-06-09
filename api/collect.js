/**
 * FinPulse – /api/collect
 * 금융위원회·금융감독원·한국은행·한국부동산원 보도자료 수집
 */
import https from 'https';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

// SSL 인증서 검증 우회 fetch (일부 한국 정부 사이트 대응)
function fetchNoSSL(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    const agent = new https.Agent({ rejectUnauthorized: false });
    const req = https.get(url, { headers: HEADERS, agent }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        // 리다이렉트 처리
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          fetchNoSSL(res.headers.location, timeoutMs).then(resolve).catch(reject);
        } else {
          resolve(Buffer.concat(chunks).toString('utf-8'));
        }
      });
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

// ── 날짜 유틸 ──────────────────────────────────────────
function todayMinus(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function parseDate(str) {
  if (!str) return null;
  // 2026-06-08 or 2026.06.08 or 2026. 06. 08.
  const s = str.replace(/\s/g, '').replace(/\./g, '-').replace(/-$/, '');
  return new Date(s);
}

function isWithin7Days(dateStr) {
  const d = parseDate(dateStr);
  if (!d || isNaN(d.getTime())) return true; // 날짜 파싱 실패 시 포함
  const cutoff = todayMinus(7);
  return d >= cutoff;
}

function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&#\d+;/g,'').trim();
}

// ── 1. 금융위원회 — 네이버 뉴스 검색 API ──────────────
async function fetchFSC() {
  try {
    const clientId     = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Naver API key missing');

    // 금융위원회 공식 보도자료 발표 기사만 수집
    // — 두 쿼리 병렬 요청으로 커버리지 확대
    const queries = [
      '금융위원회 보도자료 발표',
      '금융위원회 금융정책',
    ];
    const sevenDaysAgo = todayMinus(7);
    const allNews = [];

    await Promise.all(queries.map(async q => {
      const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(q)}&display=20&sort=date`;
      const res = await fetch(url, {
        headers: {
          'X-Naver-Client-Id':     clientId,
          'X-Naver-Client-Secret': clientSecret,
        },
        signal: AbortSignal.timeout(10000),
      });
      const json = await res.json();
      if (json.items) allNews.push(...json.items);
    }));

    const items = [];
    const seenTitles = new Set();

    for (const item of allNews) {
      const rawTitle = stripHtml(item.title);
      const rawDesc  = stripHtml(item.description || '');
      const link     = item.originallink || item.link;

      const pubDate = new Date(item.pubDate);
      if (isNaN(pubDate.getTime()) || pubDate < sevenDaysAgo) continue;

      // 금융위원회 관련 기사만 (제목 또는 설명에 금융위 포함)
      const isFSCRelated = rawTitle.includes('금융위') || rawDesc.includes('금융위원회');
      if (!isFSCRelated) continue;

      // 단순 시황/환율 뉴스 제외 (보도자료성 정책 기사만)
      const isPolicy = rawTitle.includes('발표') || rawTitle.includes('시행') ||
                       rawTitle.includes('개선') || rawTitle.includes('도입') ||
                       rawTitle.includes('추진') || rawTitle.includes('마련') ||
                       rawTitle.includes('강화') || rawTitle.includes('지원') ||
                       rawTitle.includes('규제') || rawTitle.includes('제도') ||
                       rawTitle.includes('대책') || rawTitle.includes('방안') ||
                       rawTitle.includes('펀드') || rawTitle.includes('금지') ||
                       rawTitle.includes('공시') || rawTitle.includes('감리') ||
                       rawDesc.includes('보도자료');
      if (!isPolicy) continue;

      if (seenTitles.has(rawTitle)) continue;
      seenTitles.add(rawTitle);

      const pad = n => String(n).padStart(2,'0');
      const date = `${pubDate.getFullYear()}-${pad(pubDate.getMonth()+1)}-${pad(pubDate.getDate())}`;

      items.push({ title: rawTitle, date, url: link });
      if (items.length >= 10) break;
    }
    return items;
  } catch (e) {
    console.error('FSC(Naver) fetch error:', e.message);
    return [];
  }
}

// ── 2. 금융감독원 (fss.or.kr) ─────────────────────────
async function fetchFSS() {
  try {
    const url = 'https://www.fss.or.kr/fss/bbs/B0000188/list.do?menuNo=200218';
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const html = await res.text();

    // 테이블 tbody tr 행에서 추출
    const items = [];
    const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trPattern.exec(html)) !== null) {
      const tr = trMatch[1];
      // 제목 링크
      const linkMatch = tr.match(/<a[^>]+href="(\/fss\/bbs\/B0000188\/view\.do\?nttId=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      const href = 'https://www.fss.or.kr' + linkMatch[1];
      const title = stripHtml(linkMatch[2]);
      if (!title || title.length < 5) continue;
      // 날짜
      const dateMatch = tr.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch) continue;
      const date = dateMatch[1];
      if (!isWithin7Days(date)) continue;
      items.push({ title, date, url: href });
    }
    return items;
  } catch (e) {
    console.error('FSS fetch error:', e.message);
    return [];
  }
}

// ── 3. 한국은행 (bok.or.kr) ────────────────────────────
async function fetchBOK() {
  try {
    // listCont.do: AJAX로 실제 목록 HTML을 반환하는 엔드포인트
    const url = 'https://www.bok.or.kr/portal/singl/newsData/listCont.do?pageIndex=&targetDepth=3&menuNo=201263&syncMenuChekKey=1&depthSubMain=&subMainAt=&searchCnd=1&searchKwd=&depth2=200038&depth3=201263';
    const html = await fetchNoSSL(url);

    const items = [];
    const usedTitles = new Set();
    // <li class="bbsRowCls"> 블록 파싱
    const liPattern = /<li[^>]*bbsRowCls[^>]*>([\s\S]*?)<\/li>/g;
    let liMatch;
    while ((liMatch = liPattern.exec(html)) !== null) {
      const block = liMatch[1];
      // 날짜
      const dateMatch = block.match(/<span class="date"[^>]*>[\s\S]*?(\d{4}\.\d{2}\.\d{2})/);
      if (!dateMatch) continue;
      const date = dateMatch[1].replace(/\./g, '-');
      if (!isWithin7Days(date)) continue;
      // 링크 + 제목
      const linkMatch = block.match(/<a[^>]+href="(\/portal\/bbs\/[^"]+)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      const title = stripHtml(linkMatch[2].replace(/<!--[\s\S]*?-->/g, ''));
      if (!title || title.length < 3 || usedTitles.has(title)) continue;
      usedTitles.add(title);
      items.push({ title, date, url: 'https://www.bok.or.kr' + linkMatch[1] });
    }
    return items;
  } catch (e) {
    console.error('BOK fetch error:', e.message);
    return [];
  }
}

// ── 4. 한국부동산원 (reb.or.kr) ───────────────────────
async function fetchREB() {
  try {
    const url = 'https://www.reb.or.kr/reb/na/ntt/selectNttList.do?mi=9565&bbsId=1154';
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const html = await res.text();

    const items = [];
    const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trPattern.exec(html)) !== null) {
      const tr = trMatch[1];
      // 제목 (링크는 javascript:이므로 텍스트만 추출)
      const linkMatch = tr.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      const title = stripHtml(linkMatch[1]).replace(/새글/g, '').trim();
      if (!title || title.length < 5) continue;
      // 날짜
      const dateMatch = tr.match(/(\d{4}\.\d{2}\.\d{2})/);
      if (!dateMatch) continue;
      const date = dateMatch[1].replace(/\./g, '-');
      if (!isWithin7Days(date)) continue;
      items.push({ title, date, url: url }); // 상세 URL 없으므로 목록 URL 사용
    }
    return items;
  } catch (e) {
    console.error('REB fetch error:', e.message);
    return [];
  }
}

// ── 요약 생성 (제목 기반 bullet 생성) ────────────────
function makeSummary(title) {
  // 제목에서 키워드 기반 3개 bullet 생성
  const bullets = [];
  if (title.includes('금리') || title.includes('기준금리')) bullets.push('금리 관련 정책 발표 내용 포함');
  if (title.includes('외환') || title.includes('환율')) bullets.push('외환시장 관련 조치 및 현황 안내');
  if (title.includes('보험')) bullets.push('보험 제도 개선 및 감독 강화 방안 포함');
  if (title.includes('투자') || title.includes('펀드')) bullets.push('투자상품 관련 규제 및 가이드라인 수록');
  if (title.includes('대출') || title.includes('신용')) bullets.push('대출 및 신용 관련 제도 변경 사항 포함');
  if (title.includes('가계')) bullets.push('가계부채 현황 및 관리 방안 제시');
  if (title.includes('부동산') || title.includes('아파트') || title.includes('주택')) bullets.push('부동산 시장 동향 및 가격 지표 수록');
  if (title.includes('연금') || title.includes('퇴직')) bullets.push('연금 제도 개선 및 운용 현황 포함');
  if (title.includes('국제') || title.includes('수지')) bullets.push('국제 거래 현황 및 통계 제공');
  if (title.includes('물가') || title.includes('인플레')) bullets.push('물가 동향 및 통화정책 연계 분석 수록');
  if (title.includes('경상수지')) bullets.push('경상수지 흑자/적자 규모 및 구성 항목 분석');
  if (title.includes('AI') || title.includes('디지털')) bullets.push('디지털 금융 혁신 관련 정책 방향 제시');

  // 기본 bullet (부족할 때 보충)
  if (bullets.length < 3) bullets.push('관련 제도·통계 현황 및 정책 방향 제시');
  if (bullets.length < 3) bullets.push('담당 부처의 공식 입장 및 향후 계획 포함');
  if (bullets.length < 3) bullets.push('세부 내용은 첨부 자료 또는 원문 링크 참조');

  return bullets.slice(0, 3);
}

// ── 메인 핸들러 ────────────────────────────────────────
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 병렬 수집
    const [fscItems, fssItems, bokItems, rebItems] = await Promise.allSettled([
      fetchFSC(), fetchFSS(), fetchBOK(), fetchREB()
    ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));

    // 요약 추가
    const addSummary = items => items.map(item => ({
      ...item,
      bullets: makeSummary(item.title)
    }));

    const data = {
      timestamp: new Date().toISOString(),
      institutions: {
        fsc: { name: '금융위원회', items: addSummary(fscItems) },
        fss: { name: '금융감독원', items: addSummary(fssItems) },
        bok: { name: '한국은행',   items: addSummary(bokItems) },
        reb: { name: '한국부동산원', items: addSummary(rebItems) }
      }
    };

    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
