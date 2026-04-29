/**
 * ═══════════════════════════════════════════════════════════════
 *  Éditions Skookoo — Cloudflare Worker
 *  Paste this entire file into the Cloudflare Worker browser editor
 *
 *  What it does:
 *    1. Receives the order payload from panier.html
 *    2. Verifies the hCaptcha token with your secret key
 *    3. Sends 2 emails via Resend (platform + customer)
 *    4. Returns a JSON response to the browser
 *
 *  Setup (all in your browser at dash.cloudflare.com):
 *    Workers & Pages → Create → Create Worker → paste this → Deploy
 *    Then: Settings → Variables → add the 4 secrets below
 * ═══════════════════════════════════════════════════════════════
 *
 *  Environment variables to set in Worker Settings → Variables:
 *
 *    RESEND_API_KEY    →  re_xxxxxxxxxxxx          (from resend.com)
 *    FROM_EMAIL        →  commandes@votre-domaine  (verified in Resend)
 *    PLATFORM_EMAIL    →  vous@votre-email.com     (your inbox)
 *    HCAPTCHA_SECRET   →  your hCaptcha secret key (from hcaptcha.com)
 *
 *  All 4 are stored as secrets — never exposed to the browser.
 */

export default {
  async fetch(request, env) {

    /* ── CORS preflight ── */
    if (request.method === 'OPTIONS') {
      return corsResponse(null, 204);
    }

    if (request.method !== 'POST') {
      return corsResponse({ error: 'Method not allowed' }, 405);
    }

    /* ── Parse body ── */
    let body;
    try {
      body = await request.json();
    } catch {
      return corsResponse({ error: 'Invalid JSON body' }, 400);
    }

    const { captchaToken, customer, items, ref, total } = body;

    /* ── Basic field checks ── */
    if (!captchaToken || !customer?.email || !customer?.name || !items?.length || !ref) {
      return corsResponse({ error: 'Champs manquants' }, 400);
    }

    /* ── 1. Verify hCaptcha token ── */
    const captchaVerify = await fetch('https://api.hcaptcha.com/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `secret=${encodeURIComponent(env.HCAPTCHA_SECRET)}&response=${encodeURIComponent(captchaToken)}`
    });
    const captchaResult = await captchaVerify.json();

    if (!captchaResult.success) {
      return corsResponse({ error: 'Vérification anti-robot échouée. Réessayez.' }, 403);
    }

    /* ── 2. Send email to platform ── */
    try {
      await sendEmail(env, {
        to:      env.PLATFORM_EMAIL,
        subject: `📦 Nouvelle commande ${ref} — ${customer.name}`,
        html:    buildPlatformEmail(ref, customer, items, total)
      });
    } catch (err) {
      return corsResponse({ error: `Erreur envoi email plateforme : ${err.message}` }, 500);
    }

    /* ── 3. Send confirmation email to customer ── */
    try {
      await sendEmail(env, {
        to:      customer.email,
        subject: `Votre commande Éditions Skookoo — ${ref}`,
        html:    buildCustomerEmail(ref, customer, items, total)
      });
    } catch (err) {
      // Platform email already sent — log but don't fail the order
      console.error('Customer email failed:', err.message);
    }

    return corsResponse({ success: true, ref }, 200);
  }
};

/* ═══════════════════════════════════════════════
   RESEND HELPER
═══════════════════════════════════════════════ */
async function sendEmail(env, { to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: env.FROM_EMAIL, to, subject, html })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Resend HTTP ${res.status}`);
  }
  return res.json();
}

/* ═══════════════════════════════════════════════
   CORS HELPER
═══════════════════════════════════════════════ */
function corsResponse(body, status) {
  const headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };
  return new Response(
    body ? JSON.stringify(body) : null,
    { status, headers }
  );
}

/* ═══════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════ */
const fmtDA       = n => n.toLocaleString('fr-DZ') + ' DA';
const paperLabel  = p => p === 'bouffant' ? 'Bouffant' : 'Standard';

/* ═══════════════════════════════════════════════
   EMAIL: PLATFORM (you receive this)
═══════════════════════════════════════════════ */
function buildPlatformEmail(ref, c, items, total) {
  const rows = items.map(i => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid #f0e8d0;font-weight:600;color:#2A1F0E">${esc(i.title)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0e8d0;color:#7A6045;font-style:italic">${esc(i.author)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0e8d0;font-size:13px;color:#9A8060">
        ${esc(i.font)} · ${i.fontSize}pt · ×${parseFloat(i.lineSpacing).toFixed(1)} · ${paperLabel(i.paper)}
      </td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0e8d0;text-align:center;font-weight:700">${i.qty}</td>
      <td style="padding:10px 12px;border-bottom:1px solid #f0e8d0;text-align:right;font-weight:700;color:#B87010">${fmtDA(i.qty * i.unitPrice)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:24px;background:#FBF5E8;font-family:Georgia,serif">
<div style="max-width:660px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:#2A1F0E;padding:28px 32px">
    <h1 style="margin:0;color:#F5C842;font-size:22px;font-weight:400;font-family:Georgia,serif">
      📦 Nouvelle commande — Éditions Skookoo
    </h1>
  </div>
  <div style="padding:28px 32px">

    <div style="background:#FBF5E8;border-left:4px solid #E8A020;border-radius:6px;padding:14px 18px;margin-bottom:24px">
      <div style="font-size:11px;color:#7A6045;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:4px">Référence</div>
      <div style="font-size:20px;font-weight:700;font-family:monospace;color:#2A1F0E">${ref}</div>
    </div>

    <h2 style="font-size:15px;color:#2A1F0E;margin:0 0 12px">Informations client</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;font-size:14px">
      <tr><td style="padding:6px 0;color:#7A6045;width:130px">Nom</td>      <td style="padding:6px 0;font-weight:600;color:#2A1F0E">${esc(c.name)}</td></tr>
      <tr><td style="padding:6px 0;color:#7A6045">E-mail</td>               <td style="padding:6px 0;font-weight:600;color:#2A1F0E">${esc(c.email)}</td></tr>
      <tr><td style="padding:6px 0;color:#7A6045">Téléphone</td>            <td style="padding:6px 0;font-weight:600;color:#2A1F0E">${esc(c.phone)}</td></tr>
      <tr><td style="padding:6px 0;color:#7A6045;vertical-align:top">Adresse</td>
          <td style="padding:6px 0;font-weight:600;color:#2A1F0E;white-space:pre-line">${esc(c.address)}</td></tr>
      ${c.notes ? `<tr><td style="padding:6px 0;color:#7A6045;vertical-align:top">Notes</td><td style="padding:6px 0;color:#2A1F0E">${esc(c.notes)}</td></tr>` : ''}
    </table>

    <h2 style="font-size:15px;color:#2A1F0E;margin:0 0 12px">Articles commandés</h2>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px">
      <thead><tr style="background:#FBF5E8">
        <th style="padding:9px 12px;text-align:left;font-size:11px;color:#7A6045;text-transform:uppercase;letter-spacing:.06em">Titre</th>
        <th style="padding:9px 12px;text-align:left;font-size:11px;color:#7A6045;text-transform:uppercase;letter-spacing:.06em">Auteur</th>
        <th style="padding:9px 12px;text-align:left;font-size:11px;color:#7A6045;text-transform:uppercase;letter-spacing:.06em">Paramètres</th>
        <th style="padding:9px 12px;text-align:center;font-size:11px;color:#7A6045;text-transform:uppercase;letter-spacing:.06em">Qté</th>
        <th style="padding:9px 12px;text-align:right;font-size:11px;color:#7A6045;text-transform:uppercase;letter-spacing:.06em">Prix</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>

    <div style="background:#2A1F0E;border-radius:8px;padding:16px 20px;display:flex;justify-content:space-between;align-items:center">
      <span style="color:rgba(245,230,200,.65);font-size:14px">Total (livraison incluse)</span>
      <span style="color:#F5C842;font-size:24px;font-weight:700;font-family:Georgia,serif">${fmtDA(total)}</span>
    </div>
  </div>
  <div style="padding:14px 32px;background:#FBF5E8;font-size:12px;color:#7A6045;text-align:center">
    Reçue le ${new Date().toLocaleString('fr-DZ')} · Éditions Skookoo
  </div>
</div></body></html>`;
}

/* ═══════════════════════════════════════════════
   EMAIL: CUSTOMER (they receive this)
═══════════════════════════════════════════════ */
function buildCustomerEmail(ref, c, items, total) {
  const itemsHtml = items.map(i => `
    <div style="display:flex;gap:14px;padding:14px 0;border-bottom:1px solid #f0e8d0;align-items:flex-start">
      <div style="flex:1">
        <div style="font-weight:700;color:#2A1F0E;margin-bottom:3px;font-size:15px">${esc(i.title)}</div>
        <div style="font-size:13px;color:#7A6045;font-style:italic;margin-bottom:6px">${esc(i.author)}</div>
        <div style="font-size:12px;color:#9A8060">
          ${esc(i.font)} · ${i.fontSize}pt · Interlignage ×${parseFloat(i.lineSpacing).toFixed(1)} · Papier ${paperLabel(i.paper)}
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:12px;color:#7A6045;margin-bottom:2px">× ${i.qty}</div>
        <div style="font-weight:700;color:#B87010;font-size:15px">${fmtDA(i.qty * i.unitPrice)}</div>
      </div>
    </div>`).join('');

  return `<!DOCTYPE html><html lang="fr"><body style="margin:0;padding:24px;background:#FBF5E8;font-family:Georgia,serif">
<div style="max-width:580px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.1)">
  <div style="background:#2A1F0E;padding:36px 32px;text-align:center">
    <div style="font-size:52px;margin-bottom:12px">🐝</div>
    <h1 style="margin:0 0 8px;color:#F5C842;font-size:26px;font-weight:300;font-family:Georgia,serif">Commande confirmée&nbsp;!</h1>
    <p style="margin:0;color:rgba(245,230,200,.55);font-size:14px">Éditions Skookoo · Édition papier</p>
  </div>
  <div style="padding:28px 32px">
    <p style="font-size:16px;line-height:1.75;color:#2A1F0E;margin:0 0 20px">
      Bonjour <strong>${esc(c.name)}</strong>,<br>
      Merci pour votre commande&nbsp;! Nous vous contacterons sous <strong>48h</strong>
      pour organiser la livraison à votre adresse.
    </p>
    <div style="background:#FBF5E8;border-left:4px solid #E8A020;border-radius:6px;padding:14px 18px;margin-bottom:24px">
      <div style="font-size:11px;color:#7A6045;text-transform:uppercase;letter-spacing:.08em;font-weight:700;margin-bottom:4px">Référence commande</div>
      <div style="font-size:18px;font-weight:700;font-family:monospace;color:#2A1F0E">${ref}</div>
    </div>
    <h2 style="font-size:15px;color:#2A1F0E;margin:0 0 14px">Vos articles</h2>
    ${itemsHtml}
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:18px 0 4px;font-size:20px;font-weight:700;color:#2A1F0E">
      <span>Total</span>
      <span style="color:#B87010">${fmtDA(total)}</span>
    </div>
    <div style="font-size:12px;color:#7A6045;text-align:right;margin-bottom:24px">livraison 500 DA incluse</div>
    <div style="background:#FBF5E8;border-radius:8px;padding:14px 18px;font-size:13px;color:#7A6045;line-height:1.7">
      <strong style="color:#2A1F0E">Adresse de livraison&nbsp;:</strong><br>
      <span style="white-space:pre-line">${esc(c.address)}</span>
    </div>
  </div>
  <div style="padding:14px 32px;background:#FBF5E8;font-size:12px;color:#7A6045;text-align:center;line-height:1.8">
    Paiement à la livraison · Des questions&nbsp;? Répondez simplement à cet e-mail.<br>
    <span style="color:#B87010;font-weight:600">Éditions Skookoo</span>
  </div>
</div></body></html>`;
}

/* ═══════════════════════════════════════════════
   HTML ESCAPE
═══════════════════════════════════════════════ */
function esc(str) {
  return String(str ?? '')
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}