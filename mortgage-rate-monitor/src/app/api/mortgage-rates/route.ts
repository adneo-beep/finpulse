import { NextResponse } from 'next/server';
import type {
  FssApiResponse,
  FssBaseProduct,
  FssOptionProduct,
} from '@/types/mortgage';
import { FIN_GROUP_CODES, FSS_ENDPOINT } from '@/lib/constants';

// ─── 단일 페이지 조회 ─────────────────────────────────────────────────────────────

async function fetchFssPage(
  apiKey: string,
  topFinGrpNo: string,
  pageNo: number,
): Promise<FssApiResponse['result']> {
  const url = new URL(FSS_ENDPOINT);
  url.searchParams.set('auth',         apiKey);
  url.searchParams.set('topFinGrpNo',  topFinGrpNo);
  url.searchParams.set('pageNo',       String(pageNo));

  const res = await fetch(url.toString(), {
    // Next.js 캐시: 1시간 재검증 (금감원 데이터는 월 단위 공시)
    next: { revalidate: 3600 },
    headers: { Accept: 'application/json' },
  });

  if (!res.ok) {
    throw new Error(
      `FSS API HTTP 오류: ${res.status} ${res.statusText} [${topFinGrpNo}]`,
    );
  }

  const json: FssApiResponse = await res.json();

  if (json.result.err_cd !== '000') {
    throw new Error(
      `FSS API 오류 [${json.result.err_cd}]: ${json.result.err_msg}`,
    );
  }

  return json.result;
}

// ─── 전체 페이지 순회 조회 ───────────────────────────────────────────────────────

async function fetchAllPages(
  apiKey: string,
  topFinGrpNo: string,
): Promise<{ baseList: FssBaseProduct[]; optionList: FssOptionProduct[] }> {
  // 1페이지 먼저 조회하여 전체 페이지 수 확인
  const firstPage = await fetchFssPage(apiKey, topFinGrpNo, 1);

  const baseList: FssBaseProduct[]     = [...firstPage.baseList];
  const optionList: FssOptionProduct[] = [...firstPage.optionList];

  // 2페이지 이상 존재하면 병렬 조회
  if (firstPage.max_page_no > 1) {
    const pageNumbers = Array.from(
      { length: firstPage.max_page_no - 1 },
      (_, i) => i + 2,
    );

    const additional = await Promise.all(
      pageNumbers.map((p) => fetchFssPage(apiKey, topFinGrpNo, p)),
    );

    for (const page of additional) {
      baseList.push(...page.baseList);
      optionList.push(...page.optionList);
    }
  }

  return { baseList, optionList };
}

// ─── Route Handler ───────────────────────────────────────────────────────────────

export async function GET() {
  const apiKey = process.env.FSS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: 'FSS_API_KEY 환경 변수가 설정되지 않았습니다. .env.local을 확인하세요.' },
      { status: 500 },
    );
  }

  try {
    // 은행(020000)과 생명보험(050000) 병렬 조회
    const [bankData, insuranceData] = await Promise.all([
      fetchAllPages(apiKey, FIN_GROUP_CODES.BANK),
      fetchAllPages(apiKey, FIN_GROUP_CODES.LIFE_INSURANCE),
    ]);

    return NextResponse.json({
      baseList:   [...bankData.baseList,    ...insuranceData.baseList],
      optionList: [...bankData.optionList,  ...insuranceData.optionList],
      fetchedAt:  new Date().toISOString(),
    });
  } catch (err) {
    console.error('[mortgage-rates API] 오류:', err);

    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : '금감원 API 데이터를 불러오는데 실패했습니다.',
      },
      { status: 502 },
    );
  }
}
