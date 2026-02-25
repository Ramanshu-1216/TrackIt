import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/dbConnect';
import Subscription from '@/models/Subscription';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await dbConnect();
  const { id } = await params;
  const sub = await Subscription.findOne({ _id: id, userId: session.user.id });
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(sub);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await dbConnect();
  const { id } = await params;
  const body = await req.json();

  const sub = await Subscription.findOneAndUpdate(
    { _id: id, userId: session.user.id },
    body,
    { new: true }
  );
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(sub);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await dbConnect();
  const { id } = await params;
  const sub = await Subscription.findOneAndDelete({ _id: id, userId: session.user.id });
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ message: 'Deleted successfully' });
}
