import { google } from 'googleapis';
import { oauth2Client } from './googleAuth';
import Order from '@/models/Order';
import Subscription from '@/models/Subscription';
import User from '@/models/User';
import dbConnect from './dbConnect';
import mongoose from 'mongoose';
import { sendPushNotification } from './notificationService';

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
  // Expanded query to include subscriptions
  let query = 'subject:("order confirmation" OR "order placed" OR "delivered" OR "subscription" OR "renewal" OR "membership" OR "invoice")';
  
  if (user?.lastGmailSync) {
    const unixSeconds = Math.floor(new Date(user.lastGmailSync).getTime() / 1000);
    query += ` after:${unixSeconds}`;
  } else {
    query += ' newer_than:30d';
  }

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 30,
  });

  const messages = res.data.messages || [];
  const newOrders = [];
  const newSubs = [];

  for (const msg of messages) {
    // Check if it's already processed as an order or subscription
    const existingOrder = await Order.findOne({ gmailMessageId: msg.id, userId });
    const existingSub = await Subscription.findOne({ notes: { $regex: msg.id! }, userId }); // Using notes as a proxy for msgId if not in schema
    if (existingOrder || existingSub) continue;

    const fullMsg = await gmail.users.messages.get({ userId: 'me', id: msg.id! });
    const snippet = fullMsg.data.snippet || '';
    const subject = fullMsg.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
    const dateStr = fullMsg.data.payload?.headers?.find(h => h.name === 'Date')?.value || '';

    const isSubscription = /subscription|renewal|membership|billed|monthly|yearly/i.test(subject + snippet);

    if (isSubscription) {
      const subData = parseSubscriptionContent(subject, snippet, dateStr);
      if (subData) {
        const newSub = new Subscription({
          ...subData,
          userId: new mongoose.Types.ObjectId(userId),
          notes: `Auto-synced from Gmail (ID: ${msg.id})`,
        });
        await newSub.save();
        newSubs.push(newSub);
      }
    } else {
      const orderData = parseEmailContent(subject, snippet, dateStr);
      if (orderData) {
        const order = new Order({
          ...orderData,
          userId: new mongoose.Types.ObjectId(userId),
          gmailMessageId: msg.id,
          status: snippet.toLowerCase().includes('delivered') ? 'Delivered' : 'Pending',
        });
        await order.save();
        newOrders.push(order);
      }
    }
  }

  await User.findByIdAndUpdate(userId, { lastGmailSync: new Date() });

  if (newOrders.length > 0 || newSubs.length > 0) {
    let body = '';
    if (newOrders.length > 0) body += `Found ${newOrders.length} new orders. `;
    if (newSubs.length > 0) body += `Found ${newSubs.length} new subscriptions.`;

    await sendPushNotification(userId, {
      title: 'Sync Update 📦🔄',
      body: body.trim(),
      url: '/',
    });
  }

  return { orders: newOrders, subscriptions: newSubs };
}

function parseEmailContent(subject: string, snippet: string, dateStr: string) {
  let marketplace = 'Other';
  let itemName = 'Unknown Item';

  if (subject.toLowerCase().includes('amazon')) marketplace = 'Amazon';
  if (subject.toLowerCase().includes('flipkart')) marketplace = 'Flipkart';

  const nameMatch = snippet.match(/confirmation for ([^.]+)/i) || snippet.match(/order for ([^.]+)/i);
  if (nameMatch) {
    itemName = nameMatch[1].trim().slice(0, 50);
  } else if (subject) {
    itemName = subject.replace(/order confirmation:|confirmation:|your/gi, '').trim().slice(0, 50);
  }

  return {
    itemName,
    marketplace,
    purchaseDate: new Date(dateStr) || new Date(),
    returnWindowDays: marketplace === 'Amazon' ? 10 : 7,
  };
}

function parseSubscriptionContent(subject: string, snippet: string, dateStr: string) {
  let serviceName = 'Unknown Service';
  let cost = 0;
  let billingCycle: 'Monthly' | 'Yearly' = 'Monthly';

  const services = ['Netflix', 'Spotify', 'YouTube', 'Amazon Prime', 'Disney+', 'iCloud', 'Google One', 'Microsoft 365'];
  for (const s of services) {
    if ((subject + snippet).toLowerCase().includes(s.toLowerCase())) {
      serviceName = s;
      break;
    }
  }

  if (serviceName === 'Unknown Service') {
    serviceName = subject.replace(/renewal|subscription|invoice|membership|your/gi, '').trim().slice(0, 50);
  }

  const costMatch = snippet.match(/₹\s*([0-9.,]+)/) || snippet.match(/Rs\.\s*([0-9.,]+)/) || snippet.match(/\$\s*([0-9.,]+)/);
  if (costMatch) {
    cost = parseFloat(costMatch[1].replace(/,/g, ''));
  }

  if ((subject + snippet).toLowerCase().includes('year')) {
    billingCycle = 'Yearly';
  }

  const nextRenewalDate = new Date(dateStr);
  if (billingCycle === 'Monthly') {
    nextRenewalDate.setMonth(nextRenewalDate.getMonth() + 1);
  } else {
    nextRenewalDate.setFullYear(nextRenewalDate.getFullYear() + 1);
  }

  return {
    serviceName,
    cost,
    currency: snippet.includes('$') ? 'USD' : 'INR',
    billingCycle,
    nextRenewalDate,
    status: 'Active' as const,
  };
}
