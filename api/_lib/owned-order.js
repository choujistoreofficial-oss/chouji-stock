import { adminDb } from './supabase.js';
export async function findOwnedOrder(userId, orderId) {
  const db = adminDb();
  const { data, error } = await db.from('nomera_orders').select('*').eq('user_id', userId).eq('nomera_order_id', String(orderId)).maybeSingle();
  if (error) throw Object.assign(new Error('Gagal memeriksa kepemilikan order.'), { status: 500, code: 'DATABASE_ERROR' });
  if (!data) throw Object.assign(new Error('Order tidak ditemukan untuk akun ini.'), { status: 404, code: 'ORDER_NOT_FOUND' });
  return { db, row: data };
}
export async function saveOrderSnapshot(db, row, data) {
  const order = data?.order || data;
  const patch = { response_json: data, updated_at: new Date().toISOString() };
  if (order?.status) patch.state = String(order.status);
  const { error } = await db.from('nomera_orders').update(patch).eq('id', row.id);
  if (error) throw Object.assign(new Error('Gagal menyimpan snapshot order.'), { status: 500, code: 'DATABASE_ERROR' });
}
