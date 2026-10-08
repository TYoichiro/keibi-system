import { useEffect, useRef, useState } from 'react';
import type { Envelope } from './types';

let csrfToken = '';
export function setCsrfToken(value: string) { csrfToken = value; }
export class ApiError extends Error {
  status: number;
  code: string;
  requestId: string | null;
  constructor(message: string, status = 0, code = 'NETWORK_ERROR', requestId: string | null = null) { super(message); this.status = status; this.code = code; this.requestId = requestId; }
}
const messages: Record<string, string> = {
  VERSION_CONFLICT: 'ほかの担当者が更新しました。入力を保持しています。最新内容を確認してからやり直してください。',
  DUTY_OVERLAP: 'ほかの確定勤務と時間が重なる隊員がいます。配置を見直してください。',
  OFFICER_LIMIT: 'この拠点の隊員登録枠が足りません。本店の会社管理者に増枠を依頼してください。',
  INSUFFICIENT_OFFICERS: '必要人数に達していません。下書きを保存して配置を調整してください。',
  FORBIDDEN: 'この操作の権限がありません。所属・役割を確認してください。',
  UNAUTHORIZED: 'ログインの有効期限が切れました。Googleで再度ログインしてください。',
  SESSION_REQUIRED: 'ログインの有効期限が切れました。Googleで再度ログインしてください。',
  OPERATION_FORBIDDEN: 'この操作の権限がありません。所属・役割を確認してください。',
  QUOTA_EXCEEDED: 'この拠点の隊員登録枠が足りません。本店の会社管理者に増枠を依頼してください。',
  DUTY_CONDITIONS_NOT_MET: '人数・現場責任者・資格・勤務可能・移動休息などの確定条件を満たしていません。下書きを見直してください。',
  ONGOING_DUTIES: '未終了の確定勤務に影響する変更です。配置を確認・改訂した後に操作してください。',
  STATE_CONFLICT: '現在の状態では実行できません。最新の勤務枠を確認してください。',
  VALIDATION_ERROR: '入力の形式・必須項目・日付範囲を確認してください。入力内容は保持しています。',
  NOT_FOUND: 'この情報は現在の所属・役割・公開期間では取得できません。',
};
export async function api<T>(path: string, options: { method?: string; body?: unknown; key?: string; signal?: AbortSignal } = {}): Promise<Envelope<T>> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET', credentials: 'same-origin', signal: options.signal,
      headers: { Accept: 'application/json', ...(options.body !== undefined ? {'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken} : {}), ...(options.key ? {'Idempotency-Key': options.key} : {}) },
      ...(options.body !== undefined ? {body: JSON.stringify(options.body)} : {}),
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new ApiError(options.method ? '通信が途切れました。保存結果を確認するか、同じ操作を再送してください。入力は保持しています。' : 'データを取得できませんでした。接続を確認して再読み込みしてください。');
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/me') window.dispatchEvent(new Event('keibi-session-expired'));
    const code = typeof payload?.error === 'string' ? payload.error : payload?.error?.code ?? payload?.code ?? `HTTP_${response.status}`;
    const message = messages[code] ?? payload?.error?.message ?? payload?.message ?? (response.status === 409 ? messages.VERSION_CONFLICT : '操作を完了できませんでした。入力内容と権限を確認してください。');
    throw new ApiError(message, response.status, code, response.headers.get('X-Request-Id'));
  }
  if (!payload || typeof payload !== 'object' || !('data' in payload)) throw new ApiError('応答を確認できませんでした。保存結果を確認してください。');
  return payload as Envelope<T>;
}
export function useResource<T>(path: string | null, revision = 0) {
  const [result, setResult] = useState<{path: string | null; data?: Envelope<T>; error?: Error; loading: boolean}>({path, loading: true});
  const [reloadIndex, setReloadIndex] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setResult({path, loading: true});
      if (path === null) { setResult({path, loading: false}); return; }
      try { const data = await api<T>(path, {signal: controller.signal}); if (!controller.signal.aborted) setResult({path, data, loading: false}); }
      catch (error) { if (!controller.signal.aborted) setResult({path, error: error as Error, loading: false}); }
    });
    return () => controller.abort();
  }, [path, revision, reloadIndex]);
  return {...result, loading: result.path !== path || result.loading, data: result.path === path ? result.data : undefined, reload: () => setReloadIndex((current) => current + 1)};
}
interface Pending { path: string; method: string; body: unknown; key: string; onSuccess: (result?: unknown) => void }
export function useMutation() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<Pending | null>(null);
  const locked = useRef(false);
  const send = async (operation: Pending) => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError(null); setNotice('');
    try { const response = await api(operation.path, {method: operation.method, body: operation.body, key: operation.key}); pending.current = null; setUncertain(false); setNotice('保存しました。'); operation.onSuccess(response.data); }
    catch (failure) { const unknownResult = failure instanceof ApiError && (failure.status === 0 || failure.status >= 500); setError(failure as Error); setUncertain(unknownResult); if (!unknownResult) pending.current = null; }
    finally { locked.current = false; setBusy(false); }
  };
  const run = (path: string, method: string, body: unknown, onSuccess: (result?: unknown) => void) => {
    if (locked.current || (uncertain && pending.current)) return;
    const operation = {path, method, body, key: crypto.randomUUID(), onSuccess}; pending.current = operation; void send(operation);
  };
  const recover = async () => {
    const operation = pending.current;
    if (!operation || locked.current) return;
    locked.current = true; setBusy(true); setError(null);
    try {
      const result = await api<{status: string}>(`/operations/${operation.key}`);
      if (result.data.status === 'succeeded') { setUncertain(false); pending.current = null; setNotice('保存済みであることを確認しました。'); operation.onSuccess(); }
      else setNotice('まだ保存完了を確認できません。同じ操作を再送するか、最新内容を確認してください。');
    } catch (failure) { setError(failure as Error); }
    finally { locked.current = false; setBusy(false); }
  };
  return {busy, error, notice, uncertain, run, recover, retry: () => {if (pending.current) void send(pending.current);}};
}
export type Mutation = ReturnType<typeof useMutation>;

export function useCatalog<T>(path: string | null, revision = 0) {
  const [result, setResult] = useState<{path: string | null; data?: Envelope<T[]>; error?: Error; loading: boolean}>({path, loading: true});
  useEffect(() => {
    const controller = new AbortController();
    Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setResult({path, loading: true});
      if (!path) {setResult({path, data: {data: []}, loading: false}); return;}
      const separator = path.includes('?') ? '&' : '?';
      try {
        const first = await api<T[]>(`${path}${separator}pageSize=100&page=1`, {signal: controller.signal});
        const pages = Math.ceil((first.total ?? first.data.length) / (first.pageSize ?? 100));
        const rest = await Promise.all(Array.from({length: Math.max(0, pages - 1)}, (_, index) => api<T[]>(`${path}${separator}pageSize=100&page=${index + 2}`, {signal: controller.signal})));
        if (!controller.signal.aborted) setResult({path, data: {...first, data: [...first.data, ...rest.flatMap((item) => item.data)]}, loading: false});
      } catch (error) {if (!controller.signal.aborted) setResult({path, error: error as Error, loading: false});}
    });
    return () => controller.abort();
  }, [path, revision]);
  return {...result, loading: result.path !== path || result.loading, data: result.path === path ? result.data : undefined};
}
