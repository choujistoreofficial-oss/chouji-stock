import { createClient } from '@supabase/supabase-js';

function required(name) {
  const value = process.env[name];
  if (!value || value.startsWith('ISI_')) throw Object.assign(new Error(`Environment ${name} belum diatur di Vercel.`), { status: 500, code: 'ENV_NOT_CONFIGURED' });
  return value;
}

export function adminDb() {
  const url = required('SUPABASE_URL');
  const key = required('SUPABASE_SECRET_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function authenticatedUser(req) {
  const url = required('SUPABASE_URL');
  const key = required('SUPABASE_PUBLISHABLE_KEY');
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) throw Object.assign(new Error('Login diperlukan untuk transaksi.'), { status: 401, code: 'AUTH_REQUIRED' });
  const authClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await authClient.auth.getUser(match[1]);
  if (error || !data?.user) throw Object.assign(new Error('Sesi login tidak valid atau sudah berakhir.'), { status: 401, code: 'INVALID_SESSION' });
  return data.user;
}
