import type { Env } from "../types";

export interface SendEmailParams {
  to: string;
  recipientName?: string;
  resetUrl: string;
  token: string;
}

export interface SendEmailResult {
  sent: boolean;
  provider?: string;
  error?: string;
}

export async function dispatchPasswordResetEmail(
  env: Env,
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const { to, recipientName, resetUrl, token } = params;
  const nameDisplay = recipientName || "Listener";

  const emailSubject = "Reset your audioneko password";
  const emailHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Reset your audioneko password</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0d0d0d;
      color: #e5e5e5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
    }
    .wrapper {
      max-width: 540px;
      margin: 40px auto;
      padding: 32px 24px;
      background-color: #141414;
      border: 1px solid #262626;
      border-radius: 8px;
    }
    .header {
      border-bottom: 1px solid #262626;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .title {
      font-size: 18px;
      font-weight: 600;
      color: #ffffff;
      margin: 0;
      letter-spacing: -0.02em;
    }
    .subtitle {
      font-size: 12px;
      font-family: monospace;
      color: #a3a3a3;
      margin-top: 4px;
    }
    .content {
      font-size: 14px;
      color: #e5e5e5;
      margin-bottom: 24px;
    }
    .button-wrap {
      margin: 28px 0;
      text-align: center;
    }
    .btn {
      display: inline-block;
      padding: 12px 28px;
      background-color: #e04838;
      color: #ffffff !important;
      text-decoration: none;
      font-size: 13px;
      font-weight: 600;
      font-family: monospace;
      border-radius: 4px;
      letter-spacing: 0.04em;
    }
    .token-box {
      background-color: #1a1a1a;
      border: 1px solid #333333;
      border-radius: 6px;
      padding: 16px;
      margin-top: 24px;
      font-family: monospace;
      font-size: 12px;
      color: #ffffff;
      word-break: break-all;
    }
    .token-label {
      color: #a3a3a3;
      font-size: 11px;
      margin-bottom: 6px;
    }
    .token-value {
      color: #ff5442;
      font-weight: 700;
      font-size: 14px;
      letter-spacing: 0.05em;
    }
    .footer {
      border-top: 1px solid #262626;
      padding-top: 16px;
      margin-top: 32px;
      font-size: 11px;
      font-family: monospace;
      color: #737373;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1 class="title">Password Recovery</h1>
      <div class="subtitle">audioneko private instance</div>
    </div>
    <div class="content">
      <p>Hello ${nameDisplay},</p>
      <p>A request was received to reset the password for your audioneko account (<strong>${to}</strong>).</p>
      <div class="button-wrap">
        <a href="${resetUrl}" class="btn">RESET PASSWORD DIRECTLY</a>
      </div>
      <p>Clicking the button above opens the secure recovery screen with your token prefilled.</p>
      
      <div class="token-box">
        <div class="token-label">Alternative: Manual Reset Token</div>
        <div class="token-value">${token}</div>
      </div>
      <p style="margin-top: 16px; font-size: 12px; color: #a3a3a3;">
        This token is valid for 1 hour. If you did not request this reset, you can safely ignore this email.
      </p>
    </div>
    <div class="footer">
      audioneko audiobook platform - Automated instance notification
    </div>
  </div>
</body>
</html>
  `.trim();

  const fromAddress = env.EMAIL_FROM || "audioneko <onboarding@resend.dev>";

  // 1. Check Resend (Standard)
  if (env.RESEND_API_KEY) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: fromAddress,
          to: [to],
          subject: emailSubject,
          html: emailHtml,
        }),
      });

      if (res.ok) {
        console.log(`[email] Successfully dispatched password reset to ${to} via Resend`);
        return { sent: true, provider: "resend" };
      }

      const errorText = await res.text();
      console.error(`[email] Resend delivery failed for ${to}:`, res.status, errorText);
      return { sent: false, provider: "resend", error: errorText };
    } catch (err) {
      console.error(`[email] Resend network error for ${to}:`, err);
      return {
        sent: false,
        provider: "resend",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 2. Check Brevo (Sendinblue)
  if (env.BREVO_API_KEY) {
    try {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "audioneko", email: env.EMAIL_FROM || "no-reply@audioneko.app" },
          to: [{ email: to, name: recipientName }],
          subject: emailSubject,
          htmlContent: emailHtml,
        }),
      });

      if (res.ok) {
        console.log(`[email] Successfully dispatched password reset to ${to} via Brevo`);
        return { sent: true, provider: "brevo" };
      }

      const errorText = await res.text();
      console.error(`[email] Brevo delivery failed for ${to}:`, res.status, errorText);
      return { sent: false, provider: "brevo", error: errorText };
    } catch (err) {
      console.error(`[email] Brevo network error for ${to}:`, err);
      return {
        sent: false,
        provider: "brevo",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // 3. Check Postmark
  if (env.POSTMARK_API_KEY) {
    try {
      const res = await fetch("https://api.postmarkapp.com/email", {
        method: "POST",
        headers: {
          "X-Postmark-Server-Token": env.POSTMARK_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          From: env.EMAIL_FROM || "no-reply@audioneko.app",
          To: to,
          Subject: emailSubject,
          HtmlBody: emailHtml,
        }),
      });

      if (res.ok) {
        console.log(`[email] Successfully dispatched password reset to ${to} via Postmark`);
        return { sent: true, provider: "postmark" };
      }

      const errorText = await res.text();
      console.error(`[email] Postmark delivery failed for ${to}:`, res.status, errorText);
      return { sent: false, provider: "postmark", error: errorText };
    } catch (err) {
      console.error(`[email] Postmark network error for ${to}:`, err);
      return {
        sent: false,
        provider: "postmark",
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // No email provider secret configured on Cloudflare Workers
  console.warn(
    `[email] No email service configured (RESEND_API_KEY, BREVO_API_KEY, or POSTMARK_API_KEY). Token logged: ${token}`,
  );
  return {
    sent: false,
    error: "No email service configured on Cloudflare worker environment",
  };
}
