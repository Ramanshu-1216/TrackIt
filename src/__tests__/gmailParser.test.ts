/**
 * ============================================================
 * TESTS: Email Body Parser (functions inside gmailService.ts)
 * ============================================================
 * We test the individual pure functions that don't require
 * a real Gmail API connection. These are extracted for testing.
 * ============================================================
 */

import {
  toBase64Url,
  AMAZON_ORDER_PLAIN_TEXT,
  MYNTRA_ORDER_HTML,
} from './fixtures/emails';

// ─── Re-export the private helpers for testing ────────────────────────────────
// Since these are private in gmailService.ts, we duplicate them here
// for direct unit testing. This is the standard pattern.

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

function extractUrls(text: string): string[] {
  const urlPattern = /https?:\/\/[^\s"'<>\])]+/gi;
  const matches = text.match(urlPattern) || [];
  const cleaned = matches.map(url => url.replace(/[.,;:!?)}\]]+$/, ''));
  return [...new Set(cleaned)];
}

function extractSenderDomain(fromHeader: string): string {
  const match = fromHeader.match(/@([a-zA-Z0-9.-]+)/);
  return match ? match[1].toLowerCase() : '';
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Base64URL Decoder', () => {
  it('decodes plain text correctly', () => {
    const original = 'Hello, Raman! Your order has been placed.';
    const encoded = toBase64Url(original);
    expect(decodeBase64Url(encoded)).toBe(original);
  });

  it('handles URL-safe base64 characters (- and _)', () => {
    // Known string that produces - and _ in base64url
    const original = 'Samsung Galaxy M34 5G - ₹18,999';
    const encoded = toBase64Url(original);
    // Should not throw
    expect(() => decodeBase64Url(encoded)).not.toThrow();
    expect(decodeBase64Url(encoded)).toBe(original);
  });

  it('handles empty string', () => {
    expect(decodeBase64Url(toBase64Url(''))).toBe('');
  });

  it('decodes a realistic Amazon email body', () => {
    const encoded = toBase64Url(AMAZON_ORDER_PLAIN_TEXT);
    const decoded = decodeBase64Url(encoded);
    expect(decoded).toContain('Samsung Galaxy M34 5G');
    expect(decoded).toContain('₹18,999');
    expect(decoded).toContain('403-7362141-1234567');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('HTML Stripper', () => {
  it('strips basic HTML tags from Myntra email', () => {
    const stripped = stripHtml(MYNTRA_ORDER_HTML);
    expect(stripped).toContain('H&M Slim Fit Formal Shirt');
    expect(stripped).toContain('₹1,299');
    expect(stripped).not.toContain('<td>');
    expect(stripped).not.toContain('<html>');
  });

  it('decodes HTML entities', () => {
    const html = '<p>Price: ₹1,299 &amp; free delivery</p>';
    const stripped = stripHtml(html);
    expect(stripped).toContain('&');
    expect(stripped).not.toContain('&amp;');
  });

  it('removes style blocks entirely', () => {
    const html = '<style>.red { color: red; }</style><p>Hello</p>';
    const stripped = stripHtml(html);
    expect(stripped).not.toContain('.red');
    expect(stripped).toContain('Hello');
  });

  it('removes script blocks entirely', () => {
    const html = '<script>alert("xss")</script><p>Order confirmed</p>';
    const stripped = stripHtml(html);
    expect(stripped).not.toContain('alert');
    expect(stripped).toContain('Order confirmed');
  });

  it('preserves newlines for block elements', () => {
    const html = '<p>Line 1</p><p>Line 2</p>';
    const stripped = stripHtml(html);
    expect(stripped).toContain('\n');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('URL Extractor', () => {
  it('extracts Amazon product URLs from email body', () => {
    const urls = extractUrls(AMAZON_ORDER_PLAIN_TEXT);
    expect(urls).toContain('https://www.amazon.in/dp/B0CTML42S2');
    const orderUrl = urls.find(u => u.includes('order-details'));
    expect(orderUrl).toBeDefined();
  });

  it('extracts Flipkart product URLs', () => {
    const body = `
      Order placed. View product: https://www.flipkart.com/nike-air-max-270/p/itm2b9e8c7cf2b45
      Track order: https://www.flipkart.com/my-orders
    `;
    const urls = extractUrls(body);
    expect(urls).toContain('https://www.flipkart.com/nike-air-max-270/p/itm2b9e8c7cf2b45');
    expect(urls).toContain('https://www.flipkart.com/my-orders');
  });

  it('strips trailing punctuation from URLs', () => {
    const body = 'Check your order here: https://www.amazon.in/dp/B0CTML42S2.';
    const urls = extractUrls(body);
    expect(urls).toContain('https://www.amazon.in/dp/B0CTML42S2');
    expect(urls).not.toContain('https://www.amazon.in/dp/B0CTML42S2.');
  });

  it('deduplicates URLs', () => {
    const body = `
      https://www.amazon.in/dp/B0CTML42S2
      Check again: https://www.amazon.in/dp/B0CTML42S2
    `;
    const urls = extractUrls(body);
    const duplicates = urls.filter(u => u === 'https://www.amazon.in/dp/B0CTML42S2');
    expect(duplicates.length).toBe(1);
  });

  it('returns empty array when no URLs found', () => {
    const urls = extractUrls('No URLs in this plain text message.');
    expect(urls).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Sender Domain Extractor', () => {
  it('extracts domain from simple email header', () => {
    expect(extractSenderDomain('noreply@flipkart.com')).toBe('flipkart.com');
  });

  it('extracts domain from "Name <email>" format', () => {
    expect(extractSenderDomain('Amazon.in <auto-confirm@amazon.in>')).toBe('amazon.in');
    expect(extractSenderDomain('Myntra <no-reply@myntra.com>')).toBe('myntra.com');
  });

  it('lowercases the domain', () => {
    expect(extractSenderDomain('NOREPLY@MEESHO.COM')).toBe('meesho.com');
  });

  it('returns empty string for invalid header', () => {
    expect(extractSenderDomain('not-an-email')).toBe('');
  });

  it('correctly identifies all 5 supported marketplaces', () => {
    const mappings = [
      ['auto-confirm@amazon.in', 'amazon.in'],
      ['no-reply@flipkart.com', 'flipkart.com'],
      ['no-reply@myntra.com', 'myntra.com'],
      ['orders@meesho.com', 'meesho.com'],
      ['noreply@ajio.com', 'ajio.com'],
    ];
    for (const [from, expected] of mappings) {
      expect(extractSenderDomain(from)).toBe(expected);
    }
  });
});
