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
const settingsBtn = $('settingsBtn');
const settingsPanel = $('settingsPanel');
const closeSettings = $('closeSettings');
const employeeId = $('employeeId');
const employeeName = $('employeeName');
const siteName = $('siteName');
const stamp = $('stamp');
const stampEmployee = $('stampEmployee');
const stampSite = $('stampSite');
const stampLocation = $('stampLocation');
const gpsBadge = $('gpsBadge');
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
let facingMode = localStorage.getItem('checkcam.cameraFacing') === 'environment' ? 'environment' : 'user';
let action = 'IN';
let position = null;
let captured = null;
let mirrorEnabled = getSavedMirrorForFacing(facingMode);

function mirrorStorageKey(mode) {
  return mode === 'user' ? 'checkcam.mirror.front' : 'checkcam.mirror.back';
}

function getSavedMirrorForFacing(mode) {
  const stored = localStorage.getItem(mirrorStorageKey(mode));
  if (stored === null) return mode === 'user'; // normal selfie behavior by default
  return stored === 'true';
}

function loadProfile() {
  const p = JSON.parse(localStorage.getItem('checkcam.profile') || '{}');
  employeeId.value = p.employeeId || '';
  employeeName.value = p.employeeName || '';
  siteName.value = p.siteName || 'Main Office';
  refreshStamp();
  applyCameraUiState();
}

function saveProfile() {
  localStorage.setItem('checkcam.profile', JSON.stringify({
    employeeId: employeeId.value.trim(),
    employeeName: employeeName.value.trim(),
    siteName: siteName.value.trim()
  }));
  refreshStamp();
}

function openSettings() {
  settingsPanel.classList.add('open');
  settingsPanel.setAttribute('aria-hidden', 'false');
  // Pause display while the mobile keyboard is open. The camera permission stays active.
  if (stream && !camera.paused) camera.pause();
}

async function closeSettingsPanel() {
  saveProfile();
  settingsPanel.classList.remove('open');
  settingsPanel.setAttribute('aria-hidden', 'true');
  if (stream && camera.paused) {
    try { await camera.play(); } catch (err) { console.warn('Could not resume camera', err); }
  }
}

function refreshStamp() {
  stampEmployee.textContent = employeeName.value.trim() || employeeId.value.trim() || 'Not set';
  stampSite.textContent = siteName.value.trim() || 'Work Site';
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

const clockFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
});
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'short', day: '2-digit', month: 'short', year: 'numeric'
});

function updateClock() {
  const now = new Date();
  clock.textContent = clockFormatter.format(now);
  date.textContent = dateFormatter.format(now);
}
setInterval(updateClock, 1000);
updateClock();

function setAction(next) {
  action = next;
  inBtn.classList.toggle('active', action === 'IN');
  outBtn.classList.toggle('active', action === 'OUT');
  actionBadge.textContent = action === 'IN' ? 'CLOCK IN' : 'CLOCK OUT';
  actionBadge.classList.toggle('in', action === 'IN');
  actionBadge.classList.toggle('out', action === 'OUT');
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Camera access is unavailable here. Open this page from HTTPS in Chrome or Safari.');
    return;
  }
  if (stream) stream.getTracks().forEach((t) => t.stop());
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1920 },
        height: { ideal: 2560 }
      },
      audio: false
    });
    camera.srcObject = stream;
    await camera.play();
    permissionCard.classList.add('hidden');
    shutterBtn.disabled = false;
    applyCameraUiState();
  } catch (err) {
    console.error(err);
    alert('Camera permission was not granted. Allow camera access in your browser settings and reload.');
  }
}

function requestLocation() {
  if (!navigator.geolocation) {
    gpsBadge.textContent = 'NO GPS';
    stampLocation.textContent = 'Location unavailable';
    return;
  }
  gpsBadge.textContent = 'GPS…';
  navigator.geolocation.watchPosition((pos) => {
    position = pos;
    const { latitude, longitude, accuracy } = pos.coords;
    gpsBadge.textContent = `GPS ±${Math.round(accuracy)}m`;
    gpsBadge.classList.add('ok');
    stampLocation.textContent = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  }, (err) => {
    console.warn(err);
    gpsBadge.textContent = 'GPS OFF';
    gpsBadge.classList.remove('ok');
    stampLocation.textContent = 'Allow location access';
  }, { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 });
}

async function beginPermissions() {
  requestLocation();
  await startCamera();
}

function getVisibleCoverCrop(videoW, videoH, viewW, viewH) {
  const videoAspect = videoW / videoH;
  const viewAspect = viewW / viewH;
  if (videoAspect > viewAspect) {
    const sourceWidth = videoH * viewAspect;
    return { sx: (videoW - sourceWidth) / 2, sy: 0, sw: sourceWidth, sh: videoH };
  }
  const sourceHeight = videoW / viewAspect;
  return { sx: 0, sy: (videoH - sourceHeight) / 2, sw: videoW, sh: sourceHeight };
}

function getCaptureOutputSize(viewW, viewH) {
  const maxW = CONFIG.photoMaxWidth || 1280;
  const maxH = CONFIG.photoMaxHeight || 1920;
  const scale = Math.min(maxW / viewW, maxH / viewH);
  return {
    width: Math.max(1, Math.round(viewW * scale)),
    height: Math.max(1, Math.round(viewH * scale))
  };
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
  const stageRect = cameraStage.getBoundingClientRect();
  const stampRect = stamp.getBoundingClientRect();
  const scaleX = outputW / stageRect.width;
  const scaleY = outputH / stageRect.height;
  return {
    x: (stampRect.left - stageRect.left) * scaleX,
    y: (stampRect.top - stageRect.top) * scaleY,
    w: stampRect.width * scaleX,
    h: stampRect.height * scaleY
  };
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 2 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function drawStamp(ctx, width, height, capturedAt) {
  // Use the live stamp's actual screen rectangle so the saved watermark stays
  // in almost exactly the same place and size as the preview.
  const r = getStampCanvasRect(width, height);
  const unit = Math.max(1, r.w / 330);
  const pad = 10 * unit;
  const radius = 12 * unit;

  ctx.save();
  ctx.fillStyle = 'rgba(8, 11, 14, 0.72)';
  roundedRect(ctx, r.x, r.y, r.w, r.h, radius);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.lineWidth = Math.max(1, 1 * unit);
  ctx.stroke();

  const left = r.x + pad;
  const right = r.x + r.w - pad;
  const badgeH = 20 * unit;
  const badgeW = 67 * unit;
  ctx.fillStyle = action === 'IN' ? 'rgba(67,209,122,.96)' : 'rgba(255,90,103,.96)';
  roundedRect(ctx, left, r.y + 9 * unit, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = action === 'IN' ? '#07140c' : '#1c0507';
  ctx.font = `900 ${8.5 * unit}px system-ui`;
  ctx.textBaseline = 'middle';
  ctx.fillText(action === 'IN' ? 'CLOCK IN' : 'CLOCK OUT', left + 7 * unit, r.y + 19 * unit);

  const gpsText = position ? `GPS ±${Math.round(position.coords.accuracy)}m` : 'GPS OFF';
  ctx.font = `850 ${8.5 * unit}px system-ui`;
  const gpsW = Math.max(50 * unit, ctx.measureText(gpsText).width + 14 * unit);
  ctx.fillStyle = position ? 'rgba(67,209,122,.18)' : 'rgba(255,255,255,.12)';
  roundedRect(ctx, right - gpsW, r.y + 9 * unit, gpsW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = position ? '#d5ffe3' : '#fff';
  ctx.fillText(gpsText, right - gpsW + 7 * unit, r.y + 19 * unit);

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#fff';
  ctx.font = `900 ${32 * unit}px system-ui`;
  ctx.fillText(clockFormatter.format(capturedAt), left, r.y + 58 * unit);
  ctx.fillStyle = '#e7eaee';
  ctx.font = `700 ${10.5 * unit}px system-ui`;
  ctx.fillText(dateFormatter.format(capturedAt), left, r.y + 73 * unit);

  ctx.strokeStyle = 'rgba(255,255,255,.17)';
  ctx.lineWidth = Math.max(1, .8 * unit);
  ctx.beginPath();
  ctx.moveTo(left, r.y + 81 * unit);
  ctx.lineTo(right, r.y + 81 * unit);
  ctx.stroke();

  const name = employeeName.value.trim() || employeeId.value.trim() || 'Not set';
  const site = siteName.value.trim() || 'Work Site';
  ctx.fillStyle = '#fff';
  ctx.font = `800 ${10.5 * unit}px system-ui`;
  ctx.fillText(fitText(ctx, `${name}  •  ${site}`, right - left), left, r.y + 96 * unit);

  const locationText = position
    ? `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`
    : 'Location unavailable';
  ctx.fillStyle = '#c2c8d0';
  ctx.font = `600 ${9.5 * unit}px system-ui`;
  ctx.fillText(fitText(ctx, locationText, right - left), left, r.y + 110 * unit);
  ctx.restore();
}

function flashShutter() {
  captureFlash.classList.remove('flash');
  void captureFlash.offsetWidth;
  captureFlash.classList.add('flash');
}

function capturePhoto() {
  if (!camera.videoWidth || !camera.videoHeight) return;
  if (!employeeId.value.trim() || !employeeName.value.trim()) {
    openSettings();
    return;
  }

  const capturedAt = new Date();
  const stageRect = cameraStage.getBoundingClientRect();
  const viewW = Math.max(1, stageRect.width);
  const viewH = Math.max(1, stageRect.height);
  const crop = getVisibleCoverCrop(camera.videoWidth, camera.videoHeight, viewW, viewH);
  const size = getCaptureOutputSize(viewW, viewH);

  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');

  if (mirrorEnabled) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(camera, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.drawImage(camera, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
  }

  drawStamp(ctx, canvas.width, canvas.height, capturedAt);
  flashShutter();

  const photoData = canvas.toDataURL('image/jpeg', CONFIG.jpegQuality);
  captured = {
    photoData,
    capturedAt: capturedAt.toISOString(),
    action,
    employeeId: employeeId.value.trim(),
    employeeName: employeeName.value.trim(),
    siteName: siteName.value.trim(),
    latitude: position?.coords?.latitude ?? '',
    longitude: position?.coords?.longitude ?? '',
    accuracy: position?.coords?.accuracy ?? '',
    cameraFacing: facingMode,
    mirrored: mirrorEnabled,
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
  localStorage.setItem('checkcam.history', JSON.stringify(list.slice(0, 20)));
}

async function submitAttendance() {
  if (!captured) return;
  submitBtn.disabled = true;
  submitStatus.textContent = 'Submitting…';
  const record = { ...captured, localSavedAt: new Date().toISOString() };

  if (!endpointConfigured()) {
    saveHistory({ ...record, demo: true });
    submitStatus.textContent = 'Demo mode: saved on this phone. Add your Apps Script /exec URL in app.js to send to Google Sheets.';
    setTimeout(() => { closePreview(); renderHistory(); }, 1800);
    submitBtn.disabled = false;
    return;
  }

  try {
    const body = new URLSearchParams();
    Object.entries(captured).forEach(([k, v]) => body.append(k, v));
    await fetch(CONFIG.endpoint, { method: 'POST', mode: 'no-cors', body });
    saveHistory({ ...record, submitted: true });
    submitStatus.textContent = 'Submitted. Check the Google Sheet for the server-recorded entry.';
    setTimeout(() => { closePreview(); renderHistory(); }, 1400);
  } catch (err) {
    console.error(err);
    submitStatus.textContent = 'Could not submit. Check your connection and Apps Script URL.';
  } finally {
    submitBtn.disabled = false;
  }
}

function renderHistory() {
  const list = JSON.parse(localStorage.getItem('checkcam.history') || '[]');
  if (!list.length) {
    historyList.innerHTML = '<div class="empty">No records on this phone yet.</div>';
    return;
  }
  historyList.innerHTML = list.map((r) => {
    const when = new Date(r.capturedAt).toLocaleString();
    const badge = r.demo ? 'Demo' : 'Sent';
    return `<div class="history-item"><strong>${r.action} · ${escapeHtml(r.employeeName || r.employeeId)} · ${badge}</strong><span>${escapeHtml(when)}</span><span>${escapeHtml(r.siteName || '')}</span></div>`;
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
[employeeId, employeeName, siteName].forEach((el) => el.addEventListener('change', refreshStamp));
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

loadProfile();
setAction('IN');
requestLocation();
