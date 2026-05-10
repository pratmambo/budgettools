const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getUserFromToken(token) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

exports.handler = async (event) => {
  const authHeader = event.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid token' }) };
  }

  // GET: Load data for a template
  if (event.httpMethod === 'GET') {
    const templateKey = event.queryStringParameters?.template;
    if (!templateKey) {
      return { statusCode: 400, body: JSON.stringify({ error: 'template param required' }) };
    }

    const { data, error } = await supabase
      .from('template_data')
      .select('data, updated_at')
      .eq('user_id', user.id)
      .eq('template_key', templateKey)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: data?.data || null, updatedAt: data?.updated_at || null })
    };
  }

  // POST: Save data for a template
  if (event.httpMethod === 'POST') {
    let body;
    try {
      body = JSON.parse(event.body);
    } catch {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { template, data } = body;
    if (!template || data === undefined) {
      return { statusCode: 400, body: JSON.stringify({ error: 'template and data required' }) };
    }

    // Gate cloud writes: require active subscription (or admin)
    const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'preetam.juturu@gmail.com').split(',').map(e => e.trim());
    if (!ADMIN_EMAILS.includes(user.email)) {
      const templateId = template.replace('bt_', '').replace(/_v\d+$/, '');
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('id, current_period_end')
        .eq('user_id', user.id)
        .in('template_key', [templateId, 'all'])
        .gte('current_period_end', new Date().toISOString())
        .limit(1);
      if (!subs || subs.length === 0) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Pro access required for cloud sync' }) };
      }
    }

    const { error } = await supabase
      .from('template_data')
      .upsert({
        user_id: user.id,
        template_key: template,
        data: data,
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'user_id,template_key'
      });

    if (error) {
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true })
    };
  }

  return { statusCode: 405, body: 'Method Not Allowed' };
};
