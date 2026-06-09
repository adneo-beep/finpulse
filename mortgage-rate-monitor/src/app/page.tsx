import { Dashboard } from '@/components/Dashboard';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─── 헤더 ─── */}
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* 로고 + 타이틀 */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-lg shadow-sm">
              🏠
            </div>
            <div>
              <h1 className="text-base font-bold leading-tight text-gray-900">
                주담대 금리 비교
              </h1>
              <p className="text-xs leading-tight text-gray-500">
                주택담보대출 실시간 금리 모니터링
              </p>
            </div>
          </div>

          {/* 데이터 출처 표시 */}
          <div className="hidden items-center gap-1.5 sm:flex">
            <span className="text-xs text-gray-400">데이터 출처</span>
            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
              금융감독원 금융상품 한눈에
            </span>
          </div>
        </div>
      </header>

      {/* ─── 메인 콘텐츠 ─── */}
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Dashboard />
      </main>

      {/* ─── 푸터 ─── */}
      <footer className="border-t border-gray-200 bg-white py-6 mt-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-gray-400">
            © 2026 주담대 금리 비교 · 금융감독원 금융상품 한눈에 API 연동
          </p>
        </div>
      </footer>
    </div>
  );
}
