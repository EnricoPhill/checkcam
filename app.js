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
  if (getLocationMode() === 'manual') return manualLocationName.value.trim() || 'Lokasi belum diisi';
  if (liveLocationName) return liveLocationName;
  if (position) return `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;
  return 'Menunggu lokasi';
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
  stampEmployee.textContent = employeeName.value.trim() || employeeId.value.trim() || 'Belum diatur';
  stampOpd.textContent = opdName.value.trim() || 'Belum diatur';
  stampLocationName.textContent = getResolvedLocationName();
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
  if (!Number.isFinite(ms) || ms < 0) return '--:--:--';
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

function activeInStorageKey() {
  return `checkcam.activeIn.${employeeId.value.trim() || 'unknown'}`;
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
  stampWorkDuration.textContent = action === 'IN' ? '00:00:00' : formatDuration(ms);
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
    liveLocationName = unique.join(', ') || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  } catch (err) {
    console.warn('Could not resolve location name', err);
    if (requestId !== geocodeRequestId) return;
    liveLocationName = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }
  liveLocationText.textContent = liveLocationName;
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
  stamp.style.width = 'max-content';
  stamp.style.maxWidth = `${Math.min(292, Math.max(190, videoRect.width * 0.72))}px`;
  stamp.style.bottom = 'auto';
  const stampH = stamp.offsetHeight || 138;
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

function getStampCanvasRect(outputW, outputH) {
  const videoRect = getVisibleVideoRect();
  const stampRect = stamp.getBoundingClientRect();
  const scaleX = outputW / videoRect.width;
  const scaleY = outputH / videoRect.height;

  // Keep the saved-photo card compact and bottom-left anchored.
  // Do not use the DOM element's height: browser layout can report extra
  // vertical space that is not part of the visible card content.
  const x = (stampRect.left - videoRect.left) * scaleX;
  const w = stampRect.width * scaleX;
  const unit = Math.max(1, w / 270);
  const contentHeight = 146 * unit;
  const bottomGap = Math.max(0, (videoRect.bottom - stampRect.bottom) * scaleY);
  const y = Math.max(0, outputH - bottomGap - contentHeight);

  return {
    x: Math.max(0, x),
    y,
    w: Math.min(w, outputW - Math.max(0, x)),
    h: Math.min(contentHeight, outputH - y)
  };
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 2 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function drawStamp(ctx, width, height, capturedAt, durationMs) {
  const r = getStampCanvasRect(width, height);
  const unit = Math.max(1, r.w / 270);
  const pad = 9 * unit;
  const radius = 11 * unit;
  const left = r.x + pad;
  const right = r.x + r.w - pad;

  ctx.save();
  ctx.fillStyle = 'rgba(8, 11, 14, 0.72)';
  roundedRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = Math.max(1, unit);
  ctx.stroke();

  const badgeH = 18 * unit;
  ctx.font = `900 ${7.5 * unit}px system-ui`;
  const actionText = action === 'IN' ? 'ABSEN MASUK' : 'ABSEN PULANG';
  const actionW = ctx.measureText(actionText).width + 13 * unit;
  ctx.fillStyle = action === 'IN' ? 'rgba(67,209,122,.96)' : 'rgba(255,90,103,.96)';
  roundedRect(ctx, left, r.y + 8 * unit, actionW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = action === 'IN' ? '#07140c' : '#1c0507';
  ctx.textBaseline = 'middle';
  ctx.fillText(actionText, left + 6.5 * unit, r.y + 17 * unit);

  const accText = accuracyText();
  ctx.font = `850 ${7.5 * unit}px system-ui`;
  const accW = Math.min(right - left - actionW - 5 * unit, ctx.measureText(accText).width + 12 * unit);
  if (accW > 35 * unit) {
    const accX = left + actionW + 5 * unit;
    ctx.fillStyle = position ? 'rgba(67,209,122,.18)' : 'rgba(255,255,255,.12)';
    roundedRect(ctx, accX, r.y + 8 * unit, accW, badgeH, badgeH / 2);
    ctx.fill();
    ctx.fillStyle = position ? '#d5ffe3' : '#fff';
    ctx.fillText(fitText(ctx, accText, accW - 10 * unit), accX + 5 * unit, r.y + 17 * unit);
  }

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${28 * unit}px system-ui`;
  ctx.fillText(clockFormatter.format(capturedAt), left, r.y + 51 * unit);
  ctx.fillStyle = '#e7eaee';
  ctx.font = `700 ${9 * unit}px system-ui`;
  ctx.fillText(dateFormatter.format(capturedAt), left, r.y + 64 * unit);

  ctx.strokeStyle = 'rgba(255,255,255,.17)';
  ctx.lineWidth = Math.max(1, .8 * unit);
  ctx.beginPath();
  ctx.moveTo(left, r.y + 71 * unit);
  ctx.lineTo(right, r.y + 71 * unit);
  ctx.stroke();

  const maxText = right - left;
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${9.5 * unit}px system-ui`;
  const name = employeeName.value.trim() || employeeId.value.trim() || 'Belum diatur';
  ctx.fillText(fitText(ctx, name, maxText), left, r.y + 85 * unit);

  ctx.fillStyle = '#d1d5da';
  ctx.font = `650 ${8.7 * unit}px system-ui`;
  ctx.fillText(fitText(ctx, `OPD: ${opdName.value.trim() || 'Belum diatur'}`, maxText), left, r.y + 98 * unit);
  ctx.fillText(fitText(ctx, getResolvedLocationName(), maxText), left, r.y + 111 * unit);

  const coordText = position ? `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}` : 'Koordinat belum tersedia';
  ctx.fillStyle = '#aeb5be';
  ctx.font = `600 ${8 * unit}px system-ui`;
  ctx.fillText(fitText(ctx, coordText, maxText), left, r.y + 123 * unit);

  ctx.fillStyle = '#f4f6f8';
  ctx.font = `750 ${8.5 * unit}px system-ui`;
  ctx.fillText(fitText(ctx, `Waktu Kerja: ${action === 'IN' ? '00:00:00' : formatDuration(durationMs)}`, maxText), left, r.y + 136 * unit);
  ctx.restore();
}

function flashShutter() {
  captureFlash.classList.remove('flash');
  void captureFlash.offsetWidth;
  captureFlash.classList.add('flash');
}

function capturePhoto() {
  if (!camera.videoWidth || !camera.videoHeight) return;
  if (!employeeId.value.trim() || !employeeName.value.trim() || !opdName.value.trim()) {
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
  captured = {
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
  const list = JSON.parse(localStorage.getItem('checkcam.history') || '[]');
  list.unshift(item);
  localStorage.setItem('checkcam.history', JSON.stringify(list.slice(0, 30)));
}

function updateLocalWorkSession(record) {
  if (record.action === 'IN') setActiveInTime(record.capturedAt);
  if (record.action === 'OUT') clearActiveInTime();
  updateWorkDuration();
}

async function submitAttendance() {
  if (!captured) return;
  submitBtn.disabled = true;
  submitStatus.textContent = 'Mengirim…';
  const record = { ...captured, localSavedAt: new Date().toISOString() };

  if (!endpointConfigured()) {
    saveHistory({ ...record, demo: true });
    updateLocalWorkSession(record);
    submitStatus.textContent = 'Mode demo: tersimpan di HP ini. Tambahkan URL Apps Script /exec di app.js untuk mengirim ke Google Sheets.';
    setTimeout(() => { closePreview(); renderHistory(); }, 1800);
    submitBtn.disabled = false;
    return;
  }

  try {
    const body = new URLSearchParams();
    Object.entries(captured).forEach(([k, v]) => body.append(k, v));
    await fetch(CONFIG.endpoint, { method: 'POST', mode: 'no-cors', body });
    saveHistory({ ...record, submitted: true });
    updateLocalWorkSession(record);
    submitStatus.textContent = 'Absensi terkirim. Cek Google Sheet untuk catatan server.';
    setTimeout(() => { closePreview(); renderHistory(); }, 1400);
  } catch (err) {
    console.error(err);
    submitStatus.textContent = 'Gagal mengirim. Periksa koneksi dan URL Apps Script.';
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
    const badge = r.demo ? 'Demo' : 'Terkirim';
    const actionText = r.action === 'IN' ? 'ABSEN MASUK' : 'ABSEN PULANG';
    const duration = r.action === 'OUT' && r.workDuration ? ` · ${r.workDuration}` : '';
    return `<div class="history-item"><strong>${actionText} · ${escapeHtml(r.employeeName || r.employeeId)} · ${badge}</strong><span>${escapeHtml(when)}${escapeHtml(duration)}</span><span>${escapeHtml(r.locationName || r.siteName || '')}</span></div>`;
  }).join('');
}

function escapeHtml(s='') {
  return String(s).replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
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
window.addEventListener('resize', () => requestAnimationFrame(positionStampInsideVideo));

loadProfile();
setAction('IN');
refreshStamp();
