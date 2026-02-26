import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import dbConnect from '@/lib/dbConnect';
import { scanForOrders } from '@/lib/gmailService';

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();

    // 1. Find all users who have a linked Google account
    const accounts = await mongoose.connection.db?.collection('accounts')
      .find({ provider: 'google', access_token: { $exists: true } })
      .toArray();

    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ success: true, message: 'No google accounts found to sync' });
    }

    let totalSynced = 0;
    const results = [];

    // 2. Loop through all accounts and sync their emails
    for (const account of accounts) {
      const userId = account.userId.toString();
      try {
        console.log(`[CRON] Starting sync for user: ${userId}`);
        const newOrders = await scanForOrders(userId);
        totalSynced += newOrders.length;
        results.push({ userId, newOrders: newOrders.length, status: 'success' });
      } catch (error: any) {
        console.error(`[CRON] Failed to sync for user: ${userId}`, error);
        results.push({ userId, error: error.message, status: 'failed' });
      }
    }

    return NextResponse.json({ 
      success: true, 
      totalUsersProcessed: accounts.length,
      totalOrdersFound: totalSynced,
      details: results 
    });
    
  } catch (error: any) {
    console.error('[CRON] High-level sync failure:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
