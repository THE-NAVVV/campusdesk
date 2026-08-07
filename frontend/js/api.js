// ============ frontend/js/api.js ============
const API_BASE = "https://campusdesk-production.up.railway.app/api"; // deploy karte time yahi URL change karna

async function apiRequest(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = localStorage.getItem("token");
  if (auth && token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers, 
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));

  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    if (!location.pathname.endsWith("index.html") && location.pathname !== "/") {
      window.location.href = "index.html";
    }
  }

  if (!res.ok) {
    const err = new Error(data?.error?.message || "Something went wrong");
    err.fields = data?.error?.fields;
    err.status = res.status;
    err.raw = data;
    throw err;
  }

  return data;
}