import webpush from 'web-push';
import User from '@/models/User';
import Order from '@/models/Order';
import dbConnect from './dbConnect';

// Configure VAPID keys
webpush.setVapidDetails(
  'mailto:your-email@example.com',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function sendPushNotification(
  userId: string, 
  payload: { title: string; body: string; url?: string }
) {
  await dbConnect();
  const user = await User.findById(userId);
  if (!user || !user.pushSubscription) {
    console.log(`No user or push subscription found for userId: ${userId}`);
    return;
  }

  try {
    await webpush.sendNotification(
      user.pushSubscription as any,
      JSON.stringify(payload)
    );
    console.log(`Push notification sent successfully to user: ${userId}`);
  } catch (error: any) {
    console.error(`Error sending push notification to ${userId}:`, error);
    if (error.statusCode === 410) {
      // Subscription expired/invalid
      user.pushSubscription = undefined;
      await user.save();
    }
  }
}

export async function checkAndSendReminders() {
  await dbConnect();
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);

  // Find orders where return deadline is today or tomorrow
  const upcomingOrders = await Order.find({
    status: 'Delivered',
    returnDeadline: {
      $gte: today,
      $lte: tomorrow
    }
  });

  let sentCount = 0;
  for (const order of upcomingOrders) {
    if (order.userId) {
      await sendPushNotification(order.userId.toString(), {
        title: 'Return Window Closing Soon! ⚠️',
        body: `Last chance to return "${order.itemName}". Deadline: ${order.returnDeadline?.toLocaleDateString()}`,
        url: `/orders`,
      });
      sentCount++;
    }
  }

  return sentCount;
}
