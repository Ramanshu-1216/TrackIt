import { google } from 'googleapis';
import { oauth2Client } from './googleAuth';
import Order from '@/models/Order';
import Subscription from '@/models/Subscription';
import User from '@/models/User';
import dbConnect from './dbConnect';
import mongoose from 'mongoose';
import { sendPushNotification } from './notificationService';
import { extractDataFromEmail } from './llmService';
import { lookupReturnPolicy } from './webLookupService';

export async function scanForOrders(userId: string) {
  await dbConnect();
  
  const account = await mongoose.connection.db?.collection('accounts').findOne({ 
    userId: new mongoose.Types.ObjectId(userId),
    provider: 'google'
  });

  if (!account || !account.access_token) {
    console.warn(`[GmailSync] No Google account connected or missing token for userId: ${userId}`);
    return { orders: [], subscriptions: [] };
  }

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  oauth2Client.on('tokens', async (tokens) => {
    const updateData: any = {};
    if (tokens.access_token) updateData.access_token = tokens.access_token;
    if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;
    if (tokens.expiry_date) updateData.expires_at = Math.floor(tokens.expiry_date / 1000);

    if (Object.keys(updateData).length > 0) {
      await mongoose.connection.db?.collection('accounts').updateOne(
        { userId: new mongoose.Types.ObjectId(userId), provider: 'google' },
        { $set: updateData }
      );
    }
  });

  const user = await User.findById(userId);
  // Extremely inclusive query to capture any potential receipt or update
  let query = 'subject:("order" OR "confirmation" OR "placed" OR "delivered" OR "subscription" OR "renewal" OR "membership" OR "invoice" OR "receipt" OR "billed")';
  
  if (user?.lastGmailSync) {
    const unixSeconds = Math.floor(new Date(user.lastGmailSync).getTime() / 1000);
    query += ` after:${unixSeconds}`;
  } else {
    query += ' newer_than:30d';
  }

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 20, // Keep batch small for LLM efficiency
  });

  const messages = res.data.messages || [];
  const newOrders = [];
  const newSubs = [];

  for (const msg of messages) {
    const existingOrder = await Order.findOne({ gmailMessageId: msg.id, userId });
    const existingSub = await Subscription.findOne({ notes: { $regex: msg.id! }, userId }); 
    if (existingOrder || existingSub) continue;

    const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msg.id! });
    const snippet = fullMsg.data.snippet || '';
    const subject = fullMsg.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
    const dateStr = fullMsg.data.payload?.headers?.find(h => h.name === 'Date')?.value || '';

    // Advanced Extraction with Gemini
    const result = await extractDataFromEmail(subject, snippet);

    if (result.type === 'subscription' && result.data) {
      const newSub = new Subscription({
        ...result.data,
        userId: new mongoose.Types.ObjectId(userId),
        notes: `Auto-synced via Gemini (ID: ${msg.id})`,
      });
      await newSub.save();
      newSubs.push(newSub);
    } else if (result.type === 'order' && result.data) {
      let returnWindowDays = result.data.returnWindowDays || (result.marketplace === 'Amazon' ? 10 : 7);
      
      // If LLM says it needs web lookup, trigger it
      if (result.needsWebLookup) {
        console.log(`[GmailSync] Triggering web lookup for: ${result.data.itemName}`);
        const foundDays = await lookupReturnPolicy(
          result.data.itemName, 
          result.marketplace || 'Other', 
          result.productUrl
        );
        if (foundDays !== null) {
          console.log(`[GmailSync] Found return window via web: ${foundDays} days`);
          returnWindowDays = foundDays;
        }
      }

      const order = new Order({
        ...result.data,
        userId: new mongoose.Types.ObjectId(userId),
        gmailMessageId: msg.id,
        returnWindowDays,
        status: snippet.toLowerCase().includes('delivered') ? 'Delivered' : 'Pending',
      });
      await order.save();
      newOrders.push(order);
    }
  }

  await User.findByIdAndUpdate(userId, { lastGmailSync: new Date() });

  if (newOrders.length > 0 || newSubs.length > 0) {
    let body = '';
    if (newOrders.length > 0) body += `Found ${newOrders.length} orders. `;
    if (newSubs.length > 0) body += `Found ${newSubs.length} subscriptions.`;

    await sendPushNotification(userId, {
      title: 'AI Sync Complete ✨',
      body: body.trim(),
      url: '/',
    });
  }

  return { orders: newOrders, subscriptions: newSubs };
}
