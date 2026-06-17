import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, ShadingType, convertInchesToTwip
} from 'docx';
import { writeFileSync } from 'fs';

const BLUE = '1F4E79';
const LIGHT_BLUE = 'BDD7EE';
const YELLOW = 'FFF2CC';
const GREEN = 'E2EFDA';
const RED = 'FCE4D6';
const GRAY = 'F2F2F2';

function h1(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 200 },
  });
}

function h2(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 300, after: 150 },
  });
}

function h3(text) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 200, after: 100 },
  });
}

function body(text, options = {}) {
  return new Paragraph({
    children: [new TextRun({ text, size: 22, font: '맑은 고딕', ...options })],
    spacing: { before: 80, after: 80 },
  });
}

function bold(text) {
  return body(text, { bold: true });
}

function bullet(text, level = 0) {
  return new Paragraph({
    children: [new TextRun({ text, size: 21, font: '맑은 고딕' })],
    bullet: { level },
    spacing: { before: 60, after: 60 },
  });
}

function quote(text) {
  return new Paragraph({
    children: [new TextRun({ text: `"${text}"`, size: 21, font: '맑은 고딕', italics: true, color: '444444' })],
    indent: { left: convertInchesToTwip(0.3) },
    spacing: { before: 100, after: 100 },
    shading: { type: ShadingType.CLEAR, fill: YELLOW },
  });
}

function divider() {
  return new Paragraph({
    text: '─'.repeat(60),
    spacing: { before: 200, after: 200 },
    run: { color: 'CCCCCC' },
  });
}

function spacer() {
  return new Paragraph({ text: '', spacing: { before: 100, after: 100 } });
}

function makeTable(headers, rows, shadeHeader = true) {
  const headerRow = new TableRow({
    children: headers.map(h => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: h, bold: true, size: 20, font: '맑은 고딕', color: 'FFFFFF' })],
        alignment: AlignmentType.CENTER,
      })],
      shading: { type: ShadingType.CLEAR, fill: BLUE },
    })),
    tableHeader: true,
  });

  const dataRows = rows.map((row, ri) => new TableRow({
    children: row.map(cell => new TableCell({
      children: [new Paragraph({
        children: [new TextRun({ text: cell, size: 20, font: '맑은 고딕' })],
      })],
      shading: { type: ShadingType.CLEAR, fill: ri % 2 === 0 ? 'FFFFFF' : GRAY },
    })),
  }));

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
  });
}

// ─────────────────────────────────────────────
const doc = new Document({
  styles: {
    default: {
      document: { run: { font: '맑은 고딕', size: 22 } },
    },
    paragraphStyles: [
      {
        id: 'Heading1', name: 'Heading 1', basedOn: 'Normal',
        run: { bold: true, size: 32, color: BLUE, font: '맑은 고딕' },
        paragraph: { spacing: { before: 400, after: 200 } },
      },
      {
        id: 'Heading2', name: 'Heading 2', basedOn: 'Normal',
        run: { bold: true, size: 26, color: '2E75B6', font: '맑은 고딕' },
        paragraph: { spacing: { before: 300, after: 150 } },
      },
      {
        id: 'Heading3', name: 'Heading 3', basedOn: 'Normal',
        run: { bold: true, size: 23, color: '404040', font: '맑은 고딕' },
        paragraph: { spacing: { before: 200, after: 100 } },
      },
    ],
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top: convertInchesToTwip(1),
          right: convertInchesToTwip(1),
          bottom: convertInchesToTwip(1),
          left: convertInchesToTwip(1),
        },
      },
    },
    children: [

      // ── 표지 ──────────────────────────────────
      new Paragraph({
        children: [new TextRun({ text: '대치동 영재고 입시 시장 심층 분석 리포트', bold: true, size: 52, font: '맑은 고딕', color: BLUE })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 600, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Dschool 커뮤니티 영재고/영재학교 키워드 게시글·댓글 약 300건 기반', size: 22, font: '맑은 고딕', color: '666666' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: '분석 기준일: 2026년 6월 10일  |  방법: 조회수·댓글수 High-Engagement 가중치 적용', size: 20, font: '맑은 고딕', color: '888888' })],
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 600 },
      }),
      divider(),
      spacer(),

      // ── Section 1 ─────────────────────────────
      h1('1. 데이터 요약 및 트렌드 스냅샷'),

      h2('반응 최상위 TOP 5 게시글'),
      spacer(),
      makeTable(
        ['순위', '주제', '반응', '핵심 메시지'],
        [
          ['1위', '서울대 재종학원에 영재고생이 왜 이렇게 많나요?', '댓글 98개', '영재고→의대 유턴 현상. 모 영재고 1등~꼴찌 다 의대 공공연한 비밀'],
          ['2위', '영재고 입결·가면 인생이 피는가?', '댓글 23개, 조회 1,800+', '영재고 서열 내 편차 크고, 탑은 서울대·카이스트지만 중하위권은 불확실'],
          ['2위', '광주과고 수도권에서 도전해볼까요?', '댓글 23개, 조회 1,552', '합격선에 맞춰 지방 영재고 전략적 선택하는 트렌드 확인'],
          ['3위', '영재고 가성비 논쟁 – 이공계라면 영재고가 나을까요?', '댓글 20개, 조회 1,526', '커뮤니티 최대 논쟁. "공대 확실하면 영재고" vs "리스크 크다" 팽팽'],
          ['4위', '영재고 안되면 과고 패쓰하고 일반고?', '댓글 12개, 조회 893', '과고 메리트 하락 인식 확산. 영재고 불합 시 일반고 직행 트렌드 증가'],
        ]
      ),
      spacer(),

      h2('2026 대치동 영재고 입시 3대 핵심 키워드'),
      spacer(),

      h3('① 의대 유턴(U-Turn) — 최고 Hot 이슈'),
      quote('모 영재고 1등부터 꼴찌까지 다 의대라던데 공공연한 비밀이지만 현역 재수삼수까지해서요'),
      bullet('영재고 진학의 명분(이공계·서울대)과 현실(의대 유턴) 사이의 괴리가 폭발적 공감'),
      bullet('2028 수능제도 변경(과탐2 가산 폐지)으로 영재고→정시 의대 루트 매력 감소 우려'),
      bullet('영재고 가서 서울대 공대 갔다가 의대 N수 하는 케이스 여전히 많다는 선배맘 증언 다수'),
      spacer(),

      h3('② 선행 인플레이션 vs 적정 선행 — 핵심 갈등'),
      quote('CMS 입반테스트에서 평균보다 20점 이상 높게 나왔어도 선행이 늦다고 느낀다'),
      bullet('영재고 대비 학원 입반테스트 자체가 이미 고도화되어 "늦게 시작"의 기준이 계속 올라가는 현상'),
      bullet('초6부터 본격 준비하는 그룹 vs "초6 겨울~중1 시작으로도 충분하다"는 경험담이 충돌'),
      bold('→ 결론적 공감대: "아이가 원해야 버틸 수 있다" — 부모 주도 강제 선행의 한계를 경험자들이 강하게 경고'),
      spacer(),

      h3('③ 학원 지각변동 — 신규 학원 등장과 구도 재편'),
      quote('픽스는 유명선생님들이 만들었다지만 신생이라…CMS는 비주류가 되어가는 건가요?'),
      bullet('아카로드→픽스 유명 강사 이탈로 대치동 영재고 학원 판도 재편 중'),
      bullet('다원(과학 특화)이 양적 실적 1위이나 "인원 대비 합격률"에 의문 제기'),
      bullet('CMS: 전통 강자이나 과학 부문을 시리우스로 분리 후 실적 저하 논란'),
      spacer(),
      divider(),

      // ── Section 2 ─────────────────────────────
      h1('2. 반응도 기반 핵심 입시 로드맵'),

      h2('수학 진도 가이드 — 대치동 공감대 표준 로드맵'),
      spacer(),
      makeTable(
        ['시기', '목표 수준', '주요 내용'],
        [
          ['초5~6', '중등 수학 선행 시작', '중1~중3 수준. 연산·개념 완성. 강제 선행 금물'],
          ['초6 겨울~중1', '본격 준비 적기 (경험자 공감 최다)', 'CMS/미래탐구 입반테스트 응시. 창의수학 기초반 입문'],
          ['중1~중2 초', '공통수학 완성 + 대수 선행', 'KMO 1차 기초 개념 입문(정수론·조합)'],
          ['중2', 'KMO 1차 집중', '기하(순수증명)+조합 취약영역 보강 必. 대수10주+미적분1 10주 병행'],
          ['중3', 'KMO 2차 / 수학 지필 파이널', '미적분 완성 + KMO 스타일 파이널 문제풀이'],
        ]
      ),
      spacer(),

      h3('KMO 진입/하차 시기 — 학부모 현실 조언'),
      spacer(),
      makeTable(
        ['상황', '커뮤니티 추천 행동'],
        [
          ['중1 시작, 창의수학 평균 2배 이상', 'KMO + 창의수학 병행 적극 추천'],
          ['중2 시작, KMO 경험 없음', 'KMO 하차 후 창의수학 주말단과 집중이 효율적'],
          ['켐오(KCO) 그닥이면', '멈췄던 수학 선행 재개가 맞다 — 올림피아드 고집 不要'],
          ['CMS 입반테스트 평균 20점↑', '경시 경험 없어도 영재고 도전 의미 있음'],
        ]
      ),
      spacer(),
      quote('KMO는 거의 필수지만 1차 입상 못해도 창의수학 실력이 있으면 2단계 통과 가능 — KMO가 전부는 아니다'),
      spacer(),

      h2('과학 진도 가이드 — 물화생지 로드맵'),
      spacer(),
      makeTable(
        ['시기', '목표', '상세 내용'],
        [
          ['중1~중2 초', '중등 물화 완성', '중등 물리·화학 완성. 브릿지 과정 포함. 올림물리 수준 중등 물리 심화'],
          ['중2 중반~중3', '고등 물화1 선행 + 심화', '화학2(진로화학) 검토. KCO(화학올림피아드) 준비와 연계. 벡터·역학/원자구조·산염기'],
          ['영재고 지필 선택', '물리+화학 조합 표준', '생물 선택은 KBO 준비생에 한해 유리. 생물·지구과학은 1단계 서류 이후 집중도 가능'],
        ]
      ),
      spacer(),

      h3('올림피아드 실적 필요성 — 현실적 판단'),
      spacer(),
      makeTable(
        ['올림피아드', '권장 수준', '이유'],
        [
          ['KMO(수학)', '사실상 필수 경험', '지필 수학 스타일과 동일'],
          ['KCO(화학)', '강력 권장', '화학 선행과 완전 연계, 준비 효율 최고'],
          ['KPhO(물리)', '권장', '물리 심화와 연계'],
          ['KBO(생물)', '선택적', '생물 선택시에만'],
          ['지구과학올림피아드', '낮은 우선순위', '지필 출제 비중 낮음'],
        ]
      ),
      spacer(),
      divider(),

      // ── Section 3 ─────────────────────────────
      h1('3. 대치동 영재고 학원가 전체 맵(Map) 분석'),

      h2('주요 학원 장단점 비교'),
      spacer(),
      makeTable(
        ['학원명', '포지션', '강점', '약점', '커뮤니티 평가'],
        [
          ['다원', '과학 실적 1위(양적)', '과학 커리큘럼 완성도, 합격자 수 최다', '인원 많아 인원 대비 합격률 의문', '과학은 다원이 정평'],
          ['픽스', '신흥 강자', '유명 강사진 집결(아카로드 출신)', '신생학원, 검증된 자체 실적 미비', '"이전 학원 실적을 자기 것이라 할 수 있나?" 논란'],
          ['CMS', '전통 수학 강자', '수학 창의반 체계화, 입반테스트 공신력', '과학 부문 시리우스 분리 후 실적 저하 논란', '수학은 여전히 인정'],
          ['미래탐구', '수과학 통합', '영재고 커리 체계적, 과학 수준 높음', '상담이 학원 유리한 방향으로 치우침 주의', '박준형T(화학) 인기'],
          ['아카로드', '하락세', '과거 유명 강사진', '픽스로 강사 이탈 후 공동화 우려', '"우루루 다 나가버린 것 같다"'],
          ['파인만영재고', '특화 소수정예', '서민국T 등 개인 강사 리뷰 다수', '학원 규모 작음', '개인 강사 평가 활발 (리뷰 25개)'],
        ]
      ),
      spacer(),

      h2('학부모들이 꼭 거쳐야 한다고 입 모은 필수 라인업'),

      h3('수학 필수 코스'),
      bullet('CMS 또는 다원 "영재고 대비반 입반테스트" → 현재 실력 객관적 파악의 기준점'),
      bullet('창의수학반(주 1~2회) — KMO 대비와 병행 → 대치동 공감대: "창의수학 없이 영재고 지필 수학은 무리"'),
      bullet('기하/조합 취약시 → 단과 보강 (깊은생각 또는 소수정예 과외)'),
      spacer(),

      h3('과학 필수 코스'),
      bullet('다원 과학 OR 미래탐구 물화 과정 → "과학은 다원" 대치동 정론'),
      bullet('화학: 미탐 박준형T / 다원 이명희T — 양강 구도 → 댓글 반응: "선생님마다 특색 있으니 상담 후 결정"'),
      bullet('KCO(화학올림피아드) 준비생은 화2(진로화학) 수강 병행'),
      spacer(),

      h3('대치동 표준 주간 편성 예시 (중2 영재고 대비생)'),
      spacer(),
      makeTable(
        ['요일', '과목', '내용', '시간'],
        [
          ['월·수', '수학', '창의수학 + KMO 대비', '3~4시간'],
          ['화·목', '과학', '물화 심화', '3~4시간'],
          ['토', '수학 단과', '기하/조합 취약보강 또는 올림피아드 준비', '3시간'],
          ['일', '자습', '개념 정리 + 기출 복습', '자율'],
        ]
      ),
      spacer(),
      quote('원서 쓸 때가 다 되어가는데 국어 영어 학원도 그만 두었어요 — 중3 2학기부터 수과학 집중 위해 국영 학원 과감히 정리 多'),
      spacer(),
      divider(),

      // ── Section 4 ─────────────────────────────
      h1('4. 3단계 캠프 및 구술면접 합격 시크릿'),

      h2('3단계 캠프의 실체'),
      quote('캠프는 1.5대 1에서 2대 1 경쟁률. 추가 합격은 거의 없다고 보면 된다'),
      spacer(),
      makeTable(
        ['평가 핵심 요소', '세부 내용'],
        [
          ['협력·소통 능력', '친구들과의 팀 프로젝트 — 리더십보다 협력이 핵심'],
          ['언어 습관', '비속어 쓰면 탈락 — 평소 언어 습관이 실제로 당락에 영향'],
          ['탐구 호기심', '수학·과학 개념에 대한 자연스러운 호기심 표현'],
          ['사고 과정', '압박 상황에서 답이 틀려도 논리적 접근이 중요'],
        ]
      ),
      spacer(),
      quote('천재보다 꾸준한 아이들이 좋은 성적을 거둔다. 시키는 걸 다하는 아이들이 좀 더 좋은 성적을 가져간다'),
      spacer(),

      h2('생기부·자소서 관리 핵심 팁'),
      quote('코로나 이전에는 수과학 A면 통과였는데, 코로나 이후에는 성실한 학생을 선호하게 되어 서류 강화. 합격율 50% 이하'),
      spacer(),
      makeTable(
        ['항목', '대치동 실전 팁'],
        [
          ['내신 관리', 'All A가 사실상 필수 (수과학뿐 아니라 전과목). "B 하나에도 탈락 가능"'],
          ['세특(세부능력특기사항)', '수과학 교사의 구체적 기술 필수. "00학생은 수업 중 ~~에 대해 스스로 질문하고..." 식의 능동적 호기심 증거'],
          ['자소서 핵심 전략', '① "왜 지원했나" ② "우리가 왜 뽑아야 하나" — 학교 홈페이지 교육 활동과 연결하여 작성'],
          ['자소서 실수 주의', '"과장하면 면접에서 적나라하게 드러남" — 실제 경험한 탐구 과정을 구체적으로'],
          ['추천서', '수학 또는 과학 담당 교사에게 별도 요청. 한과영 장영실 전형 등 별도 확인'],
          ['한과영 특이사항', '"정확한 답이 없는 문제가 출제됨 — 별도 준비 필요". 장영실 전형(교장 추천 20명 우선) 생기부 더욱 중요'],
        ]
      ),
      spacer(),
      divider(),

      // ── Section 5 ─────────────────────────────
      h1('5. 리스크 관리 및 유턴(U-Turn) 전략'),

      h2('대치동 학부모들의 가장 큰 시행착오 TOP 5'),

      h3('① "경시 학원이 밀어넣기로 아이를 망쳤다" — 최다 언급'),
      quote('영재고 준비 선행 정도 경시학원은 하면 된다 하고 입테에서 떨어뜨리지도 않아요. 한 명이라도 밀어 넣기 바쁜 곳이 경시학원'),
      bullet('학원 입반테스트의 진입 장벽 낮아 → 실력 과대평가 → 무리한 시작 → 자신감 붕괴 패턴 반복'),
      bullet('시작반임에도 고등 과학 선행한 친구들 기준으로 빠르게 진도 → 아이가 따라가지 못하고 이탈'),
      spacer(),

      h3('② "초등부터 트랙에 올려 탈락 후 방황" — 가장 치명적'),
      quote('영재고 떨어지고 방황한다는 건 초등부터 영재고 트랙으로만 달려온 케이스입니다'),
      bullet('일반고 대비를 전혀 하지 않은 상태에서 탈락 → 국어·사탐 무지한 상태로 일반고 진학'),
      bold('방지책: 영재고 트랙에서도 국어·독서·영어 기본기는 유지'),
      spacer(),

      h3('③ "블로그·인스타 합격 로드맵 사기" — 최근 급증'),
      quote('5~6명 모아 60만원, 학부모가 운영하는 로드맵. 차라리 학원 데스크 가서 물어보는 게 낫다'),
      bullet('검증되지 않은 학부모 컨설팅(10~200만원 대)이 SNS에서 급증'),
      bullet('대치동 학부모들 냉소: "탑반은 다 정해져 있는데 로드맵으로 될 일이 아님"'),
      spacer(),

      h3('④ 과도한 학원비로 경제적 압박 → 아이 심리 영향'),
      quote('기존 학원비에서 몇백 더 들어요. 원서 쓸 때 되니 국어 영어 학원도 그만두었어요'),
      bullet('수과학 집중 시 월 학원비 300~500만원 수준'),
      bullet('경제적 부담이 아이에게 전이되어 오히려 수행력 저하'),
      spacer(),

      h3('⑤ 아이 성향 무시한 부모 주도 준비'),
      quote('영재고는 어린나이에 입시 치를 준비가 되어있고 자기 힘으로 밀어붙일 수 있는 아이들이 버텨요. 흥미가 없으면 그 과정 버티기 힘들어요'),
      spacer(),

      h2('영재고 실패 시 플랜B — 대치동 유턴 전략'),
      spacer(),
      makeTable(
        ['분기점', '추천 경로'],
        [
          ['공대 진로 확실, 수과학 압도적', '과고 도전 → 실패 시 일반고'],
          ['진로 미결정, 국영 강점 있음', '일반고 직행, 수과학 계속 심화'],
          ['의대 희망 있음', '일반고 직행, 내신 최우선'],
        ]
      ),
      spacer(),

      h2('일반고 전환 후 생존 전략'),
      quote('영재고 과학고 일반고로 흩어진 친구들 결국 같은 데서 다 만납니다'),
      spacer(),
      makeTable(
        ['과목', '전환 전략'],
        [
          ['수학', '영재고 준비로 쌓인 선행을 "내신 최상위 무기"로 전환 → 일반고 수학 내신에서 압도적 우위 가능'],
          ['국어·사회', '즉시 복원 (영재고 준비 중 방치한 과목) → 독서·비문학 기초부터 빠르게 정상화'],
          ['과학', '심화 유지하면서 내신 적응 → 물화생지 선행이 내신에서 강점'],
          ['목표 재설정', '이공계 확실: 수시/정시 → 진로 미결: 수시/정시 모두 → 의대: 내신 전과목 1등급 사수'],
        ]
      ),
      spacer(),
      divider(),

      // ── 최종 인사이트 ──────────────────────────
      h1('최종 종합 인사이트'),
      new Paragraph({
        children: [new TextRun({ text: '대치동 선배맘들의 진짜 결론', bold: true, size: 26, font: '맑은 고딕', color: BLUE })],
        spacing: { before: 200, after: 150 },
      }),
      quote('영재고 떨어지고 과학고 가서 조기졸업 했는데, 영재고·과학고·일반고로 흩어진 친구들 결국 같은 데서 다 만납니다.'),
      spacer(),
      bullet('영재고 준비는 낭비가 아니다 — 어느 고등을 가든 선행의 자산은 남음'),
      bullet('아이의 의지가 핵심 변수 — 부모 주도로 밀어붙인 케이스의 실패율이 압도적으로 높음'),
      bullet('2028 입시 변화를 주목하라 — 과탐2 가산 폐지로 영재고→의대 정시 루트 약화 예상, 전략 재점검 필요'),
      bullet('"결국 이 동네 고등 전교권인 애들은 똑같이 시켜도 걔네들이 잘하는 거예요"'),
      spacer(),
      spacer(),
      new Paragraph({
        children: [new TextRun({ text: '본 리포트는 Dschool 커뮤니티 실제 데이터(조회수·댓글수 가중치 적용)를 기반으로 작성되었습니다.', size: 18, font: '맑은 고딕', color: '888888', italics: true })],
        alignment: AlignmentType.CENTER,
      }),
    ],
  }],
});

const buffer = await Packer.toBuffer(doc);
writeFileSync('영재고_입시_분석보고서.docx', buffer);
console.log('완료: 영재고_입시_분석보고서.docx 생성됨');
