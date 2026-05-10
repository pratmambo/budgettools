const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifySignature(body, timestamp, signature) {
  const secret = process.env.CASHFREE_WEBHOOK_SECRET || process.env.CASHFREE_SECRET_KEY;
  if (!secret) return false;
  const computed = crypto
    .createHmac('sha256', secret)
    .update(timestamp + body)
    .digest('base64');
  return computed === signature;
}

function getExpiryDate() {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d.toISOString();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const signature = event.headers['x-webhook-signature'];
  const timestamp = event.headers['x-webhook-timestamp'];
  if (!signature || !timestamp) {
    console.error('Cashfree webhook missing signature headers — rejected');
    return { statusCode: 401, body: 'Missing signature' };
  }
  if (!verifySignature(event.body, timestamp, signature)) {
    console.error('Cashfree webhook signature mismatch');
    return { statusCode: 400, body: 'Invalid signature' };
  }

  console.log('Cashfree webhook event type:', payload.type);

  const eventType = payload.type;
  const data = payload.data || {};

  try {
    switch (eventType) {

      case 'PAYMENT_SUCCESS_WEBHOOK': {
        const order = data.order || {};
        const payment = data.payment || {};
        const tags = order.order_tags || {};
        const userId = tags.user_id;
        const templateKey = tags.template_key || 'unknown';
        const orderId = order.order_id;

        if (!orderId || !userId) {
          console.error('Missing order_id or user_id in payment success event');
          break;
        }

        await supabase.from('subscriptions').upsert({
          id: orderId,
          user_id: userId,
          plan_id: orderId,
          template_key: templateKey,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: getExpiryDate(),
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        console.log(`Payment success: order ${orderId}, user ${userId}, template ${templateKey}, access until ${getExpiryDate()}`);
        break;
      }

      case 'PAYMENT_FAILED_WEBHOOK': {
        const order = data.order || {};
        const orderId = order.order_id;
        console.log(`Payment failed: order ${orderId}`);
        break;
      }

      case 'PAYMENT_USER_DROPPED_WEBHOOK': {
        const order = data.order || {};
        console.log(`User dropped: order ${order.order_id}`);
        break;
      }

      default:
        console.log(`Unhandled Cashfree event: ${eventType}`);
    }

    return { statusCode: 200, body: JSON.stringify({ received: true }) };

  } catch (err) {
    console.error('Webhook handler error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
