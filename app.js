const CONFIG = {
  // Deploy Code.gs as a Google Apps Script Web App, then paste its /exec URL here.
  endpoint: 'https://script.google.com/macros/s/AKfycbxKwZ4r1ETnjoNCQbgl5XbJupEFbhXoT2RnWz1sOhZGrhfYg3HCCZIAHFvVOtrVvtnZJg/exec',
  photoMaxWidth: 1280,
  jpegQuality: 0.78
};

const $ = (id) => document.getElementById(id);
const camera = $('camera');
const canvas = $('captureCanvas');
const permissionCard = $('permissionCard');
const startBtn = $('startBtn');
const shutterBtn = $('shutterBtn');
const flipBtn = $('flipBtn');
const mirrorBtn = $('mirrorBtn');
const settingsBtn = $('settingsBtn');
const settingsPanel = $('settingsPanel');
const closeSettings = $('closeSettings');
const employeeId = $('employeeId');
const employeeName = $('employeeName');
const siteName = $('siteName');
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
let facingMode = 'user';
let action = 'IN';
let position = null;
let captured = null;
let mirrorEnabled = localStorage.getItem('checkcam.mirror') !== 'false';

function loadProfile() {
  const p = JSON.parse(localStorage.getItem('checkcam.profile') || '{}');
  employeeId.value = p.employeeId || '';
  employeeName.value = p.employeeName || '';
  siteName.value = p.siteName || 'Main Office';
  refreshStamp();
  applyMirrorState();
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
  // Pausing only the video element keeps camera permission/stream alive but
  // avoids continuously painting the camera under the mobile keyboard.
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

function applyMirrorState() {
  camera.classList.toggle('mirrored', mirrorEnabled);
  mirrorBtn.classList.toggle('active', mirrorEnabled);
  mirrorBtn.setAttribute('aria-pressed', String(mirrorEnabled));
  mirrorBtn.textContent = mirrorEnabled ? 'MIRROR ON' : 'MIRROR OFF';
}

function toggleMirror() {
  mirrorEnabled = !mirrorEnabled;
  localStorage.setItem('checkcam.mirror', String(mirrorEnabled));
  applyMirrorState();
}

// Reuse formatters instead of rebuilding Intl objects twice every half-second.
// This keeps the UI lighter while the keyboard and camera are active.
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
      video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 1600 } },
      audio: false
    });
    camera.srcObject = stream;
    await camera.play();
    permissionCard.classList.add('hidden');
    shutterBtn.disabled = false;
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

function fitSize(videoW, videoH, maxW) {
  if (videoW <= maxW) return { width: videoW, height: videoH };
  const ratio = maxW / videoW;
  return { width: Math.round(videoW * ratio), height: Math.round(videoH * ratio) };
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

function drawStamp(ctx, width, height, capturedAt) {
  // Compact stamp: about 25% of the image width instead of the old ~39%.
  const pad = Math.round(width * 0.026);
  const boxH = Math.round(width * 0.25);
  const x = pad, y = height - boxH - pad, w = width - pad * 2;

  ctx.save();
  ctx.fillStyle = 'rgba(10, 13, 16, 0.76)';
  roundedRect(ctx, x, y, w, boxH, Math.round(width * 0.018));
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.22)';
  ctx.lineWidth = Math.max(1, width * .0016);
  ctx.stroke();

  const innerX = x + pad;
  const innerW = w - pad * 2;
  const badgeH = Math.round(width * 0.038);
  const badgeW = Math.round(width * 0.145);
  ctx.fillStyle = action === 'IN' ? 'rgba(67,209,122,.96)' : 'rgba(255,90,103,.96)';
  roundedRect(ctx, innerX, y + pad, badgeW, badgeH, badgeH / 2);
  ctx.fill();
  ctx.fillStyle = '#07100b';
  ctx.font = `800 ${Math.round(width * .018)}px system-ui`;
  ctx.textBaseline = 'middle';
  ctx.fillText(action === 'IN' ? 'CLOCK IN' : 'CLOCK OUT', innerX + Math.round(width*.012), y + pad + badgeH/2 + 1);

  const timeText = clockFormatter.format(capturedAt);
  const dateText = dateFormatter.format(capturedAt);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `900 ${Math.round(width * .052)}px system-ui`;
  ctx.fillText(timeText, innerX, y + Math.round(boxH*.40));
  ctx.font = `650 ${Math.round(width * .021)}px system-ui`;
  ctx.fillStyle = '#e6e9ee';
  ctx.fillText(dateText, innerX, y + Math.round(boxH*.51));

  ctx.strokeStyle = 'rgba(255,255,255,.20)';
  ctx.beginPath();
  ctx.moveTo(innerX, y + Math.round(boxH*.57));
  ctx.lineTo(innerX + innerW, y + Math.round(boxH*.57));
  ctx.stroke();

  const labelX = innerX;
  const valueX = innerX + Math.round(width * .13);
  const rows = [
    ['Employee', employeeName.value.trim() || employeeId.value.trim() || 'Not set'],
    ['Site', siteName.value.trim() || 'Work Site'],
    ['Location', position ? `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}` : 'GPS unavailable']
  ];
  rows.forEach((row, i) => {
    const yy = y + Math.round(boxH*(.68 + i*.095));
    ctx.font = `500 ${Math.round(width * .0175)}px system-ui`;
    ctx.fillStyle = '#b8bec8';
    ctx.fillText(row[0], labelX, yy);
    ctx.font = `750 ${Math.round(width * .0175)}px system-ui`;
    ctx.fillStyle = '#fff';
    const text = row[1].length > 48 ? row[1].slice(0, 45) + '…' : row[1];
    ctx.fillText(text, valueX, yy);
  });
  ctx.restore();
}
function capturePhoto() {
  if (!camera.videoWidth || !camera.videoHeight) return;
  if (!employeeId.value.trim() || !employeeName.value.trim()) {
    openSettings();
    return;
  }

  const capturedAt = new Date();
  const size = fitSize(camera.videoWidth, camera.videoHeight, CONFIG.photoMaxWidth);
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');

  // Mirror the saved image only when Mirror mode is enabled.
  // The same setting is applied to the live preview, so preview and result match.
  if (mirrorEnabled) {
    ctx.save();
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  } else {
    ctx.drawImage(camera, 0, 0, canvas.width, canvas.height);
  }

  drawStamp(ctx, canvas.width, canvas.height, capturedAt);
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

    // no-cors avoids browser CORS blocking with a simple Apps Script endpoint.
    // The response is opaque, so the server timestamp in the Google Sheet is the source of truth.
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
  await startCamera();
});
mirrorBtn.addEventListener('click', toggleMirror);
shutterBtn.addEventListener('click', capturePhoto);
inBtn.addEventListener('click', () => setAction('IN'));
outBtn.addEventListener('click', () => setAction('OUT'));
settingsBtn.addEventListener('click', openSettings);
closeSettings.addEventListener('click', closeSettingsPanel);
// Do not redraw the camera stamp on every keystroke; update after a field is committed.
[employeeId, employeeName, siteName].forEach((el) => el.addEventListener('change', refreshStamp));
retakeBtn.addEventListener('click', closePreview);
submitBtn.addEventListener('click', submitAttendance);
historyBtn.addEventListener('click', () => { renderHistory(); historyPanel.classList.add('open'); historyPanel.setAttribute('aria-hidden','false'); });
closeHistory.addEventListener('click', () => { historyPanel.classList.remove('open'); historyPanel.setAttribute('aria-hidden','true'); });

loadProfile();
setAction('IN');
requestLocation();
