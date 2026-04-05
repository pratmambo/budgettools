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
    // Not logged in — return free status without error
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

  const templateKey = event.queryStringParameters?.template;
  if (!templateKey) {
    return { statusCode: 400, body: JSON.stringify({ error: 'template param required' }) };
  }

  // Check subscriptions: user has access if they have active/trialing sub for this template OR 'all'
  const { data: subscriptions, error } = await supabase
    .from('subscriptions')
    .select('id, status, template_key, current_period_end, cancel_at_period_end')
    .eq('user_id', user.id)
    .in('template_key', [templateKey, 'all'])
    .in('status', ['active', 'trialing'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('Subscription query error:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }

  const sub = subscriptions?.[0];
  const hasAccess = !!sub;

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hasAccess,
      status: sub?.status || 'free',
      templateKey: sub?.template_key,
      renewsAt: sub?.current_period_end,
      cancelAtPeriodEnd: sub?.cancel_at_period_end || false
    })
  };
};
