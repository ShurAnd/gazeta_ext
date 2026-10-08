const $ = (id) => document.getElementById(id);
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const DEFAULT_TITLE = "Обзор публикаций СМИ";
const DEFAULT_ORG = "Ситуационный центр\nКонтрольного управления\nПрезидента РФ";
let pool = [];
const opened = new Set(); // статьи, у которых раскрыт список абзацев

// выделенные абзацы (идут в содержание и выделяются синим); по умолчанию — первый
const leadOf = (a) => (Array.isArray(a.lead) ? a.lead : [0]).filter((k) => k < a.paragraphs.length);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

async function save() {
  await Pool.set(pool);
}

function render() {
  const list = $("list");
  list.textContent = "";
  $("build").disabled = $("clear").disabled = pool.length === 0;
  if (!pool.length) {
    list.append(el("div", { className: "empty", textContent: "Пока пусто. Откройте статью в браузере и нажмите кнопку расширения «Добавить статью в газету»." }));
    return;
  }
  pool.forEach((a, i) => {
    const title = el("input", { className: "title", value: a.title, title: "Заголовок можно поправить" });
    title.addEventListener("change", () => { a.title = title.value.trim() || a.title; save(); });

    const link = el("a", { href: a.url, target: "_blank", textContent: a.url });
    const chars = a.paragraphs.reduce((n, p) => n + p.length, 0);
    const meta = el("div", { className: "meta" }, [a.site, a.date, a.author, `${a.paragraphs.length} абз., ${chars} зн.`].filter(Boolean).join("  •  ") + "  •  ", link);
    const lead = leadOf(a);
    const shown = lead.map((k) => a.paragraphs[k]).join(" ") || "(нет выделенных абзацев — в содержании будет только заголовок)";
    const preview = el("div", { className: "preview", textContent: shown.length > 260 ? shown.slice(0, 260) + "…" : shown });

    const toggle = el("button", { className: "link", textContent: opened.has(a.url) ? "Скрыть абзацы ▴" : `Выбрать выделенные абзацы (${lead.length}) ▾` });
    toggle.addEventListener("click", () => { opened.has(a.url) ? opened.delete(a.url) : opened.add(a.url); render(); });
    const picker = el("div", { className: "picker" });
    if (opened.has(a.url)) {
      picker.append(el("div", { className: "hint", textContent: "Щёлкните абзац, чтобы выделить его синим или снять выделение. Выделенные абзацы попадают в содержание." }));
      a.paragraphs.forEach((t, k) => {
        const row = el("div", { className: "par" + (lead.includes(k) ? " on" : ""), textContent: t });
        row.addEventListener("click", () => {
          a.lead = lead.includes(k) ? lead.filter((x) => x !== k) : [...lead, k].sort((x, y) => x - y);
          save(); render();
        });
        picker.append(row);
      });
    }

    const up = el("button", { textContent: "▲", title: "Выше", disabled: i === 0 });
    up.addEventListener("click", () => { [pool[i - 1], pool[i]] = [pool[i], pool[i - 1]]; save(); render(); });
    const down = el("button", { textContent: "▼", title: "Ниже", disabled: i === pool.length - 1 });
    down.addEventListener("click", () => { [pool[i + 1], pool[i]] = [pool[i], pool[i + 1]]; save(); render(); });
    const del = el("button", { textContent: "✖", title: "Убрать из газеты" });
    del.addEventListener("click", () => { pool.splice(i, 1); save(); render(); });

    list.append(el("li", {},
      el("div", { className: "num", textContent: i + 1 + "." }),
      el("div", { className: "text" }, title, meta, preview, toggle, picker),
      el("div", { className: "ctl" }, up, down, del)));
  });
}

async function buildPaper() {
  const now = new Date();
  const p2 = (n) => String(n).padStart(2, "0");
  const origin = (u) => { try { return new URL(u).origin + "/"; } catch (e) { return u; } };
  const paper = {
    title: $("title").value.trim() || DEFAULT_TITLE,
    org: $("org").value,
    date: `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    entries: pool.map((a) => ({
      site: origin(a.url),
      date: a.date || "",
      author: a.author || "",
      title: a.title,
      paragraphs: a.paragraphs,
      lead: leadOf(a),
      heads: a.heads || [],
    })),
  };
  const blob = new Blob(Docx.build(paper), {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const name = `СМИ ${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()} г. (${p2(now.getHours())}-${p2(now.getMinutes())}).docx`;
  const url = URL.createObjectURL(blob);
  let saved = false;
  // Firefox: надёжнее через API загрузок; Chrome: обычная ссылка для скачивания.
  if (chrome.downloads && chrome.downloads.download) {
    try {
      await chrome.downloads.download({ url, filename: name });
      saved = true;
    } catch (e) {
      saved = false;
    }
  }
  if (!saved) {
    const a = el("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  $("status").textContent = `Файл «${name}» сохранён в папку загрузок.`;
}

async function init() {
  const stored = await chrome.storage.local.get({ pool: [], reviewTitle: DEFAULT_TITLE, orgName: DEFAULT_ORG });
  pool = stored.pool;
  $("title").value = stored.reviewTitle;
  $("org").value = stored.orgName;
  $("title").addEventListener("change", () => chrome.storage.local.set({ reviewTitle: $("title").value }));
  $("org").addEventListener("change", () => chrome.storage.local.set({ orgName: $("org").value }));
  $("build").addEventListener("click", buildPaper);
  $("clear").addEventListener("click", () => {
    if ($("clear").dataset.armed) {
      pool = []; save(); render();
      delete $("clear").dataset.armed; $("clear").textContent = "Очистить список";
    } else {
      $("clear").dataset.armed = "1"; $("clear").textContent = "Точно очистить?";
      setTimeout(() => { delete $("clear").dataset.armed; $("clear").textContent = "Очистить список"; }, 3000);
    }
  });
  // статьи, добавленные в других вкладках, появляются в списке сразу
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.pool) { pool = changes.pool.newValue || []; render(); }
  });
  render();
}
init();
