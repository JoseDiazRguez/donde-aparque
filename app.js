(() => {
  'use strict';

  const APP_VERSION = '1.0.0';
  const TILE_SIZE = 256;
  const EARTH_RADIUS = 6378137;
  const MIN_ZOOM = 3;
  const MAX_ZOOM = 20;

  const $ = (id) => document.getElementById(id);
  const els = {
    map: $('map'), tileLayer: $('tileLayer'), userMarker: $('userMarker'), carMarker: $('carMarker'),
    candidateMarker: $('candidateMarker'), tenMeterCircle: $('tenMeterCircle'), accuracyCircle: $('accuracyCircle'),
    statusText: $('statusText'), accuracyValue: $('accuracyValue'), distanceValue: $('distanceValue'), mapHint: $('mapHint'),
    candidateActions: $('candidateActions'), emptyState: $('emptyState'), parkingState: $('parkingState'), parkedWhen: $('parkedWhen'),
    coordinates: $('coordinates'), installDialog: $('installDialog'), confirmDialog: $('confirmDialog'), confirmTitle: $('confirmTitle'),
    confirmMessage: $('confirmMessage'), confirmOkBtn: $('confirmOkBtn')
  };

  const state = {
    center: { lat: 37.3891, lon: -5.9845 },
    zoom: 18,
    user: null,
    candidate: null,
    parking: null,
    watchId: null,
    locatedOnce: false,
    pointers: new Map(),
    gesture: null,
    deferredInstall: null
  };

  function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
  function worldSize(z) { return TILE_SIZE * Math.pow(2, z); }

  function latLonToWorld(lat, lon, z) {
    const size = worldSize(z);
    const safeLat = clamp(lat, -85.05112878, 85.05112878);
    const sin = Math.sin(safeLat * Math.PI / 180);
    return {
      x: ((lon + 180) / 360) * size,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size
    };
  }

  function worldToLatLon(x, y, z) {
    const size = worldSize(z);
    const lon = (x / size) * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / size;
    const lat = 180 / Math.PI * Math.atan(Math.sinh(n));
    return { lat: clamp(lat, -85.05112878, 85.05112878), lon: ((lon + 540) % 360) - 180 };
  }

  function metersPerPixel(lat, z) {
    return Math.cos(lat * Math.PI / 180) * 2 * Math.PI * EARTH_RADIUS / worldSize(z);
  }

  function coordToScreen(coord) {
    const rect = els.map.getBoundingClientRect();
    const c = latLonToWorld(state.center.lat, state.center.lon, state.zoom);
    const p = latLonToWorld(coord.lat, coord.lon, state.zoom);
    let dx = p.x - c.x;
    const size = worldSize(state.zoom);
    if (dx > size / 2) dx -= size;
    if (dx < -size / 2) dx += size;
    return { x: rect.width / 2 + dx, y: rect.height / 2 + (p.y - c.y) };
  }

  function screenToCoord(x, y) {
    const rect = els.map.getBoundingClientRect();
    const c = latLonToWorld(state.center.lat, state.center.lon, state.zoom);
    return worldToLatLon(c.x + x - rect.width / 2, c.y + y - rect.height / 2, state.zoom);
  }

  function tileUrl(z, x, y) { return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`; }

  function renderTiles() {
    const rect = els.map.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const c = latLonToWorld(state.center.lat, state.center.lon, state.zoom);
    const left = c.x - rect.width / 2;
    const top = c.y - rect.height / 2;
    const right = c.x + rect.width / 2;
    const bottom = c.y + rect.height / 2;
    const maxTile = Math.pow(2, state.zoom);
    const startX = Math.floor(left / TILE_SIZE) - 1;
    const endX = Math.floor(right / TILE_SIZE) + 1;
    const startY = Math.max(0, Math.floor(top / TILE_SIZE) - 1);
    const endY = Math.min(maxTile - 1, Math.floor(bottom / TILE_SIZE) + 1);
    const fragment = document.createDocumentFragment();

    els.tileLayer.replaceChildren();
    for (let ty = startY; ty <= endY; ty++) {
      for (let tx = startX; tx <= endX; tx++) {
        const wrappedX = ((tx % maxTile) + maxTile) % maxTile;
        const img = new Image();
        img.alt = '';
        img.draggable = false;
        img.decoding = 'async';
        img.loading = 'eager';
        img.referrerPolicy = 'strict-origin-when-cross-origin';
        img.src = tileUrl(state.zoom, wrappedX, ty);
        img.style.left = `${tx * TILE_SIZE - left}px`;
        img.style.top = `${ty * TILE_SIZE - top}px`;
        fragment.appendChild(img);
      }
    }
    els.tileLayer.appendChild(fragment);
  }

  function placeElement(el, coord) {
    if (!coord) { el.hidden = true; return; }
    const p = coordToScreen(coord);
    el.hidden = false;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }

  function placeCircle(el, coord, meters) {
    if (!coord || !Number.isFinite(meters) || meters <= 0) { el.style.display = 'none'; return; }
    const p = coordToScreen(coord);
    const diameter = Math.max(2, meters * 2 / metersPerPixel(coord.lat, state.zoom));
    el.style.display = 'block';
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
    el.style.width = `${diameter}px`;
    el.style.height = `${diameter}px`;
  }

  function renderOverlay() {
    placeElement(els.userMarker, state.user);
    placeElement(els.carMarker, state.parking);
    placeElement(els.candidateMarker, state.candidate);
    placeCircle(els.tenMeterCircle, state.user, 10);
    placeCircle(els.accuracyCircle, state.user, state.user?.accuracy || 0);
  }

  function renderMap() { renderTiles(); renderOverlay(); }

  function panBy(dx, dy) {
    const c = latLonToWorld(state.center.lat, state.center.lon, state.zoom);
    state.center = worldToLatLon(c.x - dx, c.y - dy, state.zoom);
    renderMap();
  }

  function setZoom(next) {
    state.zoom = clamp(Math.round(next), MIN_ZOOM, MAX_ZOOM);
    renderMap();
  }

  function centerOn(coord, zoom = state.zoom) {
    if (!coord) return;
    state.center = { lat: coord.lat, lon: coord.lon };
    state.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
    renderMap();
  }

  function fitBoth() {
    if (!state.user && !state.parking) return;
    if (!state.user) return centerOn(state.parking, 19);
    if (!state.parking) return centerOn(state.user, 20);

    const rect = els.map.getBoundingClientRect();
    const pad = 90;
    const mid = { lat: (state.user.lat + state.parking.lat) / 2, lon: (state.user.lon + state.parking.lon) / 2 };
    for (let z = MAX_ZOOM; z >= MIN_ZOOM; z--) {
      const a = latLonToWorld(state.user.lat, state.user.lon, z);
      const b = latLonToWorld(state.parking.lat, state.parking.lon, z);
      if (Math.abs(a.x - b.x) <= rect.width - pad && Math.abs(a.y - b.y) <= rect.height - pad) {
        state.center = mid; state.zoom = z; renderMap(); return;
      }
    }
    state.center = mid; state.zoom = MIN_ZOOM; renderMap();
  }

  function haversine(a, b) {
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const la1 = toRad(a.lat), la2 = toRad(b.lat);
    const h = Math.sin(dLat/2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon/2) ** 2;
    return 2 * 6371000 * Math.asin(Math.sqrt(h));
  }

  function fmtDistance(m) {
    if (!Number.isFinite(m)) return '—';
    return m < 1000 ? `${Math.round(m)} m` : `${(m/1000).toFixed(1)} km`;
  }

  function updateUI() {
    els.accuracyValue.textContent = state.user ? `±${Math.round(state.user.accuracy)} m` : '—';
    els.distanceValue.textContent = state.user && state.parking ? fmtDistance(haversine(state.user, state.parking)) : '—';
    els.candidateActions.hidden = !state.candidate;
    els.emptyState.hidden = !!state.parking;
    els.parkingState.hidden = !state.parking;
    els.mapHint.textContent = state.candidate ? 'Punto marcado: confirma abajo' : 'Toca el mapa donde está el coche';

    if (state.parking) {
      els.parkedWhen.textContent = new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(state.parking.parkedAt));
      els.coordinates.textContent = `${state.parking.lat.toFixed(6)}, ${state.parking.lon.toFixed(6)}`;
    }
    renderOverlay();
  }

  function status(text) { els.statusText.textContent = text; }

  function locate() {
    if (!('geolocation' in navigator)) { status('Este dispositivo no ofrece geolocalización web.'); return; }
    status('Buscando tu ubicación…');
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const first = !state.locatedOnce;
        state.user = { lat: pos.coords.latitude, lon: pos.coords.longitude, accuracy: pos.coords.accuracy };
        state.locatedOnce = true;
        status(`Ubicación localizada · precisión ±${Math.round(pos.coords.accuracy)} m`);
        if (first) {
          if (state.parking) fitBoth(); else centerOn(state.user, 20);
        } else {
          updateUI();
        }
      },
      (err) => {
        if (err.code === 1) status('Permiso de ubicación denegado. Actívalo en Ajustes de Safari.');
        else if (err.code === 2) status('No se puede obtener la ubicación ahora mismo.');
        else status('La localización está tardando demasiado. Pulsa ⌖ para reintentar.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 4000 }
    );
  }

  function openDirections(mode) {
    if (!state.parking) return;
    const dest = `${state.parking.lat},${state.parking.lon}`;
    const url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=${mode}`;
    window.location.assign(url);
  }

  function confirmAction(title, message, okLabel = 'Confirmar') {
    return new Promise(resolve => {
      els.confirmTitle.textContent = title;
      els.confirmMessage.textContent = message;
      els.confirmOkBtn.textContent = okLabel;
      let done = false;
      const finish = (value) => {
        if (done) return; done = true;
        els.confirmDialog.close(); resolve(value);
      };
      const ok = () => finish(true);
      const cancel = () => finish(false);
      els.confirmOkBtn.addEventListener('click', ok, { once: true });
      $('confirmCancelBtn').addEventListener('click', cancel, { once: true });
      els.confirmDialog.addEventListener('cancel', cancel, { once: true });
      els.confirmDialog.showModal();
    });
  }

  const DB_NAME = 'DondeAparqueDB';
  const STORE = 'parking';
  function dbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function dbGet() {
    const db = await dbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get('current');
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }
  async function dbSet(value) {
    const db = await dbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(value, 'current');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  async function dbClear() {
    const db = await dbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete('current');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function saveCandidate() {
    if (!state.candidate) return;
    if (state.parking) {
      const ok = await confirmAction('Sustituir aparcamiento', 'Ya hay un coche guardado. ¿Quieres sustituirlo por este nuevo punto?', 'Sustituir');
      if (!ok) return;
    }
    state.parking = { ...state.candidate, parkedAt: new Date().toISOString() };
    await dbSet(state.parking);
    state.candidate = null;
    if (navigator.storage?.persist) { try { await navigator.storage.persist(); } catch (_) {} }
    updateUI();
    fitBoth();
    status('Aparcamiento guardado solo en este dispositivo.');
  }

  async function clearParking() {
    const ok = await confirmAction('¿Coche recogido?', 'Se borrará la ubicación guardada de este dispositivo.', 'Borrar ubicación');
    if (!ok) return;
    await dbClear();
    state.parking = null;
    state.candidate = null;
    updateUI();
    if (state.user) centerOn(state.user, 20);
    status('Aparcamiento eliminado.');
  }

  function localPoint(ev) {
    const r = els.map.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  function onPointerDown(ev) {
    if (ev.target.closest('button, a')) return;
    els.map.setPointerCapture(ev.pointerId);
    const p = localPoint(ev);
    state.pointers.set(ev.pointerId, p);
    if (state.pointers.size === 1) {
      state.gesture = { type: 'single', start: p, last: p, moved: false };
    } else if (state.pointers.size === 2) {
      const pts = [...state.pointers.values()];
      state.gesture = { type: 'pinch', lastDistance: Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y), accumulator: 0 };
    }
  }

  function onPointerMove(ev) {
    if (!state.pointers.has(ev.pointerId)) return;
    const p = localPoint(ev);
    state.pointers.set(ev.pointerId, p);
    if (state.pointers.size === 1 && state.gesture?.type === 'single') {
      const dx = p.x - state.gesture.last.x, dy = p.y - state.gesture.last.y;
      if (Math.hypot(p.x-state.gesture.start.x, p.y-state.gesture.start.y) > 7) state.gesture.moved = true;
      if (state.gesture.moved) panBy(dx, dy);
      state.gesture.last = p;
    } else if (state.pointers.size === 2) {
      const pts = [...state.pointers.values()];
      const d = Math.hypot(pts[1].x-pts[0].x, pts[1].y-pts[0].y);
      if (state.gesture?.type !== 'pinch') state.gesture = { type: 'pinch', lastDistance: d, accumulator: 0 };
      const ratio = d / Math.max(1, state.gesture.lastDistance);
      state.gesture.accumulator += Math.log2(ratio);
      if (Math.abs(state.gesture.accumulator) >= 0.35) {
        const step = state.gesture.accumulator > 0 ? 1 : -1;
        setZoom(state.zoom + step);
        state.gesture.accumulator = 0;
      }
      state.gesture.lastDistance = d;
    }
  }

  function onPointerUp(ev) {
    if (!state.pointers.has(ev.pointerId)) return;
    const p = localPoint(ev);
    const wasTap = state.pointers.size === 1 && state.gesture?.type === 'single' && !state.gesture.moved;
    state.pointers.delete(ev.pointerId);
    if (wasTap) {
      state.candidate = screenToCoord(p.x, p.y);
      updateUI();
    }
    if (state.pointers.size === 0) state.gesture = null;
  }

  function wire() {
    $('zoomInBtn').addEventListener('click', () => setZoom(state.zoom + 1));
    $('zoomOutBtn').addEventListener('click', () => setZoom(state.zoom - 1));
    $('locateBtn').addEventListener('click', () => state.user ? centerOn(state.user, 20) : locate());
    $('saveHereBtn').addEventListener('click', saveCandidate);
    $('cancelCandidateBtn').addEventListener('click', () => { state.candidate = null; updateUI(); });
    $('showBothBtn').addEventListener('click', fitBoth);
    $('walkBtn').addEventListener('click', () => openDirections('walking'));
    $('driveBtn').addEventListener('click', () => openDirections('driving'));
    $('clearBtn').addEventListener('click', clearParking);
    $('installHelpBtn').addEventListener('click', async () => {
      if (state.deferredInstall) {
        state.deferredInstall.prompt();
        await state.deferredInstall.userChoice;
        state.deferredInstall = null;
      } else {
        els.installDialog.showModal();
      }
    });
    $('closeInstallBtn').addEventListener('click', () => els.installDialog.close());
    els.map.addEventListener('pointerdown', onPointerDown);
    els.map.addEventListener('pointermove', onPointerMove);
    els.map.addEventListener('pointerup', onPointerUp);
    els.map.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('resize', renderMap);
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); state.deferredInstall = e; });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && state.watchId === null) locate();
    });
  }

  async function init() {
    wire();
    try { state.parking = await dbGet(); } catch (_) { status('No se pudo leer el almacenamiento local.'); }
    updateUI();
    renderMap();
    locate();
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('./sw.js', { scope: './' }); } catch (_) {}
    }
  }

  init();
})();
