import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

const ADMIN_EMAIL = 'nathan@njwilli.com';
const APP_NAME = 'Options4L';
const PRIMARY_COLOR = '#00C805'; // Robinhood Green

let transporter: Transporter | null = null;

function getEmailConfig(): EmailConfig | null {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;

  if (!host || !port || !user || !pass || !from) {
    return null;
  }

  return {
    host,
    port: parseInt(port, 10),
    secure: parseInt(port, 10) === 465,
    auth: { user, pass },
    from,
  };
}

function getTransporter(): Transporter | null {
  if (transporter) return transporter;

  const config = getEmailConfig();
  if (!config) {
    console.warn('Email service not configured: missing SMTP environment variables');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth,
  });

  return transporter;
}

export function isEmailConfigured(): boolean {
  return getEmailConfig() !== null;
}

export async function sendMagicLinkEmail(
  email: string,
  magicLink: string,
  isLinking: boolean = false,
  expiresInMinutes: number = 15
): Promise<boolean> {
  const transport = getTransporter();
  const config = getEmailConfig();

  if (!transport || !config) {
    console.error('Email service not configured');
    return false;
  }

  const subject = isLinking 
    ? `Link your email to ${APP_NAME}`
    : `Sign in to ${APP_NAME}`;
  
  const heading = isLinking
    ? 'Link Your Email Address'
    : 'Sign In to Your Account';
  
  const description = isLinking
    ? `Click the button below to link this email address to your ${APP_NAME} account.`
    : `Click the button below to sign in to ${APP_NAME}.`;
  
  const buttonText = isLinking ? 'Link Email' : 'Sign In';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #000000;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    
    <!-- Header with Logo -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: ${PRIMARY_COLOR}; margin: 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">
        ${APP_NAME}
      </h1>
      <p style="color: #888888; margin: 8px 0 0; font-size: 14px;">Options Trading Education</p>
    </div>
    
    <!-- Main Card -->
    <div style="background: #0a0a0a; border: 1px solid #262626; border-radius: 12px; padding: 40px 32px;">
      <h2 style="color: #f2f2f2; margin: 0 0 16px; font-size: 24px; font-weight: 600;">${heading}</h2>
      
      <p style="color: #a3a3a3; margin: 0 0 32px; font-size: 16px; line-height: 1.6;">
        ${description} This link will expire in ${expiresInMinutes} minutes.
      </p>
      
      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${magicLink}" 
           style="background-color: ${PRIMARY_COLOR}; 
                  color: #000000; 
                  padding: 16px 40px; 
                  text-decoration: none; 
                  border-radius: 8px; 
                  font-weight: 600;
                  font-size: 16px;
                  display: inline-block;">
          ${buttonText}
        </a>
      </div>
      
      <!-- Security Note -->
      <div style="background: #171717; border-radius: 8px; padding: 16px; margin-top: 24px;">
        <p style="color: #737373; font-size: 14px; margin: 0;">
          If you didn't request this email, you can safely ignore it. No changes will be made to your account.
        </p>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #262626;">
      <p style="color: #525252; font-size: 12px; margin: 0 0 8px;">
        If the button doesn't work, copy and paste this link:
      </p>
      <a href="${magicLink}" style="color: ${PRIMARY_COLOR}; font-size: 12px; word-break: break-all;">${magicLink}</a>
      
      <p style="color: #404040; font-size: 11px; margin: 24px 0 0;">
        &copy; ${new Date().getFullYear()} ${APP_NAME} &bull; Options Trading Education
      </p>
    </div>
    
  </div>
</body>
</html>
  `.trim();

  const textAction = isLinking ? 'link your email' : 'sign in';
  const text = `
${APP_NAME} - ${heading}

${description} This link will expire in ${expiresInMinutes} minutes.

${magicLink}

If you didn't request this email, you can safely ignore it.

---
${APP_NAME} - Options Trading Education
  `.trim();

  try {
    await transport.sendMail({
      from: config.from,
      to: email,
      subject,
      text,
      html,
    });
    console.log(`Magic link email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Failed to send magic link email:', error);
    return false;
  }
}

export async function verifyEmailConnection(): Promise<boolean> {
  const transport = getTransporter();
  if (!transport) return false;

  try {
    await transport.verify();
    console.log('SMTP connection verified successfully');
    return true;
  } catch (error) {
    console.error('SMTP connection verification failed:', error);
    return false;
  }
}

export interface NewUserInfo {
  email?: string | null;
  nostrPubkey?: string | null;
  displayName?: string | null;
  registrationMethod: 'email' | 'nostr';
}

export async function sendNewUserNotification(userInfo: NewUserInfo): Promise<boolean> {
  const transport = getTransporter();
  const config = getEmailConfig();

  if (!transport || !config) {
    console.log('Email service not configured - skipping new user notification');
    return false;
  }

  const registeredAt = new Date().toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  const userIdentifier = userInfo.email || userInfo.nostrPubkey || 'Unknown';
  const truncatedPubkey = userInfo.nostrPubkey 
    ? `${userInfo.nostrPubkey.slice(0, 8)}...${userInfo.nostrPubkey.slice(-8)}`
    : null;

  const subject = `New ${APP_NAME} User: ${userInfo.displayName || userIdentifier}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; margin: 0; padding: 0; background-color: #000000;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    
    <!-- Header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <h1 style="color: ${PRIMARY_COLOR}; margin: 0; font-size: 28px; font-weight: 700;">
        New User Registration
      </h1>
      <p style="color: #888888; margin: 8px 0 0; font-size: 14px;">${APP_NAME} Trading Tool</p>
    </div>
    
    <!-- Main Card -->
    <div style="background: #0a0a0a; border: 1px solid #262626; border-radius: 12px; padding: 32px;">
      
      <div style="display: flex; align-items: center; margin-bottom: 24px;">
        <div style="width: 48px; height: 48px; background: ${PRIMARY_COLOR}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 16px;">
          <span style="color: #000; font-size: 20px; font-weight: bold;">
            ${(userInfo.displayName || userIdentifier).charAt(0).toUpperCase()}
          </span>
        </div>
        <div>
          <h2 style="color: #f2f2f2; margin: 0; font-size: 20px; font-weight: 600;">
            ${userInfo.displayName || 'New User'}
          </h2>
          <p style="color: #737373; margin: 4px 0 0; font-size: 14px;">
            via ${userInfo.registrationMethod === 'email' ? 'Email Magic Link' : 'NOSTR'}
          </p>
        </div>
      </div>
      
      <!-- User Details -->
      <div style="background: #171717; border-radius: 8px; padding: 16px;">
        <table style="width: 100%; border-collapse: collapse;">
          ${userInfo.email ? `
          <tr>
            <td style="color: #737373; font-size: 14px; padding: 8px 0; vertical-align: top; width: 100px;">Email</td>
            <td style="color: #f2f2f2; font-size: 14px; padding: 8px 0;">
              <a href="mailto:${userInfo.email}" style="color: ${PRIMARY_COLOR}; text-decoration: none;">${userInfo.email}</a>
            </td>
          </tr>
          ` : ''}
          ${userInfo.nostrPubkey ? `
          <tr>
            <td style="color: #737373; font-size: 14px; padding: 8px 0; vertical-align: top; width: 100px;">NOSTR</td>
            <td style="color: #f2f2f2; font-size: 14px; padding: 8px 0; font-family: monospace;">${truncatedPubkey}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="color: #737373; font-size: 14px; padding: 8px 0; vertical-align: top; width: 100px;">Registered</td>
            <td style="color: #f2f2f2; font-size: 14px; padding: 8px 0;">${registeredAt}</td>
          </tr>
        </table>
      </div>
      
    </div>
    
    <!-- Footer -->
    <div style="text-align: center; margin-top: 24px;">
      <p style="color: #404040; font-size: 11px; margin: 0;">
        ${APP_NAME} Admin Notification
      </p>
    </div>
    
  </div>
</body>
</html>
  `.trim();

  const text = `
New ${APP_NAME} User Registration

Display Name: ${userInfo.displayName || 'Not set'}
${userInfo.email ? `Email: ${userInfo.email}` : ''}
${userInfo.nostrPubkey ? `NOSTR Pubkey: ${userInfo.nostrPubkey}` : ''}
Registration Method: ${userInfo.registrationMethod === 'email' ? 'Email Magic Link' : 'NOSTR'}
Registered: ${registeredAt}
  `.trim();

  try {
    await transport.sendMail({
      from: config.from,
      to: ADMIN_EMAIL,
      subject,
      text,
      html,
    });
    console.log(`New user notification sent to ${ADMIN_EMAIL} for user: ${userIdentifier}`);
    return true;
  } catch (error) {
    console.error('Failed to send new user notification:', error);
    return false;
  }
}
