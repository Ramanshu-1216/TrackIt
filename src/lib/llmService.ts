import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractedOrder {
  itemName: string;
  marketplace: string;
  purchaseDate: string;  // ISO date string
  deliveryDate: string | null;
  orderAmount: number | null;
  status: 'Pending' | 'Delivered';
  productUrls: string[];
}

export interface ExtractedSubscription {
  serviceName: string;
  cost: number;
  currency: string;
  billingCycle: 'Monthly' | 'Yearly' | 'Weekly';
  nextRenewalDate: string;  // ISO date string
  status: 'Active';
}

export interface ExtractionResult {
  type: 'order' | 'subscription' | 'none';
  data: ExtractedOrder | ExtractedSubscription | null;
}

// ─── Email Data Extraction ───────────────────────────────────────────────────

const MARKETPLACE_MAP: Record<string, string> = {
  'amazon.in': 'Amazon',
  'amazon.com': 'Amazon',
  'flipkart.com': 'Flipkart',
  'myntra.com': 'Myntra',
  'meesho.com': 'Meesho',
  'ajio.com': 'Ajio',
};

export async function extractDataFromEmail(
  subject: string,
  body: string,
  senderDomain: string,
  emailDate: string,
  productUrls: string[]
): Promise<ExtractionResult> {
  const marketplace = MARKETPLACE_MAP[senderDomain] || 'Other';

  const prompt = `You are an email parser for an Indian e-commerce order tracking app.
Analyze this email from ${marketplace} (${senderDomain}) and determine if it's an order confirmation, delivery update, or subscription invoice.

EMAIL SUBJECT: ${subject}
EMAIL DATE: ${emailDate}
EMAIL BODY (first 6000 chars):
${body.slice(0, 6000)}

RULES:
- If this is an ORDER (purchase confirmation, shipping update, delivery confirmation), return type "order".
- If this is a SUBSCRIPTION (renewal, invoice, membership), return type "subscription".
- If this email is NOT about an order or subscription (e.g. promotional, marketing, OTP, password reset), return type "none".
- For dates, use ISO format (YYYY-MM-DD). If a date is not available, use the email date.
- For status: "Delivered" if email mentions delivery/delivered, otherwise "Pending".
- Extract the main product/item name. Be specific (e.g. "Samsung Galaxy M34 5G" not just "Phone").
- For orderAmount, extract the total price as a number (no currency symbol). Use null if not found.

Respond with ONLY valid JSON, no markdown fences, no explanation:

For orders:
{"type":"order","data":{"itemName":"Product Name","marketplace":"${marketplace}","purchaseDate":"YYYY-MM-DD","deliveryDate":"YYYY-MM-DD or null","orderAmount":999,"status":"Pending or Delivered","productUrls":[]}}

For subscriptions:
{"type":"subscription","data":{"serviceName":"Name","cost":199,"currency":"INR","billingCycle":"Monthly","nextRenewalDate":"YYYY-MM-DD","status":"Active"}}

For irrelevant emails:
{"type":"none","data":null}`;

  try {
    const result = await withRetry(() => model.generateContent(prompt));
    if (!result) return { type: 'none', data: null };

    const text = result.response.text().trim();
    const parsed = parseJsonResponse(text);

    if (parsed && parsed.type && parsed.type !== 'none' && parsed.data) {
      // Inject product URLs extracted from email body if LLM didn't find any
      if (parsed.type === 'order' && parsed.data) {
        const orderData = parsed.data as ExtractedOrder;
        if (!orderData.productUrls || orderData.productUrls.length === 0) {
          orderData.productUrls = productUrls;
        }
        orderData.marketplace = marketplace;
      }
      return parsed as ExtractionResult;
    }

    return { type: 'none', data: null };
  } catch (error) {
    console.error('[LLM] Extraction failed:', error);
    return { type: 'none', data: null };
  }
}

// ─── Return Policy Extraction from Product Page ─────────────────────────────

export async function extractReturnPolicyFromPage(
  pageContent: string,
  productName: string,
  marketplace: string
): Promise<number | null> {
  const prompt = `You are extracting the return policy from a product page on ${marketplace}.

Product: ${productName}

PAGE CONTENT (first 8000 chars):
${pageContent.slice(0, 8000)}

Find the return/exchange/replacement window for this specific product.
Look for phrases like "X day return", "X day replacement", "return within X days", "returnable till", etc.

Respond with ONLY a single integer (the number of days). Examples:
- "7 day replacement" → 7
- "10 days return" → 10
- "30 day return" → 30
- "No return" or "Non-returnable" → 0
- If not found → -1`;

  try {
    const result = await withRetry(() => model.generateContent(prompt));
    if (!result) return null;

    const text = result.response.text().trim();
    const days = parseInt(text);
    if (isNaN(days) || days === -1) return null;
    return days;
  } catch (error) {
    console.error('[LLM] Return policy extraction failed:', error);
    return null;
  }
}

// ─── Product URL Extraction from Search Results ─────────────────────────────

export async function extractProductUrlFromSearch(
  searchContent: string,
  productName: string,
  marketplace: string
): Promise<string | null> {
  const prompt = `You are looking at search results from ${marketplace} for the product: "${productName}".

PAGE CONTENT (first 6000 chars):
${searchContent.slice(0, 6000)}

Find the URL of the FIRST product listing that matches or is closest to "${productName}".
The URL should be a full product page URL (not a search/category URL).

For Amazon: look for URLs containing "/dp/" or "/gp/product/"
For Flipkart: look for URLs containing "/p/"
For Myntra: look for URLs with product IDs
For Meesho: look for URLs with product paths
For Ajio: look for URLs with product paths

Respond with ONLY the full URL string. If no matching product found, respond with "null".`;

  try {
    const result = await withRetry(() => model.generateContent(prompt));
    if (!result) return null;

    const text = result.response.text().trim();
    if (text === 'null' || text.length < 10) return null;
    // Clean up any surrounding quotes
    return text.replace(/^["']|["']$/g, '');
  } catch (error) {
    console.error('[LLM] Product URL extraction failed:', error);
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 5,
  delay = 5000
): Promise<T | null> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const isQuotaError = status === 429;
      const isRetryable = isQuotaError || status === 500 || status === 503;
      
      if (isRetryable && i < retries - 1) {
        // For free tier 429s, we need to be very patient (usually 30-60s)
        const waitTime = isQuotaError ? 35000 : delay; 
        console.warn(`[LLM] ${isQuotaError ? 'Quota exceeded' : 'Internal error'}, waiting ${waitTime/1000}s... (Attempt ${i + 1}/${retries})`);
        
        await new Promise(resolve => setTimeout(resolve, waitTime));
        delay *= 2; 
        continue;
      }
      throw error;
    }
  }
  return null;
}

function parseJsonResponse(text: string): ExtractionResult | null {
  // Try direct parse first
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from markdown fences or surrounding text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        console.error('[LLM] Failed to parse extracted JSON:', jsonMatch[0].slice(0, 200));
      }
    }
  }
  return null;
}
