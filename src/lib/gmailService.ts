import { google } from 'googleapis';
import { oauth2Client } from './googleAuth';
import Order from '@/models/Order';
import User from '@/models/User';
import dbConnect from './dbConnect';
import mongoose from 'mongoose';
import { sendPushNotification } from './notificationService';

export async function scanForOrders(userId: string) {
  await dbConnect();
  
  // NextAuth stores tokens in the 'accounts' collection
  const account = await mongoose.connection.db?.collection('accounts').findOne({ 
    userId: new mongoose.Types.ObjectId(userId),
    provider: 'google'
  });

  if (!account || !account.access_token) {
    console.warn(`[GmailSync] No Google account connected or missing token for userId: ${userId}`);
    return [];
  }

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Update tokens in 'accounts' collection if they were refreshed
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

  // 1. Fetch user to get last sync time
  const user = await User.findById(userId);
  let query = 'subject:("order confirmation" OR "order placed" OR "delivered")';
  
  if (user?.lastGmailSync) {
    // Gmail supports after:<unix_timestamp>
    const unixSeconds = Math.floor(new Date(user.lastGmailSync).getTime() / 1000);
    query += ` after:${unixSeconds}`;
  } else {
    // Default to last 30 days for new users
    query += ' newer_than:30d';
  }

  console.log(`[GmailSync] Query for user ${userId}: ${query}`);

  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 20,
  });

  const messages = res.data.messages || [];
  const results = [];

  for (const msg of messages) {
    const existing = await Order.findOne({ gmailMessageId: msg.id, userId });
    if (existing) continue;

    const fullMsg = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
    });

    const snippet = fullMsg.data.snippet || '';
    const subject = fullMsg.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
    const dateStr = fullMsg.data.payload?.headers?.find(h => h.name === 'Date')?.value || '';

    const orderData = parseEmailContent(subject, snippet, dateStr);
    
    if (orderData) {
      const newOrder = new Order({
        ...orderData,
        userId: new mongoose.Types.ObjectId(userId),
        gmailMessageId: msg.id,
        status: snippet.toLowerCase().includes('delivered') ? 'Delivered' : 'Pending',
      });
      await newOrder.save();
      results.push(newOrder);
    }
  }

  // 3. Update last sync timestamp
  await User.findByIdAndUpdate(userId, { lastGmailSync: new Date() });

  // 4. Trigger notification if new orders found
  if (results.length > 0) {
    const itemNames = results.slice(0, 2).map(o => o.itemName).join(', ');
    const moreCount = results.length > 2 ? ` and ${results.length - 2} more` : '';
    
    await sendPushNotification(userId, {
      title: 'New Orders Synced! 📦',
      body: `Found ${results.length} new orders from Gmail: ${itemNames}${moreCount}.`,
      url: '/',
    });
  }

  return results;
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
