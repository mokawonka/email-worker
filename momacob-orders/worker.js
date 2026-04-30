/**
 * MOMACOB — Cloudflare Worker
 * Handles two routes:
 *   POST /order   — sends a formatted order email to the team
 *   POST /contact — forwards a contact-form message to the team
 *
 * Required Worker secrets (set via `wrangler secret put`):
 *   RESEND_API_KEY   → your Resend key (re_...)
 *   FROM_EMAIL       → verified sender, e.g. orders@yourdomain.com
 *                      (use onboarding@resend.dev on the free plan)
 *   MOMACOB_EMAIL    → sarl.momacob@gmail.com
 */

export default {
  async fetch(request, env) {

    /* ── CORS preflight ── */
    if (request.method === 'OPTIONS') return cors(null, 204);
    if (request.method !== 'POST')    return cors({ error: 'Method not allowed' }, 405);

    const url  = new URL(request.url);
    let   body;
    try { body = await request.json(); }
    catch { return cors({ error: 'Invalid JSON' }, 400); }

    /* ── Route ── */
    if (url.pathname === '/order')   return handleOrder(body, env);
    if (url.pathname === '/contact') return handleContact(body, env);
    return cors({ error: 'Not found' }, 404);
  }
};

/* ══════════════════════════════════════════════════════
   ROUTE: /order
══════════════════════════════════════════════════════ */
async function handleOrder(body, env) {
  const { customer, items, ref, total } = body;

  if (!customer?.name || !customer?.phone || !items?.length || !ref) {
    return cors({ error: 'Champs manquants' }, 400);
  }

  try {
    await sendEmail(env, {
      to:      env.MOMACOB_EMAIL,
      subject: `📦 Nouvelle commande ${ref} — ${customer.name}`,
      html:    buildOrderEmail(ref, customer, items, total),
    });
    return cors({ success: true, ref }, 200);
  } catch (err) {
    console.error('Resend error:', err.message);
    return cors({ error: err.message }, 500);
  }
}

/* ══════════════════════════════════════════════════════
   ROUTE: /contact
══════════════════════════════════════════════════════ */
async function handleContact(body, env) {
  const { name, phone, message } = body;

  if (!name && !message) return cors({ error: 'Formulaire vide' }, 400);

  try {
    await sendEmail(env, {
      to:      env.MOMACOB_EMAIL,
      subject: `📩 Message de ${name || 'un visiteur'} — MOMACOB`,
      html:    buildContactEmail(name, phone, message),
    });
    return cors({ success: true }, 200);
  } catch (err) {
    return cors({ error: err.message }, 500);
  }
}

/* ══════════════════════════════════════════════════════
   RESEND HELPER
══════════════════════════════════════════════════════ */
async function sendEmail(env, { to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, html }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Resend HTTP ${res.status}`);
  }
}

/* ══════════════════════════════════════════════════════
   EMAIL TEMPLATE: ORDER
══════════════════════════════════════════════════════ */
function buildOrderEmail(ref, c, items, total) {
  const fmtDA = n => Number(n).toLocaleString('fr-DZ') + ' DA';
  const date  = new Date().toLocaleString('fr-DZ', { dateStyle: 'long', timeStyle: 'short' });

  const rows = items.map(i => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #e8d5b0;color:#1a0f08;font-weight:600">${esc(i.name)}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e8d5b0;text-align:center;color:#4a2c14">${i.qty}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #e8d5b0;text-align:right;font-weight:700;color:#d4541a">
        ${fmtDA(parsePriceDA(i.price) * i.qty)}
      </td>
    </tr>`).join('');

  const wilayaRow = c.wilaya
    ? `<tr><td style="padding:7px 0;color:#8a6040;width:110px">Wilaya</td><td style="padding:7px 0;font-weight:600;color:#1a0f08">${esc(c.wilaya)}</td></tr>`
    : '';
  const notesRow = c.notes
    ? `<tr><td style="padding:7px 0;color:#8a6040;vertical-align:top">Notes</td><td style="padding:7px 0;color:#1a0f08;white-space:pre-line">${esc(c.notes)}</td></tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f5ead8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ead8;padding:30px 10px;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0"
  style="max-width:600px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 32px rgba(59,35,20,.2);">

  <!-- HEADER -->
  <tr>
    <td style="background:#3b2314;padding:28px 32px;text-align:center;border-bottom:4px solid #c87941;">
      <div style="font-size:28px;font-weight:900;color:#e8d5b0;letter-spacing:5px;font-family:Arial Black,Arial,sans-serif;">MOMACOB</div>
      <div style="font-size:11px;color:#c87941;letter-spacing:3px;text-transform:uppercase;margin-top:6px;">Matériaux de Construction — Algérie</div>
    </td>
  </tr>

  <!-- ORDER BANNER -->
  <tr>
    <td style="background:#d4541a;padding:13px 32px;text-align:center;">
      <span style="color:white;font-size:14px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">
        📦 Nouvelle Commande — ${esc(ref)}
      </span>
    </td>
  </tr>

  <!-- BODY -->
  <tr>
    <td style="background:#fdfaf6;padding:32px;">
      <p style="margin:0 0 22px;font-size:12px;color:#8a6040;">${date}</p>

      <!-- Client info -->
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:#fdf6ec;border:1px solid #e8d5b0;border-radius:8px;margin-bottom:26px;overflow:hidden;">
        <tr>
          <td colspan="2" style="background:#3b2314;padding:10px 16px;">
            <span style="color:#c87941;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Informations client</span>
          </td>
        </tr>
        <tr>
          <td style="padding:7px 16px;font-size:13px;color:#8a6040;width:110px;">Nom</td>
          <td style="padding:7px 16px;font-size:14px;font-weight:700;color:#1a0f08;">${esc(c.name)}</td>
        </tr>
        <tr style="background:#f5ead8;">
          <td style="padding:7px 16px;font-size:13px;color:#8a6040;">Téléphone</td>
          <td style="padding:7px 16px;font-size:14px;font-weight:700;">
            <a href="tel:${esc(c.phone)}" style="color:#d4541a;text-decoration:none;">${esc(c.phone)}</a>
          </td>
        </tr>
        ${wilayaRow ? wilayaRow.replace(/padding:7px 0/g,'padding:7px 16px').replace(/width:110px/,'') : ''}
        ${notesRow  ? notesRow.replace(/padding:7px 0/g,'padding:7px 16px').replace(/vertical-align:top;/,'vertical-align:top;') : ''}
      </table>

      <!-- Items table -->
      <table width="100%" cellpadding="0" cellspacing="0"
        style="border:1px solid #e8d5b0;border-radius:8px;overflow:hidden;margin-bottom:22px;">
        <thead>
          <tr style="background:#3b2314;">
            <th style="padding:10px 14px;text-align:left;color:#e8d5b0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Produit</th>
            <th style="padding:10px 14px;text-align:center;color:#e8d5b0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Qté</th>
            <th style="padding:10px 14px;text-align:right;color:#e8d5b0;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Montant</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr style="background:#fdf6ec;">
            <td colspan="2" style="padding:13px 14px;font-weight:700;font-size:14px;color:#3b2314;letter-spacing:1px;text-transform:uppercase;">TOTAL ESTIMÉ</td>
            <td style="padding:13px 14px;font-weight:700;font-size:18px;color:#d4541a;text-align:right;">${fmtDA(total)}</td>
          </tr>
        </tfoot>
      </table>

      <!-- CTA -->
      <div style="text-align:center;margin-top:24px;">
        <a href="tel:${esc(c.phone)}"
          style="display:inline-block;background:#d4541a;color:white;padding:14px 36px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:2px;text-transform:uppercase;">
          📞 Appeler le client
        </a>
      </div>
    </td>
  </tr>

  <!-- FOOTER -->
  <tr>
    <td style="background:#200e05;padding:18px 32px;text-align:center;border-top:3px solid #c87941;">
      <p style="margin:0;font-size:12px;color:#6b3a1f;">
        SARL MOMACOB &nbsp;|&nbsp;
        <a href="mailto:sarl.momacob@gmail.com" style="color:#c87941;text-decoration:none;">sarl.momacob@gmail.com</a>
        &nbsp;|&nbsp;
        <a href="tel:0798883266" style="color:#c87941;text-decoration:none;">07 98 88 32 66</a>
      </p>
      <p style="margin:6px 0 0;font-size:11px;color:#3b2314;">Commande reçue via le site MOMACOB</p>
    </td>
  </tr>

</table>
</td></tr></table>
</body></html>`;
}

/* ══════════════════════════════════════════════════════
   EMAIL TEMPLATE: CONTACT
══════════════════════════════════════════════════════ */
function buildContactEmail(name, phone, message) {
  const date = new Date().toLocaleString('fr-DZ', { dateStyle: 'long', timeStyle: 'short' });
  return `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f5ead8;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f5ead8;padding:30px 10px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0"
  style="max-width:560px;width:100%;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(59,35,20,.2);">

  <tr>
    <td style="background:#3b2314;padding:24px 32px;text-align:center;border-bottom:4px solid #c87941;">
      <div style="font-size:24px;font-weight:900;color:#e8d5b0;letter-spacing:5px;font-family:Arial Black,Arial,sans-serif;">MOMACOB</div>
      <div style="font-size:10px;color:#c87941;letter-spacing:3px;text-transform:uppercase;margin-top:5px;">Message reçu via le site</div>
    </td>
  </tr>

  <tr>
    <td style="background:#fdfaf6;padding:28px 32px;">
      <p style="margin:0 0 20px;font-size:12px;color:#8a6040;">${date}</p>
      <table width="100%" cellpadding="0" cellspacing="0"
        style="background:#fdf6ec;border:1px solid #e8d5b0;border-radius:8px;overflow:hidden;margin-bottom:20px;">
        <tr>
          <td colspan="2" style="background:#3b2314;padding:9px 16px;">
            <span style="color:#c87941;font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Expéditeur</span>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 16px;font-size:13px;color:#8a6040;width:100px;">Nom</td>
          <td style="padding:8px 16px;font-size:14px;font-weight:700;color:#1a0f08;">${esc(name || '—')}</td>
        </tr>
        <tr style="background:#f5ead8;">
          <td style="padding:8px 16px;font-size:13px;color:#8a6040;">Téléphone</td>
          <td style="padding:8px 16px;font-size:14px;font-weight:700;">
            ${phone ? `<a href="tel:${esc(phone)}" style="color:#d4541a;text-decoration:none;">${esc(phone)}</a>` : '—'}
          </td>
        </tr>
      </table>

      <div style="background:#fdf6ec;border:1px solid #e8d5b0;border-radius:8px;padding:18px 20px;">
        <div style="font-size:11px;color:#c87941;font-weight:700;letter-spacing:2px;text-transform:uppercase;margin-bottom:10px;background:#3b2314;margin:-18px -20px 14px;padding:9px 16px;border-radius:8px 8px 0 0;">Message</div>
        <p style="margin:0;font-size:14px;color:#1a0f08;line-height:1.75;white-space:pre-line;">${esc(message || '—')}</p>
      </div>

      ${phone ? `<div style="text-align:center;margin-top:22px;"><a href="tel:${esc(phone)}" style="display:inline-block;background:#d4541a;color:white;padding:12px 30px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:2px;text-transform:uppercase;">📞 Rappeler</a></div>` : ''}
    </td>
  </tr>

  <tr>
    <td style="background:#200e05;padding:16px 32px;text-align:center;border-top:3px solid #c87941;">
      <p style="margin:0;font-size:12px;color:#6b3a1f;">
        <a href="mailto:sarl.momacob@gmail.com" style="color:#c87941;text-decoration:none;">sarl.momacob@gmail.com</a>
        &nbsp;|&nbsp;
        <a href="tel:0798883266" style="color:#c87941;text-decoration:none;">07 98 88 32 66</a>
      </p>
    </td>
  </tr>

</table>
</td></tr></table>
</body></html>`;
}

/* ══════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════ */
function parsePriceDA(str) {
  const n = parseFloat(String(str ?? '').replace(/[^\d.]/g, ''));
  return isNaN(n) ? 0 : n;
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

function cors(body, status) {
  return new Response(
    body ? JSON.stringify(body) : null,
    {
      status,
      headers: {
        'Content-Type':                  'application/json',
        'Access-Control-Allow-Origin':   '*',
        'Access-Control-Allow-Methods':  'POST, OPTIONS',
        'Access-Control-Allow-Headers':  'Content-Type',
      },
    }
  );
}