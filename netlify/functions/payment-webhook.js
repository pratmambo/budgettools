const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const TEMPLATE_NAMES = {
  wedding: 'Wedding Planner Pro',
  event: 'Event Budget Pro',
  travel: 'Travel Budget Pro',
  cafe: 'Cafe Costing Pro',
  inventory: 'Inventory Management Pro',
};

const TEMPLATE_URLS = {
  wedding: 'wedding-planner.html',
  event: 'event-budget.html',
  travel: 'travel-budget.html',
  cafe: 'cafe-costing.html',
  inventory: 'inventory.html',
};

function verifySignature(body, timestamp, signature) {
  const secret = process.env.CASHFREE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('CASHFREE_WEBHOOK_SECRET env var is not set — cannot verify webhooks');
    return false;
  }
  const computed = crypto
    .createHmac('sha256', secret)
    .update(timestamp + body)
    .digest('base64');
  return computed === signature;
}

function getPermanentExpiry() {
  return new Date('2099-12-31T23:59:59.000Z').toISOString();
}

async function sendConfirmationEmail(userId, templateKey, orderId) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log('RESEND_API_KEY not set — skipping confirmation email');
    return;
  }

  try {
    const { data: { user } } = await supabase.auth.admin.getUserById(userId);
    if (!user?.email) return;

    const templateName = TEMPLATE_NAMES[templateKey] || templateKey;
    const templateUrl = TEMPLATE_URLS[templateKey] || 'index.html';
    const customerName = user.user_metadata?.full_name || user.email.split('@')[0];

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;font-family:'Helvetica Neue',Arial,sans-serif;background:#f8f9ff;">
  <div style="max-width:520px;margin:40px auto;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#00355f,#0f4c81);padding:32px 40px;text-align:center;">
      <h1 style="color:#ffffff;font-size:24px;margin:0;">Payment Confirmed</h1>
    </div>
    <div style="padding:32px 40px;">
      <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">
        Hi ${customerName},
      </p>
      <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 24px;">
        Thank you for your purchase! Your <strong>${templateName}</strong> Pro access is now active.
      </p>
      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:20px;margin:0 0 24px;">
        <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Order ID:</strong> ${orderId}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Template:</strong> ${templateName}</p>
        <p style="margin:0 0 8px;font-size:14px;color:#374151;"><strong>Amount:</strong> ₹899</p>
        <p style="margin:0;font-size:14px;color:#16a34a;font-weight:600;">✓ Lifetime access — no auto-renewal</p>
      </div>
      <div style="text-align:center;margin:0 0 24px;">
        <a href="https://budgettemplates.shop/${templateUrl}" style="display:inline-block;background:linear-gradient(135deg,#00355f,#0f4c81);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-weight:700;font-size:15px;">
          Open Your Template →
        </a>
      </div>
      <p style="color:#94a3b8;font-size:13px;line-height:1.5;margin:0;text-align:center;">
        Your data syncs across all your devices. If you have any questions, reply to this email or contact
        <a href="mailto:support.budgettemplates@gmail.com" style="color:#00355f;">support.budgettemplates@gmail.com</a>
      </p>
    </div>
    <div style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="color:#94a3b8;font-size:12px;margin:0;">
        © 2026 BudgetTools · <a href="https://budgettemplates.shop" style="color:#64748b;">budgettemplates.shop</a>
      </p>
    </div>
  </div>
</body>
</html>`;

    const fromAddress = process.env.RESEND_FROM_EMAIL || 'BudgetTools <noreply@budgettemplates.shop>';

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress,
        to: user.email,
        subject: 'Your ' + templateName + ' purchase is confirmed',
        html: html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Resend email error:', err);
    } else {
      console.log('Confirmation email sent to', user.email);
    }
  } catch (err) {
    console.error('Email send failed (non-blocking):', err.message);
  }
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
        const tags = order.order_tags || {};
        const userId = tags.user_id;
        const templateKey = tags.template_key || 'unknown';
        const orderId = order.order_id;

        if (!orderId || !userId) {
          console.error('Missing order_id or user_id in payment success event');
          break;
        }

        const { data: existingProfile } = await supabase
          .from('profiles').select('id').eq('id', userId).single();

        if (!existingProfile) {
          console.log('Profile missing for user ' + userId + ', creating one');
          const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId);
          await supabase.from('profiles').upsert({
            id: userId,
            email: authUser?.email || null,
            full_name: authUser?.user_metadata?.full_name || null,
            avatar_url: authUser?.user_metadata?.avatar_url || null,
          }, { onConflict: 'id' });
        }

        const { error: upsertError } = await supabase.from('subscriptions').upsert({
          id: orderId,
          user_id: userId,
          template_key: templateKey,
          status: 'active',
          current_period_start: new Date().toISOString(),
          current_period_end: getPermanentExpiry(),
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });

        if (upsertError) {
          console.error('Subscription upsert FAILED:', JSON.stringify(upsertError));
        } else {
          console.log('Subscription upserted OK');
        }

        console.log(`Payment success: order ${orderId}, user ${userId}, template ${templateKey}, permanent access`);

        await sendConfirmationEmail(userId, templateKey, orderId);
        break;
      }

      case 'PAYMENT_FAILED_WEBHOOK': {
        const order = data.order || {};
        console.log(`Payment failed: order ${order.order_id}`);
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
