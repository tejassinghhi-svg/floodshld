// FloodShield SMS alert endpoint for Vercel.
// Required environment variables:
// TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, ALERT_PHONE
// Optional: ALLOWED_ORIGIN (for example https://your-project.vercel.app)

let lastSentAt = 0;
const COOLDOWN_MS = 60_000;

function cleanText(value, max = 80) {
  return String(value ?? '').replace(/[\r\n<>]/g, ' ').trim().slice(0, max);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const allowedOrigin = process.env.ALLOWED_ORIGIN;
  const origin = req.headers.origin || '';
  if (allowedOrigin && origin !== allowedOrigin) {
    return res.status(403).json({ ok: false, error: 'Origin not allowed.' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST only.' });
  }

  const now = Date.now();
  if (now - lastSentAt < COOLDOWN_MS) {
    const wait = Math.ceil((COOLDOWN_MS - (now - lastSentAt)) / 1000);
    return res.status(429).json({ ok: false, error: `Please wait ${wait}s before sending another demo alert.` });
  }

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  const to = process.env.ALERT_PHONE;
  if (!sid || !token || !from || !to) {
    return res.status(503).json({ ok: false, error: 'SMS backend is not configured yet.' });
  }

  const risk = Math.max(0, Math.min(100, Number(req.body?.risk) || 0));
  const level = cleanText(req.body?.level || (risk >= 75 ? 'CRITICAL' : risk >= 55 ? 'HIGH' : 'WATCH'), 20);
  const location = cleanText(req.body?.location || 'Delhi', 60);
  const rain6 = Math.max(0, Number(req.body?.rain6) || 0).toFixed(1);

  // For a paid/production-capable Twilio account this can be a custom body.
  // Some Twilio trial plans restrict SMS to predefined trial templates.
  const body = `FLOODSHIELD ALERT: ${level} flood risk in ${location}. Risk ${Math.round(risk)}/100. Next 6h rain ${rain6} mm. Avoid waterlogged/low-lying roads and follow official DDMA/IMD advisories. Demo alert.`;

  const params = new URLSearchParams({ To: to, From: from, Body: body });

  try {
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: params.toString()
      }
    );

    const data = await twilioResponse.json();
    if (!twilioResponse.ok) {
      console.error('Twilio error', data?.code, data?.message);
      return res.status(502).json({ ok: false, error: data?.message || 'SMS provider rejected the message.' });
    }

    lastSentAt = now;
    return res.status(200).json({ ok: true, sid: data.sid, status: data.status || 'queued' });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ ok: false, error: 'Could not contact SMS provider.' });
  }
}
