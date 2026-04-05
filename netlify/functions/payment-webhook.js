/**
 * Razorpay Webhook Handler
 * Receives subscription lifecycle events from Razorpay and syncs
 * subscription status to Supabase.
 *
 * Endpoint: POST /webhooks/razorpay
 */

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

// Service role key bypasses RLS — webhook is the only writer to subscriptions table
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // ── Verify Razorpay signature ──────────────────────────────────
  const sig = event.headers['x-razorpay-signature'];
  if (!sig) {
    return { statusCode: 400, body: 'Missing signature header' };
  }

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(event.body)
    .digest('hex');

  if (expected !== sig) {
    console.error('Razorpay webhook signature mismatch');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  // ── Parse event ────────────────────────────────────────────────
  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const eventType = payload.event;
  console.log('Razorpay event received:', eventType);

  try {
    switch (eventType) {

      // Subscription is active — first charge succeeded
      case 'subscription.activated': {
        const sub = payload.payload.subscription.entity;
        const userId      = sub.notes?.user_id;
        const templateKey = sub.notes?.template_key || 'unknown';

        if (!userId) {
          console.error('No user_id in subscription notes:', sub.id);
          break;
        }

        await supabase.from('subscriptions').upsert({
          id:                   sub.id,
          user_id:              userId,
          plan_id:              sub.plan_id,
          template_key:         templateKey,
          status:               'active',
          current_period_start: sub.current_start ? new Date(sub.current_start * 1000).toISOString() : null,
          current_period_end:   sub.current_end   ? new Date(sub.current_end   * 1000).toISOString() : null,
          cancel_at_period_end: false,
          updated_at:           new Date().toISOString(),
        }, { onConflict: 'id' });

        console.log(`Subscription ${sub.id} activated for user ${userId}, template: ${templateKey}`);
        break;
      }

      // Recurring charge succeeded — keep active, update period dates
      case 'subscription.charged': {
        const sub = payload.payload.subscription.entity;

        await supabase.from('subscriptions').update({
          status:               'active',
          current_period_start: sub.current_start ? new Date(sub.current_start * 1000).toISOString() : null,
          current_period_end:   sub.current_end   ? new Date(sub.current_end   * 1000).toISOString() : null,
          updated_at:           new Date().toISOString(),
        }).eq('id', sub.id);

        console.log(`Subscription ${sub.id} renewed`);
        break;
      }

      // User or admin cancelled the subscription
      case 'subscription.cancelled': {
        const sub = payload.payload.subscription.entity;

        await supabase.from('subscriptions').update({
          status:     'canceled',
          updated_at: new Date().toISOString(),
        }).eq('id', sub.id);

        console.log(`Subscription ${sub.id} cancelled`);
        break;
      }

      // Payment failed too many times — Razorpay halts the subscription
      case 'subscription.halted': {
        const sub = payload.payload.subscription.entity;

        await supabase.from('subscriptions').update({
          status:     'past_due',
          updated_at: new Date().toISOString(),
        }).eq('id', sub.id);

        console.log(`Subscription ${sub.id} halted (payment failed repeatedly)`);
        break;
      }

      case 'subscription.paused': {
        const sub = payload.payload.subscription.entity;
        await supabase.from('subscriptions').update({
          status: 'paused', updated_at: new Date().toISOString(),
        }).eq('id', sub.id);
        break;
      }

      case 'subscription.resumed': {
        const sub = payload.payload.subscription.entity;
        await supabase.from('subscriptions').update({
          status: 'active', updated_at: new Date().toISOString(),
        }).eq('id', sub.id);
        break;
      }

      // Single payment failed — mark as past_due but wait for halted before removing access
      case 'payment.failed': {
        const payment = payload.payload.payment?.entity;
        if (payment?.description?.startsWith('sub_')) {
          await supabase.from('subscriptions').update({
            status: 'past_due', updated_at: new Date().toISOString(),
          }).eq('id', payment.description);
        }
        break;
      }

      default:
        console.log(`Unhandled Razorpay event: ${eventType}`);
    }

    // Always return 200 so Razorpay doesn't retry
    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
