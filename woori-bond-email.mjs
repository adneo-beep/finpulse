import { chromium } from 'playwright';
import nodemailer from 'nodemailer';

const TO = process.env.MAIL_TO || 'bh.won@samsung.com';
const FROM = process.env.MAIL_FROM || 'adneo@naver.com';
const APP_PASS = process.env.NAVER_APP_PASS || 'XTC6KT41MEXS';

async function fetchBondData() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto('https://svc.wooribank.com/svc/Dream?withyou=HBNHB0036&cc=c004893:c004893', {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // 현재 년/월이 이미 선택되어 있으므로 바로 조회
    await page.getByRole('link', { name: '조회' }).click();
    await page.waitForTimeout(2000);

    const rows = await page.evaluate(() => {
      const table = [...document.querySelectorAll('table')].find(t => t.querySelectorAll('tr').length > 3);
      if (!table) return [];
      return [...table.querySelectorAll('tr')].slice(1).map(tr =>
        [...tr.querySelectorAll('td,th')].map(td => td.innerText.trim())
      ).filter(r => r.length >= 4 && r[0].match(/\d{4}\.\d{2}\.\d{2}/));
    });

    if (!rows.length) throw new Error('데이터를 찾을 수 없습니다.');

    // 가장 최근 행 (마지막)
    const latest = rows[rows.length - 1];
    return { date: latest[0], price: latest[1], yield: latest[2], discount: latest[3], allRows: rows };
  } finally {
    await browser.close();
  }
}

async function sendEmail(data) {
  const transporter = nodemailer.createTransport({
    host: 'smtp.naver.com',
    port: 465,
    secure: true,
    auth: { user: FROM, pass: APP_PASS },
  });

  const tableRows = data.allRows.map(r =>
    `<tr><td>${r[0]}</td><td style="text-align:right">${r[1]}</td><td style="text-align:right">${r[2]}%</td><td style="text-align:right">${r[3]}%</td></tr>`
  ).join('\n');

  const html = `
<h3>제1종 국민주택채권 매도단가/수익률/할인율</h3>
<p><b>최신 기준일: ${data.date}</b> &nbsp; 매도단가: <b>${data.price}</b> &nbsp; 수익률: <b>${data.yield}%</b> &nbsp; 할인율: <b>${data.discount}%</b></p>
<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;font-size:13px">
  <tr style="background:#f0f0f0"><th>기준일</th><th>매도단가</th><th>수익률</th><th>할인율</th></tr>
  ${tableRows}
</table>
<p style="color:gray;font-size:11px">※ 할인율은 과세구분(개인) 기준 / 출처: 우리은행 주택도시기금</p>
`;

  await transporter.sendMail({
    from: FROM,
    to: TO,
    subject: `[우리은행] 국민주택채권 시세 (${data.date} 기준)`,
    html,
  });

  console.log(`✅ 이메일 전송 완료 → ${TO} (기준일: ${data.date})`);
}

try {
  console.log('📡 우리은행 채권 데이터 조회 중...');
  const data = await fetchBondData();
  console.log(`📊 최신 데이터: ${data.date} / 매도단가: ${data.price} / 수익률: ${data.yield}% / 할인율: ${data.discount}%`);
  await sendEmail(data);
} catch (err) {
  console.error('❌ 오류:', err.message);
  process.exit(1);
}
