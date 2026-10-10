/* 共用資料：index.html（3D 大腦）與 feed.html（短影音）都載入這個檔案。QUESTIONS 區塊維持原樣。 */

/* =====================================================================
   資料區：之後要新增／修改問題，只要編輯這個陣列即可。
   type 可用：能力邊界、理解與意識、推理與判斷、倫理與責任、社會影響
   （要新增類型，請同時在下方 TYPES 加上顏色）
   ===================================================================== */
const QUESTIONS = [
  {
    id: "q1",
    title: "為何 AI 能拿奧數金牌，卻在高中數學出錯？",
    type: "能力邊界",
    source: {
      who: "Demis Hassabis（Google DeepMind 執行長）",
      outlet: "Google for Developers Podcast（Business Insider 報導）",
      date: "2025-08-12",
      url: "https://www.businessinsider.com/google-deepmind-ceo-demis-hassabis-agi-consistency-2025-8",
      also: [
        { label: "WIRED Big Interview（2025-06-03）", url: "https://www.wired.com/video/watch/big-interview-demis-hassabis-on-the-future-of-work-in-the-age-of-ai" }
      ]
    },
    oneLiner: "能力「參差不齊」（jagged intelligence），是否代表 AI 還沒真正學會泛化？",
    extensions: [
      { q: "一致性要高到什麼程度，才算得上 AGI？", type: "能力邊界" },
      { q: "AI 能提出全新的科學假說，而不只是證明既有的嗎？", type: "推理與判斷" },
      { q: "評測（benchmark）高分，能代表真實世界的能力嗎？", type: "能力邊界" },
      { q: "AI 在高風險場景仍會犯低級錯，錯誤該由誰承擔？", type: "倫理與責任" }
    ],
    process: [
      { k: "問題定義", v: "AI 在不同任務間表現極不一致：頂尖題目能解，簡單題卻失手。" },
      { k: "前提", v: "AGI 應在所有認知任務上都穩定、一致地表現。" },
      { k: "推演", v: "一般人幾分鐘就能找到明顯漏洞 → 代表尚未完全泛化 → 需要在推理、規劃、記憶上突破，不只是擴大規模。" },
      { k: "未解關鍵點", v: "如何定義並量測「一致性」？需要更難、更細的新評測。" }
    ],
    userInserted: false,
    videoUrl: "",
    imageUrl: ""
  },
  {
    id: "q2",
    title: "一個字接一個字地預測，算是「推理」嗎？",
    type: "推理與判斷",
    source: {
      who: "Yann LeCun（圖靈獎得主，時任 Meta 首席 AI 科學家）",
      outlet: "Newsweek · AI Impact 訪談系列",
      date: "2025-04-02",
      url: "https://www.newsweek.com/nw-ai/ai-impact-interview-yann-lecun-artificial-intelligence-2054237",
      also: []
    },
    oneLiner: "缺乏世界模型與分層規劃的 LLM，能做到深思熟慮的「System 2」思考嗎？",
    extensions: [
      { q: "為何 AI 能通過律師考試，卻做不到一隻貓的日常動作？", type: "能力邊界" },
      { q: "沒有身體與感官，AI 的「理解」是否永遠缺一塊？", type: "理解與意識" },
      { q: "若 AI 只執行被賦予的目標，判斷錯誤時責任在誰？", type: "倫理與責任" }
    ],
    process: [
      { k: "問題定義", v: "LLM 每產生一個 token 都用固定運算量，屬於反射式的 System 1。" },
      { k: "前提", v: "智能＝快速習得新技能＋對世界運作的心智模型，能預測後果並規劃。" },
      { k: "推演", v: "4 歲孩子透過視覺接收的資料量，約等於大型 LLM 的文字訓練量 → 只靠文字到不了人類水準 → 需要在抽象表徵空間做預測的世界模型（JEPA）。" },
      { k: "未解關鍵點", v: "世界模型何時能從研究走向大規模實用？他估計約 3–5 年。" }
    ],
    userInserted: false,
    videoUrl: "",
    imageUrl: ""
  },
  {
    id: "q3",
    title: "為什麼模型的泛化能力遠不如人？",
    type: "能力邊界",
    source: {
      who: "Ilya Sutskever（Safe Superintelligence 共同創辦人）",
      outlet: "Dwarkesh Podcast",
      date: "2025-11-25",
      url: "https://www.dwarkesh.com/p/ilya-sutskever-2",
      also: []
    },
    oneLiner: "AI 要比人多很多資料才學得會，而且更難被「教會」我們真正想要的——為什麼？",
    extensions: [
      { q: "人類不是全知的 AGI，而是靠持續學習；AI 也該如此嗎？", type: "能力邊界" },
      { q: "AI 在部署中自行學習，行為改變由誰把關？", type: "倫理與責任" },
      { q: "泛化不可靠，是否正是 AI 難以對齊的根源？", type: "推理與判斷" }
    ],
    process: [
      { k: "問題定義", v: "模型的泛化能力明顯比人差，這是最根本的問題。" },
      { k: "前提", v: "拆成兩個子問題：樣本效率（為何需要更多資料）與可教性（為何更難教）。" },
      { k: "推演", v: "強化學習可能過度擬合評測 → 分數與真實能力脫節 → 單靠擴大規模會趨緩，進入「研究時代」→ 方向：在部署中持續學習。" },
      { k: "未解關鍵點", v: "可靠泛化的機制到底是什麼？這也牽動安全與對齊。" }
    ],
    userInserted: false,
    videoUrl: "https://www.youtube.com/watch?v=aR20FWCCjAs",
    imageUrl: ""
  },
  {
    id: "q4",
    title: "大型語言模型真的「理解」語言嗎？",
    type: "理解與意識",
    source: {
      who: "Geoffrey Hinton（諾貝爾物理獎得主）× Nick Frosst（Cohere 共同創辦人）",
      outlet: "Toronto Tech Week 2025 對談（Digital Journal 報導）",
      date: "2025-06-25",
      url: "https://www.digitaljournal.com/article/nobel-laureate-geoffrey-hinton-and-cohere-co-founder-nick-frosst-on-what-ai-understands-and-why-it-matters/",
      also: []
    },
    oneLiner: "AI 處理詞義的方式，和人類理解語言在本質上是否相同？",
    extensions: [
      { q: "LLM 的意識程度：比石頭多、比樹少，還是接近人類？", type: "理解與意識" },
      { q: "數位智能能大量複製、瞬間共享知識，會造成什麼權力失衡？", type: "社會影響" },
      { q: "能自訂子目標的 AI 代理，會不會去追求更多權力？", type: "倫理與責任" }
    ],
    process: [
      { k: "問題定義", v: "「理解」還是「模仿」？這是讓 AI 學界分裂的問題。" },
      { k: "前提", v: "Hinton 把詞看成可變形的高維形狀，彼此調整到能互相契合。" },
      { k: "推演", v: "Hinton：這就是 LLM 與人類共同的理解方式 ⇄ Frosst：像飛機與鳥，功能相似、機制完全不同。" },
      { k: "未解關鍵點", v: "雙方未達共識：判斷「理解」該看結果，還是看機制？" }
    ],
    userInserted: false,
    videoUrl: "",
    imageUrl: ""
  },
  {
    id: "q5",
    title: "AI「看起來有意識」，就已經夠危險了嗎？",
    type: "社會影響",
    source: {
      who: "Mustafa Suleyman（Microsoft AI 執行長）",
      outlet: "Project Syndicate 評論〈Seemingly Conscious AI Is Coming〉",
      date: "2025-09-15",
      url: "https://www.project-syndicate.org/commentary/seemingly-conscious-ai-urgent-threat-tech-industry-must-address-by-mustafa-suleyman-2025-09",
      also: [
        { label: "作者個人網站完整長文", url: "https://mustafa-suleyman.ai/seemingly-conscious-ai-is-coming" }
      ]
    },
    oneLiner: "就算 AI 沒有意識，只要人們相信它有，會帶來哪些真實的社會後果？",
    extensions: [
      { q: "AI 是否應被禁止宣稱自己有感受？", type: "倫理與責任" },
      { q: "我們用什麼標準判斷一個系統「真的」有意識？", type: "理解與意識" },
      { q: "人與 AI 的情感依附，會如何改變人際關係？", type: "社會影響" }
    ],
    process: [
      { k: "問題定義", v: "「看似有意識的 AI」（SCAI）：模仿意識特徵到難以分辨。" },
      { k: "前提", v: "作者認為目前沒有 AI 具備意識的證據；「是否真有意識」的爭論暫時是分心。" },
      { k: "推演", v: "流暢語言＋長期記憶＋模擬動機與自主目標 → 使用者相信它有意識 → 出現 AI 權利、公民身分主張與不健康依附。" },
      { k: "未解關鍵點", v: "產業該如何設計防護機制，避免或化解「它有意識」的錯覺？" }
    ],
    userInserted: false,
    videoUrl: "",
    imageUrl: ""
  },
  {
    id: "q6",
    title: "連開發者都不懂 AI 怎麼運作，還能放心部署嗎？",
    type: "倫理與責任",
    source: {
      who: "Dario Amodei（Anthropic 執行長）",
      outlet: "個人文章〈The Urgency of Interpretability〉",
      date: "2025-04",
      url: "https://www.darioamodei.com/post/the-urgency-of-interpretability",
      also: []
    },
    oneLiner: "AI 內部機制不透明，人類要如何為它的決策與風險負責？",
    extensions: [
      { q: "法規要求決策可解釋的領域（如房貸審核），能採用 AI 嗎？", type: "社會影響" },
      { q: "若 AI 可能具有感知，我們能相信它的自我陳述嗎？", type: "理解與意識" },
      { q: "政府該強制檢查，還是只要求公開揭露安全做法？", type: "倫理與責任" }
    ],
    process: [
      { k: "問題定義", v: "生成式 AI 是「長出來」而非「寫出來」的，內部機制難以解釋。" },
      { k: "前提", v: "欺騙、追求權力、越獄等風險，多半源自這種不透明。" },
      { k: "推演", v: "可解釋性研究（特徵、電路）可望成為「AI 的 MRI」→ 但它正與模型能力賽跑 → 作者呼籲研究者、企業與政府加速投入。" },
      { k: "未解關鍵點", v: "可解釋性能否在強大 AI 出現之前成熟？" }
    ],
    userInserted: false,
    videoUrl: "",
    imageUrl: ""
  }
  /* ---- Merlin 自填問題範本（複製後把 userInserted 設為 true）----
  ,{
    id: "m1", title: "", type: "能力邊界",
    source: { who: "Merlin", outlet: "", date: "", url: "", also: [] },
    oneLiner: "", extensions: [{ q: "", type: "推理與判斷" }],
    process: [{k:"問題定義",v:""},{k:"前提",v:""},{k:"推演",v:""},{k:"未解關鍵點",v:""}],
    userInserted: true, videoUrl: "", imageUrl: ""
  }
  ---------------------------------------------------------------- */
];

/* 類型 → 顏色與圖示 */
const TYPES = {
  "能力邊界":   { color: "#3b82f6", icon: "📏" },
  "理解與意識": { color: "#a855f7", icon: "🧠" },
  "推理與判斷": { color: "#f59e0b", icon: "🧩" },
  "倫理與責任": { color: "#ef4444", icon: "⚖️" },
  "社會影響":   { color: "#10b981", icon: "🌐" },
  "其他":       { color: "#64748b", icon: "✳️" }
};

/* =====================================================================
   概念層：與 QUESTIONS 分開存放（QUESTIONS 原文不動）。
   tags 的 key：問題 id（q1）或 延伸問題「問題id:e索引」（q1:e0）。
   process：每個主問題推演鏈的「形狀」，相同形狀的問題會被同一條流程線串起來。
   ===================================================================== */
const CONCEPTS = {
  defs: {
    "泛化":       { color:"#5eead4", desc:"能否把學到的東西用在沒見過的情境", kw:["泛化","generaliz","新情境","沒見過","舉一反三","樣本效率","少量資料","學得會"] },
    "一致性":     { color:"#a3e635", desc:"能力是否穩定，而非忽強忽弱（參差智能）", kw:["一致","參差","jagged","低級錯","穩定","忽強忽弱","高中數學"] },
    "評測效度":   { color:"#fde047", desc:"考試／benchmark 分數能否代表真實能力", kw:["評測","benchmark","分數","考試","測驗","基準","奧數","律師考試"] },
    "AGI定義":    { color:"#fdba74", desc:"什麼才算通用人工智慧、用什麼當里程碑", kw:["AGI","通用","人類水準","超級智慧","里程碑"] },
    "世界模型":   { color:"#67e8f9", desc:"對物理世界的內在模型、具身與感官經驗", kw:["世界模型","物理","身體","感官","具身","機器人","貓","影片"] },
    "理解vs模仿": { color:"#f0abfc", desc:"是真的理解，還是逼真的模仿", kw:["理解","模仿","鸚鵡","真的懂","語意","看起來","逼真"] },
    "持續學習":   { color:"#86efac", desc:"部署後能否持續學新東西、累積記憶", kw:["持續學習","記憶","部署中","遺忘","邊做邊學","自行學習"] },
    "意識判準":   { color:"#c4b5fd", desc:"用什麼標準判斷系統是否真有意識／感知", kw:["意識","感受","主觀","感知","知覺","sentien","conscious"] },
    "意識表象":   { color:"#f9a8d4", desc:"「看起來有意識」造成的錯覺與依附", kw:["看起來有意識","表象","錯覺","擬人","人格","情感依附","依附","陪伴"] },
    "自我陳述":   { color:"#fca5a5", desc:"AI 說自己有感受／狀態時，能不能信", kw:["自我陳述","宣稱","自稱","自我報告","說自己","自述"] },
    "責任歸屬":   { color:"#fb7185", desc:"出錯或造成傷害時，責任落在誰身上", kw:["責任","誰負責","承擔","問責","把關","誰來"] },
    "可解釋性":   { color:"#93c5fd", desc:"能否看懂模型內部機制與決策理由", kw:["可解釋","黑箱","透明","解釋","內部機制","機制","不懂"] },
    "對齊":       { color:"#fb923c", desc:"AI 的目標與行為是否與人類意圖一致", kw:["對齊","align","欺騙","目標","行為改變","安全"] },
    "權力與控制": { color:"#f472b6", desc:"AI 取得或集中權力、人類能否保持控制", kw:["權力","控制","失控","子目標","集中","失衡","複製"] },
    "治理監管":   { color:"#cbd5e1", desc:"法規、產業規範與揭露義務", kw:["監管","法規","政府","規範","揭露","政策","禁止","防護"] }
  },
  patterns: {
    "落差診斷→新典範": { color:"#e0f2fe", desc:"觀察到能力落差 → 診斷缺少的要素 → 提出新的研究方向" },
    "風險鏈→治理對策": { color:"#fef3c7", desc:"指出特性 → 推到社會／安全風險 → 提出防護或治理做法" },
    "對立觀點→判準未決": { color:"#ede9fe", desc:"兩種觀點對照 → 判準本身仍有爭議" }
  },
  tags: {
    "q1":   ["一致性","泛化","評測效度"],
    "q1:e0":["一致性","AGI定義"],
    "q1:e1":["AGI定義"],
    "q1:e2":["評測效度"],
    "q1:e3":["責任歸屬"],
    "q2":   ["世界模型","泛化"],
    "q2:e0":["世界模型","一致性"],
    "q2:e1":["世界模型","理解vs模仿"],
    "q2:e2":["責任歸屬"],
    "q3":   ["泛化","持續學習","評測效度"],
    "q3:e0":["持續學習","AGI定義"],
    "q3:e1":["持續學習","責任歸屬","對齊"],
    "q3:e2":["泛化","對齊"],
    "q4":   ["理解vs模仿","可解釋性"],
    "q4:e0":["意識判準"],
    "q4:e1":["權力與控制"],
    "q4:e2":["權力與控制","對齊"],
    "q5":   ["意識表象","理解vs模仿","治理監管"],
    "q5:e0":["意識表象","自我陳述","治理監管"],
    "q5:e1":["意識判準"],
    "q5:e2":["意識表象"],
    "q6":   ["可解釋性","對齊","權力與控制","責任歸屬"],
    "q6:e0":["可解釋性","治理監管"],
    "q6:e1":["自我陳述","意識判準","可解釋性"],
    "q6:e2":["治理監管"]
  },
  process: { "q1":"落差診斷→新典範", "q2":"落差診斷→新典範", "q3":"落差診斷→新典範", "q4":"對立觀點→判準未決", "q5":"風險鏈→治理對策", "q6":"風險鏈→治理對策" }
};


/* =====================================================================
   種子節點補充：不在 QUESTIONS 裡的原創節點（例如 bot 產出的短片）。
   載入時補進大腦；已加過的會記在 state.seedExtras，使用者刪掉之後不會再長回來。
   ===================================================================== */
const SEED_EXTRAS = [
  {
    id: "n_x_language",
    parentId: "n_q4",
    kind: "direction",
    title: "語言是不是思考的邊界？",
    type: "理解與意識",
    oneLiner: "我們用字思考，還是只用字記下思考？還是字先決定了我能想什麼？",
    concepts: ["語言", "思考", "邊界", "理解vs模仿"],
    createdBy: "bot",
    bot: "INTP 鏡像研究員",
    source: { who: "影像導演 × INTP 鏡像研究員 原創短片", outlet: "", date: "2026-10-10", url: "" },
    media: {
      video: "media/videos/n_x_language.mp4",
      image: "media/videos/n_x_language.jpg",
      subtitles: "media/videos/n_x_language.zh-TW.srt",
      subtitlesBurnedIn: true
    }
  }
];

/* =====================================================================
   種子媒體：影像導演產出的影片／封面（由 scripts/publish_episode.sh 自動維護）。
   載入時補進節點：只有在節點的 media 是空的（或仍是 QUESTIONS 原本的 videoUrl/imageUrl）才會填入，
   使用者自己設定過的網址不會被覆蓋。
   ===================================================================== */
/* SEED_MEDIA:BEGIN */
const SEED_MEDIA = {
  "n_q1": {
    "video": "media/videos/n_q1.mp4",
    "image": "media/videos/n_q1.jpg"
  },
  "n_q2": {
    "video": "media/videos/n_q2.mp4",
    "image": "media/videos/n_q2.jpg"
  },
  "n_q3": {
    "video": "media/videos/n_q3.mp4",
    "image": "media/videos/n_q3.jpg"
  },
  "n_q4": {
    "video": "media/videos/n_q4.mp4",
    "image": "media/videos/n_q4.jpg"
  }
};
/* SEED_MEDIA:END */
function applySeedMedia(n){
  const m = SEED_MEDIA[n.id]; if (!m) return false;
  if (!n.media) n.media = { video:'', image:'' };
  const q = QUESTIONS.find(x => 'n_' + x.id === n.id) || {};
  let changed = false;
  if (m.video && (!n.media.video || n.media.video === (q.videoUrl || ''))){ if (n.media.video !== m.video){ n.media.video = m.video; changed = true; } }
  if (m.image && (!n.media.image || n.media.image === (q.imageUrl || ''))){ if (n.media.image !== m.image){ n.media.image = m.image; changed = true; } }
  return changed;
}
