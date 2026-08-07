// ============ frontend/js/bookings.js ============
const resourceInfo = document.getElementById("resourceInfo");
const datePicker = document.getElementById("datePicker");
const timeline = document.getElementById("timeline");
const timelineState = document.getElementById("timelineState");
const bookingForm = document.getElementById("bookingForm");
const startTimeInput = document.getElementById("startTime");
const endTimeInput = document.getElementById("endTime");
const purposeInput = document.getElementById("purpose");
const formError = document.getElementById("formError");
const startError = document.getElementById("startError");
const endError = document.getElementById("endError");
const bookBtn = document.getElementById("bookBtn");
const logoutBtn = document.getElementById("logoutBtn");
const adminLink = document.getElementById("adminLink");
const recurringCheck = document.getElementById("recurringCheck");
const recurringWeeksField = document.getElementById("recurringWeeksField");
const recurringWeeksInput = document.getElementById("recurringWeeks");

recurringCheck.addEventListener("change", () => {
  recurringWeeksField.style.display = recurringCheck.checked ? "block" : "none";
});

const user = JSON.parse(localStorage.getItem("user") || "null");
if (!localStorage.getItem("token")) window.location.href = "index.html";
if (user?.role === "admin") adminLink.style.display = "inline";

logoutBtn.addEventListener("click", (e) => {
  e.preventDefault();
  localStorage.clear();
  window.location.href = "index.html";
});

const params = new URLSearchParams(window.location.search);
const resourceId = params.get("id");
if (!resourceId) window.location.href = "resources.html";

let resource = null;

// default date = today
datePicker.value = new Date().toISOString().split("T")[0];
datePicker.min = new Date().toISOString().split("T")[0];

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
function pad(n) { return String(n).padStart(2, "0"); }
function minutesToHHMM(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

async function loadResourceInfo() {
  try {
    // reuse list endpoint with search since there's no GET /:id in spec;
    // simplest: fetch all and find (fine at this scale) — or add filter
    const data = await apiRequest(`/resources?limit=100`);
    resource = data.data.find((r) => String(r.id) === resourceId);
    if (!resource) {
      resourceInfo.innerHTML = `<div class="state-msg">Resource not found.</div>`;
      return;
    }
    resourceInfo.innerHTML = `
      <div class="resource-info-header">
        <div>
          <h2>${resource.name}</h2>
          <div class="meta">${resource.location || "—"} · ${resource.openTime}–${resource.closeTime}</div>
        </div>
        <span class="category-tag">${resource.category}</span>
      </div>
      <p style="margin-top:10px; color:var(--text-muted); font-size:0.9rem">${resource.description || ""}</p>
    `;
    loadTimeline();
  } catch (err) {
    resourceInfo.innerHTML = `<div class="state-msg" style="color:var(--danger)">${err.message}</div>`;
  }
}

async function loadTimeline() {
  timeline.innerHTML = "";
  timelineState.style.display = "block";
  timelineState.innerHTML = `<div class="spinner"></div>`;

  try {
    const date = datePicker.value;
    const data = await apiRequest(`/resources/${resourceId}/bookings?date=${date}`);
    timelineState.style.display = "none";
    renderTimeline(data.data);
  } catch (err) {
    timelineState.innerHTML = `<span style="color:var(--danger)">${err.message}</span>`;
  }
}

function renderTimeline(bookings) {
  const openMin = toMinutes(resource.openTime);
  const closeMin = toMinutes(resource.closeTime);
  const slots = [];

  for (let m = openMin; m < closeMin; m += 30) {
    const slotStart = m;
    const slotEnd = m + 30;
    const clash = bookings.find(
      (b) => toMinutes(b.startTime.split("T")[1].slice(0, 5)) < slotEnd &&
             toMinutes(b.endTime.split("T")[1].slice(0, 5)) > slotStart
    );
    let cls = "slot";
    if (clash) cls += clash.userId === user.id ? " mine" : " booked";
    slots.push({ start: slotStart, end: slotEnd, cls, booked: !!clash });
  }

  timeline.innerHTML = slots
    .map(
      (s) => `<div class="${s.cls}" data-start="${minutesToHHMM(s.start)}" data-end="${minutesToHHMM(s.end)}">
        ${minutesToHHMM(s.start)}
      </div>`
    )
    .join("");

  document.querySelectorAll(".slot:not(.booked):not(.mine)").forEach((el) => {
    el.addEventListener("click", () => {
      startTimeInput.value = el.dataset.start;
      endTimeInput.value = el.dataset.end;
      bookingForm.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });

  document.querySelectorAll(".slot.booked").forEach((el) => {
    el.title = "Taken — click to join the waitlist";
    el.style.cursor = "pointer";
    el.addEventListener("click", () => joinWaitlist(el.dataset.start, el.dataset.end));
  });
}

async function joinWaitlist(start, end) {
  const date = datePicker.value;
  const startTime = `${date}T${start}:00`;
  const endTime = `${date}T${end}:00`;
  try {
    await apiRequest(`/bookings/${resourceId}/waitlist`, {
      method: "POST",
      body: { startTime, endTime },
    });
    formError.style.color = "var(--success)";
    formError.textContent = `Joined waitlist for ${start}–${end}. We'll email you if it opens up.`;
    setTimeout(() => (formError.textContent = ""), 4000);
  } catch (err) {
    formError.style.color = "var(--danger)";
    formError.textContent = err.message;
  }
}

datePicker.addEventListener("change", loadTimeline);

bookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.textContent = "";
  startError.textContent = "";
  endError.textContent = "";

  const date = datePicker.value;
  const startTime = `${date}T${startTimeInput.value}:00`;
  const endTime = `${date}T${endTimeInput.value}:00`;
  const isRecurring = recurringCheck.checked;

  bookBtn.disabled = true;
  bookBtn.textContent = isRecurring ? "Booking series..." : "Booking...";

  try {
    if (isRecurring) {
      const weeks = Number(recurringWeeksInput.value);
      const result = await apiRequest("/bookings/recurring", {
        method: "POST",
        body: { resourceId, startTime, endTime, purpose: purposeInput.value.trim(), weeks },
      });
      bookingForm.reset();
      recurringWeeksField.style.display = "none";
      loadTimeline();
      formError.style.color = "var(--success)";
      formError.textContent = `Recurring series booked — ${result.count} weeks confirmed!`;
      setTimeout(() => (formError.textContent = ""), 4000);
    } else {
      await apiRequest("/bookings", {
        method: "POST",
        body: { resourceId, startTime, endTime, purpose: purposeInput.value.trim() },
      });
      bookingForm.reset();
      loadTimeline();
      formError.style.color = "var(--success)";
      formError.textContent = "Booking confirmed!";
      setTimeout(() => (formError.textContent = ""), 3000);
    }
  } catch (err) {
    if (err.status === 409) {
      formError.style.color = "var(--danger)";
      formError.textContent = `${err.message} (${err.raw?.error?.clash?.startTime?.split("T")[1]?.slice(0,5)}–${err.raw?.error?.clash?.endTime?.split("T")[1]?.slice(0,5)})`;
    } else if (err.fields) {
      if (err.fields.startTime) startError.textContent = err.fields.startTime;
      if (err.fields.endTime) endError.textContent = err.fields.endTime;
      if (err.fields.weeks) {
        formError.style.color = "var(--danger)";
        formError.textContent = err.fields.weeks;
      }
    } else {
      formError.style.color = "var(--danger)";
      formError.textContent = err.message;
    }
  } finally {
    bookBtn.disabled = false;
    bookBtn.textContent = "Book Slot";
  }
});

loadResourceInfo();