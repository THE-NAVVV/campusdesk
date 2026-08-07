// ============ frontend/js/my-bookings.js ============
const bookingsList = document.getElementById("bookingsList");
const stateMsg = document.getElementById("stateMsg");
const pagination = document.getElementById("pagination");
const tabs = document.querySelectorAll(".tab");
const logoutBtn = document.getElementById("logoutBtn");
const adminLink = document.getElementById("adminLink");

const user = JSON.parse(localStorage.getItem("user") || "null");
if (!localStorage.getItem("token")) window.location.href = "index.html";
if (user?.role === "admin") adminLink.style.display = "inline";

logoutBtn.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.clear();
  window.location.href = "index.html";
});

const LIMIT = 8;
let currentPage = 1;
let currentStatus = "";

function fmtDate(iso) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function renderBookings(items) {
  if (!items.length) {
    stateMsg.style.display = "block";
    stateMsg.textContent = "No bookings found.";
    bookingsList.innerHTML = "";
    return;
  }
  stateMsg.style.display = "none";
  bookingsList.innerHTML = items
    .map(
      (b) => `
    <div class="booking-card" data-id="${b.id}">
      <div>
        <h4>${b.resourceName || "Resource #" + b.resourceId}${b.purpose ? " — " + b.purpose : ""}</h4>
        <div class="meta">${b.resourceLocation ? b.resourceLocation + " · " : ""}${fmtDate(b.startTime)} → ${fmtDate(b.endTime)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px">
        <span class="badge badge-${b.status}">${b.status}</span>
        ${
          b.status === "confirmed"
            ? `<button class="btn btn-danger cancel-btn" data-id="${b.id}">Cancel</button>`
            : ""
        }
      </div>
    </div>
  `
    )
    .join("");

  document.querySelectorAll(".cancel-btn").forEach((btn) => {
    btn.addEventListener("click", () => cancelBooking(btn.dataset.id, btn));
  });
}

async function cancelBooking(id, btn) {
  const card = btn.closest(".booking-card");
  const badge = card.querySelector(".badge");
  const originalBadgeText = badge.textContent;
  const originalBadgeClass = badge.className;

  // optimistic update
  badge.textContent = "cancelled";
  badge.className = "badge badge-cancelled";
  btn.remove();

  try {
    await apiRequest(`/bookings/${id}/cancel`, { method: "PATCH" });
  } catch (err) {
    // roll back
    badge.textContent = originalBadgeText;
    badge.className = originalBadgeClass;
    alert(err.message);
    loadBookings();
  }
}

function renderPagination(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) { pagination.innerHTML = ""; return; }
  let html = `<button ${page === 1 ? "disabled" : ""} onclick="goToPage(${page - 1})">Prev</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === page ? "active" : ""}" onclick="goToPage(${i})">${i}</button>`;
  }
  html += `<button ${page === totalPages ? "disabled" : ""} onclick="goToPage(${page + 1})">Next</button>`;
  pagination.innerHTML = html;
}
window.goToPage = (p) => { currentPage = p; loadBookings(); };

function renderWaitlist(items) {
  if (!items.length) {
    stateMsg.style.display = "block";
    stateMsg.textContent = "You're not on any waitlists.";
    bookingsList.innerHTML = "";
    return;
  }
  stateMsg.style.display = "none";
  bookingsList.innerHTML = items
    .map(
      (w) => `
    <div class="booking-card" data-id="${w.id}">
      <div>
        <h4>${w.resourceName}${w.purpose ? " — " + w.purpose : ""}</h4>
        <div class="meta">${w.resourceLocation ? w.resourceLocation + " · " : ""}${fmtDate(w.startTime)} → ${fmtDate(w.endTime)}</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px">
        <span class="badge badge-${w.status === 'waiting' ? 'confirmed' : w.status === 'promoted' ? 'confirmed' : 'cancelled'}">${w.status}</span>
        ${w.status === "waiting" ? `<button class="btn btn-danger leave-waitlist-btn" data-id="${w.id}">Leave</button>` : ""}
      </div>
    </div>
  `
    )
    .join("");

  document.querySelectorAll(".leave-waitlist-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await apiRequest(`/bookings/waitlist/${btn.dataset.id}`, { method: "DELETE" });
        loadBookings();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

async function loadBookings() {
  stateMsg.style.display = "block";
  stateMsg.innerHTML = `<div class="spinner"></div>`;

  if (currentStatus === "waitlist") {
    try {
      const data = await apiRequest(`/bookings/waitlist/me`);
      renderWaitlist(data.data);
      pagination.innerHTML = "";
    } catch (err) {
      stateMsg.style.display = "block";
      stateMsg.innerHTML = `<span style="color:var(--danger)">${err.message}</span>`;
    }
    return;
  }

  try {
    const params = new URLSearchParams({ status: currentStatus, page: currentPage, limit: LIMIT });
    const data = await apiRequest(`/bookings/me?${params}`);
    renderBookings(data.data);
    renderPagination(data.total, data.page, data.limit);
  } catch (err) {
    stateMsg.style.display = "block";
    stateMsg.innerHTML = `<span style="color:var(--danger)">${err.message}</span>`;
  }
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    tabs.forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    currentStatus = tab.dataset.status;
    currentPage = 1;
    loadBookings();
  });
});

loadBookings();