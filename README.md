# 📰 Glenn's Personal News Reader

A local news aggregator with RSS feeds, paywall bypass, and three switchable UI styles.

## Quick Start

```bash
cd /Users/jill/clawd/newsreader-project
npm install
npm start
```

Then open: **http://localhost:3000**

## Features

### 🔄 RSS Aggregation
- 15+ sources across Entertainment, Politics, Tech, and General news
- Auto-refreshes every 15 minutes
- Manual refresh available

### 📖 Clean Reader Mode
- Extracts article content without ads/clutter
- Falls back to archive.today for paywalled content
- Direct links to original and archived versions

### 🏷️ Topic Word Cloud
- Auto-extracts trending topics from headlines
- Click any topic to search

### ☀️ Morning Summary
- Quick overview of top stories by category
- Perfect for catching up quickly

### 🛡️ Paywall Bypass
- Automatically tries archive.today for paywalled articles
- Direct archive links for manual access

## Three UI Styles

| URL | Style | Best For |
|-----|-------|----------|
| `/pwa` | Clean PWA | Focused reading on any device |
| `/mobile` | Mobile App | Touch-friendly, card-based browsing |
| `/dashboard` | Power Dashboard | Multi-column, filters, word cloud |

## RSS Sources (15 Active)

### Entertainment (6 sources)
- 🎬 Deadline Hollywood
- 🎭 IndieWire
- 📺 The A.V. Club
- 🎸 Rolling Stone
- 🎥 Variety
- ⭐ Hollywood Reporter

### Politics (2 sources)
- 🏛️ The Hill
- 🗳️ Politico

### Tech (4 sources)
- 💻 TechCrunch
- 📱 The Verge
- 🔬 Ars Technica
- ⚡ Wired

### General (3 sources)
- 📻 NPR News
- 🌐 AP News
- 🇬🇧 BBC News

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/articles` | GET | Get all articles (supports `?category=`, `?source=`, `?search=`) |
| `/api/categories` | GET | Articles grouped by category |
| `/api/wordcloud` | GET | Topic word cloud data |
| `/api/summary` | GET | Morning summary |
| `/api/article/read?url=` | GET | Extract article content |
| `/api/article/archive?url=` | GET | Get archive.today URL |
| `/api/sources` | GET | List all RSS sources |
| `/api/refresh` | POST | Force refresh all feeds |

## Tech Stack

- **Backend**: Node.js + Express
- **RSS Parsing**: rss-parser
- **Content Extraction**: Cheerio
- **No database** - articles cached in memory

## Customization

### Add More RSS Feeds

Edit `server.js` and add to the `RSS_FEEDS` object:

```javascript
mysite: {
  url: 'https://example.com/feed/',
  name: 'My Site',
  category: 'Entertainment',
  icon: '🎯'
}
```

### Change Refresh Interval

The cache refreshes every 15 minutes. Edit line ~280 in server.js:

```javascript
(Date.now() - new Date(articleCache.lastFetch).getTime()) > 15 * 60 * 1000
```

## Files

```
newsreader-project/
├── server.js          # Main backend
├── package.json       # Dependencies
├── README.md          # This file
└── views/
    ├── index.html     # Switcher/landing
    ├── pwa.html       # Clean PWA style
    ├── mobile.html    # Mobile app style
    └── dashboard.html # Power user dashboard
```

## Notes

- Some feeds may fail occasionally (rate limits, downtime)
- Archive.today bypass works for most paywalled sites
- Content extraction quality varies by site
- Designed for local use only

---

Built for Glenn's morning news routine ☕
