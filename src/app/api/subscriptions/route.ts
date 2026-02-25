import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Subscription from '@/models/Subscription';

export async function GET() {
  await dbConnect();
  const subscriptions = await Subscription.find({}).sort({ nextRenewalDate: 1 });
  return NextResponse.json(subscriptions);
}

export async function POST(req: NextRequest) {
  await dbConnect();
  const body = await req.json();
  try {
    const sub = new Subscription(body);
    await sub.save();
    return NextResponse.json(sub, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
