import { readFile, writeFile } from 'node:fs/promises';

const STATS_PATH = new URL('../assets/stats.json', import.meta.url);
const checkedAt = new Date().toISOString();
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

const accounts = {
  gaming: {
    youtube: { handle: 'znypr', unit: 'subscribers', fetcher: fetchYouTube, min: 50000, max: 5000000 },
    tiktok: { handle: 'znypr', unit: 'followers', fetcher: fetchTikTok },
    facebook: { handle: 'znypr', unit: 'followers', fetcher: fetchFacebook },
    twitch: { handle: 'znypr_', unit: 'followers', fetcher: fetchTwitch },
    snapchat: { handle: 'znyprgaming', unit: 'followers', fetcher: fetchSnapchat },
    instagram: { handle: 'znyprrblx', unit: 'followers', fetcher: fetchInstagram }
  },
  fitness: {
    youtube: { handle: 'znyprfit', unit: 'subscribers', fetcher: fetchYouTube, min: 0, max: 10000 },
    tiktok: { handle: 'znyprfit', unit: 'followers', fetcher: fetchTikTok },
    instagram: { handle: 'znypr', unit: 'followers', fetcher: fetchInstagram },
    facebook: { handle: 'znyprfit', unit: 'followers', fetcher: fetchFacebook },
    snapchat: { handle: 'znypr', unit: 'followers', fetcher: fetchSnapchat },
    twitter: { handle: 'znyprfit', unit: 'followers', fetcher: fetchX }
  }
};

const compact = (value) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseCount(value) {
  if (!value) return null;
  const match = String(value).replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i);
  if (!match) return null;
  const multiplier = { K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase()] || 1;
  return Math.round(Number(match[1]) * multiplier);
}

function candidatesFromText(text, words = ['followers?']) {
  const values = [];
  for (const word of words) {
    const regex = new RegExp(`([\\d,.]+\\s*[KMB]?)\\s+${word}`, 'gi');
    for (const match of String(text).matchAll(regex)) {
      const value = parseCount(match[1]);
      if (value !== null) values.push(value);
    }
  }
  return values;
}

function firstValid(values, config = {}) {
  return values
    .map(numeric)
    .find((value) => value !== null
      && (!Number.isFinite(config.min) || value >= config.min)
      && (!Number.isFinite(config.max) || value <= config.max)) ?? null;
}

function result(value, source) {
  if (!Number.isFinite(value)) throw new Error('No public count found');
  return { value, display: compact(value), source };
}

async function request(url, options = {}) {
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

async function text(url, options) {
  return (await request(url, options)).text();
}

function exactMatches(html, patterns) {
  const values = [];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const value = numeric(match[1]);
      if (value !== null) values.push(value);
    }
  }
  return values;
}

async function fetchYouTube(handle, config) {
  if (process.env.YOUTUBE_API_KEY) {
    const url = new URL('https://www.googleapis.com/youtube/v3/channels');
    url.searchParams.set('part', 'statistics');
    url.searchParams.set('forHandle', `@${handle}`);
    url.searchParams.set('key', process.env.YOUTUBE_API_KEY);
    const json = await (await request(url)).json();
    const apiValue = firstValid([json.items?.[0]?.statistics?.subscriberCount], config);
    if (apiValue !== null) return result(apiValue, 'YouTube Data API');
  }

  const html = await text(`https://www.youtube.com/@${handle}/about?hl=en&gl=US`);
  const values = [];
  const headerPositions = ['pageHeaderRenderer', 'c4TabbedHeaderRenderer', 'channelMetadataRenderer']
    .map((key) => html.indexOf(key)).filter((position) => position >= 0);
  if (headerPositions.length) {
    values.push(...candidatesFromText(html.slice(Math.min(...headerPositions), Math.min(...headerPositions) + 180000), ['subscribers?']));
  }
  for (const match of html.matchAll(/"subscriberCountText"[\s\S]{0,1200}?"(?:simpleText|label)"\s*:\s*"([^"]+)"/gi)) {
    values.push(...candidatesFromText(match[1], ['subscribers?']));
  }
  values.push(...candidatesFromText(html, ['subscribers?']));
  return result(firstValid(values, config), 'YouTube public channel');
}

async function fetchTikTok(handle) {
  const html = await text(`https://www.tiktok.com/@${handle}?lang=en`);
  const values = exactMatches(html, [/"followerCount"\s*:\s*(\d+)/g, /\\"followerCount\\"\s*:\s*(\d+)/g]);
  return result(firstValid(values), 'TikTok public profile');
}

async function fetchTwitch(handle) {
  const body = JSON.stringify({
    operationName: 'ChannelFollowers',
    variables: { login: handle },
    query: 'query ChannelFollowers($login: String!) { user(login: $login) { followers { totalCount } } }'
  });
  const json = await (await request('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: { 'client-id': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'content-type': 'application/json' },
    body
  })).json();
  return result(numeric(json.data?.user?.followers?.totalCount), 'Twitch public GraphQL');
}

async function fetchInstagram(handle) {
  for (const host of ['www.instagram.com', 'i.instagram.com']) {
    try {
      const json = await (await request(`https://${host}/api/v1/users/web_profile_info/?username=${encodeURIComponent(handle)}`, {
        headers: { 'x-ig-app-id': '936619743392459', referer: `https://www.instagram.com/${handle}/` }
      })).json();
      const value = numeric(json.data?.user?.edge_followed_by?.count ?? json.data?.user?.follower_count);
      if (value !== null) return result(value, 'Instagram public profile API');
    } catch (error) {
      console.warn(`Instagram API fallback for @${handle}: ${error.message}`);
    }
  }
  return fetchFromPages(
    [`https://www.instagram.com/${handle}/embed/`, `https://www.instagram.com/${handle}/?hl=en`],
    [/"edge_followed_by"\s*:\s*\{"count"\s*:\s*(\d+)/g, /"follower_count"\s*:\s*(\d+)/g],
    ['followers?'],
    'Instagram public profile'
  );
}

async function fetchFacebook(handle) {
  if (process.env.META_ACCESS_TOKEN) {
    const url = new URL(`https://graph.facebook.com/v23.0/${handle}`);
    url.searchParams.set('fields', 'followers_count,fan_count');
    url.searchParams.set('access_token', process.env.META_ACCESS_TOKEN);
    const json = await (await request(url)).json();
    const value = numeric(json.followers_count ?? json.fan_count);
    if (value !== null) return result(value, 'Meta Graph API');
  }
  return fetchFromPages(
    [`https://www.facebook.com/${handle}?locale=en_US`, `https://m.facebook.com/${handle}/about`, `https://mbasic.facebook.com/${handle}`],
    [/"followers_count"\s*:\s*(\d+)/g, /"follower_count"\s*:\s*(\d+)/g, /"profile_plus_followers_count"\s*:\s*(\d+)/g],
    ['followers?'],
    'Facebook public page'
  );
}

async function fetchSnapchat(handle) {
  return fetchFromPages(
    [`https://www.snapchat.com/@${handle}`, `https://www.snapchat.com/add/${handle}`],
    [/"subscriberCount"\s*:\s*(\d+)/g, /"subscriber_count"\s*:\s*(\d+)/g, /"followerCount"\s*:\s*(\d+)/g],
    ['subscribers?', 'followers?'],
    'Snapchat public profile'
  );
}

async function fetchX(handle) {
  try {
    const json = await (await request(`https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_names=${encodeURIComponent(handle)}&lang=en`, {
      headers: { referer: 'https://platform.twitter.com/' }
    })).json();
    const value = numeric(json?.[0]?.followers_count);
    if (value !== null) return result(value, 'X public syndication API');
  } catch (error) {
    console.warn(`X syndication fallback for @${handle}: ${error.message}`);
  }
  return fetchFromPages(
    [`https://x.com/${handle}?lang=en`, `https://twitter.com/${handle}?lang=en`],
    [/"followers_count"\s*:\s*(\d+)/g, /"followersCount"\s*:\s*(\d+)/g],
    ['followers?'],
    'X public profile'
  );
}

async function fetchFromPages(urls, patterns, words, source) {
  for (const url of urls) {
    try {
      const html = await text(url);
      const value = firstValid([...exactMatches(html, patterns), ...candidatesFromText(html, words)]);
      if (value !== null) return result(value, source);
    } catch (error) {
      console.warn(`${source} fallback failed: ${error.message}`);
    }
  }
  throw new Error(`${source} count is not publicly exposed`);
}

function validate(fresh, previous, config) {
  if (!Number.isFinite(fresh?.value)) throw new Error('Metric is not numeric');
  if (Number.isFinite(config.min) && fresh.value < config.min) throw new Error('Metric below account floor');
  if (Number.isFinite(config.max) && fresh.value > config.max) throw new Error('Metric above account ceiling');
  const oldValue = numeric(previous?.value);
  if (oldValue !== null && oldValue >= 1000 && (fresh.value < oldValue * 0.5 || fresh.value > oldValue * 5)) {
    throw new Error(`Rejected suspicious change from ${oldValue} to ${fresh.value}`);
  }
  return fresh;
}

async function main() {
  const stats = JSON.parse(await readFile(STATS_PATH, 'utf8'));
  stats.metrics ||= {};

  for (const [groupName, group] of Object.entries(accounts)) {
    stats.metrics[groupName] ||= {};
    for (const [platform, config] of Object.entries(group)) {
      const previous = stats.metrics[groupName][platform];
      try {
        const fresh = validate(await config.fetcher(config.handle, config), previous, config);
        stats.metrics[groupName][platform] = { ...fresh, unit: config.unit, checkedAt, status: 'live' };
        console.log(`Updated ${groupName}.${platform}: ${fresh.value}`);
      } catch (error) {
        console.warn(`Could not update ${groupName}.${platform}: ${error.message}`);
        stats.metrics[groupName][platform] = numeric(previous?.value) !== null
          ? { ...previous, checkedAt, status: 'stale' }
          : { value: null, display: null, unit: config.unit, checkedAt, status: 'unavailable' };
      }
    }
  }

  stats.version = 2;
  stats.updatedAt = checkedAt;
  await writeFile(STATS_PATH, `${JSON.stringify(stats, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
