import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/models/User';

export async function POST(req: NextRequest) {
  await dbConnect();
  const subscription = await req.json();

  try {
    let user = await User.findOne({});
    if (!user) {
      user = new User({
        preferences: { enablePush: true, reminderDaysBefore: 1 },
      });
    }

    user.pushSubscription = subscription;
    await user.save();

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
