import { NextResponse } from 'next/server';
import { scanForOrders } from '@/lib/gmailService';

export async function POST() {
  try {
    const newOrders = await scanForOrders();
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
