const Razorpay = require('razorpay');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Map template keys to Razorpay plan IDs (created in Razorpay dashboard)
const PLAN_MAP = {
  wedding:   process.env.RAZORPAY_PLAN_WEDDING,
  event:     process.env.RAZORPAY_PLAN_EVENT,
  travel:    process.env.RAZORPAY_PLAN_TRAVEL,
  cafe:      process.env.RAZORPAY_PLAN_CAFE,
  inventory: process.env.RAZORPAY_PLAN_INVENTORY,
  all:       process.env.RAZORPAY_PLAN_ALL,
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Validate JWT
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

  const { template } = body;
  const planId = PLAN_MAP[template];

  if (!planId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid template key: ' + template }) };
  }

  try {
    // Create Razorpay subscription
    // total_count = 120 = 10 years of monthly billing (user can cancel any time)
    const subscription = await razorpay.subscriptions.create({
      plan_id:          planId,
      customer_notify:  1,      // Razorpay sends email notifications
      total_count:      120,
      notes: {
        user_id:      user.id,
        template_key: template,
        user_email:   user.email,
      },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscriptionId: subscription.id,
        keyId:          process.env.RAZORPAY_KEY_ID,
      }),
    };

  } catch (err) {
    console.error('Razorpay subscription error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create subscription' }),
    };
  }
};
