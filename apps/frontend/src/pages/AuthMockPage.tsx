import Icon from '../components/Icon';
import GoogleLoginPreview from '../components/GoogleLoginPreview';
import { settingsMembers } from '../data/settings';
import './auth-mock.css';

const authScreens: Record<string, { title: string; description: string }> = {
  '/login': { title: 'Googleでログイン', description: '会社から招待された本人のGoogleアカウントで利用します。' },
  '/account/activate': { title: '招待の確認・Google連携', description: '所属・役割を確認して、本人のGoogleアカウントを初回連携する画面案です。' },
  '/account/reset': { title: 'Googleアカウントの回復', description: 'ログインできない場合のGoogle公式の回復手順をご案内します。' },
  '/account/mfa': { title: 'Googleのセキュリティ設定', description: 'Googleアカウントの二段階認証などの設定をご案内します。' },
  '/account/security': { title: 'Google連携・ログアウト', description: '本人のGoogle連携と、このシステムからのログアウトを確認する画面案です。' },
};

export default function AuthMockPage() {
  const path = window.location.pathname.replace(/\/+$/, '');
  const screen = authScreens[path] ?? authScreens['/login'];
  const activationMember = settingsMembers.find((member) => member.officerId === 'G004')!;
  const securityMember = new URLSearchParams(window.location.search).get('view') === 'guard'
    ? activationMember
    : settingsMembers.find((member) => member.current)!;
  return (
    <main className="authm-page">
      <a className="authm-brand" href="/"><Icon name="shield" size={30} /><span>KEIBI<small>クラウド管制システム</small></span></a>
      <div className="authm-layout">
        <section className="authm-intro">
          <span className="authm-eyebrow">初回対象 · 画面案</span>
          <h1>{screen.title}</h1><p>{screen.description}</p>
          <div className="authm-notice" role="note"><Icon name="help" size={18} /><div><strong>表示確認用のモックです</strong><p>Google認証・連携・招待・ログアウトは未実装です。Googleボタンは表示のみで、画面の閲覧には下のモック用リンクを使います。</p></div></div>
          <nav className="authm-nav" aria-label="認証画面の見本">
            {Object.entries(authScreens).map(([href, item]) => <a href={href} key={href} aria-current={path === href ? 'page' : undefined}>{item.title}<Icon name="chevron-right" size={14} /></a>)}
          </nav>
          <a className="authm-preview" href="/">管理画面のモックを開く<Icon name="arrow-right" size={15} /></a>
          <a className="authm-preview" href="/guard">警備員画面のモックを開く<Icon name="arrow-right" size={15} /></a>
        </section>
        <section className="panel authm-card" aria-label={`${screen.title}の表示例`}>
          <div className="authm-card-heading"><Icon name="shield" size={22} /><h2>{screen.title}</h2></div>
          {path === '/account/activate' ? <>
            <div className="authm-account"><strong>東京セキュリティ / 本社（本店）</strong><span>田中 和也 · 警備員 · G004</span><small>所属・役割・隊員との対応は会社管理者が設定します。</small></div>
            <dl className="authm-facts"><div><dt>招待先メール</dt><dd>{activationMember.email}</dd></div><div><dt>招待の有効期間</dt><dd>発行から7日間。再招待すると古い招待は無効になります。</dd></div><div><dt>利用開始</dt><dd>招待確認後、本人のGoogleアカウントを連携</dd></div></dl>
            <p className="authm-copy">会社から招待されたGoogleアカウントを選んでください。Googleで本人確認ができても、招待・所属・利用許可の確認が必要です。</p>
            <GoogleLoginPreview label="Googleで初回連携（表示のみ）" />
            <p className="authm-copy authm-muted">招待先は架空の表示例です。実際のGoogleアカウントではありません。</p>
          </> : path === '/account/reset' ? <>
            <div className="authm-account"><strong>回復手続きはGoogleで行います</strong><span>Googleアカウントのパスワード・二段階認証・回復方法は、Google公式画面で管理します。</span></div>
            <a className="authm-external secondary-button" href="https://accounts.google.com/signin/recovery" target="_blank" rel="noopener noreferrer">Googleアカウントの回復を開く<Icon name="arrow-up-right" size={16} /></a>
            <p className="authm-copy">会社管理のGoogle Workspaceを使う場合は、そのGoogleアカウントの管理者に回復を相談してください。</p>
            <p className="authm-copy">Googleでログインできるのに、このシステムを利用できない場合は会社管理者へ連絡してください。利用停止や招待の期限切れは会社側で確認します。</p>
            <p className="authm-copy">会社管理者が全員このシステムにログインできない場合は、サービス運営者へ管理者復旧を依頼してください。会社・本人確認が必要です。</p>
            <a className="authm-preview" href="/login">ログイン画面の見本へ<Icon name="arrow-right" size={15} /></a>
          </> : path === '/account/mfa' ? <>
            <div className="authm-account"><strong>二段階認証はGoogle側で設定します</strong><span>会社管理者にはGoogle側の二段階認証の有効化を求める方針です。Googleの設定を確認してください。</span></div>
            <a className="authm-external secondary-button" href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">Googleのセキュリティ設定を開く<Icon name="arrow-up-right" size={16} /></a>
            <p className="authm-copy">このシステムで確認コードや復旧コードを入力・保管することはありません。Google側の設定・回復方法を利用します。</p>
            <p className="authm-copy authm-muted">二段階認証の実施をシステム側でどう確認するかは、導入時に会社のGoogleアカウントの運用と合わせて決定します。</p>
            <a className="authm-preview" href="/account/reset">Googleアカウントの回復案内<Icon name="arrow-right" size={15} /></a>
          </> : path === '/account/security' ? <>
            <dl className="authm-facts"><div><dt>サンプル利用者</dt><dd>{securityMember.name}</dd></div><div><dt>Google連携メールの表示例</dt><dd>{securityMember.email}</dd></div><div><dt>連携状態</dt><dd>連携済みの表示例（実際の認証・連携は未実装）</dd></div></dl>
            <p className="authm-copy">Googleアカウントのパスワード・二段階認証は、Googleのセキュリティ設定で変更します。所属・役割やGoogle連携の変更が必要な場合は会社管理者へ連絡してください。</p>
            <p className="authm-copy">Google連携の変更は、本人確認と会社管理者の承認が必要です。管理者本人の変更は別の会社管理者が承認し、ほかに管理者がいない場合は運営者へ依頼します。古い連携と全端末のアプリログインを失効してから、新しい招待で連携します。</p>
            <a className="authm-external secondary-button" href="https://myaccount.google.com/security" target="_blank" rel="noopener noreferrer">Googleのセキュリティ設定を開く<Icon name="arrow-up-right" size={16} /></a>
            <button type="button" className="secondary-button">このシステムからログアウト（表示のみ）</button>
            <p className="authm-copy authm-muted">ログアウトの対象はこのシステムのセッションです。Googleや他のサービスのログイン状態には影響しません。メールは架空の表示例です。</p>
          </> : <>
            <div className="authm-account"><strong>Googleアカウントで本人確認</strong><span>会社管理者・管制担当・閲覧者は、会社から招待されたGoogleアカウントを使います。</span></div>
            <GoogleLoginPreview />
            <p className="authm-copy">パスワードや確認コードはGoogleの画面で入力します。このシステムで入力・保管することはありません。</p>
            <p className="authm-copy authm-muted">Googleでログインしても、会社からの招待と利用許可が必要です。会社・拠点・役割を本人が選んで利用することはできません。</p>
            <a className="authm-preview" href="/account/reset">Googleアカウントにログインできない場合<Icon name="arrow-right" size={15} /></a>
            <a className="authm-preview" href="/guard/login">警備員ログインの見本<Icon name="arrow-right" size={15} /></a>
          </>}
          <details className="authm-state"><summary>{path === '/account/activate' ? '招待の期限切れ・不一致の表示案' : '利用できない場合の表示案'}</summary><p>{path === '/account/activate' ? 'この招待は期限切れ、または使用済みです。会社管理者へ再招待を依頼してください。招待された本人と異なるGoogleアカウントは連携できません。' : path === '/account/reset' || path === '/account/mfa' ? 'Googleアカウントの回復や二段階認証で困った場合は、Google公式の案内を確認してください。アプリの利用許可は会社管理者へお問い合わせください。' : '利用できません。Googleで選択したアカウントと会社からの案内を確認し、解決しない場合は会社管理者へ連絡してください。'}</p><span>静的な文言の見本です。実際の認証・招待・エラー判定は行いません。</span></details>
        </section>
      </div>
    </main>
  );
}
