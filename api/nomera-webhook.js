import crypto from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { send } from './_lib/http.js';

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}
function validSignature(raw, header, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(String(header || ''))) return false;
  const expected = Buffer.from('sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex'));
  const received = Buffer.from(String(header));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}
export default async function handler(req, res) {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' }); }
  try {
    const secret = process.env.NOMERA_WEBHOOK_SECRET;
    if (!secret || secret.startsWith('ISI_')) return send(res, 500, { success: false, code: 'WEBHOOK_SECRET_NOT_CONFIGURED' });
    const raw = await rawBody(req);
    if (raw.length > 256 * 1024) return send(res, 413, { success: false, code: 'BODY_TOO_LARGE' });
    if (!validSignature(raw, req.headers['x-nomera-signature'], secret)) return send(res, 401, { success: false, code: 'INVALID_SIGNATURE' });
    let event;
    try { event = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, { success: false, code: 'INVALID_JSON' }); }
    const allowed = ['order.updated', 'order.sms_received', 'order.otp_received', 'deposit.updated'];
    if (!event || !/^[A-Za-z0-9_-]{8,128}$/.test(String(event.id || '')) || !allowed.includes(event.event) || !event.data || typeof event.data !== 'object') {
      return send(res, 400, { success: false, code: 'INVALID_EVENT' });
    }
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SECRET_KEY;
    if (!url || !key) return send(res, 503, { success: false, code: 'WEBHOOK_STORAGE_NOT_CONFIGURED' });
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await db.from('nomera_webhook_events').insert({ event_id: event.id, event_name: event.event, payload: event });
    if (error && error.code !== '23505') return send(res, 503, { success: false, code: 'WEBHOOK_STORAGE_FAILED' });
    return send(res, 200, { received: true, ...(error?.code === '23505' ? { duplicate: true } : {}) });
  } catch { return send(res, 503, { success: false, code: 'WEBHOOK_RECEIVER_ERROR' }); }
}
