const express = require('express');
const RSSParser = require('rss-parser');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;

const app = express();

// ============================================
// GOOGLE OAUTH CONFIGURATION
// ============================================
const ALLOWED_DOMAINS = ['synthet.io', 'adopter.media'];
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || 'newsreader-secret-' + Math.random().toString(36);
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// Trust Railway's proxy for secure cookies
app.set('trust proxy', 1);

// Session configuration
const isProduction = BASE_URL.startsWith('https://');
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    sameSite: isProduction ? 'lax' : 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Passport serialization
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Google OAuth Strategy
if (GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: `${BASE_URL}/auth/google/callback`
  }, (accessToken, refreshToken, profile, done) => {
    const email = profile.emails?.[0]?.value || '';
    const domain = email.split('@')[1];
    
    if (ALLOWED_DOMAINS.includes(domain)) {
      return done(null, {
        id: profile.id,
        email: email,
        name: profile.displayName,
        picture: profile.photos?.[0]?.value
      });
    } else {
      return done(null, false, { message: 'Email domain not allowed' });
    }
  }));
}

// Auth check middleware
function requireAuth(req, res, next) {
  // Skip auth if Google OAuth not configured (local dev)
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return next();
  }
  
  if (req.isAuthenticated()) {
    return next();
  }
  
  // For API requests, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  
  // For page requests, redirect to login
  res.redirect('/login');
}

// ============================================
// NOINDEX - Block search engines
// ============================================
app.use((req, res, next) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  next();
});

const parser = new RSSParser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) NewsReader/1.0'
  },
  customFields: {
    item: [
      ['media:content', 'media:content', { keepArray: false }],
      ['media:thumbnail', 'media:thumbnail', { keepArray: false }],
      ['media:group', 'media:group', { keepArray: false }],
      ['content:encoded', 'content:encoded'],
    ]
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
  vulture: {
    url: 'https://www.vulture.com/rss/',
    name: 'Vulture',
    category: 'Entertainment',
    icon: '🦅'
  },
  people: {
    url: 'https://people.com/rss/',
    name: 'People',
    category: 'Entertainment',
    icon: '👥'
  },
  ew: {
    url: 'https://feeds.ew.com/entertainmentweekly/latest',
    name: 'Entertainment Weekly',
    category: 'Entertainment',
    icon: '📰'
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
  axios: {
    url: 'https://www.axios.com/feeds/feed.rss',
    name: 'Axios',
    category: 'Politics',
    icon: '📊'
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
  },
  nytimes: {
    url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml',
    name: 'New York Times',
    category: 'General',
    icon: '🗞️'
  },
  
  // Business
  wsj: {
    url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml',
    name: 'Wall Street Journal',
    category: 'Business',
    icon: '💼'
  },
  marketwatch: {
    url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
    name: 'MarketWatch',
    category: 'Business',
    icon: '📈'
  },
  cnbc: {
    url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
    name: 'CNBC',
    category: 'Business',
    icon: '📺'
  },
  
  // Gossip (hidden from ALL/For You)
  crazydaysandnights: {
    url: 'https://www.crazydaysandnights.net/feeds/posts/default',
    name: 'Crazy Days and Nights',
    category: 'Gossip',
    icon: '🍵',
    hidden: true
  },
  
  // Local - Las Vegas
  lvrj: {
    url: 'https://www.reviewjournal.com/feed/',
    name: 'Las Vegas Review-Journal',
    category: 'Local',
    icon: '🌵'
  },
  lvindependent: {
    url: 'https://thenevadaindependent.com/feed',
    name: 'Las Vegas Independent',
    category: 'Local',
    icon: '🎰'
  }
};

// Cache for articles
let articleCache = {
  articles: [],
  lastFetch: null,
  categories: {},
  topics: {}
};

// User preferences storage (in-memory, persisted to file)
const fs = require('fs');
const PREFS_FILE = path.join(__dirname, 'user-prefs.json');

let userPrefs = {
  readArticles: [],
  notInterestedTopics: [],
  interestedTopics: [],
  customFeeds: [],
  textSize: 1.05,
  realityMode: true,
  hideReadMode: false
};

// Load prefs from file on startup
try {
  if (fs.existsSync(PREFS_FILE)) {
    userPrefs = JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8'));
  }
} catch (e) {
  console.log('Could not load prefs file, using defaults');
}

function savePrefs() {
  try {
    fs.writeFileSync(PREFS_FILE, JSON.stringify(userPrefs, null, 2));
  } catch (e) {
    console.log('Could not save prefs:', e.message);
  }
}

// Custom feeds added by user
let customFeeds = {};

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
  
  // Filter out Gossip articles
  const filteredArticles = articles.filter(a => a.category !== 'Gossip');
  
  filteredArticles.forEach(article => {
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
  
  // Group by category (excluding Gossip)
  articles.filter(a => a.category !== 'Gossip').forEach(article => {
    if (!categories[article.category]) {
      categories[article.category] = [];
    }
    categories[article.category].push(article);
  });
  
  // Take top 3 from each category
  const summary = {
    generated: new Date().toISOString(),
    totalArticles: articles.filter(a => a.category !== 'Gossip').length,
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
    const baseUrl = new URL(url);
    
    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, .ad, .advertisement, .social-share, .comments, .related-articles, [class*="ad-"], [class*="promo"], [id*="ad-"], .sidebar, .newsletter, .subscribe').remove();
    
    // Try to find article content
    let $article = null;
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
      if (element.length && element.text().trim().length > 200) {
        $article = element;
        break;
      }
    }
    
    // Convert to markdown-like format preserving structure
    let content = '';
    
    const processElement = ($el) => {
      let result = '';
      
      $el.children().each((_, child) => {
        const $child = $(child);
        const tagName = child.tagName?.toLowerCase();
        
        if (['script', 'style', 'nav', 'aside', 'footer'].includes(tagName)) {
          return;
        }
        
        if (tagName === 'img') {
          let src = $child.attr('src') || $child.attr('data-src') || $child.attr('data-lazy-src');
          if (src) {
            // Make relative URLs absolute
            if (src.startsWith('/')) {
              src = baseUrl.origin + src;
            } else if (!src.startsWith('http')) {
              src = new URL(src, url).href;
            }
            const alt = $child.attr('alt') || '';
            result += `\n\n![${alt}](${src})\n\n`;
          }
        } else if (tagName === 'figure') {
          const $img = $child.find('img');
          let src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src');
          if (src) {
            if (src.startsWith('/')) {
              src = baseUrl.origin + src;
            } else if (!src.startsWith('http')) {
              src = new URL(src, url).href;
            }
            const alt = $img.attr('alt') || $child.find('figcaption').text().trim() || '';
            result += `\n\n![${alt}](${src})\n\n`;
          }
        } else if (tagName === 'p') {
          const text = $child.text().trim();
          if (text.length > 0) {
            result += '\n\n' + text + '\n';
          }
        } else if (tagName === 'h1') {
          result += '\n\n# ' + $child.text().trim() + '\n';
        } else if (tagName === 'h2') {
          result += '\n\n## ' + $child.text().trim() + '\n';
        } else if (tagName === 'h3') {
          result += '\n\n### ' + $child.text().trim() + '\n';
        } else if (tagName === 'blockquote') {
          result += '\n\n> ' + $child.text().trim().replace(/\n/g, '\n> ') + '\n';
        } else if (tagName === 'ul' || tagName === 'ol') {
          $child.find('li').each((_, li) => {
            result += '\n- ' + $(li).text().trim();
          });
          result += '\n';
        } else if (['div', 'section', 'article'].includes(tagName)) {
          result += processElement($child);
        }
      });
      
      return result;
    };
    
    if ($article) {
      content = processElement($article);
    }
    
    // Fallback to body paragraphs with images
    if (content.trim().length < 200) {
      content = '';
      $('p, h1, h2, h3, img, figure, blockquote').each((_, el) => {
        const $el = $(el);
        const tagName = el.tagName?.toLowerCase();
        
        if (tagName === 'img') {
          let src = $el.attr('src') || $el.attr('data-src');
          if (src) {
            if (src.startsWith('/')) src = baseUrl.origin + src;
            content += `\n\n![](${src})\n`;
          }
        } else if (tagName === 'p') {
          const text = $el.text().trim();
          if (text.length > 30) content += '\n\n' + text;
        } else if (tagName?.startsWith('h')) {
          content += '\n\n## ' + $el.text().trim();
        } else if (tagName === 'blockquote') {
          content += '\n\n> ' + $el.text().trim();
        }
      });
    }
    
    // Clean up excessive whitespace
    content = content.replace(/\n{4,}/g, '\n\n\n').trim();
    
    return {
      success: true,
      content: content.substring(0, 15000),
      source: 'direct',
      format: 'markdown'
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
        // Extract thumbnail image from various RSS fields
        let image = null;
        if (item.enclosure?.url && /image/i.test(item.enclosure.type || '')) {
          image = item.enclosure.url;
        }
        try {
          if (!image && item['media:content']?.$?.url) {
            image = item['media:content'].$.url;
          }
          if (!image && item['media:thumbnail']?.$?.url) {
            image = item['media:thumbnail'].$.url;
          }
          if (!image && item['media:group']?.['media:content']?.[0]?.$?.url) {
            image = item['media:group']['media:content'][0].$.url;
          }
        } catch(e) { /* media field parse error, skip */ }
        // Try itunes image
        if (!image && item.itunes?.image) {
          image = item.itunes.image;
        }
        // Try to extract from content
        if (!image) {
          const imgMatch = (item['content:encoded'] || item.content || '').match(/<img[^>]+src=["']([^"']+)["']/i);
          if (imgMatch) image = imgMatch[1];
        }

        articles.push({
          id: Buffer.from(item.link || item.guid || Math.random().toString()).toString('base64').substring(0, 20),
          title: item.title,
          link: item.link,
          image: image,
          contentSnippet: item.contentSnippet || item.content?.substring(0, 300) || '',
          content: item['content:encoded'] || item.content || '',
          enclosure: item.enclosure || null,
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
    
    // Filter out hidden categories (Gossip) from "All" view
    if (!req.query.category) {
      articles = articles.filter(a => a.category !== 'Gossip');
    }
    
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
      format: result.format || 'text',
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
  const allFeeds = { ...RSS_FEEDS, ...customFeeds };
  const sources = Object.entries(allFeeds).map(([key, feed]) => ({
    key,
    name: feed.name,
    category: feed.category,
    icon: feed.icon,
    url: feed.url,
    custom: !!customFeeds[key]
  }));
  
  res.json({ success: true, sources });
});

// ============================================
// USER PREFERENCES API
// ============================================

// Get user preferences
app.get('/api/prefs', (req, res) => {
  res.json({ success: true, prefs: userPrefs });
});

// Update user preferences
app.post('/api/prefs', (req, res) => {
  const updates = req.body;
  userPrefs = { ...userPrefs, ...updates };
  savePrefs();
  res.json({ success: true, prefs: userPrefs });
});

// Mark article as read
app.post('/api/prefs/read', (req, res) => {
  const { url, topics } = req.body;
  if (url && !userPrefs.readArticles.includes(url)) {
    userPrefs.readArticles.push(url);
    // Keep last 500
    if (userPrefs.readArticles.length > 500) {
      userPrefs.readArticles = userPrefs.readArticles.slice(-500);
    }
  }
  if (topics && Array.isArray(topics)) {
    topics.forEach(t => {
      if (!userPrefs.interestedTopics.includes(t)) {
        userPrefs.interestedTopics.push(t);
      }
    });
    userPrefs.interestedTopics = userPrefs.interestedTopics.slice(-200);
  }
  savePrefs();
  res.json({ success: true });
});

// Mark article as not interested
app.post('/api/prefs/not-interested', (req, res) => {
  const { url, topics } = req.body;
  if (url && !userPrefs.readArticles.includes(url)) {
    userPrefs.readArticles.push(url);
  }
  if (topics && Array.isArray(topics)) {
    topics.forEach(t => {
      if (!userPrefs.notInterestedTopics.includes(t)) {
        userPrefs.notInterestedTopics.push(t);
      }
    });
    userPrefs.notInterestedTopics = userPrefs.notInterestedTopics.slice(-200);
  }
  savePrefs();
  res.json({ success: true });
});

// Clear all preferences
app.post('/api/prefs/clear', (req, res) => {
  userPrefs = {
    readArticles: [],
    notInterestedTopics: [],
    interestedTopics: [],
    customFeeds: [],
    textSize: 1.05,
    realityMode: true,
    hideReadMode: false
  };
  savePrefs();
  res.json({ success: true, prefs: userPrefs });
});

// Get preference stats/summary
app.get('/api/prefs/stats', (req, res) => {
  // Count topic frequencies
  const likedCounts = {};
  userPrefs.interestedTopics.forEach(t => {
    likedCounts[t] = (likedCounts[t] || 0) + 1;
  });
  
  const dislikedCounts = {};
  userPrefs.notInterestedTopics.forEach(t => {
    dislikedCounts[t] = (dislikedCounts[t] || 0) + 1;
  });
  
  const topLiked = Object.entries(likedCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
  
  const topDisliked = Object.entries(dislikedCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }));
  
  res.json({
    success: true,
    stats: {
      articlesRead: userPrefs.readArticles.length,
      totalLikedTopics: userPrefs.interestedTopics.length,
      totalDislikedTopics: userPrefs.notInterestedTopics.length,
      topLiked,
      topDisliked
    }
  });
});

// Add custom feed
app.post('/api/feeds/add', async (req, res) => {
  const { url, name, category, icon } = req.body;
  if (!url) {
    return res.status(400).json({ success: false, error: 'URL required' });
  }
  
  try {
    // Test if feed is valid
    const feed = await parser.parseURL(url);
    const key = name?.toLowerCase().replace(/\s+/g, '-') || 'custom-' + Date.now();
    
    customFeeds[key] = {
      url,
      name: name || feed.title || 'Custom Feed',
      category: category || 'Custom',
      icon: icon || '📰'
    };
    
    // Save to prefs
    userPrefs.customFeeds = Object.values(customFeeds);
    savePrefs();
    
    // Refresh feeds
    await fetchAllFeeds();
    
    res.json({ 
      success: true, 
      feed: customFeeds[key],
      articlesAdded: feed.items?.length || 0
    });
  } catch (error) {
    res.status(400).json({ success: false, error: 'Could not parse feed: ' + error.message });
  }
});

// Remove custom feed
app.post('/api/feeds/remove', (req, res) => {
  const { key } = req.body;
  if (customFeeds[key]) {
    delete customFeeds[key];
    userPrefs.customFeeds = Object.values(customFeeds);
    savePrefs();
  }
  res.json({ success: true });
});

// ============================================
// AUTH ROUTES
// ============================================

// Login page
app.get('/login', (req, res) => {
  if (req.isAuthenticated()) {
    return res.redirect('/');
  }
  
  // If OAuth not configured, allow access
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return res.redirect('/');
  }
  
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="robots" content="noindex, nofollow">
      <title>Login - News Reader</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          background: #000;
          color: #fff;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .login-box {
          text-align: center;
          padding: 3rem;
          background: #1a1a1a;
          border-radius: 20px;
          max-width: 400px;
        }
        h1 { font-size: 3rem; margin-bottom: 0.5rem; }
        h2 { font-size: 1.5rem; font-weight: 400; margin-bottom: 2rem; opacity: 0.8; }
        .google-btn {
          display: inline-flex;
          align-items: center;
          gap: 0.75rem;
          background: #fff;
          color: #333;
          padding: 0.875rem 1.5rem;
          border-radius: 8px;
          font-size: 1rem;
          font-weight: 500;
          text-decoration: none;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        .google-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(255,255,255,0.2);
        }
        .google-btn img { width: 20px; height: 20px; }
        .note {
          margin-top: 1.5rem;
          font-size: 0.8rem;
          opacity: 0.6;
        }
      </style>
    </head>
    <body>
      <div class="login-box">
        <h1>📰</h1>
        <h2>News Reader</h2>
        <a href="/auth/google" class="google-btn">
          <img src="https://www.google.com/favicon.ico" alt="Google">
          Sign in with Google
        </a>
        <p class="note">Requires @synthet.io or @adopter.media email</p>
      </div>
    </body>
    </html>
  `);
});

// Google OAuth initiation
app.get('/auth/google', passport.authenticate('google', {
  scope: ['profile', 'email']
}));

// Google OAuth callback
app.get('/auth/google/callback',
  passport.authenticate('google', {
    failureRedirect: '/login?error=domain'
  }),
  (req, res) => {
    res.redirect('/');
  }
);

// Logout
app.get('/logout', (req, res) => {
  req.logout(() => {
    res.redirect('/login');
  });
});

// Get current user (for frontend)
app.get('/api/me', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ success: true, user: req.user });
  } else {
    res.json({ success: false, user: null });
  }
});

// ============================================
// VIEW ROUTES (3 UIs) - Protected
// ============================================

// Landing page / Switcher
app.get('/', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// PWA Style
app.get('/pwa', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'pwa.html'));
});

// Mobile App Style
app.get('/mobile', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'mobile.html'));
});

// Dashboard Style
app.get('/dashboard', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

// Settings/Preferences Dashboard
app.get('/dash', requireAuth, (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'dash.html'));
});

// ============================================
// START SERVER
// ============================================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  const authStatus = GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET 
    ? '🔒 Google OAuth ENABLED (synthet.io, adopter.media)'
    : '⚠️  Google OAuth DISABLED (set GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET)';
    
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║           📰 Personal News Reader Started! 📰              ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Server: ${BASE_URL.padEnd(44)}║
║  Auth:   ${authStatus.padEnd(44)}║
║  Robots: noindex, nofollow                                ║
║                                                           ║
║  Available UIs:                                           ║
║    • Mobile:    ${BASE_URL}/mobile                        
║    • Dashboard: ${BASE_URL}/dash                          
║    • PWA:       ${BASE_URL}/pwa                           
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);
  
  // Initial feed fetch
  console.log('\n📡 Fetching initial feeds...\n');
  await fetchAllFeeds();
  console.log('\n✅ Ready for Glenn!\n');
});
