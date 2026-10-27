/* Boostr GTM tracker. Channel comes from window.BOOSTR_CHANNEL (set per site). */
(function () {
  "use strict";
  var CH = window.BOOSTR_CHANNEL, URL_ = window.BOOSTR_ENDPOINT;
  var LS = null, SS = null;
  try { LS = window.localStorage; SS = window.sessionStorage; } catch (e) {}
  function get(s, k) { try { return s && s.getItem(k); } catch (e) { return null; } }
  function set(s, k, v) { try { s && s.setItem(k, v); } catch (e) {} }
  function del(s, k) { try { s && s.removeItem(k); } catch (e) {} }

  /* Owner opt-out: open any site with ?notrack once to stop counting your own visits in this browser. ?track turns it back on. */
  var q = location.search;
  if (/[?&]notrack\b/.test(q)) set(LS, "boostr_notrack", "1");
  if (/[?&]track\b/.test(q)) del(LS, "boostr_notrack");
  if (get(LS, "boostr_notrack") === "1") return;
  if (!CH || !URL_ || URL_.indexOf("http") !== 0) return;

  function rid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }
  var vid = get(LS, "boostr_vid"); if (!vid) { vid = rid(); set(LS, "boostr_vid", vid); }
  var sid = get(SS, "boostr_sid"); if (!sid) { sid = rid(); set(SS, "boostr_sid", sid); }

  function send(event, value, extra) {
    var body = JSON.stringify({ channel: CH, visitor: vid, session: sid, event: event, value: value == null ? "" : value, extra: extra || "" });
    try {
      fetch(URL_, { method: "POST", mode: "no-cors", keepalive: true, body: body });
    } catch (e) {
      try { navigator.sendBeacon(URL_, body); } catch (e2) {}
    }
  }

  /* 1. Page view: once per browser session (reloads don't double count). */
  if (!get(SS, "boostr_pv")) {
    set(SS, "boostr_pv", "1");
    var ref = ""; try { ref = document.referrer ? new URL(document.referrer).hostname : ""; } catch (e) {}
    var dev = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "mobile" : "desktop";
    send("page_view", "", dev + "|" + ref);
  }

  /* 2. Time on site: counts only seconds the tab is visible. Heartbeat every 5s carries the running total; engaged_5s fires once at 5s. */
  var secs = parseInt(get(SS, "boostr_secs") || "0", 10) || 0, sentEngaged = get(SS, "boostr_eng") === "1", lastSent = -1;
  function flush() { if (secs !== lastSent && secs > 0) { lastSent = secs; send("heartbeat", secs); } }
  setInterval(function () {
    if (document.visibilityState !== "visible") return;
    secs++; set(SS, "boostr_secs", String(secs));
    if (secs >= 5 && !sentEngaged) { sentEngaged = true; set(SS, "boostr_eng", "1"); send("engaged_5s", secs); }
    if (secs % 5 === 0) flush();
  }, 1000);
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);

  /* 3. Clicks, identified by button text so the MVP code stays untouched. */
  function isTeamMode() { var b = document.getElementById("whoTeam"); return !!b && b.getAttribute("aria-pressed") === "true"; }
  function norm(t) { return (t || "").replace(/[→\u2192]/g, "").replace(/\s+/g, " ").trim().toLowerCase(); }
  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("button"); if (!b) return;
    var t = norm(b.textContent);
    if (t === "take the quiz") send("click_quiz", "", b.closest("#optStart") ? "options_page" : b.closest(".hero") ? "hero" : "other");
    else if (t === "build your box" && b.id !== "mbar") send("click_build_box", "", b.closest(".hero") ? "hero" : "other");
    else if (t === "order for a team") send("click_order_team");
    else if (t === "set up a team box") send("click_build_team_box", "", b.closest("#optStart") ? "options_page" : "teams_section");
    else if (t === "see my box") send("click_see_my_box");
    else if (t.indexOf("buy now") === 0) send(isTeamMode() ? "click_buy_team" : "click_buy_individual");
  }, true);

  /* 4. Quiz completion = the final "See my box" screen appears. */
  var qBody = document.getElementById("qBody"), doneSent = false;
  if (qBody && window.MutationObserver) {
    new MutationObserver(function () {
      var done = !!document.getElementById("qApply");
      if (done && !doneSent) { doneSent = true; send("quiz_completed"); }
      if (!done && !document.getElementById("qBack")) doneSent = false;
    }).observe(qBody, { childList: true });
    var quizEl = document.getElementById("quiz");
    if (quizEl && window.MutationObserver) new MutationObserver(function () { if (!quizEl.hidden) doneSent = false; }).observe(quizEl, { attributes: true, attributeFilter: ["hidden"] });
  }

  /* 5. Checkout form submitted successfully (no personal data is sent). */
  var pay = document.getElementById("coDone");
  if (pay && window.MutationObserver) new MutationObserver(function () { if (!pay.hidden && pay.innerHTML) send("checkout_submitted"); }).observe(pay, { attributes: true, attributeFilter: ["hidden"] });
})();
