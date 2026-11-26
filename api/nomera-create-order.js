import { method, readBody, send, handleError } from './_lib/http.js';
import { nomera, validIdempotencyKey } from './_lib/nomera.js';
import { adminDb, authenticatedUser } from './_lib/supabase.js';

export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    const user = await authenticatedUser(req);
    const body = readBody(req);
    const serviceId = String(body.serviceId || '');
    const countryId = String(body.countryId || '');
    const offerKey = String(body.offerKey || '');
    const idempotencyKey = String(body.idempotencyKey || '');
    if (!/^\d+$/.test(serviceId) || !/^\d+$/.test(countryId) || !offerKey || !validIdempotencyKey(idempotencyKey)) {
      return send(res, 400, { success: false, code: 'INVALID_ORDER_INPUT' });
    }
    const db = adminDb();
    const selection = { user_id: user.id, service_id: serviceId, country_id: countryId, offer_key: offerKey };
    const { data: existing, error: lookupError } = await db.from('nomera_orders').select('*').eq('idempotency_key', idempotencyKey).maybeSingle();
    if (lookupError) throw Object.assign(new Error('Gagal membaca data transaksi Nomera.'), { status: 500, code: 'DATABASE_ERROR' });
    if (existing && existing.user_id !== user.id) return send(res, 409, { success: false, code: 'IDEMPOTENCY_KEY_CONFLICT' });
    if (existing && (existing.service_id !== serviceId || existing.country_id !== countryId || existing.offer_key !== offerKey)) return send(res, 409, { success: false, code: 'IDEMPOTENCY_PAYLOAD_CONFLICT' });
    if (existing?.nomera_order_id) return send(res, 200, { success: true, replayed: true, order: existing.response_json?.order || existing.response_json });

    if (!existing) {
      const { error: insertError } = await db.from('nomera_orders').insert({
        ...selection, idempotency_key: idempotencyKey, state: 'CREATE_PENDING',
      });
      if (insertError && insertError.code !== '23505') throw Object.assign(new Error('Gagal menyimpan kunci transaksi sebelum membuat order.'), { status: 500, code: 'DATABASE_ERROR' });
    }

    // If a previous create attempt may have reached Nomera, retry create directly
    // with the same key/body. Do not quote again: the original offer may no longer
    // be listed even though Nomera can recover the idempotent order.
    const createBody = { serviceId, countryId, offerKey, idempotencyKey };
    if (existing?.create_attempted_at) {
      if (Number.isFinite(existing.expected_price)) createBody.expectedPrice = existing.expected_price;
    } else {
      const quote = await nomera('/otp/quote?' + new URLSearchParams({ serviceId, countryId, offerKey }));
      if (quote.data.available !== true) return send(res, 409, { success: false, code: 'OFFER_UNAVAILABLE', quote: quote.data });
      if (Number.isFinite(quote.data.initialPrice)) createBody.expectedPrice = quote.data.initialPrice;
      const { error: quoteSaveError } = await db.from('nomera_orders').update({
        expected_price: Number.isFinite(quote.data.initialPrice) ? quote.data.initialPrice : null,
        create_attempted_at: new Date().toISOString(),
      }).eq('idempotency_key', idempotencyKey).eq('user_id', user.id);
      if (quoteSaveError) throw Object.assign(new Error('Gagal menyimpan data quote sebelum create-order.'), { status: 500, code: 'DATABASE_ERROR' });
    }
    const created = await nomera('/otp/create-order', { method: 'POST', body: createBody });
    const order = created.data.order;
    if (!order?.id) throw Object.assign(new Error('Respons create-order tidak berisi data.order.id.'), { status: 502, code: 'ORDER_ID_MISSING' });
    const { error: updateError } = await db.from('nomera_orders').update({
      nomera_order_id: String(order.id), state: String(order.status || 'CREATE_PENDING'), response_json: created.data,
      updated_at: new Date().toISOString(),
    }).eq('idempotency_key', idempotencyKey).eq('user_id', user.id);
    if (updateError) throw Object.assign(new Error('Order dibuat, tetapi penyimpanan hasil ke database gagal. Jangan buat transaksi baru; ulangi dengan idempotencyKey yang sama.'), { status: 500, code: 'ORDER_SAVE_FAILED' });
    return send(res, 200, created.data);
  } catch (error) { return handleError(res, error); }
}
