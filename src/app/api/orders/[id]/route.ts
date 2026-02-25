import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import dbConnect from '@/lib/dbConnect';
import Order from '@/models/Order';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await dbConnect();
  const { id } = await params;
  const order = await Order.findOne({ _id: id, userId: session.user.id });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(order);
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
  
  // Security check: ensure user owns the order before updating
  const existingOrder = await Order.findOne({ _id: id, userId: session.user.id });
  if (!existingOrder) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body.deliveryDate && body.returnWindowDays) {
    const d = new Date(body.deliveryDate);
    d.setDate(d.getDate() + Number(body.returnWindowDays));
    body.returnDeadline = d;
  }
  
  const order = await Order.findByIdAndUpdate(id, body, { new: true });
  return NextResponse.json(order);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  await dbConnect();
  const { id } = await params;
  const order = await Order.findOneAndDelete({ _id: id, userId: session.user.id });
  if (!order) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ message: 'Deleted successfully' });
}
