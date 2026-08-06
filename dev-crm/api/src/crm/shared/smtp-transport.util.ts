import type SMTPTransport from 'nodemailer/lib/smtp-transport';

export type SmtpAuthConfig = {
  smtpHost: string;
  smtpPort: number;
  smtpSecure?: boolean;
  smtpUser: string;
  smtpPassword: string;
};

/** Nodemailer options for password-based SMTP (465 SSL vs 587 STARTTLS). */
export function buildSmtpTransportOptions(
  account: SmtpAuthConfig,
): SMTPTransport.Options {
  const port = Math.max(1, Number(account.smtpPort) || 587);
  const host = String(account.smtpHost || '').trim();
  // Port wins over stored smtpSecure (avoids 587 + secure:true misconfigs).
  const secure = port === 465;
  const user = String(account.smtpUser || '').trim();
  const pass = String(account.smtpPassword || '');

  const options: SMTPTransport.Options = {
    host,
    port,
    secure,
    auth: { user, pass },
    tls: { rejectUnauthorized: false },
  };

  if (port === 587 && !secure) {
    options.requireTLS = true;
  }

  return options;
}

export function formatSmtpAuthError(
  err: unknown,
  provider?: string,
): string {
  const raw =
    (err as { message?: string })?.message ||
    (typeof err === 'string' ? err : 'SMTP authentication failed');
  const code = String((err as { code?: string })?.code || '').toUpperCase();
  const lower = raw.toLowerCase();

  const isAuth =
    code === 'EAUTH' ||
    lower.includes('invalid login') ||
    lower.includes('authentication') ||
    lower.includes('credentials') ||
    lower.includes('not correct') ||
    lower.includes('535');

  if (!isAuth) {
    return raw;
  }

  const providerHint =
    provider === 'hostinger'
      ? ' For Hostinger Email: smtp.hostinger.com port 465 with SSL (as in hPanel), or try 587 with STARTTLS if 465 fails. Use your full email and mailbox password from hPanel → Emails (not your Hostinger login).'
      : provider === 'godaddy'
        ? ' Use your full email and mailbox password from GoDaddy Workspace.'
        : ' Use your full email address as the username and the mailbox password (not your hosting panel login).';

  return `SMTP login failed.${providerHint} (${raw})`;
}

/** Hostinger often accepts IMAP on 993 while SMTP auth fails on 465; 587 STARTTLS is the usual fix. */
export function smtpVerificationAttempts(
  provider: string,
  base: SmtpAuthConfig,
): SmtpAuthConfig[] {
  const host = base.smtpHost.trim();
  const port = base.smtpPort || 587;
  const attempts: SmtpAuthConfig[] = [
    {
      ...base,
      smtpHost: host,
      smtpPort: port,
      smtpSecure: port === 465,
    },
  ];

  const p = provider.toLowerCase();
  const isHostinger =
    p === 'hostinger' || host.includes('hostinger.com');
  if (isHostinger) {
    // Official Hostinger: 587 + STARTTLS (primary); 465 + SSL if 587 fails
    // https://www.hostinger.com/tutorials/smtp-port#h-using-smtp-at-hostinger
    if (port === 587 && !attempts.some((a) => a.smtpPort === 465)) {
      attempts.push({
        ...base,
        smtpHost: host,
        smtpPort: 465,
        smtpSecure: true,
      });
    }
    if (port === 465 && !attempts.some((a) => a.smtpPort === 587)) {
      attempts.push({
        ...base,
        smtpHost: host,
        smtpPort: 587,
        smtpSecure: false,
      });
    }
  }

  return attempts;
}
