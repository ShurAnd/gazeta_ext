// Общий код: список отобранных статей («пул») хранится в chrome.storage.local.
const Pool = {
  async get() {
    return (await chrome.storage.local.get({ pool: [] })).pool;
  },
  async set(pool) {
    await chrome.storage.local.set({ pool });
  },
  /**
   * Забирает статью с вкладки и кладёт в пул. Возвращает {article, duplicate, count}.
   * Если статья уже есть в пуле, она не добавляется повторно: duplicate = true, article — та, что в пуле.
   */
  async addFromTab(tab) {
    if (!tab || !/^https?:/.test(tab.url || "")) {
      throw new Error("С этой страницы статью взять нельзя.");
    }
    const existing = (pool, url) => pool.find((a) => a.url === url);
    const before = await Pool.get();
    const known = existing(before, tab.url.split("#")[0]);
    if (known) return { article: known, duplicate: true, count: before.length };

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

    // пул мог измениться, пока читали страницу, а адрес статьи — отличаться от адреса вкладки
    const pool = await Pool.get();
    const dup = existing(pool, article.url);
    if (dup) return { article: dup, duplicate: true, count: pool.length };
    pool.push(article);
    await Pool.set(pool);
    return { article, duplicate: false, count: pool.length };
  },
};
