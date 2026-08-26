// Transactional email for Musafir.
// Transport: ZeptoMail SMTP (nodemailer). Swapping to Amazon SES later is a .env change:
// SMTP_HOST=email-smtp.ap-south-1.amazonaws.com + SES SMTP credentials. No code changes.
//
// If SMTP_* is not configured the mailer runs in DEV mode: nothing is sent,
// the email (and any action link) is printed to the console so the flow is still demoable.

const nodemailer = require('nodemailer');

const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const FROM = process.env.MAIL_FROM || 'Musafir <noreply@musafir.siddheshgupta.com>';
const ENABLED = !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);

let transporter = null;
if (ENABLED) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// ---------- Layout: boarding-pass themed HTML shell ----------
function layout({ eyebrow, title, bodyHtml, cta, footnote }) {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:#f6f6f1;font-family:Helvetica,Arial,sans-serif;color:#161c36;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f1;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #d9d9cf;border-radius:14px;overflow:hidden;">
  <tr><td style="background:#161c36;color:#f6f6f1;padding:18px 28px;font-weight:800;font-size:18px;letter-spacing:.06em;">
    <span style="color:#f4a300;">&#10022;</span> MUSAFIR
    <span style="float:right;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:.1em;color:#a9b0cc;font-weight:400;padding-top:4px;">HAR SAFAR, SORTED.</span>
  </td></tr>
  <tr><td style="padding:32px 28px 8px;">
    <p style="margin:0 0 8px;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:.12em;color:#12727d;">${eyebrow}</p>
    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.15;font-weight:800;">${title}</h1>
    <div style="font-size:15px;line-height:1.6;color:#3a4160;">${bodyHtml}</div>
    ${cta ? `<p style="margin:28px 0 8px;"><a href="${cta.href}" style="display:inline-block;background:#f4a300;color:#161c36;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;font-size:15px;">${cta.label}</a></p>
    <p style="margin:0;font-size:12px;color:#7a819e;word-break:break-all;">Or paste this link: ${cta.href}</p>` : ''}
  </td></tr>
  <tr><td style="padding:20px 28px 0;"><div style="border-top:2px dashed #d9d9cf;"></div></td></tr>
  <tr><td style="padding:16px 28px 28px;font-size:12px;line-height:1.6;color:#7a819e;">
    ${footnote || ''}
    <p style="margin:8px 0 0;">Musafir &middot; <a href="${APP_URL}" style="color:#12727d;">${APP_URL.replace(/^https?:\/\//, '')}</a></p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

async function send({ to, subject, html, text }) {
  if (!ENABLED) {
    const links = (html.match(/https?:\/\/[^\s"<]+/g) || []).filter(l => l !== APP_URL);
    console.log(`\n📧 [DEV MAIL] to: ${to}\n   subject: ${subject}${links.length ? '\n   link: ' + links[0] : ''}\n`);
    return { dev: true };
  }
  return transporter.sendMail({ from: FROM, to, subject, html, text });
}

// ---------- Templates ----------
const mailer = {
  enabled: ENABLED,

  verifyEmail({ to, name, token }) {
    const href = `${APP_URL}/verify/${token}`;
    return send({
      to, subject: 'Confirm your email to start booking · Musafir',
      html: layout({
        eyebrow: 'BOARDING PASS · STEP 1 OF 1',
        title: `Welcome aboard, ${name.split(' ')[0]}.`,
        bodyHtml: `<p style="margin:0 0 12px;">Confirm this email address and your account is ready. The link works for 24 hours.</p>`,
        cta: { href, label: 'Confirm my email' },
        footnote: `<p style="margin:0;">Didn't create a Musafir account? Ignore this email and nothing happens.</p>`,
      }),
      text: `Hi ${name}, confirm your Musafir account: ${href} (valid 24h)`,
    });
  },

  welcome({ to, name, coupon }) {
    return send({
      to, subject: `You're in. Here's ₹1,500 off your first trip · Musafir`,
      html: layout({
        eyebrow: 'ACCOUNT CONFIRMED',
        title: `Har safar, sorted, ${name.split(' ')[0]}.`,
        bodyHtml: `<p style="margin:0 0 14px;">Your email is verified. As a new musafir you get 10% off your first booking, capped at ₹1,500.</p>
        <p style="margin:0 0 6px;font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:.12em;color:#12727d;">YOUR COUPON</p>
        <p style="margin:0;display:inline-block;border:2px dashed #f4a300;border-radius:8px;padding:10px 18px;font-family:Menlo,Consolas,monospace;font-size:20px;letter-spacing:.14em;font-weight:700;">${coupon}</p>`,
        cta: { href: `${APP_URL}/packages`, label: 'Browse trips' },
      }),
      text: `Your Musafir account is verified. Use ${coupon} for 10% off your first booking: ${APP_URL}/packages`,
    });
  },

  resetPassword({ to, name, token }) {
    const href = `${APP_URL}/reset/${token}`;
    return send({
      to, subject: 'Reset your Musafir password',
      html: layout({
        eyebrow: 'PASSWORD RESET',
        title: `Set a new password, ${name.split(' ')[0]}.`,
        bodyHtml: `<p style="margin:0;">Use the button below to choose a new password. The link works for 1 hour and can be used once.</p>`,
        cta: { href, label: 'Reset password' },
        footnote: `<p style="margin:0;">If you didn't ask for this, your password is unchanged and you can ignore this email.</p>`,
      }),
      text: `Reset your Musafir password: ${href} (valid 1h)`,
    });
  },

  bookingConfirmed({ to, name, booking }) {
    const { ref, title, destination, startDate, travelers, amount, coupon, discount } = booking;
    const fmtDate = new Date(startDate).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
    const inr = n => '₹' + Number(n).toLocaleString('en-IN');
    const row = (k, v, strong) => `<tr><td style="padding:8px 0;border-bottom:1px dashed #d9d9cf;color:#7a819e;font-size:13px;">${k}</td><td align="right" style="padding:8px 0;border-bottom:1px dashed #d9d9cf;font-family:Menlo,Consolas,monospace;font-size:13px;${strong ? 'font-weight:700;font-size:15px;' : ''}">${v}</td></tr>`;
    return send({
      to, subject: `Booking confirmed · ${ref} · ${title}`,
      html: layout({
        eyebrow: `BOOKING REFERENCE · ${ref}`,
        title: `${destination}, you're on the list.`,
        bodyHtml: `<p style="margin:0 0 16px;">${name.split(' ')[0]}, your seats on <strong>${title}</strong> are confirmed. Keep this email — the reference above is your ticket.</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${row('Departure', fmtDate)}
          ${row('Travellers', travelers)}
          ${coupon ? row(`Coupon ${coupon}`, '− ' + inr(discount)) : ''}
          ${row('Paid', inr(amount), true)}
        </table>`,
        cta: { href: `${APP_URL}/my-bookings`, label: 'View my bookings' },
        footnote: `<p style="margin:0;">Free cancellation until departure from My bookings. Seats are released back instantly.</p>`,
      }),
      text: `Booking ${ref} confirmed: ${title}, ${fmtDate}, ${travelers} traveller(s), paid ${inr(amount)}. ${APP_URL}/my-bookings`,
    });
  },
};

module.exports = mailer;
