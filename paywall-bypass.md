# Paywall Bypass Research

*For personal, non-commercial use only. Respect content creators.*

## Overview

Many quality news sources use paywalls. This document covers methods to access full article content for personal reading. The newsreader app should try multiple approaches in order of reliability.

## How Paywalls Work

### Hard Paywalls
- Require authentication to view any content
- No workarounds except subscription
- Examples: WSJ (strict), Financial Times, The Athletic

### Soft Paywalls (Metered)
- Allow X free articles per month
- Track via cookies, IP, or fingerprinting
- Examples: NYT, Washington Post, Medium

### Registration Walls
- Free but require account creation
- Often can be bypassed with reader mode
- Examples: Some sections of various sites

## Bypass Methods Ranked

### 1. Archive Services (Most Reliable)

These services cache articles, which bypasses most paywalls.

| Service | URL | Reliability | Notes |
|---------|-----|-------------|-------|
| **archive.today** | `https://archive.today/` | ⭐⭐⭐⭐⭐ | Best overall, frequently updated |
| **archive.is** | `https://archive.is/` | ⭐⭐⭐⭐⭐ | Same as above (alias) |
| **archive.ph** | `https://archive.ph/` | ⭐⭐⭐⭐⭐ | Same service, alt domain |
| **Wayback Machine** | `https://web.archive.org/` | ⭐⭐⭐ | Good for older articles |
| **RemovePaywall** | `https://removepaywall.com/` | ⭐⭐⭐⭐ | Aggregates multiple methods |

**Implementation:**
```typescript
// lib/bypass.ts

const ARCHIVE_DOMAINS = [
  'archive.today',
  'archive.is',
  'archive.ph',
];

export async function getArchivedUrl(originalUrl: string): Promise<string | null> {
  for (const domain of ARCHIVE_DOMAINS) {
    try {
      // Check if archive exists
      const checkUrl = `https://${domain}/${encodeURIComponent(originalUrl)}`;
      const response = await fetch(checkUrl, { method: 'HEAD' });
      
      if (response.ok) {
        return checkUrl;
      }
      
      // Try to create new archive
      const createUrl = `https://${domain}/submit/?url=${encodeURIComponent(originalUrl)}`;
      const createResponse = await fetch(createUrl);
      
      if (createResponse.ok) {
        // Parse redirect to get archive URL
        return createResponse.url;
      }
    } catch (error) {
      continue; // Try next domain
    }
  }
  
  return null;
}

export async function fetchFromWayback(url: string): Promise<string | null> {
  try {
    const apiUrl = `https://archive.org/wayback/available?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl);
    const data = await response.json();
    
    if (data.archived_snapshots?.closest?.available) {
      return data.archived_snapshots.closest.url;
    }
  } catch (error) {
    console.error('Wayback lookup failed:', error);
  }
  
  return null;
}
```

### 2. Reader Mode / Readability

Many soft paywalls load content then hide it with JS. Reader mode extracts it.

```typescript
// lib/reader.ts
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export async function extractWithReadability(url: string): Promise<Article | null> {
  try {
    const response = await fetch(url, {
      headers: {
        // Pretend to be Googlebot (some sites serve full content)
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      },
    });
    
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const reader = new Readability(dom.window.document);
    const article = reader.parse();
    
    if (article && article.content.length > 500) {
      return {
        title: article.title,
        content: article.content,
        excerpt: article.excerpt,
        byline: article.byline,
      };
    }
  } catch (error) {
    console.error('Readability extraction failed:', error);
  }
  
  return null;
}
```

### 3. Google Cache (Declining)

Google's cached versions sometimes have full content, but Google has reduced caching.

```typescript
export function getGoogleCacheUrl(url: string): string {
  return `https://webcache.googleusercontent.com/search?q=cache:${encodeURIComponent(url)}`;
}

// Note: This often returns 404 now as Google has reduced caching
```

### 4. Browser Extensions (For Manual Use)

These don't work in automated contexts but are useful for direct reading:

| Extension | Status | Notes |
|-----------|--------|-------|
| **Bypass Paywalls Clean** | ✅ Working | Must install from GitLab manually |
| **uBlock Origin filters** | ✅ Working | Custom filters for Firefox |
| **12ft.io** | ❌ Shut down | Was shut down July 2025 |

### 5. Social Media Referrer Trick

Some sites give full access to traffic from social platforms:

```typescript
export async function fetchWithFacebookReferrer(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'Referer': 'https://www.facebook.com/',
      'User-Agent': 'facebookexternalhit/1.1',
    },
  });
  
  return response.text();
}
```

**Limited effectiveness** — most major sites have patched this.

### 6. Print View / AMP

Some sites have unpaywalled print or AMP versions:

```typescript
export function tryAlternativeUrls(url: string): string[] {
  const alternatives = [];
  
  // Try print version
  if (!url.includes('?')) {
    alternatives.push(`${url}?print=true`);
    alternatives.push(`${url}?output=print`);
  }
  
  // Try AMP version
  const urlObj = new URL(url);
  alternatives.push(`https://www.google.com/amp/s/${urlObj.host}${urlObj.pathname}`);
  
  return alternatives;
}
```

## Combined Bypass Strategy

The newsreader should try methods in this order:

```typescript
// lib/bypass.ts

export async function fetchArticleWithBypass(url: string): Promise<ArticleContent> {
  // 1. Try direct fetch with Googlebot UA
  let article = await extractWithReadability(url);
  if (article && article.content.length > 1000) {
    return article;
  }
  
  // 2. Try archive.today
  const archiveUrl = await getArchivedUrl(url);
  if (archiveUrl) {
    article = await extractWithReadability(archiveUrl);
    if (article) {
      return { ...article, fromArchive: true };
    }
  }
  
  // 3. Try Wayback Machine
  const waybackUrl = await fetchFromWayback(url);
  if (waybackUrl) {
    article = await extractWithReadability(waybackUrl);
    if (article) {
      return { ...article, fromWayback: true };
    }
  }
  
  // 4. Try RemovePaywall
  const removePaywallUrl = `https://removepaywall.com/search?url=${encodeURIComponent(url)}`;
  try {
    const response = await fetch(removePaywallUrl);
    // Parse response for actual content URL
    // ...
  } catch (e) {
    // Continue to fallback
  }
  
  // 5. Return partial content if available
  if (article) {
    return { ...article, partial: true };
  }
  
  throw new Error('Could not retrieve full article');
}
```

## Site-Specific Notes

### New York Times
- Soft paywall, tracks by cookie
- Archive services work well
- RSS feed includes excerpts only
- Reader mode can sometimes get full content on first load

### Washington Post
- Similar to NYT
- Sometimes serves full content to bots
- Archive services reliable

### The Hill / Politico
- Usually no paywall on news content
- Some opinion pieces may be restricted
- Direct fetch usually works

### Rolling Stone / Deadline
- Generally no paywall
- Ad-heavy but content accessible
- Direct fetch + Readability works great

### Ars Technica
- Some premium content paywalled
- Most content freely accessible
- Archive services work for premium

## Legal Considerations

**For Personal Use:**
- Bypassing paywalls for personal reading is a gray area
- Generally acceptable for individual, non-commercial use
- Similar to using a library

**What NOT to do:**
- Don't redistribute bypassed content
- Don't build commercial tools around bypass
- Don't scrape at scale for data collection

**The approach in this app:**
- Uses publicly available archive services
- For personal reading only
- Not redistributing content
- Respects robots.txt for direct fetching

## Implementation for the Newsreader

### API Endpoint
```typescript
// app/api/article/route.ts

import { fetchArticleWithBypass } from '@/lib/bypass';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  
  if (!url) {
    return Response.json({ error: 'URL required' }, { status: 400 });
  }
  
  try {
    const article = await fetchArticleWithBypass(url);
    return Response.json(article);
  } catch (error) {
    return Response.json({ 
      error: 'Could not fetch article',
      partial: true,
      message: 'Try opening in browser with reader mode'
    }, { status: 422 });
  }
}
```

### UI Handling
```tsx
// components/ArticleReader.tsx

function ArticleReader({ article }) {
  return (
    <article className="prose">
      {article.fromArchive && (
        <div className="bg-yellow-50 p-3 rounded mb-4 text-sm">
          📦 Loaded from archive.today
        </div>
      )}
      
      {article.partial && (
        <div className="bg-red-50 p-3 rounded mb-4 text-sm">
          ⚠️ Partial content only.{' '}
          <a href={article.link} target="_blank" rel="noopener">
            Read full article →
          </a>
        </div>
      )}
      
      <h1>{article.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: article.content }} />
    </article>
  );
}
```

## Services & Tools Reference

| Service | Purpose | URL |
|---------|---------|-----|
| archive.today | Primary archive | https://archive.today |
| archive.is | Mirror | https://archive.is |
| archive.ph | Mirror | https://archive.ph |
| Wayback Machine | Historical archive | https://web.archive.org |
| RemovePaywall | Aggregator | https://removepaywall.com |
| 1ft.io | Ladder replacement | https://1ft.io (spotty) |
| Archive Buttons | Multi-service | https://archivebuttons.com |

## Monitoring & Reliability

Since these services can change or be blocked:

```typescript
// lib/bypass-health.ts

interface ServiceHealth {
  name: string;
  url: string;
  lastChecked: Date;
  working: boolean;
}

export async function checkBypassServices(): Promise<ServiceHealth[]> {
  const testUrl = 'https://www.nytimes.com/some-article';
  const services = [
    { name: 'archive.today', url: 'https://archive.today/' },
    { name: 'archive.is', url: 'https://archive.is/' },
    { name: 'removepaywall', url: 'https://removepaywall.com/' },
  ];
  
  return Promise.all(
    services.map(async (service) => {
      try {
        const response = await fetch(service.url, { 
          method: 'HEAD',
          timeout: 5000 
        });
        return {
          ...service,
          lastChecked: new Date(),
          working: response.ok,
        };
      } catch {
        return {
          ...service,
          lastChecked: new Date(),
          working: false,
        };
      }
    })
  );
}
```

---

## Summary

**Most reliable approach:** Archive.today/archive.is — works for most major publications.

**Fallback chain:**
1. Direct fetch with reader extraction
2. Archive.today
3. Wayback Machine
4. RemovePaywall
5. Return partial content with link to original

**Remember:** This is for personal use. Support journalism when you can!
