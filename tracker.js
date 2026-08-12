/* =====================================================================
   Trophy Tracker — shared engine
   Every game page calls Tracker.init({...}). You should not need to edit
   this file to add a game; only to change how things behave everywhere.

   TROPHY TYPES
   ------------
   1. Simple checkbox (default):
        { id: "ch1", name: "Chapter 1", desc: "Cleared Chapter 1" }

   2. Counter — partial progress toward a number:
        { id: "ghosts", name: "A Curious Soul", desc: "444 Ghosts",
          type: "counter", target: 444, step: 10 }
      `step` is optional (default 1) and sets what the +/- buttons move by.

   3. Sublist — a trophy made of many smaller items:
        { id: "bundles", name: "Community Center", type: "group",
          children: [
            { group: "Pantry" },                     // section label
            { id: "b_spring", name: "Spring Crops" },
            { id: "b_summer", name: "Summer Crops", note: "optional hint" }
          ]}
      The parent auto-completes when every child is ticked.

   STORAGE
   -------
   <key>-progress-v2  { itemId: true|number, "note::itemId": "text" }
   <key>-summary-v2   { done, total, updated, completedAt? } — read by the
                       hub and trophy cabinet without needing game internals.
   <key>-activity-v1  [{ name, game, ts }, ...] — logged whenever a
                       top-level trophy transitions from incomplete to
                       complete. Capped at the last 100 entries. Powers the
                       hub's "recent activity" panel.

   BUILT-IN UI (no per-game HTML needed)
   --------------------------------------
   A search box and, if the game has any sublists, Expand all / Collapse
   all buttons are injected automatically above #sections. Each top-level
   trophy also gets a small personal-note toggle.
   ===================================================================== */

const Tracker = (function () {
  const CHECK_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="#0b0d14" stroke-width="3">' +
    '<path d="M3 8.5L6.5 12L13 4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CARET_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<path d="M6 3L11 8L6 13" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const SEARCH_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">' +
    '<circle cx="7" cy="7" r="5"/><path d="M11 11L15 15" stroke-linecap="round"/></svg>';

  let cfg = null;
  let state = {};
  let openGroups = {};
  let openNotes = {};
  let searchTerm = "";

  /* ---------- storage keys ---------- */
  function progressKey() { return cfg.key + "-progress-v2"; }
  function summaryKey()  { return cfg.key + "-summary-v2"; }
  function activityKey() { return cfg.key + "-activity-v1"; }

  function load() {
    try {
      const v2 = localStorage.getItem(progressKey());
      if (v2) return JSON.parse(v2);
      const v1 = localStorage.getItem(cfg.key + "-progress-v1");
      if (v1) {
        const migrated = JSON.parse(v1);
        localStorage.setItem(progressKey(), JSON.stringify(migrated));
        return migrated;
      }
    } catch (e) {}
    const seed = {};
    (cfg.earned || []).forEach((id) => (seed[id] = true));
    Object.keys(cfg.counters || {}).forEach((id) => (seed[id] = cfg.counters[id]));
    return seed;
  }

  function save(fromInteraction) {
    const el = document.getElementById("statusLine");
    try {
      localStorage.setItem(progressKey(), JSON.stringify(state));
      const t = totals();
      let prevSummary = {};
      try { prevSummary = JSON.parse(localStorage.getItem(summaryKey()) || "{}"); } catch (e) {}
      const summary = { done: t.done, total: t.total, updated: Date.now() };
      // stamp the first moment a game hits 100%, for the trophy cabinet
      const wasComplete = !!prevSummary.completedAt;
      if (t.total > 0 && t.done === t.total) {
        summary.completedAt = prevSummary.completedAt || Date.now();
      }
      // the single partial trophy closest to finishing, for the hub's
      // "Currently Grinding" widget — only meaningful across saves that
      // came from an actual interaction, but harmless to compute always
      const grind = grindingCandidate();
      if (grind) summary.grinding = grind;
      localStorage.setItem(summaryKey(), JSON.stringify(summary));
      if (el) {
        el.textContent = "Saved to this device automatically.";
        el.classList.remove("bad");
      }
      if (fromInteraction && !wasComplete && summary.completedAt) {
        celebrate();
      }
    } catch (e) {
      if (el) {
        el.textContent = "Couldn't save — copy the backup code below.";
        el.classList.add("bad");
      }
    }
  }

  function logActivity(name) {
    try {
      const raw = localStorage.getItem(activityKey());
      const arr = raw ? JSON.parse(raw) : [];
      arr.push({ name: name, game: cfg.title, ts: Date.now() });
      while (arr.length > 100) arr.shift();
      localStorage.setItem(activityKey(), JSON.stringify(arr));
    } catch (e) {}
  }

  /* ---------- completion logic ---------- */
  function realChildren(item) {
    const out = [];
    (item.children || []).forEach((c) => {
      if (c.id) out.push(c);
      else if (c.children) c.children.forEach((g) => { if (g.id) out.push(g); });
    });
    return out;
  }

  function doneIn(list) {
    return list.filter((c) => c.id && state[c.id]).length;
  }

  function childDone(item) {
    return doneIn(realChildren(item));
  }

  function isComplete(item) {
    if (item.type === "counter") return (state[item.id] || 0) >= item.target;
    if (item.type === "group") {
      const kids = realChildren(item);
      return kids.length > 0 && childDone(item) === kids.length;
    }
    return !!state[item.id];
  }

  function isPartial(item) {
    if (isComplete(item)) return false;
    if (item.type === "counter") return (state[item.id] || 0) > 0;
    if (item.type === "group") return childDone(item) > 0;
    return false;
  }

  function allItems() {
    return cfg.sections.reduce((acc, s) => acc.concat(s.items), []);
  }

  function totals() {
    const items = allItems();
    return { done: items.filter(isComplete).length, total: items.length };
  }

  // The partial (counter or sublist) trophy with the least remaining work,
  // preferring ones you've already started over untouched ones. Stored in
  // the summary so the hub can compare "closest to finishing" across every
  // game without needing to know each game's trophy definitions.
  function grindingCandidate() {
    const candidates = allItems().filter((i) =>
      (i.type === "counter" || i.type === "group") && !isComplete(i));
    if (!candidates.length) return null;

    function remaining(item) {
      if (item.type === "counter") return item.target - (state[item.id] || 0);
      const kids = realChildren(item);
      return kids.length - childDone(item);
    }

    candidates.sort((a, b) => {
      const pa = isPartial(a) ? 0 : 1;
      const pb = isPartial(b) ? 0 : 1;
      if (pa !== pb) return pa - pb;
      return remaining(a) - remaining(b);
    });

    const top = candidates[0];
    return {
      name: top.name,
      remaining: remaining(top),
      total: top.type === "counter" ? top.target : realChildren(top).length,
      kind: top.type
    };
  }

  // A brief confetti burst + banner, shown once per game the moment it
  // first hits 100% from an actual interaction (never on page load or
  // backup restore, so it can't fire repeatedly for an already-done game).
  function celebrate() {
    try {
      const overlay = document.createElement("div");
      overlay.className = "celebrate-overlay";
      const colors = ["#ff6b4a", "#ffb84a", "#ffd479", "#34d399", "#7cc4ff"];
      for (let i = 0; i < 46; i++) {
        const p = document.createElement("div");
        p.className = "confetti-piece";
        p.style.left = (Math.random() * 100) + "vw";
        p.style.background = colors[i % colors.length];
        p.style.animationDelay = (Math.random() * 0.35) + "s";
        p.style.animationDuration = (2 + Math.random() * 1.2) + "s";
        p.style.transform = "rotate(" + Math.floor(Math.random() * 360) + "deg)";
        overlay.appendChild(p);
      }
      const banner = document.createElement("div");
      banner.className = "celebrate-banner";
      banner.textContent = "\uD83C\uDFC6 " + cfg.title + " complete!";
      overlay.appendChild(banner);
      document.body.appendChild(overlay);
      setTimeout(() => overlay.remove(), 3600);
    } catch (e) {}
  }

  /* ---------- search matching ---------- */
  function textMatches(str, term) {
    return !!(str || "").toLowerCase().includes(term);
  }

  function childMatches(c, term) {
    return textMatches(c.name, term) || textMatches(c.note, term);
  }

  function itemMatchesSearch(item, term) {
    if (!term) return true;
    if (textMatches(item.name, term) || textMatches(item.desc, term) || textMatches(item.note, term)) {
      return true;
    }
    if (item.children) {
      return item.children.some((c) => {
        if (c.id) return childMatches(c, term);
        if (c.children) {
          return textMatches(c.group, term) || c.children.some((k) => k.id && childMatches(k, term));
        }
        return textMatches(c.group, term);
      });
    }
    return false;
  }

  /* ---------- rendering ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderCounter(item, row) {
    const val = state[item.id] || 0;
    const step = item.step || 1;
    const wrap = el("div", "counter");

    const track = el("div", "counter-track");
    const fill = el("div", "counter-fill");
    fill.style.width = Math.min(100, Math.round((val / item.target) * 100)) + "%";
    track.appendChild(fill);
    wrap.appendChild(track);

    const controls = el("div", "counter-controls");

    const minus = el("button", null, "\u2212");
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.value = val;
    input.min = 0;
    const plus = el("button", null, "+");
    const of = el("span", "counter-of", "of " + item.target);

    function setVal(n) {
      const wasComplete = isComplete(item);
      const clamped = Math.max(0, Math.min(item.target, Math.round(n) || 0));
      state[item.id] = clamped;
      if (!wasComplete && isComplete(item)) logActivity(item.name);
      save(true);
      render();
    }

    minus.addEventListener("click", (e) => { e.stopPropagation(); setVal(val - step); });
    plus.addEventListener("click", (e) => { e.stopPropagation(); setVal(val + step); });
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("change", () => setVal(parseInt(input.value, 10)));

    controls.appendChild(minus);
    controls.appendChild(input);
    controls.appendChild(of);
    controls.appendChild(plus);
    if (step > 1) controls.appendChild(el("span", "counter-step", "\u00b1" + step));
    wrap.appendChild(controls);

    row.appendChild(wrap);
  }

  function renderChildItem(c, parentItem) {
    const done = !!state[c.id];
    const child = el("div", "child" + (done ? " checked" : ""));
    const box = el("div", "child-box");
    box.innerHTML = CHECK_SVG;
    const textWrap = el("div", "child-text");
    textWrap.appendChild(document.createTextNode(c.name));
    if (c.note) textWrap.appendChild(el("span", "child-note", c.note));
    child.appendChild(box);
    child.appendChild(textWrap);
    child.addEventListener("click", (e) => {
      e.stopPropagation();
      const wasComplete = isComplete(parentItem);
      state[c.id] = !state[c.id];
      if (!wasComplete && isComplete(parentItem)) logActivity(parentItem.name);
      save(true);
      render();
    });
    return child;
  }

  function renderChildren(item, row, term) {
    const wrap = el("div", "children");

    (item.children || []).forEach((c, idx) => {
      // a tickable item
      if (c.id) {
        if (term && !childMatches(c, term)) return;
        wrap.appendChild(renderChildItem(c, item));
        return;
      }

      // a collapsible sub-category
      if (c.children) {
        const subKey = item.id + "::" + (c.group || idx);
        const kids = c.children.filter((k) => k.id);
        const visibleKids = term ? kids.filter((k) => childMatches(k, term)) : kids;
        const groupNameMatches = !!(term && textMatches(c.group, term));
        if (term && visibleKids.length === 0 && !groupNameMatches) return;

        const n = doneIn(kids);
        const full = kids.length > 0 && n === kids.length;
        const open = term ? true : !!openGroups[subKey];

        const header = el("div",
          "subgroup" + (open ? " open" : "") + (full ? " full" : ""));
        const caret = el("div", "subgroup-caret");
        caret.innerHTML = CARET_SVG;
        header.appendChild(caret);
        header.appendChild(el("span", "subgroup-name", c.group));
        header.appendChild(el("span", "subgroup-count", n + " / " + kids.length));
        header.addEventListener("click", (e) => {
          e.stopPropagation();
          openGroups[subKey] = !openGroups[subKey];
          render();
        });
        wrap.appendChild(header);

        if (open) {
          const inner = el("div", "subgroup-items");
          const list = term ? (groupNameMatches ? kids : visibleKids) : kids;
          list.forEach((k) => inner.appendChild(renderChildItem(k, item)));
          wrap.appendChild(inner);
        }
        return;
      }

      // a plain, non-collapsing label — hide during search to reduce clutter
      if (!term) wrap.appendChild(el("div", "child-group-label", c.group));
    });

    row.appendChild(wrap);
  }

  function renderNote(item) {
    const key = "note::" + item.id;
    const val = state[key] || "";
    const wrap = el("div", "note-block");

    const toggle = el("button", "note-toggle" + (val ? " has-note" : ""),
      val ? "\u270E Note" : "+ Add note");
    toggle.type = "button";
    toggle.addEventListener("click", (e) => {
      e.stopPropagation();
      openNotes[item.id] = !openNotes[item.id];
      render();
    });
    wrap.appendChild(toggle);

    if (openNotes[item.id]) {
      const area = el("div", "note-area open");
      const textarea = document.createElement("textarea");
      textarea.className = "note-input";
      textarea.rows = 2;
      textarea.placeholder = "Personal note — progress, reminders, anything";
      textarea.value = val;
      textarea.addEventListener("click", (e) => e.stopPropagation());
      textarea.addEventListener("blur", () => {
        const v = textarea.value.trim();
        if (v) state[key] = v; else delete state[key];
        save();
        render();
      });
      area.appendChild(textarea);
      wrap.appendChild(area);
    } else if (val) {
      wrap.appendChild(el("div", "note-preview", val));
    }

    return wrap;
  }

  function renderRow(item, term) {
    const complete = isComplete(item);
    const partial = isPartial(item);
    const isGroup = item.type === "group";
    const open = isGroup && (term ? true : !!openGroups[item.id]);

    const row = el("div",
      "row" + (complete ? " checked" : "") + (open ? " open" : "") +
      (item.type === "counter" || isGroup ? " no-toggle" : ""));

    const head = el("div", "row-head");

    const box = el("div", "box" + (partial ? " partial" : ""));
    box.innerHTML = CHECK_SVG;
    head.appendChild(box);

    const main = el("div", "row-main");
    const titleLine = el("div", "row-title-line");
    titleLine.appendChild(el("span", "row-title", item.name));

    if (item.chapter) titleLine.appendChild(el("span", "badge chapter", "Ch." + item.chapter));
    if (item.caution) titleLine.appendChild(el("span", "badge caution", "Do it on purpose"));
    if (item.platinum) titleLine.appendChild(el("span", "badge plat", "Platinum"));
    if (item.type === "counter") {
      titleLine.appendChild(el("span", "badge count",
        (state[item.id] || 0) + " / " + item.target));
    }
    if (isGroup) {
      const kids = realChildren(item);
      titleLine.appendChild(el("span", "badge count",
        childDone(item) + " / " + kids.length));
    }
    main.appendChild(titleLine);

    if (item.desc) main.appendChild(el("div", "row-sub", item.desc));
    if (item.note) main.appendChild(el("div", "row-note", item.note));
    head.appendChild(main);

    if (isGroup) {
      const caret = el("div", "sub-toggle");
      caret.innerHTML = CARET_SVG;
      head.appendChild(caret);
    }

    if (isGroup) {
      head.addEventListener("click", () => {
        openGroups[item.id] = !openGroups[item.id];
        render();
      });
    } else if (item.type !== "counter") {
      head.addEventListener("click", () => {
        const wasComplete = isComplete(item);
        state[item.id] = !state[item.id];
        if (!wasComplete && isComplete(item)) logActivity(item.name);
        save(true);
        render();
      });
    }

    row.appendChild(head);
    if (item.type === "counter") renderCounter(item, row);
    if (isGroup) renderChildren(item, row, term);
    row.appendChild(renderNote(item));

    return row;
  }

  function hasAnyGroups() {
    return cfg.sections.some((s) => s.items.some((i) => i.type === "group"));
  }

  function setAllGroups(open) {
    cfg.sections.forEach((s) => s.items.forEach((item) => {
      if (item.type === "group") {
        openGroups[item.id] = open;
        (item.children || []).forEach((c, idx) => {
          if (c.children) openGroups[item.id + "::" + (c.group || idx)] = open;
        });
      }
    }));
    render();
  }

  function injectControls() {
    const sectionsEl = document.getElementById("sections");
    if (!sectionsEl || document.getElementById("trackerControls")) return;

    const bar = el("div", "controls-bar");
    bar.id = "trackerControls";

    const searchWrap = el("div", "search-wrap");
    const icon = el("span", "search-icon");
    icon.innerHTML = SEARCH_SVG;
    const input = document.createElement("input");
    input.type = "search";
    input.className = "search-input";
    input.placeholder = "Search trophies\u2026";
    input.value = searchTerm;
    input.addEventListener("input", () => {
      searchTerm = input.value.trim().toLowerCase();
      render();
      const box = document.querySelector(".search-input");
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
    });
    searchWrap.appendChild(icon);
    searchWrap.appendChild(input);
    bar.appendChild(searchWrap);

    if (hasAnyGroups()) {
      const btnWrap = el("div", "collapse-controls");
      const expandBtn = el("button", "collapse-btn", "Expand all");
      expandBtn.type = "button";
      expandBtn.addEventListener("click", () => setAllGroups(true));
      const collapseBtn = el("button", "collapse-btn", "Collapse all");
      collapseBtn.type = "button";
      collapseBtn.addEventListener("click", () => setAllGroups(false));
      btnWrap.appendChild(expandBtn);
      btnWrap.appendChild(collapseBtn);
      bar.appendChild(btnWrap);
    }

    sectionsEl.parentNode.insertBefore(bar, sectionsEl);
  }

  function render() {
    injectControls();
    const container = document.getElementById("sections");
    container.innerHTML = "";

    const term = searchTerm;
    let visibleSections = 0;

    cfg.sections.forEach((s) => {
      const items = term ? s.items.filter((item) => itemMatchesSearch(item, term)) : s.items;
      if (items.length === 0) return;
      visibleSections++;

      const sec = el("div", "section");
      sec.appendChild(el("h2", null, s.title));
      if (s.desc) sec.appendChild(el("p", "desc", s.desc));
      const rows = el("div", "rows");
      items.forEach((item) => rows.appendChild(renderRow(item, term)));
      sec.appendChild(rows);
      container.appendChild(sec);
    });

    if (term && visibleSections === 0) {
      container.appendChild(el("div", "empty", "No trophies match \u201c" + term + "\u201d."));
    }

    const t = totals();
    const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
    document.getElementById("doneCount").textContent = t.done;
    document.getElementById("totalCount").textContent = t.total;
    document.getElementById("pctLabel").textContent = "(" + pct + "%)";
    document.getElementById("barFill").style.width = pct + "%";
  }

  /* ---------- backup ---------- */
  function initBackup() {
    const box = document.getElementById("codeBox");
    const msg = document.getElementById("backupMsg");
    const copyBtn = document.getElementById("copyBtn");
    const loadBtn = document.getElementById("loadBtn");
    if (!box) return;

    copyBtn.addEventListener("click", () => {
      box.value = btoa(JSON.stringify(state));
      box.select();
      try {
        document.execCommand("copy");
        msg.textContent = "Copied — paste it somewhere safe.";
      } catch (e) {
        msg.textContent = "Code shown above — copy it manually.";
      }
    });

    let awaiting = false;
    loadBtn.addEventListener("click", () => {
      if (!awaiting) {
        awaiting = true;
        box.readOnly = false;
        box.value = "";
        box.placeholder = "Paste your code, then tap this again";
        box.focus();
        msg.textContent = 'Paste your code above, then tap "Paste & restore" again.';
        return;
      }
      try {
        state = JSON.parse(atob(box.value.trim()));
        save();
        render();
        msg.textContent = "Progress restored.";
      } catch (e) {
        msg.textContent = "That code didn't look right — check it and try again.";
      } finally {
        box.readOnly = true;
        box.placeholder = "Your progress code appears here";
        awaiting = false;
      }
    });
  }

  /* ---------- public ---------- */
  function init(config) {
    cfg = config;
    state = load();
    document.title = cfg.title + " — Trophy Tracker";
    const h = document.getElementById("gameTitle");
    if (h) h.textContent = cfg.title;
    const s = document.getElementById("gameSub");
    if (s) s.textContent = cfg.subtitle || "";
    render();
    save();          // writes the summary so the hub is accurate immediately
    initBackup();
  }

  return { init: init };
})();
