const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const authHeader = event.headers['authorization'] || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) {
    return {
      statusCode: 200,
      body: JSON.stringify({ hasAccess: false, status: 'unauthenticated' })
    };
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return {
      statusCode: 200,
      body: JSON.stringify({ hasAccess: false, status: 'unauthenticated' })
    };
  }

  const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'preetam.juturu@gmail.com').split(',').map(e => e.trim());
  if (ADMIN_EMAILS.includes(user.email)) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hasAccess: true, status: 'admin', templateKey: event.queryStringParameters?.template })
    };
  }

  const templateKey = event.queryStringParameters?.template;
  const now = new Date();

  if (!templateKey) {
    const { data: allSubs, error } = await supabase
      .from('subscriptions')
      .select('id, status, template_key, current_period_end, cancel_at_period_end')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Subscription query error:', error);
      return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }

    const active = (allSubs || []).filter(s =>
      s.status === 'active' && s.current_period_end && new Date(s.current_period_end) > now
    );

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptions: active })
    };
  }

  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select('id, status, template_key, current_period_end, cancel_at_period_end')
    .eq('user_id', user.id)
    .in('template_key', [templateKey, 'all'])
    .order('current_period_end', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Subscription query error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const sub = subscriptions?.[0];
  const hasAccess = sub && sub.status === 'active' && sub.current_period_end
    ? new Date(sub.current_period_end) > now
    : false;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hasAccess,
      status: hasAccess ? 'active' : (sub ? 'expired' : 'free'),
      templateKey: sub?.template_key,
      expiresAt: sub?.current_period_end,
    })
  };
};
