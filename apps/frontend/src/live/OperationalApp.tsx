import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon';
import type { IconName } from '../components/Icon';
import { api, ApiError, setCsrfToken } from './api';
import type { Me } from './types';
import { roleLabels } from './types';
import { ErrorBox, Loading } from './UI';
import { AuthPage, SecurityPage } from './auth';
import { Dashboard, MasterList, MasterEditor } from './masters';
import { AssignmentList, AssignmentEditor } from './assignments';
import { Settings } from './settings';
import { GuardPage } from './guard';
import './live.css';

const nav: {href: string; title: string; icon: IconName}[] = [
  {href: '/', title: 'ダッシュボード', icon: 'dashboard'}, {href: '/assignments', title: '配置・管理', icon: 'calendar'}, {href: '/sites', title: '現場管理', icon: 'building'}, {href: '/clients', title: '取引先管理', icon: 'building'}, {href: '/officers', title: '隊員管理', icon: 'users'}, {href: '/settings', title: '会社・利用者設定', icon: 'settings'},
];
const guardNav: typeof nav = [{href: '/guard', title: 'ホーム', icon: 'home'}, {href: '/guard/schedule', title: '勤務予定', icon: 'calendar'}, {href: '/guard/site', title: '現場情報', icon: 'building'}, {href: '/guard/profile', title: 'マイページ', icon: 'users'}, {href: '/account/security', title: 'セキュリティ', icon: 'shield'}];
export default function OperationalApp() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const [session, setSession] = useState<{loading: boolean; me?: Me; error?: Error}>({loading: true});
  const [revision, setRevision] = useState(0);
  const sessionGeneration = useRef(0);
  useEffect(() => {
    let active = true;
    const generation = sessionGeneration.current;
    api<Me>('/me').then((response) => {if (active && generation === sessionGeneration.current) {setCsrfToken(response.data.csrfToken); setSession({loading: false, me: response.data});}}).catch((error: Error) => {if (active && generation === sessionGeneration.current) setSession({loading: false, error});});
    const expired = () => {sessionGeneration.current += 1; setCsrfToken(''); setSession({loading: false, error: new ApiError('ログインの有効期限が切れました。Googleで再度ログインしてください。', 401, 'UNAUTHORIZED')});};
    window.addEventListener('keibi-session-expired', expired);
    const changed = () => setRevision((value) => value + 1);
    window.addEventListener('keibi-data-changed', changed);
    return () => {active = false; window.removeEventListener('keibi-session-expired', expired); window.removeEventListener('keibi-data-changed', changed);};
  }, []);
  useEffect(() => {
    if (!session.me) return;
    let lastActivity = 0;
    const activity = (event: Event) => {
      if (!event.isTrusted || document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastActivity < 60000) return;
      lastActivity = now;
      void api('/auth/activity', {method: 'POST', body: {}}).catch(() => undefined);
    };
    window.addEventListener('pointerdown', activity); window.addEventListener('keydown', activity);
    const resume = () => {if (document.visibilityState !== 'visible') return; const generation = sessionGeneration.current; void api<Me>('/me').then((response) => {if (generation !== sessionGeneration.current) return; setCsrfToken(response.data.csrfToken); setSession({loading: false, me: response.data});}).catch((error) => {if (generation === sessionGeneration.current && error instanceof ApiError && error.status === 401) window.dispatchEvent(new Event('keibi-session-expired'));});};
    document.addEventListener('visibilitychange', resume);
    return () => {window.removeEventListener('pointerdown', activity); window.removeEventListener('keydown', activity); document.removeEventListener('visibilitychange', resume);};
  }, [session.me]);
  const publicAuth = ['/login', '/guard/login', '/account/activate', '/account/reset', '/account/mfa'].includes(path);
  if (publicAuth) return <AuthPage path={path} me={session.me} />;
  if (session.loading) return <main className="live-auth"><Loading /></main>;
  if (!session.me) {
    if (session.error instanceof ApiError && session.error.status === 401) return <AuthPage path="/login" message={session.error.message} />;
    return <main className="live-auth"><h1>システムに接続できません</h1>{session.error && <ErrorBox error={session.error} retry={() => window.location.reload()} />}</main>;
  }
  const me = session.me;
  const isGuard = me.role === 'guard';
  const navigation = (isGuard ? guardNav : nav).filter((item) => item.href !== '/settings' || me.role === 'company_admin');
  const activePath = isGuard ? path : path === '/' ? '/' : '/' + path.split('/')[1];
  const title = path.startsWith('/account') ? 'Google連携・セキュリティ' : navigation.find((item) => item.href === activePath)?.title ?? 'KEIBI';
  let page;
  if (path === '/account/security') page = <SecurityPage me={me} />;
  else if (isGuard && ['/guard', '/guard/schedule', '/guard/site', '/guard/profile', '/guard/contact'].includes(path)) page = <GuardPage me={me} path={path} revision={revision} />;
  else if (!isGuard && path === '/') page = <Dashboard me={me} revision={revision} />;
  else if (!isGuard && ['/officers', '/clients', '/sites'].includes(path)) page = <MasterList key={path} kind={path.slice(1) as 'officers' | 'clients' | 'sites'} me={me} revision={revision} />;
  else if (!isGuard && /^\/(officers|clients|sites)\/(new|edit)$/.test(path)) page = <MasterEditor key={path} kind={path.split('/')[1] as 'officers' | 'clients' | 'sites'} me={me} />;
  else if (!isGuard && path === '/assignments') page = <AssignmentList me={me} revision={revision} />;
  else if (!isGuard && ['/assignments/new', '/assignments/edit'].includes(path)) page = <AssignmentEditor me={me} />;
  else if (!isGuard && path === '/settings' && me.role === 'company_admin') page = <Settings me={me} />;
  else page = <div><h1>この画面は利用できません</h1><p className="live-note">所属・役割の許可範囲を確認してください。勤怠・日報・勤務希望は次期の対象です。</p><a href={isGuard ? '/guard' : '/'} className="primary-button">ホームへ戻る</a><a href={`/preview${path}`} className="secondary-button">架空データの画面見本を見る</a></div>;
  return <div className={`app-layout live-app${isGuard ? ' live-guard' : ''}`}>
    <aside className="sidebar"><a href={isGuard ? '/guard' : '/'} className="brand"><span className="brand-mark"><Icon name="shield" size={38} /></span><span className="brand-name">KEIBI<span>{isGuard ? '警備員ポータル' : 'クラウド管制'}</span></span></a><div className="tenant-selector"><span className="tenant-icon"><Icon name="building" size={18} /></span><span className="tenant-name">{me.companyName}<span>{me.branchName}</span></span></div><div className="nav-caption">WORKSPACE</div><nav className="main-nav" aria-label="主な機能">{navigation.map((item) => <a key={item.href} href={item.href} className={`nav-item${activePath === item.href ? ' is-active' : ''}`} aria-current={activePath === item.href ? 'page' : undefined}><Icon name={item.icon} size={19} /><span>{item.title}</span></a>)}</nav><div className="sidebar-bottom"><a href="/account/security" className="nav-item"><Icon name="shield" size={18} />Google連携・ログアウト</a><div className="sidebar-user"><span className="avatar avatar-dark">{me.displayName.slice(0, 1)}</span><span className="user-name">{me.displayName}<span>{roleLabels[me.role]}</span></span></div></div></aside>
    <div className="main-layout"><header className="topbar"><div className="breadcrumb"><Icon name="home" size={16} /><span>{title}</span></div><div className="header-actions"><span className="live-session-label"><span className="live-dot" />保存データ</span><a href="/account/security" className="icon-button" aria-label="Google連携とログアウト"><Icon name="shield" size={19} /></a><span className="avatar avatar-light">{me.displayName.slice(0, 1)}</span></div></header><main className="dashboard live-content">{page}</main><footer className="live-footer">KEIBI · {me.companyName} / {me.branchName}<a href="/preview">架空データの画面見本</a></footer></div>
  </div>;
}
