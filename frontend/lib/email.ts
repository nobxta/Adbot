/**
 * Email Service Abstraction
 * Provider-agnostic email sending with fail-safe error handling
 * Never blocks core flows - all failures are logged but don't throw
 */

interface EmailOptions {
  to: string;
  subject: string;
  template: 'pre-expiry' | 'expiry' | 'deletion' | 'renewal-success';
  data: {
    bot_id?: string;
    bot_name?: string;
    expires_at?: string;
    grace_expires_at?: string;
    renewal_url?: string;
    [key: string]: any;
  };
}

interface EmailResult {
  success: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send email using configured provider
 * This function is fail-safe - never throws, always returns result
 */
export async function sendEmail(options: EmailOptions): Promise<EmailResult> {
  try {
    const provider = process.env.EMAIL_PROVIDER || 'smtp';
    
    switch (provider) {
      case 'resend':
        return await sendViaResend(options);
      case 'sendgrid':
        return await sendViaSendGrid(options);
      case 'smtp':
      default:
        return await sendViaSMTP(options);
    }
  } catch (error) {
    // CRITICAL: Never throw - log and return failure
    console.error('[Email] Failed to send email:', {
      to: options.to,
      subject: options.subject,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send via Resend API
 */
async function sendViaResend(options: EmailOptions): Promise<EmailResult> {
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@hqadz.com';
  
  if (!RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY not configured, skipping email');
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const { html, text } = renderEmailTemplate(options.template, options.data);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: options.to,
        subject: options.subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `Resend API error: ${response.status}`);
    }

    const result = await response.json();
    return {
      success: true,
      messageId: result.id,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Send via SendGrid API
 */
async function sendViaSendGrid(options: EmailOptions): Promise<EmailResult> {
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
  const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@hqadz.com';
  
  if (!SENDGRID_API_KEY) {
    console.warn('[Email] SENDGRID_API_KEY not configured, skipping email');
    return { success: false, error: 'SENDGRID_API_KEY not configured' };
  }

  const { html, text } = renderEmailTemplate(options.template, options.data);

  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SENDGRID_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: options.to }] }],
        from: { email: FROM_EMAIL },
        subject: options.subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html },
        ],
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`SendGrid API error: ${response.status} - ${errorData}`);
    }

    return {
      success: true,
      messageId: response.headers.get('x-message-id') || undefined,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Send via SMTP (using nodemailer)
 */
async function sendViaSMTP(options: EmailOptions): Promise<EmailResult> {
  // SMTP configuration
  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@hqadz.com';

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[Email] SMTP not configured, skipping email');
    return { success: false, error: 'SMTP not configured' };
  }

  try {
    // Dynamic import to avoid requiring nodemailer if not used
    const nodemailer = await import('nodemailer');
    
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
    });

    const { html, text } = renderEmailTemplate(options.template, options.data);

    const info = await transporter.sendMail({
      from: FROM_EMAIL,
      to: options.to,
      subject: options.subject,
      html,
      text,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Render email template (HTML + text)
 */
function renderEmailTemplate(template: EmailOptions['template'], data: EmailOptions['data']): { html: string; text: string } {
  const templates = {
    'pre-expiry': {
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #4F46E5; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Subscription Expiring Soon</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>Your AdBot subscription <strong>${data.bot_id || data.bot_name || 'subscription'}</strong> will expire in <strong>48 hours</strong>.</p>
              <p><strong>Expiry Date:</strong> ${data.expires_at ? new Date(data.expires_at).toLocaleString() : 'N/A'}</p>
              <p>To avoid interruption, please renew your subscription before it expires.</p>
              ${data.renewal_url ? `<a href="${data.renewal_url}" class="button">Renew Now</a>` : ''}
            </div>
            <div class="footer">
              <p>This is an automated notification from HQAdz.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Subscription Expiring Soon

Hello,

Your AdBot subscription ${data.bot_id || data.bot_name || 'subscription'} will expire in 48 hours.

Expiry Date: ${data.expires_at ? new Date(data.expires_at).toLocaleString() : 'N/A'}

To avoid interruption, please renew your subscription before it expires.

${data.renewal_url ? `Renew now: ${data.renewal_url}` : ''}

This is an automated notification from HQAdz.
      `,
    },
    'expiry': {
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #F59E0B; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .button { display: inline-block; padding: 12px 24px; background: #4F46E5; color: white; text-decoration: none; border-radius: 6px; margin-top: 20px; }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>⚠️ Your Plan Has Expired</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>Your AdBot subscription <strong>${data.bot_id || data.bot_name || 'subscription'}</strong> has expired.</p>
              <p><strong>Expired At:</strong> ${data.expires_at ? new Date(data.expires_at).toLocaleString() : 'N/A'}</p>
              <p><strong>Grace Period Ends:</strong> ${data.grace_expires_at ? new Date(data.grace_expires_at).toLocaleString() : 'N/A'}</p>
              <p>You have <strong>24 hours</strong> to renew before your bot is permanently deleted.</p>
              ${data.renewal_url ? `<a href="${data.renewal_url}" class="button">Renew Now</a>` : ''}
            </div>
            <div class="footer">
              <p>This is an automated notification from HQAdz.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Your Plan Has Expired

Hello,

Your AdBot subscription ${data.bot_id || data.bot_name || 'subscription'} has expired.

Expired At: ${data.expires_at ? new Date(data.expires_at).toLocaleString() : 'N/A'}
Grace Period Ends: ${data.grace_expires_at ? new Date(data.grace_expires_at).toLocaleString() : 'N/A'}

You have 24 hours to renew before your bot is permanently deleted.

${data.renewal_url ? `Renew now: ${data.renewal_url}` : ''}

This is an automated notification from HQAdz.
      `,
    },
    'deletion': {
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #EF4444; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>❌ Your AdBot Was Deleted</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>Your AdBot subscription <strong>${data.bot_id || data.bot_name || 'subscription'}</strong> has been permanently deleted due to non-renewal.</p>
              <p><strong>Deleted At:</strong> ${new Date().toLocaleString()}</p>
              <p>Unfortunately, renewal is no longer possible for this subscription.</p>
              <p>If you'd like to continue using our service, please create a new subscription.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from HQAdz.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Your AdBot Was Deleted

Hello,

Your AdBot subscription ${data.bot_id || data.bot_name || 'subscription'} has been permanently deleted due to non-renewal.

Deleted At: ${new Date().toLocaleString()}

Unfortunately, renewal is no longer possible for this subscription.

If you'd like to continue using our service, please create a new subscription.

This is an automated notification from HQAdz.
      `,
    },
    'renewal-success': {
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #10B981; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Subscription Renewed</h1>
            </div>
            <div class="content">
              <p>Hello,</p>
              <p>Your AdBot subscription <strong>${data.bot_id || data.bot_name || 'subscription'}</strong> has been successfully renewed.</p>
              <p><strong>New Expiry Date:</strong> ${data.expires_at ? new Date(data.expires_at).toLocaleString() : 'N/A'}</p>
              <p>Your bot is now active and ready to use.</p>
            </div>
            <div class="footer">
              <p>This is an automated notification from HQAdz.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Subscription Renewed

Hello,

Your AdBot subscription ${data.bot_id || data.bot_name || 'subscription'} has been successfully renewed.

New Expiry Date: ${data.expires_at ? new Date(data.expires_at).toLocaleString() : 'N/A'}

Your bot is now active and ready to use.

This is an automated notification from HQAdz.
      `,
    },
  };

  const template = templates[template];
  if (!template) {
    throw new Error(`Unknown email template: ${template}`);
  }

  return {
    html: template.html.trim(),
    text: template.text.trim(),
  };
}
