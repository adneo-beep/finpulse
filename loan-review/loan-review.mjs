/**
 * 상업용 대출 만기심사 자동 조회 루틴
 * 사용법: node loan-review.mjs 입력파일.json
 */

import { chromium } from 'playwright';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DIR = path.dirname(fileURLToPath(import.meta.url));

// ── 입력값 로드 ───────────────────────────────────────
const INPUT_FILE = process.argv[2];
if (!INPUT_FILE || !fs.existsSync(INPUT_FILE)) {
  console.error('사용법: node loan-review.mjs 입력파일.json');
  process.exit(1);
}
const INPUT = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf-8'));
console.log(`입력파일: ${INPUT_FILE}`);

// 파일명 접두어: 대출번호가 있으면 대출번호 사용, 없으면 주소 기반 (부산_강서구_명지동_3232)
const ADDR = INPUT.대출번호 || `${INPUT.시도.replace(/특별시|광역시|특별자치시|특별자치도/g,'').trim()}_${INPUT.시군구}_${INPUT.읍면동}_${INPUT.본번}${INPUT.부번 ? '-'+INPUT.부번 : ''}`;

const startTime = Date.now();

// ── 공통 유틸 ─────────────────────────────────────────
const wait = (_page, ms) => new Promise(r => setTimeout(r, ms));

const jsClick = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  if (el) el.click();
}, sel);

const shot = async (page, filename) => {
  const p = path.join(DIR, filename);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`  ✅ 저장: ${filename}`);
  return p;
};

// ── 작업 1: 상가 기준시가 (국세청 홈택스) ────────────
async function task1_기준시가(page) {
  console.log('\n[1/6] 상가 기준시가 조회...');

  await page.goto('https://hometax.go.kr');
  await page.waitForSelector('#mf_wfHeader_header_query', { timeout: 15000 });
  await wait(page, 1000);
  await page.fill('#mf_wfHeader_header_query', '상가 기준시가');
  await jsClick(page, '#mf_wfHeader_wq_uuid_342');
  await wait(page, 4000);

  const found = await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('a'))
      .find(a => a.textContent.trim() === '오피스텔 및 상업용 건물');
    if (target) { target.click(); return '클릭: ' + target.textContent.trim(); }
    return '못찾음';
  });
  console.log('  메뉴:', found);
  await wait(page, 4000);

  // 법정동검색 팝업
  await page.waitForSelector('#mf_txppWframe_btnLdCdPop', { timeout: 20000 });
  await wait(page, 800);
  await jsClick(page, '#mf_txppWframe_btnLdCdPop');
  await page.waitForSelector('#mf_txppWframe_UTECMAAA08_wframe_inputSchNm', { timeout: 10000 });
  await wait(page, 500);
  await page.fill('#mf_txppWframe_UTECMAAA08_wframe_inputSchNm', INPUT.읍면동);
  await jsClick(page, '#mf_txppWframe_UTECMAAA08_wframe_trigger6');
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('#mf_txppWframe_UTECMAAA08 tr')).length > 1,
    { timeout: 8000 }
  ).catch(() => {});
  await wait(page, 500);

  const selected = await page.evaluate(({ sido, dong }) => {
    const rows = Array.from(document.querySelectorAll('#mf_txppWframe_UTECMAAA08 tr'))
      .filter(r => r.textContent.includes(sido) && r.textContent.includes(dong));
    if (rows.length === 0) return '행없음';
    const btn = Array.from(rows[0].querySelectorAll('button, input[type="button"]'))
      .find(b => (b.textContent.trim() || b.value) === '선택');
    if (btn) { btn.click(); return '선택완료'; }
    return '선택버튼없음';
  }, { sido: INPUT.시도.substring(0, 2), dong: INPUT.읍면동 });
  console.log('  법정동:', selected);
  if (selected !== '선택완료') throw new Error('법정동 선택 실패: ' + selected);
  await wait(page, 2000);

  // 본번 입력
  await page.waitForSelector('#mf_txppWframe_txtBunj', { timeout: 10000 });
  await page.click('#mf_txppWframe_txtBunj', { clickCount: 3 });
  await page.type('#mf_txppWframe_txtBunj', INPUT.본번, { delay: 80 });
  await wait(page, 200);

  // 부번 입력
  if (INPUT.부번) {
    await page.evaluate(bubn => {
      const candidates = [
        '#mf_txppWframe_txtBubn', '#mf_txppWframe_txtBnji',
        '#mf_txppWframe_txtBunji', '#mf_txppWframe_txtBuno',
      ];
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el) { el.value = bubn; ['input','change'].forEach(ev => el.dispatchEvent(new Event(ev,{bubbles:true}))); return; }
      }
      const bunj = document.querySelector('#mf_txppWframe_txtBunj');
      if (bunj) {
        const all = Array.from(document.querySelectorAll('input[type="text"]'));
        const idx = all.indexOf(bunj);
        if (idx >= 0 && all[idx+1]) {
          all[idx+1].value = bubn;
          ['input','change'].forEach(ev => all[idx+1].dispatchEvent(new Event(ev,{bubbles:true})));
        }
      }
    }, INPUT.부번);
    await wait(page, 200);
  }

  // 건물명 입력
  await page.click('#mf_txppWframe_txtBldNm', { clickCount: 3 });
  await page.type('#mf_txppWframe_txtBldNm', INPUT.건물명, { delay: 50 });
  await wait(page, 300);

  // 건물 검색
  await jsClick(page, '#mf_txppWframe_btnSchBld');
  await wait(page, 3000);

  // 건물동 링크 클릭
  const bldClicked = await page.evaluate(({ dong, bldName }) => {
    window._bldName = bldName;
    const dongNum = dong.replace('동', '');
    const korToEng = { '에이': 'A', '비': 'B', '씨': 'C', '디': 'D', '이': 'E', '에프': 'F' };
    const eng = korToEng[dongNum] || null;
    const links = Array.from(document.querySelectorAll('a')).filter(a => a.offsetParent !== null);
    const target = links.find(a => {
      const t = a.textContent.trim();
      if (t.includes(dongNum + '동')) return true;
      if (eng && (t.includes(eng + '동') || t === eng)) return true;
      return false;
    }) || links.find(a => {
      const t = a.textContent.trim();
      return t.includes(dongNum) || (eng && t.includes(eng));
    });
    if (target) { target.click(); return '건물클릭: ' + target.textContent.trim().substring(0, 40); }
    const storedName = window._bldName || '';
    const first = links.find(a => {
      const t = a.textContent.trim();
      return t.length > 3 && !t.includes('바로가기') && !t.includes('본문')
        && (storedName ? t.includes(storedName) : true);
    });
    if (first) { first.click(); return '첫번째클릭: ' + first.textContent.trim().substring(0, 40); }
    return '건물링크없음';
  }, { dong: INPUT.건물동, bldName: INPUT.건물명 });
  console.log('  ', bldClicked);
  await wait(page, 2000);

  // 동 드롭다운
  await page.waitForFunction(
    () => (document.querySelector('#mf_txppWframe_selBldComp')?.options.length ?? 0) > 1,
    { timeout: 10000 }
  ).catch(() => {});
  const dongSel = await page.evaluate(dong => {
    const sel = document.querySelector('#mf_txppWframe_selBldComp');
    const realOpts = Array.from(sel?.options || []).filter(o => o.text !== '선택하세요' && o.text.trim() !== '');
    const num = dong.replace('동', '');
    const korToEng2 = { '에이': 'A', '비': 'B', '씨': 'C', '디': 'D', '이': 'E', '에프': 'F' };
    const eng2 = korToEng2[num] || null;
    const opt = realOpts.find(o => o.text.includes(num))
      || (eng2 ? realOpts.find(o => o.text.toUpperCase().includes(eng2)) : null)
      || (realOpts.length === 1 ? realOpts[0] : null);
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); return '동:' + opt.text; }
    return '동없음:' + Array.from(sel?.options||[]).map(o=>o.text).join(',');
  }, INPUT.건물동);
  console.log('  ', dongSel);
  await wait(page, 1500);

  // 층 드롭다운
  await page.waitForFunction(
    () => (document.querySelector('#mf_txppWframe_selBldFlor')?.options.length ?? 0) > 1,
    { timeout: 10000 }
  ).catch(() => {});
  const florSel = await page.evaluate(layer => {
    const sel = document.querySelector('#mf_txppWframe_selBldFlor');
    const opts = Array.from(sel?.options || []).filter(o => o.text !== '선택하세요');
    let opt;
    if (layer.includes('지하')) {
      opt = opts.find(o => o.text.includes('지하층') || o.text.includes('지하') || o.text.startsWith('B')) || opts[0];
    } else {
      const num = layer.replace('층', '').trim();
      opt = opts.find(o => !o.text.includes('지하') && (o.text === num || o.text === num + '층' || o.text.startsWith(num + '(')))
        || opts.find(o => !o.text.includes('지하') && o.text.includes(num));
    }
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); return '층:' + opt.text; }
    return '층없음:' + opts.map(o=>o.text).join(',');
  }, INPUT.층);
  console.log('  ', florSel);
  await wait(page, 1500);

  // 호 드롭다운
  await page.waitForFunction(
    () => (document.querySelector('#mf_txppWframe_selBldHo')?.options.length ?? 0) > 1,
    { timeout: 10000 }
  ).catch(() => {});
  const hoSel = await page.evaluate(ho => {
    const sel = document.querySelector('#mf_txppWframe_selBldHo');
    const num = ho.replace('호', '');
    const opt = Array.from(sel?.options || []).find(o => o.text === num || o.text.includes(num));
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); return '호:' + opt.text; }
    return '호없음:' + Array.from(sel?.options||[]).map(o=>o.text).join(',');
  }, INPUT.호);
  console.log('  ', hoSel);
  await wait(page, 1000);

  // 고시년도 최근연도
  await page.evaluate(() => {
    const sel = document.querySelector('#mf_txppWframe_selNotcDt');
    const opt = Array.from(sel?.options || []).find(o => /^\d{4}$/.test(o.text));
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); }
  });
  await wait(page, 300);

  await jsClick(page, '#mf_txppWframe_btnSchTsv');
  await wait(page, 3000);

  // 데이터 추출: 기준시가 결과 테이블
  const data1 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    return rows.map(r => Array.from(r.querySelectorAll('th, td')).map(c => c.textContent.trim()))
               .filter(r => r.length > 1 && r.some(c => c.length > 0));
  });

  await shot(page, `${ADDR}_기준시가.png`);
  return data1;
}

// ── 작업 2: 매각가율 (법원경매정보) ──────────────────
async function task2_매각가율(page) {
  console.log('\n[2/6] 매각가율 조회...');
  await page.goto('https://www.courtauction.go.kr/pgj/index.on?w2xPath=/pgj/ui/pgj100/PGJ164M01.xml');
  await wait(page, 4000);

  await page.evaluate(sido => {
    for (const sel of document.querySelectorAll('select')) {
      const opt = Array.from(sel.options).find(o => o.text.includes(sido.substring(0,2)));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); break; }
    }
  }, INPUT.시도);
  await wait(page, 1500);

  await page.evaluate(sgg => {
    for (const sel of document.querySelectorAll('select')) {
      const opt = Array.from(sel.options).find(o => o.text.includes(sgg));
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); break; }
    }
  }, INPUT.시군구);
  await wait(page, 1000);

  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll('button, input[type="button"], input[type="submit"]'))
      .find(b => (b.textContent || b.value || '').match(/검색|조회/));
    if (btn) btn.click();
  });
  await wait(page, 3000);

  const data2 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    return rows.map(r => Array.from(r.querySelectorAll('th, td')).map(c => c.textContent.trim()))
               .filter(r => r.length > 1 && r.some(c => c.length > 0));
  });

  await shot(page, `${ADDR}_매각가율.png`);
  return data2;
}

// ── 작업 3: 사업자등록상태 (국세청 홈택스) ───────────
async function task3_사업자상태(page) {
  console.log('\n[3/6] 사업자등록상태 조회...');
  await page.goto('https://hometax.go.kr/websquare/websquare.html?w2xPath=/ui/pp/index_pp.xml&tmIdx=43&tm2lIdx=4306000000&tm3lIdx=4306080000');
  await wait(page, 4000);

  if (!INPUT.사업자등록번호) {
    console.log('  ⚠️ 사업자등록번호 없음');
    return shot(page, `${ADDR}_사업자상태.png`);
  }

  const rawNo = INPUT.사업자등록번호.replace(/-/g, '');
  const bizNo = `${rawNo.slice(0,3)}-${rawNo.slice(3,5)}-${rawNo.slice(5)}`;

  await page.waitForSelector('#mf_txppWframe_bsno', { timeout: 15000 });
  await page.evaluate(no => {
    const comp = window['mf_txppWframe_bsno'];
    if (comp?.setValue) { comp.setValue(no); return; }
    const inp = document.querySelector('#mf_txppWframe_bsno');
    if (inp) { inp.value = no; ['input','change'].forEach(ev => inp.dispatchEvent(new Event(ev,{bubbles:true}))); }
  }, bizNo);
  await wait(page, 500);

  await jsClick(page, '#mf_txppWframe_trigger5');
  await wait(page, 5000);

  const data3 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    const tableData = rows.map(r => Array.from(r.querySelectorAll('th, td')).map(c => c.textContent.trim()))
                         .filter(r => r.length > 1 && r.some(c => c.length > 0));
    if (tableData.length > 0) return tableData;
    // 텍스트로 상태 추출
    const body = document.body?.innerText || '';
    const match = body.match(/(정상영업|폐업|휴업|부존재|해당 없음)/);
    return match ? [[match[1]]] : [['결과 없음']];
  });

  await shot(page, `${ADDR}_사업자상태.png`);
  return data3;
}

// ── 작업 4: 토지이용계획 + 건축물정보 (토지이음) ─────
async function task4_토지이음(page) {
  console.log('\n[4/6] 토지이용계획 조회...');

  await page.goto('https://www.eum.go.kr/web/ar/lu/luLandDet.jsp');
  await wait(page, 4000);

  // 토지이용계획 탭 선택
  await page.evaluate(() => {
    const target = Array.from(document.querySelectorAll('a, button, input[type="radio"], label'))
      .filter(el => el.offsetParent !== null)
      .find(el => el.textContent.trim() === '토지이용계획' || el.value === '토지이용계획'
        || el.textContent.trim().includes('토지이용'));
    if (target) target.click();
  });
  await wait(page, 1000);

  // 시도 선택 → 시군구 AJAX 로딩 대기 → 시군구 선택 → 읍면동 AJAX 대기 → 읍면동 선택
  const selectOpt = async (text, prevText) => {
    await page.evaluate(v => {
      for (const sel of document.querySelectorAll('select')) {
        const opt = Array.from(sel.options).find(o => o.text.includes(v));
        if (opt && sel.value !== opt.value) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); break; }
      }
    }, text);
  };

  await selectOpt(INPUT.시도.substring(0, 2));
  await wait(page, 500);
  // 시군구 AJAX 대기
  await page.waitForFunction(v => {
    const sels = Array.from(document.querySelectorAll('select'));
    return sels.some(sel => Array.from(sel.options).some(o => o.text.includes(v)));
  }, { timeout: 10000 }, INPUT.시군구).catch(() => wait(page, 2000));
  await selectOpt(INPUT.시군구);
  await wait(page, 500);
  // 읍면동 AJAX 대기
  await page.waitForFunction(v => {
    const sels = Array.from(document.querySelectorAll('select'));
    return sels.some(sel => Array.from(sel.options).some(o => o.text.includes(v)));
  }, { timeout: 10000 }, INPUT.읍면동).catch(() => wait(page, 2000));
  await selectOpt(INPUT.읍면동);
  await wait(page, 1000);

  // 일반 선택
  await page.evaluate(() => {
    const r = Array.from(document.querySelectorAll('input[type="radio"]'))
      .find(r => (r.labels?.[0]?.textContent?.trim() || r.nextSibling?.textContent?.trim() || r.parentElement?.textContent?.trim()) === '일반');
    if (r) { r.click(); return; }
    for (const sel of document.querySelectorAll('select')) {
      const opt = Array.from(sel.options).find(o => o.text.trim() === '일반');
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); return; }
    }
  });
  await wait(page, 500);

  // 본번 입력
  await page.waitForSelector('#bobn', { timeout: 10000 });
  await page.fill('#bobn', INPUT.본번);
  await wait(page, 300);

  // 부번 입력
  if (INPUT.부번) {
    await page.evaluate(bubn => {
      const el = document.querySelector('#bubn');
      if (el) { el.value = bubn; el.dispatchEvent(new Event('input',{bubbles:true})); return; }
      const bobn = document.querySelector('#bobn');
      if (bobn) {
        const all = Array.from(document.querySelectorAll('input[type="text"]'));
        const idx = all.indexOf(bobn);
        if (idx >= 0 && all[idx+1]) { all[idx+1].value = bubn; all[idx+1].dispatchEvent(new Event('input',{bubbles:true})); }
      }
    }, INPUT.부번);
    await wait(page, 300);
  }

  // 열람 버튼
  await page.evaluate(() => {
    const btn = document.querySelector('.schbottom a')
      || Array.from(document.querySelectorAll('a, button')).filter(b => b.offsetParent !== null)
           .find(b => b.textContent.trim() === '열람');
    if (btn) btn.click();
  });
  await wait(page, 6000);

  // 오류 모달이 떴으면 닫기
  await page.evaluate(() => {
    const closeBtn = Array.from(document.querySelectorAll('button, a, span'))
      .find(el => el.offsetParent !== null &&
        (el.textContent.trim() === '×' || el.textContent.trim() === '닫기' ||
         el.className?.includes('close') || el.getAttribute('aria-label') === '닫기'));
    if (closeBtn) closeBtn.click();
  });
  await wait(page, 500);

  const data4 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    return rows.map(r => Array.from(r.querySelectorAll('th, td')).map(c => c.textContent.trim()))
               .filter(r => r.length > 1 && r.some(c => c.length > 0));
  });

  await shot(page, `${ADDR}_토지이용계획.png`);

  // 건축물 정보 팝업
  const popupPromise = page.waitForEvent('popup', { timeout: 10000 }).catch(() => null);
  await page.locator('a', { hasText: '건축물 정보' }).first().click()
    .catch(() => page.locator('a:has-text("건축물")').first().click().catch(() => {}));
  await wait(page, 1500);
  const popup = await popupPromise;
  if (popup) {
    await popup.waitForLoadState('domcontentloaded');
    await wait(popup, 4000);
    await shot(popup, `${ADDR}_건축물정보.png`);
    await popup.close();
  } else {
    await wait(page, 2000);
    await shot(page, `${ADDR}_건축물정보.png`);
  }

  return data4;
}

// ── 용도지역 추출 (task4 data에서) ───────────────────
function extract용도지역(data4) {
  if (!data4) return null;
  // 세부 용도지역 (도시지역 제외, 구체적인 것 우선)
  const 세부키워드 = [
    '전용주거지역', '제1종전용주거', '제2종전용주거',
    '제1종일반주거', '제2종일반주거', '제3종일반주거',
    '준주거지역',
    '중심상업지역', '일반상업지역', '근린상업지역', '유통상업지역',
    '전용공업지역', '일반공업지역', '준공업지역',
    '자연녹지지역', '생산녹지지역', '보전녹지지역',
    '보전관리지역', '생산관리지역', '계획관리지역',
    '농림지역', '자연환경보전지역',
  ];
  // 1차: 세부 용도지역명이 정확히 있는 셀 찾기
  for (const kw of 세부키워드) {
    for (const row of data4) {
      for (const cell of row) {
        if (cell.includes(kw)) return kw;
      }
    }
  }
  // 2차: 짧은 키워드로 찾되 "도시지역" 단독은 제외
  const 단축키워드 = ['준주거', '중심상업', '일반상업', '근린상업', '유통상업', '준공업', '일반공업', '전용공업', '자연녹지', '생산녹지', '보전녹지', '농림'];
  for (const kw of 단축키워드) {
    for (const row of data4) {
      for (const cell of row) {
        if (cell.includes(kw)) {
          const m = cell.match(/[가-힣0-9종]+지역/g);
          if (m) return m.find(v => v !== '도시지역') || m[0];
        }
      }
    }
  }
  return null;
}

// ── 작업 5: 지가변동률 (한국부동산원) ────────────────
async function task5_지가변동률(page, data4) {
  console.log('\n[5/6] 지가변동률 조회...');

  const 용도지역 = extract용도지역(data4);
  console.log(`  토지이용계획 용도지역: ${용도지역 || '추출 실패'}`);

  await page.goto('https://www.reb.or.kr/r-one/portal/calc/lfrCalcPage.do');
  await wait(page, 4000);

  // 조회기준: 시군구 선택
  await page.evaluate(() => {
    const r = Array.from(document.querySelectorAll('input[type="radio"]'))
      .find(r => r.value?.includes('SGG') || r.labels?.[0]?.textContent?.includes('시군구')
        || r.parentElement?.textContent?.includes('시군구'));
    if (r) r.click();
  });
  await wait(page, 800);

  // 시도 선택 (id: inputSido)
  await page.evaluate(sido => {
    const sel = document.querySelector('#inputSido');
    const opt = Array.from(sel?.options || []).find(o => o.text.includes(sido));
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); }
  }, INPUT.시도.substring(0, 2));
  await wait(page, 2000);

  // 시군구 로딩 대기 후 선택 (id: inputSgg)
  await page.waitForFunction(
    () => (document.querySelector('#inputSgg')?.options.length ?? 0) > 1,
    { timeout: 10000 }
  ).catch(() => {});
  await page.evaluate(sgg => {
    const sel = document.querySelector('#inputSgg');
    const opt = Array.from(sel?.options || []).find(o => o.text.includes(sgg));
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); }
  }, INPUT.시군구);
  await wait(page, 1000);

  // 시작일자: 해당 연도 1월 1일 (id: inputStartDt)
  const startDate = `${new Date().getFullYear()}0101`;
  await page.evaluate(dt => {
    const inp = document.querySelector('#inputStartDt');
    if (inp) { inp.value = dt; ['input','change'].forEach(ev => inp.dispatchEvent(new Event(ev,{bubbles:true}))); }
  }, startDate);
  await wait(page, 300);

  // 검색 버튼: id="search_btn" 직접 클릭
  await page.evaluate(() => {
    const btn = document.querySelector('#search_btn')
      || Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === '검색' && b.id !== 'global-search-button');
    if (btn) btn.click();
  });
  // AJAX 결과 로딩 대기
  await page.waitForFunction(() => {
    const tds = Array.from(document.querySelectorAll('table td'));
    return tds.some(td => td.textContent.trim().length > 1);
  }, { timeout: 15000 }).catch(() => {});
  await wait(page, 1000);

  // 결과 테이블 추출 (4컬럼 이상)
  const allRows = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    return rows.map(r => Array.from(r.querySelectorAll('th, td')).map(c => c.textContent.trim()))
               .filter(r => r.length >= 4 && r.some(c => c.length > 0));
  });

  // 헤더 이후 데이터 행만
  const headerIdx = allRows.findIndex(r => r.some(c => c === '용도지역' || c === '지가변동률'));
  const dataRows = headerIdx >= 0 ? allRows.slice(headerIdx + 1) : allRows;

  // 용도지역 → 테이블 약어 매핑
  const 용도지역매핑 = (uz) => {
    if (!uz) return null;
    if (uz.includes('주거')) return '주거';
    if (uz.includes('상업')) return '상업';
    if (uz.includes('공업')) return '공업';
    if (uz.includes('녹지')) return '녹지';
    if (uz.includes('보전관리')) return '보전관리';
    if (uz.includes('생산관리')) return '생산관리';
    if (uz.includes('계획관리')) return '계획관리';
    if (uz.includes('관리')) return '관리';
    if (uz.includes('농림')) return '농림';
    if (uz.includes('자연환경')) return '자보';
    return uz;
  };

  const tableKey = 용도지역매핑(용도지역);
  const matchedRow = tableKey ? dataRows.find(r => r.some(c => c === tableKey || c.includes(tableKey))) : null;

  if (matchedRow) {
    console.log(`  ✅ 용도지역 [${용도지역} → ${tableKey}]: ${matchedRow.join(' | ')}`);
  } else {
    console.log(`  ⚠️ 매칭 실패 (${용도지역} → ${tableKey})`);
  }

  await shot(page, `${ADDR}_지가변동률.png`);

  return {
    용도지역,
    matched: matchedRow,
    allRows,
  };
}

// ── 작업 6: 개별공시지가 (부동산공시가격알리미) ───────
async function task6_공시지가(page) {
  console.log('\n[6/6] 개별공시지가 조회...');
  await page.goto('https://www.realtyprice.kr/notice/gsindividual/search.htm');
  await wait(page, 3000);

  // 지번검색 탭
  await page.evaluate(() => {
    const img = Array.from(document.querySelectorAll('img')).find(i => i.alt === '지번검색');
    const a = img?.closest('a') || img?.parentElement;
    if (a) a.click();
  });
  await wait(page, 500);

  // 시도 (jQuery trigger 필수)
  await page.evaluate(sido => {
    const sel = document.querySelector('#sido_list');
    const opt = Array.from(sel.options).find(o => o.text === sido);
    if (opt) sel.value = opt.value;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    if (window.jQuery) window.jQuery(sel).trigger('change');
  }, INPUT.시도);
  await wait(page, 2000);

  // 시군구
  await page.waitForFunction(() => (document.querySelector('#sgg_list')?.options.length ?? 0) > 0, { timeout: 10000 });
  await page.evaluate(sgg => {
    const sel = document.querySelector('#sgg_list');
    const opt = Array.from(sel.options).find(o => o.text.includes(sgg));
    if (!opt) return;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    if (window.jQuery) window.jQuery(sel).trigger('change');
  }, INPUT.시군구);
  await wait(page, 2000);

  // 읍면동
  await page.waitForFunction(() => (document.querySelector('#eub_list')?.options.length ?? 0) > 0, { timeout: 10000 });
  await page.evaluate(dong => {
    const sel = document.querySelector('#eub_list');
    const opt = Array.from(sel.options).find(o => o.text.includes(dong));
    if (!opt) return;
    sel.value = opt.value;
    sel.dispatchEvent(new Event('change',{bubbles:true}));
    if (window.jQuery) window.jQuery(sel).trigger('change');
  }, INPUT.읍면동);
  await wait(page, 1500);

  // 일반
  await page.evaluate(() => {
    const r = Array.from(document.querySelectorAll('input[type="radio"]'))
      .find(r => (r.labels?.[0]?.textContent?.trim() || r.nextSibling?.textContent?.trim() || r.parentElement?.textContent?.trim()) === '일반');
    if (r) { r.click(); return; }
    for (const sel of document.querySelectorAll('select')) {
      const opt = Array.from(sel.options).find(o => o.text.trim() === '일반');
      if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change',{bubbles:true})); if (window.jQuery) window.jQuery(sel).trigger('change'); return; }
    }
  });
  await wait(page, 500);

  // 본번
  await page.evaluate(bun => {
    const inp = Array.from(document.querySelectorAll('input[name="bun1"]'))
      .find(i => i.type !== 'hidden' && i.offsetParent !== null);
    if (inp) { inp.value = bun; inp.dispatchEvent(new Event('input',{bubbles:true})); }
  }, INPUT.본번);
  await wait(page, 200);

  // 부번
  if (INPUT.부번) {
    await page.evaluate(bubn => {
      const inp = Array.from(document.querySelectorAll('input[name="bun2"], input[name="bubn"]'))
        .find(i => i.type !== 'hidden' && i.offsetParent !== null);
      if (inp) { inp.value = bubn; inp.dispatchEvent(new Event('input',{bubbles:true})); return; }
      const bun1 = Array.from(document.querySelectorAll('input[name="bun1"]'))
        .find(i => i.type !== 'hidden' && i.offsetParent !== null);
      if (bun1) {
        const all = Array.from(document.querySelectorAll('input[type="text"]')).filter(i => i.offsetParent !== null);
        const idx = all.indexOf(bun1);
        if (idx >= 0 && all[idx+1]) { all[idx+1].value = bubn; all[idx+1].dispatchEvent(new Event('input',{bubbles:true})); }
      }
    }, INPUT.부번);
    await wait(page, 200);
  }

  await page.getByRole('button', { name: '검색' }).click();
  await wait(page, 3000);

  const data6 = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('table tr'));
    return rows.map(r => Array.from(r.querySelectorAll('th, td')).map(c => c.textContent.trim()))
               .filter(r => r.length > 1 && r.some(c => c.length > 0));
  });

  await shot(page, `${ADDR}_공시지가.png`);
  return data6;
}

// ── Excel 문서 생성 ───────────────────────────────────
function makeExcel(collected) {
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const fullAddr = `${INPUT.시도} ${INPUT.시군구} ${INPUT.읍면동} ${INPUT.본번}번지${INPUT.부번 ? '-'+INPUT.부번 : ''}`;
  const buildingInfo = [INPUT.건물명, INPUT.건물동, INPUT.층, INPUT.호].filter(Boolean).join(' ');

  const sections = [
    { title: '1. 상가 기준시가 (국세청 홈택스)',      data: collected[0] },
    { title: '2. 매각가율 (법원경매정보)',              data: collected[1] },
    { title: '3. 사업자등록상태 (국세청 홈택스)',      data: collected[2] },
    { title: '4. 토지이용계획 (토지이음)',              data: collected[3] },
    { title: '5. 지가변동률 (한국부동산원)',             data: collected[4]?.allRows },
    { title: '6. 개별공시지가 (부동산공시가격알리미)',  data: collected[5] },
  ];

  const wb = XLSX.utils.book_new();

  // 시트 1: 요약 (모든 항목을 세로로 나열)
  const summaryRows = [
    ['상업용 대출 만기심사 조회 자료'],
    ['소재지', fullAddr],
    ...(buildingInfo ? [['건물', buildingInfo]] : []),
    ...(INPUT.사업자등록번호 ? [['사업자등록번호', INPUT.사업자등록번호]] : []),
    ['조회일', today],
    [],
  ];

  for (const sec of sections) {
    summaryRows.push([sec.title]);
    if (sec.data && sec.data.length > 0) {
      for (const row of sec.data) summaryRows.push(row);
    } else {
      summaryRows.push(['데이터 없음']);
    }
    summaryRows.push([]);
  }

  const ws = XLSX.utils.aoa_to_sheet(summaryRows);
  ws['!cols'] = [{ wch: 40 }, { wch: 30 }, { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 20 }];
  XLSX.utils.book_append_sheet(wb, ws, '요약');

  // 시트 2~7: 항목별 시트
  const sheetNames = ['기준시가', '매각가율', '사업자상태', '토지이용계획', '지가변동률', '공시지가'];
  sections.forEach((sec, i) => {
    const rows = sec.data && sec.data.length > 0 ? sec.data : [['데이터 없음']];
    const sheet = XLSX.utils.aoa_to_sheet([[sec.title], [], ...rows]);
    sheet['!cols'] = Array(10).fill({ wch: 25 });
    XLSX.utils.book_append_sheet(wb, sheet, sheetNames[i]);
  });

  const outPath = path.join(DIR, `${ADDR}_요약.xlsx`);
  XLSX.writeFile(wb, outPath);
  console.log(`\n  ✅ Excel 요약 저장: ${ADDR}_요약.xlsx`);
}

// ── 메인 ─────────────────────────────────────────────
async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`상업용 대출 만기심사 자동 조회`);
  console.log(`${INPUT.시도} ${INPUT.시군구} ${INPUT.읍면동} ${INPUT.본번}번지`);
  console.log(`파일명 접두어: ${ADDR}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  page.on('dialog', async d => { try { await d.accept(); } catch {} });

  const collected = [null, null, null, null, null, null];
  try {
    collected[0] = await task1_기준시가(page);
    collected[1] = await task2_매각가율(page);
    collected[2] = await task3_사업자상태(page);
    collected[3] = await task4_토지이음(page);
    collected[4] = await task5_지가변동률(page, collected[3]);
    collected[5] = await task6_공시지가(page);
  } catch (err) {
    console.error('\n❌ 오류:', err.message);
  }

  try {
    makeExcel(collected);
  } catch (err) {
    console.error('\n❌ Excel 생성 오류:', err.message);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log(`\n⏱  총 소요시간: ${Math.floor(elapsed/60)}분 ${elapsed%60}초`);
  await browser.close();
}

main();
