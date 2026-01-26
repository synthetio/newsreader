# MVP 1: Web Progressive Web App (PWA)

**The Recommended Approach** — Fastest to build, easiest to iterate, works everywhere.

## Overview

A Next.js-based PWA that runs in any browser but can be "installed" on mobile devices for an app-like experience. Deploys to Vercel with zero configuration.

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Framework** | Next.js 14 (App Router) | SSR, API routes, PWA support |
| **Styling** | Tailwind CSS + shadcn/ui | Rapid UI development |
| **State** | Zustand or React Context | Simple state management |
| **Database** | SQLite (Turso) or Postgres (Vercel) | Serverless-friendly |
| **RSS Parsing** | rss-parser / feedparser | Reliable feed parsing |
| **AI** | OpenAI GPT-4o-mini | Summaries and categorization |
| **PWA** | next-pwa | Service worker, offline |
| **Deployment** | Vercel | Free tier, instant deploys |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client (PWA)                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │  Feed List  │  │   Reader    │  │   Morning Digest    │ │
│  │   (React)   │  │   (React)   │  │      (React)        │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Next.js API Routes                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ /api/feeds  │  │/api/article │  │   /api/digest       │ │
│  │   (fetch)   │  │  (bypass)   │  │   (summarize)       │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      External Services                       │
│  ┌──────────┐  ┌────────────┐  ┌────────────────────────┐  │
│  │RSS Feeds │  │archive.today│  │     OpenAI API        │  │
│  └──────────┘  └────────────┘  └────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Project Structure

```
newsreader/
├── app/
│   ├── layout.tsx              # Root layout with nav
│   ├── page.tsx                # Home / Feed list
│   ├── article/[id]/page.tsx   # Article reader
│   ├── digest/page.tsx         # Morning digest view
│   ├── settings/page.tsx       # Feed management
│   └── api/
│       ├── feeds/route.ts      # Fetch and cache feeds
│       ├── article/route.ts    # Fetch article + bypass
│       ├── digest/route.ts     # Generate AI digest
│       └── topics/route.ts     # Extract trending topics
├── components/
│   ├── ArticleCard.tsx         # Article preview card
│   ├── ArticleReader.tsx       # Clean reader mode
│   ├── CategoryNav.tsx         # Category filter
│   ├── WordCloud.tsx           # Trending topics
│   └── DigestCard.tsx          # Summary card
├── lib/
│   ├── feeds.ts                # RSS parsing logic
│   ├── bypass.ts               # Paywall bypass utils
│   ├── summarize.ts            # OpenAI integration
│   ├── topics.ts               # Topic extraction
│   └── db.ts                   # Database helpers
├── public/
│   ├── manifest.json           # PWA manifest
│   └── icons/                  # App icons
├── next.config.js              # Next.js + PWA config
├── tailwind.config.js
└── package.json
```

## Key Features (v1)

### 1. Feed Aggregation
```typescript
// lib/feeds.ts
import Parser from 'rss-parser';

const parser = new Parser();

interface Feed {
  url: string;
  category: string;
  name: string;
}

const FEEDS: Feed[] = [
  { url: 'https://deadline.com/feed/', category: 'entertainment', name: 'Deadline' },
  { url: 'https://thehill.com/feed/', category: 'politics', name: 'The Hill' },
  { url: 'https://rss.politico.com/politics-news.xml', category: 'politics', name: 'Politico' },
  // ... more feeds
];

export async function fetchAllFeeds() {
  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return parsed.items.map(item => ({
        ...item,
        source: feed.name,
        category: feed.category,
        fetchedAt: new Date(),
      }));
    })
  );
  
  return results
    .filter((r): r is PromiseFulfilledResult<any[]> => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
}
```

### 2. Reader Mode
```typescript
// lib/reader.ts
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

export async function extractArticle(url: string): Promise<ArticleContent> {
  // Try direct fetch first
  let html = await fetchWithBypass(url);
  
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();
  
  return {
    title: article?.title || '',
    content: article?.content || '',
    excerpt: article?.excerpt || '',
    byline: article?.byline || '',
    siteName: article?.siteName || '',
  };
}
```

### 3. AI Summaries
```typescript
// lib/summarize.ts
import OpenAI from 'openai';

const openai = new OpenAI();

export async function generateDigest(articles: Article[]): Promise<Digest> {
  const topArticles = articles.slice(0, 20);
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: `You are a helpful news curator. Summarize these articles into a 
                morning digest with 3-5 key stories. Be concise but informative.
                Format: Start with a one-line greeting, then bullet points for each story.`
    }, {
      role: 'user',
      content: JSON.stringify(topArticles.map(a => ({
        title: a.title,
        source: a.source,
        excerpt: a.contentSnippet,
        category: a.category,
      })))
    }],
    max_tokens: 1000,
  });
  
  return {
    summary: response.choices[0].message.content,
    generatedAt: new Date(),
    articleCount: topArticles.length,
  };
}
```

### 4. Word Cloud / Trending Topics
```typescript
// lib/topics.ts
import { removeStopwords } from 'stopword';

export function extractTopics(articles: Article[]): Topic[] {
  const text = articles
    .map(a => `${a.title} ${a.contentSnippet || ''}`)
    .join(' ');
  
  const words = text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/);
  
  const filtered = removeStopwords(words);
  
  const frequency: Record<string, number> = {};
  filtered.forEach(word => {
    if (word.length > 3) {
      frequency[word] = (frequency[word] || 0) + 1;
    }
  });
  
  return Object.entries(frequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([word, count]) => ({ word, count }));
}
```

## UI Components

### ArticleCard Component
```tsx
// components/ArticleCard.tsx
interface Props {
  article: Article;
  onRead: (id: string) => void;
}

export function ArticleCard({ article, onRead }: Props) {
  return (
    <div 
      className="p-4 border-b border-gray-200 hover:bg-gray-50 cursor-pointer"
      onClick={() => onRead(article.id)}
    >
      <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
        <span className="font-medium">{article.source}</span>
        <span>•</span>
        <span>{formatRelativeTime(article.pubDate)}</span>
        <span className={`ml-auto px-2 py-0.5 rounded-full text-xs 
          ${categoryColors[article.category]}`}>
          {article.category}
        </span>
      </div>
      <h3 className="font-semibold text-gray-900 mb-1">{article.title}</h3>
      {article.contentSnippet && (
        <p className="text-sm text-gray-600 line-clamp-2">
          {article.contentSnippet}
        </p>
      )}
    </div>
  );
}
```

### Reader Mode Component
```tsx
// components/ArticleReader.tsx
interface Props {
  article: ArticleContent;
  onClose: () => void;
}

export function ArticleReader({ article, onClose }: Props) {
  return (
    <div className="fixed inset-0 bg-white z-50 overflow-auto">
      <header className="sticky top-0 bg-white border-b px-4 py-3 flex items-center">
        <button onClick={onClose} className="p-2">
          <ArrowLeftIcon className="w-5 h-5" />
        </button>
        <span className="ml-2 text-sm text-gray-500">{article.siteName}</span>
      </header>
      
      <article className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-2">{article.title}</h1>
        {article.byline && (
          <p className="text-gray-500 mb-6">{article.byline}</p>
        )}
        <div 
          className="prose prose-lg"
          dangerouslySetInnerHTML={{ __html: article.content }} 
        />
      </article>
    </div>
  );
}
```

## PWA Configuration

```javascript
// next.config.js
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

module.exports = withPWA({
  // Next.js config
});
```

```json
// public/manifest.json
{
  "name": "Glenn's News Reader",
  "short_name": "News Reader",
  "description": "Personal news aggregator with AI summaries",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a1a1a",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

## Database Schema

Using Drizzle ORM with SQLite (Turso):

```typescript
// lib/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const articles = sqliteTable('articles', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  link: text('link').notNull(),
  source: text('source').notNull(),
  category: text('category').notNull(),
  contentSnippet: text('content_snippet'),
  pubDate: integer('pub_date', { mode: 'timestamp' }),
  fetchedAt: integer('fetched_at', { mode: 'timestamp' }),
  read: integer('read', { mode: 'boolean' }).default(false),
});

export const feeds = sqliteTable('feeds', {
  id: text('id').primaryKey(),
  url: text('url').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).default(true),
  lastFetched: integer('last_fetched', { mode: 'timestamp' }),
});

export const digests = sqliteTable('digests', {
  id: text('id').primaryKey(),
  content: text('content').notNull(),
  generatedAt: integer('generated_at', { mode: 'timestamp' }),
  articleIds: text('article_ids'), // JSON array
});
```

## API Endpoints

### GET /api/feeds
Fetches all configured RSS feeds and returns merged, sorted articles.

```typescript
// app/api/feeds/route.ts
import { NextResponse } from 'next/server';
import { fetchAllFeeds } from '@/lib/feeds';
import { db } from '@/lib/db';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category');
  const limit = parseInt(searchParams.get('limit') || '50');
  
  // Check cache first (5 min TTL)
  const cached = await getCachedFeeds();
  if (cached && Date.now() - cached.fetchedAt < 300000) {
    return NextResponse.json(filterArticles(cached.articles, category, limit));
  }
  
  // Fetch fresh
  const articles = await fetchAllFeeds();
  await cacheFeeds(articles);
  
  return NextResponse.json(filterArticles(articles, category, limit));
}
```

### GET /api/article
Fetches and parses a single article with paywall bypass.

```typescript
// app/api/article/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');
  
  if (!url) {
    return NextResponse.json({ error: 'URL required' }, { status: 400 });
  }
  
  try {
    const article = await extractArticle(url);
    return NextResponse.json(article);
  } catch (error) {
    // Try bypass if direct fetch fails
    const bypassed = await fetchWithBypass(url);
    return NextResponse.json(bypassed);
  }
}
```

### GET /api/digest
Generates an AI-powered morning digest.

```typescript
// app/api/digest/route.ts
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hours = parseInt(searchParams.get('hours') || '12');
  const categories = searchParams.get('categories')?.split(',');
  
  const articles = await getRecentArticles(hours, categories);
  const digest = await generateDigest(articles);
  
  return NextResponse.json(digest);
}
```

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel
3. Add environment variables:
   - `OPENAI_API_KEY`
   - `DATABASE_URL` (if using Turso)
4. Deploy

### Environment Variables
```env
# .env.local
OPENAI_API_KEY=sk-...
DATABASE_URL=libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=...

# Optional
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

### Cron for Feed Updates
Vercel supports cron jobs in `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/fetch-feeds",
      "schedule": "*/15 * * * *"
    },
    {
      "path": "/api/cron/generate-digest",
      "schedule": "0 7 * * *"
    }
  ]
}
```

## Clawdbot Integration

The newsreader can integrate with Clawdbot for morning summaries:

```typescript
// Example Clawdbot heartbeat task
// In HEARTBEAT.md:
// - [ ] At 7am, fetch morning digest and send via Telegram

// The endpoint:
// GET /api/digest?hours=12&categories=politics,entertainment

// Returns structured data that Clawdbot can format
{
  "summary": "☀️ Good morning! Here's your news briefing:\n\n• **Politics**: [story]...",
  "topStories": [...],
  "generatedAt": "2026-01-26T07:00:00Z"
}
```

## Pros & Cons

### ✅ Pros
- **Fastest to build** — Next.js scaffolding is instant
- **Zero infrastructure** — Vercel free tier handles everything
- **Cross-platform** — Works on any device with a browser
- **Instant updates** — Push to GitHub, auto-deploys
- **PWA benefits** — Installable, offline capable, push notifications
- **Clawdbot native** — Easy API integration for morning summaries

### ❌ Cons
- **Not a "real" app** — Can't submit to App Store
- **Limited offline** — Service worker caching is imperfect
- **Browser dependent** — Some features need modern browsers
- **No background sync** — Can't fetch while app is closed

## Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Setup | 2 hours | Next.js project, Tailwind, PWA config |
| Feed integration | 4 hours | RSS parsing, caching, API routes |
| UI | 6 hours | Article list, reader, navigation |
| AI features | 4 hours | Summaries, topic extraction |
| Paywall bypass | 3 hours | Integration with archive services |
| Polish | 4 hours | Offline support, icons, testing |
| **Total** | **~23 hours** | Working PWA |

---

*This is the recommended approach for Glenn. Ship fast, iterate based on usage.*
