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
  expiresInMinutes: number = 15
): Promise<boolean> {
  const transport = getTransporter();
  const config = getEmailConfig();

  if (!transport || !config) {
    console.error('Email service not configured');
    return false;
  }

  const appName = 'Options4L';
  const subject = `Sign in to ${appName}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">${appName}</h1>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 10px 10px;">
    <h2 style="color: #333; margin-top: 0;">Sign in to your account</h2>
    
    <p>Click the button below to sign in to ${appName}. This link will expire in ${expiresInMinutes} minutes.</p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${magicLink}" 
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; 
                padding: 14px 30px; 
                text-decoration: none; 
                border-radius: 6px; 
                font-weight: 600;
                display: inline-block;">
        Sign In
      </a>
    </div>
    
    <p style="color: #666; font-size: 14px;">
      If you didn't request this email, you can safely ignore it.
    </p>
    
    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
    
    <p style="color: #999; font-size: 12px;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${magicLink}" style="color: #667eea; word-break: break-all;">${magicLink}</a>
    </p>
  </div>
</body>
</html>
  `.trim();

  const text = `
Sign in to ${appName}

Click the link below to sign in. This link will expire in ${expiresInMinutes} minutes.

${magicLink}

If you didn't request this email, you can safely ignore it.
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
