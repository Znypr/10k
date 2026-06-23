import { readFile, writeFile } from 'node:fs/promises';

const STATS_PATH = new URL('../assets/stats.json', import.meta.url);
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
const checkedAt = new Date().toISOString();

const accounts = {
  gaming: {
    youtube: { handle: 'znypr', unit: 'subscribers', fetcher: fetchYouTube, minValue: 50000, maxValue: 5000000 },
    tiktok: { handle: 'znypr', unit: 'followers', fetcher: fetchTikTok },
    facebook: { handle: 'znypr', unit: 'followers', fetcher: fetchFacebook },
    twitch: { handle: 'znypr_', unit: 'followers', fetcher: fetchTwitch },
    snapchat: { handle: 'znyprgaming', unit: 'followers', fetcher: fetchSnapchat },
    instagram: { handle: 'znyprrblx', unit: 'followers', fetcher: fetchInstagram }
  },
  fitness: {
    youtube: { handle: 'znyprfit', unit: 'subscribers', fetcher: fetchYouTube, minValue: 0, maxValue: 10000 },
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

function decodeText(value = '') {
  return String(value)
    .replace(/\\u0026/g, '&')
    .replace(/\\u003c/g, '<')
    .replace(/\\u003e/g, '>')
    .replace(/\\u0022/g, '"')
    .replace(/\\\//g, '/')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|\u00a0/g, ' ');
}

function parseDisplayedCount(text) {
  if (!text) return null;
  const cleaned = decodeText(text).replace(/,/g, '').trim();
  const match = cleaned.match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return null;
  const multipliers = { K: 1e3, M: 1e6, B: 1e9 };
  const value = Number(match[1]) * (multipliers[match[2]?.toUpperCase()] || 1);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function uniqueValid(values) {
  return [...new Set(values.map(Number).filter(Number.isFinite))];
}

function chooseCandidate(values, config = {}) {
  const candidates = uniqueValid(values).filter((value) => {
    if (Number.isFinite(config.minValue) && value < config.minValue) return false;
    if (Number.isFinite(config.maxValue) && value > config.maxValue) return false;
    return true;
  });
  if (!candidates.length) return null;
  return candidates[0];
}

function findMetaContent(html, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return decodeText(
    html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1]
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i'))?.[1]
    || ''
  );
}

function collectTextCounts(text, nouns) {
  const values = [];
  for (const noun of nouns) {
    const before = new RegExp(`([\\d,.]+\\s*[KMB]?)\\s+${noun}`, 'gi');
    const after = new RegExp(`${noun}[^\\d]{0,20}([\\d,.]+\\s*[KMB]?)`, 'gi');
    for (const pattern of [before, after]) {
      for (const match of decodeText(text).matchAll(pattern)) {
        const value = parseDisplayedCount(match[1]);
        if (Number.isFinite(value)) values.push(value);
      }
    }
  }
  return values;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        'accept-language': 'en-US,en;q=0.9',
        accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
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

function validateFreshMetric(fresh, previous, config) {
  if (!Number.isFinite(fresh?.value)) throw new Error('Metric is not numeric');
  if (Number.isFinite(config.minValue) && fresh.value < config.minValue) throw new Error(`Metric below account floor: ${fresh.value}`);
  if (Number.isFinite(config.maxValue) && fresh.value > config.maxValue) throw new Error(`Metric above account ceiling: ${fresh.value}`);

  const previousValue = Number(previous?.value);
  if (Number.isFinite(previousValue) && previousValue >= 1000) {
    if (fresh.value < previousValue * 0.5) throw new Error(`Rejected suspicious drop from ${previousValue} to ${fresh.value}`);
    if (fresh.value > previousValue * 5) throw new Error(`Rejected suspicious jump from ${previousValue} to ${fresh.value}`);
  }
  return fresh;
}

async function fetchYouTube(handle, config) {
  if (process.env.YOUTUBE_API_KEY) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('forHandle', `@${handle}`);
    url.searchParams.set('key', process.env.YOUTUBE_API_KEY);
    const json = await (await fetchWithTimeout(url)).json();
    const count = Number(json.items?.[0]?.statistics?.subscriberCount);
    const selected = chooseCandidate([count], config);
    if (Number.isFinite(selected)) return result(selected, 'YouTube Data API');
  }

  const html = await fetchText(`https://www.youtube.com/@${handle}/about?hl=en&gl=US`);
  const candidates = [];

  for (const metaKey of ['og:description', 'description']) {
    candidates.push(...collectTextCounts(findMetaContent(html, metaKey), ['subscribers?']));
  }

  const headerStart = Math.max(
    html.indexOf('pageHeaderRenderer'),
    html.indexOf('c4TabbedHeaderRenderer'),
    html.indexOf('channelMetadataRenderer')
  );
  if (headerStart >= 0) {
    candidates.push(...collectTextCounts(html.slice(headerStart, headerStart + 180000), ['subscribers?']));
  }

  for (const match of html.matchAll(/"subscriberCountText"\s*:\s*\{[\s\S]{0,1200}?"(?:simpleText|label)"\s*:\s*"([^"]+)"/gi)) {
    candidates.push(...collectTextCounts(match[1], ['subscribers?']));
  }
  for (const match of html.matchAll(/\\"subscriberCountText\\"[\s\S]{0,1200}?\\"(?:simpleText|label)\\"\s*:\s*\\"([^\\"]+)\\"/gi)) {
    candidates.push(...collectTextCounts(match[1], ['subscribers?']));
  }
  candidates.push(...collectTextCounts(html, ['subscribers?']));

  const count = chooseCandidate(candidates, config);
  return result(count, 'YouTube public channel');
}

async function fetchTikTok(handle) {
  const html = await fetchText(`https://www.tiktok.com/@${handle}?lang=en`);
  const values = [];
  for (const pattern of [
    /"followerCount"\s*:\s*(\d+)/g,
    /\\"followerCount\\"\s*:\s*(\d+)/g,
    /"fans"\s*:\s*(\d+)/g
  ]) {
    for (const match of html.matchAll(pattern)) values.push(Number(match[1]));
  }
  return result(chooseCandidate(values), 'TikTok public profile');
}

async function fetchInstagram(handle) {
  const apiUrls = [
    `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`,
    `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`
  ];

  for (const url of apiUrls) {
    try {
      const response = await fetchWithTimeout(url, {
        headers: {
          'x-ig-app-id': '936619743392459',
          'x-asbd-id': '129477',
          referer: `https://www.instagram.com/${handle}/`
        }
      });
      const json = await response.json();
      const count = Number(json.data?.user?.edge_followed_by?.count ?? json.data?.user?.follower_count ?? json.user?.follower_count);
      if (Number.isFinite(count)) return result(count, 'Instagram public profile API');
    } catch (error) {
      console.warn(`Instagram API fallback for @${handle}: ${error.message}`);
    }
  }

  const pages = [
    `https://www.instagram.com/${handle}/embed/`,
    `https://www.instagram.com/${handle}/?hl=en`
  ];
  for (const url of pages) {
    try {
      const html = await fetchText(url, { headers: { referer: 'https://www.instagram.com/' } });
      const values = [];
      for (const pattern of [
        /"edge_followed_by"\s*:\s*\{"count"\s*:\s*(\d+)/g,
        /"follower_count"\s*:\s*(\d+)/g,
        /\\"follower_count\\"\s*:\s*(\d+)/g,
        /"followers"\s*:\s*(\d+)/g
      ]) {
        for (const match of html.matchAll(pattern)) values.push(Number(match[1]));
      }
      values.push(...collectTextCounts(findMetaContent(html, 'og:description'), ['followers?']));
      values.push(...collectTextCounts(findMetaContent(html, 'description'), ['followers?']));
      values.push(...collectTextCounts(html, ['followers?']));
      const count = chooseCandidate(values);
      if (Number.isFinite(count)) return result(count, 'Instagram public profile');
    } catch (error) {
      console.warn(`Instagram page fallback for @${handle}: ${error.message}`);
    }
  }
  throw new Error('No Instagram follower count exposed');
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
    url.searchParams.set('fields', 'followers_count,fan_count');
    url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN);
    const json = await (await fetchWithTimeout(url)).json();
    const count = Number(json.followers_count ?? json.fan_count);
    if (Number.isFinite(count)) return result(count, 'Meta Graph API');
  }

  const pages = [
    `https://www.facebook.com/${handle}?locale=en_US`,
    `https://m.facebook.com/${handle}/about`,
    `https://mbasic.facebook.com/${handle}`,
    `https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(`https://www.facebook.com/${handle}`)}&show_facepile=false`
  ];

  for (const url of pages) {
    try {
      const html = await fetchText(url, { headers: { referer: 'https://www.facebook.com/' } });
      const values = [];
      for (const pattern of [
        /"followers_count"\s*:\s*(\d+)/g,
        /"follower_count"\s*:\s*(\d+)/g,
        /"profile_plus_followers_count"\s*:\s*(\d+)/g,
        /"subscriber_count"\s*:\s*(\d+)/g,
        /\\"followers_count\\"\s*:\s*(\d+)/g
      ]) {
        for (const match of html.matchAll(pattern)) values.push(Number(match[1]));
      }
      values.push(...collectTextCounts(findMetaContent(html, 'og:description'), ['followers?', 'likes?']));
      values.push(...collectTextCounts(findMetaContent(html, 'description'), ['followers?', 'likes?']));
      values.push(...collectTextCounts(html, ['followers?']));
      const count = chooseCandidate(values);
      if (Number.isFinite(count)) return result(count, 'Facebook public page');
    } catch (error) {
      console.warn(`Facebook page fallback for ${handle}: ${error.message}`);
    }
  }
  throw new Error('No Facebook follower count exposed');
}

async function fetchSnapchat(handle) {
  const pages = [
    `https://www.snapchat.com/@${handle}`,
    `https://www.snapchat.com/add/${handle}`
  ];

  for (const url of pages) {
    try {
      const html = await fetchText(url);
      const values = [];
      for (const pattern of [
        /"subscriberCount"\s*:\s*(\d+)/g,
        /"subscribersCount"\s*:\s*(\d+)/g,
        /"subscriber_count"\s*:\s*(\d+)/g,
        /"followerCount"\s*:\s*(\d+)/g,
        /\\"subscriberCount\\"\s*:\s*(\d+)/g,
        /\\"subscriber_count\\"\s*:\s*(\d+)/g
      ]) {
        for (const match of html.matchAll(pattern)) values.push(Number(match[1]));
      }
      values.push(...collectTextCounts(findMetaContent(html, 'og:description'), ['subscribers?', 'followers?']));
      values.push(...collectTextCounts(findMetaContent(html, 'description'), ['subscribers?', 'followers?']));
      values.push(...collectTextCounts(html, ['subscribers?', 'followers?']));
      const count = chooseCandidate(values);
      if (Number.isFinite(count)) return result(count, 'Snapchat public profile');
    } catch (error) {
      console.warn(`Snapchat page fallback for @${handle}: ${error.message}`);
    }
  }
  throw new Error('Snapchat does not expose a public subscriber count');
}

async function fetchX(handle) {
  try {
    const response = await fetchWithTimeout(`https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(handle)}&lang=en`, {
      headers: { accept: 'application/json', referer: 'https://platform.twitter.com/' }
    });
    const json = await response.json();
    const count = Number(json?.[0]?.followers_count);
    if (Number.isFinite(count)) return result(count, 'X public syndication API');
  } catch (error) {
    console.warn(`X syndication fallback for @${handle}: ${error.message}`);
  }

  try {
    const response = await fetchWithTimeout(`https://api.fxtwitter.com/${encodeURIComponent(handle)}`, { headers: { accept: 'application/json' } });
    const json = await response.json();
    const count = Number(json.user?.followers ?? json.user?.followers_count ?? json.followers_count);
    if (Number.isFinite(count)) return result(count, 'FxTwitter public API');
  } catch (error) {
    console.warn(`FxTwitter fallback for @${handle}: ${error.message}`);
  }

  for (const url of [`https://x.com/${handle}?lang=en`, `https://twitter.com/${handle}?lang=en`, `https://nitter.net/${handle}`]) {
    try {
      const html = await fetchText(url);
      const values = [];
      for (const pattern of [
        /"followers_count"\s*:\s*(\d+)/g,
        /"followersCount"\s*:\s*(\d+)/g,
        /data-testid="UserFollowers"[^>]*>[\s\S]{0,400}?([\d,.]+\s*[KMB]?)/g
      ]) {
        for (const match of html.matchAll(pattern)) values.push(parseDisplayedCount(match[1]));
      }
      values.push(...collectTextCounts(findMetaContent(html, 'og:description'), ['followers?']));
      values.push(...collectTextCounts(findMetaContent(html, 'description'), ['followers?']));
      values.push(...collectTextCounts(html, ['followers?']));
      const count = chooseCandidate(values);
      if (Number.isFinite(count)) return result(count, 'X public profile');
    } catch (error) {
      console.warn(`X page fallback for @${handle}: ${error.message}`);
    }
  }
  throw new Error('No X follower count exposed');
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
        const fresh = validateFreshMetric(await config.fetcher(config.handle, config), previous, config);
        stats.metrics[groupName][platform] = {
          ...fresh,
          unit: config.unit,
          checkedAt,
          status: 'live'
        };
        console.log(`Updated ${groupName}.${platform}: ${fresh.value}`);
      } catch (error) {
        console.warn(`Could not update ${groupName}.${platform}: ${error.message}`);
        stats.metrics[groupName][platform] = Number.isFinite(Number(previous?.value))
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
