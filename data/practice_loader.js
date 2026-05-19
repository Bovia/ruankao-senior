/**
 * 练习场 / 案例题按需加载（GitHub Pages 静态站，无后端）
 * - 首屏不拉取 data/practice/*.js（约 1.8MB）
 * - 进入对应套卷或案例题时再动态插入 <script>
 */
(function () {
  const pending = Object.create(null);

  function loadScript(src) {
    if (pending[src]) return pending[src];
    pending[src] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () {
        resolve();
      };
      s.onerror = function () {
        delete pending[src];
        reject(new Error("无法加载 " + src));
      };
      document.head.appendChild(s);
    });
    return pending[src];
  }

  window.loadPracticeMarkdownKey = function (key) {
    var k = String(key || "").trim();
    if (!k) return Promise.resolve();
    window.practiceMarkdown = window.practiceMarkdown || {};
    if (window.practiceMarkdown[k] != null) return Promise.resolve();
    return loadScript("./data/practice/" + k + ".js");
  };

  window.loadPracticeMarkdownKeys = function (keys) {
    var list = Array.isArray(keys) ? keys : [];
    var uniq = [];
    var seen = Object.create(null);
    for (var i = 0; i < list.length; i++) {
      var k = String(list[i] || "").trim();
      if (!k || seen[k]) continue;
      seen[k] = true;
      uniq.push(k);
    }
    return Promise.all(
      uniq.map(function (k) {
        return window.loadPracticeMarkdownKey(k);
      })
    );
  };

  window.loadCaseStudyData = function () {
    if (Array.isArray(window.caseStudySets) && window.caseStudySets.length) {
      return Promise.resolve();
    }
    return loadScript("./data/case_study_data.js");
  };
})();
