import { google } from 'googleapis';
import { oauth2Client } from './googleAuth';
import Order from '@/models/Order';
import User from '@/models/User';
import dbConnect from './dbConnect';

export async function scanForOrders() {
  await dbConnect();
  const user = await User.findOne({});
  if (!user || !user.googleTokens) {
    throw new Error('No Google account connected');
  }

  oauth2Client.setCredentials({
    access_token: user.googleTokens.accessToken,
    refresh_token: user.googleTokens.refreshToken,
    expiry_date: user.googleTokens.expiry.getTime(),
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  // Update tokens if they were refreshed
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.refresh_token) user.googleTokens!.refreshToken = tokens.refresh_token;
    user.googleTokens!.accessToken = tokens.access_token!;
    user.googleTokens!.expiry = new Date(tokens.expiry_date!);
    await user.save();
  });

  // Search for order confirmation emails
  // Common senders: Amazon, Flipkart, etc.
  const query = 'subject:("order confirmation" OR "order placed" OR "delivered")';
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 10,
  });

  const messages = res.data.messages || [];
  const results = [];

  for (const msg of messages) {
    // Check if we already processed this message
    const existing = await Order.findOne({ gmailMessageId: msg.id });
    if (existing) continue;

    const fullMsg = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
    });

    const snippet = fullMsg.data.snippet || '';
    const subject = fullMsg.data.payload?.headers?.find(h => h.name === 'Subject')?.value || '';
    const dateStr = fullMsg.data.payload?.headers?.find(h => h.name === 'Date')?.value || '';

    // Basic Parsing Logic (Regex based)
    // In a real app, this would be much more robust or use an LLM
    const orderData = parseEmailContent(subject, snippet, dateStr);
    
    if (orderData) {
      const newOrder = new Order({
        ...orderData,
        gmailMessageId: msg.id,
        status: snippet.toLowerCase().includes('delivered') ? 'Delivered' : 'Pending',
      });
      await newOrder.save();
      results.push(newOrder);
    }
  }

  return results;
}

function parseEmailContent(subject: string, snippet: string, dateStr: string) {
  let marketplace = 'Other';
  let itemName = 'Unknown Item';

  if (subject.toLowerCase().includes('amazon')) marketplace = 'Amazon';
  if (subject.toLowerCase().includes('flipkart')) marketplace = 'Flipkart';

  // Extract item name from snippet (very basic)
  // Looking for patterns like "Order for [Item Name]" or "Confirmation: [Item Name]"
  const nameMatch = snippet.match(/confirmation for ([^.]+)/i) || snippet.match(/order for ([^.]+)/i);
  if (nameMatch) {
    itemName = nameMatch[1].trim().slice(0, 50);
  } else if (subject) {
    // Fallback to cleaned subject
    itemName = subject.replace(/order confirmation:|confirmation:|your/gi, '').trim().slice(0, 50);
  }

  return {
    itemName,
    marketplace,
    purchaseDate: new Date(dateStr) || new Date(),
    returnWindowDays: marketplace === 'Amazon' ? 10 : 7, // Defaults
  };
}
