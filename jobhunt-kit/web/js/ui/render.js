// The resume on paper: the same "classic" layout as the Python renderer, drawn as HTML and printed by the browser.
// One-page versions shrink in 2% steps down to 86% (like builtin.py); still too long → the caller is told.

import { esc, safeUrl } from "./dom.js";

export function resumeHtml(doc) {
  const b = doc.basics || {};
  const contact = [b.location, b.phone].filter(Boolean).map((x) => `<span class="nw">${esc(x)}</span>`);
  if (b.email) contact.push(`<a href="mailto:${esc(b.email)}">${esc(b.email)}</a>`);
  for (const l of b.links || []) {
    const u = safeUrl(l.url);
    contact.push(u ? `<a href="${esc(u)}">${esc(l.label || l.url)}</a>` : esc(l.label || l.url));
  }
  const parts = [`<h1>${esc(b.name)}</h1>`, `<p class="contact">${contact.join(" · ")}</p>`];
  for (const s of doc.sections) {
    parts.push(`<h2>${esc(s.title.toUpperCase())}</h2>`);
    if (s.kind === "summary") parts.push(`<p class="summary">${esc(s.text)}</p>`);
    for (const it of s.items || []) {
      let left;
      if (s.kind === "education") left = `<b>${esc(it.school)}</b>${it.location ? ", " + esc(it.location) : ""}`;
      else if (s.kind === "projects") {
        const u = safeUrl(it.link);
        left = `<b>${esc(it.name)}</b>${u ? ` — <a href="${esc(u)}">${esc(it.link_label || u.replace(/^https?:\/\//, ""))}</a>` : ""}`;
      } else left = `<b>${esc(it.org)}</b>${it.role ? " — " + esc(it.role) : ""}`;
      const sub = s.kind === "education" ? it.degree : s.kind === "experience" ? [it.team, it.location].filter(Boolean).join(", ") : "";
      parts.push(`<div class="entry"><div class="row"><span>${left}</span><span class="r">${esc(it.dates || "")}</span></div>` +
        (sub ? `<div class="sub">${esc(sub)}</div>` : ""));
      const items = [...(it.details || []), ...(it.bullets || [])];
      if (items.length) parts.push(`<ul>${items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
      parts.push("</div>");
    }
    for (const l of s.lines || []) parts.push(`<p class="skill"><b>${esc(l.label)}:</b> ${esc(l.items.join(", "))}</p>`);
  }
  return `<div class="resume">${parts.join("")}</div>`;
}

/** Put the resume into `host` (a .page element) and shrink until it fits one page. → {scale, fits}. */
export function fitPage(host, doc) {
  host.innerHTML = resumeHtml(doc);
  const page = host.closest(".page") || host;
  const limit = page.clientHeight;
  let scale = 1;
  const apply = () => page.style.setProperty("--s", scale);
  apply();
  if (doc.one_page !== false) {
    while (host.scrollHeight > limit && scale > 0.86 + 1e-9) { scale = Math.round((scale - 0.02) * 100) / 100; apply(); }
  }
  return { scale, fits: host.scrollHeight <= limit || doc.one_page === false };
}

/** Print just the resume (the browser's "Save as PDF"). The document title becomes the default file name. */
export function printResume(doc, fileName) {
  const root = document.getElementById("print-root");
  root.innerHTML = `<div class="page"><div class="page-inner"></div></div>`;
  const res = fitPage(root.querySelector(".page-inner"), doc);
  const oldTitle = document.title;
  document.title = fileName.replace(/\.pdf$/i, "");
  document.body.classList.add("printing");
  const done = () => { document.body.classList.remove("printing"); document.title = oldTitle; root.innerHTML = ""; window.removeEventListener("afterprint", done); };
  window.addEventListener("afterprint", done);
  setTimeout(() => window.print(), 50);
  return res;
}
