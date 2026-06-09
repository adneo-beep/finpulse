interface ErrorDisplayProps {
  message: string;
  onRetry: () => void;
}

export function ErrorDisplay({ message, onRetry }: ErrorDisplayProps) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-10 text-center">
      <div className="mb-4 text-5xl">⚠️</div>
      <h3 className="mb-2 text-lg font-semibold text-red-800">
        데이터를 불러오지 못했습니다
      </h3>
      <p className="mb-6 text-sm text-red-600">{message}</p>

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={onRetry}
          className="rounded-lg bg-red-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
        >
          🔄 다시 시도
        </button>
        <p className="text-xs text-red-400">
          문제가 지속될 경우 FSS_API_KEY 설정을 확인하세요.
        </p>
      </div>
    </div>
  );
}
