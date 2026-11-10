// Admin dashboard: login, complaint list/status updates, live tracking map

const API = '';
let trackMap, trackVehicleMarker, trackBinMarker, trackInterval;
let activeComplaintId = null;

function authHeaders() {
  return { 'x-auth-token': localStorage.getItem('swm-token') || '' };
}

function showDash() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('dashView').style.display = 'block';
  document.getElementById('logoutBtn').style.display = 'inline-flex';
  loadComplaints();
}

function showLogin() {
  document.getElementById('loginView').style.display = 'flex';
  document.getElementById('dashView').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
}

// on load, check if already logged in
if (localStorage.getItem('swm-token')) {
  showDash();
} else {
  showLogin();
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('lg-user').value;
  const password = document.getElementById('lg-pass').value;
  const res = await fetch(`${API}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (res.ok) {
    const data = await res.json();
    localStorage.setItem('swm-token', data.token);
    document.getElementById('loginError').style.display = 'none';
    showDash();
  } else {
    document.getElementById('loginError').style.display = 'block';
  }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('swm-token');
  if (trackInterval) clearInterval(trackInterval);
  showLogin();
});

function statusPillClass(status) {
  return status === 'resolved' ? 'status-resolved' : status === 'in-progress' ? 'status-in-progress' : 'status-pending';
}

async function loadComplaints() {
  const res = await fetch(`${API}/api/complaints`, { headers: authHeaders() });
  if (res.status === 401) {
    localStorage.removeItem('swm-token');
    showLogin();
    return;
  }
  const complaints = await res.json();
  const list = document.getElementById('complaintsList');
  list.innerHTML = '';

  if (!complaints.length) {
    list.innerHTML = '<div class="empty-state">No complaints yet. Nice and clean out there.</div>';
    return;
  }

  complaints.forEach((c) => {
    const el = document.createElement('div');
    el.className = 'complaint-item';
    el.innerHTML = `
      <div class="complaint-top">
        <strong>${c.dustbinName} — ${c.area}</strong>
        <span class="status-pill ${statusPillClass(c.status)}">${c.status}</span>
      </div>
      <div class="complaint-meta">Reported by ${c.name} (${c.phone}) &middot; ${new Date(c.createdAt).toLocaleString()}</div>
      <div class="complaint-desc">${c.description}</div>
      <div class="complaint-actions">
        <button class="btn btn-ghost btn-sm" onclick="trackComplaint(${c.id})">Track Live Location</button>
        ${c.status !== 'in-progress' && c.status !== 'resolved' ? `<button class="btn btn-ghost btn-sm" onclick="setStatus(${c.id}, 'in-progress')">Dispatch Team</button>` : ''}
        ${c.status !== 'resolved' ? `<button class="btn btn-solid btn-sm" onclick="setStatus(${c.id}, 'resolved')">Mark Collected</button>` : ''}
      </div>
    `;
    list.appendChild(el);
  });
}

window.setStatus = async function (id, status) {
  await fetch(`${API}/api/complaints/${id}/status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ status }),
  });
  loadComplaints();
  if (activeComplaintId === id && status === 'resolved') {
    document.getElementById('trackStatus').textContent = 'Collection completed. Bin has been emptied.';
    if (trackInterval) clearInterval(trackInterval);
  }
};

// ---------- Live tracking ----------
window.trackComplaint = function (id) {
  activeComplaintId = id;
  document.getElementById('trackHint').style.display = 'none';
  document.getElementById('trackProgressWrap').style.display = 'block';

  if (trackInterval) clearInterval(trackInterval);
  if (!trackMap) {
    trackMap = L.map('trackMap', { scrollWheelZoom: false }).setView([8.63, 79.845], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(trackMap);
  }

  pollTracking(id);
  trackInterval = setInterval(() => pollTracking(id), 2000);
};

async function pollTracking(id) {
  const res = await fetch(`${API}/api/tracking/${id}`);
  if (!res.ok) return;
  const data = await res.json();

  if (!trackBinMarker) {
    trackBinMarker = L.marker([data.destination.lat, data.destination.lng], {
      icon: L.divIcon({ className: '', html: '<div style="width:14px;height:14px;border-radius:50%;background:#c1443b;border:2px solid #fff;"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
    }).addTo(trackMap).bindPopup('Overflowing bin (destination)');
  } else {
    trackBinMarker.setLatLng([data.destination.lat, data.destination.lng]);
  }

  if (!trackVehicleMarker) {
    trackVehicleMarker = L.marker([data.vehicle.lat, data.vehicle.lng], {
      icon: L.divIcon({ className: '', html: '<div style="font-size:20px;">&#128666;</div>', iconSize: [24, 24], iconAnchor: [12, 12] }),
    }).addTo(trackMap).bindPopup('Collection vehicle (live)');
  } else {
    trackVehicleMarker.setLatLng([data.vehicle.lat, data.vehicle.lng]);
  }

  const bounds = L.latLngBounds([
    [data.vehicle.lat, data.vehicle.lng],
    [data.destination.lat, data.destination.lng],
  ]);
  trackMap.fitBounds(bounds, { padding: [40, 40] });

  document.getElementById('trackProgressFill').style.width = `${Math.round(data.progress * 100)}%`;

  if (data.arrived) {
    document.getElementById('trackStatus').textContent = 'Vehicle has reached the bin. Waiting for collection to be marked complete.';
    clearInterval(trackInterval);
  } else {
    document.getElementById('trackStatus').textContent = `Vehicle en route — ${Math.round(data.progress * 100)}% of the way there.`;
  }
}

// ---------- Add a new dustbin by Tamil Nadu place name ----------
// Restricts geocoding results to Tamil Nadu's bounding box so any town
// name (Thiruthuraipoondi, Trichy, Madurai, etc.) resolves correctly.
const TN_BBOX = { minLon: 76.23, minLat: 8.07, maxLon: 80.35, maxLat: 13.56 };
let addBinMap, addBinMarker, locatedPlace = null;

document.getElementById('ab-locate').addEventListener('click', async () => {
  const place = document.getElementById('ab-place').value.trim();
  const msg = document.getElementById('ab-locateMsg');
  const submitBtn = document.getElementById('ab-submit');
  if (!place) return;

  msg.style.display = 'block';
  msg.textContent = `Locating "${place}" in Tamil Nadu...`;
  submitBtn.disabled = true;
  locatedPlace = null;

  try {
    const viewbox = `${TN_BBOX.minLon},${TN_BBOX.maxLat},${TN_BBOX.maxLon},${TN_BBOX.minLat}`;
    const geocodeUrl =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in` +
      `&viewbox=${viewbox}&bounded=1&q=${encodeURIComponent(place + ', Tamil Nadu')}`;

    const res = await fetch(geocodeUrl, { headers: { Accept: 'application/json' } });
    const results = await res.json();

    if (!results.length) {
      msg.textContent = `Couldn't find "${place}" in Tamil Nadu. Try a different spelling or a nearby landmark.`;
      return;
    }

    const found = results[0];
    const lat = parseFloat(found.lat);
    const lng = parseFloat(found.lon);
    locatedPlace = { lat, lng, displayName: found.display_name };

    if (!addBinMap) {
      addBinMap = L.map('addBinMap', { scrollWheelZoom: false }).setView([lat, lng], 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(addBinMap);
    } else {
      addBinMap.setView([lat, lng], 14);
    }

    if (addBinMarker) addBinMap.removeLayer(addBinMarker);
    addBinMarker = L.marker([lat, lng]).addTo(addBinMap).bindPopup(found.display_name.split(',')[0]).openPopup();

    msg.textContent = `Found: ${found.display_name}`;
    submitBtn.disabled = false;
  } catch (err) {
    msg.textContent = 'Location search failed — please check your internet connection and try again.';
  }
});

document.getElementById('addBinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!locatedPlace) return;

  const name = document.getElementById('ab-name').value;
  const area = document.getElementById('ab-place').value;

  const res = await fetch(`${API}/api/dustbins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, area, lat: locatedPlace.lat, lng: locatedPlace.lng }),
  });

  const msg = document.getElementById('ab-locateMsg');
  if (res.ok) {
    msg.textContent = `"${name}" added at ${area}. It will now show on the public map.`;
    document.getElementById('addBinForm').reset();
    document.getElementById('ab-submit').disabled = true;
    locatedPlace = null;
  } else {
    msg.textContent = 'Could not add the dustbin. Please try again.';
  }
});
