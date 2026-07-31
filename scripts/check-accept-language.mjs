#!/usr/bin/env node
/**
 * One-off verification harness for spec task 3.2 (locale-spoofing).
 *
 * `src/shared/locale/resolver.ts` builds the spoofed `Accept-Language` header
 * using per-engine quality-list conventions that were derived from documented
 * behavior rather than captured from a live browser:
 *
 *   gecko (Firefox) — q distributed evenly:  fr-FR,fr;q=0.5
 *   blink (Chrome)  — q stepped by 0.1:      fr-FR,fr;q=0.9
 *
 * The shape matters as much as the content: emitting a Blink-shaped header from
 * Firefox is itself a fingerprinting tell, because the header wouldn't match the
 * engine the rest of the fingerprint says we are. This script prints what YOUR
 * browsers actually send so the assumption can be confirmed or corrected.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *
 *   node scripts/check-accept-language.mjs
 *
 * Then open http://localhost:8477 in Firefox, and again in Chrome. Each visit
 * prints the raw header plus this script's read of the q-pattern. Ctrl-C to stop.
 *
 * To confirm the exact case the resolver emits (a single preferred language with
 * its bare-language fallback), first set the browser to ONE language with a
 * region — e.g. French (France) — with no other languages listed:
 *
 *   Firefox: Settings → General → Language → "Choose…" → remove all but one
 *   Chrome:  chrome://settings/languages → leave a single language, move to top
 *
 * A 2-entry result is the one that decides it: Firefox should show q=0.5 and
 * Chrome q=0.9 if the current implementation is right.
 *
 * If the observed values differ, fix `buildAcceptLanguage` in
 * src/shared/locale/resolver.ts and update the pinned expectations in
 * "Property 4" of tests/property/locale-resolver.property.test.ts together.
 *
 * This script is a dev tool only — nothing imports it and it ships in no build.
 */

import { createServer } from "node:http";

const PORT = 8477;

/** Parse an Accept-Language header into [tag, q] pairs, q defaulting to 1. */
function parseHeader(header) {
  return header
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [tag, ...params] = part.split(";").map((p) => p.trim());
      const qParam = params.find((p) => p.startsWith("q="));
      return { tag, q: qParam ? Number(qParam.slice(2)) : 1 };
    });
}

/**
 * Compare the observed q values against both conventions the resolver knows, so
 * the output says which one this engine matches rather than leaving it to be
 * eyeballed.
 */
function classify(entries) {
  const n = entries.length;
  if (n < 2)
    return "inconclusive — only one language listed (see the note about setting a single language WITH a region)";

  const round1 = (v) => Math.round(v * 10) / 10;
  const gecko = entries.map((_, i) => (i === 0 ? 1 : round1(1 - i / n)));
  const blink = entries.map((_, i) => (i === 0 ? 1 : round1(1 - i * 0.1)));
  const observed = entries.map((e) => round1(e.q));

  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

  const matches = [];
  if (same(observed, gecko)) matches.push("gecko (even split)");
  if (same(observed, blink)) matches.push("blink (0.1 steps)");

  if (matches.length === 1) return `matches ${matches[0]}`;
  if (matches.length === 2)
    return "matches BOTH conventions (indistinguishable at this list length)";
  return `matches NEITHER — observed q=[${observed.join(", ")}], gecko would be [${gecko.join(", ")}], blink would be [${blink.join(", ")}]`;
}

/** Very rough engine guess from the UA, purely to label the output. */
function guessEngine(ua = "") {
  if (/Firefox\//.test(ua)) return "Firefox (gecko)";
  if (/Edg\//.test(ua)) return "Edge (blink)";
  if (/Chrome\//.test(ua)) return "Chrome (blink)";
  if (/Safari\//.test(ua)) return "Safari (webkit)";
  return "unknown";
}

const server = createServer((req, res) => {
  // Ignore favicon and other incidental requests so the output stays readable.
  if (req.url !== "/") {
    res.writeHead(204).end();
    return;
  }

  const header = req.headers["accept-language"] ?? "";
  const ua = req.headers["user-agent"] ?? "";
  const entries = parseHeader(header);

  console.log("\n" + "=".repeat(72));
  console.log(`engine (from UA) : ${guessEngine(ua)}`);
  console.log(`Accept-Language  : ${header || "(absent)"}`);
  console.log(`parsed           : ${entries.map((e) => `${e.tag}@${e.q}`).join("  ")}`);
  console.log(`verdict          : ${classify(entries)}`);
  console.log("=".repeat(72));

  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(
    `<!doctype html><meta charset="utf-8">
     <title>Accept-Language check</title>
     <style>
       body{font:14px/1.6 system-ui,sans-serif;max-width:44rem;margin:3rem auto;padding:0 1rem}
       code{background:#f4f4f5;padding:.15em .4em;border-radius:4px}
       pre{background:#f4f4f5;padding:1rem;border-radius:6px;overflow-x:auto}
     </style>
     <h1>Accept-Language check</h1>
     <p>Header this browser sent:</p>
     <pre>${header.replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;"))}</pre>
     <p>What the page reports from script:</p>
     <pre id="js">reading…</pre>
     <p>
       <button id="reread">Re-read now</button>
       <span id="age"></span>
     </p>
     <p>The full result and a verdict are printed in the terminal running this script.</p>
     <script>
       // IMPORTANT: these are read LATE, and re-read, on purpose.
       //
       // An extension that overrides Date/Intl/navigator from a content script
       // receives its settings asynchronously, so there is a brief window right
       // after document_start where the page still sees the REAL values. Reading
       // synchronously during initial parse measures that race rather than the
       // steady state — which is exactly the trap the first version of this page
       // fell into (it reported the real timezone while geospoof.com/verify,
       // a framework app reading after mount, correctly showed the spoofed one).
       //
       // The header above is unaffected either way: it is captured at the network
       // layer, before any page script runs.
       function snapshot() {
         var o = new Intl.DateTimeFormat().resolvedOptions();
         return 'navigator.language  : ' + navigator.language + '\\n' +
                'navigator.languages : ' + JSON.stringify(navigator.languages) + '\\n' +
                'Intl default locale : ' + o.locale + '\\n' +
                'Intl timeZone       : ' + o.timeZone + '\\n' +
                'Intl hourCycle      : ' + (new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions().hourCycle || '(n/a)') + '\\n' +
                'number format       : ' + (1234567.89).toLocaleString() + '\\n' +
                'date format         : ' + new Date(0).toLocaleString();
       }
       function render(label) {
         document.getElementById('js').textContent = snapshot();
         document.getElementById('age').textContent = label;
       }
       // First paint immediately so the page isn't blank, then again once the
       // settings round-trip has certainly completed.
       render('(read at parse time — may show pre-spoof values)');
       window.addEventListener('load', function () {
         setTimeout(function () { render('(read ~1s after load — this is the one to trust)'); }, 1000);
       });
       document.getElementById('reread').addEventListener('click', function () {
         render('(re-read on demand at ' + new Date().toLocaleTimeString() + ')');
       });
     </script>`
  );
});

server.listen(PORT, () => {
  console.log(`\nListening on http://localhost:${PORT}`);
  console.log("Open it in Firefox, then in Chrome. Ctrl-C to stop.\n");
  console.log("Tip: to check the exact 2-entry case the resolver emits, set the");
  console.log("browser to a SINGLE language with a region (e.g. French (France))");
  console.log("and remove the others, then reload.\n");
});
