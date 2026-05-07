const { createApp } = Vue;

/**
 * 将 zonghe_1.md 等格式的题库文本解析为 quiz 数组
 * 支持的格式：
 *   数字、 *[单选]* 或 数字、[单选] 题目（题干可续到下一行，遇选项/答案/解析为止）
 *   -  A： 或  A： 选项（行首空格 + 字母 + 全角/半角冒号）
 *   正确答案：**X** 或 正确答案：X
 *   解析：解析内容…
 */
function parsePracticeMarkdown(text) {
  const questions = [];
  // 按题号切割：行首数字 + 顿号/逗号/点
  const blocks = text.split(/\n(?=\d+[、，,.]\s)/);

  function stripTypeFromFirstLine(s) {
    return s
      .replace(/^\d+[、，,.]\s*/, "")
      .replace(/\*\[[^\]]+\]\*\s*/, "")
      .replace(/\[[^\]]+\]\s*/, "")
      .trim();
  }

  function optionFromLine(line) {
    const mDash = line.match(/^-+\s*([A-Za-z])[：:]\s*(.+)/);
    if (mDash) return { letter: mDash[1], text: mDash[2].trim() };
    const mSpace = line.match(/^\s+([A-Za-z])[：:]\s*(.+)/);
    if (mSpace && !/^\s*正确答案[：:]/.test(line)) return { letter: mSpace[1], text: mSpace[2].trim() };
    return null;
  }

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed || !/^\d+/.test(trimmed)) continue;

    const lines = trimmed.split("\n");

    const typeMatch =
      (lines[0] || "").match(/\*\[([^\]]+)\]\*/) || (lines[0] || "").match(/\[([^\]]+)\]/);
    const type = typeMatch ? typeMatch[1] + "题" : "单选题";

    let firstStem = stripTypeFromFirstLine(lines[0] || "");
    const stemParts = [];
    if (firstStem) stemParts.push(firstStem);
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const t = line.trim();
      if (/^正确答案[：:]/.test(t) || /^解析[：:]/.test(t)) break;
      if (optionFromLine(line)) break;
      stemParts.push(line.trimEnd());
    }
    const question = stemParts.join("\n").trim();

    const options = [];
    for (const line of lines) {
      const o = optionFromLine(line);
      if (o) options.push(`${o.letter}. ${o.text}`);
    }

    const ansBold = trimmed.match(/正确答案[：:]\s*\*\*([^*]+)\*\*/);
    const ansPlain = trimmed.match(/正确答案[：:]\s*([A-Za-z])(?=\s|\n|$)/);
    const answer = (ansBold ? ansBold[1] : ansPlain ? ansPlain[1] : "").trim();

    // 解析（"解析：" 之后的所有内容，去掉行首的图片链接）
    const analysisMatch = trimmed.match(/解析[：:]([^]*)/);
    const analysis = analysisMatch
      ? analysisMatch[1]
          .replace(/!\[[^\]]*\]\([^)]*\)/g, "")  // 去图片
          .replace(/\n{3,}/g, "\n\n")
          .trim()
      : "";

    // 考点（从解析首句提取，供 relatedProcess 用）
    const processMatch = analysis.match(/考点[^：:是]*[：:是]([^。\n]{2,25})/);
    const relatedProcess = processMatch
      ? processMatch[1]
          .replace(/[。.，,].*/, "")
          .replace(/^(该题目考察的是|本题考察的是|题目考察的是|该题考察的是|考察的是)\s*/i, "")
          .trim()
      : "";

    if (question && options.length > 0) {
      questions.push({ question, type, options, answer, analysis, relatedProcess });
    }
  }

  return questions;
}

function normalizeQuizAnswerKey(s) {
  const t = String(s || "").trim().toUpperCase();
  if (!t) return "";
  const m = t.match(/[A-Z]/);
  return m ? m[0] : "";
}

function extractQuizOptionLetter(optionLine) {
  const m = String(optionLine || "").match(/^([A-Za-z])[.．:：\s]/);
  return m ? m[1].toUpperCase() : "";
}

function newPracticeAttemptId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "at-" + Date.now() + "-" + Math.random().toString(36).slice(2, 9);
}

const NAV_STORAGE_KEY = "jiyiqi-nav-v1";
const FAVORITES_STORAGE_KEY = "jiyiqi-favorites-v1";
const CAT_STORAGE_KEY = "jiyiqi-cat-v1";
/** 解析朗读：锁定同一中文声线，避免 getVoices() 顺序变化导致男声/女声乱跳 */
const QUIZ_TTS_VOICE_STORAGE_KEY = "jiyiqi-quiz-tts-voice-uri-v1";
/** 练习场按套卷记录的交卷历史（分数、选项快照），供阅卷与后续错题聚合 */
const PRACTICE_ATTEMPTS_STORAGE_KEY = "jiyiqi-practice-attempts-v1";
/** 练习场：外部导入的“我的答案”配置（不写进题库 Markdown，避免影响解析阅读） */
const PRACTICE_USER_ANS_STORAGE_KEY = "jiyiqi-practice-user-answers-v1";
const PRACTICE_ACTIVE_USER_STORAGE_KEY = "jiyiqi-practice-active-user-v1";
const PRACTICE_PROFILES_SEED_URL = "data/export_my_answers_and_history.json";
const PROJECT_CACHE_KEYS = [NAV_STORAGE_KEY, FAVORITES_STORAGE_KEY, QUIZ_TTS_VOICE_STORAGE_KEY, PRACTICE_ATTEMPTS_STORAGE_KEY, PRACTICE_USER_ANS_STORAGE_KEY, PRACTICE_ACTIVE_USER_STORAGE_KEY];
/** 综合题侧栏「错题集」虚拟套卷 id（非 practiceSets 配置项） */
const COMPREHENSIVE_WRONG_BOOK_ID = "__wrongbook__";

function normalizeTtsLang(lang) {
  return String(lang || "").replace("_", "-").toLowerCase();
}

function isZhTtsVoice(v) {
  const lang = normalizeTtsLang(v.lang);
  if (lang === "zh-cn" || lang === "zh-hk" || lang === "zh-tw" || lang === "cmn-cn") return true;
  return /^zh(-|$)/.test(lang);
}

/**
 * 返回排序键 [tier, name]，tier 越小越优先（倾向常见女声 / 普通话 / 高质量标识）
 */
function quizTtsVoiceSortKey(v) {
  const blob = `${v.name || ""} ${v.voiceURI || ""}`.toLowerCase();
  let tier = 50;
  const femaleHints = [
    "huihui", "yaoyao", "xiaoxuan", "xiaoyi", "xiaomo", "xiaorui", "xiaochen",
    "ting-ting", "tingting", "meijia", "shelley"
  ];
  const maleHints = ["kangkang", "yunyang", "sinji", "liang", "dafeng", "male", "男"];
  if (femaleHints.some((h) => blob.includes(h))) tier -= 10;
  if (maleHints.some((h) => blob.includes(h))) tier += 14;
  if (/cantonese|yue|粵|hongkong|香港/.test(blob)) tier += 5;
  const lang = normalizeTtsLang(v.lang);
  if (lang === "zh-cn" || lang === "cmn-cn") tier -= 3;
  if (/google|premium|enhanced|neural|wavenet/.test(blob)) tier -= 4;
  return [tier, v.name || ""];
}

function pickQuizZhVoice(synth, savedUri) {
  const zh = synth.getVoices().filter(isZhTtsVoice);
  if (!zh.length) return null;
  if (savedUri) {
    const hit = zh.find((vv) => vv.voiceURI === savedUri);
    if (hit) return hit;
  }
  return [...zh].sort((a, b) => {
    const ka = quizTtsVoiceSortKey(a);
    const kb = quizTtsVoiceSortKey(b);
    if (ka[0] !== kb[0]) return ka[0] - kb[0];
    return ka[1].localeCompare(kb[1], "zh");
  })[0];
}

/** 单条 utterance 过长时部分浏览器会卡顿或中断，按标点切成多段队列播放 */
const QUIZ_TTS_CHUNK_MAX = 200;
const QUIZ_TTS_CHUNK_MIN_BREAK = 28;

function buildQuizTtsChunks(plain) {
  const t = String(plain || "").trim();
  if (!t) return { chunks: [], starts: [] };
  if (t.length <= QUIZ_TTS_CHUNK_MAX) {
    return { chunks: [t], starts: [0] };
  }
  const chunks = [];
  let i = 0;
  const n = t.length;
  while (i < n) {
    let end = Math.min(i + QUIZ_TTS_CHUNK_MAX, n);
    if (end < n) {
      const win = t.slice(i, end);
      let cut = -1;
      for (const delim of ["。", "！", "？", "…"]) {
        const pos = win.lastIndexOf(delim);
        if (pos >= QUIZ_TTS_CHUNK_MIN_BREAK) cut = Math.max(cut, pos);
      }
      if (cut >= 0) {
        end = i + cut + 1;
      } else {
        const comma = win.lastIndexOf("，");
        if (comma >= QUIZ_TTS_CHUNK_MIN_BREAK) {
          end = i + comma + 1;
        } else {
          const semi = win.lastIndexOf("；");
          if (semi >= QUIZ_TTS_CHUNK_MIN_BREAK) end = i + semi + 1;
        }
      }
    }
    chunks.push(t.slice(i, end));
    i = end;
  }
  let acc = 0;
  const starts = chunks.map((c) => {
    const s = acc;
    acc += c.length;
    return s;
  });
  if (acc !== t.length) {
    return { chunks: [t], starts: [0] };
  }
  return { chunks, starts };
}

function visibleViewIdsForModule(moduleId, knowledgeData, views) {
  const domains = Object.values(knowledgeData || {}).filter((d) => (d.module || "pm") === moduleId);
  const has = (field) => domains.some((d) => {
    const val = d[field];
    return Array.isArray(val) ? val.length > 0 : !!val;
  });
  return views
    .filter((v) => {
      if (v.id === "formula") return has("formulas");
      if (v.id === "scenario") return has("actionFlows");
      return true;
    })
    .map((v) => v.id);
}

function loadPersistedNavState(ctx) {
  const {
    modules,
    essayTabs,
    views,
    knowledgeData,
    practiceSets,
    myEssayData,
    defaults
  } = ctx;
  let raw = null;
  try {
    raw = JSON.parse(localStorage.getItem(NAV_STORAGE_KEY) || "null");
  } catch (e) {
    return null;
  }
  if (!raw || raw.v !== 1) return null;

  const moduleIds = new Set(modules.map((m) => m.id));
  let activeModule = raw.activeModule;
  if (!moduleIds.has(activeModule)) activeModule = defaults.activeModule;

  if (activeModule === "essay") {
    const tabOk = essayTabs.some((t) => t.id === raw.activeEssayTab);
    let myEssayGroupId = typeof raw.myEssayGroupId === "string" ? raw.myEssayGroupId : defaults.myEssayGroupId;
    let myEssayTopicId = typeof raw.myEssayTopicId === "string" ? raw.myEssayTopicId : defaults.myEssayTopicId;
    const groups = Object.keys(myEssayData.topics || {});
    if (!groups.includes(myEssayGroupId)) myEssayGroupId = groups[0] || "knowledge";
    const tlist = (myEssayData.topics || {})[myEssayGroupId] || [];
    if (!tlist.some((t) => t.id === myEssayTopicId)) {
      myEssayTopicId = tlist[0]?.id || "";
    }
    return {
      activeModule: "essay",
      activeEssayTab: tabOk ? raw.activeEssayTab : "basics",
      myEssayGroupId,
      myEssayTopicId,
      quizTtsRate: [1, 1.25, 1.5].includes(Number(raw.quizTtsRate)) ? Number(raw.quizTtsRate) : 1
    };
  }

  const domainList = Object.values(knowledgeData || {}).filter((d) => (d.module || "pm") === activeModule);
  const domainIds = new Set(domainList.map((d) => d.id));
  let activeDomainId = raw.activeDomainId;
  if (!domainIds.has(activeDomainId)) {
    activeDomainId = domainList[0]?.id || defaults.activeDomainId;
  }
  const domain = knowledgeData[activeDomainId] || domainList[0] || { processes: [] };
  const procIds = new Set((domain.processes || []).map((p) => p.id));
  let activeProcessId = raw.activeProcessId;
  if (!procIds.has(activeProcessId)) {
    activeProcessId = (domain.processes || [])[0]?.id || "";
  }

  const allowedViews = new Set(visibleViewIdsForModule(activeModule, knowledgeData, views));
  let activeView = raw.activeView;
  if (!allowedViews.has(activeView)) activeView = "study";

  const layers = new Set(["domain", "comprehensive", "mock"]);
  let practiceLayer = raw.practiceLayer;
  if (!layers.has(practiceLayer)) practiceLayer = "domain";

  const comp = practiceSets.comprehensive || [];
  const mock = practiceSets.mock || [];
  let activeComprehensiveId = raw.activeComprehensiveId;
  const persistedWrongBook = activeComprehensiveId === COMPREHENSIVE_WRONG_BOOK_ID;
  if (!persistedWrongBook && !comp.some((s) => s.id === activeComprehensiveId)) {
    activeComprehensiveId = comp[0]?.id || defaults.activeComprehensiveId;
  }
  let activeMockId = raw.activeMockId;
  if (!mock.some((s) => s.id === activeMockId)) {
    activeMockId = mock[0]?.id || defaults.activeMockId;
  }

  let quizSubMode = raw.quizSubMode === "matcher" ? "matcher" : "quiz";
  if (quizSubMode === "matcher") quizSubMode = "quiz";

  let pgFilterDomain = raw.pgFilterDomain;
  if (pgFilterDomain !== "all" && !domainIds.has(pgFilterDomain)) pgFilterDomain = "all";

  const quizAnswersGlobalShow = raw.quizAnswersGlobalShow !== false;

  let quizAnswerPeek = {};
  if (raw.quizAnswerPeek && typeof raw.quizAnswerPeek === "object" && !Array.isArray(raw.quizAnswerPeek)) {
    quizAnswerPeek = { ...raw.quizAnswerPeek };
  }

  let learnedProcessIds = null;
  if (Array.isArray(raw.learnedProcessIds)) {
    const allProc = new Set();
    domainList.forEach((d) => {
      (d.processes || []).forEach((p) => {
        if (p.id) allProc.add(p.id);
      });
    });
    learnedProcessIds = raw.learnedProcessIds
      .filter((id) => typeof id === "string" && allProc.has(id))
      .slice(0, 400);
  }

  return {
    activeModule,
    activeDomainId,
    activeProcessId,
    activeView,
    practiceLayer,
    activeComprehensiveId,
    activeMockId,
    quizSubMode,
    pgFilterDomain,
    quizAnswersGlobalShow,
    quizAnswerPeek,
    learnedProcessIds,
    quizTtsRate: [1, 1.25, 1.5].includes(Number(raw.quizTtsRate)) ? Number(raw.quizTtsRate) : 1
  };
}

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
    const practiceSetsBootstrap = window.practiceSets || { comprehensive: [], mock: [] };
    const compFirstId = (practiceSetsBootstrap.comprehensive && practiceSetsBootstrap.comprehensive[0] && practiceSetsBootstrap.comprehensive[0].id) || "";
    const mockFirstId = (practiceSetsBootstrap.mock && practiceSetsBootstrap.mock[0] && practiceSetsBootstrap.mock[0].id) || "";
    const knowledgeDataBootstrap = window.knowledgeData || {};
    const myEssayBootstrap = window.myEssayData || { projectOverview: { title: "", content: "" }, wordRequirements: { sections: [] }, groups: [], topics: { knowledge: [], performance: [] }, conclusionTemplate: { outline: [] } };
    const defEssayTopics = (myEssayBootstrap.topics || {}).knowledge || [];
    const defEssayTopicId = defEssayTopics[0]?.id || "integration";

    const views = [
      { id: "processGroup", label: "总览", desc: "总览" },
      { id: "study", label: "学习卡", desc: "过程 + 记忆卡" },
      { id: "compare", label: "概念对比", desc: "高频易混项" },
      { id: "formula", label: "公式看板", desc: "按知识域筛选" },
      { id: "keyword", label: "关键词", desc: "题目密码词速查" },
      { id: "scenario", label: "场景演练", desc: "案例分析动作流" },
      { id: "quiz", label: "练习场", desc: "题库 + 连连看" }
    ];

    const persisted = loadPersistedNavState({
      modules,
      essayTabs,
      views,
      knowledgeData: knowledgeDataBootstrap,
      practiceSets: practiceSetsBootstrap,
      myEssayData: myEssayBootstrap,
      defaults: {
        activeModule: "pm",
        activeDomainId: firstDomain.id || "",
        activeComprehensiveId: compFirstId,
        activeMockId: mockFirstId,
        myEssayGroupId: "knowledge",
        myEssayTopicId: defEssayTopicId
      }
    });

    const base = {
      knowledgeData: knowledgeDataBootstrap,
      essayData: window.essayData || { name: "论文专区", summary: "", examBasics: {}, structure: { sections: [] }, scoringCriteria: [], commonMistakes: [], domainPoints: [], projectTemplates: [], phrases: {}, pastTopics: [], writingTips: [] },
      myEssayData: myEssayBootstrap,
      modules,
      essayTabs,
      activeModule: "pm",
      activeEssayTab: "basics",
      myEssayGroupId: "knowledge",
      myEssayTopicId: defEssayTopicId,
      myEssayCopied: "",
      views,
      activeDomainId: firstDomain.id || "",
      activeProcessId: firstProcess.id || "",
      activeView: "study",
      quizMode: "single",
      densityMode: "full",
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
      ],
      practiceLayer: "domain",
      activeComprehensiveId: compFirstId,
      activeMockId: mockFirstId,
      quizAnswersGlobalShow: true,
      /** 浏览题库：全部 / 只看错题 / 只对题（依据题干解析出的「你的答案」） */
      practiceBrowseResultFilter: "all",
      quizAnswerPeek: {},
      /** 练习场题库：与滚动/最近点击同步的题号（0-based，用于移动端题数徽标） */
      practiceQuizActiveIndex: 0,
      /** 移动端：用户正在滚动页面时为 true，显示题数；静止后为 false，浮块变为「回顶部」 */
      practiceQuizFabScrolling: false,
      /** 当前视口下页面是否出现纵向滚动条 */
      practiceQuizFabNeedsScroll: false,
      /** 与练习场同步的视口滚动距离，用于判断「已离开页顶」才显示回顶 */
      practiceQuizScrollY: 0,
      comprehensiveWrongBookId: COMPREHENSIVE_WRONG_BOOK_ID,
      /** 错题集：进入时打乱后的题目快照（不含 _originIndex，由 practiceQuizBaseRows 统一编号） */
      practiceWrongBookSnapshot: null,
      /** 再做一次·只做错题：交卷用的题单子集（为 null 表示整套） */
      practiceExamSubsetRows: null,
      /** 再做方式选择弹窗 */
      practiceRestartPickerOpen: false,
      /** 历史记录选择弹窗 */
      practiceHistoryPickerOpen: false,
      /** 做题中：题号概览面板 */
      practiceExamNavOpen: false,
      /** 做题模式：在浏览之上套一层考试流程；交卷写入 practiceAttemptLog */
      practiceExamActive: false,
      practiceExamRunning: false,
      practiceExamChoices: {},
      /** 阅卷查看：空字符串表示该套卷「最新一次」记录 */
      practiceExamSelectedHistoryId: "",
      /** { [quizBundleKey]: Attempt[] } */
      practiceAttemptLog: {},
      /** 外部导入的我的答案：{ [setKey]: { [originIndex]: 'A'|'B'|'C'|'D' } } */
      practiceUserAnswers: {},
      /** 当前练习用户（用于初始化入口展示与导入落位） */
      activePracticeUserId: "bovia",
      practiceSetCache: {},    // { [set.id]: quiz[] }，首次访问时同步解析并缓存
      quizTtsPlayingIndex: null, // 当前朗读中的题目索引（题库解析 TTS）
      quizTtsRate: 1, // 解析朗读倍速：1 / 1.25 / 1.5（Web Speech API utter.rate）
      favoritesOpen: false,
      favorites: [],
      favoritesFilter: "all",
      newFavoriteNote: "",
      favoritingQuestionKey: "",
      favoritesCompact: true,
      favoriteExpandedId: "",
      favoriteEntryAnimating: false,
      favoritesMenuOpen: false,
      projectConfigMenuOpen: false,
      catVisible: true,
      catDocked: false,
      catDragging: false,
      catX: 16,
      catY: 220,
      catTargetX: 16,
      catTargetY: 220,
      catSpeed: 90,
      catPauseUntil: 0,
      catState: "run",
      catFacing: 1
    };

    if (persisted) {
      if (persisted.activeModule === "essay") {
        base.activeModule = "essay";
        base.activeEssayTab = persisted.activeEssayTab;
        base.myEssayGroupId = persisted.myEssayGroupId;
        base.myEssayTopicId = persisted.myEssayTopicId;
        base.quizTtsRate = persisted.quizTtsRate;
      } else {
        Object.assign(base, {
          activeModule: persisted.activeModule,
          activeDomainId: persisted.activeDomainId,
          activeProcessId: persisted.activeProcessId,
          activeView: persisted.activeView,
          practiceLayer: persisted.practiceLayer,
          activeComprehensiveId: persisted.activeComprehensiveId,
          activeMockId: persisted.activeMockId,
          quizSubMode: persisted.quizSubMode,
          pgFilterDomain: persisted.pgFilterDomain,
          quizAnswersGlobalShow: persisted.quizAnswersGlobalShow,
          quizAnswerPeek: persisted.quizAnswerPeek,
          quizTtsRate: persisted.quizTtsRate
        });
        if (persisted.learnedProcessIds && persisted.learnedProcessIds.length) {
          base.learnedProcessIds = persisted.learnedProcessIds;
        }
      }
    }

    return base;
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
    practiceSetsRoot() {
      return window.practiceSets || { comprehensive: [], mock: [] };
    },
    comprehensiveSets() {
      return this.practiceSetsRoot.comprehensive || [];
    },
    mockSets() {
      return this.practiceSetsRoot.mock || [];
    },
    activeComprehensiveSet() {
      if (this.practiceLayer === "comprehensive" && this.activeComprehensiveId === this.comprehensiveWrongBookId) {
        return {
          id: this.comprehensiveWrongBookId,
          title: "错题集",
          summary: "汇总各套综合题交卷中的错题（去重），每次进入随机打乱。",
          quiz: []
        };
      }
      const list = this.comprehensiveSets;
      const hit = list.find((s) => s.id === this.activeComprehensiveId);
      return hit || list[0] || null;
    },
    activeMockSet() {
      const list = this.mockSets;
      const hit = list.find((s) => s.id === this.activeMockId);
      return hit || list[0] || null;
    },
    activePracticeSet() {
      if (this.practiceLayer === "comprehensive") return this.activeComprehensiveSet;
      if (this.practiceLayer === "mock") return this.activeMockSet;
      return null;
    },
    practiceQuizBaseRows() {
      let list = [];
      if (this.practiceLayer === "comprehensive") {
        if (this.activeComprehensiveId === this.comprehensiveWrongBookId) {
          list = Array.isArray(this.practiceWrongBookSnapshot) ? this.practiceWrongBookSnapshot : [];
        } else {
          list = this._resolveSetQuiz(this.activeComprehensiveSet);
        }
      } else if (this.practiceLayer === "mock") {
        list = this._resolveSetQuiz(this.activeMockSet);
      } else {
        list = this.activeDomain.quiz || [];
      }
      return list.map((q, idx) => ({ ...q, _originIndex: idx }));
    },
    /** 当前是否为「综合题 · 错题集」模式 */
    isComprehensiveWrongBook() {
      return this.practiceLayer === "comprehensive" && this.activeComprehensiveId === this.comprehensiveWrongBookId;
    },
    /** 错题集去重后的题目数量（侧栏角标） */
    comprehensiveWrongBookCount() {
      return this._collectWrongBookCandidatesNoShuffle().length;
    },
    /** 顶部练习条：有题或已在考试流程中则显示 */
    practiceQuizExamBarVisible() {
      return this.quizSubMode === "quiz" && (this.practiceQuizBaseRows.length > 0 || this.practiceExamActive);
    },
    /** 考试/交卷使用的题单（支持「只做本次错题」子集） */
    practiceQuizBaseRowsForExam() {
      if (this.practiceExamActive && Array.isArray(this.practiceExamSubsetRows) && this.practiceExamSubsetRows.length) {
        return this.practiceExamSubsetRows;
      }
      return this.practiceQuizBaseRows;
    },
    practiceQuizList() {
      const rows = this.practiceQuizBaseRows;
      const f = this.practiceLayer === "domain" ? "all" : this.practiceBrowseResultFilter;
      if (f === "all") return rows;
      return rows.filter((q) => {
        const u = String(q.userAnswer || "").trim().toUpperCase();
        const a = String(q.answer || "").trim().toUpperCase();
        if (!u) return false;
        if (f === "wrong") return u !== a;
        if (f === "correct") return u === a;
        return true;
      });
    },
    /** 阅卷态：筛选对象来自当前选择的历史记录（attempt），而不是题库字段 */
    practiceQuizReviewList() {
      const rows = this.practiceQuizBaseRows;
      const f = this.practiceLayer === "domain" ? "all" : this.practiceBrowseResultFilter;
      if (f === "all") return rows;
      const att = this.practiceExamDisplayAttempt;
      const answerMap = att && att.answerMap && typeof att.answerMap === "object" ? att.answerMap : {};
      const choices = att && att.choices && typeof att.choices === "object" ? att.choices : {};
      return rows.filter((q) => {
        const k = String(q._originIndex);
        const ans = normalizeQuizAnswerKey(answerMap[k] || q.answer || "");
        const user = normalizeQuizAnswerKey(choices[k] || "");
        if (!user || !ans) return false;
        if (f === "wrong") return user !== ans;
        if (f === "correct") return user === ans;
        return true;
      });
    },
    practiceHasUserAnswersForActiveSet() {
      const set = this.activePracticeSet;
      if (!set || !set.key) return false;
      const bySet = this.practiceUserAnswers && typeof this.practiceUserAnswers === "object" ? this.practiceUserAnswers[set.key] : null;
      if (!bySet || typeof bySet !== "object" || Array.isArray(bySet)) return false;
      return Object.keys(bySet).length > 0;
    },
    practicePanelTitle() {
      if (this.practiceLayer === "comprehensive" && this.activeComprehensiveSet) {
        return this.activeComprehensiveSet.title;
      }
      if (this.practiceLayer === "mock" && this.activeMockSet) {
        return this.activeMockSet.title;
      }
      return this.activeDomain.name;
    },
    /**
     * 题数/回顶：正在滚动、无滚动条、或仍在页顶 → 题数；
     * 有滚动条且已向下滚离页顶且手指停住 → 上箭头
     */
    practiceQuizShowFabProgress() {
      if (this.practiceQuizFabScrolling) return true;
      if (!this.practiceQuizFabNeedsScroll) return true;
      const topPx = 10;
      if (this.practiceQuizScrollY <= topPx) return true;
      return false;
    },
    quizBundleKey() {
      // 练习历史按“题单来源”唯一归档，避免切知识域/切套卷导致历史丢失
      const domainId = this.practiceLayer === "domain" ? this.activeDomainId : "";
      const compId = this.practiceLayer === "comprehensive" ? this.activeComprehensiveId : "";
      const mockId = this.practiceLayer === "mock" ? this.activeMockId : "";
      return [this.activeView, this.practiceLayer, domainId, compId, mockId].join("|");
    },
    /** 练习场当前展示的题单：考试模式用 base 或子集；浏览用筛选列表 */
    practiceQuizCardsForRender() {
      if (this.practiceExamRunning) return this.practiceQuizBaseRowsForExam;
      if (this.practiceExamInReview) return this.practiceQuizReviewList;
      return this.practiceQuizList;
    },
    practiceExamCardStates() {
      const cards = this.practiceQuizCardsForRender || [];
      const choices = this.practiceExamChoices && typeof this.practiceExamChoices === "object" ? this.practiceExamChoices : {};
      return cards.map((q, idx) => {
        const k = String(q._originIndex);
        const picked = normalizeQuizAnswerKey(choices[k] || "");
        return { idx, originIndex: q._originIndex, picked };
      });
    },
    practiceExamInReview() {
      return this.practiceExamActive && !this.practiceExamRunning;
    },
    practiceExamAttemptsForBundle() {
      const list = this.practiceAttemptLog[this.quizBundleKey];
      if (!Array.isArray(list)) return [];
      return list.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    },
    practiceExamResolvedAttemptId() {
      const list = this.practiceExamAttemptsForBundle;
      if (!list.length) return null;
      const sel = this.practiceExamSelectedHistoryId;
      if (sel && list.some((a) => a.id === sel)) return sel;
      return list[0].id;
    },
    practiceExamDisplayAttempt() {
      const list = this.practiceExamAttemptsForBundle;
      const id = this.practiceExamResolvedAttemptId;
      if (!id) return null;
      return list.find((a) => a.id === id) || null;
    },
    practicePanelLiveLabel() {
      if (this.practiceExamRunning) return "做题中ing";
      // 只在“阅卷/历史查看”状态展示记录名；普通浏览永远叫「练习场」
      if (this.practiceExamInReview) {
        const att = this.practiceExamDisplayAttempt;
        if (att) return this.practiceAttemptRecordName(att.id);
        return "做题记录";
      }
      return "练习场";
    },
    practiceExamHistorySelectModel: {
      get() {
        const sel = this.practiceExamSelectedHistoryId;
        if (!sel) return "__latest__";
        return sel;
      },
      set(v) {
        this.practiceExamSelectedHistoryId = v === "__latest__" ? "" : v;
      }
    },
    navPersistSignature() {
      return JSON.stringify({
        activeModule: this.activeModule,
        activeView: this.activeView,
        practiceLayer: this.practiceLayer,
        activeDomainId: this.activeDomainId,
        activeProcessId: this.activeProcessId,
        activeComprehensiveId: this.activeComprehensiveId,
        activeMockId: this.activeMockId,
        quizSubMode: this.quizSubMode,
        activeEssayTab: this.activeEssayTab,
        myEssayGroupId: this.myEssayGroupId,
        myEssayTopicId: this.myEssayTopicId,
        pgFilterDomain: this.pgFilterDomain,
        quizAnswersGlobalShow: this.quizAnswersGlobalShow,
        quizAnswerPeek: this.quizAnswerPeek,
        learnedProcessIds: this.learnedProcessIds,
        quizTtsRate: this.quizTtsRate
      });
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
    },
    favoriteCount() {
      return this.favorites.length;
    },
    filteredFavorites() {
      const list = [...this.favorites].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      if (this.favoritesFilter === "all") return list;
      return list.filter((x) => x.type === this.favoritesFilter);
    }
  },
  watch: {
    activeView() {
      if (this.activeView !== "quiz") {
        if (this.practiceExamActive) this.exitPracticeExam();
        if (window.speechSynthesis) {
          this._bumpQuizTtsGenAndCancel();
          this._clearQuizTtsUi();
        }
      }
      if (window.innerWidth < 768) window.scrollTo({ top: 0, behavior: "smooth" });
      this.$nextTick(() => this.updateDomainNavMaxHeight());
      this._syncPracticeQuizScrollListener();
    },
    quizSubMode() {
      if (this.quizSubMode !== "quiz" && this.practiceExamActive) this.exitPracticeExam();
      this._syncPracticeQuizScrollListener();
    },
    practiceLayer() {
      this._syncPracticeQuizScrollListener();
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
    },
    quizBundleKey: {
      handler(_newKey, oldKey) {
        if (oldKey === undefined) return;
        if (this.practiceExamActive) this.exitPracticeExam();
        this.quizAnswerPeek = {};
        this.practiceQuizActiveIndex = 0;
        this.$nextTick(() => {
          this._updatePracticeQuizActiveIndexFromLayout();
          this._updatePracticeQuizFabNeedsScroll();
        });
      }
    },
    practiceBrowseResultFilter() {
      this.quizAnswerPeek = {};
      this.practiceQuizActiveIndex = 0;
      this.$nextTick(() => {
        this._updatePracticeQuizActiveIndexFromLayout();
        this._updatePracticeQuizFabNeedsScroll();
      });
    },
    quizAnswersGlobalShow() {
      this.$nextTick(() => this._updatePracticeQuizFabNeedsScroll());
    },
    quizAnswerPeek: {
      handler() {
        if (this.activeView !== "quiz" || this.quizSubMode !== "quiz") return;
        this.$nextTick(() => this._updatePracticeQuizFabNeedsScroll());
      },
      deep: true
    },
    navPersistSignature() {
      if (this._persistNavTimer) clearTimeout(this._persistNavTimer);
      this._persistNavTimer = setTimeout(() => {
        this._persistNavTimer = null;
        this.persistNavState();
      }, 120);
    }
  },
  mounted() {
    this._countdownTimer = setInterval(() => { this.nowTimestamp = Date.now(); }, 1000);
    document.addEventListener("click", this.handleGlobalClick);
    this._onResizeForDomainNav = () => {
      this.updateDomainNavMaxHeight();
      this._updatePracticeQuizActiveIndexFromLayout();
      this._updatePracticeQuizFabNeedsScroll();
      if (this.activeView === "quiz" && this.quizSubMode === "quiz") {
        this.practiceQuizScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      }
    };
    window.addEventListener("resize", this._onResizeForDomainNav);
    this._onBeforeUnloadPersist = () => {
      if (this._persistNavTimer) clearTimeout(this._persistNavTimer);
      this.persistNavState();
    };
    window.addEventListener("beforeunload", this._onBeforeUnloadPersist);
    if (window.speechSynthesis) {
      this._warmQuizTtsVoices = () => {
        try {
          window.speechSynthesis.getVoices();
        } catch (e) {
          /* ignore */
        }
      };
      window.speechSynthesis.addEventListener("voiceschanged", this._warmQuizTtsVoices);
      this._warmQuizTtsVoices();
    }
    this.$nextTick(() => {
      this.updateDomainNavMaxHeight();
      this._syncPracticeQuizScrollListener();
    });
    this._loadFavorites();
    this._loadPracticeActiveUser();
    this._loadPracticeAttemptLog();
    this._loadPracticeUserAnswers();
    if (
      this.activeView === "quiz" &&
      this.practiceLayer === "comprehensive" &&
      this.activeComprehensiveId === this.comprehensiveWrongBookId
    ) {
      this.practiceWrongBookSnapshot = this._buildWrongBookCandidatesShuffled();
    }
    this._loadCatSettings();
    this._onCatDragMove = (e) => this.handleCatDragMove(e);
    this._onCatDragEnd = () => this.endCatDrag();
    window.addEventListener("mousemove", this._onCatDragMove);
    window.addEventListener("mouseup", this._onCatDragEnd);
    window.addEventListener("touchmove", this._onCatDragMove, { passive: false });
    window.addEventListener("touchend", this._onCatDragEnd);
    window.addEventListener("touchcancel", this._onCatDragEnd);
    this._catLastTs = 0;
    this._planNextCatBehavior(performance.now(), false);
    this._catRaf = requestAnimationFrame((ts) => this._tickCatRoam(ts));
  },
  beforeUnmount() {
    this._detachPracticeQuizScrollListener();
    if (this._persistNavTimer) clearTimeout(this._persistNavTimer);
    if (this._onBeforeUnloadPersist) {
      window.removeEventListener("beforeunload", this._onBeforeUnloadPersist);
    }
    if (window.speechSynthesis) {
      this._bumpQuizTtsGenAndCancel();
      this._clearQuizTtsUi();
      if (this._warmQuizTtsVoices) {
        window.speechSynthesis.removeEventListener("voiceschanged", this._warmQuizTtsVoices);
        this._warmQuizTtsVoices = null;
      }
    }
    clearInterval(this._countdownTimer);
    document.removeEventListener("click", this.handleGlobalClick);
    window.removeEventListener("resize", this._onResizeForDomainNav);
    this._cancelSnippetPressTimer();
    window.removeEventListener("mousemove", this._onCatDragMove);
    window.removeEventListener("mouseup", this._onCatDragEnd);
    window.removeEventListener("touchmove", this._onCatDragMove);
    window.removeEventListener("touchend", this._onCatDragEnd);
    window.removeEventListener("touchcancel", this._onCatDragEnd);
    if (this._catRaf) cancelAnimationFrame(this._catRaf);
  },
  methods: {
    _makeFavoriteId() {
      return `fav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    },
    _persistFavorites() {
      try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify({
          v: 1,
          compact: this.favoritesCompact,
          items: this.favorites.slice(-800)
        }));
      } catch (e) {
        /* ignore */
      }
    },
    _loadFavorites() {
      try {
        const raw = JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "null");
        if (!raw || raw.v !== 1 || !Array.isArray(raw.items)) return;
        if (typeof raw.compact === "boolean") {
          this.favoritesCompact = raw.compact;
        }
        this.favorites = raw.items
          .filter((x) => x && typeof x === "object" && typeof x.id === "string" && typeof x.content === "string")
          .slice(-800);
      } catch (e) {
        this.favorites = [];
      }
    },
    _loadCatSettings() {
      try {
        const raw = JSON.parse(localStorage.getItem(CAT_STORAGE_KEY) || "null");
        if (!raw || raw.v !== 1) return;
        if (typeof raw.visible === "boolean") this.catVisible = raw.visible;
      } catch (e) {
        /* ignore */
      }
    },
    _persistCatSettings() {
      try {
        localStorage.setItem(CAT_STORAGE_KEY, JSON.stringify({ v: 1, visible: this.catVisible }));
      } catch (e) {
        /* ignore */
      }
    },
    hideCat() {
      this.catVisible = false;
      this.catDocked = true;
      this._persistCatSettings();
    },
    showCat() {
      this.catVisible = true;
      this.catDocked = false;
      this.catDragging = false;
      this.projectConfigMenuOpen = false;
      this._planNextCatBehavior(performance.now(), false);
      this._persistCatSettings();
    },
    _catBounds() {
      const w = 44;
      const h = 44;
      return {
        minX: 4,
        minY: 70,
        maxX: Math.max(4, window.innerWidth - w - 4),
        maxY: Math.max(70, window.innerHeight - h - 64)
      };
    },
    _planNextCatBehavior(ts, arrived) {
      const b = this._catBounds();
      const r = Math.random();
      if (arrived && r < 0.32) {
        // 停留/伸懒腰/坐下
        const pauseMs = 700 + Math.floor(Math.random() * 1900);
        this.catPauseUntil = ts + pauseMs;
        this.catState = r < 0.12 ? "sit" : (r < 0.22 ? "stretch" : "loaf");
        return;
      }
      this.catPauseUntil = 0;
      this.catTargetX = b.minX + Math.random() * (b.maxX - b.minX);
      this.catTargetY = b.minY + Math.random() * (b.maxY - b.minY);
      const m = Math.random();
      if (m < 0.12) {
        this.catSpeed = 190 + Math.random() * 90;
        this.catState = "pounce";
      } else if (m < 0.48) {
        this.catSpeed = 120 + Math.random() * 80;
        this.catState = "run";
      } else {
        this.catSpeed = 55 + Math.random() * 70;
        this.catState = "walk";
      }
    },
    _tickCatRoam(ts) {
      const dt = this._catLastTs ? Math.min(0.045, Math.max(0.008, (ts - this._catLastTs) / 1000)) : 0.016;
      this._catLastTs = ts;
      if (this.catVisible && !this.catDocked && !this.catDragging) {
        if (this.catPauseUntil && ts < this.catPauseUntil) {
          // 停留状态：偶尔轻微抖动更像活物
          if (Math.random() < 0.04) {
            this.catX += (Math.random() - 0.5) * 1.2;
            this.catY += (Math.random() - 0.5) * 1.2;
          }
        } else {
          if (this.catPauseUntil && ts >= this.catPauseUntil) {
            this._planNextCatBehavior(ts, false);
          }
          const dx = this.catTargetX - this.catX;
          const dy = this.catTargetY - this.catY;
          const dist = Math.hypot(dx, dy);
          if (dist < 4) {
            this._planNextCatBehavior(ts, true);
          } else {
            this.catFacing = dx >= 0 ? 1 : -1;
            const step = Math.min(dist, this.catSpeed * dt);
            this.catX += (dx / dist) * step;
            this.catY += (dy / dist) * step;
          }
        }
      }
      this._catRaf = requestAnimationFrame((nextTs) => this._tickCatRoam(nextTs));
    },
    startCatDrag(e) {
      this.catDragging = true;
      this.catDocked = true;
      this.catState = "sit";
      const p = this._pointFromEvent(e);
      this.catX = Math.max(0, p.x - 22);
      this.catY = Math.max(0, p.y - 22);
    },
    _pointFromEvent(e) {
      const t = e && e.touches && e.touches[0];
      if (t) return { x: t.clientX, y: t.clientY };
      return { x: e.clientX, y: e.clientY };
    },
    handleCatDragMove(e) {
      if (!this.catDragging) return;
      if (e.cancelable) e.preventDefault();
      const p = this._pointFromEvent(e);
      const w = 44;
      const h = 44;
      const maxX = Math.max(0, window.innerWidth - w);
      const maxY = Math.max(0, window.innerHeight - h);
      this.catX = Math.max(0, Math.min(maxX, p.x - w / 2));
      this.catY = Math.max(0, Math.min(maxY, p.y - h / 2));
    },
    endCatDrag() {
      if (!this.catDragging) return;
      this.catDragging = false;
      this.catDocked = false;
      this.catTargetX = this.catX;
      this.catTargetY = this.catY;
      this._planNextCatBehavior(performance.now(), true);
    },
    async _copyTextToClipboard(text) {
      const payload = String(text || "");
      if (!payload) return false;
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(payload);
          return true;
        }
      } catch (e) {
        /* fallback below */
      }
      try {
        const ta = document.createElement("textarea");
        ta.value = payload;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        return true;
      } catch (e) {
        return false;
      }
    },
    async exportFavoritesToClipboard() {
      const payload = JSON.stringify({
        v: 1,
        compact: this.favoritesCompact,
        exportedAt: Date.now(),
        items: this.favorites
      });
      const ok = await this._copyTextToClipboard(payload);
      this.favoritesMenuOpen = false;
      window.alert(ok ? "已复制收藏数据到剪贴板" : "复制失败，请手动复制");
    },
    async exportProjectCacheToClipboard() {
      const items = {};
      PROJECT_CACHE_KEYS.forEach((k) => {
        const val = localStorage.getItem(k);
        if (val !== null) items[k] = val;
      });
      const payload = JSON.stringify({
        v: 1,
        exportedAt: Date.now(),
        keys: PROJECT_CACHE_KEYS,
        items
      });
      const ok = await this._copyTextToClipboard(payload);
      this.projectConfigMenuOpen = false;
      window.alert(ok ? "已复制项目缓存到剪贴板" : "复制失败，请手动复制");
    },
    _normalizePracticeUserId(raw) {
      const id = String(raw || "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
      return id || "bovia";
    },
    _loadPracticeActiveUser() {
      try {
        const raw = localStorage.getItem(PRACTICE_ACTIVE_USER_STORAGE_KEY);
        this.activePracticeUserId = this._normalizePracticeUserId(raw || "bovia");
      } catch (e) {
        this.activePracticeUserId = "bovia";
      }
    },
    async _loadPracticeSeedData() {
      if (window.__PRACTICE_SEED_DATA__ && typeof window.__PRACTICE_SEED_DATA__ === "object") {
        return window.__PRACTICE_SEED_DATA__;
      }
      const res = await fetch(PRACTICE_PROFILES_SEED_URL, { cache: "no-store" });
      if (!res.ok) {
        throw new Error("未读取到 export_my_answers_and_history.json");
      }
      const seedText = await res.text();
      try {
        return JSON.parse(seedText);
      } catch (e) {
        throw new Error("export_my_answers_and_history.json 文件内容不是合法 JSON");
      }
    },
    async initPracticeUserFromSeedPrompt() {
      this.projectConfigMenuOpen = false;
      const uidRaw = window.prompt("初始化题目缓存（输入 bovia 或 mtt）：", this.activePracticeUserId || "bovia");
      if (!uidRaw || !uidRaw.trim()) return;
      const uid = this._normalizePracticeUserId(uidRaw);
      if (uid !== "bovia" && uid !== "mtt") {
        window.alert("仅支持 bovia / mtt");
        return;
      }
      const ok = window.confirm(`将覆盖 ${uid} 的题目历史与答案缓存，是否继续？`);
      if (!ok) return;
      try {
        const seed = await this._loadPracticeSeedData();
        const items = seed && seed.items && typeof seed.items === "object" ? seed.items : {};
        const profileSeed = seed && seed.practiceProfiles && typeof seed.practiceProfiles === "object"
          ? seed.practiceProfiles
          : {};
        const extraAttempts = profileSeed.attemptsProfiles && typeof profileSeed.attemptsProfiles === "object"
          ? profileSeed.attemptsProfiles
          : {};
        const extraAnswers = profileSeed.answersProfiles && typeof profileSeed.answersProfiles === "object"
          ? profileSeed.answersProfiles
          : {};

        const attemptsSeedRaw = items[PRACTICE_ATTEMPTS_STORAGE_KEY];
        const answersSeedRaw = items[PRACTICE_USER_ANS_STORAGE_KEY];
        let boviaAttempts = {};
        let boviaAnswersRaw = {};
        try {
          boviaAttempts = attemptsSeedRaw ? JSON.parse(attemptsSeedRaw) : {};
        } catch (e) {
          window.alert("初始化失败：export 中 attempts 字段不是合法 JSON 字符串");
          return;
        }
        try {
          boviaAnswersRaw = answersSeedRaw ? JSON.parse(answersSeedRaw) : {};
        } catch (e) {
          window.alert("初始化失败：export 中 user-answers 字段不是合法 JSON 字符串");
          return;
        }
        const boviaAnswers = boviaAnswersRaw && typeof boviaAnswersRaw === "object"
          ? (boviaAnswersRaw.bySetKey && typeof boviaAnswersRaw.bySetKey === "object" ? boviaAnswersRaw.bySetKey : {})
          : {};

        let nextAttempts = uid === "bovia" ? boviaAttempts : {};
        if (extraAttempts[uid] && typeof extraAttempts[uid] === "object" && !Array.isArray(extraAttempts[uid])) {
          nextAttempts = extraAttempts[uid];
        }
        let nextAnswers = uid === "bovia" ? boviaAnswers : {};
        if (extraAnswers[uid] && typeof extraAnswers[uid] === "object") {
          const bySet = extraAnswers[uid].bySetKey && typeof extraAnswers[uid].bySetKey === "object"
            ? extraAnswers[uid].bySetKey
            : {};
          nextAnswers = bySet;
        }

        const attemptsRaw = localStorage.getItem(PRACTICE_ATTEMPTS_STORAGE_KEY);
        const answersRaw = localStorage.getItem(PRACTICE_USER_ANS_STORAGE_KEY);
        let parsedAttempts = {};
        let parsedAnswers = {};
        try {
          parsedAttempts = attemptsRaw ? JSON.parse(attemptsRaw) : {};
        } catch (e) {
          parsedAttempts = {};
        }
        try {
          parsedAnswers = answersRaw ? JSON.parse(answersRaw) : {};
        } catch (e) {
          parsedAnswers = {};
        }
        const attemptProfiles = parsedAttempts && parsedAttempts.__v === 2 && parsedAttempts.profiles && typeof parsedAttempts.profiles === "object"
          ? { ...parsedAttempts.profiles }
          : {};
        const answerProfiles = parsedAnswers && parsedAnswers.__v === 2 && parsedAnswers.profiles && typeof parsedAnswers.profiles === "object"
          ? { ...parsedAnswers.profiles }
          : {};

        attemptProfiles[uid] = nextAttempts && typeof nextAttempts === "object" && !Array.isArray(nextAttempts) ? nextAttempts : {};
        answerProfiles[uid] = { v: 1, bySetKey: nextAnswers && typeof nextAnswers === "object" ? nextAnswers : {} };

        localStorage.setItem(PRACTICE_ATTEMPTS_STORAGE_KEY, JSON.stringify({ __v: 2, profiles: attemptProfiles }));
        localStorage.setItem(PRACTICE_USER_ANS_STORAGE_KEY, JSON.stringify({ __v: 2, profiles: answerProfiles }));
        localStorage.setItem(PRACTICE_ACTIVE_USER_STORAGE_KEY, uid);

        this.activePracticeUserId = uid;
        this.practiceSetCache = {};
        this.practiceWrongBookSnapshot = null;
        this.exitPracticeExam();
        this._loadPracticeAttemptLog();
        this._loadPracticeUserAnswers();
        window.alert(`初始化完成，当前用户：${uid}`);
      } catch (e) {
        window.alert(`初始化失败：${e && e.message ? e.message : "未知异常"}`);
      }
    },
    importProjectCacheFromPrompt() {
      this.projectConfigMenuOpen = false;
      const raw = window.prompt("粘贴项目缓存 JSON：");
      if (!raw || !raw.trim()) return;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== 1 || typeof parsed.items !== "object" || Array.isArray(parsed.items)) {
          window.alert("导入失败：JSON 格式不正确");
          return;
        }
        PROJECT_CACHE_KEYS.forEach((k) => {
          if (Object.prototype.hasOwnProperty.call(parsed.items, k) && typeof parsed.items[k] === "string") {
            localStorage.setItem(k, parsed.items[k]);
          }
        });
        window.alert("导入成功，刷新页面后生效");
      } catch (e) {
        window.alert("导入失败：JSON 解析错误");
      }
    },
    importFavoritesFromPrompt() {
      this.favoritesMenuOpen = false;
      const raw = window.prompt("粘贴导入的收藏 JSON：");
      if (!raw || !raw.trim()) return;
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || parsed.v !== 1 || !Array.isArray(parsed.items)) {
          window.alert("导入失败：JSON 格式不正确");
          return;
        }
        const safeItems = parsed.items
          .filter((x) => x && typeof x === "object" && typeof x.id === "string" && typeof x.content === "string")
          .slice(-800);
        this.favorites = safeItems;
        if (typeof parsed.compact === "boolean") this.favoritesCompact = parsed.compact;
        this.favoriteExpandedId = "";
        this._persistFavorites();
        window.alert(`导入成功，共 ${safeItems.length} 条`);
      } catch (e) {
        window.alert("导入失败：JSON 解析错误");
      }
    },
    _cancelSnippetPressTimer() {
      if (this._snippetPressTimer) {
        clearTimeout(this._snippetPressTimer);
        this._snippetPressTimer = null;
      }
    },
    _existsFavorite(type, content, sourceKey) {
      return this.favorites.some((x) => x.type === type && x.content === content && x.sourceKey === sourceKey);
    },
    openFavorites() {
      this.favoritesOpen = true;
    },
    openFavoritesFromEntry() {
      this.favoriteEntryAnimating = true;
      this.openFavorites();
      this.projectConfigMenuOpen = false;
      setTimeout(() => {
        this.favoriteEntryAnimating = false;
      }, 750);
    },
    closeFavorites() {
      this.favoritesOpen = false;
      this.favoritesMenuOpen = false;
    },
    toggleFavoritesMenu() {
      this.favoritesMenuOpen = !this.favoritesMenuOpen;
    },
    toggleProjectConfigMenu() {
      this.projectConfigMenuOpen = !this.projectConfigMenuOpen;
    },
    removeFavorite(id) {
      this.favorites = this.favorites.filter((x) => x.id !== id);
      if (this.favoriteExpandedId === id) this.favoriteExpandedId = "";
      this._persistFavorites();
    },
    toggleFavoritesCompact() {
      this.favoritesCompact = !this.favoritesCompact;
      if (!this.favoritesCompact) this.favoriteExpandedId = "";
    },
    openFavoriteItem(id) {
      if (!this.favoritesCompact) return;
      this.favoriteExpandedId = this.favoriteExpandedId === id ? "" : id;
    },
    closeFavoriteItem() {
      this.favoriteExpandedId = "";
    },
    formatFavoriteTime(ts) {
      if (!ts) return "";
      const d = new Date(ts);
      if (Number.isNaN(d.getTime())) return "";
      const now = new Date();
      const sameDay = d.toDateString() === now.toDateString();
      const pad = (n) => String(n).padStart(2, "0");
      if (sameDay) {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
      }
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },
    addFavoriteNote() {
      const content = String(this.newFavoriteNote || "").trim();
      if (!content) return;
      this.favorites.push({
        id: this._makeFavoriteId(),
        type: "note",
        title: "手动笔记",
        content,
        sourceKey: "manual-note",
        createdAt: Date.now()
      });
      this.newFavoriteNote = "";
      this._persistFavorites();
      this.openFavorites();
    },
    addFavoriteQuestion(question, qi) {
      const title = `第${qi + 1}题`;
      const uaLine = question.userAnswer ? `\n你的作答：${question.userAnswer}` : "";
      const content = `${question.question}\n${(question.options || []).join("\n")}\n答案：${question.answer}${uaLine}\n解析：${question.analysis || ""}`.trim();
      const sourceKey = `${this.quizBundleKey}|q${qi}|${question.question || ""}`;
      const sourceTag = this.practiceLayer === "mock"
        ? "模拟"
        : this.practiceLayer === "comprehensive"
          ? "综合"
          : "知识域";
      if (this._existsFavorite("question", content, sourceKey)) return;
      this.favorites.push({
        id: this._makeFavoriteId(),
        type: "question",
        title,
        content,
        sourceTag,
        sourceKey,
        createdAt: Date.now()
      });
      this._persistFavorites();
      this.favoritingQuestionKey = sourceKey;
      setTimeout(() => {
        if (this.favoritingQuestionKey === sourceKey) this.favoritingQuestionKey = "";
      }, 900);
    },
    startSnippetPress(text, meta) {
      this._cancelSnippetPressTimer();
      const payload = String(text || "").trim();
      if (!payload) return;
      this._snippetPressTimer = setTimeout(() => {
        this._snippetPressTimer = null;
        this.addFavoriteSnippet(payload, meta);
      }, 550);
    },
    endSnippetPress() {
      this._cancelSnippetPressTimer();
    },
    addFavoriteSnippet(text, meta) {
      const content = String(text || "").trim();
      if (!content) return;
      const kind = meta && meta.kind ? meta.kind : "片段";
      const sourceKey = `${this.quizBundleKey}|snippet|${kind}|${meta && typeof meta.qi === "number" ? meta.qi : "x"}|${content.slice(0, 32)}`;
      const sourceTag = this.practiceLayer === "mock"
        ? "模拟"
        : this.practiceLayer === "comprehensive"
          ? "综合"
          : "知识域";
      if (this._existsFavorite("snippet", content, sourceKey)) return;
      this.favorites.push({
        id: this._makeFavoriteId(),
        type: "snippet",
        title: `${kind}${meta && typeof meta.qi === "number" ? ` · 第${meta.qi + 1}题` : ""}`,
        content,
        sourceTag,
        sourceKey,
        createdAt: Date.now()
      });
      this._persistFavorites();
    },
    normalizeQuizAnalysisPlain(text) {
      return String(text || "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/\s+/g, " ")
        .trim();
    },
    /** 播报专用：减少怪异停顿与引擎吃字 */
    normalizeQuizAnalysisForTts(text) {
      let s = this.normalizeQuizAnalysisPlain(text);
      s = s
        .replace(/\.{3,}/g, "…")
        .replace(/[`]{2,}/g, "")
        .replace(/\s*·\s*/g, "，")
        .replace(/\s*•\s*/g, "，")
        .replace(/[()（）【】\[\]]/g, " ")
        .replace(/[，,]{2,}/g, "，")
        .replace(/[。.]{2,}/g, "。")
        .replace(/\s+/g, " ")
        .trim();
      return s;
    },
    _clearQuizTtsUi() {
      this.quizTtsPlayingIndex = null;
      this._quizTtsFullPlain = null;
      this._quizTtsProgressAbs = 0;
      this._quizTtsSegmentStart = 0;
      this._quizTtsChunkList = null;
      this._quizTtsChunkStarts = null;
      this._quizTtsChunkIndex = 0;
      this._quizTtsPendingChunkPlay = null;
    },
    _bumpQuizTtsGenAndCancel() {
      this._quizTtsGen = (this._quizTtsGen || 0) + 1;
      this._quizTtsPendingChunkPlay = null;
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    },
    _pickQuizTtsVoiceForUtter(synth) {
      let saved = "";
      try {
        saved = localStorage.getItem(QUIZ_TTS_VOICE_STORAGE_KEY) || "";
      } catch (e) {
        /* ignore */
      }
      const v = pickQuizZhVoice(synth, saved);
      if (v) {
        try {
          localStorage.setItem(QUIZ_TTS_VOICE_STORAGE_KEY, v.voiceURI);
        } catch (e) {
          /* ignore */
        }
      }
      return v;
    },
    _mapQuizTtsAbsToChunk(chunks, starts, abs) {
      if (!chunks || !starts || !chunks.length) return { chunkIdx: 0, offsetInChunk: 0 };
      const n = starts[starts.length - 1] + chunks[chunks.length - 1].length;
      let a = typeof abs === "number" ? abs : 0;
      if (a < 0) a = 0;
      if (a > n) a = n;
      for (let i = starts.length - 1; i >= 0; i--) {
        if (a >= starts[i]) {
          const off = Math.min(a - starts[i], chunks[i].length);
          return { chunkIdx: i, offsetInChunk: off };
        }
      }
      return { chunkIdx: 0, offsetInChunk: 0 };
    },
    _playQuizTtsSequence(plain, chunks, starts, qi, chunkIdx, offsetInChunk) {
      const synth = window.speechSynthesis;
      if (!synth || !chunks.length) {
        this._clearQuizTtsUi();
        return;
      }
      const gen = this._quizTtsGen;
      if (!synth.getVoices().length) {
        this._quizTtsPendingChunkPlay = { plain, chunks, starts, qi, chunkIdx, offsetInChunk };
        const onVoices = () => {
          synth.removeEventListener("voiceschanged", onVoices);
          if (gen !== this._quizTtsGen) return;
          const p = this._quizTtsPendingChunkPlay;
          if (!p) return;
          this._quizTtsPendingChunkPlay = null;
          this._playQuizTtsSequence(p.plain, p.chunks, p.starts, p.qi, p.chunkIdx, p.offsetInChunk);
        };
        synth.addEventListener("voiceschanged", onVoices);
        this._quizTtsFullPlain = plain;
        this._quizTtsChunkList = chunks;
        this._quizTtsChunkStarts = starts;
        this.quizTtsPlayingIndex = qi;
        return;
      }
      this._quizTtsPendingChunkPlay = null;
      if (chunkIdx >= chunks.length) {
        this._clearQuizTtsUi();
        return;
      }
      let piece = chunks[chunkIdx].slice(offsetInChunk);
      const trimStartLen = piece.length - piece.trimStart().length;
      piece = piece.trimStart();
      const baseStart = starts[chunkIdx] + offsetInChunk + trimStartLen;
      if (!piece) {
        this.$nextTick(() => {
          if (gen !== this._quizTtsGen) return;
          this._playQuizTtsSequence(plain, chunks, starts, qi, chunkIdx + 1, 0);
        });
        return;
      }
      this._quizTtsFullPlain = plain;
      this._quizTtsChunkList = chunks;
      this._quizTtsChunkStarts = starts;
      this._quizTtsChunkIndex = chunkIdx;
      this._quizTtsSegmentStart = baseStart;
      this._quizTtsProgressAbs = baseStart;
      this.quizTtsPlayingIndex = qi;

      const utter = new SpeechSynthesisUtterance(piece);
      utter.volume = 1;
      utter.pitch = 0.98;
      utter.rate = this.quizTtsRate;
      const zh = this._pickQuizTtsVoiceForUtter(synth);
      if (zh) {
        utter.voice = zh;
        utter.lang = zh.lang || "zh-CN";
      } else {
        utter.lang = "zh-CN";
      }

      utter.onboundary = (e) => {
        if (gen !== this._quizTtsGen) return;
        if (this.quizTtsPlayingIndex !== qi) return;
        if (typeof e.charIndex === "number") {
          this._quizTtsProgressAbs = baseStart + e.charIndex;
        }
      };
      utter.onend = () => {
        if (gen !== this._quizTtsGen) return;
        if (this.quizTtsPlayingIndex !== qi) return;
        this.$nextTick(() => {
          if (gen !== this._quizTtsGen) return;
          this._playQuizTtsSequence(plain, chunks, starts, qi, chunkIdx + 1, 0);
        });
      };
      utter.onerror = () => {
        if (gen !== this._quizTtsGen) return;
        if (this.quizTtsPlayingIndex !== qi) return;
        this.$nextTick(() => {
          if (gen !== this._quizTtsGen) return;
          this._playQuizTtsSequence(plain, chunks, starts, qi, chunkIdx + 1, 0);
        });
      };
      synth.speak(utter);
    },
    setQuizTtsRate(r) {
      if (r !== 1 && r !== 1.25 && r !== 1.5) return;
      const prev = this.quizTtsRate;
      this.quizTtsRate = r;
      if (prev === r) return;
      if (this.quizTtsPlayingIndex == null || !this._quizTtsFullPlain) return;
      const full = this._quizTtsFullPlain;
      const chunks = this._quizTtsChunkList;
      const starts = this._quizTtsChunkStarts;
      if (!chunks || !starts || !chunks.length) return;
      const qi = this.quizTtsPlayingIndex;
      let off = this._quizTtsProgressAbs;
      if (typeof off !== "number" || off < 0 || off > full.length) {
        off = this._quizTtsSegmentStart || 0;
      }
      const { chunkIdx, offsetInChunk } = this._mapQuizTtsAbsToChunk(chunks, starts, off);
      this._bumpQuizTtsGenAndCancel();
      this.$nextTick(() => {
        this._playQuizTtsSequence(full, chunks, starts, qi, chunkIdx, offsetInChunk);
      });
    },
    speakQuizAnalysis(text, qi) {
      const synth = window.speechSynthesis;
      if (!synth) return;
      const plain = this.normalizeQuizAnalysisForTts(text);
      if (!plain) return;

      if (this.quizTtsPlayingIndex === qi) {
        this._bumpQuizTtsGenAndCancel();
        this._clearQuizTtsUi();
        return;
      }

      const { chunks, starts } = buildQuizTtsChunks(plain);
      if (!chunks.length) return;

      this._bumpQuizTtsGenAndCancel();
      this.$nextTick(() => {
        this._playQuizTtsSequence(plain, chunks, starts, qi, 0, 0);
      });
    },
    persistNavState() {
      try {
        const learned = Array.isArray(this.learnedProcessIds) ? this.learnedProcessIds.slice(-300) : [];
        const peek = this.quizAnswerPeek && typeof this.quizAnswerPeek === "object" ? { ...this.quizAnswerPeek } : {};
        const payload = {
          v: 1,
          activeModule: this.activeModule,
          activeView: this.activeView,
          practiceLayer: this.practiceLayer,
          activeDomainId: this.activeDomainId,
          activeProcessId: this.activeProcessId,
          activeComprehensiveId: this.activeComprehensiveId,
          activeMockId: this.activeMockId,
          quizSubMode: this.quizSubMode,
          activeEssayTab: this.activeEssayTab,
          myEssayGroupId: this.myEssayGroupId,
          myEssayTopicId: this.myEssayTopicId,
          pgFilterDomain: this.pgFilterDomain,
          quizAnswersGlobalShow: this.quizAnswersGlobalShow,
          quizAnswerPeek: peek,
          learnedProcessIds: learned,
          quizTtsRate: this.quizTtsRate
        };
        localStorage.setItem(NAV_STORAGE_KEY, JSON.stringify(payload));
      } catch (e) {
        /* 存储已满或禁用 */
      }
    },
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
      this.projectConfigMenuOpen = false;
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
      this.resetQuizMatcherState();
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
    resetQuizMatcherState() {
      this.quizSubMode = "quiz";
      this.matcherPairs = [];
      this.matcherLeftItems = [];
      this.matcherRightItems = [];
      this.matcherLeftSel = null;
      this.matcherRightSel = null;
      this.matcherMatchedIds = [];
      this.matcherWrong = false;
    },
    _resolveSetQuiz(set) {
      if (!set) return [];
      if (this.practiceSetCache[set.id]) return this.practiceSetCache[set.id];
      // 从 window.practiceMarkdown 同步解析
      const raw = set.key && window.practiceMarkdown && window.practiceMarkdown[set.key];
      if (raw) {
        const quiz = parsePracticeMarkdown(raw);
        const ua = this._resolveUserAnswersForSetKey(set.key);
        const merged = this._applyUserAnswersToQuiz(quiz, ua);
        this.practiceSetCache = { ...this.practiceSetCache, [set.id]: merged };
        return merged;
      }
      return set.quiz || [];
    },
    _loadPracticeUserAnswers() {
      try {
        const raw = localStorage.getItem(PRACTICE_USER_ANS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        if (parsed && parsed.__v === 2 && parsed.profiles && typeof parsed.profiles === "object") {
          const profile = parsed.profiles[this.activePracticeUserId] || {};
          const bySetV2 = profile.bySetKey && typeof profile.bySetKey === "object" ? profile.bySetKey : {};
          this.practiceUserAnswers = bySetV2 && typeof bySetV2 === "object" && !Array.isArray(bySetV2) ? bySetV2 : {};
          return;
        }
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          this.practiceUserAnswers = {};
          return;
        }
        // 兼容两种格式：
        // 1) { v:1, bySetKey: { zonghe_1: { "0":"D" } } }
        // 2) 直接 { zonghe_1: { "0":"D" } }
        const bySetKey = parsed.bySetKey && typeof parsed.bySetKey === "object" ? parsed.bySetKey : parsed;
        this.practiceUserAnswers = bySetKey && typeof bySetKey === "object" && !Array.isArray(bySetKey) ? bySetKey : {};
      } catch (e) {
        this.practiceUserAnswers = {};
      }
    },
    _resolveUserAnswersForSetKey(setKey) {
      const k = String(setKey || "");
      const ua = this.practiceUserAnswers && typeof this.practiceUserAnswers === "object" ? this.practiceUserAnswers[k] : null;
      if (!ua || typeof ua !== "object" || Array.isArray(ua)) return {};
      return ua;
    },
    _applyUserAnswersToQuiz(quiz, ua) {
      if (!Array.isArray(quiz) || !quiz.length) return quiz || [];
      if (!ua || typeof ua !== "object") return quiz;
      return quiz.map((q, idx) => {
        const hit = ua[String(idx)];
        const picked = normalizeQuizAnswerKey(hit || "");
        if (!picked) return q;
        return { ...q, userAnswer: picked };
      });
    },
    selectPracticeLayer(layer) {
      this.practiceLayer = layer;
      this.practiceBrowseResultFilter = "all";
      this.resetQuizMatcherState();
      if (layer === "comprehensive") {
        const list = this.comprehensiveSets;
        const idOk =
          this.activeComprehensiveId === this.comprehensiveWrongBookId ||
          list.some((s) => s.id === this.activeComprehensiveId);
        if (list.length && !idOk) {
          this.activeComprehensiveId = list[0].id;
        }
        if (this.activeComprehensiveId === this.comprehensiveWrongBookId) {
          this.practiceWrongBookSnapshot = this._buildWrongBookCandidatesShuffled();
        }
      }
      if (layer === "mock") {
        const list = this.mockSets;
        if (list.length && !list.some((s) => s.id === this.activeMockId)) {
          this.activeMockId = list[0].id;
        }
      }
    },
    selectComprehensiveSet(id) {
      this.activeComprehensiveId = id;
      this.practiceBrowseResultFilter = "all";
      this.resetQuizMatcherState();
      if (id === this.comprehensiveWrongBookId) {
        this.practiceWrongBookSnapshot = this._buildWrongBookCandidatesShuffled();
      } else {
        this.practiceWrongBookSnapshot = null;
      }
    },
    selectMockSet(id) {
      this.activeMockId = id;
      this.practiceBrowseResultFilter = "all";
      this.resetQuizMatcherState();
    },
    setQuizAnswersGlobal(show) {
      this.quizAnswersGlobalShow = show;
      this.quizAnswerPeek = {};
    },
    _loadPracticeAttemptLog() {
      try {
        const raw = localStorage.getItem(PRACTICE_ATTEMPTS_STORAGE_KEY);
        const o = raw ? JSON.parse(raw) : {};
        if (o && o.__v === 2 && o.profiles && typeof o.profiles === "object") {
          const hit = o.profiles[this.activePracticeUserId];
          this.practiceAttemptLog = hit && typeof hit === "object" && !Array.isArray(hit) ? hit : {};
          return;
        }
        this.practiceAttemptLog = o && typeof o === "object" && !Array.isArray(o) ? o : {};
      } catch (e) {
        this.practiceAttemptLog = {};
      }
    },
    _persistPracticeAttemptLog() {
      try {
        const raw = localStorage.getItem(PRACTICE_ATTEMPTS_STORAGE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        const profiles = parsed && parsed.__v === 2 && parsed.profiles && typeof parsed.profiles === "object"
          ? { ...parsed.profiles }
          : {};
        profiles[this.activePracticeUserId] = this.practiceAttemptLog && typeof this.practiceAttemptLog === "object" ? this.practiceAttemptLog : {};
        localStorage.setItem(PRACTICE_ATTEMPTS_STORAGE_KEY, JSON.stringify({ __v: 2, profiles }));
      } catch (e) {
        /* ignore quota */
      }
    },
    practiceAttemptRecordName(attemptId) {
      const list = this.practiceExamAttemptsForBundle;
      const idx = list.findIndex((a) => a.id === attemptId);
      if (idx < 0) return "做题记录";
      return `做题记录${idx + 1}`;
    },
    formatPracticeAttemptLabel(a) {
      const d = new Date(a.ts || 0);
      const pad = (n) => (n < 10 ? "0" + n : "" + n);
      const mon = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hh = pad(d.getHours());
      const mm = pad(d.getMinutes());
      const pct =
        typeof a.percent === "number"
          ? a.percent
          : a.total
            ? Math.round((a.correct / a.total) * 100)
            : 0;
      const name = this.practiceAttemptRecordName(a.id);
      return `${name} · ${mon}/${day} ${hh}:${mm} · ${a.correct}/${a.total}（${pct}%）`;
    },
    isPracticeHistoryItemActive(attemptId) {
      return this.practiceExamResolvedAttemptId === attemptId;
    },
    _extractAnsweredWrongIndicesFromAttempt(attempt) {
      if (!attempt || typeof attempt !== "object") return [];
      const answerMap = attempt.answerMap && typeof attempt.answerMap === "object" ? attempt.answerMap : {};
      const choices = attempt.choices && typeof attempt.choices === "object" ? attempt.choices : {};
      const out = [];
      for (const [k, ansRaw] of Object.entries(answerMap)) {
        const ans = normalizeQuizAnswerKey(ansRaw);
        const user = normalizeQuizAnswerKey(choices[k] || "");
        if (!ans || !user) continue;
        if (user !== ans) {
          const oi = Number(k);
          if (Number.isInteger(oi)) out.push(oi);
        }
      }
      if (out.length) return [...new Set(out)];
      if (Array.isArray(attempt.wrongOriginIndices)) {
        return [...new Set(attempt.wrongOriginIndices.filter((x) => Number.isInteger(x)))];
      }
      return [];
    },
    _collectWrongBookCandidatesNoShuffle() {
      const out = [];
      const seen = new Set();
      const sets = this.comprehensiveSets;
      const setById = Object.fromEntries(sets.map((s) => [s.id, s]));
      const latestBySet = {};
      const log = this.practiceAttemptLog || {};
      for (const [bundleKey, attempts] of Object.entries(log)) {
        const parts = bundleKey.split("|");
        if (parts.length < 5 || parts[0] !== "quiz" || parts[1] !== "comprehensive") continue;
        const compId = parts[3];
        if (compId === this.comprehensiveWrongBookId || !setById[compId]) continue;
        if (!Array.isArray(attempts) || !attempts.length) continue;
        let latest = null;
        for (const att of attempts) {
          if (!att || typeof att !== "object") continue;
          if (!latest || (att.ts || 0) > (latest.ts || 0)) latest = att;
        }
        if (!latest) continue;
        if (!latestBySet[compId] || (latest.ts || 0) > (latestBySet[compId].ts || 0)) {
          latestBySet[compId] = latest;
        }
      }
      for (const [compId, latest] of Object.entries(latestBySet)) {
        const set = setById[compId];
        const quiz = this._resolveSetQuiz(set);
        if (!Array.isArray(quiz) || !quiz.length) continue;
        const wrongIndices = this._extractAnsweredWrongIndicesFromAttempt(latest);
        for (const oi of wrongIndices) {
          const dedupe = `${compId}|${oi}`;
          if (seen.has(dedupe)) continue;
          const q = quiz[oi];
          if (!q) continue;
          seen.add(dedupe);
          out.push({
            ...q,
            _wrongBookSource: { setId: compId, setTitle: set.title, originIndex: oi }
          });
        }
      }
      out.sort((a, b) => {
        const sa = `${a._wrongBookSource.setId}|${a._wrongBookSource.originIndex}`;
        const sb = `${b._wrongBookSource.setId}|${b._wrongBookSource.originIndex}`;
        return sa.localeCompare(sb, "en");
      });
      return out;
    },
    _buildWrongBookCandidatesShuffled() {
      const arr = this._collectWrongBookCandidatesNoShuffle().map((q) => ({ ...q }));
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    startPracticeExam(options) {
      const opts = options || {};
      if (opts.onlyWrongFromAttempt === true) {
        const attempt = opts.attempt || this.practiceExamDisplayAttempt;
        const wrongOnly = this._extractAnsweredWrongIndicesFromAttempt(attempt);
        if (!wrongOnly.length) {
          window.alert("该次记录中没有可重做错题");
          return;
        }
        const allow = new Set(wrongOnly);
        const filtered = this.practiceQuizBaseRows.filter((q) => allow.has(q._originIndex));
        if (!filtered.length) {
          window.alert("无法在现题库中匹配该次错题，请返回浏览后重试。");
          return;
        }
        this.practiceExamSubsetRows = filtered;
      } else {
        this.practiceExamSubsetRows = null;
      }
      const rows = this.practiceQuizBaseRowsForExam;
      if (!rows.length) return;
      this._bumpQuizTtsGenAndCancel();
      this._clearQuizTtsUi();
      this.practiceExamActive = true;
      this.practiceExamRunning = true;
      this.practiceExamChoices = {};
      this.practiceExamSelectedHistoryId = "";
      this.practiceQuizActiveIndex = 0;
      this.practiceExamNavOpen = false;
      this.$nextTick(() => {
        this._syncPracticeQuizScrollListener();
        this._updatePracticeQuizFabNeedsScroll();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    },
    exitPracticeExam() {
      this._bumpQuizTtsGenAndCancel();
      this._clearQuizTtsUi();
      this.practiceExamActive = false;
      this.practiceExamRunning = false;
      this.practiceExamChoices = {};
      this.practiceExamSelectedHistoryId = "";
      this.practiceQuizActiveIndex = 0;
      this.practiceExamNavOpen = false;
      this.practiceExamSubsetRows = null;
      this.practiceRestartPickerOpen = false;
      this.practiceQuizActiveIndex = 0;
      this.practiceHistoryPickerOpen = false;
      if (this.practiceLayer === "comprehensive" && this.activeComprehensiveId === this.comprehensiveWrongBookId) {
        this.practiceWrongBookSnapshot = this._buildWrongBookCandidatesShuffled();
      }
      this.$nextTick(() => {
        this._syncPracticeQuizScrollListener();
        this._updatePracticeQuizFabNeedsScroll();
      });
    },
    openPracticeRestartPicker() {
      this.practiceRestartPickerOpen = true;
    },
    closePracticeRestartPicker() {
      this.practiceRestartPickerOpen = false;
      this.practiceHistoryPickerOpen = false;
      this.practiceExamNavOpen = false;
    },
    openPracticeHistoryPicker() {
      this.practiceHistoryPickerOpen = true;
    },
    closePracticeHistoryPicker() {
      this.practiceHistoryPickerOpen = false;
    },
    openPracticeExamNav() {
      if (!this.practiceExamRunning) return;
      this.practiceExamNavOpen = true;
    },
    closePracticeExamNav() {
      this.practiceExamNavOpen = false;
    },
    goPracticeExamCard(delta) {
      if (!this.practiceExamRunning) return;
      const n = (this.practiceQuizCardsForRender || []).length;
      if (!n) return;
      const next = Math.max(0, Math.min(n - 1, (this.practiceQuizActiveIndex || 0) + delta));
      this.practiceQuizActiveIndex = next;
      this.$nextTick(() => {
        const el = document.getElementById(`practice-quiz-card-${next}`);
        if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    },
    jumpToPracticeExamCard(idx) {
      if (!this.practiceExamRunning) return;
      const n = (this.practiceQuizCardsForRender || []).length;
      const i = Number(idx);
      if (!Number.isInteger(i) || i < 0 || i >= n) return;
      this.practiceExamNavOpen = false;
      this.practiceQuizActiveIndex = i;
      this.$nextTick(() => {
        const el = document.getElementById(`practice-quiz-card-${i}`);
        if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
      });
    },
    selectPracticeHistoryAndOpen(selectValue) {
      this.practiceHistoryPickerOpen = false;
      this.openPracticeExamReview(selectValue);
    },
    hasWrongForAttempt(attempt) {
      return this._extractAnsweredWrongIndicesFromAttempt(attempt).length > 0;
    },
    restartPracticeExam(type) {
      this.practiceRestartPickerOpen = false;
      this.practiceHistoryPickerOpen = false;
      this.practiceExamNavOpen = false;
      if (type === "wrong") {
        this.startPracticeExam({ onlyWrongFromAttempt: true, attempt: this.practiceExamDisplayAttempt });
        return;
      }
      this.startPracticeExam({});
    },
    openPracticeExamReview(selectValue) {
      if (!selectValue) return;
      this.practiceExamSelectedHistoryId = selectValue;
      this._bumpQuizTtsGenAndCancel();
      this._clearQuizTtsUi();
      this.practiceExamActive = true;
      this.practiceExamRunning = false;
      this.$nextTick(() => {
        this._syncPracticeQuizScrollListener();
        this._updatePracticeQuizFabNeedsScroll();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
    },
    onPracticeExamBrowseHistorySelect(ev) {
      const el = ev && ev.target;
      const v = el ? el.value : "";
      if (el) el.value = "";
      if (!v) return;
      this.openPracticeExamReview(v);
    },
    submitPracticeExam() {
      const rows = this.practiceQuizBaseRowsForExam;
      if (!rows.length || !this.practiceExamRunning) return;
      const choices = { ...this.practiceExamChoices };
      let correct = 0;
      const answerMap = {};
      const wrongOriginIndices = [];
      for (const q of rows) {
        const idx = q._originIndex;
        const k = String(idx);
        answerMap[k] = normalizeQuizAnswerKey(q.answer);
        const user = normalizeQuizAnswerKey(choices[k] || "");
        const ans = answerMap[k];
        if (user && ans && user === ans) {
          correct++;
        } else if (user && ans && user !== ans) {
          // 未作答不计入错题集；只记录已作答但答错的题
          wrongOriginIndices.push(idx);
        }
      }
      const total = rows.length;
      const percent = total ? Math.round((correct / total) * 100) : 0;
      const attempt = {
        id: newPracticeAttemptId(),
        bundleKey: this.quizBundleKey,
        ts: Date.now(),
        title: this.practicePanelTitle,
        total,
        correct,
        percent,
        choices,
        answerMap,
        /** 供后续错题本：按套卷内题序去重后再练 */
        wrongOriginIndices,
        practiceLayer: this.practiceLayer,
        activeComprehensiveId: this.activeComprehensiveId,
        activeMockId: this.activeMockId,
        activeDomainId: this.activeDomainId
      };
      const bk = this.quizBundleKey;
      const prev = Array.isArray(this.practiceAttemptLog[bk]) ? this.practiceAttemptLog[bk].slice() : [];
      prev.push(attempt);
      const trimmed = prev.slice(-80);
      this.practiceAttemptLog = { ...this.practiceAttemptLog, [bk]: trimmed };
      this._persistPracticeAttemptLog();
      this.practiceExamRunning = false;
      this.practiceExamSelectedHistoryId = "";
      this.$nextTick(() => {
        this._syncPracticeQuizScrollListener();
        this._updatePracticeQuizFabNeedsScroll();
      });
    },
    setPracticeExamOption(originIndex, cardIndex, optionLine) {
      if (!this.practiceExamRunning) return;
      const letter = extractQuizOptionLetter(optionLine);
      if (!letter) return;
      const k = String(originIndex);
      this.practiceExamChoices = { ...this.practiceExamChoices, [k]: letter };
      const total = this.practiceQuizCardsForRender.length;
      const i = Number(cardIndex);
      if (Number.isInteger(i) && i >= 0 && i < total - 1) {
        this.practiceQuizActiveIndex = i + 1;
        this.$nextTick(() => {
          const el = document.getElementById(`practice-quiz-card-${this.practiceQuizActiveIndex}`);
          if (el) el.scrollIntoView({ block: "start", behavior: "smooth" });
        });
      }
    },
    practiceExamRunningOptionClass(question, optionLine) {
      const letter = extractQuizOptionLetter(optionLine);
      const k = String(question._originIndex);
      const sel = normalizeQuizAnswerKey(this.practiceExamChoices[k] || "");
      const base = "quiz-option-btn";
      if (sel && letter === sel) return base + " quiz-option-btn--selected";
      return base;
    },
    practiceExamReviewOptionClass(question, optionLine) {
      const att = this.practiceExamDisplayAttempt;
      if (!att || !att.answerMap) return "quiz-option-review";
      const letter = extractQuizOptionLetter(optionLine);
      const k = String(question._originIndex);
      const ans = att.answerMap[k] || "";
      const user = normalizeQuizAnswerKey((att.choices && att.choices[k]) || "");
      const parts = ["quiz-option-review"];
      if (letter && letter === ans) parts.push("quiz-option-review--truth");
      if (user && letter === user) {
        parts.push(user === ans ? "quiz-option-review--picked-ok" : "quiz-option-review--picked-bad");
      }
      return parts.join(" ");
    },
    practiceExamReviewVerdict(question) {
      const att = this.practiceExamDisplayAttempt;
      if (!att || !att.answerMap) return "";
      const k = String(question._originIndex);
      const user = normalizeQuizAnswerKey((att.choices && att.choices[k]) || "");
      const ans = att.answerMap[k] || "";
      if (!ans) return "—";
      if (!user) return "未作答";
      return user === ans ? "正确" : "错误";
    },
    practiceExamVerdictClass(question) {
      const v = this.practiceExamReviewVerdict(question);
      if (v === "正确") return "text-emerald-600";
      if (v === "错误" || v === "未作答") return "text-rose-600";
      return "text-ink/45";
    },
    toggleQuizAnswerPeek(qi) {
      if (this.practiceExamRunning || this.quizAnswersGlobalShow) return;
      const key = String(qi);
      const next = { ...this.quizAnswerPeek };
      if (next[key]) delete next[key];
      else next[key] = true;
      this.quizAnswerPeek = next;
    },
    onPracticeQuizCardShellClick(qi) {
      if (this.practiceExamRunning) return;
      this.toggleQuizAnswerPeek(qi);
    },
    _updatePracticeQuizActiveIndexFromLayout() {
      // 做题卡片模式下：题号只由「上一题/下一题/跳转」控制，禁止滚动自动改题号（会抖动/跳号）
      if (this.practiceExamRunning) return;
      const cards = this.practiceQuizCardsForRender;
      if (this.activeView !== "quiz" || this.quizSubMode !== "quiz" || !cards || !cards.length) {
        return;
      }
      const n = cards.length;
      if (this.practiceQuizActiveIndex > n - 1) {
        this.practiceQuizActiveIndex = Math.max(0, n - 1);
      }
      const band = 100;
      let best = 0;
      for (let i = 0; i < n; i++) {
        const el = document.getElementById(`practice-quiz-card-${i}`);
        if (!el) continue;
        const t = el.getBoundingClientRect().top;
        if (t <= band) best = i;
      }
      if (this.practiceQuizActiveIndex !== best) {
        this.practiceQuizActiveIndex = best;
      }
    },
    _detachPracticeQuizScrollListener() {
      if (this._practiceQuizOnScroll) {
        window.removeEventListener("scroll", this._practiceQuizOnScroll);
        this._practiceQuizOnScroll = null;
      }
      if (this._practiceQuizRaf) {
        cancelAnimationFrame(this._practiceQuizRaf);
        this._practiceQuizRaf = null;
      }
      if (this._practiceQuizScrollIdleTimer) {
        clearTimeout(this._practiceQuizScrollIdleTimer);
        this._practiceQuizScrollIdleTimer = null;
      }
      this.practiceQuizFabScrolling = false;
      this.practiceQuizScrollY = 0;
    },
    _syncPracticeQuizScrollListener() {
      this._detachPracticeQuizScrollListener();
      // 做题卡片模式：不绑定滚动监听，避免 scrollIntoView/手势滚动引发题号抖动
      if (this.practiceExamRunning) {
        this.practiceQuizFabScrolling = false;
        this.practiceQuizScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
        this.$nextTick(() => this._updatePracticeQuizFabNeedsScroll());
        return;
      }
      const cards = this.practiceQuizCardsForRender;
      if (this.activeView !== "quiz" || this.quizSubMode !== "quiz" || !cards || !cards.length) {
        return;
      }
      this._practiceQuizOnScroll = () => {
        this.practiceQuizScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
        this.practiceQuizFabScrolling = true;
        if (this._practiceQuizScrollIdleTimer) {
          clearTimeout(this._practiceQuizScrollIdleTimer);
        }
        this._practiceQuizScrollIdleTimer = setTimeout(() => {
          this._practiceQuizScrollIdleTimer = null;
          this.practiceQuizFabScrolling = false;
          this.practiceQuizScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
        }, 200);
        if (this._practiceQuizRaf) return;
        this._practiceQuizRaf = requestAnimationFrame(() => {
          this._practiceQuizRaf = null;
          this._updatePracticeQuizActiveIndexFromLayout();
        });
      };
      window.addEventListener("scroll", this._practiceQuizOnScroll, { passive: true });
      this.practiceQuizScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
      this._updatePracticeQuizActiveIndexFromLayout();
      this.$nextTick(() => this._updatePracticeQuizFabNeedsScroll());
    },
    _updatePracticeQuizFabNeedsScroll() {
      if (this.activeView !== "quiz" || this.quizSubMode !== "quiz" || !this.practiceQuizCardsForRender.length) {
        this.practiceQuizFabNeedsScroll = true;
        return;
      }
      const el = document.documentElement;
      this.practiceQuizFabNeedsScroll = el.scrollHeight > el.clientHeight + 2;
      this.practiceQuizScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    },
    scrollToPracticeTop() {
      window.scrollTo({ top: 0, behavior: "smooth" });
      this.$nextTick(() => {
        setTimeout(() => this._updatePracticeQuizFabNeedsScroll(), 350);
      });
    },
    onPracticeQuizFabCountClick() {
      if (this.practiceQuizShowFabProgress) return;
      this.scrollToPracticeTop();
    },
    isQuizAnswerVisible(qi) {
      if (this.quizAnswersGlobalShow) return true;
      return !!this.quizAnswerPeek[String(qi)];
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
      this.resetQuizMatcherState();
      this.practiceBrowseResultFilter = "all";
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
