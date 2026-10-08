import Icon from '../components/Icon';
import { settingsMembers } from '../data/settings';
import './auth-mock.css';

const authScreens: Record<string, { title: string; description: string }> = {
  '/login': { title: 'ログイン', description: '会社から案内された本人用メールアドレスで利用します。' },
  '/account/activate': { title: '利用開始の設定', description: '会社が発行したアカウントの初回有効化を確認する画面案です。' },
  '/account/reset': { title: 'パスワード再設定', description: '再設定の案内を受け取る画面案です。' },
  '/account/mfa': { title: '管理者の多要素認証', description: '会社管理者がログイン時に追加確認を行う画面案です。' },
  '/account/security': { title: '認証情報の変更', description: '個人の認証情報の変更とログアウトを確認する画面案です。' },
};

export default function AuthMockPage() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const screen = authScreens[path] ?? authScreens['/login'];
  const activationMember = settingsMembers.find((member) => member.officerId === 'G004');
  return (
    <main className="authm-page">
      <a className="authm-brand" href="/"><Icon name="shield" size={30} /><span>KEIBI<small>クラウド管制システム</small></span></a>
      <div className="authm-layout">
        <section className="authm-intro">
          <span className="authm-eyebrow">初回対象 · 画面案</span>
          <h1>{screen.title}</h1><p>{screen.description}</p>
          <div className="authm-notice" role="note"><Icon name="help" size={18} /><div><strong>表示確認用のモックです</strong><p>入力は送信・保存されません。認証方式、有効化・復旧手順は確認前です。</p></div></div>
          <nav className="authm-nav" aria-label="認証画面の見本">
            {Object.entries(authScreens).map(([href, item]) => <a href={href} key={href} aria-current={path === href ? 'page' : undefined}>{item.title}<Icon name="chevron-right" size={14} /></a>)}
          </nav>
          <a className="authm-preview" href="/">管理画面のモックを開く<Icon name="arrow-right" size={15} /></a>
          <a className="authm-preview" href="/guard">警備員画面のモックを開く<Icon name="arrow-right" size={15} /></a>
        </section>
        <section className="panel authm-card" aria-label={`${screen.title}の入力見本`}>
          <div className="authm-card-heading"><Icon name="shield" size={22} /><h2>{screen.title}</h2></div>
          {path === '/account/activate' && <div className="authm-account"><strong>東京セキュリティ / 本社（本店）</strong><span>田中 和也 · 警備員 · G004</span><small>所属・役割・隊員との対応は会社管理者が設定します。</small></div>}
          {path === '/account/mfa' ? <>
            <div className="authm-account"><strong>会社管理者は多要素認証が必須です</strong><span>確認が完了してから業務画面へ進む想定です。</span></div>
            <label className="authm-field">確認コード<input inputMode="numeric" autoComplete="one-time-code" placeholder="6桁の表示例" /></label>
            <button type="button" className="primary-button">確認する（表示のみ）</button>
            <details className="authm-state"><summary>初回登録・復旧の画面案</summary><p>認証アプリ等の登録 → コード確認 → 復旧手段の確認。方式の選定後に具体化します。</p><button type="button" className="secondary-button">管理者の復旧手順を確認（表示のみ）</button></details>
          </> : <>
            <label className="authm-field">本人用メールアドレス<input type="email" autoComplete="username" placeholder="name@example.com" defaultValue={path === '/account/activate' ? activationMember?.email : undefined} readOnly={path === '/account/activate'} /></label>
            {path !== '/account/reset' && <label className="authm-field">{path === '/account/activate' || path === '/account/security' ? '新しいパスワード' : 'パスワード'}<input type="password" autoComplete={path === '/login' ? 'current-password' : 'new-password'} placeholder="入力見本" /></label>}
            {(path === '/account/activate' || path === '/account/security') && <label className="authm-field">新しいパスワード（確認）<input type="password" autoComplete="new-password" placeholder="同じ内容を入力" /></label>}
            <button type="button" className="primary-button">{path === '/account/activate' ? '利用を開始' : path === '/account/reset' ? '再設定の案内を依頼' : path === '/account/security' ? '認証情報を変更' : 'ログイン'}（表示のみ）</button>
            {path === '/login' && <a className="authm-preview" href="/account/reset">パスワードを忘れた場合</a>}
            {path === '/account/security' && <button type="button" className="secondary-button">ログアウト（表示のみ）</button>}
          </>}
          <details className="authm-state"><summary>エラー・期限切れの表示案</summary><p>{path === '/account/activate' ? 'この案内は期限切れ、または使用済みです。会社の担当者へ再発行を依頼してください。' : path === '/account/reset' ? '該当するアカウントがある場合は、再設定方法をご案内します。' : '利用できません。入力内容を確認し、解決しない場合は会社の担当者へ連絡してください。'}</p><span>静的な文言の見本です。実際の認証・エラー判定は行いません。</span></details>
        </section>
      </div>
    </main>
  );
}
