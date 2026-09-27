const CONFIG = {
  // Paste your existing Google Apps Script Web App /exec URL here.
  endpoint: 'https://script.google.com/macros/s/AKfycbxKwZ4r1ETnjoNCQbgl5XbJupEFbhXoT2RnWz1sOhZGrhfYg3HCCZIAHFvVOtrVvtnZJg/exec',
  photoMaxWidth: 1280,
  photoMaxHeight: 1920,
  jpegQuality: 0.80
};

const $ = (id) => document.getElementById(id);
const cameraStage = $('cameraStage');
const camera = $('camera');
const canvas = $('captureCanvas');
const captureFlash = $('captureFlash');
const focusRing = $('focusRing');
const syncBadge = $('syncBadge');
const permissionCard = $('permissionCard');
const startBtn = $('startBtn');
const shutterBtn = $('shutterBtn');
const flipBtn = $('flipBtn');
const mirrorBtn = $('mirrorBtn');
const mirrorLabel = $('mirrorLabel');
const cameraLabel = $('cameraLabel');
const zoomControl = $('zoomControl');
const zoomSlider = $('zoomSlider');
const zoomValue = $('zoomValue');
const settingsBtn = $('settingsBtn');
const settingsPanel = $('settingsPanel');
const closeSettings = $('closeSettings');
const employeeId = $('employeeId');
const employeeName = $('employeeName');
const opdName = $('opdName');
const locationModeLive = $('locationModeLive');
const locationModeManual = $('locationModeManual');
const liveLocationBox = $('liveLocationBox');
const liveLocationText = $('liveLocationText');
const manualLocationWrap = $('manualLocationWrap');
const manualLocationName = $('manualLocationName');
const stamp = $('stamp');
const stampEmployee = $('stampEmployee');
const stampOpd = $('stampOpd');
const stampLocationName = $('stampLocationName');
const stampCoordinates = $('stampCoordinates');
const stampWorkDuration = $('stampWorkDuration');
const stampLogoBox = $('stampLogoBox');
const stampLogo = $('stampLogo');
const logoPreview = $('logoPreview');
const logoEmpty = $('logoEmpty');
const logoInput = $('logoInput');
const removeLogoBtn = $('removeLogoBtn');
const accuracyBadge = $('accuracyBadge');
const clock = $('clock');
const date = $('date');
const actionBadge = $('actionBadge');
const inBtn = $('inBtn');
const outBtn = $('outBtn');
const previewPanel = $('previewPanel');
const previewImage = $('previewImage');
const retakeBtn = $('retakeBtn');
const submitBtn = $('submitBtn');
const submitStatus = $('submitStatus');
const historyBtn = $('historyBtn');
const historyPanel = $('historyPanel');
const closeHistory = $('closeHistory');
const historyList = $('historyList');
const settingsCard = settingsPanel.querySelector('.sheet-card');
const settingsHandle = settingsPanel.querySelector('.sheet-handle');

let stream = null;
let activeTrack = null;
let facingMode = localStorage.getItem('checkcam.cameraFacing') === 'environment' ? 'environment' : 'user';
let action = 'IN';
let position = null;
let captured = null;
let mirrorEnabled = getSavedMirrorForFacing(facingMode);
let liveLocationName = '';
let lastGeocodeAt = 0;
let lastGeocodePosition = null;
let geocodeRequestId = 0;
let zoomRaf = null;
let syncBadgeTimer = null;
let syncingPending = false;
let overlayLogoData = '';

const DB_NAME = 'checkcam-db';
const DB_VERSION = 1;
const PENDING_STORE = 'pending';

function mirrorStorageKey(mode) {
  return mode === 'user' ? 'checkcam.mirror.front' : 'checkcam.mirror.back';
}

function getSavedMirrorForFacing(mode) {
  const stored = localStorage.getItem(mirrorStorageKey(mode));
  if (stored === null) return mode === 'user';
  return stored === 'true';
}

function getLocationMode() {
  return locationModeManual.checked ? 'manual' : 'live';
}

function getResolvedLocationName() {
  if (getLocationMode() === 'manual') return manualLocationName.value.trim();
  return liveLocationName || '';
}

function hasOverlayLogo() {
  return Boolean(overlayLogoData && stampLogo.complete && stampLogo.naturalWidth > 0);
}

function applyOverlayLogo(dataUrl, persist = true) {
  overlayLogoData = dataUrl || '';
  if (persist) {
    if (overlayLogoData) localStorage.setItem('checkcam.overlayLogo', overlayLogoData);
    else localStorage.removeItem('checkcam.overlayLogo');
  }

  if (overlayLogoData) {
    stampLogo.src = overlayLogoData;
    logoPreview.src = overlayLogoData;
    stampLogoBox.classList.remove('hidden');
    logoPreview.classList.remove('hidden');
    logoEmpty.classList.add('hidden');
    removeLogoBtn.disabled = false;
  } else {
    stampLogo.removeAttribute('src');
    logoPreview.removeAttribute('src');
    stampLogoBox.classList.add('hidden');
    logoPreview.classList.add('hidden');
    logoEmpty.classList.remove('hidden');
    removeLogoBtn.disabled = true;
  }
  requestAnimationFrame(positionStampInsideVideo);
}

function loadOverlayLogo() {
  applyOverlayLogo(localStorage.getItem('checkcam.overlayLogo') || '', false);
}

function resizeLogoFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Logo tidak dapat dibaca.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('File logo tidak valid.'));
      img.onload = () => {
        const maxSide = 320;
        const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * scale));
        const h = Math.max(1, Math.round(img.naturalHeight * scale));
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const cctx = c.getContext('2d');
        cctx.clearRect(0, 0, w, h);
        cctx.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/png'));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

async function chooseOverlayLogo(file) {
  if (!file) return;
  try {
    const dataUrl = await resizeLogoFile(file);
    applyOverlayLogo(dataUrl, true);
  } catch (err) {
    console.error(err);
    alert('Logo tidak dapat diproses. Gunakan PNG, JPG, atau WebP.');
  } finally {
    logoInput.value = '';
  }
}

function loadProfile() {
  const p = JSON.parse(localStorage.getItem('checkcam.profile') || '{}');
  employeeId.value = p.employeeId || '';
  employeeName.value = p.employeeName || '';
  opdName.value = p.opdName || p.company || '';
  manualLocationName.value = p.manualLocationName || p.siteName || '';
  const mode = p.locationMode === 'manual' ? 'manual' : 'live';
  locationModeManual.checked = mode === 'manual';
  locationModeLive.checked = mode === 'live';
  updateLocationModeUi();
  refreshStamp();
  applyCameraUiState();
}

function saveProfile() {
  localStorage.setItem('checkcam.profile', JSON.stringify({
    employeeId: employeeId.value.trim(),
    employeeName: employeeName.value.trim(),
    opdName: opdName.value.trim(),
    locationMode: getLocationMode(),
    manualLocationName: manualLocationName.value.trim()
  }));
  refreshStamp();
}

function openSettings() {
  settingsPanel.classList.add('open');
  settingsPanel.setAttribute('aria-hidden', 'false');
  if (stream && !camera.paused) camera.pause();
}

async function closeSettingsPanel() {
  saveProfile();
  settingsPanel.classList.remove('open');
  settingsPanel.setAttribute('aria-hidden', 'true');
  if (stream && camera.paused) {
    try { await camera.play(); } catch (err) { console.warn('Could not resume camera', err); }
  }
  requestAnimationFrame(positionStampInsideVideo);
}

function updateLocationModeUi() {
  const manual = getLocationMode() === 'manual';
  manualLocationWrap.classList.toggle('hidden', !manual);
  liveLocationBox.classList.toggle('hidden', manual);
  refreshStamp();
}

function refreshStamp() {
  stampEmployee.textContent = employeeName.value.trim() || 'Belum diatur';
  stampOpd.textContent = opdName.value.trim() || 'Belum diatur';
  const resolvedLocation = getResolvedLocationName();
  stampLocationName.textContent = resolvedLocation;
  stampLocationName.classList.toggle('hidden', !resolvedLocation);
  if (position) {
    stampCoordinates.textContent = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
  } else {
    stampCoordinates.textContent = 'Koordinat belum tersedia';
  }
  updateWorkDuration();
  requestAnimationFrame(positionStampInsideVideo);
}

function applyCameraUiState() {
  camera.classList.toggle('mirrored', mirrorEnabled);
  mirrorBtn.classList.toggle('active', mirrorEnabled);
  mirrorBtn.setAttribute('aria-pressed', String(mirrorEnabled));
  mirrorLabel.textContent = mirrorEnabled ? 'MIRROR ON' : 'MIRROR OFF';
  cameraLabel.textContent = facingMode === 'user' ? 'FRONT' : 'BACK';
}

function toggleMirror() {
  mirrorEnabled = !mirrorEnabled;
  localStorage.setItem(mirrorStorageKey(facingMode), String(mirrorEnabled));
  applyCameraUiState();
}

const clockFormatter = new Intl.DateTimeFormat('id-ID', {
  hour: '2-digit', minute: '2-digit', hour12: false
});
const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
});

function updateClock() {
  const now = new Date();
  clock.textContent = clockFormatter.format(now);
  date.textContent = dateFormatter.format(now);
  updateWorkDuration(now);
}
setInterval(updateClock, 1000);
updateClock();

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '--:--';
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return [h, m].map((n) => String(n).padStart(2, '0')).join(':');
}

function activeInStorageKey() {
  const id = employeeId.value.trim();
  const name = employeeName.value.trim().toLowerCase();
  const opd = opdName.value.trim().toLowerCase();
  const identity = id || `${name}|${opd}` || 'unknown';
  return `checkcam.activeIn.${encodeURIComponent(identity)}`;
}

function getActiveInTime() {
  const raw = localStorage.getItem(activeInStorageKey());
  if (!raw) return null;
  const t = new Date(raw);
  return Number.isNaN(t.getTime()) ? null : t;
}

function setActiveInTime(iso) {
  localStorage.setItem(activeInStorageKey(), iso);
}

function clearActiveInTime() {
  localStorage.removeItem(activeInStorageKey());
}

function getWorkDurationMs(at = new Date()) {
  if (action !== 'OUT') return 0;
  const inTime = getActiveInTime();
  if (!inTime) return NaN;
  return Math.max(0, at.getTime() - inTime.getTime());
}

function updateWorkDuration(at = new Date()) {
  const ms = getWorkDurationMs(at);
  stampWorkDuration.textContent = action === 'IN' ? '00:00' : formatDuration(ms);
}

function setAction(next) {
  action = next;
  inBtn.classList.toggle('active', action === 'IN');
  outBtn.classList.toggle('active', action === 'OUT');
  actionBadge.textContent = action === 'IN' ? 'ABSEN MASUK' : 'ABSEN PULANG';
  actionBadge.classList.toggle('in', action === 'IN');
  actionBadge.classList.toggle('out', action === 'OUT');
  updateWorkDuration();
  requestAnimationFrame(positionStampInsideVideo);
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Akses kamera tidak tersedia. Buka halaman HTTPS ini di Chrome atau Safari.');
    return;
  }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  activeTrack = null;
  zoomControl.classList.add('hidden');
  try {
    const videoConstraints = {
      facingMode: { ideal: facingMode },
      width: { ideal: 3840 },
      height: { ideal: 2880 }
    };
    if (navigator.mediaDevices.getSupportedConstraints?.().resizeMode) {
      videoConstraints.resizeMode = 'none';
    }

    stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    camera.srcObject = stream;
    await camera.play();
    activeTrack = stream.getVideoTracks()[0];

    await configureZoom(activeTrack);
    permissionCard.classList.add('hidden');
    shutterBtn.disabled = false;
    applyCameraUiState();
    requestAnimationFrame(positionStampInsideVideo);
  } catch (err) {
    console.error(err);
    alert('Izin kamera belum diberikan. Izinkan kamera di pengaturan browser lalu muat ulang halaman.');
  }
}

async function configureZoom(track) {
  zoomControl.classList.add('hidden');
  if (facingMode !== 'environment' || !track) return;
  try {
    const caps = track.getCapabilities?.();
    if (!caps?.zoom || !Number.isFinite(caps.zoom.min) || !Number.isFinite(caps.zoom.max) || caps.zoom.max <= caps.zoom.min) return;
    const min = caps.zoom.min;
    const max = caps.zoom.max;
    const step = Number.isFinite(caps.zoom.step) && caps.zoom.step > 0 ? caps.zoom.step : Math.max(0.1, (max - min) / 50);
    const stored = Number(localStorage.getItem('checkcam.zoom.back'));
    const initial = Number.isFinite(stored) ? Math.min(max, Math.max(min, stored)) : min;
    zoomSlider.min = String(min);
    zoomSlider.max = String(max);
    zoomSlider.step = String(step);
    zoomSlider.value = String(initial);
    zoomValue.textContent = `${Number(initial).toFixed(1)}×`;
    zoomControl.classList.remove('hidden');
    await applyZoom(initial);
  } catch (err) {
    console.warn('Zoom is not available on this browser/camera', err);
  }
}

async function applyZoom(value) {
  if (!activeTrack || facingMode !== 'environment') return;
  const zoom = Number(value);
  if (!Number.isFinite(zoom)) return;
  zoomValue.textContent = `${zoom.toFixed(1)}×`;
  localStorage.setItem('checkcam.zoom.back', String(zoom));
  try {
    await activeTrack.applyConstraints({ advanced: [{ zoom }] });
  } catch (err) {
    console.warn('Could not apply zoom', err);
  }
}

zoomSlider.addEventListener('input', () => {
  if (zoomRaf) cancelAnimationFrame(zoomRaf);
  const value = zoomSlider.value;
  zoomRaf = requestAnimationFrame(() => applyZoom(value));
});

function accuracyText() {
  if (!position || !Number.isFinite(position.coords.accuracy)) return 'Accuracy --';
  // Browser Geolocation accuracy is reported in meters. Display it directly in meters.
  return `Accuracy ±${Math.round(position.coords.accuracy)}m`;
}

function distanceMeters(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (d) => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function reverseGeocode(latitude, longitude) {
  const requestId = ++geocodeRequestId;
  liveLocationText.textContent = 'Mencari nama lokasi…';
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}&localityLanguage=id`;
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Reverse geocode HTTP ${res.status}`);
    const d = await res.json();
    if (requestId !== geocodeRequestId) return;
    const parts = [d.locality || d.city, d.principalSubdivision, d.countryName].filter(Boolean);
    const unique = [...new Set(parts.map((x) => String(x).trim()).filter(Boolean))];
    liveLocationName = unique.join(', ');
  } catch (err) {
    console.warn('Could not resolve location name', err);
    if (requestId !== geocodeRequestId) return;
    liveLocationName = '';
  }
  liveLocationText.textContent = liveLocationName || 'Nama area tidak tersedia';
  refreshStamp();
}

function maybeReverseGeocode(latitude, longitude) {
  const now = Date.now();
  const current = { latitude, longitude };
  const moved = distanceMeters(lastGeocodePosition, current);
  if (lastGeocodePosition && moved < 80 && now - lastGeocodeAt < 60000) return;
  lastGeocodePosition = current;
  lastGeocodeAt = now;
  reverseGeocode(latitude, longitude);
}

function requestLocation() {
  if (!navigator.geolocation) {
    accuracyBadge.textContent = 'Accuracy --';
    liveLocationText.textContent = 'Lokasi tidak tersedia';
    refreshStamp();
    return;
  }
  accuracyBadge.textContent = 'Accuracy…';
  navigator.geolocation.watchPosition((pos) => {
    position = pos;
    const { latitude, longitude } = pos.coords;
    accuracyBadge.textContent = accuracyText();
    accuracyBadge.classList.add('ok');
    maybeReverseGeocode(latitude, longitude);
    refreshStamp();
  }, (err) => {
    console.warn(err);
    accuracyBadge.textContent = 'Accuracy --';
    accuracyBadge.classList.remove('ok');
    liveLocationText.textContent = 'Izinkan akses lokasi';
    refreshStamp();
  }, { enableHighAccuracy: true, maximumAge: 8000, timeout: 15000 });
}

async function beginPermissions() {
  requestLocation();
  await startCamera();
}

function getVisibleVideoRect() {
  const stageRect = cameraStage.getBoundingClientRect();
  const videoW = camera.videoWidth || 1;
  const videoH = camera.videoHeight || 1;
  const stageW = Math.max(1, stageRect.width);
  const stageH = Math.max(1, stageRect.height);
  const videoAspect = videoW / videoH;
  const stageAspect = stageW / stageH;
  let width, height, left, top;
  if (videoAspect > stageAspect) {
    width = stageW;
    height = width / videoAspect;
    left = 0;
    top = (stageH - height) / 2;
  } else {
    height = stageH;
    width = height * videoAspect;
    top = 0;
    left = (stageW - width) / 2;
  }
  return {
    left: stageRect.left + left,
    top: stageRect.top + top,
    width,
    height,
    right: stageRect.left + left + width,
    bottom: stageRect.top + top + height
  };
}

function getCaptureOutputSize(videoW, videoH) {
  const maxW = CONFIG.photoMaxWidth || 1280;
  const maxH = CONFIG.photoMaxHeight || 1920;
  const scale = Math.min(1, maxW / videoW, maxH / videoH);
  return {
    width: Math.max(1, Math.round(videoW * scale)),
    height: Math.max(1, Math.round(videoH * scale))
  };
}

function positionStampInsideVideo() {
  if (!camera.videoWidth || !camera.videoHeight) return;
  const stageRect = cameraStage.getBoundingClientRect();
  const videoRect = getVisibleVideoRect();
  const pad = Math.max(10, Math.min(14, videoRect.width * 0.03));
  stamp.style.left = `${videoRect.left - stageRect.left + pad}px`;
  stamp.style.right = 'auto';
  const stampW = Math.min(340, Math.max(250, videoRect.width * 0.80));
  stamp.style.width = `${stampW}px`;
  stamp.style.maxWidth = `${stampW}px`;
  stamp.style.bottom = 'auto';
  const stampH = stamp.offsetHeight || 164;
  const top = videoRect.bottom - stageRect.top - stampH - pad;
  const minimumTop = videoRect.top - stageRect.top + pad;
  stamp.style.top = `${Math.max(minimumTop, top)}px`;
}

function roundedRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function getStampLayoutUnits() {
  const logo = hasOverlayLogo();
  const location = Boolean(getResolvedLocationName());
  const headerBottom = logo ? 88 : 76;
  const nameY = headerBottom + 17;
  const opdY = nameY + 15;
  const locationY = location ? opdY + 15 : null;
  const coordY = location ? locationY + 14 : opdY + 14;
  const workY = coordY + 17;
  return {
    logo,
    location,
    headerBottom,
    nameY,
    opdY,
    locationY,
    coordY,
    workY,
    height: workY + 12
  };
}

function getStampCanvasRect(outputW, outputH) {
  const videoRect = getVisibleVideoRect();
  const stampRect = stamp.getBoundingClientRect();
  const scaleX = outputW / videoRect.width;
  const scaleY = outputH / videoRect.height;

  // Use a content-derived height so the saved stamp never grows into a tall empty box.
  const x = (stampRect.left - videoRect.left) * scaleX;
  const w = stampRect.width * scaleX;
  const unit = Math.max(1, w / 320);
  const layout = getStampLayoutUnits();
  const contentHeight = layout.height * unit;
  const bottomGap = Math.max(0, (videoRect.bottom - stampRect.bottom) * scaleY);
  const y = Math.max(0, outputH - bottomGap - contentHeight);

  return {
    x: Math.max(0, x),
    y,
    w: Math.min(w, outputW - Math.max(0, x)),
    h: Math.min(contentHeight, outputH - y),
    layout
  };
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 2 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function drawContainedImage(ctx, img, x, y, w, h) {
  if (!img || !img.naturalWidth || !img.naturalHeight) return;
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

function drawStamp(ctx, width, height, capturedAt, durationMs) {
  const r = getStampCanvasRect(width, height);
  const layout = r.layout || getStampLayoutUnits();
  const unit = Math.max(1, r.w / 320);
  const pad = 12 * unit;
  const radius = 14 * unit;
  const left = r.x + pad;
  const right = r.x + r.w - pad;

  ctx.save();
  ctx.fillStyle = 'rgba(8, 11, 14, 0.74)';
  roundedRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = Math.max(1, unit);
  ctx.stroke();

  const badgeH = 20 * unit;
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${8.5 * unit}px system-ui`;
  const actionText = action === 'IN' ? 'ABSEN MASUK' : 'ABSEN PULANG';
  const actionW = ctx.measureText(actionText).width + 14 * unit;
  ctx.fillStyle = action === 'IN' ? 'rgba(67,209,122,.96)' : 'rgba(255,90,103,.96)';
  roundedRect(ctx, left, r.y + 11 * unit, actionW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = action === 'IN' ? '#07140c' : '#1c0507';
  ctx.fillText(actionText, left + 7 * unit, r.y + 21 * unit);

  const accText = accuracyText();
  ctx.font = `850 ${8.5 * unit}px system-ui`;
  const accW = Math.min(104 * unit, ctx.measureText(accText).width + 14 * unit);
  const accX = right - accW;
  ctx.fillStyle = position ? 'rgba(67,209,122,.18)' : 'rgba(255,255,255,.12)';
  roundedRect(ctx, accX, r.y + 11 * unit, accW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = position ? '#d5ffe3' : '#fff';
  ctx.fillText(fitText(ctx, accText, accW - 10 * unit), accX + 5 * unit, r.y + 21 * unit);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${34 * unit}px system-ui`;
  ctx.fillText(clockFormatter.format(capturedAt), left, r.y + 58 * unit);
  ctx.fillStyle = '#e7eaee';
  ctx.font = `700 ${10.5 * unit}px system-ui`;
  ctx.fillText(dateFormatter.format(capturedAt), left, r.y + 73 * unit);

  if (layout.logo && hasOverlayLogo()) {
    const logoW = 56 * unit;
    const logoH = 56 * unit;
    const logoX = right - logoW;
    const logoY = r.y + 30 * unit;
    ctx.fillStyle = 'rgba(255,255,255,.08)';
    roundedRect(ctx, logoX, logoY, logoW, logoH, 10 * unit);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.13)';
    ctx.lineWidth = Math.max(1, .8 * unit);
    ctx.stroke();
    drawContainedImage(ctx, stampLogo, logoX + 4 * unit, logoY + 4 * unit, logoW - 8 * unit, logoH - 8 * unit);
  }

  ctx.strokeStyle = 'rgba(255,255,255,.17)';
  ctx.lineWidth = Math.max(1, .8 * unit);
  ctx.beginPath();
  ctx.moveTo(left, r.y + layout.headerBottom * unit);
  ctx.lineTo(right, r.y + layout.headerBottom * unit);
  ctx.stroke();

  const maxText = right - left;
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${11 * unit}px system-ui`;
  const name = employeeName.value.trim() || 'Belum diatur';
  ctx.fillText(fitText(ctx, name, maxText), left, r.y + layout.nameY * unit);

  ctx.fillStyle = '#d1d5da';
  ctx.font = `650 ${10.2 * unit}px system-ui`;
  ctx.fillText(fitText(ctx, `OPD: ${opdName.value.trim() || 'Belum diatur'}`, maxText), left, r.y + layout.opdY * unit);

  const locationName = getResolvedLocationName();
  if (layout.location && locationName) {
    ctx.fillText(fitText(ctx, locationName, maxText), left, r.y + layout.locationY * unit);
  }

  const coordText = position ? `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}` : 'Koordinat belum tersedia';
  ctx.fillStyle = '#aeb5be';
  ctx.font = `600 ${9.5 * unit}px system-ui`;
  ctx.fillText(fitText(ctx, coordText, maxText), left, r.y + layout.coordY * unit);

  ctx.fillStyle = '#f4f6f8';
  ctx.font = `750 ${10 * unit}px system-ui`;
  ctx.fillText(fitText(ctx, `Waktu Kerja: ${action === 'IN' ? '00:00' : formatDuration(durationMs)}`, maxText), left, r.y + layout.workY * unit);
  ctx.restore();
}

function flashShutter() {
  captureFlash.classList.remove('flash');
  void captureFlash.offsetWidth;
  captureFlash.classList.add('flash');
}

function capturePhoto() {
  if (!camera.videoWidth || !camera.videoHeight) return;
  if (!employeeName.value.trim() || !opdName.value.trim()) {
    openSettings();
    return;
  }
  if (getLocationMode() === 'manual' && !manualLocationName.value.trim()) {
    openSettings();
    return;
  }

  const capturedAt = new Date();
  const durationMs = getWorkDurationMs(capturedAt);
  const size = getCaptureOutputSize(camera.videoWidth, camera.videoHeight);
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');

  if (mirrorEnabled) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(camera, 0, 0, camera.videoWidth, camera.videoHeight, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.drawImage(camera, 0, 0, camera.videoWidth, camera.videoHeight, 0, 0, canvas.width, canvas.height);
  }

  drawStamp(ctx, canvas.width, canvas.height, capturedAt, durationMs);
  flashShutter();

  const photoData = canvas.toDataURL('image/jpeg', CONFIG.jpegQuality);
  const locationName = getResolvedLocationName();
  const clientRecordId = (crypto.randomUUID?.() || `cc-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  captured = {
    clientRecordId,
    photoData,
    capturedAt: capturedAt.toISOString(),
    action,
    employeeId: employeeId.value.trim(),
    employeeName: employeeName.value.trim(),
    opd: opdName.value.trim(),
    company: opdName.value.trim(),
    siteName: locationName,
    locationName,
    locationMode: getLocationMode(),
    latitude: position?.coords?.latitude ?? '',
    longitude: position?.coords?.longitude ?? '',
    accuracy: position?.coords?.accuracy ?? '',
    workDurationMs: Number.isFinite(durationMs) ? Math.round(durationMs) : '',
    workDuration: Number.isFinite(durationMs) ? formatDuration(durationMs) : '',
    cameraFacing: facingMode,
    mirrored: mirrorEnabled,
    zoom: facingMode === 'environment' && !zoomControl.classList.contains('hidden') ? zoomSlider.value : '',
    userAgent: navigator.userAgent
  };
  previewImage.src = photoData;
  submitStatus.textContent = '';
  previewPanel.classList.add('open');
  previewPanel.setAttribute('aria-hidden', 'false');
}

function closePreview() {
  previewPanel.classList.remove('open');
  previewPanel.setAttribute('aria-hidden', 'true');
  captured = null;
}

function endpointConfigured() {
  return CONFIG.endpoint.startsWith('https://script.google.com/macros/s/') && CONFIG.endpoint.endsWith('/exec');
}

function saveHistory(item) {
  // Keep large JPEG data in IndexedDB only; localStorage is just lightweight history metadata.
  const { photoData, ...historyItem } = item;
  const list = JSON.parse(localStorage.getItem('checkcam.history') || '[]');
  const idx = list.findIndex((x) => x.clientRecordId && x.clientRecordId === historyItem.clientRecordId);
  if (idx >= 0) list[idx] = { ...list[idx], ...historyItem };
  else list.unshift(historyItem);
  localStorage.setItem('checkcam.history', JSON.stringify(list.slice(0, 30)));
}

function updateHistoryState(clientRecordId, patch) {
  if (!clientRecordId) return;
  const list = JSON.parse(localStorage.getItem('checkcam.history') || '[]');
  const idx = list.findIndex((x) => x.clientRecordId === clientRecordId);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch };
  localStorage.setItem('checkcam.history', JSON.stringify(list));
}

function updateLocalWorkSession(record) {
  if (record.action === 'IN') setActiveInTime(record.capturedAt);
  if (record.action === 'OUT') clearActiveInTime();
  updateWorkDuration();
}

function openCheckcamDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('IndexedDB tidak tersedia'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) db.createObjectStore(PENDING_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Gagal membuka penyimpanan offline'));
  });
}

async function withPendingStore(mode, callback) {
  const db = await openCheckcamDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, mode);
    const store = tx.objectStore(PENDING_STORE);
    let value;
    try { value = callback(store); } catch (err) { db.close(); reject(err); return; }
    tx.oncomplete = () => { db.close(); resolve(value); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Penyimpanan offline gagal')); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Penyimpanan offline dibatalkan')); };
  });
}

async function queuePending(record) {
  const queuedRecord = { ...record, offlineCaptured: 'true' };
  await withPendingStore('readwrite', (store) => store.put({
    id: record.clientRecordId,
    endpoint: CONFIG.endpoint,
    queuedAt: new Date().toISOString(),
    record: queuedRecord
  }));
  await updateSyncBadge();
  registerBackgroundSync();
}

async function getPendingItems() {
  const db = await openCheckcamDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, 'readonly');
    const req = tx.objectStore(PENDING_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error || new Error('Gagal membaca antrean offline'));
    tx.oncomplete = () => db.close();
  });
}

async function deletePending(id) {
  await withPendingStore('readwrite', (store) => store.delete(id));
}

async function pendingCount() {
  const db = await openCheckcamDb();
  return new Promise((resolve) => {
    const tx = db.transaction(PENDING_STORE, 'readonly');
    const req = tx.objectStore(PENDING_STORE).count();
    req.onsuccess = () => resolve(req.result || 0);
    req.onerror = () => resolve(0);
    tx.oncomplete = () => db.close();
  });
}

async function postRecord(record, endpoint = CONFIG.endpoint) {
  const body = new URLSearchParams();
  Object.entries(record).forEach(([k, v]) => {
    if (v !== undefined && v !== null) body.append(k, String(v));
  });
  await fetch(endpoint, { method: 'POST', mode: 'no-cors', body, cache: 'no-store' });
}

async function reconcileHistoryWithPending() {
  try {
    const pending = await getPendingItems();
    const pendingIds = new Set(pending.map((x) => x.id));
    const list = JSON.parse(localStorage.getItem('checkcam.history') || '[]');
    let changed = false;
    for (const item of list) {
      if (item.pending && item.clientRecordId && !pendingIds.has(item.clientRecordId)) {
        item.pending = false;
        item.submitted = true;
        item.syncedAt = item.syncedAt || new Date().toISOString();
        changed = true;
      }
    }
    if (changed) localStorage.setItem('checkcam.history', JSON.stringify(list));
  } catch (err) {
    console.warn('Could not reconcile history', err);
  }
}

async function updateSyncBadge(message = '') {
  try {
    const count = await pendingCount();
    syncBadge.classList.remove('hidden', 'offline', 'pending', 'synced');
    if (!navigator.onLine) {
      syncBadge.textContent = `OFFLINE · ${count} menunggu`;
      syncBadge.classList.add('offline');
      return;
    }
    if (count > 0) {
      syncBadge.textContent = message || `${count} absensi menunggu sinkron`;
      syncBadge.classList.add('pending');
      return;
    }
    if (message) {
      syncBadge.textContent = message;
      syncBadge.classList.add('synced');
      clearTimeout(syncBadgeTimer);
      syncBadgeTimer = setTimeout(() => syncBadge.classList.add('hidden'), 2200);
    } else {
      syncBadge.classList.add('hidden');
    }
  } catch (err) {
    console.warn('Could not update sync status', err);
  }
}

async function syncPending() {
  if (syncingPending || !navigator.onLine || !endpointConfigured()) {
    await updateSyncBadge();
    return;
  }
  syncingPending = true;
  try {
    const items = (await getPendingItems()).sort((a, b) => String(a.record?.capturedAt || '').localeCompare(String(b.record?.capturedAt || '')));
    if (!items.length) return;
    await updateSyncBadge('Menyinkronkan…');
    for (const item of items) {
      try {
        await postRecord(item.record, item.endpoint || CONFIG.endpoint);
        await deletePending(item.id);
        updateHistoryState(item.id, { pending: false, submitted: true, syncedAt: new Date().toISOString() });
      } catch (err) {
        console.warn('Pending sync stopped', err);
        break;
      }
    }
  } finally {
    syncingPending = false;
    await reconcileHistoryWithPending();
    const left = await pendingCount().catch(() => 0);
    await updateSyncBadge(left ? '' : 'Semua absensi tersinkron');
    renderHistory();
  }
}

async function registerBackgroundSync() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (reg?.sync?.register) await reg.sync.register('checkcam-sync');
  } catch (err) {
    console.warn('Background Sync is not available', err);
  }
}

async function submitAttendance() {
  if (!captured) return;
  submitBtn.disabled = true;
  const record = { ...captured, localSavedAt: new Date().toISOString(), offlineCaptured: 'false' };

  if (!endpointConfigured()) {
    saveHistory({ ...record, demo: true });
    updateLocalWorkSession(record);
    submitStatus.textContent = 'Mode demo: tersimpan di HP ini. Tambahkan URL Apps Script /exec di app.js untuk mengirim ke Google Sheets.';
    setTimeout(() => { closePreview(); renderHistory(); }, 1800);
    submitBtn.disabled = false;
    return;
  }

  if (!navigator.onLine) {
    try {
      await queuePending(record);
      saveHistory({ ...record, pending: true });
      updateLocalWorkSession(record);
      submitStatus.textContent = 'Tersimpan di perangkat · menunggu internet.';
      setTimeout(() => { closePreview(); renderHistory(); }, 1500);
    } catch (err) {
      console.error(err);
      submitStatus.textContent = 'Gagal menyimpan offline. Jangan tutup halaman dan coba lagi.';
    } finally {
      submitBtn.disabled = false;
    }
    return;
  }

  submitStatus.textContent = 'Mengirim…';
  try {
    await postRecord(record);
    saveHistory({ ...record, submitted: true });
    updateLocalWorkSession(record);
    submitStatus.textContent = 'Absensi terkirim.';
    setTimeout(() => { closePreview(); renderHistory(); }, 1200);
  } catch (err) {
    console.warn('Upload failed, queued offline', err);
    try {
      await queuePending(record);
      saveHistory({ ...record, pending: true });
      updateLocalWorkSession(record);
      submitStatus.textContent = 'Koneksi terputus · absensi disimpan dan akan disinkronkan.';
      setTimeout(() => { closePreview(); renderHistory(); }, 1700);
    } catch (queueErr) {
      console.error(queueErr);
      submitStatus.textContent = 'Upload dan penyimpanan offline gagal. Coba lagi.';
    }
  } finally {
    submitBtn.disabled = false;
  }
}

function renderHistory() {
  const list = JSON.parse(localStorage.getItem('checkcam.history') || '[]');
  if (!list.length) {
    historyList.innerHTML = '<div class="empty">Belum ada riwayat di HP ini.</div>';
    return;
  }
  historyList.innerHTML = list.map((r) => {
    const when = new Date(r.capturedAt).toLocaleString('id-ID');
    const badge = r.demo ? 'Demo' : r.pending ? 'Menunggu Sync' : 'Terkirim';
    const actionText = r.action === 'IN' ? 'ABSEN MASUK' : 'ABSEN PULANG';
    const duration = r.action === 'OUT' && r.workDuration ? ` · ${r.workDuration}` : '';
    return `<div class="history-item"><strong>${actionText} · ${escapeHtml(r.employeeName || 'Tanpa nama')} · ${badge}</strong><span>${escapeHtml(when)}${escapeHtml(duration)}</span><span>${escapeHtml(r.locationName || r.siteName || '')}</span></div>`;
  }).join('');
}

function escapeHtml(s='') {
  return String(s).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
}

function showFocusRing(clientX, clientY) {
  const stageRect = cameraStage.getBoundingClientRect();
  focusRing.style.left = `${clientX - stageRect.left}px`;
  focusRing.style.top = `${clientY - stageRect.top}px`;
  focusRing.classList.remove('show');
  void focusRing.offsetWidth;
  focusRing.classList.add('show');
}

async function focusAtPoint(clientX, clientY) {
  if (!activeTrack || !camera.videoWidth || !camera.videoHeight) return;
  const videoRect = getVisibleVideoRect();
  if (clientX < videoRect.left || clientX > videoRect.right || clientY < videoRect.top || clientY > videoRect.bottom) return;
  showFocusRing(clientX, clientY);

  const supported = navigator.mediaDevices?.getSupportedConstraints?.() || {};
  if (!supported.pointsOfInterest) return;
  try {
    const settings = activeTrack.getSettings?.() || {};
    const sensorW = settings.width || camera.videoWidth;
    const sensorH = settings.height || camera.videoHeight;
    let nx = (clientX - videoRect.left) / videoRect.width;
    const ny = (clientY - videoRect.top) / videoRect.height;
    if (mirrorEnabled) nx = 1 - nx;
    const point = {
      x: Math.max(0, Math.min(sensorW - 1, nx * sensorW)),
      y: Math.max(0, Math.min(sensorH - 1, ny * sensorH))
    };
    const caps = activeTrack.getCapabilities?.() || {};
    const control = { pointsOfInterest: [point] };
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes('single-shot')) control.focusMode = 'single-shot';
    if (facingMode === 'environment' && !zoomControl.classList.contains('hidden')) control.zoom = Number(zoomSlider.value);
    await activeTrack.applyConstraints({ advanced: [control] });
  } catch (err) {
    console.warn('Tap focus is not supported by this camera/browser', err);
  }
}

function enableSwipeToClose(panel, card, handle, closeFn) {
  let startY = 0;
  let lastY = 0;
  let dragging = false;
  const begin = (e) => {
    if (!panel.classList.contains('open')) return;
    dragging = true;
    startY = lastY = e.clientY;
    card.classList.add('dragging');
    handle.setPointerCapture?.(e.pointerId);
  };
  const move = (e) => {
    if (!dragging) return;
    lastY = e.clientY;
    const dy = lastY - startY;
    card.style.transform = `translateY(${Math.max(-70, dy)}px)`;
  };
  const end = async (e) => {
    if (!dragging) return;
    dragging = false;
    card.classList.remove('dragging');
    const dy = lastY - startY;
    if (Math.abs(dy) > 105) {
      card.style.transform = dy > 0 ? 'translateY(110%)' : 'translateY(-18%)';
      await closeFn();
    }
    card.style.transform = '';
    try { handle.releasePointerCapture?.(e.pointerId); } catch (_) {}
  };
  handle.addEventListener('pointerdown', begin);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
  panel.addEventListener('click', (e) => { if (e.target === panel) closeFn(); });
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (err) {
    console.warn('Service worker registration failed', err);
  }
}

startBtn.addEventListener('click', beginPermissions);
flipBtn.addEventListener('click', async () => {
  facingMode = facingMode === 'user' ? 'environment' : 'user';
  localStorage.setItem('checkcam.cameraFacing', facingMode);
  mirrorEnabled = getSavedMirrorForFacing(facingMode);
  applyCameraUiState();
  await startCamera();
});
mirrorBtn.addEventListener('click', toggleMirror);
shutterBtn.addEventListener('click', capturePhoto);
inBtn.addEventListener('click', () => setAction('IN'));
outBtn.addEventListener('click', () => setAction('OUT'));
settingsBtn.addEventListener('click', openSettings);
closeSettings.addEventListener('click', closeSettingsPanel);
[employeeId, employeeName, opdName, manualLocationName].forEach((el) => el.addEventListener('change', refreshStamp));
employeeId.addEventListener('change', updateWorkDuration);
[locationModeLive, locationModeManual].forEach((el) => el.addEventListener('change', updateLocationModeUi));
logoInput.addEventListener('change', () => chooseOverlayLogo(logoInput.files?.[0]));
removeLogoBtn.addEventListener('click', () => applyOverlayLogo('', true));
stampLogo.addEventListener('load', () => requestAnimationFrame(positionStampInsideVideo));
retakeBtn.addEventListener('click', closePreview);
submitBtn.addEventListener('click', submitAttendance);
historyBtn.addEventListener('click', () => {
  renderHistory();
  historyPanel.classList.add('open');
  historyPanel.setAttribute('aria-hidden', 'false');
});
closeHistory.addEventListener('click', () => {
  historyPanel.classList.remove('open');
  historyPanel.setAttribute('aria-hidden', 'true');
});

camera.addEventListener('loadedmetadata', () => requestAnimationFrame(positionStampInsideVideo));
camera.addEventListener('pointerup', (e) => focusAtPoint(e.clientX, e.clientY));
window.addEventListener('resize', () => requestAnimationFrame(positionStampInsideVideo));
window.addEventListener('online', () => { updateSyncBadge('Koneksi kembali'); syncPending(); });
window.addEventListener('offline', () => updateSyncBadge());

enableSwipeToClose(settingsPanel, settingsCard, settingsHandle, closeSettingsPanel);
registerServiceWorker();
loadOverlayLogo();
loadProfile();
setAction('IN');
refreshStamp();
reconcileHistoryWithPending().then(() => { updateSyncBadge(); syncPending(); });
