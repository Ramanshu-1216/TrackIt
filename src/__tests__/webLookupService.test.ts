/**
 * ============================================================
 * TESTS: Web Lookup Service (webLookupService.ts)
 * ============================================================
 * Mocks: fetch (Jina Reader) + LLM extraction functions.
 * Tests all 3 tiers across all 5 supported marketplaces.
 * ============================================================
 */

import fetchMock from 'jest-fetch-mock';

// ─── Mock LLM Service ────────────────────────────────────────────────────────

const mockExtractReturnPolicyFromPage = jest.fn();
const mockExtractProductUrlFromSearch = jest.fn();

jest.mock('../lib/llmService', () => ({
  extractReturnPolicyFromPage: mockExtractReturnPolicyFromPage,
  extractProductUrlFromSearch: mockExtractProductUrlFromSearch,
}));

import { lookupReturnPolicy } from '../lib/webLookupService';

// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.resetMocks();
  jest.clearAllMocks();
});

// ─── TIER 1: Product URL from email ─────────────────────────────────────────

describe('Tier 1: Product URL from email', () => {
  it('uses Amazon product URL from email to get 10-day return policy', async () => {
    fetchMock.mockResponseOnce('Samsung Galaxy M34 5G product listing on Amazon India. This product is eligible for 10 days Replacement policy. Price: ₹18,999. RAM: 8GB, Storage: 128GB.');
    mockExtractReturnPolicyFromPage.mockResolvedValueOnce(10);

    const days = await lookupReturnPolicy(
      'Samsung Galaxy M34 5G',
      'Amazon',
      ['https://www.amazon.in/dp/B0CTML42S2'],
    );

    expect(days).toBe(10);
    // Should have called Jina with the product URL
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('r.jina.ai'),
      expect.any(Object),
    );
    // Should have called LLM to extract return policy
    expect(mockExtractReturnPolicyFromPage).toHaveBeenCalledWith(
      expect.stringContaining('Samsung Galaxy M34 5G'),
      'Samsung Galaxy M34 5G',
      'Amazon',
    );
  });

  it('uses Flipkart product URL and returns 7-day policy', async () => {
    fetchMock.mockResponseOnce('Nike Air Max 270 Running Shoes Black UK Size 9 on Flipkart. Seller: SuperShoes. 7 Day Return Policy applies. Free delivery available. Warranty: 6 months.');
    mockExtractReturnPolicyFromPage.mockResolvedValueOnce(7);

    const days = await lookupReturnPolicy(
      'Nike Air Max 270',
      'Flipkart',
      ['https://www.flipkart.com/nike-air-max-270-running-shoes/p/itm2b9e8c7cf2b45'],
    );

    expect(days).toBe(7);
  });

  it('uses Myntra product URL and returns 30-day policy', async () => {
    fetchMock.mockResponseOnce('H&M Men Slim Fit Formal Shirt White XL on Myntra. This product is returnable within 30 days of delivery. Rating: 4.3 stars. Free delivery on orders above ₹799.');
    mockExtractReturnPolicyFromPage.mockResolvedValueOnce(30);

    const days = await lookupReturnPolicy(
      'H&M Slim Fit Formal Shirt',
      'Myntra',
      ['https://www.myntra.com/shirts/hm/hm-men-slim-fit/23450678/buy'],
    );

    expect(days).toBe(30);
  });

  it('handles non-returnable item (returns 0)', async () => {
    fetchMock.mockResponseOnce('Customized Printed Kurti Yellow on Meesho. Note: This item is non-returnable and non-exchangeable. Custom products cannot be returned. Please check size chart before ordering.');
    mockExtractReturnPolicyFromPage.mockResolvedValueOnce(0);

    const days = await lookupReturnPolicy(
      'Customized Kurti',
      'Meesho',
      ['https://meesho.com/customized-kurti/p/12345'],
    );

    expect(days).toBe(0);
  });
});

// ─── TIER 2: Search for product page if no URL in email ─────────────────────

describe('Tier 2: Search for product on marketplace', () => {
  it('falls through to Tier 2 when Tier 1 LLM finds no return policy', async () => {
    // Tier 1: product page fetched but LLM finds no policy
    fetchMock.mockResponseOnce('Ajio product listing page for Roadster Slim Fit Jeans. No specific return policy found on this page. Please visit return policy page for details.');
    mockExtractReturnPolicyFromPage.mockResolvedValueOnce(null);

    // Tier 2: search results page
    fetchMock.mockResponseOnce('Ajio search results for Roadster Slim Fit Jeans. Item 1: Roadster Slim Fit Jeans Dark Blue Size 32. https://www.ajio.com/roadster-slim-fit-jeans/p/465423095_darkblue Rating: 4.2 stars.');
    mockExtractProductUrlFromSearch.mockResolvedValueOnce(
      'https://www.ajio.com/roadster-slim-fit-jeans/p/465423095_darkblue',
    );

    // Tier 2: product page
    fetchMock.mockResponseOnce('Roadster Men Slim Fit Jeans Dark Blue Size 32 on Ajio. Exchange policy: 7-day exchange applicable on this product. Material: 98% Cotton 2% Elastane. Rating: 4.2 stars.');
    mockExtractReturnPolicyFromPage.mockResolvedValueOnce(7);

    const days = await lookupReturnPolicy(
      'Roadster Slim Fit Jeans',
      'Ajio',
      ['https://www.ajio.com/some-non-product-link'],
    );

    expect(days).toBe(7);
  });

  it('triggers Tier 2 when no product URLs found in email', async () => {
    // No product URLs from email → skip Tier 1, go to Tier 2
    // Tier 2: search results
    fetchMock.mockResponseOnce('Meesho search results page for Printed Cotton Kurti Yellow. Showing 48 results. Sort by: Relevance. Filter by: Size, Color, Price. Most popular results shown first.');
    mockExtractProductUrlFromSearch.mockResolvedValueOnce(
      'https://meesho.com/printed-cotton-kurti/p/78901',
    );

    // Tier 2: product page
    fetchMock.mockResponseOnce('Printed Cotton Kurti Yellow XL on Meesho. Returnable within 7 days of delivery for non-custom items. Customer rating: 4.1 stars. Ships from: Mumbai warehouse.');
    mockExtractReturnPolicyFromPage.mockResolvedValueOnce(7);

    const days = await lookupReturnPolicy(
      'Printed Cotton Kurti',
      'Meesho',
      [],  // No URLs from email
    );

    expect(days).toBe(7);
    expect(mockExtractProductUrlFromSearch).toHaveBeenCalledWith(
      expect.any(String),
      'Printed Cotton Kurti',
      'Meesho',
    );
  });

  it('falls back when Tier 2 search returns no product URL', async () => {
    // Tier 2: search returns no URL
    fetchMock.mockResponseOnce('Flipkart search results page for Unknown Product. No exact matches found for your search query. Please try with different search terms or browse categories.');
    mockExtractProductUrlFromSearch.mockResolvedValueOnce(null);

    // Falls through to Tier 3 (no fetch calls for Tier 3)
    const days = await lookupReturnPolicy('Unknown Product', 'Flipkart', []);
    // Tier 3 default for Flipkart
    expect(days).toBe(7);
  });
});

// ─── TIER 3: Hardcoded defaults ──────────────────────────────────────────────

describe('Tier 3: Hardcoded defaults', () => {
  const makeAllFail = () => {
    // Jina fails for all calls
    fetchMock.mockReject(new Error('Network error'));
  };

  it('returns 10 for Amazon when all tiers fail', async () => {
    makeAllFail();
    const days = await lookupReturnPolicy('Some Amazon Product', 'Amazon', []);
    expect(days).toBe(10);
  });

  it('returns 7 for Flipkart when all tiers fail', async () => {
    makeAllFail();
    const days = await lookupReturnPolicy('Some Flipkart Product', 'Flipkart', []);
    expect(days).toBe(7);
  });

  it('returns 7 for Myntra when all tiers fail', async () => {
    makeAllFail();
    const days = await lookupReturnPolicy('Some Myntra Product', 'Myntra', []);
    expect(days).toBe(7);
  });

  it('returns 7 for Meesho when all tiers fail', async () => {
    makeAllFail();
    const days = await lookupReturnPolicy('Some Meesho Product', 'Meesho', []);
    expect(days).toBe(7);
  });

  it('returns 7 for Ajio when all tiers fail', async () => {
    makeAllFail();
    const days = await lookupReturnPolicy('Some Ajio Product', 'Ajio', []);
    expect(days).toBe(7);
  });

  it('returns 7 for unknown marketplace', async () => {
    const days = await lookupReturnPolicy('Random Product', 'SomeOtherStore', []);
    expect(days).toBe(7);
  });
});

// ─── Jina Timeout / Failure Handling ─────────────────────────────────────────

describe('Jina Reader failure handling', () => {
  it('gracefully handles Jina timeout and falls back to Tier 3', async () => {
    // First fetch (Tier 1 or 2) times out
    fetchMock.mockAbortOnce();

    const days = await lookupReturnPolicy('Product', 'Myntra', ['https://www.myntra.com/product/123/buy']);
    // Should fall through to Tier 3 default
    expect(days).toBe(7);
  });

  it('gracefully handles non-200 response from Jina', async () => {
    fetchMock.mockResponseOnce('', { status: 403 });

    const days = await lookupReturnPolicy('Product', 'Flipkart', ['https://www.flipkart.com/product/p/abc']);
    expect(days).toBe(7);
  });

  it('gracefully handles empty content from Jina', async () => {
    fetchMock.mockResponseOnce('   ');  // Very short / empty content

    const days = await lookupReturnPolicy('Product', 'Amazon', ['https://www.amazon.in/dp/B000TEST']);
    // Empty content → no policy → falls to Tier 3
    expect(days).toBe(10);
  });
});
