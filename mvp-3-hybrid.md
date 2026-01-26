# MVP 3: Hybrid CLI + Web Dashboard

**The Power User Approach** — Terminal-based fetching with a lightweight web viewer. Integrates naturally with Clawdbot.

## Overview

A two-part system:
1. **CLI Tool** — Fetches feeds, processes articles, generates digests, runs on schedule
2. **Web Dashboard** — Lightweight viewer for browsing and reading, can run locally or deployed

This approach treats news reading as a data pipeline: fetch → process → summarize → present.

## Why This Approach?

- **Clawdbot integration** — CLI can be invoked via cron or heartbeat
- **Maximum control** — Every step is scriptable
- **Low resource** — Dashboard can be static HTML + JSON
- **Terminal-native** — For users who live in the CLI
- **Debuggable** — Easy to inspect what's happening

## Tech Stack

| Component | Technology | Rationale |
|-----------|------------|-----------|
| **CLI** | Node.js + Commander | Cross-platform, async-friendly |
| **RSS Parsing** | rss-parser | Reliable, well-maintained |
| **Storage** | SQLite | Single file, portable |
| **AI** | OpenAI API | Summaries and topics |
| **Dashboard** | SvelteKit or Astro | Lightweight, fast |
| **Deployment** | Local or Cloudflare Pages | Free, simple |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          CLI Tool                                │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌────────────┐   │
│  │  Fetch    │→ │  Process  │→ │ Summarize │→ │   Export   │   │
│  │  Feeds    │  │ Articles  │  │  Digest   │  │   JSON     │   │
│  └───────────┘  └───────────┘  └───────────┘  └────────────┘   │
│                       │                             │            │
│                       ▼                             ▼            │
│              ┌─────────────────┐           ┌─────────────┐      │
│              │  SQLite DB      │           │  JSON Files │      │
│              └─────────────────┘           └─────────────┘      │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐    ┌───────────────────────────────┐
│      Clawdbot           │    │        Web Dashboard          │
│  (cron/heartbeat)       │    │   (reads JSON, serves UI)     │
│  - Morning digest       │    │   - Browse articles           │
│  - Telegram notify      │    │   - Read in clean mode        │
└─────────────────────────┘    └───────────────────────────────┘
```

## Project Structure

```
newsreader/
├── cli/
│   ├── bin/
│   │   └── newsreader.js       # CLI entry point
│   ├── commands/
│   │   ├── fetch.js            # Fetch RSS feeds
│   │   ├── digest.js           # Generate AI digest
│   │   ├── topics.js           # Extract trending topics
│   │   ├── export.js           # Export to JSON
│   │   └── serve.js            # Start local dashboard
│   ├── lib/
│   │   ├── feeds.js            # RSS parsing
│   │   ├── db.js               # SQLite operations
│   │   ├── bypass.js           # Paywall bypass
│   │   ├── summarize.js        # OpenAI integration
│   │   └── config.js           # Configuration
│   ├── feeds.yml               # Feed configuration
│   └── package.json
├── dashboard/
│   ├── src/
│   │   ├── routes/
│   │   │   ├── +page.svelte    # Article list
│   │   │   ├── digest/+page.svelte
│   │   │   └── article/[id]/+page.svelte
│   │   └── lib/
│   │       └── data.js         # Load JSON data
│   ├── static/
│   │   └── data/               # JSON from CLI export
│   └── svelte.config.js
├── data/
│   ├── newsreader.db           # SQLite database
│   ├── articles.json           # Exported articles
│   ├── digest.json             # Current digest
│   └── topics.json             # Trending topics
└── README.md
```

## CLI Implementation

### Main Entry Point
```javascript
#!/usr/bin/env node
// cli/bin/newsreader.js

import { Command } from 'commander';
import { fetchCommand } from '../commands/fetch.js';
import { digestCommand } from '../commands/digest.js';
import { topicsCommand } from '../commands/topics.js';
import { exportCommand } from '../commands/export.js';
import { serveCommand } from '../commands/serve.js';

const program = new Command();

program
  .name('newsreader')
  .description('Personal news aggregator CLI')
  .version('1.0.0');

program
  .command('fetch')
  .description('Fetch all configured RSS feeds')
  .option('-c, --category <category>', 'Fetch specific category')
  .option('-f, --force', 'Force refresh all feeds')
  .action(fetchCommand);

program
  .command('digest')
  .description('Generate AI-powered morning digest')
  .option('-h, --hours <hours>', 'Hours of articles to include', '12')
  .option('-o, --output <file>', 'Output file path')
  .action(digestCommand);

program
  .command('topics')
  .description('Extract trending topics from recent articles')
  .option('-n, --count <count>', 'Number of topics', '20')
  .action(topicsCommand);

program
  .command('export')
  .description('Export data to JSON for dashboard')
  .option('-d, --dir <directory>', 'Output directory', './data')
  .action(exportCommand);

program
  .command('serve')
  .description('Start local dashboard server')
  .option('-p, --port <port>', 'Port number', '3000')
  .action(serveCommand);

program.parse();
```

### Fetch Command
```javascript
// cli/commands/fetch.js
import Parser from 'rss-parser';
import { readConfig, getFeeds } from '../lib/config.js';
import { saveArticles, getLastFetchTime } from '../lib/db.js';
import chalk from 'chalk';
import ora from 'ora';

const parser = new Parser();

export async function fetchCommand(options) {
  const config = await readConfig();
  const feeds = getFeeds(config, options.category);
  
  console.log(chalk.blue(`\n📰 Fetching ${feeds.length} feeds...\n`));
  
  let totalArticles = 0;
  
  for (const feed of feeds) {
    const spinner = ora(`${feed.name}`).start();
    
    try {
      const lastFetch = options.force ? null : await getLastFetchTime(feed.url);
      const data = await parser.parseURL(feed.url);
      
      const newArticles = data.items
        .filter(item => {
          if (!lastFetch) return true;
          return new Date(item.pubDate) > lastFetch;
        })
        .map(item => ({
          id: generateId(item.link),
          title: item.title,
          link: item.link,
          source: feed.name,
          category: feed.category,
          contentSnippet: item.contentSnippet?.slice(0, 500),
          pubDate: new Date(item.pubDate),
          fetchedAt: new Date(),
        }));
      
      await saveArticles(newArticles, feed.url);
      totalArticles += newArticles.length;
      
      spinner.succeed(`${feed.name} - ${newArticles.length} new articles`);
    } catch (error) {
      spinner.fail(`${feed.name} - ${error.message}`);
    }
  }
  
  console.log(chalk.green(`\n✅ Fetched ${totalArticles} new articles\n`));
}
```

### Digest Command
```javascript
// cli/commands/digest.js
import OpenAI from 'openai';
import { getRecentArticles, saveDigest } from '../lib/db.js';
import chalk from 'chalk';
import fs from 'fs/promises';

const openai = new OpenAI();

export async function digestCommand(options) {
  const hours = parseInt(options.hours);
  
  console.log(chalk.blue(`\n🤖 Generating digest from last ${hours} hours...\n`));
  
  const articles = await getRecentArticles(hours);
  
  if (articles.length === 0) {
    console.log(chalk.yellow('No articles found. Run `newsreader fetch` first.'));
    return;
  }
  
  console.log(`Found ${articles.length} articles to summarize...`);
  
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'system',
      content: `You are a friendly news curator. Create a morning briefing digest.
                
Format:
- Start with a brief greeting mentioning the day
- List 3-5 most important/interesting stories as bullet points
- Each bullet: one sentence summary with the source in parentheses
- End with a brief closing thought

Keep it conversational but informative. Around 200 words total.`
    }, {
      role: 'user',
      content: `Here are today's articles:\n\n${articles.map(a => 
        `[${a.source}] ${a.title}\n${a.contentSnippet || ''}`
      ).join('\n\n')}`
    }],
    max_tokens: 800,
  });
  
  const digest = {
    summary: response.choices[0].message.content,
    generatedAt: new Date().toISOString(),
    articleCount: articles.length,
    topStories: articles.slice(0, 5).map(a => ({
      title: a.title,
      source: a.source,
      link: a.link,
    })),
  };
  
  await saveDigest(digest);
  
  if (options.output) {
    await fs.writeFile(options.output, JSON.stringify(digest, null, 2));
    console.log(chalk.gray(`Saved to ${options.output}`));
  }
  
  console.log(chalk.green('\n📋 Morning Digest:\n'));
  console.log(digest.summary);
  console.log();
}
```

### Feed Configuration
```yaml
# cli/feeds.yml
categories:
  entertainment:
    - name: Deadline
      url: https://deadline.com/feed/
    - name: Rolling Stone
      url: https://www.rollingstone.com/feed/
    - name: AV Club
      url: https://www.avclub.com/rss

  politics:
    - name: The Hill
      url: https://thehill.com/feed/
    - name: Politico
      url: https://rss.politico.com/politics-news.xml
    - name: NPR News
      url: https://feeds.npr.org/1001/rss.xml

  tech:
    - name: Ars Technica
      url: https://feeds.arstechnica.com/arstechnica/index
    - name: Wired
      url: https://www.wired.com/feed/rss
    - name: Techmeme
      url: https://www.techmeme.com/feed.xml

settings:
  fetch_interval: 15  # minutes
  digest_hour: 7      # 7 AM
  max_articles: 1000  # keep in database
```

## Dashboard Implementation

### Article List (SvelteKit)
```svelte
<!-- dashboard/src/routes/+page.svelte -->
<script>
  import { onMount } from 'svelte';
  import ArticleCard from '$lib/components/ArticleCard.svelte';
  
  let articles = [];
  let category = null;
  let loading = true;
  
  onMount(async () => {
    const res = await fetch('/data/articles.json');
    articles = await res.json();
    loading = false;
  });
  
  $: filtered = category 
    ? articles.filter(a => a.category === category)
    : articles;
</script>

<main class="max-w-3xl mx-auto px-4 py-8">
  <header class="mb-8">
    <h1 class="text-3xl font-bold">News Reader</h1>
    <p class="text-gray-500 mt-1">
      {articles.length} articles • Updated {new Date().toLocaleDateString()}
    </p>
  </header>
  
  <nav class="flex gap-2 mb-6 overflow-x-auto pb-2">
    <button 
      class="px-4 py-2 rounded-full {!category ? 'bg-black text-white' : 'bg-gray-100'}"
      on:click={() => category = null}
    >
      All
    </button>
    {#each ['entertainment', 'politics', 'tech'] as cat}
      <button 
        class="px-4 py-2 rounded-full capitalize {category === cat ? 'bg-black text-white' : 'bg-gray-100'}"
        on:click={() => category = cat}
      >
        {cat}
      </button>
    {/each}
  </nav>
  
  {#if loading}
    <p class="text-center py-8 text-gray-500">Loading...</p>
  {:else}
    <div class="divide-y">
      {#each filtered as article (article.id)}
        <ArticleCard {article} />
      {/each}
    </div>
  {/if}
</main>
```

### Static JSON Generation
The dashboard reads pre-generated JSON files:

```javascript
// cli/commands/export.js
import { getAllArticles, getLatestDigest, getTopics } from '../lib/db.js';
import fs from 'fs/promises';
import path from 'path';

export async function exportCommand(options) {
  const dir = options.dir;
  await fs.mkdir(dir, { recursive: true });
  
  // Export articles
  const articles = await getAllArticles(500);
  await fs.writeFile(
    path.join(dir, 'articles.json'),
    JSON.stringify(articles, null, 2)
  );
  
  // Export digest
  const digest = await getLatestDigest();
  if (digest) {
    await fs.writeFile(
      path.join(dir, 'digest.json'),
      JSON.stringify(digest, null, 2)
    );
  }
  
  // Export topics
  const topics = await getTopics();
  await fs.writeFile(
    path.join(dir, 'topics.json'),
    JSON.stringify(topics, null, 2)
  );
  
  console.log(`✅ Exported to ${dir}/`);
}
```

## Clawdbot Integration

This is where the hybrid approach shines — natural integration with Clawdbot's cron and heartbeat systems.

### Cron Jobs
```javascript
// In Clawdbot cron config
[
  {
    "schedule": "*/15 * * * *",
    "command": "newsreader fetch",
    "description": "Fetch new articles every 15 minutes"
  },
  {
    "schedule": "0 7 * * *",
    "command": "newsreader digest --output /Users/jill/clawd/newsreader/data/digest.json",
    "description": "Generate morning digest at 7 AM"
  },
  {
    "schedule": "5 7 * * *",
    "command": "newsreader export --dir /Users/jill/clawd/newsreader/dashboard/static/data",
    "description": "Update dashboard data"
  }
]
```

### Heartbeat Integration
```markdown
<!-- HEARTBEAT.md -->
## Morning Routine
- [ ] At 7 AM: Check if digest was generated
- [ ] If digest exists, send summary via Telegram
- [ ] Format: Brief greeting + top 3 stories with links

## Digest Check Script
```bash
# Check digest and send
if [ -f "/Users/jill/clawd/newsreader/data/digest.json" ]; then
  DIGEST=$(cat /Users/jill/clawd/newsreader/data/digest.json)
  # Clawdbot can read and send this
fi
```
```

### Direct Clawdbot Command
```bash
# Glenn can ask Clawdbot directly:
# "What's in the news today?"

# Clawdbot runs:
newsreader digest --hours 6

# And formats the response for Telegram
```

## Usage Examples

```bash
# Fetch all feeds
newsreader fetch

# Fetch only politics
newsreader fetch --category politics

# Generate morning digest
newsreader digest

# Generate digest and save to file
newsreader digest --hours 8 --output ./digest.md

# Extract trending topics
newsreader topics --count 15

# Export everything for dashboard
newsreader export --dir ./dashboard/static/data

# Start local dashboard
newsreader serve --port 3000
```

## Installation

```bash
# Global install
npm install -g @glenn/newsreader

# Or run from source
cd cli
npm install
npm link

# Create config
cp feeds.example.yml feeds.yml
# Edit feeds.yml with your preferred sources

# Initialize database
newsreader fetch

# Test digest
newsreader digest
```

## Deployment Options

### Option 1: Local Only
- CLI runs on Glenn's machine
- Dashboard at `http://localhost:3000`
- Launchd/cron for scheduling

### Option 2: Server Deployment
- CLI on home server or VPS
- Dashboard on Cloudflare Pages (free)
- More reliable scheduling

### Option 3: Hybrid
- CLI on Mac mini (via Clawdbot)
- Dashboard static export to GitHub Pages
- Best of both worlds

## Pros & Cons

### ✅ Pros
- **Total control** — Every step is inspectable and tweakable
- **Clawdbot native** — Integrates seamlessly with existing workflow
- **Scriptable** — Can be piped, chained, automated
- **Lightweight** — Dashboard is just static files
- **Offline capable** — All data stored locally
- **Privacy** — Nothing leaves your machine unless you want

### ❌ Cons
- **Two systems** — CLI + dashboard to maintain
- **Not mobile-first** — Dashboard works on mobile but not optimized
- **Manual updates** — Need to run commands (or schedule them)
- **No push notifications** — Pull-based model
- **Steeper learning curve** — Requires command line comfort

## Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| CLI setup | 3 hours | Commander, basic commands |
| Feed fetching | 4 hours | RSS parsing, database |
| Digest generation | 3 hours | OpenAI integration |
| Topic extraction | 2 hours | Word frequency analysis |
| Export command | 2 hours | JSON generation |
| Dashboard | 6 hours | SvelteKit UI |
| Reader mode | 3 hours | Article view with bypass |
| Clawdbot integration | 2 hours | Cron setup, heartbeat |
| **Total** | **~25 hours** | Working hybrid system |

---

*Choose this approach if you want maximum control and Clawdbot integration.*
