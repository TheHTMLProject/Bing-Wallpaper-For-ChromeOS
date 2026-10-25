const BING_ENDPOINT = 'https://www.bing.com/HPImageArchive.aspx';
const MARKET = 'en-US';
const UHD_WIDTH = 7680;
const UHD_HEIGHT = 4320;
const ALARM_NAME = 'daily-refresh';
const DAILY_MINUTES = 60 * 24;
const NOTIFICATION_ID = 'bing-wallpaper-update';
const DEFAULT_SETTINGS = { notificationsEnabled: true };

async function fetchBingMetadata(idx = 0) {
  const query = new URLSearchParams({
    format: 'js',
    idx: String(idx),
    n: '1',
    uhd: '1',
    uhdwidth: String(UHD_WIDTH),
    uhdheight: String(UHD_HEIGHT),
    mkt: MARKET
  });

  const response = await fetch(`${BING_ENDPOINT}?${query.toString()}`, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Bing responded with ${response.status}`);
  }

  const data = await response.json();
  const image = data?.images?.[0];
  if (!image) throw new Error('No image data returned.');

  const imageUrl = image.url?.startsWith('http')
    ? image.url
    : `https://www.bing.com${image.url}`;

  const sourcePage = image.copyrightlink
    ? new URL(image.copyrightlink, 'https://www.bing.com').toString()
    : 'https://www.bing.com';

  const date = image.enddate || image.startdate || '';

  return {
    idx,
    title: image.title || image.copyright || 'Bing daily wallpaper',
    copyright: image.copyright || '',
    date,
    imageUrl,
    sourcePage
  };
}

async function setWallpaper(url, dateLabel = 'today') {
  const wallpaperApi = globalThis.chrome?.wallpaper || globalThis.browser?.wallpaper;
  if (!wallpaperApi?.setWallpaper) {
    throw new Error('The ChromeOS wallpaper API is unavailable. Make sure this extension is running on ChromeOS.');
  }

  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Wallpaper image responded with ${response.status}`);
  }

  await wallpaperApi.setWallpaper({
    data: await response.arrayBuffer(),
    layout: 'CENTER_CROPPED',
    filename: `bing-${dateLabel}.jpg`
  });
}

async function notifyWallpaperUpdate(info) {
  const { notificationsEnabled } = await chrome.storage.local.get(DEFAULT_SETTINGS);
  if (!notificationsEnabled || !info?.sourcePage) return;

  await chrome.notifications.create(NOTIFICATION_ID, {
    type: 'basic',
    iconUrl: 'icons/WallpaperGlyph.png',
    title: 'Bing wallpaper updated',
    message: info.title || 'View information about today’s image',
    priority: 0
  });
}

async function applyBing(idx = 0, notify = false) {
  const info = await fetchBingMetadata(idx);
  await setWallpaper(info.imageUrl, info.date || idx);
  await chrome.storage.local.set({ lastApplied: { ...info, appliedAt: Date.now() } });
  if (notify) await notifyWallpaperUpdate(info);
  return info;
}

function scheduleDailyRefresh() {
  const now = new Date();
  const target = new Date(now);
  target.setHours(6, 0, 0, 0); // 6:00 local time
  if (target <= now) {
    target.setDate(target.getDate() + 1);
  }

  chrome.alarms.create(ALARM_NAME, {
    when: target.getTime(),
    periodInMinutes: DAILY_MINUTES
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'apply') {
    applyBing(message.idx ?? 0)
      .then((info) => sendResponse({ success: true, info }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.type === 'peek') {
    fetchBingMetadata(message.idx ?? 0)
      .then((info) => sendResponse({ success: true, info }))
      .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (message?.type === 'getLast') {
    chrome.storage.local.get('lastApplied', (data) => {
      sendResponse({ success: true, info: data.lastApplied || null });
    });
    return true;
  }

  if (message?.type === 'getSettings') {
    chrome.storage.local.get(DEFAULT_SETTINGS, (settings) => {
      sendResponse({ success: true, settings: { ...DEFAULT_SETTINGS, ...settings } });
    });
    return true;
  }

  if (message?.type === 'setNotifications') {
    chrome.storage.local.set({ notificationsEnabled: Boolean(message.enabled) }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  applyBing(0).catch((error) => console.warn('Initial wallpaper set failed:', error.message));
  chrome.storage.local.get('notificationsEnabled', ({ notificationsEnabled }) => {
    if (notificationsEnabled === undefined) {
      chrome.storage.local.set(DEFAULT_SETTINGS);
    }
  });
  scheduleDailyRefresh();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleDailyRefresh();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  applyBing(0, true).catch((error) => console.warn('Daily refresh failed:', error.message));
});

chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId !== NOTIFICATION_ID) return;
  chrome.storage.local.get('lastApplied', ({ lastApplied }) => {
    if (lastApplied?.sourcePage) {
      chrome.tabs.create({ url: lastApplied.sourcePage });
    }
  });
});
