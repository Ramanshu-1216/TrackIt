import {
  ReturnPolicyResult,
  extractReturnPolicyFromPage,
  extractProductUrlFromSearch,
} from './llmService';

// ─── Marketplace Configuration ───────────────────────────────────────────────

interface MarketplaceConfig {
  searchUrlBuilder: (productName: string) => string;
  productUrlBuilder?: (productId: string) => string;
  productUrlPattern: RegExp;   // Pattern to identify product page URLs in email body
  defaultReturnDays: number;
}

const MARKETPLACE_CONFIGS: Record<string, MarketplaceConfig> = {
  Amazon: {
    searchUrlBuilder: (name) =>
      `https://www.amazon.in/s?k=${encodeURIComponent(name)}`,
    productUrlBuilder: (id) => `https://www.amazon.in/dp/${id}?th=1`,
    productUrlPattern: /https?:\/\/(?:www\.)?amazon\.(?:in|com)\/(?:dp|gp\/product)\/[A-Z0-9]{10}/gi,
    defaultReturnDays: 10,
  },
  Flipkart: {
    searchUrlBuilder: (name) =>
      `https://www.flipkart.com/search?q=${encodeURIComponent(name)}`,
    productUrlBuilder: (id) => `https://www.flipkart.com/product/p/${id}`,
    productUrlPattern: /https?:\/\/(?:www\.)?flipkart\.com\/[^\s"'<>]+\/p\/[a-zA-Z0-9]+/gi,
    defaultReturnDays: 7,
  },
  Myntra: {
    searchUrlBuilder: (name) =>
      `https://www.myntra.com/${encodeURIComponent(name.toLowerCase().replace(/\s+/g, '-'))}`,
    productUrlBuilder: (id) => `https://www.myntra.com/product/${id}`,
    productUrlPattern: /https?:\/\/(?:www\.)?myntra\.com\/[^\s"'<>]+\/\d+(?:\/buy)?/gi,
    defaultReturnDays: 7,
  },
  Meesho: {
    searchUrlBuilder: (name) =>
      `https://meesho.com/search?q=${encodeURIComponent(name)}`,
    productUrlBuilder: (id) => `https://meesho.com/product/${id}`,
    productUrlPattern: /https?:\/\/(?:www\.)?meesho\.com\/[^\s"'<>]+\/p\/[a-zA-Z0-9]+/gi,
    defaultReturnDays: 7,
  },
  Ajio: {
    searchUrlBuilder: (name) =>
      `https://www.ajio.com/search/?text=${encodeURIComponent(name)}`,
    productUrlBuilder: (id) => `https://www.ajio.com/product/${id}`,
    productUrlPattern: /https?:\/\/(?:www\.)?ajio\.com\/[^\s"'<>]+\/p\/[a-zA-Z0-9]+/gi,
    defaultReturnDays: 7,
  },
};

// ─── Main Lookup Function ────────────────────────────────────────────────────

export async function lookupReturnPolicy(
  productName: string,
  marketplace: string,
  emailUrls: string[],
  productId?: string
): Promise<ReturnPolicyResult | null> {
  const config = MARKETPLACE_CONFIGS[marketplace];
  if (!config) {
    console.log(`[WebLookup] No config for marketplace: ${marketplace}`);
    return {
      returnWindowDays: 7,
      returnable: true,
      replaceable: true,
      returnPolicyDetails: 'Universal default return policy.',
    }; // Universal default
  }

  let finalProductUrl: string | null = null;
  let pageContent: string | null = null;

  // ─── TIER 1: Use productId or URLs from email ──────────────────────────────
  
  // Strategy A: If we extracted a direct Product ID (ASIN, etc.), build the exact URL
  if (productId && config.productUrlBuilder) {
    const builtUrl = config.productUrlBuilder(productId);
    console.log(`[WebLookup] Tier 1: Built product URL from ID: \n${builtUrl}`);
    const content = await fetchWithJina(builtUrl);
    if (content) {
      finalProductUrl = builtUrl;
      pageContent = content;
    }
  }

  // Strategy B: If no Product ID or it failed, look for product URLs in email body
  if (!pageContent && emailUrls.length > 0) {
    const relevantUrls = [...emailUrls].filter(url => 
      url.match(config.productUrlPattern)
    );
    if (relevantUrls.length > 0) {
      // Try at most 3 URLs from email
      for (const url of relevantUrls.slice(0, 3)) {
        console.log(`[WebLookup] Tier 1: Fetching product page from email URL: \n${url}`);
        const content = await fetchWithJina(url);
        if (content) {
          finalProductUrl = url;
          pageContent = content;
          break; // Found content, stop trying other URLs
        }
      }
    }
  }

  if (pageContent && finalProductUrl) {
    const policy = await extractReturnPolicyFromPage(pageContent, productName, marketplace);
    if (policy) {
      // Fallback to marketplace default if LLM found policy but not exact days
      if (policy.returnWindowDays === null) {
        policy.returnWindowDays = config.defaultReturnDays;
      }
      console.log(`[WebLookup] ✅ Tier 1 success: ${policy.returnWindowDays} days from ${finalProductUrl}`);
      return policy;
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
        const policy = await extractReturnPolicyFromPage(pageContent, productName, marketplace);
        if (policy) {
          if (policy.returnWindowDays === null) {
            policy.returnWindowDays = config.defaultReturnDays;
          }
          console.log(`[WebLookup] ✅ Tier 2 success: ${policy.returnWindowDays} days from ${productUrl}`);
          return policy;
        }
      }
    }
  }

  console.log('[WebLookup] Tier 2 failed, falling back to Tier 3 defaults');

  // ── Tier 3: Hardcoded defaults ─────────────────────────────────────────
  console.log(`[WebLookup] ✅ Tier 3 fallback: ${config.defaultReturnDays} days for ${marketplace}`);
  return {
    returnWindowDays: config.defaultReturnDays,
    returnable: true,
    replaceable: true,
    returnPolicyDetails: `Default ${config.defaultReturnDays} days return policy for ${marketplace}.`,
  };
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
    const headers: Record<string, string> = {
      'Accept': 'text/plain',
    };

    if (process.env.JINA_API_KEY) {
      headers['Authorization'] = `Bearer ${process.env.JINA_API_KEY}`;
    }

    const response = await fetch(jinaUrl, {
      headers,
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
