import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

export interface ExtractedData {
  type: 'order' | 'subscription' | 'none';
  data?: any;
  needsWebLookup?: boolean;
  productUrl?: string;
  marketplace?: string;
}

export async function extractDataFromEmail(subject: string, body: string): Promise<ExtractedData> {
  const prompt = `
    Analyze the following email subject and content to determine if it is an order confirmation, a delivery update, or a subscription renewal/invoice.
    
    Subject: ${subject}
    Content: ${body}
    
    If it is an Order:
    - Extract: itemName, marketplace (Amazon, Flipkart, etc.), purchaseDate, status (Pending/Delivered), productUrl (if any).
    - If the return window/policy is NOT mentioned, set "needsWebLookup" to true.
    
    If it is a Subscription:
    - Extract: serviceName, cost, currency, billingCycle (Monthly/Yearly), nextRenewalDate, status (Active).
    
    Return the result ONLY as a JSON object in this format:
    {
      "type": "order" | "subscription" | "none",
      "data": { ...extracted fields... },
      "needsWebLookup": boolean,
      "productUrl": "string",
      "marketplace": "string"
    }
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    
    // Extract JSON from potentially markdown-wrapped response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error('[Gemini] Extraction failed:', error);
  }

  return { type: 'none' };
}

export async function extractReturnPolicyFromText(text: string): Promise<number | null> {
  const prompt = `
    Analyze the following text from a product or policy page and find the "return window" (number of days allowed for returns/replacements).
    
    Content: ${text.slice(0, 10000)} // Truncate to avoid too many tokens
    
    Return ONLY the number of days as a single integer. If not found or if it says "non-returnable", return 0.
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const daysText = response.text().trim();
    const days = parseInt(daysText);
    return isNaN(days) ? null : days;
  } catch (error) {
    console.error('[Gemini] Policy extraction failed:', error);
    return null;
  }
}
