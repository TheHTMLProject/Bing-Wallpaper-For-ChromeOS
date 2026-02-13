const preview = document.getElementById('preview');
const overlay = document.getElementById('previewOverlay');
const titleEl = document.getElementById('title');
const dateLabel = document.getElementById('dateLabel');
const statusEl = document.getElementById('status');
const sourceLink = document.getElementById('sourceLink');
const buttons = {
  prev: document.getElementById('btn-prev'),
  next: document.getElementById('btn-next'),
  refresh: document.getElementById('btn-refresh')
};
const previewImg = document.getElementById('previewImg');

const MIN_IDX = 0;
const MAX_IDX = 2;
let currentIdx = MIN_IDX;

function formatDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return 'Today';
  const year = Number(yyyymmdd.slice(0, 4));
  const month = Number(yyyymmdd.slice(4, 6)) - 1;
  const day = Number(yyyymmdd.slice(6, 8));
  const date = new Date(year, month, day);
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle('error', isError);
  statusEl.classList.toggle('hidden', !text);
}

function updateUI(info) {
  if (!info) return;
  titleEl.textContent = info.title || 'Bing image';
  dateLabel.textContent = formatDate(info.date);
  sourceLink.href = info.sourcePage || 'https://www.bing.com';
  overlay.textContent = '';
  overlay.style.background = 'transparent';
  previewImg.src = info.imageUrl;
  previewImg.alt = info.title || 'Bing wallpaper preview';
  currentIdx = info.idx ?? currentIdx;
  const atNewest = currentIdx === MIN_IDX;
  const atOldest = currentIdx === MAX_IDX;
  buttons.prev.disabled = atOldest;
  buttons.next.disabled = atNewest;
}

async function peek(idx = 0) {
  overlay.textContent = 'Loading...';
  overlay.style.background = 'var(--preview-overlay)';
  setStatus('', false);
  try {
    const response = await chrome.runtime.sendMessage({ type: 'peek', idx });
    if (!response?.success) throw new Error(response?.error || 'Failed to fetch');
    updateUI(response.info);
    setStatus('');
  } catch (err) {
    overlay.textContent = 'Error';
    setStatus(err.message, true);
  }
}

async function apply(idx = 0) {
  overlay.textContent = 'Setting...';
  overlay.style.background = 'var(--preview-overlay)';
  setStatus('Setting wallpaper...', false);
  try {
    const response = await chrome.runtime.sendMessage({ type: 'apply', idx });
    if (!response?.success) throw new Error(response?.error || 'Failed to set wallpaper');
    updateUI(response.info);
    setStatus('');
  } catch (err) {
    overlay.textContent = 'Error';
    setStatus(err.message, true);
  }
}

function wireButtons() {
  buttons.prev.addEventListener('click', () => {
    const nextIdx = Math.min(MAX_IDX, currentIdx + 1);
    apply(nextIdx);
  });
  buttons.next.addEventListener('click', () => {
    const nextIdx = Math.max(MIN_IDX, currentIdx - 1);
    apply(nextIdx);
  });
  buttons.refresh.addEventListener('click', () => apply(currentIdx));
}

async function init() {
  wireButtons();

  try {
    const last = await chrome.runtime.sendMessage({ type: 'getLast' });
    if (last?.info) {
      currentIdx = last.info.idx ?? 0;
      updateUI(last.info);
      setStatus('');
    }
  } catch (err) {
    // Non-blocking
  }

  await peek(currentIdx);
}

document.addEventListener('DOMContentLoaded', init);
