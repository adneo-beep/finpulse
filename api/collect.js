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
  const s = str.replace(/\s/g, '').replace(/\./g, '-').replace(/-$/, '');
  return new Date(s);
}

function isWithin7Days(dateStr) {
  const d = parseDate(dateStr);
  if (!d || isNaN(d.getTime())) return true;
  return d >= todayMinus(7);
}

function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&#\d+;/g,'').trim();
}

// ── 본문 HTML → 첫 2~3문장 추출 ──────────────────────
function extractSentences(html, max = 3) {
  // 비본문 요소 제거
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  // 블록 요소를 줄바꿈으로 변환 후 태그 제거
  const text = cleaned
    .replace(/<\/?(p|div|li|tr|th|td|h[1-6]|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#][a-z0-9]*;/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*/g, '\n')
    .trim();

  const seen = new Set();
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l =>
      l.length > 25 &&
      l.length < 500 &&
      !/[|｜]/.test(l) &&                        // 네비게이션 구분자
      !/바로가기|뉴스레터|Open API|관련사이트/.test(l) && // 스킵 링크
      !/^[\d\s\.\-\(\)]+$/.test(l)               // 숫자/기호만 있는 줄
    )
    .filter(l => {
      const key = l.slice(0, 15).replace(/\s/g, '');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  return lines.slice(0, max);
}

// ── 상세 페이지 본문 가져오기 ─────────────────────────
async function fetchDetailSummary(url, useNoSSL = false) {
  try {
    const html = useNoSSL
      ? await fetchNoSSL(url, 8000)
      : await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) }).then(r => r.text());
    return extractSentences(html);
  } catch {
    return [];
  }
}

// ── 1. 금융위원회 — 네이버 뉴스 (Naver description 사용) ──
async function fetchFSC() {
  try {
    const clientId     = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Naver API key missing');
    const sevenDaysAgo = todayMinus(7);
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent('금융위')}&display=20&sort=date`;
    const res = await fetch(url, {
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json();
    const items = [];
    const seenTitles = new Set();
    for (const item of (json.items || [])) {
      const title   = stripHtml(item.title);
      const link    = item.originallink || item.link;
      const pubDate = new Date(item.pubDate);
      if (isNaN(pubDate.getTime()) || pubDate < sevenDaysAgo) continue;
      const titleKey = title.replace(/\s/g, '').slice(0, 15);
      if ([...seenTitles].some(t => t === titleKey)) continue;
      seenTitles.add(titleKey);
      const pad = n => String(n).padStart(2, '0');
      const date = `${pubDate.getFullYear()}-${pad(pubDate.getMonth()+1)}-${pad(pubDate.getDate())}`;
      // Naver description은 이미 기사 첫 문장 스니펫
      const snippet = stripHtml(item.description || '');
      items.push({ title, date, url: link, snippet });
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

    const items = [];
    const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trPattern.exec(html)) !== null) {
      const tr = trMatch[1];
      const linkMatch = tr.match(/<a[^>]+href="(\/fss\/bbs\/B0000188\/view\.do\?nttId=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      const href  = 'https://www.fss.or.kr' + linkMatch[1];
      const title = stripHtml(linkMatch[2]);
      if (!title || title.length < 5) continue;
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
    const url = 'https://www.bok.or.kr/portal/singl/newsData/listCont.do?pageIndex=&targetDepth=3&menuNo=201263&syncMenuChekKey=1&depthSubMain=&subMainAt=&searchCnd=1&searchKwd=&depth2=200038&depth3=201263';
    const html = await fetchNoSSL(url);

    const items = [];
    const usedTitles = new Set();
    const liPattern = /<li[^>]*bbsRowCls[^>]*>([\s\S]*?)<\/li>/g;
    let liMatch;
    while ((liMatch = liPattern.exec(html)) !== null) {
      const block = liMatch[1];
      const dateMatch = block.match(/<span class="date"[^>]*>[\s\S]*?(\d{4}\.\d{2}\.\d{2})/);
      if (!dateMatch) continue;
      const date = dateMatch[1].replace(/\./g, '-');
      if (!isWithin7Days(date)) continue;
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
    const listUrl = 'https://www.reb.or.kr/reb/na/ntt/selectNttList.do?mi=9565&bbsId=1154';
    const res = await fetch(listUrl, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const html = await res.text();

    const items = [];
    const trPattern = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trPattern.exec(html)) !== null) {
      const tr = trMatch[1];
      const linkMatch = tr.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      const title = stripHtml(linkMatch[1]).replace(/새글/g, '').trim();
      if (!title || title.length < 5) continue;
      const dateMatch = tr.match(/(\d{4}\.\d{2}\.\d{2})/);
      if (!dateMatch) continue;
      const date = dateMatch[1].replace(/\./g, '-');
      if (!isWithin7Days(date)) continue;
      // nttId 추출해서 상세 URL 구성
      const nttIdMatch = tr.match(/nttId[=\(,\s'"]+(\d+)/i);
      const detailUrl = nttIdMatch
        ? `https://www.reb.or.kr/reb/na/ntt/selectNttInfo.do?mi=9565&bbsId=1154&nttId=${nttIdMatch[1]}`
        : listUrl;
      items.push({ title, date, url: detailUrl });
    }
    return items;
  } catch (e) {
    console.error('REB fetch error:', e.message);
    return [];
  }
}

// ── 메인 핸들러 ────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 1단계: 목록 병렬 수집
    const [fscItems, fssItems, bokItems, rebItems] = await Promise.allSettled([
      fetchFSC(), fetchFSS(), fetchBOK(), fetchREB()
    ]).then(results => results.map(r => r.status === 'fulfilled' ? r.value : []));

    // 2단계: 상세 본문 병렬 수집 (FSC는 Naver description 사용)
    const withSummary = async (items, useNoSSL = false) =>
      Promise.all(items.map(async item => ({
        ...item,
        bullets: item.snippet
          ? [item.snippet]                               // FSC: Naver description 그대로
          : await fetchDetailSummary(item.url, useNoSSL) // 나머지: 상세 페이지 파싱
      })));

    const [fscOut, fssOut, bokOut, rebOut] = await Promise.all([
      withSummary(fscItems, false),
      withSummary(fssItems, false),
      withSummary(bokItems, true),   // BOK: SSL 우회 필요
      withSummary(rebItems, false),
    ]);

    const data = {
      timestamp: new Date().toISOString(),
      institutions: {
        fsc: { name: '금융위원회',  items: fscOut },
        fss: { name: '금융감독원',  items: fssOut },
        bok: { name: '한국은행',    items: bokOut },
        reb: { name: '한국부동산원', items: rebOut }
      }
    };

    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
