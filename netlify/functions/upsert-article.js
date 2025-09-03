import { createClient } from '@supabase/supabase-js';

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE
  );

  // Auth token from logged-in user
  const token = (event.headers.authorization || '').replace('Bearer ', '');
  if (!token) return { statusCode: 401, body: 'Missing auth token' };

  const { data: { user }, error: uerr } = await supabaseAdmin.auth.getUser(token);
  if (uerr || !user) return { statusCode: 401, body: 'Invalid auth token' };

  // Must be admin
  const { data: prof } = await supabaseAdmin
    .from('profiles').select('is_admin').eq('id', user.id).single();
  if (!prof?.is_admin) return { statusCode: 403, body: 'Admins only' };

  const payload = JSON.parse(event.body || '{}');
  if (!payload.slug || !payload.title) {
    return { statusCode: 400, body: 'slug and title are required' };
  }

  const { data, error } = await supabaseAdmin
    .from('articles')
    .upsert(payload, { onConflict: 'slug' })
    .select().single();

  if (error) return { statusCode: 500, body: error.message };
  return { statusCode: 200, body: JSON.stringify(data) };
}
