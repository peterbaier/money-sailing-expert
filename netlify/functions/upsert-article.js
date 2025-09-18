// netlify/functions/upsert-article.js
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  // Method guard
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'text/plain' }, body: 'Method Not Allowed' };
  }

  try {
    // Env guard
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return { statusCode: 500, headers: { 'Content-Type': 'text/plain' }, body: 'Server misconfigured' };
    }

    // Token (case-insensitive, extra spaces handled)
    const token = (event.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      return { statusCode: 401, headers: { 'Content-Type': 'text/plain' }, body: 'Missing auth token' };
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE, { auth: { persistSession: false } });

    // Verify user
    const { data: userData, error: uerr } = await admin.auth.getUser(token);
    if (uerr || !userData?.user) {
      return { statusCode: 401, headers: { 'Content-Type': 'text/plain' }, body: 'Invalid auth token' };
    }

    // Must be admin
    const { data: prof, error: perr } = await admin
      .from('profiles')
      .select('is_admin')
      .eq('id', userData.user.id)
      .maybeSingle();

    if (perr) {
      return { statusCode: 500, headers: { 'Content-Type': 'text/plain' }, body: 'Profile lookup failed' };
    }
    if (!prof?.is_admin) {
      return { statusCode: 403, headers: { 'Content-Type': 'text/plain' }, body: 'Admins only' };
    }

    // Parse payload safely
    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { body = {}; }

    const payload = {
      slug: (body.slug || '').trim(),
      title: (body.title || '').trim(),
      excerpt: body.excerpt || '',
      body: body.body || '',
      category: body.category || null,
      tags: Array.isArray(body.tags) ? body.tags : [],
      minutes: Number.isFinite(+body.minutes) ? +body.minutes : 0
    };

    if (!payload.slug || !payload.title) {
      return { statusCode: 400, headers: { 'Content-Type': 'text/plain' }, body: 'slug and title are required' };
    }

    // Upsert and return the row
    const { data, error } = await admin
      .from('articles')
      .upsert(payload, { onConflict: 'slug' })
      .select('*')
      .maybeSingle();

    if (error) {
      return { statusCode: 500, headers: { 'Content-Type': 'text/plain' }, body: error.message };
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || {}) };
  } catch (e) {
    return { statusCode: 500, headers: { 'Content-Type': 'text/plain' }, body: String(e) };
  }
};
