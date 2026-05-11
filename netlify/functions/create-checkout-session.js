const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const CASHFREE_BASE = process.env.CASHFREE_ENV === 'sandbox'
  ? 'https://sandbox.cashfree.com/pg'
  : 'https://api.cashfree.com/pg';

const PLAN_PRICES = {
  wedding:   { name: 'Wedding Planner Pro',      amount: 899 },
  event:     { name: 'Event Budget Pro',          amount: 899 },
  travel:    { name: 'Travel Budget Pro',         amount: 899 },
  cafe:      { name: 'Cafe Costing Pro',          amount: 899 },
  inventory: { name: 'Inventory Management Pro',  amount: 899 },
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

  if (!phone || phone.replace(/\D/g, '').length < 10) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Valid 10-digit phone number required' }) };
  }

  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', user.id)
    .eq('template_key', template)
    .gt('current_period_end', new Date().toISOString())
    .limit(1);

  if (existingSub && existingSub.length > 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'You already have active access to this template.' }) };
  }

  const siteUrl = process.env.URL || 'https://budgettemplates.shop';
  const orderId = 'order_' + template + '_' + crypto.randomBytes(8).toString('hex');
  const returnUrl = siteUrl + '/account.html?payment=success&order_id={order_id}';

  try {
    const res = await fetch(CASHFREE_BASE + '/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': '2025-01-01',
        'x-client-id': process.env.CASHFREE_APP_ID,
        'x-client-secret': process.env.CASHFREE_SECRET_KEY,
      },
      body: JSON.stringify({
        order_id: orderId,
        order_amount: plan.amount,
        order_currency: 'INR',
        customer_details: {
          customer_id: user.id.replace(/-/g, ''),
          customer_email: user.email,
          customer_phone: phone.replace(/\D/g, '').slice(-15),
          customer_name: user.user_metadata?.full_name || user.email.split('@')[0],
        },
        order_meta: {
          return_url: returnUrl,
          notify_url: siteUrl + '/webhooks/cashfree',
        },
        order_tags: {
          user_id: user.id,
          template_key: template,
        },
        order_note: plan.name + ' - one-time purchase',
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Cashfree order error:', JSON.stringify(data));
      const errDetail = data.message || JSON.stringify(data);
      return {
        statusCode: res.status,
        body: JSON.stringify({ error: errDetail, cashfree_response: data }),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: data.payment_session_id,
        orderId: data.order_id,
        cfOrderId: data.cf_order_id,
        cashfreeEnv: process.env.CASHFREE_ENV === 'sandbox' ? 'sandbox' : 'production',
      }),
    };

  } catch (err) {
    console.error('Cashfree order error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create order' }),
    };
  }
};
