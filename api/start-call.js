// Secure serverless proxy to initiate outbound calls via Voiceflow (or any provider)
// Avoids exposing API keys to the browser and sidesteps CORS

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const providerUrl = process.env.VOICEFLOW_CALL_API_URL;
  const providerKey = process.env.VOICEFLOW_CALL_API_KEY;
  if (!providerUrl || !providerKey) {
    return res.status(500).json({ error: 'Server call API not configured (VOICEFLOW_CALL_API_URL/KEY missing)' });
  }

  try {
    const body = typeof req.body === 'string' ? safeJsonParse(req.body) : (req.body || {});
    const { call_log_id, order_details, dry_run } = body;
    if (!call_log_id || !order_details) {
      return res.status(400).json({ error: 'Missing call_log_id or order_details' });
    }

    // Allow a dry-run health check without contacting the provider
    if (dry_run) {
      return res.status(200).json({ ok: true, session_id: 'dry_run_session', transcript: '' });
    }

    // Build a public callback URL based on the current host
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const protocol = (req.headers['x-forwarded-proto'] || 'https');
    const callbackUrl = `${protocol}://${host}/api/call-callback`;

    const response = await fetch(providerUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providerKey}`,
      },
      body: JSON.stringify({
        call_log_id,
        order_details,
        callback_url: callbackUrl,
      }),
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Provider call failed', provider_status: response.status, provider_status_text: response.statusText, details: data });
    }

    return res.status(200).json(data);
  } catch (e) {
    return res.status(500).json({ error: e?.message || 'Unknown server error' });
  }
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return {}; }
}


