/**
 * 在光环/詹丹丹「答案解析」页打开控制台，粘贴整段运行。
 * 会收集页面所有 img01.aura.cn 图片，并下载 image_manifest 片段到剪贴板。
 */
(function () {
  const imgs = [...document.querySelectorAll("img[src*='aura.cn'], img[src*='.png']")];
  const map = {};
  for (const el of imgs) {
    let src = el.src || el.getAttribute("data-src") || "";
    if (!src || src.startsWith("data:")) continue;
    const name = decodeURIComponent(src.split("/").pop().split("?")[0]);
    if (name && /\.(png|gif|jpe?g|webp)$/i.test(name)) map[name] = src;
  }
  const setKey = prompt("套卷 key（如 zonghe_3）", "zonghe_3");
  if (!setKey) return;
  const payload = { setKey, urls: map };
  const text = JSON.stringify(payload, null, 2);
  navigator.clipboard.writeText(text).then(
    () => alert(`已复制 ${Object.keys(map).length} 条图片 URL。\n粘贴到 tools/merge_captured_urls.py 输入文件即可。`),
    () => console.log(text)
  );
  console.log(payload);
})();
