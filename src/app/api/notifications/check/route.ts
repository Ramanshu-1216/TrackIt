import { NextResponse } from 'next/server';
import { checkAndSendReminders } from '@/lib/notificationService';

export async function POST() {
  try {
    const count = await checkAndSendReminders();
    return NextResponse.json({ success: true, notificationsSent: count });
  } catch (error: any) {
    console.error('Reminder Check Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
