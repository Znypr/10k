import { readFile, writeFile } from 'node:fs/promises';

const STATS_PATH = new URL('../assets/stats.json', import.meta.url);
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const checkedAt = new Date().toISOString();

const accounts = {
  gaming: {
    youtube: { handle: 'znypr', unit: 'subscribers', fetcher: fetchYouTube },
    tiktok: { handle: 'znypr', unit: 'followers', fetcher: fetchTikTok },
    facebook: { handle: 'znypr', unit: 'followers', fetcher: fetchFacebook },
    twitch: { handle: 'znypr_', unit: 'followers', fetcher: fetchTwitch },
    snapchat: { handle: 'znyprgaming', unit: 'followers', fetcher: fetchSnapchat },
    instagram: { handle: 'znyprrblx', unit: 'followers', fetcher: fetchInstagram }
  },
  fitness: {
    youtube: { handle: 'znyprfit', unit: 'subscribers', fetcher: fetchYouTube },
    tiktok: { handle: 'znyprfit', unit: 'followers', fetcher: fetchTikTok },
    instagram: { handle: 'znypr', unit: 'followers', fetcher: fetchInstagram },
    facebook: { handle: 'znyprfit', unit: 'followers', fetcher: fetchFacebook },
    snapchat: { handle: 'znypr', unit: 'followers', fetcher: fetchSnapchat },
    twitter: { handle: 'znyprfit', unit: 'followers', fetcher: fetchX }
  }
};

function compact(value) {
  return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function parseDisplayedCount(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/\u00a0/g, ' ').replace(/,/g, '').trim();
  const match = cleaned.match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return null;
  const multipliers = { K: 1e3, M: 1e6, B: 1e9 };
  return Math.round(Number(match[1]) * (multipliers[match[2]?.toUpperCase()] || 1));
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'en-US,en;q=0.9',
        accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, options) {
  return (await fetchWithTimeout(url, options)).text();
}

function result(value, source, display = null) {
  if (!Number.isFinite(value)) throw new Error('No public count found');
  return { value, display: display || compact(value), source };
}

async function fetchYouTube(handle) {
  if (process.env.YOUTUBE_API_KEY) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('forHandle', `@${handle}`);
    url.searchParams.set('key', process.env.YOUTUBE_API_KEY);
    const json = await (await fetchWithTimeout(url)).json();
    const count = Number(json.items?.[0]?.statistics?.subscriberCount);
    if (Number.isFinite(count)) return result(count, 'YouTube Data API');
  }

  const html = await fetchText(`https://www.youtube.com/@${handle}/about`);
  const label = html.match(/"subscriberCountText"\s*:\s*\{[\s\S]{0,500}?"(?:simpleText|label)"\s*:\s*"([^"]+?)\s+subscribers?/i)?.[1]
    || html.match(/([\d.]+\s*[KMB]?)\s+subscribers/i)?.[1];
  const count = parseDisplayedCount(label);
  return result(count, 'YouTube public profile', label?.replace(/\s+subscribers?/i, '').trim());
}

async function fetchTikTok(handle) {
  const html = await fetchText(`https://www.tiktok.com/@${handle}?lang=en`);
  const raw = html.match(/"followerCount"\s*:\s*(\d+)/)?.[1]
    || html.match(/\\"followerCount\\"\s*:\s*(\d+)/)?.[1];
  return result(Number(raw), 'TikTok public profile');
}

async function fetchInstagram(handle) {
  try {
    const response = await fetchWithTimeout(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, {
      headers: {
        'x-ig-app-id': '936619743392459',
        referer: `https://www.instagram.com/${handle}/`
      }
    });
    const json = await response.json();
    const count = Number(json.data?.user?.edge_followed_by?.count ?? json.data?.user?.follower_count);
    if (Number.isFinite(count)) return result(count, 'Instagram public profile API');
  } catch (error) {
    console.warn(`Instagram API fallback for @${handle}: ${error.message}`);
  }

  const html = await fetchText(`https://www.instagram.com/${handle}/`);
  const exact = html.match(/"edge_followed_by"\s*:\s*\{"count"\s*:\s*(\d+)/)?.[1]
    || html.match(/"follower_count"\s*:\s*(\d+)/)?.[1];
  if (exact) return result(Number(exact), 'Instagram public profile');
  const display = html.match(/([\d,.]+\s*[KMB]?)\s+Followers/i)?.[1];
  return result(parseDisplayedCount(display), 'Instagram public profile', display);
}

async function fetchTwitch(handle) {
  if (process.env.TWITCH_CLIENT_ID && process.env.TWITCH_CLIENT_SECRET) {
    const tokenUrl = new URL('https://id.twitch.tv/oauth2/token');
    tokenUrl.searchParams.set('client_id', process.env.TWITCH_CLIENT_ID);
    tokenUrl.searchParams.set('client_secret', process.env.TWITCH_CLIENT_SECRET);
    tokenUrl.searchParams.set('grant_type', 'client_credentials');
    const token = await (await fetchWithTimeout(tokenUrl, { method: 'POST' })).json();
    const headers = { 'client-id': process.env.TWITCH_CLIENT_ID, authorization: `Bearer ${token.access_token}` };
    const user = await (await fetchWithTimeout(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(handle)}`, { headers })).json();
    const id = user.data?.[0]?.id;
    if (id) {
      const followers = await (await fetchWithTimeout(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${id}`, { headers })).json();
      if (Number.isFinite(Number(followers.total))) return result(Number(followers.total), 'Twitch Helix API');
    }
  }

  const body = JSON.stringify({
    operationName: 'ChannelFollowers',
    variables: { login: handle },
    query: 'query ChannelFollowers($login: String!) { user(login: $login) { followers { totalCount } } }'
  });
  const response = await fetchWithTimeout('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'client-id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'content-type': 'application/json' },
    body
  });
  const json = await response.json();
  return result(Number(json.data?.user?.followers?.totalCount), 'Twitch public GraphQL');
}

async function fetchFacebook(handle) {
  if (process.env.META_ACCESS_TOKEN) {
    const url = new URL(`https://graph.facebook.com/v23.0/${handle}`);
    url.searchParams.set('fields', 'followers_count');
    url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN);
    const json = await (await fetchWithTimeout(url)).json();
    if (Number.isFinite(Number(json.followers_count))) return result(Number(json.followers_count), 'Meta Graph API');
  }

  const html = await fetchText(`https://www.facebook.com/${handle}`);
  const exact = html.match(/"followers_count"\s*:\s*(\d+)/)?.[1]
    || html.match(/"follower_count"\s*:\s*(\d+)/)?.[1];
  if (exact) return result(Number(exact), 'Facebook public page');
  const display = html.match(/([\d,.]+\s*[KMB]?)\s+followers/i)?.[1];
  return result(parseDisplayedCount(display), 'Facebook public page', display);
}

async function fetchSnapchat(handle) {
  const html = await fetchText(`https://www.snapchat.com/add/${handle}`);
  const exact = html.match(/"subscriberCount"\s*:\s*(\d+)/)?.[1]
    || html.match(/"subscribersCount"\s*:\s*(\d+)/)?.[1]
    || html.match(/"followerCount"\s*:\s*(\d+)/)?.[1];
  if (exact) return result(Number(exact), 'Snapchat public profile');
  const display = html.match(/([\d,.]+\s*[KMB]?)\s+(?:subscribers|followers)/i)?.[1];
  return result(parseDisplayedCount(display), 'Snapchat public profile', display);
}

async function fetchX(handle) {
  const response = await fetchWithTimeout(`https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(handle)}`, {
    headers: { accept: 'application/json' }
  });
  const json = await response.json();
  return result(Number(json?.[0]?.followers_count), 'X public syndication API');
}

async function main() {
  const stats = JSON.parse(await readFile(STATS_PATH, 'utf8'));
  stats.version = 2;
  stats.metrics ||= {};

  for (const [groupName, group] of Object.entries(accounts)) {
    stats.metrics[groupName] ||= {};
    for (const [platform, config] of Object.entries(group)) {
      const previous = stats.metrics[groupName][platform];
      try {
        const fresh = await config.fetcher(config.handle);
        stats.metrics[groupName][platform] = {
          ...fresh,
          unit: config.unit,
          checkedAt,
          status: 'live'
        };
        console.log(`Updated ${groupName}.${platform}: ${fresh.value}`);
      } catch (error) {
        console.warn(`Could not update ${groupName}.${platform}: ${error.message}`);
        stats.metrics[groupName][platform] = previous
          ? { ...previous, unit: config.unit, checkedAt, status: 'stale' }
          : { value: null, display: null, unit: config.unit, checkedAt, status: 'unavailable' };
      }
    }
  }

  stats.updatedAt = checkedAt;
  await writeFile(STATS_PATH, `${JSON.stringify(stats, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
