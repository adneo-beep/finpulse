import { chromium } from 'playwright';
import nodemailer from 'nodemailer';

const RECIPIENTS = [
  'young_kyu.lee@samsung.com',
  'rex.lee@samsung.com',
  'eunjuoh.oh@samsung.com',
  'hojoon.moon@samsung.com',
  'cw0082.song@samsung.com',
  'yejin.ahn@samsung.com',
  'jh1973.choi@samsung.com',
  'doohwan1.lee@samsung.com',
  'eunok0412.park@samsung.com',
  'minyoung520.jung@samsung.com',
  'bh.won@samsung.com',
];

const FROM = process.env.MAIL_FROM || 'adneo@naver.com';
const APP_PASS = process.env.NAVER_APP_PASS || 'XTC6KT41MEXS';

async function fetchWoori(page) {
  await page.goto('https://svc.wooribank.com/svc/Dream?withyou=HBNHB0036&cc=c004893:c004893', {
    waitUntil: 'networkidle', timeout: 30000,
  });
  await page.getByRole('link', { name: '조회' }).click();
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const table = [...document.querySelectorAll('table')].find(t => t.querySelectorAll('tr').length > 3);
    if (!table) return [];
    return [...table.querySelectorAll('tr')]
      .slice(1)
      .map(tr => [...tr.querySelectorAll('td,th')].map(td => td.innerText.trim()))
      .filter(r => r.length >= 4 && r[0].match(/\d{4}\.\d{2}\.\d{2}/))
      .reverse()
      .map(r => ({ date: r[0], discount: r[3], price: r[1] }));
  });
}

async function fetchKB(page) {
  await page.goto('https://okbfex.kbstar.com/quics?page=C028010#CP', {
    waitUntil: 'networkidle', timeout: 30000,
  });
  await page.getByRole('button', { name: '조회' }).click();
  await page.waitForTimeout(2000);

  return page.evaluate(() => {
    const table = [...document.querySelectorAll('table')].find(t => t.querySelectorAll('tr').length > 3);
    if (!table) return [];
    return [...table.querySelectorAll('tr')]
      .slice(1)
      .map(tr => [...tr.querySelectorAll('td,th')].map(td => td.innerText.trim()))
      .filter(r => r.length >= 3 && r[0].match(/\d{4}-\d{2}-\d{2}/))
      .map(r => ({ date: r[0], discount: r[1].replace(/\s*%/, ''), price: r[2].replace(/\s*원/, '') }));
  });
}

function buildTable(rows) {
  const trs = rows.map(r =>
    `<tr><td>${r.date}</td><td style="text-align:right">${r.discount}%</td><td style="text-align:right">${r.price}원</td></tr>`
  ).join('\n');
  return `
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px;min-width:320px">
  <tr style="background:#f0f0f0;text-align:center"><th>기준일</th><th>할인율</th><th>매도단가</th></tr>
  ${trs}
</table>`;
}

async function sendEmail(woori, kb) {
  const latest = woori[0];
  const transporter = nodemailer.createTransport({
    host: 'smtp.naver.com', port: 465, secure: true,
    auth: { user: FROM, pass: APP_PASS },
  });

  const html = `
<h2 style="color:#333">제1종 국민주택채권 매도단가/할인율</h2>
<p style="color:#666;font-size:13px">기준일: <b>${latest.date}</b> &nbsp;|&nbsp; 매도단가: <b>${latest.price}원</b> &nbsp;|&nbsp; 할인율: <b>${latest.discount}%</b></p>

<h3 style="margin-top:24px;color:#00499a">🏦 우리은행</h3>
${buildTable(woori)}

<h3 style="margin-top:24px;color:#ffb800">🏦 KB국민은행</h3>
${buildTable(kb)}

<p style="margin-top:20px;color:gray;font-size:11px">
  ※ 할인율은 과세구분(개인) 기준<br>
  ※ 출처: 우리은행 주택도시기금, KB국민은행 국민주택채권
</p>`;

  await transporter.sendMail({
    from: FROM,
    to: RECIPIENTS.join(', '),
    subject: `[국민주택채권] 매도단가/할인율 (${latest.date} 기준)`,
    html,
  });

  console.log(`✅ 이메일 전송 완료 → ${RECIPIENTS.length}명 (기준일: ${latest.date})`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
try {
  console.log('📡 우리은행 데이터 조회 중...');
  const woori = await fetchWoori(page);
  console.log(`  → ${woori.length}건 (최신: ${woori[0].date})`);

  console.log('📡 KB국민은행 데이터 조회 중...');
  const kb = await fetchKB(page);
  console.log(`  → ${kb.length}건 (최신: ${kb[0].date})`);

  await sendEmail(woori, kb);
} catch (err) {
  console.error('❌ 오류:', err.message);
  process.exit(1);
} finally {
  await browser.close();
}
