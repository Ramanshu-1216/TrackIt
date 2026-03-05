import { google } from 'googleapis';
import { oauth2Client } from './googleAuth';
import Order from '@/models/Order';
import Subscription from '@/models/Subscription';
import User from '@/models/User';
import dbConnect from './dbConnect';
import mongoose from 'mongoose';
import { sendPushNotification } from './notificationService';
import { extractDataFromEmail, ExtractedOrder, ExtractedSubscription } from './llmService';
import { lookupReturnPolicy } from './webLookupService';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

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
  const fromClause = ECOMMERCE_DOMAINS.map(d => d).join(' OR ');
  let query = `from:(${fromClause})`;

  // TEMPORARY: For verification, force scan from yesterday evening (Mar 4th 6 PM IST)
  // Unix timestamp for 2026-03-04 12:30:00 UTC
  const testTimestamp = 1772584200; 
  console.log(`[GmailSync] TEST MODE: Scanning emails since 2026-03-04 18:00 IST (after:${testTimestamp})`);
  query += ` after:${testTimestamp}`;

  return query;
}

// ─── Email Body Decoder ──────────────────────────────────────────────────────

interface DecodedEmail {
  text: string;
  html: string;
}

/**
 * Recursively extract text content from Gmail message payload.
 */
function extractEmailBody(payload: any): DecodedEmail {
  let text = '';
  let html = '';

  if (payload.body?.data) {
    const decoded = decodeBase64Url(payload.body.data);
    if (payload.mimeType === 'text/plain') {
      text = decoded;
    } else if (payload.mimeType === 'text/html') {
      html = decoded;
    }
  }

  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        text += decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        html += decodeBase64Url(part.body.data);
      } else if (part.mimeType?.startsWith('multipart/') && part.parts) {
        const nested = extractEmailBody(part);
        text += nested.text;
        html += nested.html;
      }
    }
  }

  return { text, html };
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
  // First extract all href URLs and append them so they aren't lost when tags are stripped
  const hrefs: string[] = [];
  const hrefRegex = /href=["'](https?:\/\/[^"'>]+)["']/gi;
  let match;
  while ((match = hrefRegex.exec(html)) !== null) {
    hrefs.push(match[1]);
  }

  const baseStripped = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    // Replace structural tags with newlines
    .replace(/<\/?(div|p|br|tr|td|li|h[1-6])[^>]*>/gi, '\n')
    // Remove all other tags
    .replace(/<[^>]+>/g, '')
    // Decode basic HTML entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    // Clean up whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
    
  // Append the preserved hrefs to the very end of the text
  if (hrefs.length > 0) {
    return baseStripped + '\n\n--- Preserved Links ---\n' + hrefs.join('\n');
  }
  
  return baseStripped;
}

/**
 * Extract all URLs from email body text/html
 */
function extractUrls(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s"'<>\])]+/gi;
  const matches = text.match(urlPattern) || [];
  // Deduplicate and clean trailing punctuation
  const cleaned = matches.map(url =>
    url.replace(/[.,;:!?)}\]]+$/, '')
  );
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

// ─── Amazon Specific Parsing ─────────────────────────────────────────────────

interface AmazonParsedProduct {
  asin: string;
  title: string;
  url: string;
}

interface AmazonParsedEmail {
  orderId: string | null;
  status: 'Pending' | 'Shipped' | 'Delivered' | 'Returned';
  products: AmazonParsedProduct[];
}

function parseAmazonOrderEmail(html: string, subject: string): AmazonParsedEmail {
  const $ = cheerio.load(html);
  
  // 1. Extract Order ID
  const text = $('body').text().replace(/\s+/g, ' ');
  // Amazon sometimes inserts hidden RTL characters (e.g. U+202B) before the ID.
  // We use a broader search and then clean the result.
  const orderIdMatch = text.match(/Order\s*(?:#|ID|id)[:\s]*[^\d]*([0-9]{3}-[0-9]{7}-[0-9]{7})/i);
  let orderId = orderIdMatch ? orderIdMatch[1] : null;

  // Cleanup: ensure no hidden characters are in the ID
  if (orderId) {
    orderId = orderId.replace(/[^\d-]/g, '');
  }

  // 2. Identify Status from Subject
  let status: 'Pending' | 'Shipped' | 'Delivered' | 'Returned' = 'Pending';
  const subjectLower = subject.toLowerCase();
  if (subjectLower.includes('delivered')) status = 'Delivered';
  else if (subjectLower.includes('shipped') || subjectLower.includes('dispatched') || subjectLower.includes('out for delivery')) status = 'Shipped';
  else if (subjectLower.includes('refund') || subjectLower.includes('return') || subjectLower.includes('replacement')) status = 'Returned';

  // 3. Cut off recommendations
  const htmlString = $.html();
  const boundaryIndex = htmlString.indexOf('Keep shopping for');
  const validHtml = boundaryIndex !== -1 ? htmlString.slice(0, boundaryIndex) : htmlString;
  const $valid = cheerio.load(validHtml);

  // 4. Extract ASINs and Titles
  const products: AmazonParsedProduct[] = [];
  const seenAsins = new Set<string>();

  $valid('a[href]').each((_, el) => {
    const href = $valid(el).attr('href') || '';
    
    // Decode 'U=' parameter if it's a tracking link
    let targetUrl = href;
    try {
      if (href.includes('U=')) {
        const uMatch = href.match(/U=([^&]+)/);
        if (uMatch) targetUrl = decodeURIComponent(uMatch[1]);
      }
    } catch(e) {}

    // Extract ASIN: /dp/B0F19GZXB1 or /gp/product/B0F19GZXB1
    const asinMatch = targetUrl.match(/\/(?:dp|product)\/([A-Z0-9]{10})/i);
    if (asinMatch) {
      const asin = asinMatch[1];
      if (!seenAsins.has(asin)) {
        seenAsins.add(asin);
        
        // Try to get title from child img alt or the anchor text itself
        let title = $valid(el).find('img').attr('alt') || $valid(el).text().trim();
        // Fallback: If title is empty or generic
        if (!title || title.length < 5 || title.includes('amazon.in')) {
            title = 'Amazon Purchase';
        }
        
        // Build Canonical URL
        const canonicalUrl = `https://www.amazon.in/dp/${asin}?th=1`;
        
        products.push({ asin, title, url: canonicalUrl });
      }
    }
  });

  return { orderId, status, products };
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

  // Auto-refresh tokens and persist to DB
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

  const newOrders: any[] = [];
  const newSubs: any[] = [];

  for (const msg of messages) {
    try {
      // Fetch headers first to check sender domain
      const fullMsgHeaders = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
      });
      const senderHeader = fullMsgHeaders.data.payload?.headers?.find(h => h.name === 'From')?.value || '';
      const domain = extractSenderDomain(senderHeader);
      const isAmazon = domain === 'amazon.in' || domain === 'amazon.com';

      // Skip already processed messages
      // For Amazon, we rely on Order ID + ASIN for deduplication, but we still shouldn't
      // re-process the EXACT SAME gmailMessageId if it's already linked to ANY order.
      const existingMsgOrder = await Order.findOne({ gmailMessageId: msg.id, userId });
      const existingSub = await Subscription.findOne({
        notes: { $regex: msg.id! },
        userId,
      });

      if (existingMsgOrder || existingSub) {
        console.log(`[GmailSync] Skipping already processed message: ${msg.id}`);
        continue;
      }

      // Fetch full message if not skipped
      const fullMsg = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'full',
      });

      const payload = fullMsg.data.payload;
      if (!payload) continue;

      // Extract headers
      const headers = payload.headers || [];
      const subject = headers.find(h => h.name === 'Subject')?.value || '';
      const fromHeader = headers.find(h => h.name === 'From')?.value || '';
      const dateHeader = headers.find(h => h.name === 'Date')?.value || '';
      const senderDomain = extractSenderDomain(fromHeader);

      // Verify sender is from an e-commerce domain
      const isEcommerce = ECOMMERCE_DOMAINS.some(d => senderDomain.includes(d));
      if (!isEcommerce) {
        console.log(`[GmailSync] Skipping non-ecommerce sender: ${senderDomain}`);
        continue;
      }

      console.log(`[GmailSync] Processing: "${subject}" from ${senderDomain}`);

      // Decode full email body
      const decoded = extractEmailBody(payload);
      
      // Debug: Save HTML to file for user to inspect
      if (decoded.html) {
        try {
          const debugDir = path.join(process.cwd(), 'debug_emails');
          if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
          const safeSubject = subject.replace(/[^a-z0-9]/gi, '_').toLowerCase().slice(0, 50);
          const filename = `${msg.id}_${safeSubject}.html`;
          fs.writeFileSync(path.join(debugDir, filename), decoded.html);
          console.log(`[GmailSync] Saved debug HTML: debug_emails/${filename}`);
        } catch (err) {
          console.error('[GmailSync] Failed to save debug HTML:', err);
        }
      }

      // Combine text and stripped HTML to ensure no links are missed
      // stripHtml will also append any hrefs it finds.
      const body = (decoded.text + '\n' + stripHtml(decoded.html)).trim();
      
      if (!body) {
        console.log(`[GmailSync] Empty body for message ${msg.id}, skipping`);
        continue;
      }

      // ─── Native Amazon Parsing (Bypass LLM) ─────────────────────────────────
      if (senderDomain === 'amazon.in' || senderDomain === 'amazon.com') {
        const parsed = parseAmazonOrderEmail(decoded.html, subject);
        if (parsed.orderId && parsed.products.length > 0) {
          for (const prod of parsed.products) {
            const existing = await Order.findOne({
              userId: new mongoose.Types.ObjectId(userId),
              marketplace: 'Amazon',
              orderId: parsed.orderId,
              productId: prod.asin,
            });

            if (existing) {
              console.log(`[GmailSync] Existing order ${parsed.orderId}_${prod.asin}. Checking status update: ${parsed.status}`);
              
              // Define status precedence
              const statusOrder = ['Pending', 'Shipped', 'Out for delivery', 'Delivered', 'Returned'];
              const currentWeight = statusOrder.indexOf(existing.status as string);
              const newWeight = statusOrder.indexOf(parsed.status);

              // Only update if it moves forward or if it's 'Returned' (which is terminal/special)
              if (newWeight > currentWeight || (parsed.status === 'Returned' && existing.status !== 'Returned')) {
                existing.status = parsed.status;
                if (parsed.status === 'Delivered' && !existing.deliveryDate) {
                  const dDate = safeParseDate(dateHeader);
                  existing.deliveryDate = dDate || new Date();
                }
                await existing.save();
                console.log(`[GmailSync] Updated status to: ${parsed.status}`);
              } else {
                console.log(`[GmailSync] Ignoring status update (current: ${existing.status}, new: ${parsed.status})`);
              }
              continue; // Skip creating a new one
            }

            // Small delay for rate limits
            if (newOrders.length > 0) await new Promise(r => setTimeout(r, 2000));

            console.log(`[GmailSync] New Amazon item: ${prod.asin}. Scraping policy...`);
            const policy = await lookupReturnPolicy(
              prod.title,
              'Amazon',
              [prod.url],
              prod.asin
            );

            const order = new Order({
              userId: new mongoose.Types.ObjectId(userId),
              orderId: parsed.orderId,
              itemName: prod.title,
              productId: prod.asin,
              marketplace: 'Amazon',
              purchaseDate: safeParseDate(dateHeader) || new Date(),
              status: parsed.status,
              gmailMessageId: msg.id,
              productUrl: prod.url,
              returnWindowDays: policy?.returnWindowDays ?? null,
              returnable: policy?.returnable ?? false,
              replaceable: policy?.replaceable ?? false,
              returnPolicyDetails: policy?.returnPolicyDetails ?? '',
            });
            await order.save();
            newOrders.push(order);
            console.log(`[GmailSync] ✅ Saved Amazon order: ${prod.title} (${policy?.returnWindowDays ?? 'No'}d return)`);
          }
          // Do not fall back to LLM for this Amazon email
          continue; 
        }
        console.log('[GmailSync] Amazon email did not match order pattern, trying LLM fallback...');
      }

      // ─── Rate Limiting for Free Tier ───────────────────────────────────────
      // Wait 5 seconds between each message to avoid hitting Gemini 15 RPM limit
      if (newOrders.length > 0 || newSubs.length > 0) {
        console.log('[GmailSync] Rate-limiting pause (5s)...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }

      // Extract URLs from email body
      const emailUrls = extractUrls(body);
      console.log(`[GmailSync] Found ${emailUrls.length} URLs in email body:`);
      emailUrls.forEach(u => console.log(`  -> ${u}`));

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
        // Wait briefly before making Jina/web requests
        await new Promise(resolve => setTimeout(resolve, 2000));
        const policy = await lookupReturnPolicy(
          orderData.itemName,
          orderData.marketplace,
          orderData.productUrls || [],
          orderData.productId // Pass productId to lookup function
        );

        // Parse dates safely
        const purchaseDate = safeParseDate(orderData.purchaseDate) || new Date(dateHeader) || new Date();
        const deliveryDate = orderData.deliveryDate ? safeParseDate(orderData.deliveryDate) : undefined;

        const order = new Order({
          userId: new mongoose.Types.ObjectId(userId),
          itemName: orderData.itemName,
          productId: orderData.productId, // Pass productId to DB
          marketplace: orderData.marketplace,
          purchaseDate,
          deliveryDate,
          returnWindowDays: policy?.returnWindowDays ?? null,
          returnable: policy?.returnable ?? false,
          replaceable: policy?.replaceable ?? false,
          returnPolicyDetails: policy?.returnPolicyDetails ?? '',
          status: orderData.status || 'Pending',
          gmailMessageId: msg.id,
          notes: orderData.orderAmount ? `₹${orderData.orderAmount}` : undefined,
        });
        await order.save();
        newOrders.push(order);
        console.log(`[GmailSync] ✅ Saved order: ${orderData.itemName} (${policy?.returnWindowDays ?? 'No'}d return)`);
      }
    } catch (error: any) {
      console.error(`[GmailSync] Error processing message ${msg.id}:`, error.message);
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

  console.log(`[GmailSync] Sync complete: ${newOrders.length} orders, ${newSubs.length} subscriptions`);
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
