import { google, gmail_v1 } from 'googleapis';
import { oauth2Client } from './googleAuth';
import Order from '@/models/Order';
import Subscription from '@/models/Subscription';
import User from '@/models/User';
import dbConnect from './dbConnect';
import mongoose from 'mongoose';
import { sendPushNotification } from './notificationService';
import { extractDataFromEmail, ExtractedOrder, ExtractedSubscription } from './llmService';
import { lookupReturnPolicy } from './webLookupService';

// ─── E-commerce Domain Configuration ─────────────────────────────────────────

const ECOMMERCE_DOMAINS = [
  'amazon.in',
  'amazon.com',
  'flipkart.com',
  'myntra.com',
  'meesho.com',
  'ajio.com',
];

// Build Gmail query: from:(domain1 OR domain2 OR ...)
function buildGmailQuery(lastSync?: Date): string {
  const fromClause = ECOMMERCE_DOMAINS.map((d) => d).join(' OR ');
  let query = `from:(${fromClause})`;

  if (lastSync) {
    const syncDate = new Date(lastSync);
    // Subtract 12 hours (43200 seconds) to handle timezone shifts/skew reliably
    const unixSeconds = Math.floor(syncDate.getTime() / 1000) - 43200;
    console.log(
      `[GmailSync] lastSync: ${syncDate.toISOString()}, Unix (with 12h buffer): ${unixSeconds}`
    );
    query += ` after:${unixSeconds}`;
  } else {
    query += ' newer_than:30d';
  }

  return query;
}

// ─── Email Body Decoder ──────────────────────────────────────────────────────

/**
 * Recursively extract text content from Gmail message payload.
 * Handles multipart messages, decodes base64url bodies.
 */
function extractEmailBody(payload: gmail_v1.Schema$MessagePart): string {
  let textContent = '';
  let htmlContent = '';

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/plain') {
      textContent = decoded;
    } else if (payload.mimeType === 'text/html') {
      htmlContent = decoded;
    }
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        textContent += decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        htmlContent += decodeBase64Url(part.body.data);
      } else if (part.mimeType?.startsWith('multipart/') && part.parts) {
        // Recurse into nested multipart
        const nested = extractEmailBody(part);
        if (nested) textContent += '\n' + nested;
      }
    }
  }

  // Prefer plain text; fall back to stripped HTML
  if (textContent.trim()) return textContent.trim();
  if (htmlContent.trim()) return stripHtml(htmlContent);
  return '';
}

/**
 * Decode base64url encoded string (Gmail uses URL-safe base64)
 */
function decodeBase64Url(data: string): string {
  try {
    // Replace URL-safe chars and add padding
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    return Buffer.from(base64, 'base64').toString('utf-8');
  } catch (error) {
    console.error('[GmailSync] Failed to decode base64:', error);
    return '';
  }
}

/**
 * Strip HTML tags and extract clean text
 */
function stripHtml(html: string): string {
  return (
    html
      // Remove style/script blocks entirely
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      // Replace common block elements with newlines
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Remove all remaining tags
      .replace(/<[^>]+>/g, ' ')
      // Decode HTML entities
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
      // Clean up whitespace
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n')
      .trim()
  );
}

/**
 * Extract all URLs from email body text/html
 */
function extractUrls(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s"'<>\])]+/gi;
  const matches = text.match(urlPattern) || [];
  // Deduplicate and clean trailing punctuation
  const cleaned = matches.map((url) => url.replace(/[.,;:!?)}\]]+$/, ''));
  return [...new Set(cleaned)];
}

/**
 * Extract sender domain from "From" header
 */
function extractSenderDomain(fromHeader: string): string {
  // "Flipkart <noreply@flipkart.com>" → "flipkart.com"
  const match = fromHeader.match(/@([a-zA-Z0-9.-]+)/);
  return match ? match[1].toLowerCase() : '';
}

// ─── Main Sync Function ─────────────────────────────────────────────────────

export async function scanForOrders(userId: string) {
  await dbConnect();

  const account = await mongoose.connection.db?.collection('accounts').findOne({
    userId: new mongoose.Types.ObjectId(userId),
    provider: 'google',
  });

  if (!account || !account.access_token) {
    console.warn(`[GmailSync] No Google account or missing token for userId: ${userId}`);
    return { orders: [], subscriptions: [] };
  }

  oauth2Client.setCredentials({
    access_token: account.access_token,
    refresh_token: account.refresh_token,
    expiry_date: account.expires_at ? account.expires_at * 1000 : undefined,
  });

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

  oauth2Client.on('tokens', async (tokens) => {
    const updateData: Record<string, string | number> = {};
    if (tokens.access_token) updateData.access_token = tokens.access_token;
    if (tokens.refresh_token) updateData.refresh_token = tokens.refresh_token;
    if (tokens.expiry_date) updateData.expires_at = Math.floor(tokens.expiry_date / 1000);

    if (Object.keys(updateData).length > 0) {
      await mongoose.connection.db
        ?.collection('accounts')
        .updateOne(
          { userId: new mongoose.Types.ObjectId(userId), provider: 'google' },
          { $set: updateData }
        );
    }
  });

  // Build domain-based query
  const user = await User.findById(userId);
  const query = buildGmailQuery(user?.lastGmailSync);
  console.log(`[GmailSync] Query: ${query}`);

  // Fetch messages
  const res = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 30,
  });

  const messages = res.data.messages || [];
  console.log(`[GmailSync] Found ${messages.length} messages to process`);

  const newOrders: mongoose.Document[] = [];
  const newSubs: mongoose.Document[] = [];

  for (const msg of messages) {
    try {
      // Skip already processed messages
      const existingOrder = await Order.findOne({
        gmailMessageId: msg.id,
        userId,
      });
      const existingSub = await Subscription.findOne({
        notes: { $regex: msg.id! },
        userId,
      });
      if (existingOrder || existingSub) {
        console.log(`[GmailSync] Skipping already processed: ${msg.id}`);
        continue;
      }

      // Fetch full message
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });

      const payload = fullMsg.data.payload;
      if (!payload) continue;

      // Extract headers
      const headers = payload.headers || [];
      const subject = headers.find((h) => h.name === 'Subject')?.value || '';
      const fromHeader = headers.find((h) => h.name === 'From')?.value || '';
      const dateHeader = headers.find((h) => h.name === 'Date')?.value || '';
      const senderDomain = extractSenderDomain(fromHeader);

      // Verify sender is from an e-commerce domain
      const isEcommerce = ECOMMERCE_DOMAINS.some((d) => senderDomain.includes(d));
      if (!isEcommerce) {
        console.log(`[GmailSync] Skipping non-ecommerce sender: ${senderDomain}`);
        continue;
      }

      console.log(`[GmailSync] Processing: "${subject}" from ${senderDomain}`);

      // Decode full email body
      const body = extractEmailBody(payload);
      if (!body) {
        console.log(`[GmailSync] Empty body for message ${msg.id}, skipping`);
        continue;
      }

      // ─── Rate Limiting for Free Tier ───────────────────────────────────────
      // Wait 5 seconds between each message to avoid hitting Gemini 15 RPM limit
      if (newOrders.length > 0 || newSubs.length > 0) {
        console.log('[GmailSync] Rate-limiting pause (5s)...');
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }

      // Extract URLs from email body
      const emailUrls = extractUrls(body);
      console.log(`[GmailSync] Found ${emailUrls.length} URLs in email body`);

      // LLM extraction
      const result = await extractDataFromEmail(subject, body, senderDomain, dateHeader, emailUrls);
      console.log(`[GmailSync] LLM result type: ${result.type}`);

      if (result.type === 'none' || !result.data) continue;

      if (result.type === 'subscription') {
        const subData = result.data as ExtractedSubscription;
        const newSub = new Subscription({
          userId: new mongoose.Types.ObjectId(userId),
          serviceName: subData.serviceName,
          cost: subData.cost,
          currency: subData.currency || 'INR',
          billingCycle: subData.billingCycle || 'Monthly',
          nextRenewalDate: new Date(subData.nextRenewalDate),
          status: subData.status || 'Active',
          notes: `Auto-synced from Gmail (ID: ${msg.id})`,
        });
        await newSub.save();
        newSubs.push(newSub);
        console.log(`[GmailSync] ✅ Saved subscription: ${subData.serviceName}`);
      }

      if (result.type === 'order') {
        const orderData = result.data as ExtractedOrder;

        // Look up return policy (3-tier)
        const returnWindowDays = await lookupReturnPolicy(
          orderData.itemName,
          orderData.marketplace,
          orderData.productUrls || []
        );

        // Parse dates safely
        const purchaseDate =
          safeParseDate(orderData.purchaseDate) || new Date(dateHeader) || new Date();
        const deliveryDate = orderData.deliveryDate
          ? safeParseDate(orderData.deliveryDate)
          : undefined;

        const order = new Order({
          userId: new mongoose.Types.ObjectId(userId),
          itemName: orderData.itemName,
          marketplace: orderData.marketplace,
          purchaseDate,
          deliveryDate,
          returnWindowDays,
          status: orderData.status || 'Pending',
          gmailMessageId: msg.id,
          notes: orderData.orderAmount ? `₹${orderData.orderAmount}` : undefined,
        });
        await order.save();
        newOrders.push(order);
        console.log(
          `[GmailSync] ✅ Saved order: ${orderData.itemName} (${returnWindowDays}d return)`
        );
      }
    } catch (error: unknown) {
      const err = error as Error;
      console.error(`[GmailSync] Error processing message ${msg.id}:`, err.message);
      // Continue to next message instead of failing the entire batch
    }
  }

  // Update last sync timestamp
  await User.findByIdAndUpdate(userId, { lastGmailSync: new Date() });

  // Send push notification if new items found
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

  console.log(
    `[GmailSync] Sync complete: ${newOrders.length} orders, ${newSubs.length} subscriptions`
  );
  return { orders: newOrders, subscriptions: newSubs };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeParseDate(dateStr: string | null | undefined): Date | undefined {
  if (!dateStr) return undefined;
  try {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? undefined : d;
  } catch {
    return undefined;
  }
}
