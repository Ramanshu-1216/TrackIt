import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import Subscription from '@/models/Subscription';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await dbConnect();

  try {
    const userId = session.user.id;
    const orders = await Order.find({ userId });
    const subscriptions = await Subscription.find({ userId });

    const activeOrders = orders.filter(
      (o) => o.status === 'Delivered' && o.returnDeadline
    );
    const activeSubscriptions = subscriptions.filter((s) => s.status === 'Active');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const getDaysLeft = (date: Date) => {
      const target = new Date(date);
      target.setHours(0, 0, 0, 0);
      return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    };

    const stats = {
      totalOrders: orders.length,
      activeReturns: activeOrders.length,
      subscriptionsCount: activeSubscriptions.length,
      monthlySpend: activeSubscriptions.reduce((sum, s) => {
        let cost = s.cost;
        if (s.billingCycle === 'Yearly') cost = s.cost / 12;
        if (s.billingCycle === 'Weekly') cost = s.cost * 4;
        return sum + cost;
      }, 0),
      urgentCount: [
        ...activeOrders.filter((o) => getDaysLeft(o.returnDeadline!) <= 3),
        ...activeSubscriptions.filter((s) => getDaysLeft(s.nextRenewalDate) <= 3),
      ].length,
    };

    const upcomingReturns = activeOrders
      .filter((o) => getDaysLeft(o.returnDeadline!) >= 0)
      .sort((a, b) => a.returnDeadline!.getTime() - b.returnDeadline!.getTime())
      .slice(0, 5);

    const upcomingSubscriptions = activeSubscriptions
      .filter((s) => getDaysLeft(s.nextRenewalDate) >= 0)
      .sort((a, b) => a.nextRenewalDate.getTime() - b.nextRenewalDate.getTime())
      .slice(0, 5);

    return NextResponse.json({
      stats,
      upcomingReturns,
      upcomingSubscriptions,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
