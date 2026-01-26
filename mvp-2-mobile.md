# MVP 2: Mobile App (React Native / Expo)

**The Native Experience** — Better offline support, push notifications, and a "real" app feel.

## Overview

A React Native mobile app using Expo for simplified development. Can be distributed via TestFlight/App Store or sideloaded. Connects to a backend API (can reuse MVP 1's API routes).

## Tech Stack

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Framework** | React Native + Expo | Cross-platform, OTA updates |
| **Navigation** | Expo Router | File-based routing |
| **Styling** | NativeWind (Tailwind) | Familiar styling |
| **State** | Zustand + React Query | Caching and sync |
| **Storage** | SQLite (expo-sqlite) | Offline article storage |
| **Backend** | Vercel API (from MVP 1) | Shared infrastructure |
| **Push** | Expo Notifications | Morning digest alerts |

## Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                     Mobile App (Expo)                          │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐   │
│  │  Feed Screen │  │ Reader Screen│  │   Digest Screen    │   │
│  │  (Tab View)  │  │  (Stack Nav) │  │   (Tab View)       │   │
│  └──────────────┘  └──────────────┘  └────────────────────┘   │
│                            │                                   │
│  ┌─────────────────────────┴─────────────────────────────┐    │
│  │              Local SQLite Database                     │    │
│  │         (offline articles, read state, feeds)          │    │
│  └───────────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                      Backend API (Vercel)                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐    │
│  │ /api/feeds  │  │/api/article │  │    /api/digest      │    │
│  └─────────────┘  └─────────────┘  └─────────────────────┘    │
└────────────────────────────────────────────────────────────────┘
```

## Project Structure

```
newsreader-mobile/
├── app/
│   ├── (tabs)/
│   │   ├── index.tsx           # Feed list
│   │   ├── digest.tsx          # Morning digest
│   │   ├── topics.tsx          # Word cloud
│   │   └── settings.tsx        # Settings
│   ├── article/[id].tsx        # Article reader
│   └── _layout.tsx             # Root layout
├── components/
│   ├── ArticleCard.tsx
│   ├── ArticleReader.tsx
│   ├── CategoryPills.tsx
│   ├── WordCloud.tsx
│   └── DigestCard.tsx
├── lib/
│   ├── api.ts                  # API client
│   ├── db.ts                   # SQLite helpers
│   ├── sync.ts                 # Offline sync
│   └── notifications.ts        # Push setup
├── hooks/
│   ├── useArticles.ts
│   ├── useDigest.ts
│   └── useOffline.ts
├── app.json                    # Expo config
├── eas.json                    # EAS Build config
└── package.json
```

## Key Features

### 1. Offline-First Article Storage

```typescript
// lib/db.ts
import * as SQLite from 'expo-sqlite';

const db = SQLite.openDatabase('newsreader.db');

export async function initDatabase() {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      link TEXT NOT NULL,
      source TEXT NOT NULL,
      category TEXT NOT NULL,
      content TEXT,
      content_snippet TEXT,
      pub_date INTEGER,
      fetched_at INTEGER,
      read INTEGER DEFAULT 0,
      saved_offline INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS feeds (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      enabled INTEGER DEFAULT 1
    );
    
    CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(pub_date DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
  `);
}

export async function saveArticlesOffline(articles: Article[]) {
  const insertStmt = await db.prepareAsync(`
    INSERT OR REPLACE INTO articles 
    (id, title, link, source, category, content_snippet, pub_date, fetched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  for (const article of articles) {
    await insertStmt.executeAsync([
      article.id,
      article.title,
      article.link,
      article.source,
      article.category,
      article.contentSnippet,
      article.pubDate?.getTime(),
      Date.now(),
    ]);
  }
}

export async function getOfflineArticles(
  category?: string, 
  limit = 50
): Promise<Article[]> {
  const query = category 
    ? `SELECT * FROM articles WHERE category = ? ORDER BY pub_date DESC LIMIT ?`
    : `SELECT * FROM articles ORDER BY pub_date DESC LIMIT ?`;
    
  const params = category ? [category, limit] : [limit];
  const result = await db.getAllAsync(query, params);
  
  return result.map(row => ({
    id: row.id,
    title: row.title,
    link: row.link,
    source: row.source,
    category: row.category,
    contentSnippet: row.content_snippet,
    pubDate: row.pub_date ? new Date(row.pub_date) : undefined,
    read: Boolean(row.read),
  }));
}
```

### 2. Background Sync

```typescript
// lib/sync.ts
import * as BackgroundFetch from 'expo-background-fetch';
import * as TaskManager from 'expo-task-manager';
import { fetchArticlesFromAPI, saveArticlesOffline } from './db';

const BACKGROUND_FETCH_TASK = 'background-feed-fetch';

TaskManager.defineTask(BACKGROUND_FETCH_TASK, async () => {
  try {
    const articles = await fetchArticlesFromAPI();
    await saveArticlesOffline(articles);
    return BackgroundFetch.BackgroundFetchResult.NewData;
  } catch (error) {
    return BackgroundFetch.BackgroundFetchResult.Failed;
  }
});

export async function registerBackgroundSync() {
  return BackgroundFetch.registerTaskAsync(BACKGROUND_FETCH_TASK, {
    minimumInterval: 15 * 60, // 15 minutes
    stopOnTerminate: false,
    startOnBoot: true,
  });
}
```

### 3. Push Notifications for Morning Digest

```typescript
// lib/notifications.ts
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';

export async function setupNotifications() {
  if (!Device.isDevice) return;
  
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return;
  
  // Schedule daily morning digest notification
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '☀️ Morning News Digest',
      body: 'Tap to see your personalized news briefing',
      data: { screen: 'digest' },
    },
    trigger: {
      hour: 7,
      minute: 0,
      repeats: true,
    },
  });
}

export async function sendDigestNotification(digest: Digest) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '📰 Your Morning Briefing',
      body: digest.summary.slice(0, 100) + '...',
      data: { digestId: digest.id },
    },
    trigger: null, // Send immediately
  });
}
```

### 4. Reader Mode with Save for Offline

```tsx
// app/article/[id].tsx
import { useLocalSearchParams } from 'expo-router';
import { useArticle } from '@/hooks/useArticle';
import { saveFullArticle } from '@/lib/db';

export default function ArticleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { article, isLoading, isOffline } = useArticle(id);
  
  const handleSaveOffline = async () => {
    if (article?.content) {
      await saveFullArticle(id, article.content);
      toast.success('Saved for offline reading');
    }
  };
  
  if (isLoading) {
    return <LoadingSpinner />;
  }
  
  return (
    <ScrollView className="flex-1 bg-white">
      <View className="px-4 py-6">
        <Text className="text-2xl font-bold mb-2">{article.title}</Text>
        {article.byline && (
          <Text className="text-gray-500 mb-4">{article.byline}</Text>
        )}
        
        {isOffline && (
          <View className="bg-yellow-50 p-3 rounded-lg mb-4">
            <Text className="text-yellow-800 text-sm">
              📴 You're offline. Showing cached version.
            </Text>
          </View>
        )}
        
        <RenderHtml 
          contentWidth={width - 32}
          source={{ html: article.content }}
          tagsStyles={articleStyles}
        />
      </View>
      
      <FAB 
        icon="bookmark" 
        onPress={handleSaveOffline}
        className="absolute bottom-4 right-4"
      />
    </ScrollView>
  );
}
```

## UI Screens

### Feed Screen
```tsx
// app/(tabs)/index.tsx
import { FlashList } from '@shopify/flash-list';
import { useArticles } from '@/hooks/useArticles';
import { ArticleCard } from '@/components/ArticleCard';

export default function FeedScreen() {
  const [category, setCategory] = useState<string | null>(null);
  const { articles, isLoading, refetch } = useArticles(category);
  
  return (
    <View className="flex-1 bg-gray-50">
      <CategoryPills 
        selected={category} 
        onSelect={setCategory}
        categories={['all', 'politics', 'entertainment', 'tech']}
      />
      
      <FlashList
        data={articles}
        renderItem={({ item }) => (
          <ArticleCard 
            article={item}
            onPress={() => router.push(`/article/${item.id}`)}
          />
        )}
        estimatedItemSize={100}
        onRefresh={refetch}
        refreshing={isLoading}
        ListEmptyComponent={
          <EmptyState 
            icon="newspaper"
            message="No articles yet"
          />
        }
      />
    </View>
  );
}
```

### Digest Screen
```tsx
// app/(tabs)/digest.tsx
import { useDigest } from '@/hooks/useDigest';

export default function DigestScreen() {
  const { digest, isLoading, generateNew } = useDigest();
  
  return (
    <ScrollView className="flex-1 bg-white p-4">
      <View className="mb-6">
        <Text className="text-3xl font-bold">Good Morning ☀️</Text>
        <Text className="text-gray-500 mt-1">
          {format(new Date(), 'EEEE, MMMM d')}
        </Text>
      </View>
      
      {isLoading ? (
        <DigestSkeleton />
      ) : digest ? (
        <>
          <View className="bg-gray-50 rounded-xl p-4 mb-6">
            <Text className="text-lg leading-relaxed">
              {digest.summary}
            </Text>
          </View>
          
          <Text className="font-semibold mb-3">Top Stories</Text>
          {digest.topStories.map(story => (
            <DigestCard key={story.id} story={story} />
          ))}
        </>
      ) : (
        <Button onPress={generateNew}>Generate Digest</Button>
      )}
    </ScrollView>
  );
}
```

## Distribution Options

### Option A: TestFlight (iOS) / Internal Testing (Android)
- **Pros:** No app store review, easy updates
- **Cons:** Limited to invited testers
- **Best for:** Personal use, small group

```bash
# Build for TestFlight
eas build --platform ios --profile preview
eas submit --platform ios

# Build for Android Internal
eas build --platform android --profile preview
```

### Option B: App Store / Play Store
- **Pros:** "Real" app, wider distribution
- **Cons:** Review process, potential rejection (RSS readers are generic)
- **Best for:** If Glenn wants to share widely

### Option C: Sideloading
- **iOS:** Requires AltStore or enterprise certificate
- **Android:** Direct APK install
- **Best for:** Personal use without Apple/Google involvement

## Expo Configuration

```json
// app.json
{
  "expo": {
    "name": "News Reader",
    "slug": "newsreader",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "plugins": [
      "expo-router",
      "expo-sqlite",
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png"
        }
      ]
    ],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.glenn.newsreader",
      "infoPlist": {
        "UIBackgroundModes": ["fetch", "remote-notification"]
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.glenn.newsreader",
      "permissions": ["RECEIVE_BOOT_COMPLETED", "INTERNET"]
    }
  }
}
```

```json
// eas.json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal"
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      }
    },
    "production": {}
  },
  "submit": {
    "production": {}
  }
}
```

## API Client

```typescript
// lib/api.ts
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'https://your-api.vercel.app';

export async function fetchArticles(category?: string, limit = 50) {
  const params = new URLSearchParams();
  if (category) params.set('category', category);
  params.set('limit', String(limit));
  
  const response = await fetch(`${API_BASE}/api/feeds?${params}`);
  if (!response.ok) throw new Error('Failed to fetch articles');
  return response.json();
}

export async function fetchArticleContent(url: string) {
  const response = await fetch(`${API_BASE}/api/article?url=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error('Failed to fetch article');
  return response.json();
}

export async function fetchDigest(hours = 12, categories?: string[]) {
  const params = new URLSearchParams();
  params.set('hours', String(hours));
  if (categories) params.set('categories', categories.join(','));
  
  const response = await fetch(`${API_BASE}/api/digest?${params}`);
  if (!response.ok) throw new Error('Failed to generate digest');
  return response.json();
}
```

## Clawdbot Integration

The mobile app can receive digest notifications triggered by Clawdbot:

```typescript
// Backend webhook endpoint for Clawdbot
// POST /api/notify-digest

export async function POST(request: Request) {
  const { userId, digest } = await request.json();
  
  // Get user's push token from database
  const pushToken = await getUserPushToken(userId);
  
  // Send via Expo Push API
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      to: pushToken,
      title: '☀️ Morning Briefing from Clawdbot',
      body: digest.summary.slice(0, 100),
      data: { digestId: digest.id },
    }),
  });
  
  return Response.json({ success: true });
}
```

## Pros & Cons

### ✅ Pros
- **True offline support** — Full articles stored locally
- **Background sync** — Updates even when closed
- **Push notifications** — Morning digest alerts
- **Native feel** — Smoother animations, gestures
- **App icon** — Lives on home screen like a real app

### ❌ Cons
- **More development time** — ~2x compared to PWA
- **Build complexity** — EAS builds, certificates
- **Updates slower** — OTA helps, but not instant
- **Two codebases** — If also doing web
- **App store uncertainty** — May face review issues

## Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Setup | 3 hours | Expo project, navigation, config |
| Backend integration | 3 hours | API client, types |
| Feed UI | 6 hours | List, cards, categories |
| Reader | 5 hours | Article view, HTML rendering |
| Offline | 6 hours | SQLite, background sync |
| Notifications | 3 hours | Push setup, scheduling |
| Polish | 6 hours | Animations, icons, testing |
| Build & Deploy | 4 hours | EAS builds, TestFlight |
| **Total** | **~36 hours** | Working mobile app |

---

*Choose this approach if native experience and offline access are priorities.*
