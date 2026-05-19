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
    },
    {
      id: "comp-2",
      title: "综合题2",
      summary: "75道单选，含详细解析与「你的作答」记录。",
      key: "zonghe_2"
    },
    {
      id: "comp-3",
      title: "综合题3",
      summary: "75道单选，含解析与作答对照。",
      key: "zonghe_3"
    },
    {
      id: "comp-4",
      title: "综合题4",
      summary: "74道单选，含解析与作答对照。",
      key: "zonghe_4"
    },
    {
      id: "comp-5",
      title: "综合题5",
      summary: "单选综合练习，含解析与作答对照。",
      key: "zonghe_5"
    },
    {
      id: "comp-6",
      title: "综合题6",
      summary: "74道单选，含解析与「你的作答」记录。",
      key: "zonghe_6"
    },
    {
      id: "comp-7",
      title: "综合题7",
      summary: "75道单选，含解析与「你的作答」记录。",
      key: "zonghe_7"
    },
    {
      id: "comp-8",
      title: "综合题8",
      summary: "71道单选（源导出缺第6/14/27/28题），含解析。",
      key: "zonghe_8"
    },
    {
      id: "comp-9",
      title: "综合题9",
      summary: "68道单选，含解析。",
      key: "zonghe_9"
    },
    {
      id: "comp-10",
      title: "综合题10",
      summary: "75道单选，含解析。",
      key: "zonghe_10"
    },
    {
      id: "comp-11",
      title: "综合题11",
      summary: "72道单选，含解析与「你的作答」记录。",
      key: "zonghe_11"
    },
    {
      id: "comp-12",
      title: "综合题12",
      summary: "74道单选，含解析与「你的作答」记录。",
      key: "zonghe_12"
    }
  ],
  mock: [
    { id: "mock-1", title: "模拟题1", summary: "75道单选模拟题，覆盖项目管理、IT技术与法规等综合考点。", key: "moni_1" },
    { id: "mock-2", title: "模拟题2", summary: "75道单选模考题，含解析与「你的作答」记录。", key: "moni_2" }
  ]
};
