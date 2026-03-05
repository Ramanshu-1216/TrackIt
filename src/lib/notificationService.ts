import webpush from "web-push";
import User from "@/models/User";
import Order from "@/models/Order";
import Subscription from "@/models/Subscription";
import dbConnect from "./dbConnect";

// Configure VAPID keys
webpush.setVapidDetails(
  "mailto:your-email@example.com",
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

export async function sendPushNotification(
  userId: string,
  payload: { title: string; body: string; url?: string },
) {
  await dbConnect();
  const user = await User.findById(userId);
  if (!user || !user.pushSubscription) {
    console.log(`No user or push subscription found for userId: ${userId}`);
    return;
  }

  try {
    await webpush.sendNotification(
      user.pushSubscription as webpush.PushSubscription,
      JSON.stringify(payload),
    );
    console.log(`Push notification sent successfully to user: ${userId}`);
  } catch (error: unknown) {
    console.error(`Error sending push notification to ${userId}:`, error);
    const err = error as { statusCode?: number };
    if (err.statusCode === 410) {
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

  // 1. Find orders where return deadline is today or tomorrow
  const upcomingOrders = await Order.find({
    status: "Delivered",
    returnDeadline: {
      $gte: today,
      $lte: tomorrow,
    },
  });

  // 2. Find active subscriptions with upcoming renewal dates (today or tomorrow)
  const upcomingSubs = await Subscription.find({
    status: "Active",
    nextRenewalDate: {
      $gte: today,
      $lte: tomorrow,
    },
  });

  let sentCount = 0;

  // Process Orders
  for (const order of upcomingOrders) {
    if (order.userId) {
      await sendPushNotification(order.userId.toString(), {
        title: "Return Window Closing Soon! ⚠️",
        body: `Last chance to return "${order.itemName}". Deadline: ${order.returnDeadline?.toLocaleDateString()}`,
        url: `/orders`,
      });
      sentCount++;
    }
  }

  // Process Subscriptions
  for (const sub of upcomingSubs) {
    if (sub.userId) {
      await sendPushNotification(sub.userId.toString(), {
        title: "Subscription Renewal Alert! 🔄",
        body: `"${sub.serviceName}" is renewing on ${sub.nextRenewalDate.toLocaleDateString()}. Amount: ${sub.currency} ${sub.cost}`,
        url: `/subscriptions`,
      });
      sentCount++;
    }
  }

  return sentCount;
}
