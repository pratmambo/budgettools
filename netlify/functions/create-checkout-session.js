const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CASHFREE_BASE = process.env.CASHFREE_ENV === 'production'
  ? 'https://api.cashfree.com/pg'
  : 'https://sandbox.cashfree.com/pg';

const PLAN_PRICES = {
  wedding:   { name: 'Wedding Planner Pro',      amount: 8.99 },
  event:     { name: 'Event Budget Pro',          amount: 8.99 },
  travel:    { name: 'Travel Budget Pro',         amount: 8.99 },
  cafe:      { name: 'Cafe Costing Pro',          amount: 8.99 },
  inventory: { name: 'Inventory Management Pro',  amount: 8.99 },
  all:       { name: 'All Templates Pro',         amount: 19.99 },
};

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

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) };
  }

  const { template, phone } = body;
  const plan = PLAN_PRICES[template];

  if (!plan) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid template key: ' + template }) };
  }

  if (!phone || phone.length < 10) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Valid phone number required' }) };
  }

  const subscriptionId = 'sub_' + template + '_' + crypto.randomBytes(8).toString('hex');
  const returnUrl = (process.env.URL || 'https://budgettemplates.shop') + '/account.html?payment=success';

  try {
    const res = await fetch(CASHFREE_BASE + '/subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2025-01-01',
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
      },
      body: JSON.stringify({
        subscription_id: subscriptionId,
        customer_details: {
          customer_email: user.email,
          customer_phone: phone.replace(/\D/g, '').slice(-10),
          customer_name: user.user_metadata?.full_name || user.email.split('@')[0],
        },
        plan_details: {
          plan_name: plan.name + ' Monthly',
          plan_type: 'PERIODIC',
          plan_currency: 'USD',
          plan_amount: plan.amount,
          plan_max_amount: plan.amount,
          plan_intervals: 1,
          plan_interval_type: 'MONTH',
        },
        authorization_details: {
          authorization_amount: 0,
          authorization_amount_refund: true,
        },
        subscription_meta: {
          return_url: returnUrl,
          notification_url: (process.env.URL || 'https://budgettemplates.shop') + '/webhooks/cashfree',
          notification_channel: ['EMAIL', 'WEBHOOK'],
        },
        subscription_tags: {
          user_id: user.id,
          template_key: template,
        },
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Cashfree subscription error:', JSON.stringify(data));
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: data.message || 'Failed to create subscription' }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: data.subscription_session_id,
        subscriptionId: data.subscription_id,
        cfSubscriptionId: data.cf_subscription_id,
      }),
    };

  } catch (err) {
    console.error('Cashfree subscription error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create subscription' }),
    };
  }
};
