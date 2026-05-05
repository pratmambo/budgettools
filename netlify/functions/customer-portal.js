const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CASHFREE_BASE = process.env.CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

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

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  const { template, subscriptionId } = body;

  try {
    let subId = subscriptionId;

    if (subId) {
      // Verify the subscription belongs to this user
      const { data: owned } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('id', subId)
        .eq('user_id', user.id)
        .limit(1);
      if (!owned || owned.length === 0) {
        return { statusCode: 403, body: JSON.stringify({ error: 'Subscription does not belong to this user' }) };
      }
    } else {
      const query = supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', user.id)
        .in('status', ['active', 'trialing']);

      if (template) {
        query.in('template_key', [template, 'all']);
      }

      const { data: sub } = await query.limit(1).single();

      if (!sub) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: 'No active subscription found' }),
        };
      }
      subId = sub.id;
    }

    const res = await fetch(CASHFREE_BASE + '/subscriptions/' + encodeURIComponent(subId) + '/manage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2025-01-01',
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
      },
      body: JSON.stringify({
        subscription_id: subId,
        action: 'CANCEL',
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Cashfree cancel failed');
    }

    await supabase.from('subscriptions').update({
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    }).eq('id', subId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Subscription cancelled. You keep access until the end of the current billing period.',
      }),
    };

  } catch (err) {
    console.error('Cancel subscription error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Failed to cancel subscription' }),
    };
  }
};
