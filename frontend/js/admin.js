// ============ frontend/js/admin.js ============
const logoutBtn = document.getElementById("logoutBtn");
const resourceForm = document.getElementById("resourceForm");
const resourceFormError = document.getElementById("resourceFormError");
const addResourceBtn = document.getElementById("addResourceBtn");
const adminResourceList = document.getElementById("adminResourceList");
const allBookingsList = document.getElementById("allBookingsList");
const adminBookingsState = document.getElementById("adminBookingsState");
const adminPagination = document.getElementById("adminPagination");
const filterStatus = document.getElementById("filterStatus");
const filterDate = document.getElementById("filterDate");

const user = JSON.parse(localStorage.getItem("user") || "null");
if (!localStorage.getItem("token")) window.location.href = "index.html";
if (user?.role !== "admin") window.location.href = "resources.html"; // guard non-admins

logoutBtn.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.clear();
  window.location.href = "index.html";
});

function fmtDate(iso) {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ---- Add resource ----
resourceForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  resourceFormError.textContent = "";
  addResourceBtn.disabled = true;
  addResourceBtn.textContent = "Adding...";

  try {
    await apiRequest("/resources", {
      method: "POST",
      body: {
        name: document.getElementById("rName").value.trim(),
        location: document.getElementById("rLocation").value.trim(),
        category: document.getElementById("rCategory").value,
        openTime: document.getElementById("rOpen").value,
        closeTime: document.getElementById("rClose").value,
        description: document.getElementById("rDesc").value.trim(),
      },
    });
    resourceForm.reset();
    loadResourceList();
  } catch (err) {
    resourceFormError.textContent = err.message;
  } finally {
    addResourceBtn.disabled = false;
    addResourceBtn.textContent = "Add Resource";
  }
});

// ---- Manage resource list (deactivate) ----
async function loadResourceList() {
  try {
    const data = await apiRequest("/resources?limit=100");
    adminResourceList.innerHTML = data.data
      .map(
        (r) => `
      <div class="admin-resource-row">
        <span>${r.name} <span style="color:var(--text-muted)">(${r.category})</span></span>
        <button class="btn btn-outline deactivate-btn" data-id="${r.id}" style="padding:4px 12px">Deactivate</button>
      </div>`
      )
      .join("");

    document.querySelectorAll(".deactivate-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Deactivate this resource?")) return;
        try {
          await apiRequest(`/resources/${btn.dataset.id}`, { method: "DELETE" });
          loadResourceList();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  } catch (err) {
    adminResourceList.innerHTML = `<span style="color:var(--danger)">${err.message}</span>`;
  }
}

// ---- All bookings (filterable) ----
const LIMIT = 8;
let currentPage = 1;

async function loadAllBookings() {
  adminBookingsState.style.display = "block";
  adminBookingsState.innerHTML = `<div class="spinner"></div>`;
  try {
    const params = new URLSearchParams({
      status: filterStatus.value,
      date: filterDate.value,
      page: currentPage,
      limit: LIMIT,
    });
    const data = await apiRequest(`/admin/bookings?${params}`);

    if (!data.data.length) {
      adminBookingsState.style.display = "block";
      adminBookingsState.textContent = "No bookings found.";
      allBookingsList.innerHTML = "";
      renderAdminPagination(0, 1, LIMIT);
      return;
    }
    adminBookingsState.style.display = "none";
    allBookingsList.innerHTML = data.data
      .map(
        (b) => `
      <div class="booking-card">
        <div>
          <h4>${b.resourceName} — ${b.userName}</h4>
          <div class="meta">${b.userEmail} · ${fmtDate(b.startTime)} → ${fmtDate(b.endTime)}</div>
        </div>
        <span class="badge badge-${b.status}">${b.status}</span>
      </div>`
      )
      .join("");
    renderAdminPagination(data.total, data.page, data.limit);
  } catch (err) {
    adminBookingsState.style.display = "block";
    adminBookingsState.innerHTML = `<span style="color:var(--danger)">${err.message}</span>`;
  }
}

function renderAdminPagination(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) { adminPagination.innerHTML = ""; return; }
  let html = `<button ${page === 1 ? "disabled" : ""} onclick="goToAdminPage(${page - 1})">Prev</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === page ? "active" : ""}" onclick="goToAdminPage(${i})">${i}</button>`;
  }
  html += `<button ${page === totalPages ? "disabled" : ""} onclick="goToAdminPage(${page + 1})">Next</button>`;
  adminPagination.innerHTML = html;
}
window.goToAdminPage = (p) => { currentPage = p; loadAllBookings(); };

filterStatus.addEventListener("change", () => { currentPage = 1; loadAllBookings(); });
filterDate.addEventListener("change", () => { currentPage = 1; loadAllBookings(); });

loadResourceList();
loadAllBookings();