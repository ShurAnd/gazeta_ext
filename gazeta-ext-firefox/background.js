// В Chrome фон — service worker (подключаем pool.js сами), в Firefox pool.js подключается из манифеста.
if (typeof importScripts === "function") importScripts("pool.js");

async function showCount() {
  const pool = await Pool.get();
  await chrome.action.setBadgeBackgroundColor({ color: "#333333" });
  await chrome.action.setBadgeText({ text: pool.length ? String(pool.length) : "" });
}

chrome.runtime.onInstalled.addListener(showCount);
chrome.runtime.onStartup.addListener(showCount);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.pool) showCount();
});

// Горячая клавиша: добавить статью, не открывая окошко расширения.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "add-article") return;
  if (!tab) [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  try {
    await Pool.addFromTab(tab);
    await chrome.action.setBadgeBackgroundColor({ color: "#1a7f37" });
    await chrome.action.setBadgeText({ text: "✓" });
  } catch (e) {
    await chrome.action.setBadgeBackgroundColor({ color: "#c62828" });
    await chrome.action.setBadgeText({ text: "!" });
  }
  setTimeout(showCount, 1500);
});
