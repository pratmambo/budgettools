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

  console.log('Cashfree webhook raw event type:', payload.type, 'keys:', Object.keys(payload.data || {}));

  const eventType = payload.type;
  const data = payload.data || {};
  console.log('Cashfree event received:', eventType);

  try {
    switch (eventType) {

      case 'SUBSCRIPTION_AUTH_STATUS': {
        const sub = data.subscription || {};
        const auth = data.authorization || sub.authorization || {};
        const subId = sub.subscription_id || data.subscription_id;
        const tags = sub.subscription_tags || data.subscription_tags || {};
        const userId = tags.user_id;
        const templateKey = tags.template_key || 'unknown';
        const authStatus = auth.authorization_status || data.authorization_status;

        if (!subId || !userId) {
          console.error('Missing subscription_id or user_id in auth event');
          break;
        }

        if (authStatus === 'ACTIVE' || authStatus === 'SUCCESS') {
          await supabase.from('subscriptions').upsert({
            id: subId,
            user_id: userId,
            plan_id: sub.plan_details?.plan_id || subId,
            template_key: templateKey,
            status: 'active',
            current_period_start: new Date().toISOString(),
            current_period_end: getNextMonthISO(),
            cancel_at_period_end: false,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

          console.log(`Subscription ${subId} authorized for user ${userId}, template: ${templateKey}`);
        } else {
          console.log(`Subscription ${subId} auth failed: ${authStatus}`);
        }
        break;
      }

      case 'SUBSCRIPTION_STATUS_CHANGED': {
        const sub = data.subscription || data;
        const subId = sub.subscription_id || data.subscription_id;
        const subStatus = sub.subscription_status || data.subscription_status;
        const tags = sub.subscription_tags || data.subscription_tags || {};

        if (!subId) break;

        const statusMap = {
          'ACTIVE': 'active',
          'ON_HOLD': 'past_due',
          'COMPLETED': 'canceled',
          'CANCELLED': 'canceled',
          'CUSTOMER_CANCELLED': 'canceled',
          'CUSTOMER_PAUSED': 'paused',
          'EXPIRED': 'canceled',
          'BANK_APPROVAL_PENDING': 'trialing',
        };

        const mappedStatus = statusMap[subStatus];
        if (!mappedStatus) {
          console.log(`Unknown subscription status: ${subStatus}`);
          break;
        }

        const updateData = {
          status: mappedStatus,
          updated_at: new Date().toISOString(),
        };

        if (mappedStatus === 'active' && tags.user_id) {
          updateData.user_id = tags.user_id;
          updateData.template_key = tags.template_key || undefined;
        }

        await supabase.from('subscriptions').update(updateData).eq('id', subId);
        console.log(`Subscription ${subId} status → ${mappedStatus} (was ${subStatus})`);
        break;
      }

      case 'SUBSCRIPTION_PAYMENT_SUCCESS': {
        const sub = data.subscription || {};
        const payment = data.payment || {};
        const subId = sub.subscription_id || data.subscription_id;

        if (!subId) break;

        await supabase.from('subscriptions').update({
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: getNextMonthISO(),
          updated_at: new Date().toISOString(),
        }).eq('id', subId);

        console.log(`Subscription ${subId} payment success, payment_id: ${payment.cf_payment_id || 'N/A'}`);
        break;
      }

      case 'SUBSCRIPTION_PAYMENT_FAILED': {
        const sub = data.subscription || {};
        const subId = sub.subscription_id || data.subscription_id;

        if (!subId) break;

        await supabase.from('subscriptions').update({
          status: 'past_due',
          updated_at: new Date().toISOString(),
        }).eq('id', subId);

        console.log(`Subscription ${subId} payment failed`);
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

function getNextMonthISO() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}
