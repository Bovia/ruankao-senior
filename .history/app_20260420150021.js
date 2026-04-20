const { createApp } = Vue;

createApp({
  data() {
    const modules = [
      { id: "pm", name: "项目管理", desc: "十大知识域 · 绩效域 · 基础", color: "#16a34a", icon: "📐" },
      { id: "it", name: "IT 技术", desc: "新一代信息技术 · 信息化", color: "#7c3aed", icon: "💡" },
      { id: "law", name: "法规标准", desc: "法律法规 · 标准 · 职业道德", color: "#dc2626", icon: "⚖️" },
      { id: "essay", name: "论文专区", desc: "模板 · 素材 · 评分 · 技巧", color: "#9333ea", icon: "✍️" }
    ];
    const essayTabs = [
      { id: "basics", label: "考试基本规则" },
      { id: "structure", label: "五段式结构" },
      { id: "scoring", label: "评分与易错" },
      { id: "domainPoints", label: "知识域要点" },
      { id: "projects", label: "项目素材库" },
      { id: "phrases", label: "金句表" },
      { id: "pastTopics", label: "历年真题" }
    ];
    const allDomains = Object.values(window.knowledgeData || {});
    const pmDomains = allDomains.filter((d) => (d.module || "pm") === "pm");
    const firstDomain = pmDomains[0] || allDomains[0] || { processes: [] };
    const firstProcess = (firstDomain.processes || [])[0] || {};

    return {
      knowledgeData: window.knowledgeData || {},
      essayData: window.essayData || { name: "论文专区", summary: "", examBasics: {}, structure: { sections: [] }, scoringCriteria: [], commonMistakes: [], domainPoints: [], projectTemplates: [], phrases: {}, pastTopics: [], writingTips: [] },
      myEssayData: window.myEssayData || { projectOverview: { title: "", content: "" }, wordRequirements: { sections: [] }, groups: [], topics: { knowledge: [], performance: [] }, conclusionTemplate: { outline: [] } },
      modules,
      essayTabs,
      activeModule: "pm",
      activeEssayTab: "basics",
      myEssayGroupId: "knowledge",
      myEssayTopicId: "integration",
      myEssayCopied: "",
      views: [
        { id: "processGroup", label: "总览", desc: "总览" },
        { id: "study", label: "学习卡", desc: "过程 + 记忆卡" },
        { id: "compare", label: "概念对比", desc: "高频易混项" },
        { id: "formula", label: "公式看板", desc: "按知识域筛选" },
        { id: "keyword", label: "关键词", desc: "题目密码词速查" },
        { id: "scenario", label: "场景演练", desc: "案例分析动作流" },
        { id: "quiz", label: "练习场", desc: "题库 + 连连看" }
      ],
      activeDomainId: firstDomain.id || "",
      activeProcessId: firstProcess.id || "",
      activeView: "study",
      quizMode: "single",
      densityMode: "core",
      learnedProcessIds: firstProcess.id ? [firstProcess.id] : [],
      examDate: new Date("2026-05-24T09:00:00"),
      nowTimestamp: Date.now(),
      searchQuery: "",
      searchFocused: false,
      searchWrapperRect: null,
      moduleSheetOpen: false,
      pgFilterDomain: "all",
      blindFillMode: false,
      blindFillRevealed: {},
      flippedKeywords: {},
      quizSubMode: "quiz",
      matcherPairs: [],
      matcherLeftItems: [],
      matcherRightItems: [],
      matcherLeftSel: null,
      matcherRightSel: null,
      matcherMatchedIds: [],
      matcherWrong: false,
      calculatorInput: {
        EV: "",
        PV: "",
        AC: "",
        BAC: ""
      },
      calculatorFields: [
        { key: "EV", label: "EV 挣值", placeholder: "例如 120" },
        { key: "PV", label: "PV 计划价值", placeholder: "例如 100" },
        { key: "AC", label: "AC 实际成本", placeholder: "例如 110" },
        { key: "BAC", label: "BAC 完工预算", placeholder: "例如 300" }
      ]
    };
  },
  computed: {
    domains() {
      return Object.values(this.knowledgeData);
    },
    visibleDomains() {
      return this.domains.filter((d) => (d.module || "pm") === this.activeModule);
    },
    activeModuleMeta() {
      return this.modules.find((m) => m.id === this.activeModule) || this.modules[0];
    },
    heroTitle() {
      const titleMap = {
        pm: "把十大知识域串成一张会发光的记忆地图",
        it: "从云计算到元宇宙：IT 技术一张图记住",
        law: "合同、招投标、数据三法，考点逐条刻进脑子",
        essay: "2500 字论文，给你一套可直接抄的打法"
      };
      return titleMap[this.activeModule] || "信息系统项目管理师 · 一站式学习器";
    },
    domainGroups() {
      const map = new Map();
      this.visibleDomains.forEach((d) => {
        const cat = d.category || "其他";
        if (!map.has(cat)) map.set(cat, { category: cat, domains: [] });
        map.get(cat).domains.push(d);
      });
      return Array.from(map.values());
    },
    activeDomain() {
      return this.knowledgeData[this.activeDomainId] || this.visibleDomains[0] || this.domains[0] || { processes: [], formulas: [], comparisons: [], quiz: [] };
    },
    activeProcess() {
      return this.activeDomain.processes.find((item) => item.id === this.activeProcessId) || this.activeDomain.processes[0] || {
        name: "暂无过程",
        goal: "",
        inputs: [],
        tools: [],
        outputs: [],
        mnemonic: "",
        pitfalls: [],
        examAngles: [],
        stageOrder: ""
      };
    },
    activeCardType() {
      return this.activeDomain.cardType || "itto";
    },
    activeProcessSubtitle() {
      const p = this.activeProcess;
      if (this.activeCardType === "concept") return p.definition || p.goal || "";
      if (this.activeCardType === "law") return p.scope || p.goal || "";
      return p.goal || "";
    },
    activeProcessStageBadge() {
      const p = this.activeProcess;
      if (this.activeCardType === "law" && p.effectiveDate) return p.effectiveDate;
      return p.stageOrder || "";
    },
    activeProcessColumns() {
      const p = this.activeProcess;
      const t = this.activeCardType;
      if (t === "law") {
        return [
          { label: "核心条款", sub: "Core Provisions", field: "coreProvisions", items: p.coreProvisions || [], color: "amber", renderAs: "text" },
          { label: "关键数字", sub: "Key Numbers", field: "keyNumbers", items: p.keyNumbers || [], color: "orange", renderAs: "kv" },
          { label: "禁止行为", sub: "Prohibitions", field: "prohibitions", items: p.prohibitions || [], color: "rose", renderAs: "text" }
        ];
      }
      if (t === "concept") {
        return [
          { label: "核心要点", sub: "Essentials", field: "essentials", items: p.essentials || [], color: "sky", renderAs: "text" },
          { label: "分类 · 组成", sub: "Structure", field: "structure", items: p.structure || [], color: "violet", renderAs: "text" },
          { label: "应用 · 场景", sub: "Applications", field: "applications", items: p.applications || [], color: "emerald", renderAs: "text" }
        ];
      }
      return [
        { label: "输入", sub: "Inputs", field: "inputs", items: p.inputs || [], color: "sky", renderAs: "text" },
        { label: "工具", sub: "Tools", field: "tools", items: p.tools || [], color: "teal", renderAs: "text" },
        { label: "输出", sub: "Outputs", field: "outputs", items: p.outputs || [], color: "emerald", renderAs: "text" }
      ];
    },
    processGroupTitle() {
      if (this.activeModule === "it") {
        return {
          eyebrow: "IT Tech Map",
          heading: "新一代信息技术 · 技术分类",
          desc: "按基础设施 / 数据智能 / 安全可信 / 连接感知 / 人机交互 归类，点击卡片切到对应学习卡。"
        };
      }
      if (this.activeModule === "law") {
        return {
          eyebrow: "Regulation Map",
          heading: "法律法规 · 分类总览",
          desc: "按合同 · 采购 · 数据三法 · 知识产权 · 标准与伦理 归类，点击任意法条直达学习卡。"
        };
      }
      return {
        eyebrow: "Process Groups Overview",
        heading: "五大过程组",
        desc: "从启动到收尾，完整项目管理过程闭环。点击任意子过程，直接跳转到对应学习卡。"
      };
    },
    activeProcessKeyHighlightLabel() {
      if (this.activeCardType === "concept") return "高频要点";
      if (this.activeCardType === "law") return "最关键数字";
      return "关键输出";
    },
    activeProcessKeyHighlight() {
      const cols = this.activeProcessColumns;
      if (!cols.length) return "";
      const last = cols[cols.length - 1];
      const first = cols[0];
      const pick = (col) => {
        if (!col.items || !col.items.length) return "";
        if (col.renderAs === "kv") {
          const kv = col.items[0];
          return kv.label ? `${kv.label}：${kv.value}` : kv.value;
        }
        return col.items[0];
      };
      return pick(last) || pick(first) || "待补充";
    },
    activeDomainIndex() {
      return this.visibleDomains.findIndex((d) => d.id === this.activeDomainId);
    },
    canGoPrevDomain() {
      return this.activeDomainIndex > 0;
    },
    canGoNextDomain() {
      return this.activeDomainIndex < this.visibleDomains.length - 1;
    },
    showDomainNavArrows() {
      return ["study", "keyword", "scenario", "formula", "compare", "quiz"].includes(this.activeView);
    },
    visibleViews() {
      const domains = this.visibleDomains;
      const has = (field) => domains.some((d) => {
        const val = d[field];
        return Array.isArray(val) ? val.length > 0 : !!val;
      });
      return this.views.filter((v) => {
        if (v.id === "formula") return has("formulas");
        if (v.id === "scenario") return has("actionFlows");
        return true;
      });
    },
    activeViewLabel() {
      const match = this.views.find((item) => item.id === this.activeView);
      return match ? match.label : "学习卡";
    },
    learnedCount() {
      return this.activeDomain.processes.filter((item) => this.learnedProcessIds.includes(item.id)).length;
    },
    compareCards() {
      const globalCards = [
        {
          name: "确认范围 vs 控制质量",
          sides: [
            { title: "确认范围", detail: "关注客户/发起人是否正式验收成果，偏外部认可。" },
            { title: "控制质量", detail: "关注成果是否符合质量标准，偏内部检查。" }
          ],
          memory: "先内检质量，再外部确认范围。"
        },
        {
          name: "管理储备 vs 应急储备",
          sides: [
            { title: "管理储备", detail: "应对未知未知风险，通常不纳入成本基准。" },
            { title: "应急储备", detail: "应对已识别风险，通常纳入成本基准。" }
          ],
          memory: "未知找管理，已知用应急。"
        },
        {
          name: "工作绩效数据 / 信息 / 报告",
          sides: [
            { title: "数据", detail: "执行现场原始值。" },
            { title: "信息", detail: "对数据分析加工后的可判断结果。" },
            { title: "报告", detail: "面向沟通对象整理出的正式输出。" }
          ],
          memory: "先收数，再成信，最后出报告。"
        }
      ];

      const domainCards = this.activeDomain.comparisons || [];
      const merged = [...domainCards, ...globalCards];
      const seen = new Set();
      return merged.filter((item) => {
        if (seen.has(item.name)) {
          return false;
        }
        seen.add(item.name);
        return true;
      });
    },
    domainKeywords() {
      return this.activeDomain.keywordMap || [];
    },
    domainActionFlows() {
      return this.activeDomain.actionFlows || [];
    },
    domainLogicalLinks() {
      return this.activeDomain.logicalLinks || [];
    },
    matcherFinished() {
      return this.matcherPairs.length > 0 && this.matcherMatchedIds.length === this.matcherPairs.length;
    },
    matcherScore() {
      return this.matcherMatchedIds.length;
    },
    countdown() {
      const diff = this.examDate - this.nowTimestamp;
      if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      return { days, hours, minutes, seconds, expired: false };
    },
    searchResults() {
      const q = this.searchQuery.trim().toLowerCase();
      if (!q) return [];
      const results = [];
      const scope = this.activeModule === "essay" ? this.domains : this.visibleDomains;
      scope.forEach((domain) => {
        if (!domain.processes) return;
        domain.processes.forEach((proc) => {
          const kvText = (proc.keyNumbers || []).map((n) => `${n.label || ""} ${n.value || ""}`).join(" ");
          const haystack = [
            proc.name,
            proc.goal,
            proc.definition,
            proc.scope,
            proc.stageOrder,
            proc.effectiveDate,
            ...(proc.inputs || []),
            ...(proc.tools || []),
            ...(proc.outputs || []),
            ...(proc.essentials || []),
            ...(proc.structure || []),
            ...(proc.applications || []),
            ...(proc.coreProvisions || []),
            ...(proc.prohibitions || []),
            kvText,
            proc.mnemonic || ""
          ].join(" ").toLowerCase();
          if (haystack.includes(q)) {
            results.push({
              ...proc,
              domainId: domain.id,
              domainName: domain.name,
              domainColor: domain.themeColor
            });
          }
        });
      });
      return results.slice(0, 12);
    },
    currentProcessIndex() {
      return this.activeDomain.processes.findIndex((p) => p.id === this.activeProcessId);
    },
    filteredProcessGroups() {
      if (this.pgFilterDomain === "all") return this.processGroups;
      return this.processGroups.map((group) => ({
        ...group,
        processes: group.processes.filter((p) => p.domainId === this.pgFilterDomain)
      })).filter((group) => group.processes.length > 0);
    },
    filteredProcessCount() {
      return this.filteredProcessGroups.reduce((sum, g) => sum + g.processes.length, 0);
    },
    searchDropdownStyle() {
      const r = this.searchWrapperRect;
      if (!r) return { position: "fixed", top: "80px", right: "24px" };
      return {
        position: "fixed",
        top: (r.bottom + 8) + "px",
        right: (window.innerWidth - r.right) + "px",
        width: "380px"
      };
    },
    processGroups() {
      if (this.activeModule === "pm") {
        const groupOrder = ["启动", "规划", "执行", "监控", "收尾"];
        const groupMeta = {
          "启动": { icon: "🚀", color: "#f59e0b", desc: "正式授权项目启动" },
          "规划": { icon: "📐", color: "#3b82f6", desc: "制定行动路线图" },
          "执行": { icon: "⚡", color: "#10b981", desc: "完成项目工作" },
          "监控": { icon: "📊", color: "#8b5cf6", desc: "跟踪偏差纠偏" },
          "收尾": { icon: "🏁", color: "#ef4444", desc: "正式结束项目" }
        };
        const groups = {};
        groupOrder.forEach((name) => {
          groups[name] = { name, ...groupMeta[name], processes: [] };
        });
        this.visibleDomains.forEach((domain) => {
          if (!domain.processes) return;
          domain.processes.forEach((process) => {
            const stage = process.stageOrder;
            if (groups[stage]) {
              groups[stage].processes.push({
                ...process,
                domainId: domain.id,
                domainName: domain.name,
                domainColor: domain.themeColor
              });
            }
          });
        });
        return groupOrder.map((name) => groups[name]);
      }
      const moduleMeta = {
        it: { icon: "💡", color: "#7c3aed", descFallback: "信息技术分类" },
        law: { icon: "⚖️", color: "#b45309", descFallback: "法律分类" }
      };
      const meta = moduleMeta[this.activeModule] || { icon: "🧩", color: "#6366f1", descFallback: "分类" };
      const orderMap = new Map();
      this.visibleDomains.forEach((domain) => {
        if (!domain.processes) return;
        domain.processes.forEach((process) => {
          const stage = process.stageOrder || "其他";
          if (!orderMap.has(stage)) {
            orderMap.set(stage, { name: stage, icon: meta.icon, color: meta.color, desc: meta.descFallback, processes: [] });
          }
          orderMap.get(stage).processes.push({
            ...process,
            domainId: domain.id,
            domainName: domain.name,
            domainColor: domain.themeColor
          });
        });
      });
      return Array.from(orderMap.values());
    },
    totalProcessCount() {
      return this.processGroups.reduce((sum, g) => sum + g.processes.length, 0);
    },
    myEssayTopics() {
      const map = this.myEssayData.topics || {};
      return map[this.myEssayGroupId] || [];
    },
    activeMyEssayTopic() {
      const list = this.myEssayTopics;
      if (!list.length) {
        return { name: "", transition: "", subProcesses: [], conclusionHook: "" };
      }
      return list.find((t) => t.id === this.myEssayTopicId) || list[0];
    },
    activeMyEssayGroup() {
      return (this.myEssayData.groups || []).find((g) => g.id === this.myEssayGroupId) || (this.myEssayData.groups || [])[0] || { name: "", color: "#1c7c7d" };
    },
    calculatorValues() {
      const parse = (value) => {
        if (value === "" || value === null || value === undefined) {
          return null;
        }
        const result = Number(value);
        return Number.isFinite(result) ? result : null;
      };

      return {
        EV: parse(this.calculatorInput.EV),
        PV: parse(this.calculatorInput.PV),
        AC: parse(this.calculatorInput.AC),
        BAC: parse(this.calculatorInput.BAC)
      };
    },
    calculatorMessage() {
      if (this.activeDomain.id !== "cost") {
        return "";
      }

      const { EV, PV, AC, BAC } = this.calculatorValues;
      const filled = [EV, PV, AC, BAC].filter((item) => item !== null).length;

      if (filled === 0) {
        return "输入 EV / PV / AC / BAC 后，这里会自动给出偏差、绩效指数和完工预测。";
      }

      if ([EV, PV, AC, BAC].some((item) => item !== null && item < 0)) {
        return "请输入非负数。挣值类题目通常默认使用非负金额或价值。";
      }

      if (AC === 0 || PV === 0) {
        return "AC 和 PV 不能为 0，否则 CPI / SPI 无法计算。";
      }

      return "";
    },
    calculatorResults() {
      if (this.activeDomain.id !== "cost" || this.calculatorMessage) {
        return [];
      }

      const { EV, PV, AC, BAC } = this.calculatorValues;
      if ([EV, PV, AC, BAC].some((item) => item === null)) {
        return [];
      }

      const CV = EV - AC;
      const SV = EV - PV;
      const CPI = AC === 0 ? null : EV / AC;
      const SPI = PV === 0 ? null : EV / PV;
      const EAC = CPI ? BAC / CPI : null;
      const ETC = EAC !== null ? EAC - AC : null;
      const VAC = EAC !== null ? BAC - EAC : null;

      const metrics = [
        {
          key: "CV",
          label: "CV 成本偏差",
          value: CV,
          meaning: "代表当前成本偏差。大于 0 表示节约，小于 0 表示超支。",
          judgement: CV >= 0 ? "成本健康" : "成本超支"
        },
        {
          key: "SV",
          label: "SV 进度偏差",
          value: SV,
          meaning: "代表当前进度价值偏差。大于 0 表示领先，小于 0 表示落后。",
          judgement: SV >= 0 ? "进度领先" : "进度落后"
        },
        {
          key: "CPI",
          label: "CPI 成本绩效指数",
          value: CPI,
          meaning: "代表单位成本的产出效率。大于 1 更省钱，小于 1 效率偏低。",
          judgement: CPI >= 1 ? "花得值" : "效率偏低"
        },
        {
          key: "SPI",
          label: "SPI 进度绩效指数",
          value: SPI,
          meaning: "代表进度执行效率。大于 1 更快，小于 1 表示慢于计划。",
          judgement: SPI >= 1 ? "推进顺畅" : "推进偏慢"
        },
        {
          key: "EAC",
          label: "EAC 完工估算",
          value: EAC,
          meaning: "代表若按当前成本绩效继续，项目最终预计总成本。",
          judgement: EAC <= BAC ? "预计守预算" : "预计超预算"
        },
        {
          key: "ETC",
          label: "ETC 尚需成本",
          value: ETC,
          meaning: "代表从现在到项目完工还需要投入的成本。",
          judgement: ETC >= 0 ? "可继续投入" : "数据异常"
        },
        {
          key: "VAC",
          label: "VAC 完工偏差",
          value: VAC,
          meaning: "代表完工时相对预算的结余或超支。大于 0 结余，小于 0 超支。",
          judgement: VAC >= 0 ? "可能结余" : "可能超支"
        }
      ];

      return metrics.map((item) => ({
        ...item,
        display: this.formatNumber(item.value)
      }));
    }
  },
  watch: {
    activeView() {
      if (window.innerWidth < 768) window.scrollTo({ top: 0, behavior: "smooth" });
      this.$nextTick(() => this.updateDomainNavMaxHeight());
    },
    activeModule() {
      this.$nextTick(() => this.updateDomainNavMaxHeight());
    },
    activeProcessId(newId) {
      setTimeout(() => {
        const strip = this.$refs.processStrip;
        if (!strip) return;
        const btn = strip.querySelector(`[data-pid="${newId}"]`);
        if (!btn) return;
        const stripRect = strip.getBoundingClientRect();
        const btnRect = btn.getBoundingClientRect();
        const target = strip.scrollLeft + btnRect.left - stripRect.left - 12;
        strip.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
      }, 80);
    }
  },
  mounted() {
    this._countdownTimer = setInterval(() => { this.nowTimestamp = Date.now(); }, 1000);
    document.addEventListener("click", this.handleGlobalClick);
    this._onResizeForDomainNav = () => this.updateDomainNavMaxHeight();
    window.addEventListener("resize", this._onResizeForDomainNav);
    this.$nextTick(() => this.updateDomainNavMaxHeight());
  },
  beforeUnmount() {
    clearInterval(this._countdownTimer);
    document.removeEventListener("click", this.handleGlobalClick);
    window.removeEventListener("resize", this._onResizeForDomainNav);
  },
  methods: {
    updateDomainNavMaxHeight() {
      const aside = document.querySelector(".domain-aside-sticky");
      const nav = aside ? aside.querySelector(".domain-nav-scroll") : null;
      if (!aside || !nav) return;

      // 仅在桌面侧边栏生效，移动端不需要限制。
      if (window.innerWidth < 1024) {
        aside.style.removeProperty("--domain-nav-max-height");
        return;
      }

      const navRect = nav.getBoundingClientRect();
      const bottomGap = 16;
      const available = Math.floor(window.innerHeight - navRect.top - bottomGap);
      aside.style.setProperty("--domain-nav-max-height", `${Math.max(180, available)}px`);
    },
    selectModuleFromFab(moduleId) {
      this.selectModule(moduleId);
      this.moduleSheetOpen = false;
    },
    selectModule(moduleId) {
      this.activeModule = moduleId;
      if (moduleId === "essay") {
        return;
      }
      this.$nextTick(() => {
        if (!this.visibleViews.find((v) => v.id === this.activeView)) {
          this.activeView = "study";
        }
      });
      const firstDomain = this.visibleDomains[0];
      if (firstDomain) {
        this.activeDomainId = firstDomain.id;
        const firstProc = (firstDomain.processes || [])[0];
        this.activeProcessId = firstProc ? firstProc.id : "";
        if (firstProc) {
          this.markLearned(firstProc.id);
        }
      }
      this.flippedKeywords = {};
      this.blindFillRevealed = {};
      this.quizSubMode = "quiz";
      this.matcherPairs = [];
      this.matcherLeftItems = [];
      this.matcherRightItems = [];
      this.matcherLeftSel = null;
      this.matcherRightSel = null;
      this.matcherMatchedIds = [];
      this.matcherWrong = false;
      this.pgFilterDomain = "all";
      if (window.innerWidth < 768) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    },
    essayBasicLabel(key) {
      const map = {
        wordCount: "字数",
        duration: "时长",
        topicCount: "选题数",
        passLine: "及格线",
        scoring: "评分权重",
        strategy: "选题策略"
      };
      return map[key] || key;
    },
    selectMyEssayGroup(groupId) {
      this.myEssayGroupId = groupId;
      const list = (this.myEssayData.topics || {})[groupId] || [];
      this.myEssayTopicId = list.length ? list[0].id : "";
      this.myEssayCopied = "";
    },
    selectMyEssayTopic(topicId) {
      this.myEssayTopicId = topicId;
      this.myEssayCopied = "";
    },
    copyMyEssayText(text, tag) {
      if (!text) return;
      const fallback = () => {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch (e) { }
        document.body.removeChild(ta);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(fallback);
      } else {
        fallback();
      }
      this.myEssayCopied = tag || "copied";
      setTimeout(() => {
        if (this.myEssayCopied === (tag || "copied")) this.myEssayCopied = "";
      }, 1500);
    },
    phraseLabel(key) {
      const map = {
        opening: "开篇句",
        transition: "过渡句",
        concluding: "收尾句",
        quantifyLines: "量化效果句"
      };
      return map[key] || key;
    },
    handleGlobalClick(e) {
      if (!e.target.closest(".search-wrapper") && !e.target.closest(".search-dropdown")) {
        this.searchFocused = false;
      }
    },
    onSearchFocus() {
      this.searchFocused = true;
      this.$nextTick(() => {
        const el = this.$refs.searchWrapper;
        if (el) this.searchWrapperRect = el.getBoundingClientRect();
      });
    },
    selectSearchResult(result) {
      this.searchQuery = "";
      this.searchFocused = false;
      this.navigateToProcess(result.domainId, result.id);
    },
    toggleBlindFill() {
      this.blindFillMode = !this.blindFillMode;
      this.blindFillRevealed = {};
    },
    revealField(key) {
      this.blindFillRevealed = { ...this.blindFillRevealed, [key]: true };
    },
    isBlindHidden(key) {
      return this.blindFillMode && !this.blindFillRevealed[key];
    },
    flipKeyword(idx) {
      this.flippedKeywords = { ...this.flippedKeywords, [idx]: !this.flippedKeywords[idx] };
    },
    shuffleKeywords() {
      this.flippedKeywords = {};
    },
    startMatcher() {
      const ct = this.activeDomain.cardType || "itto";
      const firstItemText = (p) => {
        if (ct === "law") {
          const kv = (p.keyNumbers || [])[0];
          if (kv) return kv.label ? `${kv.label}：${kv.value}` : kv.value;
          return (p.coreProvisions || [])[0] || (p.prohibitions || [])[0] || "";
        }
        if (ct === "concept") {
          return (p.applications || [])[0] || (p.essentials || [])[0] || "";
        }
        return (p.outputs || [])[0] || "";
      };
      const procs = this.activeDomain.processes.filter((p) => !!firstItemText(p));
      const pool = [...procs].sort(() => Math.random() - 0.5).slice(0, Math.min(5, procs.length));
      const pairs = pool.map((p, i) => ({ id: i, process: p.name, output: firstItemText(p) }));
      this.matcherPairs = pairs;
      this.matcherLeftItems = [...pairs].sort(() => Math.random() - 0.5);
      this.matcherRightItems = [...pairs].sort(() => Math.random() - 0.5);
      this.matcherLeftSel = null;
      this.matcherRightSel = null;
      this.matcherMatchedIds = [];
      this.matcherWrong = false;
      this.quizSubMode = "matcher";
    },
    selectMatcherLeft(idx) {
      if (this.matcherMatchedIds.includes(this.matcherLeftItems[idx].id)) return;
      this.matcherLeftSel = idx;
      this.matcherWrong = false;
      if (this.matcherRightSel !== null) this.checkMatcherPair();
    },
    selectMatcherRight(idx) {
      if (this.matcherMatchedIds.includes(this.matcherRightItems[idx].id)) return;
      this.matcherRightSel = idx;
      this.matcherWrong = false;
      if (this.matcherLeftSel !== null) this.checkMatcherPair();
    },
    checkMatcherPair() {
      const leftId = this.matcherLeftItems[this.matcherLeftSel].id;
      const rightId = this.matcherRightItems[this.matcherRightSel].id;
      if (leftId === rightId) {
        this.matcherMatchedIds = [...this.matcherMatchedIds, leftId];
        this.matcherLeftSel = null;
        this.matcherRightSel = null;
      } else {
        this.matcherWrong = true;
        setTimeout(() => {
          this.matcherLeftSel = null;
          this.matcherRightSel = null;
          this.matcherWrong = false;
        }, 600);
      }
    },
    navigateToProcess(domainId, processId) {
      this.activeDomainId = domainId;
      this.activeProcessId = processId;
      this.activeView = "study";
      this.markLearned(processId);
      this.$nextTick(() => {
        const el = document.querySelector(".study-card");
        if (!el) return;
        const top = window.scrollY + el.getBoundingClientRect().top - 80;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      });
    },
    goProcess(delta) {
      const idx = this.currentProcessIndex + delta;
      const processes = this.activeDomain.processes;
      if (idx >= 0 && idx < processes.length) {
        this.selectProcess(processes[idx].id);
      }
    },
    goDomain(delta) {
      const domains = this.visibleDomains;
      const idx = domains.findIndex((d) => d.id === this.activeDomainId);
      const next = domains[idx + delta];
      if (next) this.selectDomain(next.id);
    },
    selectDomain(domainId) {
      this.activeDomainId = domainId;
      const nextProcess = this.activeDomain.processes[0];
      this.activeProcessId = nextProcess ? nextProcess.id : "";
      if (nextProcess) {
        this.markLearned(nextProcess.id);
      }
      if (this.activeView === "processGroup") {
        this.pgFilterDomain = domainId;
      }
      // 切换知识域时重置所有视图相关状态
      this.flippedKeywords = {};
      this.blindFillRevealed = {};
      this.quizSubMode = "quiz";
      this.matcherPairs = [];
      this.matcherLeftItems = [];
      this.matcherRightItems = [];
      this.matcherLeftSel = null;
      this.matcherRightSel = null;
      this.matcherMatchedIds = [];
      this.matcherWrong = false;
      if (window.innerWidth < 768) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      this.$nextTick(() => {
        const bar = this.$refs.domainPillBar;
        if (!bar) return;
        const btn = bar.querySelector(`[data-domain-id="${domainId}"]`);
        if (btn) {
          bar.scrollTo({ left: btn.offsetLeft - 12, behavior: "smooth" });
        }
        this.updateDomainNavMaxHeight();
      });
    },
    selectProcess(processId) {
      this.activeProcessId = processId;
      this.markLearned(processId);
      // 切换过程时重置盲填已揭示状态
      this.blindFillRevealed = {};
    },
    processNodeClass(processId) {
      return {
        "process-node-current": this.activeProcessId === processId,
        "process-node-learned": this.learnedProcessIds.includes(processId) && this.activeProcessId !== processId
      };
    },
    markLearned(processId) {
      if (!this.learnedProcessIds.includes(processId)) {
        this.learnedProcessIds.push(processId);
      }
    },
    visibleList(items) {
      if (!Array.isArray(items)) {
        return [];
      }
      return this.densityMode === "core" ? items.slice(0, 2) : items;
    },
    domainGradient(color) {
      return `linear-gradient(135deg, ${color}, #123c4b)`;
    },
    formatNumber(value) {
      if (value === null || value === undefined || Number.isNaN(value)) {
        return "--";
      }
      return Number(value).toFixed(Math.abs(value) >= 100 ? 1 : 2);
    }
  }
}).mount("#app");
