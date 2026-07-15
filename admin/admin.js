(function () {
  "use strict";

  var TOKEN_KEY = "letswander:admin-token";

  var loginScreen = document.getElementById("loginScreen");
  var adminScreen = document.getElementById("adminScreen");
  var loginForm = document.getElementById("loginForm");
  var loginError = document.getElementById("loginError");
  var pendingList = document.getElementById("pendingList");

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY);
  }

  function showAdmin() {
    loginScreen.hidden = true;
    adminScreen.hidden = false;
    loadPending();
  }

  function showLogin() {
    loginScreen.hidden = false;
    adminScreen.hidden = true;
  }

  loginForm.addEventListener("submit", function (e) {
    e.preventDefault();
    loginError.hidden = true;
    var password = document.getElementById("passwordInput").value;

    fetch("../.netlify/functions/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: password })
    })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) throw new Error(data.error || "Login failed");
          return data;
        });
      })
      .then(function (data) {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        showAdmin();
      })
      .catch(function (err) {
        loginError.textContent = err.message;
        loginError.hidden = false;
      });
  });

  function authedFetch(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    options.headers.Authorization = "Bearer " + getToken();
    return fetch(url, options);
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function loadPending() {
    pendingList.innerHTML = '<p class="empty-state">Loading…</p>';
    authedFetch("../.netlify/functions/list-pending")
      .then(function (res) {
        if (res.status === 401) {
          sessionStorage.removeItem(TOKEN_KEY);
          showLogin();
          throw new Error("Session expired");
        }
        return res.json();
      })
      .then(renderPending)
      .catch(function () {
        pendingList.innerHTML = '<p class="empty-state">Couldn’t load suggestions.</p>';
      });
  }

  function renderPending(items) {
    if (!items.length) {
      pendingList.innerHTML = '<p class="empty-state">No pending suggestions right now.</p>';
      return;
    }
    pendingList.innerHTML = "";
    items.forEach(function (item) {
      var card = document.createElement("div");
      card.className = "suggestion-card";
      card.innerHTML =
        (item.photoUrl ? '<img class="suggestion-photo" src="' + item.photoUrl + '" alt="">' : "") +
        "<h3>" + escapeHtml(item.name) + "</h3>" +
        '<div class="suggestion-meta">' +
        escapeHtml(item.category || "No category") + " &middot; " +
        item.lat.toFixed(5) + ", " + item.lng.toFixed(5) + " &middot; " +
        new Date(item.submittedAt).toLocaleString() +
        "</div>" +
        "<p>" + escapeHtml(item.description) + "</p>" +
        '<div class="suggestion-actions">' +
        '<button class="approve-btn" data-action="approve">Approve</button>' +
        '<button class="reject-btn" data-action="reject">Reject</button>' +
        "</div>" +
        '<div class="copy-row-result"></div>';

      card.querySelector('[data-action="approve"]').addEventListener("click", function () {
        resolveSuggestion(item.id, "approve", card);
      });
      card.querySelector('[data-action="reject"]').addEventListener("click", function () {
        if (confirm("Reject this suggestion? This can't be undone.")) {
          resolveSuggestion(item.id, "reject", card);
        }
      });

      pendingList.appendChild(card);
    });
  }

  function resolveSuggestion(id, action, card) {
    authedFetch("../.netlify/functions/resolve-suggestion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, action: action })
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (action === "reject") {
          card.remove();
          return;
        }
        card.querySelector(".suggestion-actions").remove();
        var resultBox = card.querySelector(".copy-row-result");
        resultBox.innerHTML =
          '<div class="copy-row-box">' +
          "<p>Approved! Paste this row into your Google Sheet:</p>" +
          '<textarea readonly>' + escapeHtml(data.copyRow) + "</textarea>" +
          '<button data-action="copy">Copy row</button>' +
          "</div>";
        resultBox.querySelector('[data-action="copy"]').addEventListener("click", function () {
          navigator.clipboard.writeText(data.copyRow);
          this.textContent = "Copied!";
        });
      });
  }

  document.getElementById("refreshBtn").addEventListener("click", loadPending);

  if (getToken()) {
    showAdmin();
  }
})();
