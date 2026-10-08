import nodemailer from 'nodemailer';

export type InvitationMessage = { to: string; displayName: string; companyName: string; url: string; expiresAt: Date };
export type InvitationMailer = { send: (message: InvitationMessage) => Promise<void> };

export function createInvitationMailer(options: {
  host: string; port: number; secure: boolean; from: string; user?: string; password?: string;
}): InvitationMailer {
  const transport = nodemailer.createTransport({
    host: options.host, port: options.port, secure: options.secure, requireTLS: !options.secure,
    ...(options.user && options.password ? { auth: { user: options.user, pass: options.password } } : {}),
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 10000,
  });
  return { send: async ({ to, displayName, companyName, url, expiresAt }) => {
    await transport.sendMail({ from: options.from, to, subject: `${companyName} 警備管制システムへの招待`,
      text: `${displayName} 様\n\n${companyName} の警備管制システムへ招待されました。\n本人のGoogleアカウントで下記のリンクを開いてください。\n${url}\n\n有効期限: ${expiresAt.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}（日本時間）\nこのリンクは一度限り有効です。心当たりがない場合は開かず、会社管理者へご連絡ください。`,
    });
  } };
}
