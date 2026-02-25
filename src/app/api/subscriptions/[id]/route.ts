import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Subscription from '@/models/Subscription';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await dbConnect();
  const { id } = await params;
  const sub = await Subscription.findById(id);
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(sub);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await dbConnect();
  const { id } = await params;
  const body = await req.json();
  const sub = await Subscription.findByIdAndUpdate(id, body, { new: true });
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(sub);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await dbConnect();
  const { id } = await params;
  const sub = await Subscription.findByIdAndDelete(id);
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ message: 'Deleted successfully' });
}
