const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const authHeader = event.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
  }

  const { data: subs, error } = await supabase
    .from('subscriptions')
    .select('id, template_key, status, current_period_end')
    .eq('user_id', user.id)
    .order('current_period_end', { ascending: false });

  if (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const now = new Date();
  const active = (subs || []).filter(s =>
    s.current_period_end && new Date(s.current_period_end) > now
  );

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      purchases: active.map(s => ({
        id: s.id,
        templateKey: s.template_key,
        expiresAt: s.current_period_end,
      })),
    }),
  };
};
