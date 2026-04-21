/**
 * 练习场元数据
 * - key 对应 window.practiceMarkdown 中的键名（即 JS 文件名去掉 .js）
 * - 命名规则：zonghe_n.md → zonghe_n.js，在 index.html 中 <script> 引入
 * - 解析由 app.js 的 parsePracticeMarkdown() 负责，在首次访问时同步执行并缓存
 */
window.practiceSets = {
  comprehensive: [
    {
      id: "comp-1",
      title: "综合题1",
      summary: "75道单选，覆盖整合、范围、进度、成本、质量、IT新技术等核心考点。",
      key: "zonghe_1"
    }
    // 后续追加：{ id: "comp-2", title: "综合题2", summary: "...", key: "zonghe_2" }
  ],
  mock: [
    // { id: "mock-1", title: "模考1", summary: "...", key: "mock_1" }
  ]
};
