import { useState } from 'react';
import type { ReactNode } from 'react';
import Icon from './Icon';
import type { IconName } from './Icon';
import { guardCompany, guardOfficer } from '../data/guardPortal';
import '../pages/guard/guard.css';

const navigation: { href: string; label: string; icon: IconName; next?: boolean }[] = [
  { href: '/guard', label: 'ホーム', icon: 'home' },
  { href: '/guard/schedule', label: '勤務予定', icon: 'calendar' },
  { href: '/guard/site', label: '現場情報', icon: 'map-pin' },
  { href: '/guard/attendance', label: '出退勤・勤務実績', icon: 'clock', next: true },
  { href: '/guard/shifts', label: '勤務希望', icon: 'calendar', next: true },
  { href: '/guard/requests', label: '各種申請', icon: 'edit', next: true },
  { href: '/guard/reports', label: '日報・申し送り', icon: 'message', next: true },
  { href: '/guard/incident', label: '事故・トラブル報告', icon: 'alert', next: true },
  { href: '/guard/notices', label: 'お知らせ', icon: 'bell', next: true },
  { href: '/guard/education', label: '教育・資格', icon: 'shield', next: true },
  { href: '/guard/contact', label: '連絡先・ヘルプ', icon: 'headphones' },
  { href: '/guard/profile', label: 'マイページ', icon: 'users' },
];

export default function GuardLayout({ path, title, children }: { path: string; title: string; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = (href: string) => href === '/guard' ? path === href : path === href || path.startsWith(`${href}/`);
  const login = path === '/guard/login';
  const nextPhase = navigation.some((item) => item.next && isActive(item.href));
  return <div className={`gp-shell${login ? ' gp-login-shell' : ''}`}>
    <header className="gp-topbar"><a href="/guard" className="gp-brand"><span><Icon name="shield" size={26} /></span><strong>KEIBI<small>警備員ポータル</small></strong></a><div className="gp-topbar-actions"><a href="/" className="gp-admin-link">管理者モック<Icon name="arrow-up-right" size={14} /></a>{!login && <><button type="button" className="gp-menu-button" aria-label="メニュー" aria-expanded={menuOpen} aria-controls="gp-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'chevron-down' : 'more'} size={23} /></button><a href="/guard/profile" className="gp-avatar" aria-label={`${guardOfficer.name}のマイページ`}>田</a></>}</div></header>
    {!login && <aside className={`gp-sidebar${menuOpen ? ' gp-menu-open' : ''}`} id="gp-navigation"><div className="gp-workspace"><span className="gp-eyebrow">MY WORKSPACE</span><strong>{guardCompany.displayName}</strong><span>{guardCompany.branchName} / {guardOfficer.name}</span></div><nav aria-label="警備員メニュー">{[false, true].map((next) => <div className="gp-nav-group" key={String(next)}><p className="gp-nav-group-label">{next ? '次期機能の参考モック' : '初回対象のモック'}</p>{navigation.filter((item) => !!item.next === next).map((item) => <a href={item.href} key={item.href} className={isActive(item.href) ? 'gp-active' : ''} aria-current={isActive(item.href) ? 'page' : undefined}><Icon name={item.icon} size={19} />{item.label}</a>)}</div>)}</nav><a href="/guard/login" className="gp-login-preview"><Icon name="shield" size={17} />ログイン画面の表示例</a><p className="gp-sidebar-note">今日も安全第一で。<br />現場と管制を、いつも身近に。</p></aside>}
    <div className="gp-main"><div className="gp-mock-context" role="note"><strong>{nextPhase ? '次期の参考モック' : 'モック'}</strong><span>保存・送信・打刻・通知は行いません。<br className="gp-mobile-break" />基準日時：2026/10/4 09:30</span></div><main className="gp-content" aria-label={title}>{nextPhase && <div className="gp-scope-note" role="note"><Icon name="help" size={18} /><p>{path === '/guard/education' ? '資格の基本情報はマイページで確認できます。この画面の教育予定・受講管理・資料配信は次期の表示例です。' : 'この画面は次期機能の見た目を確認する独立した表示例で、初回の確定勤務予定とは連動しません。提出・打刻・報告・連絡は会社の既存の手順を使います。'}</p></div>}{children}</main><footer className="gp-footer">KEIBI · {guardCompany.displayName} / {guardCompany.branchName}<span>架空のサンプルデータ</span></footer></div>
    {!login && <nav className="gp-bottom-nav" aria-label="初回の主要機能">{navigation.filter((item) => ['/guard', '/guard/schedule', '/guard/site', '/guard/contact', '/guard/profile'].includes(item.href)).map((item) => <a href={item.href} key={item.href} className={isActive(item.href) ? 'gp-active' : ''} aria-current={isActive(item.href) ? 'page' : undefined}><Icon name={item.icon} size={21} /><span>{item.href === '/guard/contact' ? '連絡先' : item.label}</span></a>)}</nav>}
  </div>;
}
