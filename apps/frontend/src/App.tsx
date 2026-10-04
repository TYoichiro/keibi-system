import { useEffect, useState } from 'react';

type ConnectionStatus = 'loading' | 'connected' | 'error';

const statusMessages: Record<ConnectionStatus, string> = {
  loading: '接続を確認しています…',
  connected: 'サーバーとデータベースに接続できました。',
  error: 'サーバーまたはデータベースに接続できませんでした。ページを再読み込みしてください。',
};

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('loading');

  useEffect(() => {
    const controller = new AbortController();

    async function checkConnection() {
      try {
        const response = await fetch('/api/health', {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Health check failed: ${response.status}`);
        }

        const data: { status?: string; database?: string } = await response.json();

        if (data.status !== 'ok' || data.database !== 'ok') {
          throw new Error('Unexpected health check response');
        }

        setStatus('connected');
      } catch {
        if (!controller.signal.aborted) {
          setStatus('error');
        }
      }
    }

    void checkConnection();

    return () => controller.abort();
  }, []);

  return (
    <main className="container">
      <h1>keibi-system</h1>
      <p>警備業務管理システム</p>
      <p className={`status status--${status}`} role="status">
        {statusMessages[status]}
      </p>
    </main>
  );
}
