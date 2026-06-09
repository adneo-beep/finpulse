import https from 'https';

function fetchNoSSL(url, timeoutMs = 12000, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), timeoutMs);
    const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: false });
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      ...extraHeaders,
    };
    const req = https.get(url, { headers, agent }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        clearTimeout(timer);
        if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
          fetchNoSSL(res.headers.location, timeoutMs, extraHeaders).then(resolve).catch(reject);
        } else {
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString('utf-8') });
        }
      });
    });
    req.on('error', e => { clearTimeout(timer); reject(e); });
  });
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const results = {};

  const candidates = [
    ['fsc_main', 'https://www.fsc.go.kr/no010101'],
    ['fsc_mobile', 'https://m.fsc.go.kr/no010101'],
    ['fsc_http', 'http://www.fsc.go.kr/no010101'],
  ];

  for (const [name, url] of candidates) {
    try {
      const r = await fetchNoSSL(url, 8000);
      const body = r.body || '';
      results[name] = {
        status: r.status,
        length: body.length,
        dates: body.match(/\d{4}-\d{2}-\d{2}/g)?.slice(0,5) || [],
        links: body.match(/\/no010101\/\d+/g)?.slice(0,3) || [],
      };
    } catch(e) {
      results[name] = { error: e.message };
    }
  }

  res.status(200).json(results);
}
