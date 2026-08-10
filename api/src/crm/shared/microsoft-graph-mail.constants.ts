/**
 * Single Entra "resource" (Microsoft Graph) — avoids AADSTS28000 and works when
 * tenant has SMTP AUTH disabled (use Graph sendMail instead of smtp.office365.com).
 *
 * Mail.ReadWrite is required: send uses create-draft + send (and createReply),
 * not /sendMail alone. Without it Graph returns ErrorAccessDenied
 * ("Access is denied. Check credentials and try again.").
 */
export const MICROSOFT_GRAPH_MAIL_OAUTH_SCOPES = [
  'offline_access',
  'openid',
  'profile',
  'email',
  'https://graph.microsoft.com/Mail.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Calendars.Read',
].join(' ');
