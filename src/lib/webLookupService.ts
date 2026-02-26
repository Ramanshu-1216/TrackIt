import { extractReturnPolicyFromText } from './llmService';

export async function lookupReturnPolicy(itemName: string, marketplace: string, productUrl?: string): Promise<number | null> {
  console.log(`[WebLookup] Starting lookup for ${itemName} on ${marketplace}`);
  
  // Use Jina Reader to get clean markdown from a URL
  const fetchMarkdown = async (url: string) => {
    try {
      const response = await fetch(`https://r.jina.ai/${url}`);
      return await response.text();
    } catch (err) {
      console.error(`[WebLookup] Failed to fetch ${url}:`, err);
      return null;
    }
  };

  let content: string | null = null;

  if (productUrl) {
    // 1. Try direct product URL if provided
    content = await fetchMarkdown(productUrl);
  }

  if (!content) {
    // 2. Fallback: Search on Google for the return policy
    const searchQuery = `${marketplace} ${itemName} return policy window days`;
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`;
    // We use Jina to "browse" the search result if possible, or just look for marketplace specific policies
    // For now, let's try to construct a generic marketplace policy URL if search fails
    const commonPolicies: Record<string, string> = {
      'Amazon': 'https://www.amazon.in/gp/help/customer/display.html?nodeId=GKM69DUUYQW97STB',
      'Flipkart': 'https://www.flipkart.com/pages/returnpolicy',
    };

    if (commonPolicies[marketplace]) {
      content = await fetchMarkdown(commonPolicies[marketplace]);
    }
  }

  if (content) {
    return await extractReturnPolicyFromText(content);
  }

  return null;
}
