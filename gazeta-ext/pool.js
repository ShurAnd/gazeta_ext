// Общий код: список отобранных статей («пул») хранится в chrome.storage.local.
const Pool = {
  async get() {
    return (await chrome.storage.local.get({ pool: [] })).pool;
  },
  async set(pool) {
    await chrome.storage.local.set({ pool });
  },
  /** Забирает статью с вкладки и кладёт в пул. Возвращает {article, replaced, count}. */
  async addFromTab(tab) {
    if (!tab || !/^https?:/.test(tab.url || "")) {
      throw new Error("С этой страницы статью взять нельзя.");
    }
    let results;
    try {
      results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["Readability.js", "grab.js"],
      });
    } catch (e) {
      throw new Error("Браузер не разрешает читать эту страницу.");
    }
    const article = results && results[0] && results[0].result;
    if (!article) throw new Error("Не удалось прочитать страницу.");
    if (article.error) throw new Error(article.error);

    const pool = await Pool.get();
    const i = pool.findIndex((a) => a.url === article.url);
    if (i >= 0) pool[i] = article;
    else pool.push(article);
    await Pool.set(pool);
    return { article, replaced: i >= 0, count: pool.length };
  },
};
