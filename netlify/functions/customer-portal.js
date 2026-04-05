/**
 * Cancel Subscription
 * Cancels the user's active Razorpay subscription at end of billing cycle.
 * Called from the account page when user clicks "Cancel Subscription".
 *
 * POST /api/customer-portal
 * Body: { template?: string }  — optional, to cancel a specific template subscription
 */

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

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  const { template, subscriptionId } = body;

  try {
    let subId = subscriptionId;

    // If no explicit subscription ID, look up by user + template
    if (!subId) {
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

    // cancel_at_cycle_end: 1 = cancel at end of current billing cycle (not immediately)
    await razorpay.subscriptions.cancel(subId, { cancel_at_cycle_end: 1 });

    // Reflect pending cancellation in our DB immediately (webhook will confirm)
    await supabase.from('subscriptions').update({
      cancel_at_period_end: true,
      updated_at: new Date().toISOString(),
    }).eq('id', subId);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        message: 'Subscription will cancel at the end of the current billing period.',
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
