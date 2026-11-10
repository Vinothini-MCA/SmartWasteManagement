// Public homepage logic: load bins, render map + list, handle complaint modal

const API = ''; // same origin

let map, markersById = {};
let currentBins = [];

function statusColor(status) {
  if (status === 'overflow') return '#c1443b';
  if (status === 'warning') return '#c98a27';
  return '#4c8c5b';
}

function statusLabel(status) {
  if (status === 'overflow') return 'Overflow';
  if (status === 'warning') return 'Filling up';
  return 'Normal';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function initMap(center) {
  map = L.map('map', { scrollWheelZoom: false }).setView(center, 14);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
  }).addTo(map);
}

function markerIcon(status) {
  const color = statusColor(status);
  const pulse = status === 'overflow' ? 'box-shadow:0 0 0 6px ' + color + '33;' : '';
  return L.divIcon({
    className: '',
    html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #fff;${pulse}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function renderBins(bins) {
  currentBins = bins;

  // stats
  document.getElementById('statTotal').textContent = bins.length;
  document.getElementById('statOverflow').textContent = bins.filter((b) => b.status === 'overflow').length;
  document.getElementById('statNormal').textContent = bins.filter((b) => b.status === 'normal').length;

  // clear old markers
  Object.values(markersById).forEach((m) => map.removeLayer(m));
  markersById = {};

  // side list
  const list = document.getElementById('binList');
  list.innerHTML = '';

  bins.forEach((bin) => {
    const marker = L.marker([bin.lat, bin.lng], { icon: markerIcon(bin.status) }).addTo(map);

    marker.bindPopup(`
      <div class="popup-title">${escapeHtml(bin.name)}</div>
      <div class="popup-fill">${escapeHtml(bin.area)} &middot; ${bin.fillLevel}% full</div>
      <button type="button" class="btn btn-solid btn-sm popup-report-btn" style="margin-top:8px;">Report this bin</button>
    `);

    // Attach the click handler after the popup's HTML is actually in the DOM,
    // using a real reference to `bin` (avoids fragile string-escaping bugs).
    marker.on('popupopen', () => {
      const el = marker.getPopup().getElement();
      const btn = el && el.querySelector('.popup-report-btn');
      if (btn) {
        btn.addEventListener('click', () => openComplaintModal(bin.id));
      }
    });

    markersById[bin.id] = marker;

    const row = document.createElement('div');
    row.className = 'bin-list-item';
    row.innerHTML = `
      <span>${escapeHtml(bin.name)}</span>
      <span class="bin-tag tag-${bin.status}">${statusLabel(bin.status)} &middot; ${bin.fillLevel}%</span>
    `;
    row.addEventListener('click', () => {
      map.setView([bin.lat, bin.lng], 17);
      markersById[bin.id].openPopup();
    });
    list.appendChild(row);
  });

  populateBinSelect(bins);
}

function populateBinSelect(bins) {
  const select = document.getElementById('cf-binSelect');
  const previousValue = select.value;
  select.innerHTML = '<option value="" disabled>Choose a bin…</option>';
  bins.forEach((bin) => {
    const opt = document.createElement('option');
    opt.value = bin.id;
    opt.textContent = `${bin.name} — ${bin.area} (${bin.fillLevel}% full)`;
    select.appendChild(opt);
  });
  if (previousValue && bins.some((b) => String(b.id) === previousValue)) {
    select.value = previousValue;
  } else {
    select.selectedIndex = 0;
  }
}

async function loadBins() {
  const res = await fetch(`${API}/api/dustbins`);
  const bins = await res.json();
  if (!map) initMap([bins[0]?.lat || 10.9, bins[0]?.lng || 78.9]);
  renderBins(bins);
}

// ---- complaint modal ----
// Called with a specific bin id (from a marker's "Report this bin" button)
// or with no argument at all (from the general "Report a Problem" button),
// in which case the visitor picks the bin themselves from the dropdown.
window.openComplaintModal = function (binId) {
  const select = document.getElementById('cf-binSelect');
  if (binId != null && [...select.options].some((o) => o.value === String(binId))) {
    select.value = String(binId);
  }
  document.getElementById('complaintModal').classList.add('open');
};

document.getElementById('reportBtnHeader').addEventListener('click', () => openComplaintModal());
document.getElementById('reportBtnHero').addEventListener('click', () => openComplaintModal());

document.getElementById('closeModal').addEventListener('click', () => {
  document.getElementById('complaintModal').classList.remove('open');
});

document.getElementById('complaintModal').addEventListener('click', (e) => {
  if (e.target.id === 'complaintModal') {
    document.getElementById('complaintModal').classList.remove('open');
  }
});

document.getElementById('complaintForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const binId = document.getElementById('cf-binSelect').value;
  if (!binId) {
    showToast('Please choose which bin you are reporting.');
    return;
  }

  const payload = {
    dustbinId: Number(binId),
    name: document.getElementById('cf-name').value,
    phone: document.getElementById('cf-phone').value,
    description: document.getElementById('cf-desc').value,
  };

  try {
    const res = await fetch(`${API}/api/complaints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      document.getElementById('complaintModal').classList.remove('open');
      document.getElementById('complaintForm').reset();
      showToast('Complaint submitted — the municipality team will be dispatched.');
    } else {
      const data = await res.json().catch(() => ({}));
      showToast(data.error ? `Could not submit: ${data.error}` : 'Could not submit complaint. Please try again.');
    }
  } catch (err) {
    showToast('Could not reach the server. Is it still running?');
  }
});

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3500);
}

loadBins();
setInterval(loadBins, 8000); // refresh bin status periodically like a live sensor feed

// ---- Tamil Nadu location search ----
// Restricts results to Tamil Nadu's bounding box so "Thiruthuraipoondi",
// "Trichy", "Madurai" etc. all resolve to the right place in the state.
const TN_BBOX = { minLon: 76.23, minLat: 8.07, maxLon: 80.35, maxLat: 13.56 };
let searchMarker;

document.getElementById('locationSearchForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const query = document.getElementById('locationSearchInput').value.trim();
  const msg = document.getElementById('locationSearchMsg');
  if (!query) return;

  msg.style.display = 'block';
  msg.textContent = `Searching for "${query}" in Tamil Nadu...`;

  if (!map) {
    msg.textContent = 'Map is still loading — try again in a moment.';
    return;
  }

  try {
    const viewbox = `${TN_BBOX.minLon},${TN_BBOX.maxLat},${TN_BBOX.maxLon},${TN_BBOX.minLat}`;
    const geocodeUrl =
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in` +
      `&viewbox=${viewbox}&bounded=1&q=${encodeURIComponent(query + ', Tamil Nadu')}`;

    const res = await fetch(geocodeUrl, { headers: { Accept: 'application/json' } });
    const results = await res.json();

    if (!results.length) {
      msg.textContent = `Couldn't find "${query}" in Tamil Nadu. Try a different spelling or a nearby landmark.`;
      return;
    }

    const place = results[0];
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);

    map.setView([lat, lng], 14);

    if (searchMarker) map.removeLayer(searchMarker);
    searchMarker = L.marker([lat, lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="font-size:26px; line-height:1;">&#128205;</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 26],
      }),
    })
      .addTo(map)
      .bindPopup(`<div class="popup-title">${escapeHtml(place.display_name.split(',')[0])}</div>`)
      .openPopup();

    msg.textContent = `Showing: ${place.display_name}`;
  } catch (err) {
    msg.textContent = 'Search failed — please check your internet connection and try again.';
  }
});
