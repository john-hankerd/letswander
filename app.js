(function () {
  "use strict";

  // Stage 2: pins come from the Netlify function, which reads John's Google Sheet.
  var PINS_URL = "/.netlify/functions/pins";
  var SAVED_KEY = "letswander:saved";

  var map = L.map("map", { zoomControl: false, worldCopyJump: true }).setView([39.8283, -98.5795], 4);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors"'
  }).addTo(map);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  var clusterGroup = L.markerClusterGroup({
    iconCreateFunction: function (cluster) {
      var count = cluster.getChildCount();
      var size = count < 10 ? 38 : count < 50 ? 46 : 54;
      return L.divIcon({
        html: "<span>" + count + "</span>",
        className: "marker-cluster-custom",
        iconSize: [size, size]
      });
    },
    maxClusterRadius: 60
  });
  map.addLayer(clusterGroup);

  var pinsById = {};
  var markersById = {};

  function getSaved() {
    try {
      return JSON.parse(localStorage.getItem(SAVED_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  function setSaved(ids) {
    localStorage.setItem(SAVED_KEY, JSON.stringify(ids));
    updateSavedCount();
  }

  function isSaved(id) {
    return getSaved().indexOf(id) !== -1;
  }

  function toggleSaved(id) {
    var saved = getSaved();
    var idx = saved.indexOf(id);
    if (idx === -1) {
      saved.push(id);
      showToast("Spot saved");
    } else {
      saved.splice(idx, 1);
      showToast("Spot removed from saved");
    }
    setSaved(saved);
    return idx === -1;
  }

  function updateSavedCount() {
    var count = getSaved().length;
    var el = document.getElementById("savedCount");
    el.textContent = String(count);
    el.hidden = count === 0;
  }

  var toastTimer = null;
  function showToast(message) {
    var toast = document.getElementById("toast");
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.hidden = true;
    }, 2200);
  }

  function speak(text) {
    if (!("speechSynthesis" in window)) {
      showToast("Read-aloud isn't supported on this browser");
      return;
    }
    window.speechSynthesis.cancel();
    var utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.98;
    window.speechSynthesis.speak(utter);
  }

  function shareUrlFor(id) {
    return window.location.origin + window.location.pathname + "?pin=" + encodeURIComponent(id);
  }

  function sharePin(pin) {
    var url = shareUrlFor(pin.id);
    if (navigator.share) {
      navigator.share({ title: pin.name, text: "Check out " + pin.name + " on Let's Wander", url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        showToast("Link copied to clipboard");
      });
    } else {
      window.prompt("Copy this link:", url);
    }
  }

  function shareApp() {
    var url = window.location.origin + window.location.pathname;
    if (navigator.share) {
      navigator.share({ title: "Let's Wander", text: "Discover unusual places across the USA", url: url }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        showToast("Link copied to clipboard");
      });
    }
  }
  window.shareApp = shareApp;

  function heartIcon(filled) {
    return filled
      ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 21s-6.7-4.35-9.3-8.14C.86 10.28 1.4 6.6 4.2 4.9c2.3-1.4 5.1-.7 6.8 1.3.5.6 1.3.6 1.8 0 1.7-2 4.5-2.7 6.8-1.3 2.8 1.7 3.34 5.38 1.5 7.96C18.7 16.65 12 21 12 21z"/></svg>'
      : '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s-6.7-4.35-9.3-8.14C.86 10.28 1.4 6.6 4.2 4.9c2.3-1.4 5.1-.7 6.8 1.3.5.6 1.3.6 1.8 0 1.7-2 4.5-2.7 6.8-1.3 2.8 1.7 3.34 5.38 1.5 7.96C18.7 16.65 12 21 12 21z"/></svg>';
  }

  function buildPopupContent(pin) {
    var wrap = document.createElement("div");
    wrap.className = "pin-popup";

    var html = "";
    if (pin.photo_url) {
      html += '<img class="pin-photo" src="' + pin.photo_url + '" alt="">';
    }
    if (pin.category) {
      html += '<span class="pin-category">' + escapeHtml(pin.category) + "</span>";
    }
    html += "<h3>" + escapeHtml(pin.name) + "</h3>";
    html += "<p>" + escapeHtml(pin.description || "") + "</p>";
    html += '<div class="pin-actions">';
    html += '<button data-action="save">' + heartIcon(isSaved(pin.id)) + "<span>" + (isSaved(pin.id) ? "Saved" : "Save") + "</span></button>";
    html += '<button data-action="read"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg><span>Read</span></button>';
    html += '<button data-action="share"><svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81a3 3 0 1 0-3-3c0 .24.04.47.09.7L7.04 9.81C6.5 9.31 5.79 9 5 9a3 3 0 1 0 0 6c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65a2.92 2.92 0 1 0 2.92-2.92z"/></svg><span>Share</span></button>';
    html += "</div>";
    wrap.innerHTML = html;

    wrap.querySelector('[data-action="save"]').addEventListener("click", function (e) {
      var filled = toggleSaved(pin.id);
      var btn = e.currentTarget;
      btn.innerHTML = heartIcon(filled) + "<span>" + (filled ? "Saved" : "Save") + "</span>";
      btn.classList.toggle("active", filled);
    });
    wrap.querySelector('[data-action="read"]').addEventListener("click", function () {
      speak(pin.name + ". " + (pin.description || ""));
    });
    wrap.querySelector('[data-action="share"]').addEventListener("click", function () {
      sharePin(pin);
    });

    var saveBtn = wrap.querySelector('[data-action="save"]');
    if (isSaved(pin.id)) saveBtn.classList.add("active");

    return wrap;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function addPinToMap(pin) {
    var marker = L.marker([pin.lat, pin.lng]);
    marker.bindPopup(function () {
      return buildPopupContent(pin);
    }, { maxWidth: 280 });
    clusterGroup.addLayer(marker);
    pinsById[pin.id] = pin;
    markersById[pin.id] = marker;
  }

  function openPin(id) {
    var marker = markersById[id];
    var pin = pinsById[id];
    if (!marker || !pin) return;
    map.setView([pin.lat, pin.lng], Math.max(map.getZoom(), 14));
    clusterGroup.zoomToShowLayer(marker, function () {
      marker.openPopup();
    });
  }
  window.openPin = openPin;

  function fetchPins() {
    return fetch(PINS_URL).then(function (res) {
      if (!res.ok) throw new Error("Failed to load pins");
      return res.json();
    });
  }

  function loadPins() {
    return fetchPins()
      .catch(function () {
        // one retry after a short delay handles transient network hiccups
        return new Promise(function (resolve) {
          setTimeout(resolve, 800);
        }).then(fetchPins);
      })
      .then(function (pins) {
        pins.forEach(addPinToMap);
        return pins;
      })
      .catch(function (err) {
        console.error(err);
        showToast("Couldn't load spots. Check your connection.");
        return [];
      });
  }

  // Search (Nominatim, submit-on-Enter / button click only — not per keystroke)
  function runSearch() {
    var q = document.getElementById("searchInput").value.trim();
    if (!q) return;
    var url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=" + encodeURIComponent(q);
    showToast("Searching…");
    fetch(url, { headers: { Accept: "application/json" } })
      .then(function (res) { return res.json(); })
      .then(function (results) {
        if (!results || !results.length) {
          showToast("No results for “" + q + "”");
          return;
        }
        var r = results[0];
        map.setView([parseFloat(r.lat), parseFloat(r.lon)], 13);
      })
      .catch(function () {
        showToast("Search failed. Try again.");
      });
  }

  document.getElementById("searchBtn").addEventListener("click", runSearch);
  document.getElementById("searchInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") runSearch();
  });

  // Locate me
  document.getElementById("locateBtn").addEventListener("click", function () {
    if (!navigator.geolocation) {
      showToast("Location isn't supported on this browser");
      return;
    }
    showToast("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 13);
      },
      function () {
        showToast("Couldn't get your location");
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  });

  // Saved spots panel
  var savedPanel = document.getElementById("savedPanel");
  var panelOverlay = document.getElementById("panelOverlay");

  function renderSavedList() {
    var ids = getSaved();
    var list = document.getElementById("savedList");
    list.innerHTML = "";
    if (!ids.length) {
      list.innerHTML = '<div class="saved-empty">You haven’t saved any spots yet.<br>Tap the heart on a pin to save it here.</div>';
      return;
    }
    ids.forEach(function (id) {
      var pin = pinsById[id];
      if (!pin) return;
      var item = document.createElement("div");
      item.className = "saved-item";
      item.innerHTML =
        '<div class="saved-item-icon">' + heartIcon(true) + "</div>" +
        '<div style="flex:1"><h4>' + escapeHtml(pin.name) + "</h4><p>" + escapeHtml(pin.category || "") + "</p></div>" +
        '<button class="remove-btn" aria-label="Remove">&times;</button>';
      item.addEventListener("click", function (e) {
        if (e.target.closest(".remove-btn")) return;
        closeSavedPanel();
        openPin(id);
      });
      item.querySelector(".remove-btn").addEventListener("click", function (e) {
        e.stopPropagation();
        toggleSaved(id);
        renderSavedList();
      });
      list.appendChild(item);
    });
  }

  function openSavedPanel() {
    renderSavedList();
    savedPanel.hidden = false;
    panelOverlay.hidden = false;
  }
  function closeSavedPanel() {
    savedPanel.hidden = true;
    panelOverlay.hidden = true;
  }

  document.getElementById("savedBtn").addEventListener("click", openSavedPanel);
  document.getElementById("closeSavedBtn").addEventListener("click", closeSavedPanel);
  panelOverlay.addEventListener("click", closeSavedPanel);

  updateSavedCount();

  loadPins().then(function () {
    var params = new URLSearchParams(window.location.search);
    var pinId = params.get("pin");
    if (pinId && pinsById[pinId]) {
      openPin(pinId);
    }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    });
  }
})();
