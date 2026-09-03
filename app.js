const appState = {
  data: window.AIPRI_EVENT_DATA,
  query: "",
  date: "all",
  age: "all",
  time: "all",
  sort: "date",
  view: "list",
  userLocation: null,
  selectedShopId: null,
};

let map;
let markerLayer;
let currentLocationLayer;
let markerByShopId = new Map();
let toastTimer;

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  setupFilters();
  bindEvents();
  render();
});

function bindElements() {
  Object.assign(els, {
    sourceStamp: document.querySelector("#sourceStamp"),
    sourceLink: document.querySelector("#sourceLink"),
    searchInput: document.querySelector("#searchInput"),
    dateFilter: document.querySelector("#dateFilter"),
    timeFilter: document.querySelector("#timeFilter"),
    sortMode: document.querySelector("#sortMode"),
    resultCount: document.querySelector("#resultCount"),
    eventCount: document.querySelector("#eventCount"),
    nearestSummary: document.querySelector("#nearestSummary"),
    activeFilters: document.querySelector("#activeFilters"),
    shopList: document.querySelector("#shopList"),
    listPanel: document.querySelector("#listPanel"),
    mapPanel: document.querySelector("#mapPanel"),
    mapDrawer: document.querySelector("#mapDrawer"),
    toast: document.querySelector("#toast"),
    locateBtn: document.querySelector("#locateBtn"),
    refreshBtn: document.querySelector("#refreshBtn"),
    listViewBtn: document.querySelector("#listViewBtn"),
    mapViewBtn: document.querySelector("#mapViewBtn"),
  });
}

function setupFilters() {
  const dates = unique(
    appState.data.shops.flatMap((shop) => shop.events.map((event) => event.date).filter(Boolean)),
  ).sort();

  if (appState.date !== "all" && !dates.includes(appState.date)) {
    appState.date = "all";
  }

  els.dateFilter.innerHTML = [
    `<button class="${appState.date === "all" ? "is-active" : ""}" type="button" data-date="all">すべて</button>`,
    ...dates.map(
      (date) =>
        `<button class="${appState.date === date ? "is-active" : ""}" type="button" data-date="${date}">${formatDate(date)}</button>`,
    ),
  ].join("");

  els.sourceLink.href = appState.data.sourceUrl;
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    appState.query = event.target.value;
    render();
  });

  els.dateFilter.addEventListener("click", (event) => {
    const button = event.target.closest("[data-date]");
    if (!button) return;
    appState.date = button.dataset.date;
    els.dateFilter.querySelectorAll("[data-date]").forEach((item) => {
      item.classList.toggle("is-active", item === button);
    });
    render();
  });

  els.timeFilter.addEventListener("click", (event) => {
    const button = event.target.closest("[data-time]");
    if (!button) return;
    appState.time = button.dataset.time;
    setActiveToggle(els.timeFilter, "time", appState.time);
    render();
  });

  els.sortMode.addEventListener("click", (event) => {
    const button = event.target.closest("[data-sort]");
    if (!button) return;
    appState.sort = button.dataset.sort;
    setActiveToggle(els.sortMode, "sort", appState.sort);
    render();
  });

  document.querySelectorAll("[data-age]").forEach((button) => {
    button.addEventListener("click", () => {
      appState.age = button.dataset.age;
      document.querySelectorAll("[data-age]").forEach((item) => {
        item.classList.toggle("is-active", item === button);
      });
      render();
    });
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });

  els.locateBtn.addEventListener("click", locateUser);
  els.refreshBtn.addEventListener("click", refreshFromServer);

  els.shopList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-map-shop]");
    if (!button) return;
    appState.selectedShopId = button.dataset.mapShop;
    setView("map", { scrollToMap: true });
  });

  els.mapPanel.addEventListener("click", (event) => {
    const popupButton = event.target.closest("[data-popup-shop]");
    if (!popupButton || !els.mapPanel.contains(popupButton)) return;
    selectShopOnMap(popupButton.dataset.popupShop, { scrollDrawer: true });
  });

  els.mapDrawer.addEventListener("click", (event) => {
    const pinButton = event.target.closest("[data-map-shop]");
    if (pinButton && els.mapDrawer.contains(pinButton)) {
      selectShopOnMap(pinButton.dataset.mapShop, { scrollDrawer: false });
      scrollMapIntoView();
      return;
    }

    if (event.target.closest("a, button")) return;
    const target = event.target.closest(".shop-card[data-shop-id]");
    if (!target || !els.mapDrawer.contains(target)) return;
    selectShopOnMap(target.dataset.shopId, { scrollDrawer: false });
  });

  els.mapDrawer.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    if (event.target.closest("a, button, input, select")) return;
    const card = event.target.closest(".shop-card[data-shop-id]");
    if (!card || !els.mapDrawer.contains(card)) return;
    event.preventDefault();
    selectShopOnMap(card.dataset.shopId, { scrollDrawer: false });
  });
}

function setView(view, { scrollToMap = false } = {}) {
  appState.view = view;
  els.listPanel.hidden = view !== "list";
  els.mapPanel.hidden = view !== "map";
  els.listViewBtn.classList.toggle("is-active", view === "list");
  els.mapViewBtn.classList.toggle("is-active", view === "map");

  render();

  if (view === "map") {
    setTimeout(() => {
      if (map) {
        map.invalidateSize();
        focusSelectedOnMap();
        if (scrollToMap) scrollMapIntoView();
      }
    }, 0);
  }
}

function render() {
  const filtered = getFilteredShops();
  renderSource();
  renderSummary(filtered);
  renderList(filtered);

  if (appState.view === "map") {
    initMap();
    renderMap(filtered);
  }
}

function renderSource() {
  const stamp = appState.data.fetchedAt || appState.data.generatedAt;
  els.sourceStamp.textContent = `公式取得 ${formatTimestamp(stamp)} / ${appState.data.shops.length}店舗`;
}

function renderSummary(filtered) {
  const eventTotal = filtered.reduce((sum, item) => sum + item.events.length, 0);
  els.resultCount.textContent = `${filtered.length}店舗`;
  els.eventCount.textContent = `${eventTotal}大会`;
  els.activeFilters.textContent = describeActiveFilters();

  const nearest = getNearest(filtered);
  if (nearest) {
    els.nearestSummary.textContent = `最寄り候補 ${nearest.shop.name} ${formatDistance(nearest.distanceKm)}`;
  } else if (appState.userLocation) {
    els.nearestSummary.textContent = "現在地から計算できる店舗がありません";
  } else {
    els.nearestSummary.textContent = "現在地を取得すると近い順で探せます";
  }
}

function renderList(filtered) {
  if (!filtered.length) {
    els.shopList.innerHTML = `<div class="empty-state">条件に合う店舗がありません</div>`;
    return;
  }

  els.shopList.innerHTML = filtered.map(({ shop, events }) => renderShopCard(shop, events)).join("");
}

function renderShopCard(shop, events, compact = false) {
  const distance = getDistanceForShop(shop);
  const prefectureChip = shop.prefecture
    ? `<span class="chip prefecture-chip">${escapeHtml(shop.prefecture)}</span>`
    : "";
  const ageChips = unique(events.map((event) => event.ageLimit).filter(Boolean))
    .map((age) => `<span class="chip ${ageClass(age)}">${escapeHtml(age)}</span>`)
    .join("");
  const machineChips = shop.machineTypes
    .map((type) => `<span class="chip">${escapeHtml(type)}</span>`)
    .join("");
  const selected = shop.id === appState.selectedShopId;
  const selectedClass = selected ? " is-selected" : "";

  return `
    <article class="shop-card${selectedClass}" data-shop-id="${shop.id}" aria-current="${selected ? "true" : "false"}" tabindex="${compact ? "0" : "-1"}">
      <div class="shop-head">
        <div class="shop-title-row">
          <h2 class="shop-title">${escapeHtml(shop.name)}</h2>
          ${Number.isFinite(distance) ? `<span class="distance">${formatDistance(distance)}</span>` : ""}
        </div>
        <p class="address">${escapeHtml(shop.address)}</p>
        <div class="chip-row">${prefectureChip}${machineChips}${ageChips}</div>
      </div>
      ${renderEventTable(shop, events)}
      <div class="actions">
        <a class="action-link primary" href="${routeUrl(shop)}" target="_blank" rel="noopener">経路</a>
        <a class="action-link" href="${searchUrl(shop)}" target="_blank" rel="noopener">Googleマップ</a>
        ${
          compact
            ? `<button class="plain-button" type="button" data-map-shop="${shop.id}">ピン</button>`
            : `<button class="plain-button" type="button" data-map-shop="${shop.id}">地図で見る</button>`
        }
      </div>
    </article>
  `;
}

function renderEventTable(shop, events) {
  return `
    <table class="event-table">
      <thead>
        <tr>
          <th>日程</th>
          <th>年齢制限</th>
          <th>開催</th>
          <th>受付 / 抽選</th>
        </tr>
      </thead>
      <tbody>
        ${events
          .map(
            (event) => `
              <tr>
                <td>
                  <strong>${formatDate(event.date)}</strong>
                  <div class="event-label">${escapeHtml(event.label)}</div>
                </td>
                <td><span class="chip ${ageClass(event.ageLimit)}">${escapeHtml(event.ageLimit)}</span></td>
                <td><strong>${escapeHtml(event.startTime)}</strong></td>
                <td>
                  ${escapeHtml(event.registrationTime || "未記載")}
                  <div class="event-label">抽選 ${escapeHtml(event.lotteryTime || "未記載")}</div>
                  ${event.note ? `<div class="event-label">${escapeHtml(event.note)}</div>` : ""}
                  ${renderCalendarLink(shop, event)}
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderCalendarLink(shop, event) {
  return `
    <a class="calendar-link" href="${escapeHtml(googleCalendarUrl(shop, event))}" target="_blank" rel="noopener">
      Googleカレンダー
    </a>
  `;
}

function googleCalendarUrl(shop, event) {
  const title = `${event.label || "大会"} ${shop.name} - メルヘンフェスコーデ`;
  const details = [
    appState.data.eventName,
    `店舗: ${shop.name}`,
    `都道府県: ${shop.prefecture || "未記載"}`,
    `住所: ${shop.address || "未記載"}`,
    `大会: ${event.label || "未記載"}`,
    `日程: ${event.dateDisplay || event.date || "未記載"}`,
    `年齢制限: ${event.ageLimit || "未記載"}`,
    `参加受付時間: ${event.registrationTime || "未記載"}`,
    `抽選開始時間: ${event.lotteryTime || "未記載"}`,
    `開催時間: ${event.startTime || "未記載"}`,
    event.note ? `備考: ${event.note}` : "",
    `公式: ${appState.data.sourceUrl}`,
  ]
    .filter(Boolean)
    .join("\n");

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", title);
  const dates = calendarDateRange(event);
  if (dates) url.searchParams.set("dates", dates);
  url.searchParams.set("details", details);
  url.searchParams.set("location", `${shop.name} ${shop.prefecture || ""}${shop.address || ""}`);
  url.searchParams.set("ctz", "Asia/Tokyo");
  return url.toString();
}

function calendarDateRange(event) {
  if (!event.date) return "";

  const startMinutes = firstFinite(
    timeToMinutes(event.registrationTime),
    timeToMinutes(event.lotteryTime),
    timeToMinutes(event.startTime),
  );

  if (!Number.isFinite(startMinutes)) {
    return `${compactDate(event.date)}/${compactDate(addDays(event.date, 1))}`;
  }

  const endCandidates = [
    startMinutes + 60,
    addMinutesIfFinite(timeToMinutes(event.startTime), 60),
    addMinutesIfFinite(parseRangeEnd(event.registrationTime), 0),
    addMinutesIfFinite(timeToMinutes(event.lotteryTime), 30),
  ].filter(Number.isFinite);
  const endMinutes = Math.max(...endCandidates);

  return `${compactDateTime(event.date, startMinutes)}/${compactDateTime(event.date, endMinutes)}`;
}

function firstFinite(...values) {
  return values.find(Number.isFinite) ?? Number.NaN;
}

function addMinutesIfFinite(value, minutes) {
  return Number.isFinite(value) ? value + minutes : Number.NaN;
}

function parseRangeEnd(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})\s*[～〜~-]\s*(\d{1,2}):(\d{2})/);
  if (!match) return Number.NaN;
  return Number(match[3]) * 60 + Number(match[4]);
}

function initMap() {
  if (map || typeof L === "undefined") return;

  map = L.map("map", { zoomControl: true }).setView([35.13, 136.95], 9);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map);
  markerLayer = L.layerGroup().addTo(map);
  currentLocationLayer = L.layerGroup().addTo(map);
}

function renderMap(filtered) {
  if (!map) {
    els.mapDrawer.innerHTML = `<div class="empty-state">地図ライブラリを読み込めませんでした</div>`;
    return;
  }

  markerLayer.clearLayers();
  markerByShopId = new Map();

  const bounds = [];
  filtered.forEach(({ shop, events }) => {
    if (!hasLocation(shop)) return;
    const marker = L.circleMarker([shop.location.lat, shop.location.lng], markerStyle(shop.id));
    marker.bindPopup(renderPopup(shop, events));
    marker.on("click", () => {
      appState.selectedShopId = shop.id;
      highlightSelectedShopCards();
      paintMarkers();
    });
    marker.addTo(markerLayer);
    markerByShopId.set(shop.id, marker);
    bounds.push([shop.location.lat, shop.location.lng]);
  });

  renderCurrentLocation();

  if (!appState.selectedShopId && filtered[0]) {
    appState.selectedShopId = filtered[0].shop.id;
  }

  renderMapDrawer(filtered);
  paintMarkers();

  if (bounds.length) {
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 13 });
  }
}

function renderMapDrawer(filtered, { scrollToSelected = false } = {}) {
  const selected = filtered.find((item) => item.shop.id === appState.selectedShopId) || filtered[0];
  if (!selected) {
    els.mapDrawer.innerHTML = `<div class="empty-state">条件に合う店舗がありません</div>`;
    return;
  }

  appState.selectedShopId = selected.shop.id;
  const eventCount = filtered.reduce((sum, item) => sum + item.events.length, 0);
  els.mapDrawer.innerHTML = `
    <div class="map-drawer__header">
      <strong>店舗一覧</strong>
      <span>${filtered.length}店舗 / ${eventCount}大会</span>
    </div>
    <div class="map-shop-list">
      ${filtered.map(({ shop, events }) => renderShopCard(shop, events, true)).join("")}
    </div>
  `;

  if (scrollToSelected) {
    requestAnimationFrame(() => scrollSelectedShopIntoView());
  }
}

function renderCurrentLocation() {
  currentLocationLayer.clearLayers();
  if (!appState.userLocation || typeof L === "undefined") return;

  L.circleMarker([appState.userLocation.lat, appState.userLocation.lng], {
    radius: 9,
    color: "#007f9c",
    weight: 3,
    fillColor: "#ffe767",
    fillOpacity: 0.95,
  })
    .bindPopup("現在地")
    .addTo(currentLocationLayer);
}

function paintMarkers() {
  markerByShopId.forEach((marker, shopId) => {
    marker.setStyle(markerStyle(shopId));
  });
}

function selectShopOnMap(shopId, { scrollDrawer = true } = {}) {
  if (!shopId) return;
  appState.selectedShopId = shopId;
  highlightSelectedShopCards();
  focusSelectedOnMap({ scrollDrawer });
}

function highlightSelectedShopCards() {
  els.mapDrawer.querySelectorAll(".shop-card[data-shop-id]").forEach((card) => {
    const selected = card.dataset.shopId === appState.selectedShopId;
    card.classList.toggle("is-selected", selected);
    card.setAttribute("aria-current", selected ? "true" : "false");
  });
}

function markerStyle(shopId) {
  const selected = shopId === appState.selectedShopId;
  return {
    radius: selected ? 11 : 8,
    color: selected ? "#2d2847" : "#ffffff",
    weight: selected ? 3 : 2,
    fillColor: selected ? "#ff69ab" : "#00a8c8",
    fillOpacity: 0.95,
  };
}

function renderPopup(shop, events) {
  return `
    <button class="popup-title popup-title-button" type="button" data-popup-shop="${escapeHtml(shop.id)}">${escapeHtml(shop.name)}</button>
    ${events.length ? `<ul class="popup-events">${events.map(renderPopupEvent).join("")}</ul>` : `<p class="popup-meta">開催情報がありません</p>`}
  `;
}

function renderPopupEvent(event) {
  return `
    <li class="popup-event">
      <div class="popup-event__head">
        <strong>${escapeHtml(formatDate(event.date))}</strong>
        <span class="chip ${ageClass(event.ageLimit)}">${escapeHtml(event.ageLimit || "年齢制限未記載")}</span>
      </div>
      <div class="popup-event__time">${escapeHtml(popupTimeText(event))}</div>
    </li>
  `;
}

function popupTimeText(event) {
  return [
    event.registrationTime || "未記載",
    event.lotteryTime || "未記載",
    event.startTime || "未記載",
  ].join(" / ");
}

function focusSelectedOnMap({ scrollDrawer = true } = {}) {
  if (!map || !appState.selectedShopId) return;
  const marker = markerByShopId.get(appState.selectedShopId);
  if (!marker) return;
  const latLng = marker.getLatLng();
  map.setView(latLng, Math.max(map.getZoom(), 13), { animate: true });
  marker.openPopup();
  paintMarkers();
  highlightSelectedShopCards();
  if (scrollDrawer) scrollSelectedShopIntoView();
}

function scrollSelectedShopIntoView() {
  const selectedCard = [...els.mapDrawer.querySelectorAll(".shop-card[data-shop-id]")].find(
    (card) => card.dataset.shopId === appState.selectedShopId,
  );
  selectedCard?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function scrollMapIntoView() {
  document.querySelector("#map")?.scrollIntoView({ block: "start", behavior: "smooth" });
}

function getFilteredShops() {
  const query = normalize(appState.query);
  const filtered = appState.data.shops
    .map((shop) => {
      const baseEvents = shop.events.filter((event) => eventMatches(event));
      if (!baseEvents.length) return null;

      if (!query) return { shop, events: baseEvents };

      const shopMatchesQuery = normalize(
        `${shop.prefecture || ""} ${shop.name} ${shop.address} ${shop.participation}`,
      ).includes(query);
      const queryEvents = baseEvents.filter((event) => normalize(eventText(event)).includes(query));
      const events = shopMatchesQuery ? baseEvents : queryEvents;
      return events.length ? { shop, events } : null;
    })
    .filter(Boolean);

  return sortFiltered(filtered);
}

function eventMatches(event) {
  if (appState.date !== "all" && event.date !== appState.date) return false;
  if (appState.age !== "all" && event.ageLimit !== appState.age) return false;
  if (!timeMatches(event.registrationTime || event.startTime)) return false;
  return true;
}

function timeMatches(value) {
  if (appState.time === "all") return true;
  const minutes = timeToMinutes(value);
  if (!Number.isFinite(minutes)) return false;
  if (appState.time === "morning") return minutes < 12 * 60;
  if (appState.time === "midday") return minutes >= 12 * 60 && minutes < 14 * 60;
  if (appState.time === "late") return minutes >= 14 * 60;
  return true;
}

function sortFiltered(items) {
  return [...items].sort((a, b) => {
    if (appState.sort === "name") {
      return a.shop.name.localeCompare(b.shop.name, "ja");
    }

    if (appState.sort === "distance" && appState.userLocation) {
      return getDistanceForShop(a.shop) - getDistanceForShop(b.shop);
    }

    return earliestEventKey(a.events).localeCompare(earliestEventKey(b.events), "ja");
  });
}

function earliestEventKey(events) {
  const sorted = [...events].sort((a, b) => {
    const left = `${a.date || "9999-12-31"} ${a.startTime || "99:99"}`;
    const right = `${b.date || "9999-12-31"} ${b.startTime || "99:99"}`;
    return left.localeCompare(right);
  });
  const first = sorted[0];
  return `${first?.date || "9999-12-31"} ${first?.startTime || "99:99"}`;
}

function locateUser() {
  if (!navigator.geolocation) {
    showToast("このブラウザでは現在地を取得できません");
    return;
  }

  els.locateBtn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    (position) => {
      appState.userLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      appState.sort = "distance";
      setActiveToggle(els.sortMode, "sort", appState.sort);
      els.locateBtn.disabled = false;
      showToast("現在地を取得しました");
      render();
    },
    () => {
      els.locateBtn.disabled = false;
      showToast("現在地を取得できませんでした。localhost または HTTPS で開くと安定します");
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
  );
}

async function refreshFromServer() {
  els.refreshBtn.disabled = true;
  const originalLabel = els.refreshBtn.getAttribute("aria-label");
  els.refreshBtn.classList.add("is-loading");
  els.refreshBtn.setAttribute("aria-label", "最新情報を取得中");

  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    if (!response.ok) throw new Error(`refresh failed: ${response.status}`);
    const refreshed = await response.json();
    appState.data = refreshed;
    appState.selectedShopId = null;
    setupFilters();
    showToast("公式ページから最新情報を取得しました");
    render();
  } catch (error) {
    showToast("最新取得は server.mjs から開いた場合に使えます。静的版では tools/refresh-data.mjs を実行してください");
  } finally {
    els.refreshBtn.disabled = false;
    els.refreshBtn.classList.remove("is-loading");
    els.refreshBtn.setAttribute("aria-label", originalLabel);
  }
}

function getNearest(filtered) {
  if (!appState.userLocation) return null;
  return filtered
    .map(({ shop }) => ({ shop, distanceKm: getDistanceForShop(shop) }))
    .filter((item) => Number.isFinite(item.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];
}

function getDistanceForShop(shop) {
  if (!appState.userLocation || !hasLocation(shop)) return Number.POSITIVE_INFINITY;
  return haversine(appState.userLocation, shop.location);
}

function routeUrl(shop) {
  const destination = hasLocation(shop)
    ? `${shop.location.lat},${shop.location.lng}`
    : `${shop.name} ${shop.address}`;
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("destination", destination);
  url.searchParams.set("travelmode", "transit");
  if (appState.userLocation) {
    url.searchParams.set("origin", `${appState.userLocation.lat},${appState.userLocation.lng}`);
  }
  return url.toString();
}

function searchUrl(shop) {
  if (shop.mapsSearchUrl) return shop.mapsSearchUrl;
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", `${shop.name} ${shop.address}`);
  return url.toString();
}

function hasLocation(shop) {
  return Number.isFinite(shop.location?.lat) && Number.isFinite(shop.location?.lng);
}

function haversine(a, b) {
  const radiusKm = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * radiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toRad(value) {
  return (value * Math.PI) / 180;
}

function formatDistance(km) {
  if (!Number.isFinite(km)) return "";
  if (km < 1) return `${Math.round(km * 1000)}m`;
  return `${km.toFixed(1)}km`;
}

function formatDate(date) {
  if (!date) return "未記載";
  const parsed = new Date(`${date}T00:00:00+09:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(parsed);
}

function formatTimestamp(value) {
  if (!value) return "未記録";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function describeActiveFilters() {
  const parts = [];
  if (appState.query.trim()) parts.push(`検索 ${appState.query.trim()}`);
  if (appState.date !== "all") parts.push(formatDate(appState.date));
  if (appState.age !== "all") parts.push(appState.age);
  if (appState.time !== "all") {
    const label = getToggleLabel(els.timeFilter, "time", appState.time);
    parts.push(label);
  }
  return parts.length ? parts.join(" / ") : "条件なし";
}

function setActiveToggle(container, key, value) {
  container.querySelectorAll(`[data-${key}]`).forEach((item) => {
    item.classList.toggle("is-active", item.dataset[key] === value);
  });
}

function getToggleLabel(container, key, value) {
  return container.querySelector(`[data-${key}="${value}"]`)?.textContent || "";
}

function ageClass(age) {
  if (age === "年齢無制限") return "age-free";
  if (age === "中学生以下") return "age-junior";
  return "";
}

function eventText(event) {
  return [
    event.label,
    event.dateDisplay,
    event.ageLimit,
    event.startTime,
    event.registrationTime,
    event.lotteryTime,
    event.note,
  ].join(" ");
}

function timeToMinutes(value) {
  const match = String(value || "").match(/(\d{1,2}):(\d{2})/);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

function compactDateTime(date, minutes) {
  const dayOffset = Math.floor(minutes / (24 * 60));
  const localMinutes = ((minutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const targetDate = addDays(date, dayOffset);
  const hours = Math.floor(localMinutes / 60);
  const mins = localMinutes % 60;
  return `${compactDate(targetDate)}T${pad2(hours)}${pad2(mins)}00`;
}

function compactDate(date) {
  return String(date || "").replaceAll("-", "");
}

function addDays(date, days) {
  const [year, month, day] = String(date || "")
    .split("-")
    .map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day + days));
  return [
    parsed.getUTCFullYear(),
    pad2(parsed.getUTCMonth() + 1),
    pad2(parsed.getUTCDate()),
  ].join("-");
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalize(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values)];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  els.toast.textContent = message;
  els.toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    els.toast.hidden = true;
  }, 4600);
}
