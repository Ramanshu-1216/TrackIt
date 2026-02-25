import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { scanForOrders } from '@/lib/gmailService';
import { authOptions } from '../../auth/[...nextauth]/route';

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const newOrders = await scanForOrders(session.user.id);
    return NextResponse.json({ 
      success: true, 
      count: newOrders.length,
      orders: newOrders 
    });
  } catch (error: any) {
    console.error('Sync Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
