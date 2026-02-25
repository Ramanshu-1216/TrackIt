import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/models/User';

export async function GET() {
  await dbConnect();
  const user = await User.findOne({});
  if (!user) {
    return NextResponse.json({
      googleTokens: null,
      pushSubscription: null
    });
  }
  return NextResponse.json(user);
}
