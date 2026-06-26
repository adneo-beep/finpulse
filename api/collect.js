/**
 * FinPulse – /api/collect
 * 금융위원회·금융감독원·한국은행·한국부동산원 보도자료 수집
 * FSC만 Naver 스니펫 요약 사용, 나머지는 제목·날짜·링크만 제공
 */
import https from 'https';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

// ── SSL 우회 fetch ─────────────────────────────────────
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
  const d = new Date(); d.setDate(d.getDate() - days); return d;
}
function parseDate(str) {
  if (!str) return null;
  return new Date(str.replace(/\s/g, '').replace(/\./g, '-').replace(/-$/, ''));
}
function isWithin7Days(dateStr) {
  const d = parseDate(dateStr);
  return !d || isNaN(d.getTime()) || d >= todayMinus(7);
}
function stripHtml(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&nbsp;/g,' ').replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/&#\d+;/g,'').trim();
}

// ── 1. 금융위원회 — Naver 뉴스 스니펫 ─────────────────
async function fetchFSC() {
  try {
    const clientId = process.env.NAVER_CLIENT_ID;
    const clientSecret = process.env.NAVER_CLIENT_SECRET;
    if (!clientId || !clientSecret) throw new Error('Naver API key missing');
    const sevenDaysAgo = todayMinus(7);
    const url = `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent('금융위')}&display=20&sort=date`;
    const res = await fetch(url, {
      headers: { 'X-Naver-Client-Id': clientId, 'X-Naver-Client-Secret': clientSecret },
      signal: AbortSignal.timeout(10000),
    });
    const json = await res.json();
    const items = []; const seenTitles = new Set();
    for (const item of (json.items || [])) {
      const title = stripHtml(item.title);
      const link = item.originallink || item.link;
      const pubDate = new Date(item.pubDate);
      if (isNaN(pubDate.getTime()) || pubDate < sevenDaysAgo) continue;
      const titleKey = title.replace(/\s/g, '').slice(0, 15);
      if ([...seenTitles].some(t => t === titleKey)) continue;
      seenTitles.add(titleKey);
      const pad = n => String(n).padStart(2, '0');
      const date = `${pubDate.getFullYear()}-${pad(pubDate.getMonth()+1)}-${pad(pubDate.getDate())}`;
      items.push({ title, date, url: link, bullets: [stripHtml(item.description || '')] });
      if (items.length >= 10) break;
    }
    return items;
  } catch (e) {
    console.error('FSC fetch error:', e.message); return [];
  }
}

// ── 2. 금융감독원 — 목록만 수집, 요약 없음 ────────────
async function fetchFSS() {
  try {
    const listUrl = 'https://www.fss.or.kr/fss/bbs/B0000188/list.do?menuNo=200218';
    const res = await fetch(listUrl, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const html = await res.text();

    const items = [];
    const trPat = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trPat.exec(html)) !== null) {
      const tr = trMatch[1];
      const linkMatch = tr.match(/<a[^>]+href="(\/fss\/bbs\/B0000188\/view\.do\?nttId=\d+[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      const href = 'https://www.fss.or.kr' + linkMatch[1];
      const title = stripHtml(linkMatch[2]);
      if (!title || title.length < 5) continue;
      const dateMatch = tr.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch || !isWithin7Days(dateMatch[1])) continue;
      items.push({ title, date: dateMatch[1], url: href, bullets: [] });
    }
    return items;
  } catch (e) {
    console.error('FSS fetch error:', e.message); return [];
  }
}

// ── 3. 한국은행 — 목록만 수집, 요약 없음 ─────────────
async function fetchBOK() {
  try {
    const url = 'https://www.bok.or.kr/portal/singl/newsData/listCont.do?pageIndex=&targetDepth=3&menuNo=201263&syncMenuChekKey=1&depthSubMain=&subMainAt=&searchCnd=1&searchKwd=&depth2=200038&depth3=201263';
    const html = await fetchNoSSL(url);
    const items = []; const usedTitles = new Set();
    const liPat = /<li[^>]*bbsRowCls[^>]*>([\s\S]*?)<\/li>/g;
    let liMatch;
    while ((liMatch = liPat.exec(html)) !== null) {
      const block = liMatch[1];
      const dateMatch = block.match(/<span class="date"[^>]*>[\s\S]*?(\d{4}\.\d{2}\.\d{2})/);
      if (!dateMatch || !isWithin7Days(dateMatch[1])) continue;
      const linkMatch = block.match(/<a[^>]+href="(\/portal\/bbs\/[^"]+)"[^>]*class="title"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      const title = stripHtml(linkMatch[2].replace(/<!--[\s\S]*?-->/g, ''));
      if (!title || title.length < 3 || usedTitles.has(title)) continue;
      usedTitles.add(title);
      items.push({ title, date: dateMatch[1].replace(/\./g, '-'), url: 'https://www.bok.or.kr' + linkMatch[1], bullets: [] });
    }
    return items;
  } catch (e) {
    console.error('BOK fetch error:', e.message); return [];
  }
}

// ── 4. 한국부동산원 — 목록만 수집, 요약 없음 ──────────
async function fetchREB() {
  try {
    const listUrl = 'https://www.reb.or.kr/reb/na/ntt/selectNttList.do?mi=9565&bbsId=1154';
    const res = await fetch(listUrl, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    const html = await res.text();
    const items = [];
    const trPat = /<tr[^>]*>([\s\S]*?)<\/tr>/g;
    let trMatch;
    while ((trMatch = trPat.exec(html)) !== null) {
      const tr = trMatch[1];
      const linkMatch = tr.match(/<a[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      const title = stripHtml(linkMatch[1]).replace(/새글/g, '').trim();
      if (!title || title.length < 5) continue;
      const dateMatch = tr.match(/(\d{4}\.\d{2}\.\d{2})/);
      if (!dateMatch || !isWithin7Days(dateMatch[1])) continue;
      const nttIdMatch = tr.match(/nttId[=\(,\s'"]+(\d+)/i);
      const detailUrl = nttIdMatch
        ? `https://www.reb.or.kr/reb/na/ntt/selectNttInfo.do?mi=9565&bbsId=1154&nttId=${nttIdMatch[1]}`
        : listUrl;
      items.push({ title, date: dateMatch[1].replace(/\./g, '-'), url: detailUrl, bullets: [] });
    }
    return items;
  } catch (e) {
    console.error('REB fetch error:', e.message); return [];
  }
}

// ── 메인 핸들러 ────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const [fscItems, fssItems, bokItems, rebItems] = await Promise.allSettled([
      fetchFSC(), fetchFSS(), fetchBOK(), fetchREB()
    ]).then(r => r.map(x => x.status === 'fulfilled' ? x.value : []));

    res.status(200).json({
      timestamp: new Date().toISOString(),
      institutions: {
        fsc: { name: '금융위원회',   items: fscItems },
        fss: { name: '금융감독원',   items: fssItems },
        bok: { name: '한국은행',     items: bokItems },
        reb: { name: '한국부동산원', items: rebItems },
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
