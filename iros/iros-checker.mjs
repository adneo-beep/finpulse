/**
 * 인터넷등기소 부동산등기 신청사건 처리현황 조회
 *
 * 사용법:
 *   node iros-checker.mjs "부산 해운대구 우동 1405-1 마린시티자이 2103" "정현석"
 *   node iros-checker.mjs "주소" "소유자이름"
 */

import { chromium } from 'playwright';

const ID = 'sslife1';
const PW = '!q2w3e4r';

async function checkIros(addressKeyword, ownerName) {
  const browser = await chromium.launch({ headless: false }); // headless: true 로 바꾸면 창 안 뜸
  const page = await browser.newPage();

  try {
    // 1. 접속 및 로그인
    await page.goto('https://www.iros.go.kr/index.jsp');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(1000);
    // 헤더 로그인 드롭다운 열기 (첫 번째 '로그인' 링크 = 드롭다운 트리거)
    await page.locator('a.w2anchor2').filter({ hasText: /^로그인$/ }).first().click();
    await page.waitForTimeout(400);
    // 드롭다운 두 번째 '로그인' = 실제 로그인 페이지 링크
    await page.locator('a.w2anchor2').filter({ hasText: /^로그인$/ }).nth(1).click();
    await page.waitForTimeout(1000);
    await page.getByRole('textbox', { name: '아이디입력' }).fill(ID);
    await page.getByRole('textbox', { name: '비밀번호입력' }).fill(PW);
    await page.getByRole('button', { name: '로그인' }).click();
    await page.waitForLoadState('networkidle');

    // 2. 부동산등기 신청사건 메뉴
    await page.locator('#mf_wfm_potal_main_wf_header_gen_depth1_2_spa_top_menu1').click();
    await page.locator('#mf_wfm_potal_main_wf_header_gen_depth1_2_gen_depth2_2_gen_depth3_0_btn_top_menu3a').click();
    await page.waitForLoadState('networkidle');

    // 3. 간편검색 탭 선택
    await page.locator('#mf_wfm_potal_main_wfm_content_tac_tab_control_tab_tab_simpleSrch_tabHTML').click();

    // 4. 시/도 선택 (주소에서 자동 추출 또는 직접 지정)
    const sidoMap = {
      '서울': '서울특별시', '부산': '부산광역시', '대구': '대구광역시',
      '인천': '인천광역시', '광주': '광주광역시', '대전': '대전광역시',
      '울산': '울산광역시', '세종': '세종특별자치시', '경기': '경기도',
      '강원': '강원특별자치도', '충북': '충청북도', '충남': '충청남도',
      '전북': '전북특별자치도', '전남': '전라남도', '경북': '경상북도',
      '경남': '경상남도', '제주': '제주특별자치도',
    };
    let sido = '전체';
    for (const [key, val] of Object.entries(sidoMap)) {
      if (addressKeyword.includes(key)) { sido = val; break; }
    }
    if (sido !== '전체') {
      await page.locator('[id$="sel_admin_cd1_input_0"]').selectOption(sido);
    }

    // 5. 주소 입력 및 조회
    await page.getByRole('textbox', { name: '간편검색어주소정보' }).fill(addressKeyword);
    await page.getByRole('link', { name: '조회', description: '간편검색탭조회버튼' }).click();
    await page.waitForTimeout(1500);

    // 6. 검색결과 팝업 - 첫 번째 부동산 라디오 선택 후 '선택' 버튼
    await page.locator('label.w2radio_label').first().click();
    await page.locator('input[value="선택"]').click();
    await page.waitForTimeout(1500);

    // 7. 메인 페이지 '부동산 소재지번 선택' 표의 첫 행 '선택' 클릭 → 등기신청인 팝업 열림
    await page.waitForSelector('[id*="grd_realOwnrInfo_cell_0_0"]', { timeout: 10000 });
    await page.locator('[id*="grd_realOwnrInfo_cell_0_0"]').click();
    await page.waitForTimeout(1000);

    // 8. 등기신청인 조회 팝업 - 소유자 선택 후 이름 입력
    await page.waitForSelector('label[for$="rad_input_name_cls_input_1"]', { timeout: 10000 });
    await page.locator('label[for$="rad_input_name_cls_input_1"]').click(); // 소유자 라디오
    await page.getByRole('textbox', { name: '등기신청인 또는 소유자입력' }).fill(ownerName);
    await page.getByRole('link', { name: '확인', exact: true }).click();
    await page.waitForTimeout(2000);

    // 8. 결과 파싱
    const rows = page.locator('table').filter({ hasText: '접수일자' }).locator('tbody tr');
    const count = await rows.count();

    const results = [];
    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).locator('td');
      const 접수일자 = await cells.nth(2).innerText().catch(() => '');
      const 접수번호 = await cells.nth(3).innerText().catch(() => '');
      const 등기목적 = await cells.nth(8).innerText().catch(() => '');
      const 처리상태 = await cells.nth(9).innerText().catch(() => '');
      if (접수번호.trim()) {
        results.push({ 접수일자: 접수일자.trim(), 접수번호: 접수번호.trim(), 등기목적: 등기목적.trim(), 처리상태: 처리상태.trim() });
      }
    }

    console.log('\n===== 부동산등기 신청사건 처리현황 =====');
    console.log(`주소: ${addressKeyword}`);
    console.log(`소유자: ${ownerName}`);
    console.log('─'.repeat(60));
    if (results.length === 0) {
      console.log('조회된 사건이 없습니다. (최근 2개월 이내 접수 건만 조회됩니다)');
    } else {
      for (const r of results) {
        console.log(`접수일자: ${r.접수일자}  |  접수번호: ${r.접수번호}  |  등기목적: ${r.등기목적}  |  처리상태: ${r.처리상태}`);
      }
    }
    console.log('─'.repeat(60));

    return results;

  } finally {
    await browser.close();
  }
}

// 커맨드라인 인수 처리
const args = process.argv.slice(2);
if (args.length < 2) {
  console.log('사용법: node iros-checker.mjs "주소 키워드" "소유자 이름"');
  console.log('예시:   node iros-checker.mjs "우동 1405-1 마린시티자이 2103" "정현석"');
  process.exit(1);
}

checkIros(args[0], args[1]).catch(console.error);
