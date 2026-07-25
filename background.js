const BING_ENDPOINT = 'https://www.bing.com/HPImageArchive.aspx';
const MARKET = 'en-US';
const UHD_WIDTH = 7680;
const UHD_HEIGHT = 4320;
const ALARM_NAME = 'daily-refresh';
const DAILY_MINUTES = 60 * 24;

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

function setWallpaper(url, dateLabel = 'today') {
  return new Promise((resolve, reject) => {
    if (!chrome.wallpaper) {
      reject(new Error('chrome.wallpaper API is unavailable (ChromeOS only).'));
      return;
    }

    chrome.wallpaper.setWallpaper(
      {
        url,
        layout: 'CENTER_CROPPED',
        filename: `bing-${dateLabel}.jpg`
      },
      () => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(new Error(err.message));
        } else {
          resolve();
        }
      }
    );
  });
}

async function applyBing(idx = 0) {
  const info = await fetchBingMetadata(idx);
  await setWallpaper(info.imageUrl, info.date || idx);
  await chrome.storage.local.set({ lastApplied: { ...info, appliedAt: Date.now() } });
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

  return false;
});

chrome.runtime.onInstalled.addListener(() => {
  applyBing(0).catch((error) => console.warn('Initial wallpaper set failed:', error.message));
  scheduleDailyRefresh();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleDailyRefresh();
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;
  applyBing(0).catch((error) => console.warn('Daily refresh failed:', error.message));
});
