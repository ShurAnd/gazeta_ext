const $ = (id) => document.getElementById(id);

async function refresh() {
  const pool = await Pool.get();
  $("count").textContent = "Статей в газете: " + pool.length;
}

$("add").addEventListener("click", async () => {
  const status = $("status");
  $("add").disabled = true;
  status.className = "";
  status.textContent = "Читаю страницу…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const r = await Pool.addFromTab(tab);
    status.className = "ok";
    status.textContent = (r.replaced ? "Обновлено: " : "Добавлено: ") + r.article.title;
  } catch (e) {
    status.className = "err";
    status.textContent = e.message;
  }
  $("add").disabled = false;
  refresh();
});

$("open").addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("manager.html") });
});

refresh();
