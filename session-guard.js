(() => {
  "use strict";
  const db = window.supabaseClient;
  if (!db) return;
  const isAdmin = document.body?.classList.contains("admin-page") || location.pathname.endsWith("admin.html");
  let minutes = isAdmin ? 5 : 15, warningSeconds = 60, logoutTimer, warnTimer, tick, lastReset = 0;
  function modal(){let m=document.getElementById("globalSessionWarning");if(m)return m;m=document.createElement("div");m.id="globalSessionWarning";m.className="session-modal";m.hidden=true;m.innerHTML='<div class="session-box"><h3>Session ending soon</h3><p>No activity was detected. You will be logged out automatically.</p><strong id="globalSessionSeconds">60</strong><span> seconds</span><div class="session-actions"><button id="globalStay" class="btn" type="button">Stay Logged In</button><button id="globalLogout" class="mini-btn" type="button">Logout Now</button></div></div>';document.body.appendChild(m);m.querySelector("#globalStay").onclick=()=>reset(true);m.querySelector("#globalLogout").onclick=logout;return m;}
  function clear(){clearTimeout(logoutTimer);clearTimeout(warnTimer);clearInterval(tick)}
  async function logout(){clear();await db.auth.signOut();location.replace("./login.html")}
  function warn(){const m=modal();m.hidden=false;let n=warningSeconds;const e=m.querySelector("#globalSessionSeconds");e.textContent=n;tick=setInterval(()=>{n--;e.textContent=Math.max(0,n);if(n<=0)clearInterval(tick)},1000)}
  function reset(force=false){const now=Date.now();if(!force&&now-lastReset<1000)return;lastReset=now;clear();const m=modal();m.hidden=true;const total=minutes*60000;warnTimer=setTimeout(warn,Math.max(0,total-warningSeconds*1000));logoutTimer=setTimeout(logout,total)}
  async function start(){const {data:{session}}=await db.auth.getSession();if(!session)return location.replace("./login.html");if(isAdmin){const {data:p}=await db.from("profiles").select("role,is_active").eq("id",session.user.id).maybeSingle();if(p?.role!=="admin"||p?.is_active===false)return logout()}const {data:s}=await db.from("app_settings").select("admin_auto_logout_minutes,customer_auto_logout_minutes,logout_warning_seconds").limit(1).maybeSingle();minutes=Number(isAdmin?s?.admin_auto_logout_minutes:s?.customer_auto_logout_minutes)||(isAdmin?5:15);warningSeconds=Number(s?.logout_warning_seconds)||60;["click","keydown","touchstart","scroll"].forEach(x=>addEventListener(x,()=>reset(false),{passive:true}));reset(true)}
  start();
})();
