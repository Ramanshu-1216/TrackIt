import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ExtractedOrder {
  itemName: string;
  productId?: string; // String (optional: look for ASIN like B0..., or FSN, or specific product code in the email. null if not found)
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
{"type":"order","data":{"itemName":"Product Name","productId":"B01234567","marketplace":"${marketplace}","purchaseDate":"YYYY-MM-DD","deliveryDate":"YYYY-MM-DD or null","orderAmount":999,"status":"Pending or Delivered","productUrls":[]}}

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

export interface ReturnPolicyResult {
  returnWindowDays: number | null;
  returnable: boolean;
  replaceable: boolean;
  returnPolicyDetails: string;
}

export async function extractReturnPolicyFromPage(
  pageContent: string,
  productName: string,
  marketplace: string
): Promise<ReturnPolicyResult | null> {
  const prompt = `You are a product return policy expert. I will provide you with the content of a product page (usually a few high-signal HTML fragments or markdown) for a product named "${productName}" on ${marketplace}.
  
EXTRACTED PAGE CONTENT:
${pageContent.slice(0, 30000)}

Your goal is to extract the return/replacement policy details.
Specifically for Amazon, look for:
- "10 days Replacement"
- "Non-Returnable"
- "Returnable"
- Reasons like "Damaged, Defective, Wrong or Missing"
- Instructions on keeping original packaging.

Respond with ONLY a JSON object in this format:
{
  "returnWindowDays": number | null (e.g., 7 or 10, null if not found),
  "returnable": boolean,
  "replaceable": boolean,
  "returnPolicyDetails": "A concise summary of the policy (e.g., '10 days Replacement only for damaged/defective items. Non-refundable.')"
}`;

  try {
    const result = await withRetry(() => model.generateContent(prompt));
    if (!result) return null;

    const text = result.response.text().trim();
    // Try to parse the JSON
    try {
      // Clean up markdown block if LLM included it despite instructions
      const cleanText = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
      const parsed = JSON.parse(cleanText) as ReturnPolicyResult;
      
      return {
        returnWindowDays: typeof parsed.returnWindowDays === 'number' ? parsed.returnWindowDays : null,
        returnable: !!parsed.returnable,
        replaceable: !!parsed.replaceable,
        returnPolicyDetails: parsed.returnPolicyDetails || 'No details provided.',
      };
    } catch(e) {
      console.error('[LLM] Failed to parse return policy JSON:', text);
      return null;
    }
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

PAGE CONTENT (first 20000 chars):
${searchContent.slice(0, 20000)}

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
