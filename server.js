const express = require('express');
const RSSParser = require('rss-parser');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');

const app = express();
const parser = new RSSParser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) NewsReader/1.0'
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================
// RSS FEED CONFIGURATION
// ============================================
const RSS_FEEDS = {
  // Entertainment
  deadline: {
    url: 'https://deadline.com/feed/',
    name: 'Deadline',
    category: 'Entertainment',
    icon: '🎬'
  },
  indiewire: {
    url: 'https://www.indiewire.com/feed/',
    name: 'IndieWire',
    category: 'Entertainment',
    icon: '🎭'
  },
  avclub: {
    url: 'https://www.avclub.com/rss',
    name: 'The A.V. Club',
    category: 'Entertainment',
    icon: '📺'
  },
  rollingstone: {
    url: 'https://www.rollingstone.com/feed/',
    name: 'Rolling Stone',
    category: 'Entertainment',
    icon: '🎸'
  },
  variety: {
    url: 'https://variety.com/feed/',
    name: 'Variety',
    category: 'Entertainment',
    icon: '🎥'
  },
  hollywoodreporter: {
    url: 'https://www.hollywoodreporter.com/feed/',
    name: 'Hollywood Reporter',
    category: 'Entertainment',
    icon: '⭐'
  },
  
  // Politics
  thehill: {
    url: 'https://thehill.com/feed/',
    name: 'The Hill',
    category: 'Politics',
    icon: '🏛️'
  },
  politico: {
    url: 'https://www.politico.com/rss/politicopicks.xml',
    name: 'Politico',
    category: 'Politics',
    icon: '🗳️'
  },
  
  // Tech
  techcrunch: {
    url: 'https://techcrunch.com/feed/',
    name: 'TechCrunch',
    category: 'Tech',
    icon: '💻'
  },
  theverge: {
    url: 'https://www.theverge.com/rss/index.xml',
    name: 'The Verge',
    category: 'Tech',
    icon: '📱'
  },
  arstechnica: {
    url: 'https://feeds.arstechnica.com/arstechnica/index',
    name: 'Ars Technica',
    category: 'Tech',
    icon: '🔬'
  },
  wired: {
    url: 'https://www.wired.com/feed/rss',
    name: 'Wired',
    category: 'Tech',
    icon: '⚡'
  },
  
  // General News
  npr: {
    url: 'https://feeds.npr.org/1001/rss.xml',
    name: 'NPR News',
    category: 'General',
    icon: '📻'
  },
  apnews: {
    url: 'https://feedx.net/rss/ap.xml',
    name: 'AP News',
    category: 'General',
    icon: '🌐'
  },
  bbc: {
    url: 'https://feeds.bbci.co.uk/news/rss.xml',
    name: 'BBC News',
    category: 'General',
    icon: '🇬🇧'
  }
};

// Cache for articles
let articleCache = {
  articles: [],
  lastFetch: null,
  categories: {},
  topics: {}
};

// ============================================
// HELPER FUNCTIONS
// ============================================

// Extract topics/keywords from text
function extractTopics(text) {
  if (!text) return [];
  
  // Common words to exclude
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after',
    'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once',
    'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now', 'says', 'said',
    'new', 'has', 'have', 'had', 'was', 'were', 'been', 'being', 'its', 'this',
    'that', 'these', 'those', 'what', 'which', 'who', 'whom', 'their', 'them',
    'his', 'her', 'she', 'he', 'it', 'you', 'your', 'we', 'our', 'they', 'are',
    'is', 'be', 'as', 'if', 'would', 'could', 'get', 'like', 'make', 'made',
    'over', 'also', 'back', 'first', 'year', 'years', 'one', 'two', 'may', 'out'
  ]);
  
  const words = text.toLowerCase()
    .replace(/[^a-zA-Z\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 3 && !stopWords.has(word));
  
  return words;
}

// Build word cloud data from articles
function buildWordCloud(articles) {
  const wordCounts = {};
  
  articles.forEach(article => {
    const text = `${article.title} ${article.contentSnippet || ''}`;
    const words = extractTopics(text);
    
    words.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
  });
  
  // Sort by count and return top 50
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([word, count]) => ({ word, count }));
}

// Generate morning summary
function generateMorningSummary(articles) {
  const categories = {};
  
  // Group by category
  articles.forEach(article => {
    if (!categories[article.category]) {
      categories[article.category] = [];
    }
    categories[article.category].push(article);
  });
  
  // Take top 3 from each category
  const summary = {
    generated: new Date().toISOString(),
    totalArticles: articles.length,
    categories: {}
  };
  
  Object.keys(categories).forEach(cat => {
    summary.categories[cat] = {
      count: categories[cat].length,
      topStories: categories[cat].slice(0, 3).map(a => ({
        title: a.title,
        source: a.source,
        link: a.link,
        publishedAt: a.publishedAt
      }))
    };
  });
  
  return summary;
}

// Fetch article content with paywall bypass
async function fetchArticleContent(url) {
  try {
    // First try direct fetch
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      timeout: 15000
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, .ad, .advertisement, .social-share, .comments, .related-articles, [class*="ad-"], [class*="promo"], [id*="ad-"]').remove();
    
    // Try to find article content
    let content = '';
    const selectors = [
      'article',
      '[class*="article-body"]',
      '[class*="article-content"]',
      '[class*="post-content"]',
      '[class*="entry-content"]',
      '.story-body',
      '.content-body',
      'main'
    ];
    
    for (const selector of selectors) {
      const element = $(selector);
      if (element.length) {
        content = element.text().trim();
        if (content.length > 200) break;
      }
    }
    
    // Fallback to body paragraphs
    if (content.length < 200) {
      content = $('p').map((_, el) => $(el).text()).get().join('\n\n');
    }
    
    // Clean up whitespace
    content = content.replace(/\s+/g, ' ').trim();
    
    return {
      success: true,
      content: content.substring(0, 10000),
      source: 'direct'
    };
  } catch (error) {
    console.log(`Direct fetch failed for ${url}: ${error.message}`);
    return { success: false, content: '', source: 'failed' };
  }
}

// Get archive.today URL for paywall bypass
async function getArchiveUrl(url) {
  try {
    // Check if archive exists
    const checkUrl = `https://archive.today/newest/${encodeURIComponent(url)}`;
    
    const response = await fetch(checkUrl, {
      method: 'HEAD',
      redirect: 'manual',
      timeout: 10000
    });
    
    if (response.status === 302 || response.status === 301) {
      const archiveUrl = response.headers.get('location');
      return { success: true, archiveUrl };
    }
    
    // If no archive exists, try to create one
    return { 
      success: true, 
      archiveUrl: `https://archive.today/?run=1&url=${encodeURIComponent(url)}`,
      note: 'Archive may not exist yet - this will attempt to create one'
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Fetch archive.today content
async function fetchFromArchive(url) {
  try {
    const archiveCheck = `https://archive.today/newest/${encodeURIComponent(url)}`;
    
    const response = await fetch(archiveCheck, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      redirect: 'follow',
      timeout: 15000
    });
    
    if (!response.ok) {
      return { success: false, content: '', source: 'archive-failed' };
    }
    
    const html = await response.text();
    const $ = cheerio.load(html);
    
    // archive.today wraps content in #CONTENT div
    let content = $('#CONTENT').text() || $('article').text() || $('body').text();
    content = content.replace(/\s+/g, ' ').trim();
    
    return {
      success: content.length > 100,
      content: content.substring(0, 10000),
      source: 'archive.today',
      archiveUrl: response.url
    };
  } catch (error) {
    return { success: false, content: '', source: 'archive-error', error: error.message };
  }
}

// ============================================
// FETCH ALL FEEDS
// ============================================
async function fetchAllFeeds() {
  console.log('Fetching all RSS feeds...');
  const articles = [];
  const errors = [];
  
  const feedPromises = Object.entries(RSS_FEEDS).map(async ([key, feed]) => {
    try {
      console.log(`  Fetching ${feed.name}...`);
      const parsed = await parser.parseURL(feed.url);
      
      parsed.items.forEach(item => {
        articles.push({
          id: Buffer.from(item.link || item.guid || Math.random().toString()).toString('base64').substring(0, 20),
          title: item.title,
          link: item.link,
          contentSnippet: item.contentSnippet || item.content?.substring(0, 300) || '',
          publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
          source: feed.name,
          sourceKey: key,
          category: feed.category,
          icon: feed.icon,
          author: item.creator || item.author || feed.name
        });
      });
      
      console.log(`  ✓ ${feed.name}: ${parsed.items.length} articles`);
    } catch (error) {
      console.error(`  ✗ ${feed.name}: ${error.message}`);
      errors.push({ feed: feed.name, error: error.message });
    }
  });
  
  await Promise.all(feedPromises);
  
  // Sort by date (newest first)
  articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
  
  // Update cache
  articleCache = {
    articles,
    lastFetch: new Date().toISOString(),
    categories: groupByCategory(articles),
    topics: buildWordCloud(articles),
    errors
  };
  
  console.log(`Fetched ${articles.length} total articles`);
  return articleCache;
}

function groupByCategory(articles) {
  const categories = {};
  articles.forEach(article => {
    if (!categories[article.category]) {
      categories[article.category] = [];
    }
    categories[article.category].push(article);
  });
  return categories;
}

// ============================================
// API ROUTES
// ============================================

// Get all articles
app.get('/api/articles', async (req, res) => {
  try {
    // Refresh if cache is older than 15 minutes
    if (!articleCache.lastFetch || 
        (Date.now() - new Date(articleCache.lastFetch).getTime()) > 15 * 60 * 1000) {
      await fetchAllFeeds();
    }
    
    let articles = [...articleCache.articles];
    
    // Filter by category
    if (req.query.category) {
      articles = articles.filter(a => a.category === req.query.category);
    }
    
    // Filter by source
    if (req.query.source) {
      articles = articles.filter(a => a.sourceKey === req.query.source);
    }
    
    // Search
    if (req.query.search) {
      const search = req.query.search.toLowerCase();
      articles = articles.filter(a => 
        a.title.toLowerCase().includes(search) ||
        (a.contentSnippet && a.contentSnippet.toLowerCase().includes(search))
      );
    }
    
    // Pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const start = (page - 1) * limit;
    
    res.json({
      success: true,
      articles: articles.slice(start, start + limit),
      total: articles.length,
      page,
      lastFetch: articleCache.lastFetch
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get articles by category
app.get('/api/categories', async (req, res) => {
  try {
    if (!articleCache.lastFetch) {
      await fetchAllFeeds();
    }
    
    const categorySummary = {};
    Object.entries(articleCache.categories).forEach(([cat, articles]) => {
      categorySummary[cat] = {
        count: articles.length,
        latest: articles.slice(0, 5)
      };
    });
    
    res.json({
      success: true,
      categories: categorySummary,
      lastFetch: articleCache.lastFetch
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get word cloud data
app.get('/api/wordcloud', async (req, res) => {
  try {
    if (!articleCache.lastFetch) {
      await fetchAllFeeds();
    }
    
    res.json({
      success: true,
      topics: articleCache.topics,
      lastFetch: articleCache.lastFetch
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get morning summary
app.get('/api/summary', async (req, res) => {
  try {
    if (!articleCache.lastFetch) {
      await fetchAllFeeds();
    }
    
    const summary = generateMorningSummary(articleCache.articles);
    
    res.json({
      success: true,
      summary,
      lastFetch: articleCache.lastFetch
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch article content (reader mode)
app.get('/api/article/read', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL required' });
    }
    
    // Try direct fetch first
    let result = await fetchArticleContent(url);
    
    // If direct fails or content is too short (possible paywall), try archive
    if (!result.success || result.content.length < 500) {
      console.log(`Trying archive.today for ${url}`);
      const archiveResult = await fetchFromArchive(url);
      if (archiveResult.success && archiveResult.content.length > result.content.length) {
        result = archiveResult;
      }
    }
    
    res.json({
      success: result.success,
      content: result.content,
      source: result.source,
      archiveUrl: result.archiveUrl,
      originalUrl: url
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get archive URL for an article
app.get('/api/article/archive', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL required' });
    }
    
    const result = await getArchiveUrl(url);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Force refresh feeds
app.post('/api/refresh', async (req, res) => {
  try {
    const result = await fetchAllFeeds();
    res.json({
      success: true,
      articleCount: result.articles.length,
      categories: Object.keys(result.categories),
      errors: result.errors,
      lastFetch: result.lastFetch
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get feed sources info
app.get('/api/sources', (req, res) => {
  const sources = Object.entries(RSS_FEEDS).map(([key, feed]) => ({
    key,
    name: feed.name,
    category: feed.category,
    icon: feed.icon,
    url: feed.url
  }));
  
  res.json({ success: true, sources });
});

// ============================================
// VIEW ROUTES (3 UIs)
// ============================================

// Landing page / Switcher
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// PWA Style
app.get('/pwa', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'pwa.html'));
});

// Mobile App Style
app.get('/mobile', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'mobile.html'));
});

// Dashboard Style
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           📰 Personal News Reader Started! 📰              ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Server running at: http://localhost:${PORT}                 ║
║                                                           ║
║  Available UIs:                                           ║
║    • Switcher:  http://localhost:${PORT}/                    ║
║    • PWA:       http://localhost:${PORT}/pwa                 ║
║    • Mobile:    http://localhost:${PORT}/mobile              ║
║    • Dashboard: http://localhost:${PORT}/dashboard           ║
║                                                           ║
║  API Endpoints:                                           ║
║    • GET /api/articles    - All articles                  ║
║    • GET /api/categories  - By category                   ║
║    • GET /api/wordcloud   - Topic word cloud              ║
║    • GET /api/summary     - Morning summary               ║
║    • GET /api/article/read?url=... - Reader mode          ║
║    • POST /api/refresh    - Force refresh feeds           ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  // Initial feed fetch
  console.log('\n📡 Fetching initial feeds...\n');
  await fetchAllFeeds();
  console.log('\n✅ Ready for Glenn!\n');
});
