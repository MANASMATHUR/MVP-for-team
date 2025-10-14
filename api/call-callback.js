// Serverless function for Vercel: Voiceflow call callback handler
// Updates the corresponding record in public.call_logs

import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  // Use server-side env vars (avoid VITE_ prefix which is meant for client)
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return res.status(500).send('Supabase environment variables are missing');
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  try {
    const body = typeof req.body === 'string' ? safeJsonParse(req.body) : (req.body || {});
    const {
      call_log_id,
      status, // 'completed' | 'failed' | 'in_progress' | 'cancelled'
      duration_seconds,
      transcript,
      order_placed,
      order_details,
      error_message,
      voiceflow_session_id,
    } = body;

    if (!call_log_id) return res.status(400).send('Missing call_log_id');

    const update = {};
    if (status) update.status = status;
    if (typeof duration_seconds === 'number') update.duration_seconds = duration_seconds;
    if (typeof order_placed === 'boolean') update.order_placed = order_placed;
    if (transcript) update.transcript = transcript;
    if (order_details) update.order_details = order_details;
    if (error_message) update.error_message = error_message;
    if (voiceflow_session_id) update.voiceflow_session_id = voiceflow_session_id;

    const { error } = await supabase.from('call_logs').update(update).eq('id', call_log_id);
    if (error) return res.status(500).send(error.message);

    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).send(e?.message || 'Unknown error');
  }
}

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return {}; }
}


