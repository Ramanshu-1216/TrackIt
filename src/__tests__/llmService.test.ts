/**
 * ============================================================
 * TESTS: LLM Service (llmService.ts)
 * ============================================================
 * Mocks the Gemini API. Tests verify that the prompt logic,
 * JSON parsing, and field mapping all work correctly.
 * ============================================================
 */

import {
  AMAZON_ORDER_EMAIL,
  FLIPKART_ORDER_EMAIL,
  MYNTRA_ORDER_EMAIL,
  MEESHO_ORDER_EMAIL,
  AJIO_ORDER_EMAIL,
  NETFLIX_SUBSCRIPTION_EMAIL,
  PROMO_EMAIL,
} from './fixtures/emails';

// ─── Mock Gemini API ─────────────────────────────────────────────────────────

const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

// Helper to make Gemini return a given JSON string
function mockGeminiResponse(jsonString: string) {
  mockGenerateContent.mockResolvedValueOnce({
    response: {
      text: () => jsonString,
    },
  });
}

// ─── Import after mocks ──────────────────────────────────────────────────────
// Must import AFTER setting up mocks
import {
  extractDataFromEmail,
  extractReturnPolicyFromPage,
  extractProductUrlFromSearch,
  ExtractedOrder,
  ExtractedSubscription,
} from '../lib/llmService';

// ─────────────────────────────────────────────────────────────────────────────

describe('extractDataFromEmail — Order Extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('correctly identifies an Amazon order', async () => {
    mockGeminiResponse(JSON.stringify({
      type: 'order',
      data: {
        itemName: 'Samsung Galaxy M34 5G',
        marketplace: 'Amazon',
        purchaseDate: '2025-03-04',
        deliveryDate: '2025-03-08',
        orderAmount: 18999,
        status: 'Pending',
        productUrls: ['https://www.amazon.in/dp/B0CTML42S2'],
      },
    }));

    const result = await extractDataFromEmail(
      AMAZON_ORDER_EMAIL.subject,
      AMAZON_ORDER_EMAIL.body,
      AMAZON_ORDER_EMAIL.senderDomain,
      AMAZON_ORDER_EMAIL.date,
      AMAZON_ORDER_EMAIL.productUrls,
    );

    expect(result.type).toBe('order');
    const data = result.data as ExtractedOrder;
    expect(data.itemName).toBe('Samsung Galaxy M34 5G');
    expect(data.marketplace).toBe('Amazon');
    expect(data.purchaseDate).toBe('2025-03-04');
    expect(data.orderAmount).toBe(18999);
    expect(data.status).toBe('Pending');
    expect(data.productUrls).toContain('https://www.amazon.in/dp/B0CTML42S2');
  });

  it('correctly identifies a Flipkart order', async () => {
    mockGeminiResponse(JSON.stringify({
      type: 'order',
      data: {
        itemName: 'Nike Air Max 270',
        marketplace: 'Flipkart',
        purchaseDate: '2025-03-04',
        deliveryDate: '2025-03-07',
        orderAmount: 7495,
        status: 'Pending',
        productUrls: ['https://www.flipkart.com/nike-air-max-270-running-shoes/p/itm2b9e8c7cf2b45'],
      },
    }));

    const result = await extractDataFromEmail(
      FLIPKART_ORDER_EMAIL.subject,
      FLIPKART_ORDER_EMAIL.body,
      FLIPKART_ORDER_EMAIL.senderDomain,
      FLIPKART_ORDER_EMAIL.date,
      FLIPKART_ORDER_EMAIL.productUrls,
    );

    expect(result.type).toBe('order');
    const data = result.data as ExtractedOrder;
    expect(data.itemName).toBe('Nike Air Max 270');
    expect(data.marketplace).toBe('Flipkart');
    expect(data.orderAmount).toBe(7495);
  });

  it('injects email-extracted URLs if LLM returns empty productUrls', async () => {
    mockGeminiResponse(JSON.stringify({
      type: 'order',
      data: {
        itemName: 'Printed Cotton Kurti',
        marketplace: 'Meesho',
        purchaseDate: '2025-03-04',
        deliveryDate: null,
        orderAmount: 798,
        status: 'Pending',
        productUrls: [],  // LLM found no URLs
      },
    }));

    const emailUrls = ['https://meesho.com/printed-cotton-kurti/p/12345'];
    const result = await extractDataFromEmail(
      MEESHO_ORDER_EMAIL.subject,
      MEESHO_ORDER_EMAIL.body,
      MEESHO_ORDER_EMAIL.senderDomain,
      MEESHO_ORDER_EMAIL.date,
      emailUrls,
    );

    expect(result.type).toBe('order');
    const data = result.data as ExtractedOrder;
    // Should have been filled in by service
    expect(data.productUrls).toContain('https://meesho.com/printed-cotton-kurti/p/12345');
  });

  it('handles delivery confirmation correctly (status: Delivered)', async () => {
    mockGeminiResponse(JSON.stringify({
      type: 'order',
      data: {
        itemName: 'Samsung Galaxy M34 5G',
        marketplace: 'Amazon',
        purchaseDate: '2025-03-04',
        deliveryDate: '2025-03-07',
        orderAmount: 18999,
        status: 'Delivered',
        productUrls: [],
      },
    }));

    const result = await extractDataFromEmail(
      'Delivered: Samsung Galaxy M34 5G',
      'Your package has been delivered!',
      'amazon.in',
      'Fri, 07 Mar 2025 14:15:00 +0530',
      [],
    );

    expect(result.type).toBe('order');
    const data = result.data as ExtractedOrder;
    expect(data.status).toBe('Delivered');
  });

  it('returns type "none" for promotional emails', async () => {
    mockGeminiResponse(JSON.stringify({
      type: 'none',
      data: null,
    }));

    const result = await extractDataFromEmail(
      PROMO_EMAIL.subject,
      PROMO_EMAIL.body,
      PROMO_EMAIL.senderDomain,
      PROMO_EMAIL.date,
      PROMO_EMAIL.productUrls,
    );

    expect(result.type).toBe('none');
    expect(result.data).toBeNull();
  });

  it('verifies marketplace is overridden from sender domain even if LLM gives wrong one', async () => {
    mockGeminiResponse(JSON.stringify({
      type: 'order',
      data: {
        itemName: 'Roadster Slim Fit Jeans',
        marketplace: 'Unknown',  // LLM gave wrong marketplace
        purchaseDate: '2025-03-04',
        deliveryDate: null,
        orderAmount: 2799,
        status: 'Pending',
        productUrls: [],
      },
    }));

    const result = await extractDataFromEmail(
      AJIO_ORDER_EMAIL.subject,
      AJIO_ORDER_EMAIL.body,
      AJIO_ORDER_EMAIL.senderDomain,  // 'ajio.com'
      AJIO_ORDER_EMAIL.date,
      AJIO_ORDER_EMAIL.productUrls,
    );

    expect(result.type).toBe('order');
    const data = result.data as ExtractedOrder;
    // Should have been replaced with Ajio (from MARKETPLACE_MAP)
    expect(data.marketplace).toBe('Ajio');
  });

  it('handles malformed JSON from LLM by returning type none', async () => {
    // Gemini sometimes wraps with markdown fences
    mockGeminiResponse('```json\n{ broken json here\n```');

    const result = await extractDataFromEmail(
      'Some subject',
      'Some body',
      'amazon.in',
      new Date().toISOString(),
      [],
    );

    expect(result.type).toBe('none');
  });

  it('handles markdown-wrapped JSON from LLM', async () => {
    // Valid JSON wrapped in markdown
    const json = JSON.stringify({
      type: 'order',
      data: {
        itemName: 'H&M Slim Fit Formal Shirt',
        marketplace: 'Myntra',
        purchaseDate: '2025-03-04',
        deliveryDate: '2025-03-08',
        orderAmount: 1299,
        status: 'Pending',
        productUrls: [],
      },
    });
    mockGeminiResponse('```json\n' + json + '\n```');

    const result = await extractDataFromEmail(
      MYNTRA_ORDER_EMAIL.subject,
      MYNTRA_ORDER_EMAIL.body,
      MYNTRA_ORDER_EMAIL.senderDomain,
      MYNTRA_ORDER_EMAIL.date,
      [],
    );

    expect(result.type).toBe('order');
    const data = result.data as ExtractedOrder;
    expect(data.itemName).toBe('H&M Slim Fit Formal Shirt');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('extractDataFromEmail — Subscription Extraction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('correctly identifies a Netflix subscription renewal', async () => {
    mockGeminiResponse(JSON.stringify({
      type: 'subscription',
      data: {
        serviceName: 'Netflix Mobile Plan',
        cost: 149,
        currency: 'INR',
        billingCycle: 'Monthly',
        nextRenewalDate: '2025-04-04',
        status: 'Active',
      },
    }));

    const result = await extractDataFromEmail(
      NETFLIX_SUBSCRIPTION_EMAIL.subject,
      NETFLIX_SUBSCRIPTION_EMAIL.body,
      NETFLIX_SUBSCRIPTION_EMAIL.senderDomain,
      NETFLIX_SUBSCRIPTION_EMAIL.date,
      [],
    );

    expect(result.type).toBe('subscription');
    const data = result.data as ExtractedSubscription;
    expect(data.serviceName).toBe('Netflix Mobile Plan');
    expect(data.cost).toBe(149);
    expect(data.currency).toBe('INR');
    expect(data.billingCycle).toBe('Monthly');
    expect(data.nextRenewalDate).toBe('2025-04-04');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('extractReturnPolicyFromPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts "10 day return" from Amazon product page', async () => {
    mockGeminiResponse('10');

    const pageContent = `
      Samsung Galaxy M34 5G
      ✓ 10 days Replacement
      ✓ Free delivery
      
      Returnable: Return and exchange eligible within 10 days of delivery.
    `;

    const days = await extractReturnPolicyFromPage(pageContent, 'Samsung Galaxy M34 5G', 'Amazon');
    expect(days).toBe(10);
  });

  it('extracts "7 day return" from Flipkart product page', async () => {
    mockGeminiResponse('7');

    const pageContent = `
      Nike Air Max 270 - Black
      7 Day Return Policy
      Seller: SuperShoes
    `;

    const days = await extractReturnPolicyFromPage(pageContent, 'Nike Air Max 270', 'Flipkart');
    expect(days).toBe(7);
  });

  it('returns 0 for non-returnable items', async () => {
    mockGeminiResponse('0');

    const pageContent = `
      Product: Custom Printed T-Shirt
      Note: This item is non-returnable.
    `;

    const days = await extractReturnPolicyFromPage(pageContent, 'Custom Printed T-Shirt', 'Flipkart');
    expect(days).toBe(0);
  });

  it('returns null if return policy not found on page', async () => {
    mockGeminiResponse('-1');

    const pageContent = 'Product description here. No return policy mentioned.';
    const days = await extractReturnPolicyFromPage(pageContent, 'Some Product', 'Amazon');
    expect(days).toBeNull();
  });

  it('returns null if LLM response is not a valid number', async () => {
    mockGeminiResponse('Not found');

    const days = await extractReturnPolicyFromPage('page content', 'Product', 'Myntra');
    expect(days).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('extractProductUrlFromSearch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('extracts Amazon product URL from search results', async () => {
    mockGeminiResponse('https://www.amazon.in/Samsung-Galaxy-M34-Storage-Midnight/dp/B0CTML42S2');

    const searchContent = `
      Amazon Search Results for "Samsung Galaxy M34 5G"
      
      1. Samsung Galaxy M34 5G (Blue, 8GB+128GB)
      Price: ₹18,999
      Link: https://www.amazon.in/Samsung-Galaxy-M34-Storage-Midnight/dp/B0CTML42S2
      Rating: 4.2/5
      
      2. Samsung Galaxy M34 5G (Midnight Blue, 6GB+128GB)
      Price: ₹16,999
      Link: https://www.amazon.in/Samsung-Galaxy/dp/B0CTM99ABC
    `;

    const url = await extractProductUrlFromSearch(searchContent, 'Samsung Galaxy M34 5G', 'Amazon');
    expect(url).toBe('https://www.amazon.in/Samsung-Galaxy-M34-Storage-Midnight/dp/B0CTML42S2');
  });

  it('extracts Flipkart product URL from search results', async () => {
    mockGeminiResponse('https://www.flipkart.com/nike-air-max-270/p/itm2b9e8c7cf2b45');

    const searchContent = `
      Flipkart Search: Nike Air Max 270
      Nike Air Max 270 Running Shoes - Black
      ₹7,495
      https://www.flipkart.com/nike-air-max-270/p/itm2b9e8c7cf2b45
    `;

    const url = await extractProductUrlFromSearch(searchContent, 'Nike Air Max 270', 'Flipkart');
    expect(url).toBe('https://www.flipkart.com/nike-air-max-270/p/itm2b9e8c7cf2b45');
  });

  it('returns null when no matching product found', async () => {
    mockGeminiResponse('null');

    const url = await extractProductUrlFromSearch('No results found', 'Nonexistent Product', 'Myntra');
    expect(url).toBeNull();
  });

  it('strips surrounding quotes from extracted URL', async () => {
    mockGeminiResponse('"https://www.amazon.in/dp/B0CTML42S2"');

    const url = await extractProductUrlFromSearch('search content', 'product', 'Amazon');
    expect(url).toBe('https://www.amazon.in/dp/B0CTML42S2');
    expect(url).not.toContain('"');
  });
});
