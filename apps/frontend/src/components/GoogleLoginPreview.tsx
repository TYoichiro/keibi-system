import './google-login-preview.css';

export default function GoogleLoginPreview({ label = 'Googleでログイン（表示のみ）' }: { label?: string }) {
  return <button type="button" className="google-login-preview" disabled title="Google認証は未実装です。表示確認用のボタンです。">{label}</button>;
}
