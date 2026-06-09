import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title:       '주담대 금리 비교 | 실시간 주택담보대출 금리 모니터링',
  description: '5대 은행 및 3대 생명보험사의 주택담보대출 금리를 금융감독원 데이터 기반으로 실시간 비교합니다.',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className="h-full" suppressHydrationWarning>
      <body className="min-h-full antialiased" suppressHydrationWarning>{children}</body>
    </html>
  );
}
