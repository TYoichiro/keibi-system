import { lazy, Suspense } from 'react';
import OperationalApp from './live/OperationalApp';

const PreviewApp = lazy(() => import('./PreviewApp'));

export default function App() {
  if (window.location.pathname === '/preview' || window.location.pathname.startsWith('/preview/')) {
    return <Suspense fallback={<p>画面見本を読み込んでいます…</p>}><PreviewApp /></Suspense>;
  }
  return <OperationalApp />;
}
