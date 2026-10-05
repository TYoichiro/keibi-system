import { useState } from 'react';
import type { ReactNode } from 'react';
import Icon from './Icon';
import type { IconName } from './Icon';
import { guardCompany, guardNotices, guardOfficer } from '../data/guardPortal';
import '../pages/guard/guard.css';

const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: '/guard', label: 'ホーム', icon: 'home' },
  { href: '/guard/schedule', label: '勤務予定', icon: 'calendar' },
  { href: '/guard/site', label: '現場情報', icon: 'map-pin' },
  { href: '/guard/attendance', label: '出退勤・勤務実績', icon: 'clock' },
  { href: '/guard/shifts', label: '勤務希望', icon: 'calendar' },
  { href: '/guard/requests', label: '各種申請', icon: 'edit' },
  { href: '/guard/reports', label: '日報・申し送り', icon: 'message' },
  { href: '/guard/incident', label: '事故・トラブル報告', icon: 'alert' },
  { href: '/guard/notices', label: 'お知らせ', icon: 'bell' },
  { href: '/guard/education', label: '教育・資格', icon: 'shield' },
  { href: '/guard/contact', label: '連絡先・ヘルプ', icon: 'headphones' },
  { href: '/guard/profile', label: 'マイページ', icon: 'users' },
];

export default function GuardLayout({ path, title, children }: { path: string; title: string; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isActive = (href: string) => href === '/guard' ? path === href : path === href || path.startsWith(`${href}/`);
  const unread = guardNotices.filter((notice) => notice.unread).length;
  const login = path === '/guard/login';
  return <div className={`gp-shell${login ? ' gp-login-shell' : ''}`}>
    <header className="gp-topbar"><a href="/guard" className="gp-brand"><span><Icon name="shield" size={26} /></span><strong>KEIBI<small>警備員ポータル</small></strong></a><div className="gp-topbar-actions"><a href="/" className="gp-admin-link">管理者モック<Icon name="arrow-up-right" size={14} /></a>{!login && <><a href="/guard/notices" className="gp-notification" aria-label={`お知らせ・未読${unread}件`}><Icon name="bell" size={21} /><span>{unread}</span></a><button type="button" className="gp-menu-button" aria-label="メニュー" aria-expanded={menuOpen} aria-controls="gp-navigation" onClick={() => setMenuOpen(!menuOpen)}><Icon name={menuOpen ? 'chevron-down' : 'more'} size={23} /></button><a href="/guard/profile" className="gp-avatar" aria-label={`${guardOfficer.name}のマイページ`}>田</a></>}</div></header>
    {!login && <aside className={`gp-sidebar${menuOpen ? ' gp-menu-open' : ''}`} id="gp-navigation"><div className="gp-workspace"><span className="gp-eyebrow">MY WORKSPACE</span><strong>{guardCompany.displayName}</strong><span>{guardCompany.branchName} / {guardOfficer.name}</span></div><nav aria-label="警備員メニュー">{navigation.map((item) => <a href={item.href} key={item.href} className={isActive(item.href) ? 'gp-active' : ''} aria-current={isActive(item.href) ? 'page' : undefined}><Icon name={item.icon} size={19} />{item.label}{item.href === '/guard/notices' && <small>{unread}</small>}</a>)}</nav><a href="/guard/login" className="gp-login-preview"><Icon name="shield" size={17} />ログイン画面の表示例</a><p className="gp-sidebar-note">今日も安全第一で。<br />現場と管制を、いつも身近に。</p></aside>}
    <div className="gp-main"><div className="gp-mock-context" role="note"><strong>モック</strong><span>保存・送信・打刻・通知は行いません。<br className="gp-mobile-break" />基準日時：2026/10/4 09:30</span></div><main className="gp-content" aria-label={title}>{children}</main><footer className="gp-footer">KEIBI · {guardCompany.displayName} / {guardCompany.branchName}<span>架空のサンプルデータ</span></footer></div>
    {!login && <nav className="gp-bottom-nav" aria-label="よく使う機能">{navigation.filter((item) => ['/guard', '/guard/schedule', '/guard/attendance', '/guard/reports', '/guard/profile'].includes(item.href)).map((item) => <a href={item.href} key={item.href} className={isActive(item.href) ? 'gp-active' : ''} aria-current={isActive(item.href) ? 'page' : undefined}><Icon name={item.icon} size={21} /><span>{item.href === '/guard/attendance' ? '出退勤' : item.href === '/guard/reports' ? '日報' : item.label}</span></a>)}</nav>}
  </div>;
}
