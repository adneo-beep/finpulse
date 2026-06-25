/**
 * FinPulse – /api/collect
 * 금융위원회·금융감독원·한국은행·한국부동산원 보도자료 수집
 * FSS 상세 페이지는 JS 렌더링이므로 Playwright로 수집, nttId 기반 Blob 캐시 적용
 */
import https from 'https';
import { put, list } from '@vercel/blob';
import chromium from '@sparticuz/chromium';
import { chromium as playwrightCore } from 'playwright-core';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

const FSS_CACHE_KEY = 'fss-summary-cache.json';

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

// ── HTML → 요약 문장 추출 (BOK·REB용) ─────────────────
function extractSentences(html, max = 3) {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');

  const isJunk = t =>
    t.length < 25 || t.length > 500 ||
    /[|｜]/.test(t) ||
    /바로가기|뉴스레터|Open API|관련사이트|불러오고 있습니다|잠시만 기다려/.test(t) ||
    /^[\d\s\.\-\(\)]+$/.test(t);

  // 1순위: <p> 태그
  const pTexts = [];
  const pPat = /<p[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = pPat.exec(cleaned)) !== null) {
    const t = stripHtml(m[1]).replace(/\s+/g, ' ').trim();
    if (!isJunk(t)) pTexts.push(t);
  }
  if (pTexts.length >= 2) return pTexts.slice(0, max);

  // 2순위: 블록 단위 줄 분리
  const text = cleaned
    .replace(/<\/?(div|li|tr|th|td|h[1-6]|br)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&[a-z#][a-z0-9]*;/gi, '')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*/g, '\n').trim();

  const seen = new Set();
  return text.split('\n').map(l => l.trim()).filter(l => {
    if (isJunk(l)) return false;
    const key = l.slice(0, 15).replace(/\s/g, '');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(0, max);
}

async function fetchDetailSummary(url, useNoSSL = false) {
  try {
    const html = useNoSSL
      ? await fetchNoSSL(url, 8000)
      : await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(8000) }).then(r => r.text());
    return extractSentences(html);
  } catch { return []; }
}

// ── FSS 캐시 (Vercel Blob) ─────────────────────────────
async function loadFSSCache() {
  try {
    const { blobs } = await list({ prefix: FSS_CACHE_KEY });
    if (!blobs.length) return {};
    const res = await fetch(blobs[0].url);
    return await res.json();
  } catch { return {}; }
}

async function saveFSSCache(cache) {
  try {
    await put(FSS_CACHE_KEY, JSON.stringify(cache), {
      access: 'public', addRandomSuffix: false, allowOverwrite: true,
    });
  } catch (e) { console.error('FSS cache save error:', e.message); }
}

// ── FSS Playwright 수집 ────────────────────────────────
async function extractFSSContent(page) {
  // 실제 본문이 로드될 때까지 대기 (JS 렌더링)
  await page.waitForFunction(
    () => {
      const sel = '.view_cont, .bbs_view_cont, .board_view, #contarea, .cont_area';
      const el = document.querySelector(sel);
      return el && el.innerText.trim().length > 50;
    },
    { timeout: 12000 }
  ).catch(() => {});

  return page.evaluate(() => {
    // 본문 컨테이너 후보 (FSS 사이트 구조)
    const candidates = [
      '.view_cont', '.bbs_view_cont', '.board_view .cont',
      '#contarea', '.cont_area', '.view-cont',
    ];
    for (const sel of candidates) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim().length > 80) return el.innerText.trim();
    }
    // fallback: 가장 긴 <p> 들의 텍스트
    const ps = [...document.querySelectorAll('p')]
      .map(p => p.innerText.trim())
      .filter(t => t.length > 30 && !t.includes('|'));
    return ps.slice(0, 5).join('\n');
  });
}

function contentToSentences(raw, max = 3) {
  if (!raw) return [];
  const lines = raw
    .split(/\n+/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(l => l.length > 20 && l.length < 400 && !/[|｜]/.test(l) && !/바로가기/.test(l));
  const seen = new Set();
  return lines.filter(l => {
    const k = l.slice(0, 15).replace(/\s/g, '');
    if (seen.has(k)) return false;
    seen.add(k); return true;
  }).slice(0, max);
}

async function fetchFSSWithPlaywright(newItems) {
  if (!newItems.length) return {};
  let browser;
  const results = {};
  try {
    browser = await playwrightCore.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
    // 순차 처리 (메모리 절약)
    for (const item of newItems) {
      const page = await browser.newPage();
      try {
        await page.goto(item.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const raw = await extractFSSContent(page);
        results[item.nttId] = contentToSentences(raw);
      } catch (e) {
        console.error(`FSS Playwright error (${item.nttId}):`, e.message);
        results[item.nttId] = [];
      } finally {
        await page.close();
      }
    }
  } finally {
    if (browser) await browser.close();
  }
  return results;
}

// ── 1. 금융위원회 ──────────────────────────────────────
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

// ── 2. 금융감독원 (Playwright + Blob 캐시) ─────────────
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
      const linkMatch = tr.match(/<a[^>]+href="(\/fss\/bbs\/B0000188\/view\.do\?nttId=(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
      if (!linkMatch) continue;
      const href = 'https://www.fss.or.kr' + linkMatch[1];
      const nttId = linkMatch[2];
      const title = stripHtml(linkMatch[3]);
      if (!title || title.length < 5) continue;
      const dateMatch = tr.match(/(\d{4}-\d{2}-\d{2})/);
      if (!dateMatch || !isWithin7Days(dateMatch[1])) continue;
      items.push({ title, date: dateMatch[1], url: href, nttId });
    }

    if (!items.length) return [];

    // 캐시 로드 → 신규 항목만 Playwright 처리
    const cache = await loadFSSCache();
    const newItems = items.filter(i => !cache[i.nttId]);

    if (newItems.length) {
      const fetched = await fetchFSSWithPlaywright(newItems);
      Object.assign(cache, fetched);
      await saveFSSCache(cache);
    }

    return items.map(i => ({ ...i, bullets: cache[i.nttId] || [] }));
  } catch (e) {
    console.error('FSS fetch error:', e.message); return [];
  }
}

// ── 3. 한국은행 ────────────────────────────────────────
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
      items.push({ title, date: dateMatch[1].replace(/\./g, '-'), url: 'https://www.bok.or.kr' + linkMatch[1] });
    }
    return items;
  } catch (e) {
    console.error('BOK fetch error:', e.message); return [];
  }
}

// ── 4. 한국부동산원 ────────────────────────────────────
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
      items.push({ title, date: dateMatch[1].replace(/\./g, '-'), url: detailUrl });
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
    // 1단계: 목록 + FSS(Playwright+캐시) 병렬 수집
    const [fscItems, fssItems, bokItems, rebItems] = await Promise.allSettled([
      fetchFSC(), fetchFSS(), fetchBOK(), fetchREB()
    ]).then(r => r.map(x => x.status === 'fulfilled' ? x.value : []));

    // 2단계: BOK·REB 상세 본문 수집 (FSC·FSS는 이미 bullets 포함)
    const addDetail = async (items, useNoSSL = false) =>
      Promise.all(items.map(async item => ({
        ...item,
        bullets: item.bullets ?? await fetchDetailSummary(item.url, useNoSSL),
      })));

    const [fscOut, fssOut, bokOut, rebOut] = await Promise.all([
      Promise.resolve(fscItems),            // FSC: bullets 이미 있음
      Promise.resolve(fssItems),            // FSS: Playwright bullets 이미 있음
      addDetail(bokItems, true),            // BOK: SSL 우회
      addDetail(rebItems, false),           // REB
    ]);

    res.status(200).json({
      timestamp: new Date().toISOString(),
      institutions: {
        fsc: { name: '금융위원회',   items: fscOut },
        fss: { name: '금융감독원',   items: fssOut },
        bok: { name: '한국은행',     items: bokOut },
        reb: { name: '한국부동산원', items: rebOut },
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
