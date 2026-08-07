// ============ frontend/js/auth.js ============
const emailStep = document.getElementById("emailStep");
const otpStep = document.getElementById("otpStep");
const emailInput = document.getElementById("email");
const nameInput = document.getElementById("name");
const emailError = document.getElementById("emailError");
const otpError = document.getElementById("otpError");
const otpEmailDisplay = document.getElementById("otpEmailDisplay");
const otpBoxes = document.querySelectorAll(".otp-boxes input");
const resendBtn = document.getElementById("resendBtn");
const resendTimer = document.getElementById("resendTimer");
const backBtn = document.getElementById("backBtn");
const sendOtpBtn = document.getElementById("sendOtpBtn");
const verifyBtn = document.getElementById("verifyBtn");

let currentEmail = "";
let cooldownInterval = null;

// redirect if already logged in
if (localStorage.getItem("token")) {
  window.location.href = "resources.html";
}

// ---- OTP box auto-advance ----
otpBoxes.forEach((box, i) => {
  box.addEventListener("input", () => {
    box.value = box.value.replace(/[^0-9]/g, "");
    if (box.value && i < otpBoxes.length - 1) otpBoxes[i + 1].focus();
  });
  box.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" && !box.value && i > 0) otpBoxes[i - 1].focus();
  });
});

function startCooldown(seconds = 30) {
  resendBtn.disabled = true;
  let remaining = seconds;
  resendTimer.textContent = `Resend in ${remaining}s`;
  clearInterval(cooldownInterval);
  cooldownInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(cooldownInterval);
      resendTimer.textContent = "";
      resendBtn.disabled = false;
    } else {
      resendTimer.textContent = `Resend in ${remaining}s`;
    }
  }, 1000);
}

async function sendOtp(email, name) {
  await apiRequest("/auth/send-otp", { method: "POST", auth: false, body: { email, name } });
}

emailStep.addEventListener("submit", async (e) => {
  e.preventDefault();
  emailError.textContent = "";
  const email = emailInput.value.trim();
  if (!email) return;

  sendOtpBtn.disabled = true;
  sendOtpBtn.textContent = "Sending...";

  try {
    await sendOtp(email, nameInput.value.trim());
    currentEmail = email;
    otpEmailDisplay.textContent = email;
    emailStep.style.display = "none";
    otpStep.style.display = "block";
    otpBoxes[0].focus();
    startCooldown(30);
  } catch (err) {
    emailError.textContent = err.status === 429 ? err.message : err.message;
  } finally {
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = "Send OTP";
  }
});

otpStep.addEventListener("submit", async (e) => {
  e.preventDefault();
  otpError.textContent = "";
  const code = Array.from(otpBoxes).map((b) => b.value).join("");

  if (code.length !== 6) {
    otpError.textContent = "Enter all 6 digits";
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = "Verifying...";

  try {
    const data = await apiRequest("/auth/verify-otp", {
      method: "POST",
      auth: false,
      body: { email: currentEmail, code, name: nameInput.value.trim() },
    });
    localStorage.setItem("token", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    window.location.href = "resources.html";
  } catch (err) {
    otpError.textContent = err.message;
    otpBoxes.forEach((b) => (b.value = ""));
    otpBoxes[0].focus();
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = "Verify & Login";
  }
});

resendBtn.addEventListener("click", async () => {
  try {
    await sendOtp(currentEmail, nameInput.value.trim());
    startCooldown(30);
  } catch (err) {
    otpError.textContent = err.message;
  }
});

backBtn.addEventListener("click", () => {
  otpStep.style.display = "none";
  emailStep.style.display = "block";
  otpBoxes.forEach((b) => (b.value = ""));
});