(() => {
  "use strict";
  const db = window.supabaseClient;
  const msg = document.getElementById("loginMsg");
  const panels = [...document.querySelectorAll(".auth-panel")];
  const tabs = [...document.querySelectorAll(".auth-tab")];

  function showMessage(text, type = "info") {
    if (!msg) return;
    msg.style.display = "block";
    msg.className = `msg ${type === "error" ? "msg-error" : type === "success" ? "msg-success" : ""}`;
    msg.textContent = text;
  }
  function showPanel(id) {
    panels.forEach(p => p.classList.toggle("active", p.id === id));
    tabs.forEach(t => t.classList.toggle("active", t.dataset.panel === id));
  }
  tabs.forEach(t => t.addEventListener("click", () => { showPanel(t.dataset.panel); if (msg) msg.style.display = "none"; }));

  async function destinationFor(userId) {
    const { data } = await db.from("profiles").select("role,is_active").eq("id", userId).maybeSingle();
    if (data?.is_active === false) { await db.auth.signOut(); throw new Error("This account is inactive. Please contact support."); }
    return data?.role === "admin" ? "./admin.html" : "./customer.html";
  }

  document.getElementById("loginForm")?.addEventListener("submit", async e => {
    e.preventDefault(); showMessage("Signing in...");
    const { data, error } = await db.auth.signInWithPassword({ email: document.getElementById("loginEmail").value.trim(), password: document.getElementById("loginPassword").value });
    if (error) return showMessage(error.message, "error");
    try { location.replace(await destinationFor(data.user.id)); } catch (err) { showMessage(err.message, "error"); }
  });

  document.getElementById("signupForm")?.addEventListener("submit", async e => {
    e.preventDefault(); showMessage("Creating your account...");
    const firstName = document.getElementById("signupFirstName").value.trim();
    const lastName = document.getElementById("signupLastName").value.trim();
    const phone = document.getElementById("signupPhone").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const { data, error } = await db.auth.signUp({ email, password, options: { data: { first_name: firstName, last_name: lastName, phone } } });
    if (error) return showMessage(error.message, "error");
    if (data.session) { location.replace("./customer.html"); return; }
    showMessage("Account created. Please check your email to confirm your account, then login.", "success");
    showPanel("loginPanel");
  });

  document.getElementById("forgotForm")?.addEventListener("submit", async e => {
    e.preventDefault(); showMessage("Sending reset link...");
    const email = document.getElementById("forgotEmail").value.trim();
    const redirectTo = new URL("./login.html", window.location.href).href;
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) return showMessage(error.message, "error");
    showMessage("Password reset email sent. Please check your inbox.", "success");
  });

  document.getElementById("resetForm")?.addEventListener("submit", async e => {
    e.preventDefault(); showMessage("Updating password...");
    const { error } = await db.auth.updateUser({ password: document.getElementById("newPassword").value });
    if (error) return showMessage(error.message, "error");
    showMessage("Password updated successfully. Opening your account...", "success");
    setTimeout(() => location.replace("./customer.html"), 700);
  });

  db.auth.onAuthStateChange(async (event, session) => {
    if (event === "PASSWORD_RECOVERY") { showPanel("resetPanel"); document.getElementById("authTabs")?.classList.add("hidden"); showMessage("You can now choose a new password."); }
  });

  (async () => {
    const { data: { session } } = await db.auth.getSession();
    if (session && !location.hash.includes("type=recovery")) {
      try { location.replace(await destinationFor(session.user.id)); } catch (err) { showMessage(err.message, "error"); }
    }
  })();
})();
