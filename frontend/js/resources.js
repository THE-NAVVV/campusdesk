// ============ frontend/js/resources.js ============
const grid = document.getElementById("resourceGrid");
const stateMsg = document.getElementById("stateMsg");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const pagination = document.getElementById("pagination");
const logoutBtn = document.getElementById("logoutBtn");
const adminLink = document.getElementById("adminLink");

const LIMIT = 6;
let currentPage = 1;
let debounceTimer = null;

// guard + role-based nav
const user = JSON.parse(localStorage.getItem("user") || "null");
if (!localStorage.getItem("token")) window.location.href = "index.html";
if (user?.role === "admin") adminLink.style.display = "inline";

logoutBtn.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.clear();
  window.location.href = "index.html";
});

function showState(msg, isError = false) {
  stateMsg.style.display = "block";
  stateMsg.innerHTML = isError
    ? `<span style="color:var(--danger)">${msg}</span>`
    : msg;
  grid.innerHTML = "";
}

function renderResources(items) {
  if (!items.length) {
    showState("No resources found. Try a different search or filter.");
    return;
  }
  stateMsg.style.display = "none";
  grid.innerHTML = items
    .map(
      (r) => `
    <div class="resource-card" onclick="window.location.href='resource.html?id=${r.id}'">
      <h3>${r.name}</h3>
      <div class="meta">${r.location || "—"} · ${r.openTime}–${r.closeTime}</div>
      <p>${r.description || "No description available."}</p>
      <span class="category-tag">${r.category}</span>
    </div>
  `
    )
    .join("");
}

function renderPagination(total, page, limit) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) {
    pagination.innerHTML = "";
    return;
  }
  let html = `<button ${page === 1 ? "disabled" : ""} onclick="goToPage(${page - 1})">Prev</button>`;
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="${i === page ? "active" : ""}" onclick="goToPage(${i})">${i}</button>`;
  }
  html += `<button ${page === totalPages ? "disabled" : ""} onclick="goToPage(${page + 1})">Next</button>`;
  pagination.innerHTML = html;
}

window.goToPage = (page) => {
  currentPage = page;
  loadResources();
};

async function loadResources() {
  showState(`<div class="spinner"></div>`);
  try {
    const params = new URLSearchParams({
      search: searchInput.value.trim(),
      category: categoryFilter.value,
      page: currentPage,
      limit: LIMIT,
    });
    const data = await apiRequest(`/resources?${params}`);
    renderResources(data.data);
    renderPagination(data.total, data.page, data.limit);
  } catch (err) {
    showState(err.message, true);
  }
}

searchInput.addEventListener("input", () => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    currentPage = 1;
    loadResources();
  }, 400);
});

categoryFilter.addEventListener("change", () => {
  currentPage = 1;
  loadResources();
});

loadResources();