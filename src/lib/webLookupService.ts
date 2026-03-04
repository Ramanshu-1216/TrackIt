import {
  extractReturnPolicyFromPage,
  extractProductUrlFromSearch,
} from './llmService';

// ─── Marketplace Configuration ───────────────────────────────────────────────

interface MarketplaceConfig {
  searchUrlBuilder: (productName: string) => string;
  productUrlPattern: RegExp;   // Pattern to identify product page URLs in email body
  defaultReturnDays: number;
}

const MARKETPLACE_CONFIGS: Record<string, MarketplaceConfig> = {
  Amazon: {
    searchUrlBuilder: (name) =>
      `https://www.amazon.in/s?k=${encodeURIComponent(name)}`,
    productUrlPattern: /https?:\/\/(?:www\.)?amazon\.in\/(?:[^\/]+\/)?(?:dp|gp\/product)\/[A-Z0-9]{10}/gi,
    defaultReturnDays: 10,
  },
  Flipkart: {
    searchUrlBuilder: (name) =>
      `https://www.flipkart.com/search?q=${encodeURIComponent(name)}`,
    productUrlPattern: /https?:\/\/(?:www\.)?flipkart\.com\/[^\s"'<>]+\/p\/[^\s"'<>]+/gi,
    defaultReturnDays: 7,
  },
  Myntra: {
    searchUrlBuilder: (name) =>
      `https://www.myntra.com/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}`,
    productUrlPattern: /https?:\/\/(?:www\.)?myntra\.com\/[^\s"'<>]+\/\d+(?:\/buy)?/gi,
    defaultReturnDays: 7,
  },
  Meesho: {
    searchUrlBuilder: (name) =>
      `https://meesho.com/search?q=${encodeURIComponent(name)}`,
    productUrlPattern: /https?:\/\/(?:www\.)?meesho\.com\/[^\s"'<>]+\/p\/[^\s"'<>]+/gi,
    defaultReturnDays: 7,
  },
  Ajio: {
    searchUrlBuilder: (name) =>
      `https://www.ajio.com/search/?text=${encodeURIComponent(name)}`,
    productUrlPattern: /https?:\/\/(?:www\.)?ajio\.com\/[^\s"'<>]+\/p\/[^\s"'<>]+/gi,
    defaultReturnDays: 7,
  },
};

// ─── Main Lookup Function ────────────────────────────────────────────────────

export async function lookupReturnPolicy(
  productName: string,
  marketplace: string,
  productUrlsFromEmail: string[]
): Promise<number> {
  const config = MARKETPLACE_CONFIGS[marketplace];
  if (!config) {
    console.log(`[WebLookup] Unknown marketplace "${marketplace}", using default 7 days`);
    return 7;
  }

  console.log(`[WebLookup] Looking up return policy for "${productName}" on ${marketplace}`);

  // ── Tier 1: Use product URLs extracted from email body ──────────────────
  const relevantUrls = filterRelevantUrls(productUrlsFromEmail, marketplace, config);
  
  for (const url of relevantUrls.slice(0, 3)) { // Try at most 3 URLs
    console.log(`[WebLookup] Tier 1: Fetching product page: ${url}`);
    const pageContent = await fetchWithJina(url);
    if (pageContent) {
      const days = await extractReturnPolicyFromPage(pageContent, productName, marketplace);
      if (days !== null && days >= 0) {
        console.log(`[WebLookup] ✅ Tier 1 success: ${days} days from ${url}`);
        return days;
      }
    }
  }

  console.log('[WebLookup] Tier 1 failed, trying Tier 2...');

  // ── Tier 2: Search for product on marketplace ──────────────────────────
  const searchUrl = config.searchUrlBuilder(productName);
  console.log(`[WebLookup] Tier 2: Searching on marketplace: ${searchUrl}`);

  const searchContent = await fetchWithJina(searchUrl);
  if (searchContent) {
    // Ask LLM to find the product URL from search results
    const productUrl = await extractProductUrlFromSearch(searchContent, productName, marketplace);
    if (productUrl) {
      console.log(`[WebLookup] Tier 2: Found product page: ${productUrl}`);
      const pageContent = await fetchWithJina(productUrl);
      if (pageContent) {
        const days = await extractReturnPolicyFromPage(pageContent, productName, marketplace);
        if (days !== null && days >= 0) {
          console.log(`[WebLookup] ✅ Tier 2 success: ${days} days from ${productUrl}`);
          return days;
        }
      }
    }
  }

  console.log('[WebLookup] Tier 2 failed, falling back to Tier 3 defaults');

  // ── Tier 3: Hardcoded defaults ─────────────────────────────────────────
  console.log(`[WebLookup] ✅ Tier 3 fallback: ${config.defaultReturnDays} days for ${marketplace}`);
  return config.defaultReturnDays;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Filter product URLs from email body to only include relevant marketplace URLs
 */
function filterRelevantUrls(
  urls: string[],
  marketplace: string,
  config: MarketplaceConfig
): string[] {
  // First: try matching the product URL pattern for this marketplace
  const patternMatches = urls.filter(url => {
    config.productUrlPattern.lastIndex = 0; // Reset regex state
    return config.productUrlPattern.test(url);
  });

  if (patternMatches.length > 0) return patternMatches;

  // Fallback: any URL from this marketplace's domain
  const domainMap: Record<string, string[]> = {
    Amazon: ['amazon.in', 'amazon.com'],
    Flipkart: ['flipkart.com'],
    Myntra: ['myntra.com'],
    Meesho: ['meesho.com'],
    Ajio: ['ajio.com'],
  };

  const domains = domainMap[marketplace] || [];
  return urls.filter(url => domains.some(d => url.includes(d)));
}

/**
 * Fetch a URL using Jina Reader to get clean markdown content
 */
async function fetchWithJina(url: string): Promise<string | null> {
  try {
    const jinaUrl = `https://r.jina.ai/${url}`;
    const response = await fetch(jinaUrl, {
      headers: {
        'Accept': 'text/plain',
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      console.error(`[WebLookup] Jina returned ${response.status} for ${url}`);
      return null;
    }

    const text = await response.text();
    if (!text || text.length < 100) {
      console.error(`[WebLookup] Jina returned too little content for ${url}`);
      return null;
    }

    return text;
  } catch (error: any) {
    if (error.name === 'TimeoutError') {
      console.error(`[WebLookup] Jina timeout for ${url}`);
    } else {
      console.error(`[WebLookup] Jina fetch failed for ${url}:`, error.message);
    }
    return null;
  }
}
