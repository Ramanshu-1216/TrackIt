/**
 * ============================================================
 * PIPELINE TEST SUITE — FAKE EMAIL FIXTURES
 * ============================================================
 * Realistic HTML/text emails from Amazon, Flipkart, Myntra,
 * Meesho and Ajio used across all test files.
 * ============================================================
 */

// ─── Helper to encode strings as base64url (like Gmail API) ───────────────────
export function toBase64Url(text: string): string {
  return Buffer.from(text, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ─── Amazon Order Confirmation ───────────────────────────────────────────────
export const AMAZON_ORDER_PLAIN_TEXT = `
Dear Raman,

Thank you for shopping with us. We want to let you know that your order has been placed.

ORDER DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Order #: 403-7362141-1234567
Order Date: March 4, 2025

Item: Samsung Galaxy M34 5G (Blue, 8GB RAM, 128GB Storage)
Qty: 1
Price: ₹18,999

Estimated Delivery: March 8, 2025

Your order will be delivered to:
Raman Gawande, Pune, Maharashtra 411001

View or manage your order:
https://www.amazon.in/gp/your-account/order-details?orderId=403-7362141-1234567

Product page:
https://www.amazon.in/dp/B0CTML42S2

This shipment is eligible for Free returns within 10 days of delivery.

Thanks,
Amazon.in
`;

export const AMAZON_ORDER_EMAIL = {
  from: 'auto-confirm@amazon.in',
  senderDomain: 'amazon.in',
  subject: 'Your Amazon.in order of "Samsung Galaxy M34 5G" has been placed',
  date: 'Tue, 04 Mar 2025 10:30:00 +0530',
  body: AMAZON_ORDER_PLAIN_TEXT,
  productUrls: ['https://www.amazon.in/dp/B0CTML42S2'],
};

// ─── Flipkart Order Confirmation ─────────────────────────────────────────────
export const FLIPKART_ORDER_PLAIN_TEXT = `
Hi Raman!

Yay! Your order has been placed successfully.

Order ID: OD229876543210
Placed on: 4 Mar 2025

ITEMS IN THIS ORDER
-------------------
Nike Air Max 270 (Black, Size UK 9)
Qty: 1
₹7,495

Estimated Delivery: 7 Mar 2025

Ship to: Raman Gawande, Kharadi, Pune 411014

Track your order: https://www.flipkart.com/my-orders

Product link: https://www.flipkart.com/nike-air-max-270-running-shoes/p/itm2b9e8c7cf2b45

RETURN POLICY: 7-day return policy applies to this item.

Regards,
Team Flipkart
`;

export const FLIPKART_ORDER_EMAIL = {
  from: 'no-reply@flipkart.com',
  senderDomain: 'flipkart.com',
  subject: 'Order Confirmed! Nike Air Max 270 will arrive by 7 Mar',
  date: 'Wed, 04 Mar 2025 14:20:00 +0530',
  body: FLIPKART_ORDER_PLAIN_TEXT,
  productUrls: ['https://www.flipkart.com/nike-air-max-270-running-shoes/p/itm2b9e8c7cf2b45'],
};

// ─── Myntra Order Confirmation ───────────────────────────────────────────────
export const MYNTRA_ORDER_HTML = `
<html>
<body>
<p>Hi Raman,</p>
<p>Your order has been placed! Here's a summary:</p>
<table>
  <tr><td>Order ID</td><td>MN1234567890</td></tr>
  <tr><td>Product</td><td>H&M Slim Fit Formal Shirt (White, XL)</td></tr>
  <tr><td>Price</td><td>₹1,299</td></tr>
  <tr><td>Order Date</td><td>4 March 2025</td></tr>
  <tr><td>Expected Delivery</td><td>8 March 2025</td></tr>
</table>
<p>View your order: <a href="https://www.myntra.com/orders/MN1234567890">Track Order</a></p>
<p>Product page: <a href="https://www.myntra.com/shirts/hm/hm-men-slim-fit-formal-shirt/23450678/buy">View Product</a></p>
<p>This item is eligible for 30-day return.</p>
</body>
</html>
`;

export const MYNTRA_ORDER_EMAIL = {
  from: 'no-reply@myntra.com',
  senderDomain: 'myntra.com',
  subject: 'Order Confirmed: H&M Slim Fit Formal Shirt',
  date: 'Tue, 04 Mar 2025 16:45:00 +0530',
  body: MYNTRA_ORDER_HTML,
  productUrls: ['https://www.myntra.com/shirts/hm/hm-men-slim-fit-formal-shirt/23450678/buy'],
};

// ─── Meesho Order Confirmation ───────────────────────────────────────────────
export const MEESHO_ORDER_PLAIN_TEXT = `
Hey Raman! 🎉

Your order is confirmed!

Order Details:
Order ID: M-78901234567
Product: Printed Cotton Kurti - Yellow (Size: XL)
Quantity: 2
Total Amount Paid: ₹798

Order Date: 4 March 2025
Expected Delivery: 10 March 2025

Delivery Address: Raman Gawande, Pune 411001

Returns: Products can be returned within 7 days of delivery.

View your order: https://meesho.com/orders/M-78901234567

Happy Shopping!
Team Meesho
`;

export const MEESHO_ORDER_EMAIL = {
  from: 'orders@meesho.com',
  senderDomain: 'meesho.com',
  subject: 'Order placed! Printed Cotton Kurti is on its way 🚀',
  date: 'Tue, 04 Mar 2025 18:05:00 +0530',
  body: MEESHO_ORDER_PLAIN_TEXT,
  productUrls: [],
};

// ─── Ajio Order Confirmation ─────────────────────────────────────────────────
export const AJIO_ORDER_PLAIN_TEXT = `
Dear Raman,

Your AJIO order has been placed!

Order Number: FN2025030412345
Order Date: 04 March 2025

Product: Roadster Men Slim Fit Jeans – Dark Blue (Size 32)
Amount: ₹2,799
Delivery By: 10 March 2025

Track your order: https://www.ajio.com/track-order/FN2025030412345
Product link: https://www.ajio.com/roadster-slim-fit-jeans/p/465423095_darkblue

Exchange policy: 7-day exchange applicable on this product.

Thank you for shopping with AJIO!
`;

export const AJIO_ORDER_EMAIL = {
  from: 'noreply@ajio.com',
  senderDomain: 'ajio.com',
  subject: 'Your AJIO Order FN2025030412345 is Confirmed!',
  date: 'Tue, 04 Mar 2025 19:30:00 +0530',
  body: AJIO_ORDER_PLAIN_TEXT,
  productUrls: ['https://www.ajio.com/roadster-slim-fit-jeans/p/465423095_darkblue'],
};

// ─── Netflix Subscription Renewal ────────────────────────────────────────────
export const NETFLIX_SUBSCRIPTION_TEXT = `
Hi Raman,

Your Netflix subscription has been renewed.

Plan: Mobile Plan
Amount Charged: ₹149
Billing Date: 4 March 2025
Next Billing Date: 4 April 2025

Payment Method: HDFC Credit Card ending in 4321

Manage your plan: https://www.netflix.com/account

Thanks,
Netflix
`;

export const NETFLIX_SUBSCRIPTION_EMAIL = {
  from: 'info@mailer.netflix.com',
  senderDomain: 'mailer.netflix.com',
  subject: 'Your Netflix subscription has been renewed – ₹149 charged',
  date: 'Tue, 04 Mar 2025 08:00:00 +0530',
  body: NETFLIX_SUBSCRIPTION_TEXT,
  productUrls: [],
};

// ─── Amazon Delivered Notification ───────────────────────────────────────────
export const AMAZON_DELIVERED_TEXT = `
Your package has been delivered!

Your order #403-7362141-1234567 was delivered on March 7, 2025 at 2:15 PM.

Item delivered: Samsung Galaxy M34 5G

Your delivery was left at: Front door

If you have any issues with your delivery, you can return it within 10 days of delivery.

https://www.amazon.in/gp/your-account/order-details?orderId=403-7362141-1234567
`;

export const AMAZON_DELIVERED_EMAIL = {
  from: 'auto-confirm@amazon.in',
  senderDomain: 'amazon.in',
  subject: 'Delivered: Samsung Galaxy M34 5G',
  date: 'Fri, 07 Mar 2025 14:15:00 +0530',
  body: AMAZON_DELIVERED_TEXT,
  productUrls: [],
};

// ─── Irrelevant Email (should be type: none) ──────────────────────────────────
export const PROMO_EMAIL_TEXT = `
Hi Raman,

Don't miss out! Up to 50% off on fashion this weekend.

Shop now at https://www.flipkart.com/fashion-sale

Offer valid till 6 March 2025.

Team Flipkart
`;

export const PROMO_EMAIL = {
  from: 'noreply@flipkart.com',
  senderDomain: 'flipkart.com',
  subject: 'Weekend Sale: Up to 50% off on Fashion!',
  date: 'Sat, 02 Mar 2025 10:00:00 +0530',
  body: PROMO_EMAIL_TEXT,
  productUrls: [],
};
