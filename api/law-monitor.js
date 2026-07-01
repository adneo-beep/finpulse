/**
 * 법규·판례 모니터링 – /api/law-monitor
 * law.go.kr 공개 목록 화면(AJAX)을 직접 조회 (인증/IP 등록 불필요, 서버리스 배포에 적합)
 * 5개 부처(금융위·개인정보위·권익위·인권위·감사원) 최근 법령 개정 + 최근 판례를 즉시 조회하여 반환
 */

const RECENT_DAYS = 90;
const CASE_LIMIT = 20;
const NEW_DAYS = 7;

const TARGET_MINISTRIES = ['금융위원회', '개인정보보호위원회', '국민권익위원회', '국가인권위원회', '감사원'];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function toIsoDate(korDate) {
  const m = (korDate || '').trim().match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!m) return '';
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function matchMinistry(cell) {
  // 공동소관 법령은 "국가인권위원회,행정안전부"처럼 콤마로 묶여 내려오므로 부분 일치로 판단
  return TARGET_MINISTRIES.find(m => cell.includes(m)) || null;
}

async function fetchLaws() {
  const body = 'q=*&outmax=2000&p2=1,2,3&p4=110401,110402,110403,110404,110405,110406,110407&p19=1,3&pg=1&fsort=21,11,31&lsType=7&section=lawNm&lsiSeq=0&p9=1,2,4';
  const res = await fetch('https://www.law.go.kr/lsScListR.do?menuId=1&subMenuId=23&tabMenuId=121', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': UA,
      referer: 'https://www.law.go.kr/lsSc.do?menuId=1&subMenuId=23&tabMenuId=121',
    },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`법령 목록 요청 실패: HTTP ${res.status}`);
  const html = await res.text();
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/);
  if (!tbodyMatch) throw new Error('법령 목록 tbody를 찾을 수 없음');

  const rows = tbodyMatch[0].split('<tr').slice(1);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RECENT_DAYS);
  const newCutoff = new Date();
  newCutoff.setDate(newCutoff.getDate() - NEW_DAYS);

  const laws = [];
  for (const raw of rows) {
    const row = '<tr' + raw;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(m =>
      m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    );
    if (cells.length < 8) continue;
    const [, nameCell, promDateCell, typeCell, promNoCell, effDateCell, amendCell, ministryCell] = cells;
    const ministry = matchMinistry(ministryCell);
    if (!ministry) continue;

    const promulgationDate = toIsoDate(promDateCell);
    if (!promulgationDate || new Date(promulgationDate) < cutoff) continue;

    const idMatch = row.match(/lsViewWideAll\('(\d+)'/);
    const lsiSeq = idMatch ? idMatch[1] : '';

    laws.push({
      ministry,
      name: nameCell,
      promulgationDate,
      type: typeCell,
      promulgationNo: promNoCell,
      effectiveDate: toIsoDate(effDateCell),
      amendType: amendCell,
      summary: '',
      link: lsiSeq ? `https://www.law.go.kr/lsInfoP.do?lsiSeq=${lsiSeq}` : 'https://www.law.go.kr',
      isNew: new Date(promulgationDate) >= newCutoff,
    });
  }
  laws.sort((a, b) => (a.promulgationDate < b.promulgationDate ? 1 : a.promulgationDate > b.promulgationDate ? -1 : 0));
  laws.forEach((l, idx) => { l.id = idx + 1; });
  return laws;
}

async function fetchCases() {
  const body = 'q=*&section=bdyText&outmax=100&pg=1&fsort=21,10,30&precSeq=0&dtlYn=N';
  const res = await fetch('https://www.law.go.kr/precScListR.do?menuId=7&subMenuId=47&tabMenuId=213', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'x-requested-with': 'XMLHttpRequest',
      'user-agent': UA,
      referer: 'https://www.law.go.kr/precSc.do?menuId=7&subMenuId=47&tabMenuId=213',
    },
    body,
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`판례 목록 요청 실패: HTTP ${res.status}`);
  const html = await res.text();
  const tbodyMatch = html.match(/<tbody[\s\S]*?<\/tbody>/);
  if (!tbodyMatch) throw new Error('판례 목록 tbody를 찾을 수 없음');

  const rows = tbodyMatch[0].split('<tr').slice(1).map(r => '<tr' + r);
  const newCutoff = new Date();
  newCutoff.setDate(newCutoff.getDate() - NEW_DAYS);

  const cases = [];
  let i = 0;
  let num = 1;
  while (i < rows.length && cases.length < CASE_LIMIT) {
    const titleRow = rows[i];
    const linkMatch = titleRow.match(/showExternalLink\('[^']*',\s*'[^']*',\s*'([^']*)'\)/);
    const bracketMatch = titleRow.match(/\[([^\[\]]*?)(\d{4}\.\s*\d{1,2}\.\s*\d{1,2}\.)\s*([^\]]*)\]/);
    const titleTextMatch = titleRow.match(/<a[^>]*>\s*([\s\S]*?)\s*<span/);

    let detail = '';
    if (i + 1 < rows.length && !rows[i + 1].includes('rowspan')) {
      const detailMatch = rows[i + 1].match(/<p class="tx">([\s\S]*?)<\/p>/);
      detail = detailMatch
        ? detailMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
        : rows[i + 1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      i += 2;
    } else {
      i += 1;
    }

    if (!bracketMatch || !titleTextMatch) continue;
    const title = titleTextMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const court = bracketMatch[1].trim();
    const date = toIsoDate(bracketMatch[2]);
    const caseNo = bracketMatch[3].trim();

    cases.push({
      summary: `${num}. ${title} [${court} ${bracketMatch[2]} ${caseNo}]`,
      detail,
      court,
      date,
      caseNo,
      keywords: title.includes('심리불속행') ? ['심리불속행'] : [],
      link: linkMatch ? linkMatch[1] : 'https://www.law.go.kr/precSc.do',
      isNew: date ? new Date(date) >= newCutoff : false,
    });
    num++;
  }
  cases.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  cases.forEach((c, idx) => { c.id = idx + 1; });
  return cases;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const [laws, cases] = await Promise.allSettled([fetchLaws(), fetchCases()]).then(r =>
    r.map(x => (x.status === 'fulfilled' ? x.value : []))
  );

  res.status(200).json({
    lastUpdated: new Date().toISOString(),
    laws,
    cases,
  });
}
