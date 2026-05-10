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

  if (!phone || phone.replace(/\D/g, '').length < 7) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Valid phone number required' }) };
  }

  const orderId = 'order_' + template + '_' + crypto.randomBytes(8).toString('hex');
  const returnUrl = 'https://budgettemplates.shop/account.html?payment=success&order_id={order_id}';

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
        order_currency: 'USD',
        customer_details: {
          customer_id: user.id.replace(/-/g, ''),
          customer_email: user.email,
          customer_phone: phone.replace(/\D/g, '').slice(-15),
          customer_name: user.user_metadata?.full_name || user.email.split('@')[0],
        },
        order_meta: {
          return_url: returnUrl,
          notify_url: 'https://budgettemplates.shop/webhooks/cashfree',
        },
        order_tags: {
          user_id: user.id,
          template_key: template,
        },
        order_note: plan.name + ' - 30 day access',
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
        cashfreeEnv: process.env.CASHFREE_ENV === 'production' ? 'production' : 'sandbox',
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
