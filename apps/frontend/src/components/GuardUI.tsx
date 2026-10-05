import { useState } from 'react';
import type { ReactNode } from 'react';
import Icon from './Icon';
import type { IconName } from './Icon';

export function GuardHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="gp-heading"><div><span className="gp-eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{action}</div>;
}

export function GuardCard({ title, icon, action, children, className = '' }: { title: string; icon?: IconName; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`gp-card ${className}`}><div className="gp-card-heading"><h2>{icon && <Icon name={icon} size={19} />}{title}</h2>{action}</div>{children}</section>;
}

export function GuardBadge({ children, tone = 'green' }: { children: ReactNode; tone?: string }) {
  return <span className={`gp-badge gp-badge-${tone}`}>{children}</span>;
}

export function GuardLink({ href, children, icon = 'arrow-right', secondary = false }: { href: string; children: ReactNode; icon?: IconName; secondary?: boolean }) {
  return <a className={`gp-button${secondary ? ' gp-button-secondary' : ''}`} href={href}>{children}<Icon name={icon} size={17} /></a>;
}

export function GuardMockButton({ children, secondary = false }: { children: ReactNode; secondary?: boolean }) {
  const [shown, setShown] = useState(false);
  return <div className="gp-mock-action"><button type="button" className={`gp-button${secondary ? ' gp-button-secondary' : ''}`} onClick={() => setShown(true)}>{children}</button>{shown && <p className="gp-feedback" role="status">プレビューです。送信・保存・発信は行っていません。</p>}</div>;
}

export function GuardFormNote() {
  return <p className="gp-form-note"><Icon name="help" size={16} />入力は画面内のプレビューです。提出・保存・ファイル送信は行いません。</p>;
}

export function GuardEmpty({ text }: { text: string }) {
  return <div className="gp-empty"><Icon name="search" size={25} /><p>{text}</p></div>;
}
