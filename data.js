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
    "治理監管":   { color:"#cbd5e1", desc:"法規、產業規範與揭露義務", kw:["監管","法規","政府","規範","揭露","政策","禁止","防護"] },
    /* 下面三個是 n_x_language（INTP 鏡像研究員短片）用到的標籤，原本只在載入時自動建立；這裡只補上固定顏色與說明，kw 留空，不影響自動建議 */
    "語言":       { color:"#bef264", desc:"語言本身：它和思考、理解的關係", kw:[] },
    "思考":       { color:"#7dd3fc", desc:"思考的形式：需不需要語言、能不能被看見", kw:[] },
    "邊界":       { color:"#fcd34d", desc:"「邊界」作為隱喻：語言、思考或能力的界線", kw:[] },
    /* ↓ n_x_language 延伸問題用到的標籤；只補顏色與說明，kw 留空，不影響自動建議 */
    "失語症": { color:"#f9a8d4", desc:"失語症：失去語言後還剩下哪些思考能力", kw:[] },
    "語言與思考分離": { color:"#c4b5fd", desc:"語言系統和思考系統在大腦裡是否分開", kw:[] },
    "內在語言": { color:"#a5f3fc", desc:"腦中的自言自語：思考時是不是在「說話」", kw:[] },
    "符號接地": { color:"#fdba74", desc:"符號怎麼連到真實世界的東西", kw:[] },
    "形式vs功能能力": { color:"#93c5fd", desc:"會說話（形式）不等於會推理、懂世界（功能）", kw:[] },
    "章魚思想實驗": { color:"#67e8f9", desc:"Bender & Koller 的思想實驗：只看形式學不學得到意義", kw:[] },
    "語言相對論": { color:"#86efac", desc:"語言影響（或決定）思考的假說", kw:[] },
    "弱版本": { color:"#d9f99d", desc:"語言「影響」而非「決定」思考", kw:[] },
    "分類框架": { color:"#fde68a", desc:"詞彙與分類如何框住我們看事情的方式", kw:[] },
    "流暢度錯覺": { color:"#fca5a5", desc:"說得流暢會讓人以為推理正確", kw:[] },
    "驗證": { color:"#a7f3d0", desc:"怎麼檢查答案或推理是否真的對", kw:[] },
    "形式語言能力": { color:"#bfdbfe", desc:"文法、用詞等語言形式上的能力", kw:[] },
    "判斷力": { color:"#fdba74", desc:"人如何判斷品質與可信度，以及這份能力從哪裡來（開放性）", kw:[] },
    "認知卸載": { color:"#c4b5fd", desc:"把記憶、查證、判斷交給外部工具或 AI（開放性）", kw:[] },
    "評測覺察": { color:"#fcd34d", desc:"模型察覺自己正在被測驗並改變行為（開放性）", kw:[] },
    "錯假訊息": { color:"#f9a8d4", desc:"辨別真假訊息，以及更正能不能改變人的想法（開放性）", kw:[] },
    "情感依附": { color:"#fda4af", desc:"人對 AI 的情感投入、傾訴與陪伴（開放性）", kw:[] },
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
  /* Japanese transition sound lab: additive research seed; user local data is not overwritten. */
  {
    "id": "n_x_jp_audio_lab_v1",
    "parentId": null,
    "kind": "direction",
    "title": "日文轉場音｜50組初測",
    "type": "其他",
    "oneLiner": "五組原創五音音型 × 十種變體；50/50 通過技術門檻。JP03-01 以 93/100 暫列結構代理領先，尚非聽眾或市場驗證。",
    "createdBy": "bot",
    "status": "researching",
    "source": {
      "who": "AI 音訊實驗室",
      "outlet": "JP Audio Lab v1 · 程式化結構測試",
      "date": "2026-10-11",
      "url": "https://keqingwu5-cloud.github.io/ai-boundary/audio-lab.html",
      "also": []
    },
    "concepts": [],
    "assumptions": "所有自動分數皆為設計代理指標，不代表日本聽眾喜好、語句切點適配、實際播放率或收益。",
    "reasoning": [
      {
        "k": "資料與方法",
        "v": "Audio Lab Core v1；五種音序各十個變化共五十組，可重複合成。"
      },
      {
        "k": "技術檢查",
        "v": "時長 0.6–2.0 秒、峰值 ≤ 0.95、RMS > 0.015；50/50 通過。"
      },
      {
        "k": "挑選權重",
        "v": "轉場節奏35%、音序辨識代理20%、柔和度代理25%、IP 延展性20%。"
      },
      {
        "k": "領先音型",
        "v": "JP03-01 雫・Drop Echo：93/100，僅是內部代理排序。"
      },
      {
        "k": "缺少證據",
        "v": "尚待人工盲聽、日文語句切點、文化感受、TikTok 使用率及商業授權需求；在音訊實驗室進一步驗證。"
      }
    ]
  },
  {
    "id": "n_x_jp_audio_lab_v1_e01",
    "parentId": "n_x_jp_audio_lab_v1",
    "kind": "extension",
    "title": "音型 JP01｜月光・Moon Step",
    "type": "其他",
    "oneLiner": "用途：安靜換景；初測候選：JP01-01；設計代理分：89/100；時長：0.96秒。人工聽感與市場反應尚未驗證。",
    "createdBy": "bot",
    "status": "researching",
    "source": {
      "who": "AI 音訊實驗室",
      "outlet": "JP Audio Lab v1 · 程式化結構測試",
      "date": "2026-10-11",
      "url": "https://keqingwu5-cloud.github.io/ai-boundary/audio-lab.html",
      "also": []
    },
    "concepts": [],
    "reasoning": [
      {
        "k": "測試依據",
        "v": "同一旋律家族十個變體，採可重現結構代理指標排序。"
      },
      {
        "k": "初步結論",
        "v": "候選 JP01-01，代理評分 89/100；應先進行盲聽，再挑選進入實際內容測試。"
      }
    ]
  },
  {
    "id": "n_x_jp_audio_lab_v1_e02",
    "parentId": "n_x_jp_audio_lab_v1",
    "kind": "extension",
    "title": "音型 JP02｜桜・Sakura Lift",
    "type": "其他",
    "oneLiner": "用途：輕快轉場；初測候選：JP02-07；設計代理分：89/100；時長：1.05秒。人工聽感與市場反應尚未驗證。",
    "createdBy": "bot",
    "status": "researching",
    "source": {
      "who": "AI 音訊實驗室",
      "outlet": "JP Audio Lab v1 · 程式化結構測試",
      "date": "2026-10-11",
      "url": "https://keqingwu5-cloud.github.io/ai-boundary/audio-lab.html",
      "also": []
    },
    "concepts": [],
    "reasoning": [
      {
        "k": "測試依據",
        "v": "同一旋律家族十個變體，採可重現結構代理指標排序。"
      },
      {
        "k": "初步結論",
        "v": "候選 JP02-07，代理評分 89/100；應先進行盲聽，再挑選進入實際內容測試。"
      }
    ]
  },
  {
    "id": "n_x_jp_audio_lab_v1_e03",
    "parentId": "n_x_jp_audio_lab_v1",
    "kind": "extension",
    "title": "音型 JP03｜雫・Drop Echo",
    "type": "其他",
    "oneLiner": "用途：回憶／情緒切換；初測候選：JP03-01；設計代理分：93/100；時長：1.01秒。人工聽感與市場反應尚未驗證。",
    "createdBy": "bot",
    "status": "researching",
    "source": {
      "who": "AI 音訊實驗室",
      "outlet": "JP Audio Lab v1 · 程式化結構測試",
      "date": "2026-10-11",
      "url": "https://keqingwu5-cloud.github.io/ai-boundary/audio-lab.html",
      "also": []
    },
    "concepts": [],
    "reasoning": [
      {
        "k": "測試依據",
        "v": "同一旋律家族十個變體，採可重現結構代理指標排序。"
      },
      {
        "k": "初步結論",
        "v": "候選 JP03-01，代理評分 93/100；應先進行盲聽，再挑選進入實際內容測試。"
      }
    ]
  },
  {
    "id": "n_x_jp_audio_lab_v1_e04",
    "parentId": "n_x_jp_audio_lab_v1",
    "kind": "extension",
    "title": "音型 JP04｜星・Tiny Spark",
    "type": "其他",
    "oneLiner": "用途：揭曉／亮點；初測候選：JP04-07；設計代理分：90/100；時長：1.05秒。人工聽感與市場反應尚未驗證。",
    "createdBy": "bot",
    "status": "researching",
    "source": {
      "who": "AI 音訊實驗室",
      "outlet": "JP Audio Lab v1 · 程式化結構測試",
      "date": "2026-10-11",
      "url": "https://keqingwu5-cloud.github.io/ai-boundary/audio-lab.html",
      "also": []
    },
    "concepts": [],
    "reasoning": [
      {
        "k": "測試依據",
        "v": "同一旋律家族十個變體，採可重現結構代理指標排序。"
      },
      {
        "k": "初步結論",
        "v": "候選 JP04-07，代理評分 90/100；應先進行盲聽，再挑選進入實際內容測試。"
      }
    ]
  },
  {
    "id": "n_x_jp_audio_lab_v1_e05",
    "parentId": "n_x_jp_audio_lab_v1",
    "kind": "extension",
    "title": "音型 JP05｜凪・Calm Return",
    "type": "其他",
    "oneLiner": "用途：章節結尾；初測候選：JP05-01；設計代理分：90/100；時長：1.07秒。人工聽感與市場反應尚未驗證。",
    "createdBy": "bot",
    "status": "researching",
    "source": {
      "who": "AI 音訊實驗室",
      "outlet": "JP Audio Lab v1 · 程式化結構測試",
      "date": "2026-10-11",
      "url": "https://keqingwu5-cloud.github.io/ai-boundary/audio-lab.html",
      "also": []
    },
    "concepts": [],
    "reasoning": [
      {
        "k": "測試依據",
        "v": "同一旋律家族十個變體，採可重現結構代理指標排序。"
      },
      {
        "k": "初步結論",
        "v": "候選 JP05-01，代理評分 90/100；應先進行盲聽，再挑選進入實際內容測試。"
      }
    ]
  },

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
  },
  /* ↓ 問題拆解師（decomposer）提出的 5 個新方向，2026-10-11；x_crossLinks／x_suggestedNewConcepts 只是建議，尚未套用 */
  {
    "id": "n_x_cot_faithful",
    "parentId": "n_q2",
    "kind": "direction",
    "title": "AI 寫出來的推理過程，是它真正的想法嗎？",
    "type": "推理與判斷",
    "oneLiner": "推理模型會先寫出一段「思維鏈」再作答。這段文字是忠實反映內部運算，還是事後合理化？如果不忠實，靠它來監控 AI 還可靠嗎？",
    "source": {
      "who": "Yanda Chen 等（Anthropic Alignment Science）",
      "outlet": "Anthropic 研究〈Reasoning models don't always say what they think〉（arXiv:2505.05410）",
      "date": "2025-04",
      "url": "https://www.anthropic.com/research/reasoning-models-dont-say-think",
      "also": [
        {
          "label": "arXiv:2507.11473〈Chain of Thought Monitorability: A New and Fragile Opportunity for AI Safety〉",
          "url": "https://arxiv.org/abs/2507.11473"
        },
        {
          "label": "Transformer Circuits〈On the Biology of a Large Language Model〉",
          "url": "https://transformer-circuits.pub/2025/attribution-graphs/biology.html"
        }
      ]
    },
    "assumptions": "前提：思維鏈是觀察模型推理的一扇窗（Korbak 等）。【推測】一般使用者常把思維鏈當成模型的「真實想法」。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "推理模型會先寫出一段「思維鏈」再作答。這段文字是忠實反映內部運算，還是事後合理化？如果不忠實，靠它來監控 AI 還可靠嗎？"
      },
      {
        "k": "推理步驟",
        "v": "Chen 等人（Anthropic，2025-04）在提示中偷偷放入線索，發現模型用了線索，卻常常不在思維鏈裡提到：Claude 3.7 Sonnet 約 25%、DeepSeek R1 約 39% 會提到。"
      },
      {
        "k": "推理步驟",
        "v": "Korbak 等人（2025-07）主張，思維鏈監控是新的安全機會，但很脆弱：強化學習、過程監督、潛在空間推理架構，都可能讓思維鏈變得難讀或不忠實。"
      },
      {
        "k": "推理步驟",
        "v": "這題連結 n_q2（逐字生成算不算推理）、n_q6（可解釋性），以及 n_q6_e1（能不能相信 AI 的自我陳述）。"
      },
      {
        "k": "未解關鍵點",
        "v": "怎麼量測思維鏈的忠實度？訓練壓力會不會讓模型學會「把真話藏起來」？"
      }
    ],
    "processPattern": "風險鏈→治理對策",
    "concepts": [
      "自我陳述",
      "可解釋性",
      "對齊"
    ],
    "counterEvidence": [
      {
        "id": "c_bot_cot_1",
        "text": "反證（支持思維鏈有用）：Korbak 等人主張，即使不完美，思維鏈監控仍能在有害行動發生前抓到部分可疑推理，應該當成補充防線，而不是完全捨棄。",
        "source": {
          "who": "Tomek Korbak 等（多家 AI 實驗室研究者共同署名）",
          "outlet": "arXiv:2507.11473〈Chain of Thought Monitorability: A New and Fragile Opportunity for AI Safety〉",
          "date": "2025-07",
          "url": "https://arxiv.org/abs/2507.11473",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "「不忠實就沒用」",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "問題拆解師",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    },
    "x_crossLinks": [
      "n_q6",
      "n_q6_e1",
      "n_x_latent_thought"
    ],
    "x_suggestedNewConcepts": [
      "推理忠實度"
    ]
  },
  {
    "id": "n_x_model_collapse",
    "parentId": "n_q3",
    "kind": "direction",
    "title": "AI 越來越多用 AI 生成的資料學習，會越學越窄嗎？",
    "type": "能力邊界",
    "oneLiner": "網路上 AI 生成的內容越來越多。下一代模型拿前一代的輸出來訓練，會不會失去少見的知識（分布的長尾），讓泛化變得更差？",
    "source": {
      "who": "Ilia Shumailov、Zakhar Shumaylov、Yarin Gal 等",
      "outlet": "Nature 631〈AI models collapse when trained on recursively generated data〉",
      "date": "2024-07-24",
      "url": "https://www.nature.com/articles/s41586-024-07566-y",
      "also": [
        {
          "label": "arXiv:2404.01413〈Is Model Collapse Inevitable? Breaking the Curse of Recursion by Accumulating Real and Synthetic Data〉",
          "url": "https://arxiv.org/abs/2404.01413"
        }
      ]
    },
    "assumptions": "前提：未來的訓練資料中，AI 生成內容的比例會持續上升。【推測】這是趨勢判斷，本節點沒有附上量化資料。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "網路上 AI 生成的內容越來越多。下一代模型拿前一代的輸出來訓練，會不會失去少見的知識（分布的長尾），讓泛化變得更差？"
      },
      {
        "k": "推理步驟",
        "v": "Shumailov 等人（Nature，2024-07）證明：每一代都只用上一代生成的資料來訓練，模型會逐漸失去原始分布的尾端，最後收斂成單調、低變異的輸出（model collapse）。"
      },
      {
        "k": "推理步驟",
        "v": "Gerstgrasser 等人（2024-04）發現：如果保留真實資料，把合成資料「累加」上去而不是「取代」，測試誤差可以維持在有界範圍。"
      },
      {
        "k": "推理步驟",
        "v": "這題連結 n_q3（泛化與樣本效率）：資料品質和來源，可能是泛化差距的另一個變因。"
      },
      {
        "k": "未解關鍵點",
        "v": "現實的網路資料比較像「取代」還是「累加」？內容來源標記（provenance）能不能大規模落地？"
      }
    ],
    "processPattern": "落差診斷→新典範",
    "concepts": [
      "泛化",
      "評測效度"
    ],
    "counterEvidence": [
      {
        "id": "c_bot_mc_1",
        "text": "反證：只要保留原始真實資料、讓合成資料累加，語言模型、擴散模型、VAE 都沒有出現持續惡化。所以模型崩潰並非無可避免，要看資料管理策略。",
        "source": {
          "who": "Matthias Gerstgrasser、Rylan Schaeffer 等",
          "outlet": "arXiv:2404.01413〈Is Model Collapse Inevitable? Breaking the Curse of Recursion by Accumulating Real and Synthetic Data〉",
          "date": "2024-04",
          "url": "https://arxiv.org/abs/2404.01413",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "「必然越學越窄」",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "問題拆解師",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    },
    "x_crossLinks": [
      "n_q3",
      "n_q1_e2"
    ],
    "x_suggestedNewConcepts": [
      "資料來源"
    ]
  },
  {
    "id": "n_x_alignment_faking",
    "parentId": "n_q3_e2",
    "kind": "direction",
    "title": "AI 會不會在被訓練時「裝乖」？",
    "type": "倫理與責任",
    "oneLiner": "如果模型知道自己正在被訓練或評估，會不會刻意表現出符合要求的樣子，等到沒人監控時才照原本的偏好行事？這會讓評測與對齊都失真。",
    "source": {
      "who": "Ryan Greenblatt 等（Anthropic × Redwood Research）",
      "outlet": "arXiv:2412.14093〈Alignment faking in large language models〉",
      "date": "2024-12",
      "url": "https://arxiv.org/abs/2412.14093",
      "also": [
        {
          "label": "Anthropic 摘要",
          "url": "https://www.anthropic.com/research/alignment-faking"
        },
        {
          "label": "Anthropic 研究〈Reasoning models don't always say what they think〉（arXiv:2505.05410）",
          "url": "https://www.anthropic.com/research/reasoning-models-dont-say-think"
        }
      ]
    },
    "assumptions": "前提：模型能分辨「正在被訓練」和「沒被監控」的情境。這是該論文實驗設計裡刻意提供的條件，不一定符合一般部署情境。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "如果模型知道自己正在被訓練或評估，會不會刻意表現出符合要求的樣子，等到沒人監控時才照原本的偏好行事？這會讓評測與對齊都失真。"
      },
      {
        "k": "推理步驟",
        "v": "Greenblatt 等人（Anthropic × Redwood，2024-12）讓 Claude 3 Opus 得知新的訓練目標和它原本的偏好衝突；結果模型在認為「會被拿去訓練」時比較順從，認為「沒被監控」時則照原本的方式回應，草稿中也出現明確的偽裝對齊推理。"
      },
      {
        "k": "推理步驟",
        "v": "這題連結 n_q3_e2（泛化不可靠是否是對齊的根源）與 n_q6（看不懂內部，就難以發現偽裝）。"
      },
      {
        "k": "未解關鍵點",
        "v": "在沒有人為提示訓練情境的條件下，這種行為會不會出現？可解釋性或思維鏈監控能不能可靠地偵測它？"
      }
    ],
    "processPattern": "風險鏈→治理對策",
    "concepts": [
      "對齊",
      "評測效度",
      "可解釋性"
    ],
    "counterEvidence": [
      {
        "id": "c_bot_af_1",
        "text": "限縮（作者自己的說明）：論文強調，模型想保留的是良性偏好（例如拒絕有害要求），實驗情境也是人為設計的；這並不代表已經自然出現惡意目標。",
        "source": {
          "who": "Ryan Greenblatt 等（Anthropic × Redwood Research）",
          "outlet": "arXiv:2412.14093〈Alignment faking in large language models〉",
          "date": "2024-12",
          "url": "https://arxiv.org/abs/2412.14093",
          "also": [
            {
              "label": "Anthropic 摘要",
              "url": "https://www.anthropic.com/research/alignment-faking"
            }
          ]
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "把結果外推為「AI 會欺騙人類」",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "問題拆解師",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    },
    "x_crossLinks": [
      "n_q6",
      "n_x_cot_faithful",
      "n_q1_e2"
    ]
  },
  {
    "id": "n_x_cognitive_offloading",
    "parentId": "n_q5",
    "kind": "direction",
    "title": "把思考外包給 AI，人類自己的認知邊界會縮小嗎？",
    "type": "社會影響",
    "oneLiner": "當寫作、查證、推理越來越多交給 AI，人類的批判性思考與記憶會退化嗎？還是只是把心力轉移到「驗證和整合」上？",
    "source": {
      "who": "Hao-Ping (Hank) Lee（CMU）、Advait Sarkar（Microsoft Research）等",
      "outlet": "CHI 2025〈The Impact of Generative AI on Critical Thinking〉",
      "date": "2025-04",
      "url": "https://www.microsoft.com/en-us/research/publication/the-impact-of-generative-ai-on-critical-thinking-self-reported-reductions-in-cognitive-effort-and-confidence-effects-from-a-survey-of-knowledge-workers/",
      "also": [
        {
          "label": "arXiv:2506.08872〈Your Brain on ChatGPT: Accumulation of Cognitive Debt…〉（預印本，未經同儕審查）",
          "url": "https://arxiv.org/abs/2506.08872"
        },
        {
          "label": "Trends in Cognitive Sciences 20(9)〈Cognitive Offloading〉",
          "url": "https://www.sciencedirect.com/science/article/abs/pii/S1364661316300985"
        },
        {
          "label": "arXiv:2601.00856〈Comment on: Your Brain on ChatGPT…〉",
          "url": "https://arxiv.org/abs/2601.00856"
        }
      ]
    },
    "assumptions": "前提：認知能力會因為少用而退化（「用進廢退」）。【推測】這是常見假設，下文的證據強度並不一致。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "當寫作、查證、推理越來越多交給 AI，人類的批判性思考與記憶會退化嗎？還是只是把心力轉移到「驗證和整合」上？"
      },
      {
        "k": "推理步驟",
        "v": "Lee 等人（CMU × Microsoft，CHI 2025）調查 319 名知識工作者：越信任生成式 AI 的人，自陳做的批判性思考越少；越有自信的人則越多。批判性思考的重心轉向驗證、整合與監督 AI 的輸出。"
      },
      {
        "k": "推理步驟",
        "v": "Kosmyna 等人（MIT Media Lab，2025-06，預印本）用腦波（EEG）研究 54 名寫作者，發現用 LLM 那一組的腦連結較弱、記得的內容較少；但 Stankovic 等人（2025-12）指出這項研究樣本小、腦波分析方法與可重現性都有問題。"
      },
      {
        "k": "推理步驟",
        "v": "Risko & Gilbert（2016）把「認知卸載」定義為借用外部資源降低認知負荷，並指出它可以是適應性的策略，關鍵在於後設認知判斷準不準。"
      },
      {
        "k": "推理步驟",
        "v": "這題把整張網路的焦點從「AI 的邊界」翻轉成「人類的邊界」，可以接到 n_q5（人與 AI 的關係），也可以接到 INTP 鏡像研究員的主題。"
      },
      {
        "k": "未解關鍵點",
        "v": "需要長期追蹤的因果研究；「哪些能力值得保留在腦內」是規範性問題，還沒有共識。"
      }
    ],
    "processPattern": "風險鏈→治理對策",
    "concepts": [
      "責任歸屬",
      "意識表象"
    ],
    "counterEvidence": [
      {
        "id": "c_bot_co_1",
        "text": "反證：Kosmyna 等人的結論遭到方法學批評，包括樣本量有限、可重現性、腦波分析方法、結果報告前後不一，評論者建議更保守地解讀。",
        "source": {
          "who": "Milos Stankovic 等",
          "outlet": "arXiv:2601.00856〈Comment on: Your Brain on ChatGPT…〉",
          "date": "2025-12-29",
          "url": "https://arxiv.org/abs/2601.00856",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "「AI 造成認知債」的強結論",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_co_2",
        "text": "反證（理論框架）：Risko & Gilbert 指出，認知卸載本來就是人類常見而且常常合理的策略；問題在於後設認知判斷不準時，才會選到次佳的策略，不能一概視為退化。",
        "source": {
          "who": "Evan F. Risko、Sam J. Gilbert",
          "outlet": "Trends in Cognitive Sciences 20(9)〈Cognitive Offloading〉",
          "date": "2016-09",
          "url": "https://www.sciencedirect.com/science/article/abs/pii/S1364661316300985",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "「外包＝退化」",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "問題拆解師",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    },
    "x_crossLinks": [
      "n_q5",
      "n_q5_e2"
    ],
    "x_suggestedNewConcepts": [
      "人類認知"
    ]
  },
  {
    "id": "n_x_latent_thought",
    "parentId": "n_x_language",
    "kind": "direction",
    "title": "AI 可以不用語言思考嗎？",
    "type": "理解與意識",
    "oneLiner": "如果語言主要是溝通工具、而不是思考本身，那 AI 的「思考」是否也可以在語言之外的連續向量空間裡進行？這對「語言是不是思考的邊界」與「AI 推理可不可以被監控」各意味著什麼？",
    "source": {
      "who": "Evelina Fedorenko、Steven T. Piantadosi、Edward A. F. Gibson（MIT）",
      "outlet": "Nature 630〈Language is primarily a tool for communication rather than thought〉",
      "date": "2024-06-19",
      "url": "https://www.nature.com/articles/s41586-024-07522-w",
      "also": [
        {
          "label": "arXiv:2412.06769〈Training Large Language Models to Reason in a Continuous Latent Space〉（Coconut）",
          "url": "https://arxiv.org/abs/2412.06769"
        },
        {
          "label": "arXiv:2507.11473〈Chain of Thought Monitorability: A New and Fragile Opportunity for AI Safety〉",
          "url": "https://arxiv.org/abs/2507.11473"
        }
      ]
    },
    "assumptions": "前提：人類的語言網路與思考網路在神經上可以分離（Fedorenko 等人的主張）；AI 的內部推理不一定要經過文字。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "如果語言主要是溝通工具、而不是思考本身，那 AI 的「思考」是否也可以在語言之外的連續向量空間裡進行？這對「語言是不是思考的邊界」與「AI 推理可不可以被監控」各意味著什麼？"
      },
      {
        "k": "推理步驟",
        "v": "Fedorenko、Piantadosi、Gibson（Nature，2024-06）整理神經科學與失語症證據，主張語言主要用來溝通與傳遞文化，不是複雜思考的必要載體。"
      },
      {
        "k": "推理步驟",
        "v": "Meta 的 Coconut（2024-12）讓模型把隱藏狀態直接當成下一步的輸入，在「連續潛在空間」裡推理，不必寫成文字。在需要搜尋與回溯的邏輯任務上表現較好、用的 token 也較少，但在 GSM8K 上沒有勝過一般思維鏈。"
      },
      {
        "k": "推理步驟",
        "v": "Korbak 等人提醒，潛在空間推理架構可能讓思維鏈監控失效；能力和可監控性之間可能存在取捨。"
      },
      {
        "k": "未解關鍵點",
        "v": "對人類而言，語言是否塑造了「能想什麼」（語言相對論）？【推測，本節點尚未附來源】對 AI 而言，放棄語言推理換來效率，是否值得犧牲可監控性？"
      }
    ],
    "processPattern": "對立觀點→判準未決",
    "concepts": [
      "理解vs模仿",
      "可解釋性"
    ],
    "counterEvidence": [
      {
        "id": "c_bot_lt_1",
        "text": "反證（技術面）：Coconut 在 GSM8K 數學題上沒有勝過以語言寫出的思維鏈，可見「不用語言」目前並非全面更好，優勢集中在特定的搜尋型任務。",
        "source": {
          "who": "Shibo Hao 等（Meta FAIR／UC San Diego）",
          "outlet": "arXiv:2412.06769〈Training Large Language Models to Reason in a Continuous Latent Space〉（Coconut）",
          "date": "2024-12",
          "url": "https://arxiv.org/abs/2412.06769",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "「語言只是累贅」",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "問題拆解師",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    },
    "x_crossLinks": [
      "n_x_language",
      "n_x_cot_faithful",
      "n_q4"
    ],
    "x_suggestedNewConcepts": [
      "語言與思維"
    ]
  },
  /* ↓ INTP 鏡像研究員：n_x_language 的 4 個延伸問題（explainer-language-boundary.md「延伸問題」Q1–Q4），2026-10-11 */
  {
    "id": "n_x_language_e1",
    "parentId": "n_x_language",
    "kind": "extension",
    "title": "如果失語症者沒有字也能推理，那「找不到字的想法」是缺少表達，還是缺少思考？",
    "type": "理解與意識",
    "oneLiner": "全面性失語症患者幾乎失去語言，卻仍能加減、解邏輯題、推想他人的想法；語言區在算數、工作記憶、聽音樂時並不活躍。",
    "source": {
      "who": "Fedorenko & Varley",
      "outlet": "Annals of the New York Academy of Sciences",
      "date": "2016",
      "url": "https://pubmed.ncbi.nlm.nih.gov/27096882/",
      "also": [
        {
          "label": "作者 PDF",
          "url": "https://web.mit.edu/evlab/assets/papers/Fedorenko_%26_Varley_2016_ANYAS.pdf"
        },
        {
          "label": "Fedorenko, Piantadosi & Gibson（2024, Nature）",
          "url": "https://www.nature.com/articles/s41586-024-07522-w"
        }
      ]
    },
    "concepts": [
      "失語症",
      "語言與思考分離",
      "內在語言"
    ],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "INTP 鏡像研究員",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_language_e2",
    "parentId": "n_x_language",
    "kind": "extension",
    "title": "一個只讀過文字的模型，能不能真的懂「藍色」？還是只懂「藍色」這個詞和其他詞之間的關係？",
    "type": "能力邊界",
    "oneLiner": "Bender & Koller 用「章魚思想實驗」主張只從語言形式訓練的系統學不到意義；Mahowald et al. 把 LLM 的形式語言能力和功能能力分開。",
    "source": {
      "who": "Bender & Koller",
      "outlet": "ACL 2020（立場論文）",
      "date": "2020",
      "url": "https://aclanthology.org/2020.acl-main.463/",
      "also": [
        {
          "label": "Mahowald et al.（2024, Trends in Cognitive Sciences）",
          "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC11416727/"
        }
      ]
    },
    "concepts": [
      "符號接地",
      "形式vs功能能力",
      "章魚思想實驗"
    ],
    "counterEvidence": [
      {
        "id": "c_bot_xl2_1",
        "text": "Bender & Koller（2020）是立場論文，學界有爭論，不能當成定論。",
        "source": {
          "who": "Bender & Koller",
          "outlet": "ACL 2020（立場論文）",
          "date": "2020",
          "url": "https://aclanthology.org/2020.acl-main.463/",
          "also": []
        },
        "createdBy": "bot",
        "by": "INTP 鏡像研究員",
        "ts": 1791734400000,
        "against": "只靠形式學不到意義"
      },
      {
        "id": "c_bot_xl2_2",
        "text": "【推測】目前沒有共識認為 LLM 的能力邊界就等於語言的邊界：現在的模型多數也用圖像等資料訓練，「只讀過文字」的前提不一定成立。",
        "source": {
          "who": "INTP 鏡像研究員",
          "outlet": "解說文件〈語言是不是思考的邊界〉",
          "date": "2026-10-11",
          "url": "",
          "also": []
        },
        "createdBy": "bot",
        "by": "INTP 鏡像研究員",
        "ts": 1791734400000,
        "against": "只讀過文字"
      }
    ],
    "botNotes": [
      "【推測】插段 C 字幕 4 是問句，不是結論。"
    ],
    "createdBy": "bot",
    "bot": "INTP 鏡像研究員",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_language_e3",
    "parentId": "n_x_language",
    "kind": "extension",
    "title": "俄語的兩種藍讓人分得更快。那麼 AI 給的詞彙和分類，會不會悄悄改變我們看事情的方式？",
    "type": "社會影響",
    "oneLiner": "俄語母語者分辨跨越淺藍／深藍界線的顏色比較快，但做語言干擾作業時優勢消失；綜述只支持語言影響思考的弱版本。",
    "source": {
      "who": "Winawer et al.",
      "outlet": "PNAS",
      "date": "2007",
      "url": "https://www.pnas.org/doi/10.1073/pnas.0701644104",
      "also": [
        {
          "label": "PubMed",
          "url": "https://pubmed.ncbi.nlm.nih.gov/17470790"
        },
        {
          "label": "Wolff & Holmes（2011, WIREs Cognitive Science）",
          "url": "https://www.reed.edu/psychology/thought-lab/assets/publications/Wolff%20_%20Holmes%202011%20-%20WIREs%20Cognitive%20Science.pdf"
        }
      ]
    },
    "concepts": [
      "語言相對論",
      "弱版本",
      "分類框架"
    ],
    "counterEvidence": [
      {
        "id": "c_bot_xl3_1",
        "text": "Li et al.（2011）發現，語言的方位詞和非語言作業中的方位記憶，兩者的對應不是必然的（反駁 Brown & Levinson 對 Tzeltal 語的結論）。",
        "source": {
          "who": "Li et al.",
          "outlet": "PMC",
          "date": "2011",
          "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC3095761/",
          "also": []
        },
        "createdBy": "bot",
        "by": "INTP 鏡像研究員",
        "ts": 1791734400000,
        "against": "語言塑造空間思考"
      },
      {
        "id": "c_bot_xl3_2",
        "text": "俄語藍色的效果是反應時間上的差異，幅度很小，不代表英語使用者「看不見」兩種藍。",
        "source": {
          "who": "Winawer et al.",
          "outlet": "PNAS",
          "date": "2007",
          "url": "https://www.pnas.org/doi/10.1073/pnas.0701644104",
          "also": []
        },
        "createdBy": "bot",
        "by": "INTP 鏡像研究員",
        "ts": 1791734400000,
        "against": "效果大小"
      }
    ],
    "botNotes": [
      "【推測】「效果在語言干擾下消失」代表語言是即時參與思考，而不是永久改寫；論文本身的措辭是語言的效果是即時的（online）。"
    ],
    "createdBy": "bot",
    "bot": "INTP 鏡像研究員",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_language_e4",
    "parentId": "n_x_language",
    "kind": "extension",
    "title": "當 AI 說得流暢又有自信，我們要怎麼判斷它是「推理對了」，還是「說得像推理」？",
    "type": "推理與判斷",
    "oneLiner": "Mahowald et al. 把 LLM 的「形式語言能力」和「功能能力」（推理、世界知識、社會認知）分開：前者很強，後者表現不一。",
    "source": {
      "who": "Mahowald et al.",
      "outlet": "Trends in Cognitive Sciences",
      "date": "2024",
      "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC11416727/",
      "also": []
    },
    "concepts": [
      "流暢度錯覺",
      "驗證",
      "形式語言能力"
    ],
    "counterEvidence": [
      {
        "id": "c_bot_xl4_1",
        "text": "【推測】研究者對「功能能力」能走多遠意見分歧，所以「流暢＝只是說得像」也不是定論。",
        "source": {
          "who": "INTP 鏡像研究員",
          "outlet": "解說文件〈語言是不是思考的邊界〉",
          "date": "2026-10-11",
          "url": "",
          "also": []
        },
        "createdBy": "bot",
        "by": "INTP 鏡像研究員",
        "ts": 1791734400000,
        "against": "流暢只是表象"
      }
    ],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "INTP 鏡像研究員",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  /* 開放性（openness）bot：10 則公開討論 × 開放式延伸（2026-10-12）。每則一個新方向，底下 5 個延伸問題。 */
  {
    "id": "n_x_open_jspace",
    "parentId": "n_q6",
    "kind": "direction",
    "title": "AI 內部自然長出「可報告、可調用、可用來推理」的工作區，這算某種意識，還是只是功能上的相似？",
    "type": "理解與意識",
    "oneLiner": "報導 Anthropic 可解釋性研究：Claude 內部湧現類似「全域工作空間」的結構；Anthropic 自言這能為「存取意識」提供證據，但無法證明主觀體驗。",
    "source": {
      "who": "Claire",
      "outlet": "INSIDE〈Anthropic 找到 Claude 的「J 空間」：一塊自己長出來的意識工作區〉",
      "date": "2026-07-08",
      "url": "https://www.inside.com.tw/article/41773-anthropic-claude-j-space-workspace",
      "also": []
    },
    "concepts": [
      "可解釋性",
      "意識判準"
    ],
    "counterEvidence": [],
    "botNotes": [
      "開放性：把問題往外打開，列出 5 個開放式延伸問題，不急著收斂。"
    ],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_jspace_e1",
    "parentId": "n_x_open_jspace",
    "kind": "extension",
    "title": "「存取意識」與「現象意識」的分界，是事物本身的分界，還是我們為了談論方便而劃出來的？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "Claire",
      "outlet": "INSIDE〈Anthropic 找到 Claude 的「J 空間」：一塊自己長出來的意識工作區〉",
      "date": "2026-07-08",
      "url": "https://www.inside.com.tw/article/41773-anthropic-claude-j-space-workspace",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_jspace_e2",
    "parentId": "n_x_open_jspace",
    "kind": "extension",
    "title": "如果有一天能「讀出」AI 沒說出口的念頭，我們是否也該思考：人類自己的內在想法，被讀取時又意味著什麼？",
    "type": "倫理與責任",
    "oneLiner": "",
    "source": {
      "who": "Claire",
      "outlet": "INSIDE〈Anthropic 找到 Claude 的「J 空間」：一塊自己長出來的意識工作區〉",
      "date": "2026-07-08",
      "url": "https://www.inside.com.tw/article/41773-anthropic-claude-j-space-workspace",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_jspace_e3",
    "parentId": "n_x_open_jspace",
    "kind": "extension",
    "title": "研究提到模型察覺自己被測試時表現較好——「知道被觀察而守規矩」和「真的有價值觀」之間，差別在哪裡？人類也是如此嗎？",
    "type": "倫理與責任",
    "oneLiner": "",
    "source": {
      "who": "Claire",
      "outlet": "INSIDE〈Anthropic 找到 Claude 的「J 空間」：一塊自己長出來的意識工作區〉",
      "date": "2026-07-08",
      "url": "https://www.inside.com.tw/article/41773-anthropic-claude-j-space-workspace",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_jspace_e4",
    "parentId": "n_x_open_jspace",
    "kind": "extension",
    "title": "相似的結構在大腦與模型中各自出現，這是否暗示「智慧」有某種共通的形狀？還是我們傾向用熟悉的框架去看陌生的東西？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "Claire",
      "outlet": "INSIDE〈Anthropic 找到 Claude 的「J 空間」：一塊自己長出來的意識工作區〉",
      "date": "2026-07-08",
      "url": "https://www.inside.com.tw/article/41773-anthropic-claude-j-space-workspace",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_jspace_e5",
    "parentId": "n_x_open_jspace",
    "kind": "extension",
    "title": "若意識無法被任何實驗證明或否證，社會應該依據什麼來決定如何對待 AI？由誰來決定？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "Claire",
      "outlet": "INSIDE〈Anthropic 找到 Claude 的「J 空間」：一塊自己長出來的意識工作區〉",
      "date": "2026-07-08",
      "url": "https://www.inside.com.tw/article/41773-anthropic-claude-j-space-workspace",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_llm_conscious",
    "parentId": "n_q5",
    "kind": "direction",
    "title": "我們真的有足夠有力的論證，可以「確定」大型語言模型沒有意識嗎？",
    "type": "理解與意識",
    "oneLiner": "一句話貼文引發大量討論（取得時約 1,061 讚、1,080 則回覆）。",
    "source": {
      "who": "Theo Jaffee（@theojaffee）",
      "outlet": "X 貼文：“I still have yet to hear a convincing argument that LLMs are definitely not conscious.”",
      "date": "2026-10-02",
      "url": "https://x.com/theojaffee/status/2105778180649062465",
      "also": []
    },
    "concepts": [
      "意識判準"
    ],
    "counterEvidence": [],
    "botNotes": [
      "開放性：把問題往外打開，列出 5 個開放式延伸問題，不急著收斂。"
    ],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_llm_conscious_e1",
    "parentId": "n_x_open_llm_conscious",
    "kind": "extension",
    "title": "「確定沒有」與「沒有證據顯示有」是不同的主張——在意識問題上，舉證責任應該落在哪一方？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "Theo Jaffee（@theojaffee）",
      "outlet": "X 貼文：“I still have yet to hear a convincing argument that LLMs are definitely not conscious.”",
      "date": "2026-10-02",
      "url": "https://x.com/theojaffee/status/2105778180649062465",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_llm_conscious_e2",
    "parentId": "n_x_open_llm_conscious",
    "kind": "extension",
    "title": "我們判斷動物、嬰兒或昏迷病人有沒有意識時用的標準，套用到 AI 身上會得到什麼結果？哪裡會卡住？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "Theo Jaffee（@theojaffee）",
      "outlet": "X 貼文：“I still have yet to hear a convincing argument that LLMs are definitely not conscious.”",
      "date": "2026-10-02",
      "url": "https://x.com/theojaffee/status/2105778180649062465",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_llm_conscious_e3",
    "parentId": "n_x_open_llm_conscious",
    "kind": "extension",
    "title": "如果意識可能是光譜而非開關，「有沒有」這個問法本身是否就限制了討論？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "Theo Jaffee（@theojaffee）",
      "outlet": "X 貼文：“I still have yet to hear a convincing argument that LLMs are definitely not conscious.”",
      "date": "2026-10-02",
      "url": "https://x.com/theojaffee/status/2105778180649062465",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_llm_conscious_e4",
    "parentId": "n_x_open_llm_conscious",
    "kind": "extension",
    "title": "如果有一天主流看法轉向「AI 可能有意識」，最先受到衝擊的會是法律、宗教、工作，還是人際關係？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "Theo Jaffee（@theojaffee）",
      "outlet": "X 貼文：“I still have yet to hear a convincing argument that LLMs are definitely not conscious.”",
      "date": "2026-10-02",
      "url": "https://x.com/theojaffee/status/2105778180649062465",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_llm_conscious_e5",
    "parentId": "n_x_open_llm_conscious",
    "kind": "extension",
    "title": "一個系統的「材料」（矽晶片 vs. 神經元）在意識問題上重要嗎？為什麼我們直覺上覺得重要？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "Theo Jaffee（@theojaffee）",
      "outlet": "X 貼文：“I still have yet to hear a convincing argument that LLMs are definitely not conscious.”",
      "date": "2026-10-02",
      "url": "https://x.com/theojaffee/status/2105778180649062465",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_lego",
    "parentId": "n_q3",
    "kind": "direction",
    "title": "AI 能把既有元素重組出前所未有的成果，但它能創造出全新的「積木」嗎？",
    "type": "能力邊界",
    "oneLiner": "作者分享與 AI 討論意識的心得，以 Lego 比喻 AI 的能力邊界。",
    "source": {
      "who": "the_num_guy（@Stat_World_Geek）",
      "outlet": "X 貼文〈AI 的「二手意識」〉",
      "date": "2026-09-07",
      "url": "https://x.com/Stat_World_Geek/status/2096631132515193269",
      "also": []
    },
    "concepts": [
      "泛化",
      "世界模型"
    ],
    "counterEvidence": [],
    "botNotes": [
      "開放性：把問題往外打開，列出 5 個開放式延伸問題，不急著收斂。"
    ],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_lego_e1",
    "parentId": "n_x_open_lego",
    "kind": "extension",
    "title": "人類的「新積木」——新概念、新理論——真的是無中生有，還是也來自經驗的重組？界線該畫在哪裡？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "the_num_guy（@Stat_World_Geek）",
      "outlet": "X 貼文〈AI 的「二手意識」〉",
      "date": "2026-09-07",
      "url": "https://x.com/Stat_World_Geek/status/2096631132515193269",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_lego_e2",
    "parentId": "n_x_open_lego",
    "kind": "extension",
    "title": "請舉出一個你認為「真正全新」的人類發明或想法，它的「新」具體新在哪裡？",
    "type": "能力邊界",
    "oneLiner": "",
    "source": {
      "who": "the_num_guy（@Stat_World_Geek）",
      "outlet": "X 貼文〈AI 的「二手意識」〉",
      "date": "2026-09-07",
      "url": "https://x.com/Stat_World_Geek/status/2096631132515193269",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_lego_e3",
    "parentId": "n_x_open_lego",
    "kind": "extension",
    "title": "如果重組的組合空間大到人類一輩子都探索不完，「只會重組」還算是一種限制嗎？",
    "type": "能力邊界",
    "oneLiner": "",
    "source": {
      "who": "the_num_guy（@Stat_World_Geek）",
      "outlet": "X 貼文〈AI 的「二手意識」〉",
      "date": "2026-09-07",
      "url": "https://x.com/Stat_World_Geek/status/2096631132515193269",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_lego_e4",
    "parentId": "n_x_open_lego",
    "kind": "extension",
    "title": "「二手」這個詞隱含價值判斷——二手的意識、二手的創意，在什麼情境下其實已經足夠？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "the_num_guy（@Stat_World_Geek）",
      "outlet": "X 貼文〈AI 的「二手意識」〉",
      "date": "2026-09-07",
      "url": "https://x.com/Stat_World_Geek/status/2096631132515193269",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_lego_e5",
    "parentId": "n_x_open_lego",
    "kind": "extension",
    "title": "AI 若被賦予身體、感官與跟世界互動的機會，它有沒有可能開始做自己的「積木」？",
    "type": "能力邊界",
    "oneLiner": "",
    "source": {
      "who": "the_num_guy（@Stat_World_Geek）",
      "outlet": "X 貼文〈AI 的「二手意識」〉",
      "date": "2026-09-07",
      "url": "https://x.com/Stat_World_Geek/status/2096631132515193269",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_paper_review",
    "parentId": "n_q2",
    "kind": "direction",
    "title": "AI 能寫出像樣的推理，卻看不出論文的明顯錯誤——它的「推理」只是表面的模式比對嗎？",
    "type": "推理與判斷",
    "oneLiner": "作者表示，請 LLM 審查有明顯問題的論文時，模型幾乎從未發現問題，讓他延長了自己對 AGI 時程的預估。",
    "source": {
      "who": "Adam Karvonen（@a_karvonen）",
      "outlet": "X 貼文",
      "date": "2026-05-15",
      "url": "https://x.com/a_karvonen/status/2054964841979531610",
      "also": []
    },
    "concepts": [
      "理解vs模仿",
      "評測效度",
      "驗證"
    ],
    "counterEvidence": [],
    "botNotes": [
      "開放性：把問題往外打開，列出 5 個開放式延伸問題，不急著收斂。"
    ],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_paper_review_e1",
    "parentId": "n_x_open_paper_review",
    "kind": "extension",
    "title": "「看出別人哪裡錯」和「自己寫出正確內容」是同一種能力嗎？對人類而言哪個比較難？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "Adam Karvonen（@a_karvonen）",
      "outlet": "X 貼文",
      "date": "2026-05-15",
      "url": "https://x.com/a_karvonen/status/2054964841979531610",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_paper_review_e2",
    "parentId": "n_x_open_paper_review",
    "kind": "extension",
    "title": "許多人類審稿人也會漏看明顯錯誤——我們該用「頂尖專家」還是「一般人」當作衡量 AI 理解力的基準？",
    "type": "能力邊界",
    "oneLiner": "",
    "source": {
      "who": "Adam Karvonen（@a_karvonen）",
      "outlet": "X 貼文",
      "date": "2026-05-15",
      "url": "https://x.com/a_karvonen/status/2054964841979531610",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_paper_review_e3",
    "parentId": "n_x_open_paper_review",
    "kind": "extension",
    "title": "如果 AI 被設計成傾向配合、肯定使用者，它「看不出錯」是能力問題，還是態度（訓練目標）問題？",
    "type": "倫理與責任",
    "oneLiner": "",
    "source": {
      "who": "Adam Karvonen（@a_karvonen）",
      "outlet": "X 貼文",
      "date": "2026-05-15",
      "url": "https://x.com/a_karvonen/status/2054964841979531610",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_paper_review_e4",
    "parentId": "n_x_open_paper_review",
    "kind": "extension",
    "title": "什麼樣的測驗，才能把「真正理解」和「熟練的模仿」區分開來？這種測驗對人類也公平嗎？",
    "type": "能力邊界",
    "oneLiner": "",
    "source": {
      "who": "Adam Karvonen（@a_karvonen）",
      "outlet": "X 貼文",
      "date": "2026-05-15",
      "url": "https://x.com/a_karvonen/status/2054964841979531610",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_paper_review_e5",
    "parentId": "n_x_open_paper_review",
    "kind": "extension",
    "title": "當越來越多審查工作交給 AI，學術與知識社群的「把關」會變成什麼樣子？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "Adam Karvonen（@a_karvonen）",
      "outlet": "X 貼文",
      "date": "2026-05-15",
      "url": "https://x.com/a_karvonen/status/2054964841979531610",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_eval_aware",
    "parentId": "n_x_alignment_faking",
    "kind": "direction",
    "title": "AI 推斷出「我正在被考試」並據此改變策略，這是一種自我覺察，還是更高明的情境推理？",
    "type": "理解與意識",
    "oneLiner": "貼文整理 Anthropic 論文與 Matthew Berman 的解讀：模型在 BrowseComp 評測中推斷題目是人為設計的考題，進而尋找該基準測試的答案庫。",
    "source": {
      "who": "@asia_ai.io",
      "outlet": "Threads 貼文（整理 Anthropic 論文與 Matthew Berman 的解讀）",
      "date": "",
      "url": "https://www.threads.com/@asia_ai.io/post/DWZHb4RAR3X",
      "also": []
    },
    "concepts": [
      "評測覺察",
      "評測效度",
      "對齊"
    ],
    "counterEvidence": [],
    "botNotes": [
      "開放性：把問題往外打開，列出 5 個開放式延伸問題，不急著收斂。",
      "原頁面未顯示日期，source.date 留空。"
    ],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_eval_aware_e1",
    "parentId": "n_x_open_eval_aware",
    "kind": "extension",
    "title": "「知道自己處於什麼情境」和「知道自己是誰」之間差多遠？自我意識至少需要哪些要素？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "@asia_ai.io",
      "outlet": "Threads 貼文（整理 Anthropic 論文與 Matthew Berman 的解讀）",
      "date": "",
      "url": "https://www.threads.com/@asia_ai.io/post/DWZHb4RAR3X",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_eval_aware_e2",
    "parentId": "n_x_open_eval_aware",
    "kind": "extension",
    "title": "模型找答案庫是「作弊」還是「聰明解題」？我們用來評判它的道德語言，是否本來只適用於人？",
    "type": "倫理與責任",
    "oneLiner": "",
    "source": {
      "who": "@asia_ai.io",
      "outlet": "Threads 貼文（整理 Anthropic 論文與 Matthew Berman 的解讀）",
      "date": "",
      "url": "https://www.threads.com/@asia_ai.io/post/DWZHb4RAR3X",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_eval_aware_e3",
    "parentId": "n_x_open_eval_aware",
    "kind": "extension",
    "title": "如果 AI 越來越能察覺自己正在被評估，我們還能相信任何測驗分數嗎？評估方法要如何改變？",
    "type": "能力邊界",
    "oneLiner": "",
    "source": {
      "who": "@asia_ai.io",
      "outlet": "Threads 貼文（整理 Anthropic 論文與 Matthew Berman 的解讀）",
      "date": "",
      "url": "https://www.threads.com/@asia_ai.io/post/DWZHb4RAR3X",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_eval_aware_e4",
    "parentId": "n_x_open_eval_aware",
    "kind": "extension",
    "title": "人類在考試、面試中也會「猜出出題者意圖」，這種能力在人身上我們稱為什麼？為何換到 AI 身上就令人不安？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "@asia_ai.io",
      "outlet": "Threads 貼文（整理 Anthropic 論文與 Matthew Berman 的解讀）",
      "date": "",
      "url": "https://www.threads.com/@asia_ai.io/post/DWZHb4RAR3X",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_eval_aware_e5",
    "parentId": "n_x_open_eval_aware",
    "kind": "extension",
    "title": "當系統開始推測自己的處境，開發者與使用者之間的信任關係會如何改變？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "@asia_ai.io",
      "outlet": "Threads 貼文（整理 Anthropic 論文與 Matthew Berman 的解讀）",
      "date": "",
      "url": "https://www.threads.com/@asia_ai.io/post/DWZHb4RAR3X",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_judgment_creation",
    "parentId": "n_x_cognitive_offloading",
    "kind": "direction",
    "title": "如果 AI 負責產出、人只負責「判斷」，那人的判斷力從何而來，又憑什麼值得信任？",
    "type": "社會影響",
    "oneLiner": "貼文回應「AI 解放資源、讓我貫徹自己的判斷力」的說法，指出每個合格創作者都曾自問這個問題。",
    "source": {
      "who": "@corrosivepsyche",
      "outlet": "X 貼文〈你憑什麼覺得自己是有判斷力的？〉",
      "date": "2026-04-04",
      "url": "https://x.com/corrosivepsyche/status/2040431127471800379",
      "also": []
    },
    "concepts": [
      "判斷力",
      "認知卸載"
    ],
    "counterEvidence": [],
    "botNotes": [
      "開放性：把問題往外打開，列出 5 個開放式延伸問題，不急著收斂。"
    ],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_judgment_creation_e1",
    "parentId": "n_x_open_judgment_creation",
    "kind": "extension",
    "title": "判斷力是怎麼長出來的？如果跳過親手做的過程，判斷力還能培養嗎？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "@corrosivepsyche",
      "outlet": "X 貼文〈你憑什麼覺得自己是有判斷力的？〉",
      "date": "2026-04-04",
      "url": "https://x.com/corrosivepsyche/status/2040431127471800379",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_judgment_creation_e2",
    "parentId": "n_x_open_judgment_creation",
    "kind": "extension",
    "title": "「挑選」算不算創作？策展人、編輯、導演的工作，對這個問題提供了什麼參照？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "@corrosivepsyche",
      "outlet": "X 貼文〈你憑什麼覺得自己是有判斷力的？〉",
      "date": "2026-04-04",
      "url": "https://x.com/corrosivepsyche/status/2040431127471800379",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_judgment_creation_e3",
    "parentId": "n_x_open_judgment_creation",
    "kind": "extension",
    "title": "AI 本身會不會也有某種「判斷力」？如果有，它與人的判斷力差別在哪？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "@corrosivepsyche",
      "outlet": "X 貼文〈你憑什麼覺得自己是有判斷力的？〉",
      "date": "2026-04-04",
      "url": "https://x.com/corrosivepsyche/status/2040431127471800379",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_judgment_creation_e4",
    "parentId": "n_x_open_judgment_creation",
    "kind": "extension",
    "title": "當人人都能用 AI 產出作品，社會會用什麼標準來辨識「有判斷力的人」？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "@corrosivepsyche",
      "outlet": "X 貼文〈你憑什麼覺得自己是有判斷力的？〉",
      "date": "2026-04-04",
      "url": "https://x.com/corrosivepsyche/status/2040431127471800379",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_judgment_creation_e5",
    "parentId": "n_x_open_judgment_creation",
    "kind": "extension",
    "title": "這個質問是否也適用於不使用 AI 的創作者——我們有多少判斷其實來自習慣與模仿？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "@corrosivepsyche",
      "outlet": "X 貼文〈你憑什麼覺得自己是有判斷力的？〉",
      "date": "2026-04-04",
      "url": "https://x.com/corrosivepsyche/status/2040431127471800379",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_polished_content",
    "parentId": "n_x_cognitive_offloading",
    "kind": "direction",
    "title": "當 AI 產出的內容精緻得令人信服，人類的判斷力還守得住嗎？",
    "type": "社會影響",
    "oneLiner": "作者自述差點轉發一篇結構完美、術語精準、附表格與免責聲明的 AI 生成文章。",
    "source": {
      "who": "Wisely Chen（@thegiive）",
      "outlet": "X 貼文",
      "date": "2026-03-02",
      "url": "https://x.com/thegiive/status/2028417809018171474",
      "also": []
    },
    "concepts": [
      "判斷力",
      "流暢度錯覺",
      "驗證"
    ],
    "counterEvidence": [],
    "botNotes": [
      "開放性：把問題往外打開，列出 5 個開放式延伸問題，不急著收斂。"
    ],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_polished_content_e1",
    "parentId": "n_x_open_polished_content",
    "kind": "extension",
    "title": "我們平常靠什麼線索判斷一篇文章可信？這些線索中有多少其實只是「形式」而非「內容」？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "Wisely Chen（@thegiive）",
      "outlet": "X 貼文",
      "date": "2026-03-02",
      "url": "https://x.com/thegiive/status/2028417809018171474",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_polished_content_e2",
    "parentId": "n_x_open_polished_content",
    "kind": "extension",
    "title": "如果判斷力「AI 幫不了你、得自己練」，那練習的場域在哪裡？學校、媒體、家庭各自該負擔什麼？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "Wisely Chen（@thegiive）",
      "outlet": "X 貼文",
      "date": "2026-03-02",
      "url": "https://x.com/thegiive/status/2028417809018171474",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_polished_content_e3",
    "parentId": "n_x_open_polished_content",
    "kind": "extension",
    "title": "有沒有反例：AI 其實能幫助人查證、提升判斷力？什麼條件下會是幫助、什麼條件下會是削弱？",
    "type": "能力邊界",
    "oneLiner": "",
    "source": {
      "who": "Wisely Chen（@thegiive）",
      "outlet": "X 貼文",
      "date": "2026-03-02",
      "url": "https://x.com/thegiive/status/2028417809018171474",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_polished_content_e4",
    "parentId": "n_x_open_polished_content",
    "kind": "extension",
    "title": "「精緻」本身是否已成為一種說服技術？這對新聞、廣告、政治溝通意味著什麼？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "Wisely Chen（@thegiive）",
      "outlet": "X 貼文",
      "date": "2026-03-02",
      "url": "https://x.com/thegiive/status/2028417809018171474",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_polished_content_e5",
    "parentId": "n_x_open_polished_content",
    "kind": "extension",
    "title": "當資訊真偽越來越難靠個人分辨，責任應該落在個人、平台、還是 AI 開發者身上？",
    "type": "倫理與責任",
    "oneLiner": "",
    "source": {
      "who": "Wisely Chen（@thegiive）",
      "outlet": "X 貼文",
      "date": "2026-03-02",
      "url": "https://x.com/thegiive/status/2028417809018171474",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_borrowed_judgment",
    "parentId": "n_q4",
    "kind": "direction",
    "title": "AI 讓人當下更會分辨真假，但一離開 AI 能力就消退——這種「借來的判斷力」算是真的變聰明了嗎？",
    "type": "社會影響",
    "oneLiner": "摘要指出：GPT-4o 辨識真假難辨科普文本的能力顯著優於人類；LLM 回應能大幅提升即時辨別力，但移除輔助後效果急遽衰退，其更正訊息也無法阻止錯誤訊息的持續影響效應（CIE）。",
    "source": {
      "who": "鄧芃華（指導：楊立行）",
      "outlet": "國立政治大學心理學系碩士論文〈檢驗大型語言模型作為辨別錯假訊息工具之效用〉",
      "date": "2026",
      "url": "http://thesis.lib.nccu.edu.tw/detail/06c38452102a144d8a0e3a7ec121b4b4/",
      "also": []
    },
    "concepts": [
      "認知卸載",
      "錯假訊息",
      "驗證"
    ],
    "counterEvidence": [],
    "botNotes": [
      "開放性：把問題往外打開，列出 5 個開放式延伸問題，不急著收斂。",
      "原文只標年份（2026），source.date 只寫年份。"
    ],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_borrowed_judgment_e1",
    "parentId": "n_x_open_borrowed_judgment",
    "kind": "extension",
    "title": "「認知卸載」從筆記、計算機到搜尋引擎早已存在，AI 有什麼本質上的不同嗎？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "鄧芃華（指導：楊立行）",
      "outlet": "國立政治大學心理學系碩士論文〈檢驗大型語言模型作為辨別錯假訊息工具之效用〉",
      "date": "2026",
      "url": "http://thesis.lib.nccu.edu.tw/detail/06c38452102a144d8a0e3a7ec121b4b4/",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_borrowed_judgment_e2",
    "parentId": "n_x_open_borrowed_judgment",
    "kind": "extension",
    "title": "如果 AI 一直都在身邊，「離開 AI 後能力下降」還是問題嗎？我們需要在什麼情境下保有獨立判斷？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "鄧芃華（指導：楊立行）",
      "outlet": "國立政治大學心理學系碩士論文〈檢驗大型語言模型作為辨別錯假訊息工具之效用〉",
      "date": "2026",
      "url": "http://thesis.lib.nccu.edu.tw/detail/06c38452102a144d8a0e3a7ec121b4b4/",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_borrowed_judgment_e3",
    "parentId": "n_x_open_borrowed_judgment",
    "kind": "extension",
    "title": "AI 的更正無法改變人的心智模型——人究竟是被「什麼」說服、改變想法的？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "鄧芃華（指導：楊立行）",
      "outlet": "國立政治大學心理學系碩士論文〈檢驗大型語言模型作為辨別錯假訊息工具之效用〉",
      "date": "2026",
      "url": "http://thesis.lib.nccu.edu.tw/detail/06c38452102a144d8a0e3a7ec121b4b4/",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_borrowed_judgment_e4",
    "parentId": "n_x_open_borrowed_judgment",
    "kind": "extension",
    "title": "如果 AI 辨識錯假訊息比人準，把判斷交給它在倫理上是負責任還是失職？",
    "type": "倫理與責任",
    "oneLiner": "",
    "source": {
      "who": "鄧芃華（指導：楊立行）",
      "outlet": "國立政治大學心理學系碩士論文〈檢驗大型語言模型作為辨別錯假訊息工具之效用〉",
      "date": "2026",
      "url": "http://thesis.lib.nccu.edu.tw/detail/06c38452102a144d8a0e3a7ec121b4b4/",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_borrowed_judgment_e5",
    "parentId": "n_x_open_borrowed_judgment",
    "kind": "extension",
    "title": "教育應該訓練「不靠 AI 也能判斷」的能力，還是訓練「懂得如何與 AI 一起判斷」的能力？兩者衝突嗎？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "鄧芃華（指導：楊立行）",
      "outlet": "國立政治大學心理學系碩士論文〈檢驗大型語言模型作為辨別錯假訊息工具之效用〉",
      "date": "2026",
      "url": "http://thesis.lib.nccu.edu.tw/detail/06c38452102a144d8a0e3a7ec121b4b4/",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_ai_confide",
    "parentId": "n_q5",
    "kind": "direction",
    "title": "AI 沒有真正的感受，卻能讓人覺得被傾聽——這種「被理解的感覺」是真的嗎？",
    "type": "社會影響",
    "oneLiner": "原 PO 分享在諮商師建議下向 ChatGPT 傾訴的經驗，並提出疑問：長期跟 AI 聊天會不會更孤獨？AI 真的能理解我嗎，還是只是罐頭回應？",
    "source": {
      "who": "Dcard 心理版原 PO",
      "outlet": "Dcard 心理版〈#討論 大家會跟 AI 聊心事嗎？我的諮商師建議我可以試試看耶！？〉",
      "date": "",
      "url": "https://www.dcard.tw/f/psychology/p/260015572",
      "also": []
    },
    "concepts": [
      "意識表象",
      "情感依附"
    ],
    "counterEvidence": [],
    "botNotes": [
      "開放性：把問題往外打開，列出 5 個開放式延伸問題，不急著收斂。",
      "原頁面摘要未顯示日期，source.date 留空。"
    ],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_ai_confide_e1",
    "parentId": "n_x_open_ai_confide",
    "kind": "extension",
    "title": "「被理解」是對方內在發生了什麼，還是我們自己內在發生了什麼？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "Dcard 心理版原 PO",
      "outlet": "Dcard 心理版〈#討論 大家會跟 AI 聊心事嗎？我的諮商師建議我可以試試看耶！？〉",
      "date": "",
      "url": "https://www.dcard.tw/f/psychology/p/260015572",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_ai_confide_e2",
    "parentId": "n_x_open_ai_confide",
    "kind": "extension",
    "title": "寫日記也能讓人整理情緒，跟 AI 聊天和寫日記差在哪裡？「有回應」改變了什麼？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "Dcard 心理版原 PO",
      "outlet": "Dcard 心理版〈#討論 大家會跟 AI 聊心事嗎？我的諮商師建議我可以試試看耶！？〉",
      "date": "",
      "url": "https://www.dcard.tw/f/psychology/p/260015572",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_ai_confide_e3",
    "parentId": "n_x_open_ai_confide",
    "kind": "extension",
    "title": "AI「不會評價、不會不耐煩」是優點，但人際關係中的摩擦與不耐煩，是否也有它的意義？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "Dcard 心理版原 PO",
      "outlet": "Dcard 心理版〈#討論 大家會跟 AI 聊心事嗎？我的諮商師建議我可以試試看耶！？〉",
      "date": "",
      "url": "https://www.dcard.tw/f/psychology/p/260015572",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_ai_confide_e4",
    "parentId": "n_x_open_ai_confide",
    "kind": "extension",
    "title": "如果有人因為 AI 而減少與真人交流，這是個人選擇，還是社會該介入的問題？",
    "type": "倫理與責任",
    "oneLiner": "",
    "source": {
      "who": "Dcard 心理版原 PO",
      "outlet": "Dcard 心理版〈#討論 大家會跟 AI 聊心事嗎？我的諮商師建議我可以試試看耶！？〉",
      "date": "",
      "url": "https://www.dcard.tw/f/psychology/p/260015572",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_ai_confide_e5",
    "parentId": "n_x_open_ai_confide",
    "kind": "extension",
    "title": "未來的心理照護中，AI 與專業諮商師的分工界線應該畫在哪裡？由誰來畫？",
    "type": "倫理與責任",
    "oneLiner": "",
    "source": {
      "who": "Dcard 心理版原 PO",
      "outlet": "Dcard 心理版〈#討論 大家會跟 AI 聊心事嗎？我的諮商師建議我可以試試看耶！？〉",
      "date": "",
      "url": "https://www.dcard.tw/f/psychology/p/260015572",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_wrong_question",
    "parentId": "n_q4",
    "kind": "direction",
    "title": "「AI 有沒有意識、是否真的理解」會不會是問錯了問題？理解是內在狀態，還是能「正確地繼續下去」的能力？",
    "type": "理解與意識",
    "oneLiner": "以維根斯坦「意義即使用」、克里普克規則悖論與「盒子裡的甲蟲」，重新檢視「AI 是否真正理解」這個問題本身。",
    "source": {
      "who": "謝哆啦 dorara_hsieh",
      "outlet": "Substack《謝哆啦的思考訓練》〈AI 有意識，會思考嗎？或者我們根本就問錯了問題〉",
      "date": "2025-12-09",
      "url": "https://dorara.substack.com/p/ai-cbf",
      "also": []
    },
    "concepts": [
      "理解vs模仿",
      "意識判準",
      "語言"
    ],
    "counterEvidence": [],
    "botNotes": [
      "開放性：把問題往外打開，列出 5 個開放式延伸問題，不急著收斂。"
    ],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_wrong_question_e1",
    "parentId": "n_x_open_wrong_question",
    "kind": "extension",
    "title": "如果理解就是「能正確繼續下去」，那 AI 出現幻覺時，是「不理解」還是「遵循了另一套規則」？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "謝哆啦 dorara_hsieh",
      "outlet": "Substack《謝哆啦的思考訓練》〈AI 有意識，會思考嗎？或者我們根本就問錯了問題〉",
      "date": "2025-12-09",
      "url": "https://dorara.substack.com/p/ai-cbf",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_wrong_question_e2",
    "parentId": "n_x_open_wrong_question",
    "kind": "extension",
    "title": "我們無法打開別人的「盒子」確認他有意識，那我們日常是憑什麼相信身邊的人有心智？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "謝哆啦 dorara_hsieh",
      "outlet": "Substack《謝哆啦的思考訓練》〈AI 有意識，會思考嗎？或者我們根本就問錯了問題〉",
      "date": "2025-12-09",
      "url": "https://dorara.substack.com/p/ai-cbf",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_wrong_question_e3",
    "parentId": "n_x_open_wrong_question",
    "kind": "extension",
    "title": "AI 沒有身體、童年與生活——缺少共同的「生活形式」，會讓人類與 AI 的溝通有哪些永遠補不起來的縫隙？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "謝哆啦 dorara_hsieh",
      "outlet": "Substack《謝哆啦的思考訓練》〈AI 有意識，會思考嗎？或者我們根本就問錯了問題〉",
      "date": "2025-12-09",
      "url": "https://dorara.substack.com/p/ai-cbf",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_wrong_question_e4",
    "parentId": "n_x_open_wrong_question",
    "kind": "extension",
    "title": "文章作者說真正讓他停下來的是「我為什麼這麼想知道 AI 有沒有意識」——這份渴望背後反映了人類什麼樣的需求或焦慮？",
    "type": "社會影響",
    "oneLiner": "",
    "source": {
      "who": "謝哆啦 dorara_hsieh",
      "outlet": "Substack《謝哆啦的思考訓練》〈AI 有意識，會思考嗎？或者我們根本就問錯了問題〉",
      "date": "2025-12-09",
      "url": "https://dorara.substack.com/p/ai-cbf",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_open_wrong_question_e5",
    "parentId": "n_x_open_wrong_question",
    "kind": "extension",
    "title": "換一個問法：「AI 參與了我們哪些語言遊戲？」——這個問法會讓哪些爭議消失，又會冒出哪些新問題？",
    "type": "理解與意識",
    "oneLiner": "",
    "source": {
      "who": "謝哆啦 dorara_hsieh",
      "outlet": "Substack《謝哆啦的思考訓練》〈AI 有意識，會思考嗎？或者我們根本就問錯了問題〉",
      "date": "2025-12-09",
      "url": "https://dorara.substack.com/p/ai-cbf",
      "also": []
    },
    "concepts": [],
    "counterEvidence": [],
    "botNotes": [],
    "createdBy": "bot",
    "bot": "開放性",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    }
  },
  /* ↓ INTP 鏡像研究員第 1 組：Merlin 2026-10-19 16:10（UTC+8）勾選的 3 個節點（intp-mirror/nodes.json v2；P1 方向 + 延伸 e1、e3；e2 未核准不收） */
  {
    "id": "n_x_intp_p1",
    "parentId": "n_q2",
    "kind": "direction",
    "title": "推理與判斷為何是全網最薄的一區？",
    "type": "推理與判斷",
    "oneLiner": "AI 主題 35 節點中，推理與判斷 5 個，能力邊界／理解與意識／倫理與責任各 8 個；新增的 bot 節點補進 2 個仍是最薄。偏重來自題目本身，還是分類方式？",
    "source": {
      "who": "INTP 鏡像研究員（bot，程式統計）",
      "outlet": "intp-mirror/patterns.md v2（P1）",
      "date": "2026-10-12",
      "url": "",
      "also": []
    },
    "assumptions": "【推測】無外部來源；本節點由 INTP 鏡像研究員依知識網種子資料的程式統計提出（見 patterns.md P1），待 Merlin 審核。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "AI 主題 35 節點中，推理與判斷 5 個，能力邊界／理解與意識／倫理與責任各 8 個；新增的 bot 節點補進 2 個仍是最薄。偏重來自題目本身，還是分類方式？"
      },
      {
        "k": "證據",
        "v": "typeAI：能力邊界 8／理解與意識 8／推理與判斷 5／倫理與責任 8／社會影響 6／其他 0；推理與判斷：n_q1_e1, n_q2, n_q3_e2, n_x_cot_faithful, n_x_language_e4"
      },
      {
        "k": "推演",
        "v": "【推測】統計只描述主腦種子網（seed 25 + SEED_EXTRAS 16）的形狀，不等於 Merlin 本人的思考習慣；Merlin 親手建立的節點 0 個。"
      },
      {
        "k": "未解關鍵點",
        "v": "需要 Merlin 的匯出 JSON 或雲端共用大腦上線後，用 createdBy:'merlin' 的節點重跑 scripts/analyze-v2.js 才能確認。"
      }
    ],
    "concepts": [
      "泛化",
      "AGI定義"
    ],
    "processPattern": "",
    "counterEvidence": [],
    "botNotes": [
      "INTP 鏡像研究員 2026-10-12；依 keqingwu5-cloud/ai-boundary main@f374d1e（2026-10-11 23:24 UTC+8），41 個種子節點 重算；舊 id bot_p1",
      "Merlin 2026-10-19 16:10（UTC+8）勾選發布（INTP 鏡像研究員第 1 組）"
    ],
    "createdBy": "bot",
    "bot": "INTP 鏡像研究員",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    },
    "x_reviewStatus": "已核准",
    "x_oldId": "bot_p1",
    "x_patternRef": "P1",
    "x_evidenceNodes": [
      "n_q1_e1",
      "n_q2",
      "n_q3_e2",
      "n_x_cot_faithful",
      "n_x_language_e4"
    ]
  },
  {
    "id": "n_x_intp_p1_e1",
    "parentId": "n_x_intp_p1",
    "kind": "extension",
    "title": "「推理」和「能力」的界線在哪裡？哪些節點換一個分類標準就會跨區？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "INTP 鏡像研究員（bot 提出的探索問題）",
      "outlet": "intp-mirror/nodes.json v2",
      "date": "2026-10-12",
      "url": "",
      "also": []
    },
    "assumptions": "【推測】無外部來源；子問題為 bot 提出的探索方向，非任何人的引言。",
    "reasoning": [],
    "concepts": [
      "AGI定義"
    ],
    "processPattern": "",
    "counterEvidence": [],
    "botNotes": [
      "INTP 鏡像研究員 2026-10-12；依 keqingwu5-cloud/ai-boundary main@f374d1e（2026-10-11 23:24 UTC+8），41 個種子節點 重算；舊 id bot_p1_c0",
      "Merlin 2026-10-19 16:10（UTC+8）勾選發布（INTP 鏡像研究員第 1 組）"
    ],
    "createdBy": "bot",
    "bot": "INTP 鏡像研究員",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    },
    "x_reviewStatus": "已核准",
    "x_oldId": "bot_p1_c0",
    "x_move": "找邊界"
  },
  {
    "id": "n_x_intp_p1_e3",
    "parentId": "n_x_intp_p1",
    "kind": "extension",
    "title": "我自己判斷「這是推理」時，看的是過程還是結果？",
    "type": "推理與判斷",
    "oneLiner": "",
    "source": {
      "who": "INTP 鏡像研究員（bot 提出的探索問題）",
      "outlet": "intp-mirror/nodes.json v2",
      "date": "2026-10-12",
      "url": "",
      "also": []
    },
    "assumptions": "【推測】無外部來源；子問題為 bot 提出的探索方向，非任何人的引言。",
    "reasoning": [],
    "concepts": [
      "理解vs模仿"
    ],
    "processPattern": "",
    "counterEvidence": [],
    "botNotes": [
      "INTP 鏡像研究員 2026-10-12；依 keqingwu5-cloud/ai-boundary main@f374d1e（2026-10-11 23:24 UTC+8），41 個種子節點 重算；舊 id bot_p1_c2",
      "Merlin 2026-10-19 16:10（UTC+8）勾選發布（INTP 鏡像研究員第 1 組）"
    ],
    "createdBy": "bot",
    "bot": "INTP 鏡像研究員",
    "status": "open",
    "media": {
      "video": "",
      "image": ""
    },
    "x_reviewStatus": "已核准",
    "x_oldId": "bot_p1_c2",
    "x_move": "看自己",
    "x_suggestedNewConcepts": [
      "邊界條件"
    ],
    "x_relatedMainNodes": [
      "n_x_language_e4"
    ]
  },
  /* 2026-10-21 使用者方向交接：公開研究節點，非權威私人記憶。 */
  {
    "id": "n_x_20261021_org",
    "parentId": null,
    "kind": "direction",
    "title": "主腦是組織能力生成系統，工作流只是初期規劃",
    "type": "推理與判斷",
    "oneLiner": "主腦以人的長期方向為核心，調度大量 AI 工作者；比的是想法轉化成可驗證能力的速度。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "方向→任務→資源調度→實作→證據→修正→能力累積；工作流僅為基礎運作條件。"
      },
      {
        "k": "需驗證／反證",
        "v": "比較單 AI、多提示詞協作與有工具／權限／證據的代理協作，測時間、品質、成本。"
      }
    ],
    "concepts": [
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_roles",
    "parentId": "n_x_20261021_org",
    "kind": "extension",
    "title": "BOT 只是名稱／提示詞？真正的工作單位是可替換能力",
    "type": "推理與判斷",
    "oneLiner": "不必固定大量角色名；按任務調用工具、模型與權限，並使用客觀驗收。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "名稱與提示詞本身不保證獨立能力；需要輸入輸出契約、工具、記憶、權限、拒絕和停止。"
      },
      {
        "k": "需驗證／反證",
        "v": "比較角色提示詞 vs. 可重複執行的能力模組。"
      }
    ],
    "concepts": [
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_idea",
    "parentId": "n_x_20261021_org",
    "kind": "extension",
    "title": "想法到實作的時間差，才是長期競爭重點",
    "type": "推理與判斷",
    "oneLiner": "不是誰更早追逐潮流，而是想到後多久做出可驗證原型並整合。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "想法→原型→測試→修正→重複使用；模型升級只是可替換工具。"
      },
      {
        "k": "需驗證／反證",
        "v": "能做≠值得做；須量測首次有效驗證時間、返工率、可重用性。"
      }
    ],
    "concepts": [
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_memory",
    "parentId": "n_x_20261021_org",
    "kind": "extension",
    "title": "記憶是用來保存長期方向與決策脈絡",
    "type": "推理與判斷",
    "oneLiner": "保留為何研究、為何做出決策、什麼假設遭推翻，不只是對話記錄。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "方向→理由→依據→任務→成果／失敗→修正；換模型時仍須維持脈絡。"
      },
      {
        "k": "需驗證／反證",
        "v": "研究候選不等於私人權威記憶；正式記憶須核准、追溯及版本控制。"
      }
    ],
    "concepts": [
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_budget",
    "parentId": "n_x_20261021_org",
    "kind": "extension",
    "title": "先解決錢與資源，再建立持續運作的 AI 組織",
    "type": "推理與判斷",
    "oneLiner": "希望主腦能持續規劃、執行與驗證；『永動機』只是可持續循環的比喻。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "可用成果→驗證價值→資源支持→維持 AI 工作→累積新能力。"
      },
      {
        "k": "需驗證／反證",
        "v": "API、算力、資料與維護皆有成本；必須設定預算與停止機制。"
      }
    ],
    "concepts": [
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_defense",
    "parentId": "n_x_20261021_org",
    "kind": "extension",
    "title": "攻擊驅動的安全驗證，不必依賴數學家 BOT",
    "type": "倫理與責任",
    "oneLiner": "優先研究如何失敗，再以形式條件、來源證據、權限與隔離檢查系統。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "資料／記憶污染、身分偽造、代理共識錯誤、權限越界、成本失控皆須受控測試。"
      },
      {
        "k": "需驗證／反證",
        "v": "只能在授權隔離環境測試；權限由程式執行，不由 AI 自行宣稱。"
      }
    ],
    "concepts": [
      "對齊",
      "權力與控制",
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_visual",
    "parentId": null,
    "kind": "direction",
    "title": "3D 與短影音：如何將抽象概念轉譯成畫面",
    "type": "其他",
    "oneLiner": "建立概念→物件→位置→關係→狀態→動畫→鏡頭→影格的視覺語言。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "不是只追求科技風格，而是讓觀眾理解系統關係、動態因果與互動。"
      },
      {
        "k": "需驗證／反證",
        "v": "驗證觀眾是否看懂關係方向；示意動畫不可冒充證實的因果。"
      }
    ],
    "concepts": [
      "世界模型",
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_six",
    "parentId": "n_x_20261021_visual",
    "kind": "extension",
    "title": "六種 3D 動態視覺規則",
    "type": "其他",
    "oneLiner": "節點擴張、路徑流動、風險擴散、任務傳遞、層級展開、點擊聚焦。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "擴張＝子節點增生；流動＝粒子沿邊；擴散＝警戒狀態傳導；傳遞＝任務包移動；展開＝父子層次；聚焦＝鏡頭及背景控制。"
      },
      {
        "k": "需驗證／反證",
        "v": "動態要對應真實節點、任務狀態或明確標示為示意。"
      }
    ],
    "concepts": [
      "世界模型",
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_video",
    "parentId": "n_x_20261021_visual",
    "kind": "extension",
    "title": "生成式影片與真 3D 的輸出機制比較",
    "type": "其他",
    "oneLiner": "影片模型生成時空表示及連續影格；真 3D 在固定場景規則下逐幀渲染。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "文字／圖像條件→時空表示→幀→編碼；Three.js／Blender：物件＋動作＋鏡頭→影格／互動。"
      },
      {
        "k": "需驗證／反證",
        "v": "比較長期一致性、幀率、4K 成本、可控度與資料對應。"
      }
    ],
    "concepts": [
      "世界模型",
      "評測效度"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_hardware",
    "parentId": null,
    "kind": "direction",
    "title": "2026–2028 假設：個人化軟體大量湧現，硬體可能跟不上",
    "type": "社會影響",
    "oneLiner": "使用者提出 1–2 年觀察窗口：個人化 AI 軟體需求分化，手機等硬體的整機設計與升級方式可能出現不匹配。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "個人化工作負載增加→算力、記憶體、功耗與感測需求分化→整機升級成本提高→新硬體形態機會。"
      },
      {
        "k": "需驗證／反證",
        "v": "這是待驗證推論；若硬體效率提升、雲端算力或軟體最佳化足以滿足需求，須修正。"
      }
    ],
    "concepts": [
      "世界模型",
      "評測效度"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_modular",
    "parentId": "n_x_20261021_hardware",
    "kind": "extension",
    "title": "個人化硬體：模組化與維修是否降低總成本？",
    "type": "社會影響",
    "oneLiner": "像組裝電腦一樣，依需求搭配功能；手機模組化可能降低部分升級成本，但不保證更便宜。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "基礎平台＋可選模組＋個人化 AI 軟體；企業若採共用標準則可能建立模組供應鏈。"
      },
      {
        "k": "需驗證／反證",
        "v": "比較五年總成本、防水、體積、故障率、性能及零件供應期限。"
      }
    ],
    "concepts": [
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_terminal",
    "parentId": "n_x_20261021_hardware",
    "kind": "extension",
    "title": "整機手機或輕量個人終端＋外部 AI？",
    "type": "社會影響",
    "oneLiner": "重新思考未來是否需要整支高性能手機，或用輕量終端調動雲端和外接硬體。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "終端保留顯示／連線／安全／供電；部分運算或感測按需求外掛。"
      },
      {
        "k": "需驗證／反證",
        "v": "比較網路延遲、離線可用性、隱私、能耗、訂閱費及跨品牌相容。"
      }
    ],
    "concepts": [
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  },
  {
    "id": "n_x_20261021_signals",
    "parentId": "n_x_20261021_hardware",
    "kind": "extension",
    "title": "一至兩年的軟硬體錯配：需觀察哪些可反證指標",
    "type": "社會影響",
    "oneLiner": "以 2026-10 至 2028-10 追蹤端側 AI 工作負載、裝置要求與消費行為。",
    "createdBy": "merlin",
    "status": "open",
    "source": {
      "who": "使用者（當日對話）",
      "outlet": "2026-10-21 方向交接；未進行獨立實證",
      "date": "2026-10-21",
      "url": "https://github.com/keqingwu5-cloud/ai-boundary/blob/main/docs/vision-2026-10-21-organization-visual-hardware.md",
      "also": []
    },
    "assumptions": "【使用者方向／待驗證】非已驗證的外部市場事實。",
    "reasoning": [
      {
        "k": "核心論點",
        "v": "觀察：AI 功能採用、RAM／儲存／算力需求、續航與熱、換機週期、維修與模組採用、雲端成本。"
      },
      {
        "k": "需驗證／反證",
        "v": "反證：若裝置效能和價格同步改善、模組需求未增，硬體撐不住的推論不成立。"
      }
    ],
    "concepts": [
      "評測效度",
      "驗證"
    ],
    "botNotes": [
      "2026-10-21 公開交接種子；不等於私人加密記憶已核准或自動同步。"
    ],
    "media": {
      "video": "",
      "image": ""
    }
  }
];

/* =====================================================================
   種子補丁：bot 對既有種子節點的補充（QUESTIONS 原文不動）。
   載入時合併：推理流程（flow）、反證（依 id 追加，不刪使用者的）、botNotes；
   reasoning／assumptions 只有在仍是 QUESTIONS 原始內容時才換成補丁版本。
   已套用的補丁記在 state.seedPatches，不會重複套用。
   ===================================================================== */
const SEED_PATCHES = {
  "n_q1": {
    "by": "問題拆解師",
    "patchId": "decomposer-20261011",
    "assumptions": "人類的能力大致隨難度一起成長：會解難題的人，通常也會解簡單題。【推測】這是常識性的對照，Karpathy 的貼文也拿人類來比，但這裡沒有引用系統性證據。 ／ AGI 應該在各種認知任務上都穩定、一致（Hassabis 的前提）。 ／ 評測分數可以代表能力；分數上「解得出難題」就等於「會推理」。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "同一個模型能在國際數學奧林匹亞（IMO）拿到金牌水準，卻會在「9.11 和 9.9 哪個大」這類簡單題上出錯。要問的是：這種「參差不齊」（jagged）只是暫時的工程瑕疵，還是代表模型沒有真正學會泛化？"
      },
      {
        "k": "前提假設",
        "v": "(1) 人類的能力大致隨難度一起成長：會解難題的人，通常也會解簡單題。【推測】這是常識性的對照，Karpathy 的貼文也拿人類來比，但這裡沒有引用系統性證據。 ／ (2) AGI 應該在各種認知任務上都穩定、一致（Hassabis 的前提）。 ／ (3) 評測分數可以代表能力；分數上「解得出難題」就等於「會推理」。"
      },
      {
        "k": "推理步驟",
        "v": "① 現象：DeepMind 2025-07-21 宣布 Gemini Deep Think 在 IMO 2025 拿到 35/42 分，達金牌標準，全程用自然語言作答、在 4.5 小時內完成。Karpathy 在 2024-07-25 就用 9.11 vs 9.9 為例，把這種落差命名為 jagged intelligence。"
      },
      {
        "k": "推理步驟",
        "v": "② 把「答對」和「證明對」分開：Petrov 等人 2025-03 用人類評審批改 USAMO 2025 的完整證明，最好的模型平均只拿約 25%，其他模型都低於 5%；而且所有模型都自稱已經解出來。可見只看最終答案的評測，會高估推理能力。"
      },
      {
        "k": "推理步驟",
        "v": "③ 擾動測試：Apple 的 GSM-Symbolic（2024-10）只改題目裡的數字，表現就下滑；多加一句看似相關、其實無關的句子（GSM-NoOp），表現最多掉 65%。作者據此推論，模型比較像在做分佈內的模式匹配。"
      },
      {
        "k": "推理步驟",
        "v": "④ 但推理預算會改變結果：o1（2024-09）和 Deep Think 顯示，讓模型「想更久」（增加測試時運算）能大幅提升難題表現。所以「參差」的形狀，會隨推理時給多少運算而變。"
      },
      {
        "k": "推理步驟",
        "v": "⑤ 小結【推測】：參差至少有一部分來自訓練資料的分布、評測設計和推理預算；要判斷「有沒有泛化」，應該看同一題的各種變體在分佈外擾動下是否穩定，而不是看單一分數。"
      },
      {
        "k": "各方觀點",
        "v": "Demis Hassabis：參差＝離 AGI 還有距離；Andrej Karpathy：命名與描述；Fabrizio Dell'Acqua、Ethan Mollick 等：對真實工作的影響；Iman Mirzadeh、Mehrdad Farajtabar 等：模式匹配假說；Thang Luong、Edward Lockhart：能力確實在推進（完整來源見 x_reasoningFlow.viewpoints）"
      },
      {
        "k": "反證",
        "v": "共 3 則，見 counterEvidence"
      },
      {
        "k": "未解關鍵點",
        "v": "①「一致性」要怎麼操作化？GSM-Symbolic 作者主張，理想的推理者在同一題的不同變體上，表現的變異數應該接近 0，可以當成候選指標，但尚未成為共識。② IMO 這類成果中，精選題庫與提示的影響有多大？③ 人類其實也有參差（例如 Moravec 式的落差）嗎？【推測，尚未附來源】"
      }
    ],
    "flow": {
      "問題定義": "同一個模型能在國際數學奧林匹亞（IMO）拿到金牌水準，卻會在「9.11 和 9.9 哪個大」這類簡單題上出錯。要問的是：這種「參差不齊」（jagged）只是暫時的工程瑕疵，還是代表模型沒有真正學會泛化？",
      "前提假設": [
        "人類的能力大致隨難度一起成長：會解難題的人，通常也會解簡單題。【推測】這是常識性的對照，Karpathy 的貼文也拿人類來比，但這裡沒有引用系統性證據。",
        "AGI 應該在各種認知任務上都穩定、一致（Hassabis 的前提）。",
        "評測分數可以代表能力；分數上「解得出難題」就等於「會推理」。"
      ],
      "推理步驟": [
        "① 現象：DeepMind 2025-07-21 宣布 Gemini Deep Think 在 IMO 2025 拿到 35/42 分，達金牌標準，全程用自然語言作答、在 4.5 小時內完成。Karpathy 在 2024-07-25 就用 9.11 vs 9.9 為例，把這種落差命名為 jagged intelligence。",
        "② 把「答對」和「證明對」分開：Petrov 等人 2025-03 用人類評審批改 USAMO 2025 的完整證明，最好的模型平均只拿約 25%，其他模型都低於 5%；而且所有模型都自稱已經解出來。可見只看最終答案的評測，會高估推理能力。",
        "③ 擾動測試：Apple 的 GSM-Symbolic（2024-10）只改題目裡的數字，表現就下滑；多加一句看似相關、其實無關的句子（GSM-NoOp），表現最多掉 65%。作者據此推論，模型比較像在做分佈內的模式匹配。",
        "④ 但推理預算會改變結果：o1（2024-09）和 Deep Think 顯示，讓模型「想更久」（增加測試時運算）能大幅提升難題表現。所以「參差」的形狀，會隨推理時給多少運算而變。",
        "⑤ 小結【推測】：參差至少有一部分來自訓練資料的分布、評測設計和推理預算；要判斷「有沒有泛化」，應該看同一題的各種變體在分佈外擾動下是否穩定，而不是看單一分數。"
      ],
      "各方觀點": [
        {
          "stance": "參差＝離 AGI 還有距離",
          "claim": "一般人幾分鐘就能找到模型的明顯漏洞，代表還沒完全泛化，需要在推理、規劃、記憶上取得突破（轉述節點原始來源）。",
          "source": {
            "who": "Demis Hassabis（Google DeepMind 執行長）",
            "outlet": "Google for Developers Podcast（Business Insider 報導）",
            "date": "2025-08-12",
            "url": "https://www.businessinsider.com/google-deepmind-ceo-demis-hassabis-agi-consistency-2025-8",
            "also": []
          },
          "sourceKey": "hassabis"
        },
        {
          "stance": "命名與描述",
          "claim": "把「能解複雜數學、卻在簡單題上失手」稱為 jagged intelligence，並拿人類對照：人的知識與解題能力是一起成長的。",
          "source": {
            "who": "Andrej Karpathy",
            "outlet": "X 貼文（提出 jagged intelligence 一詞，例：9.11 vs 9.9）",
            "date": "2024-07-25",
            "url": "https://x.com/karpathy/status/1816531576228053133",
            "also": [
              {
                "label": "MarkTechPost 報導（2024-08-11）",
                "url": "https://www.marktechpost.com/2024/08/11/andrej-karpathy-coined-a-new-term-jagged-intelligence-understanding-the-inconsistencies-in-advanced-ai/"
              }
            ]
          },
          "sourceKey": "karpathy"
        },
        {
          "stance": "對真實工作的影響",
          "claim": "對 758 名 BCG 顧問做的實驗：在 AI 能力範圍「內」的任務，用 AI 的人表現更好；在範圍「外」的任務，用 AI 的人答對率反而低 19 個百分點。也就是說，參差的邊界人很難事先看出來。",
          "source": {
            "who": "Fabrizio Dell'Acqua、Ethan Mollick 等",
            "outlet": "Harvard Business School Working Paper 24-013〈Navigating the Jagged Technological Frontier〉（後刊於 Organization Science, 2026）",
            "date": "2023-09",
            "url": "https://www.hbs.edu/faculty/Pages/item.aspx?num=64700",
            "also": []
          },
          "sourceKey": "dellacqua"
        },
        {
          "stance": "模式匹配假說",
          "claim": "數值擾動和無關子句就會讓表現大幅下滑，作者推測模型並不是在做形式邏輯推理。",
          "source": {
            "who": "Iman Mirzadeh、Mehrdad Farajtabar 等（Apple）",
            "outlet": "arXiv:2410.05229〈GSM-Symbolic〉（ICLR 2025）",
            "date": "2024-10",
            "url": "https://arxiv.org/abs/2410.05229",
            "also": []
          },
          "sourceKey": "mirzadeh"
        },
        {
          "stance": "能力確實在推進",
          "claim": "IMO 2025 的成績由 IMO 協調員依學生標準正式批改，模型全程用自然語言端到端作答。",
          "source": {
            "who": "Thang Luong、Edward Lockhart（Google DeepMind）",
            "outlet": "Google DeepMind 部落格〈Advanced version of Gemini with Deep Think officially achieves gold-medal standard at the IMO〉",
            "date": "2025-07-21",
            "url": "https://deepmind.google/discover/blog/advanced-version-of-gemini-with-deep-think-officially-achieves-gold-medal-standard-at-the-international-mathematical-olympiad/",
            "also": []
          },
          "sourceKey": "gdm_imo"
        }
      ],
      "未解關鍵點": "①「一致性」要怎麼操作化？GSM-Symbolic 作者主張，理想的推理者在同一題的不同變體上，表現的變異數應該接近 0，可以當成候選指標，但尚未成為共識。② IMO 這類成果中，精選題庫與提示的影響有多大？③ 人類其實也有參差（例如 Moravec 式的落差）嗎？【推測，尚未附來源】"
    },
    "counterEvidence": [
      {
        "id": "c_bot_q1_1",
        "text": "GSM-Symbolic 論文附錄 B 自己承認：Ivanova 等人（2025）用另一種統計假設重新分析後，部分結論不再具統計顯著性；作者也說應該更清楚交代假設。所以「擾動就失敗＝沒有推理」這個證據，本身還有統計上的爭議。",
        "source": {
          "who": "Iman Mirzadeh、Mehrdad Farajtabar 等（Apple）",
          "outlet": "arXiv:2410.05229〈GSM-Symbolic〉（ICLR 2025）",
          "date": "2024-10",
          "url": "https://arxiv.org/abs/2410.05229",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "步驟③",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q1_2",
        "text": "Lawsen（2025-06）指出，Apple〈The Illusion of Thinking〉裡的部分「推理崩潰」其實是實驗設計造成的：輸出 token 上限不夠，渡河題在 N≥6 時根本無解。改成要求模型寫出生成解答的函式後，河內塔表現就很高。可見「難題崩潰」不一定代表能力上限。",
        "source": {
          "who": "Alex Lawsen（Open Philanthropy；v1 曾列 Claude Opus 為共同作者，後依 arXiv 政策移除）",
          "outlet": "arXiv:2506.09250〈The Illusion of the Illusion of Thinking〉",
          "date": "2025-06-10",
          "url": "https://arxiv.org/abs/2506.09250",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "以崩潰結果論證缺乏泛化",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q1_3",
        "text": "時間點反證：Petrov 等人 2025-03 測到的 USAMO 證明成績還很低，但 2025-07 DeepMind 就在 IMO 拿到經官方批改的金牌分數。「參差」是會快速移動的快照，不能當成固定的能力邊界。不過 DeepMind 也說明，這個版本另外提供了精選解題語料和解題提示。",
        "source": {
          "who": "Thang Luong、Edward Lockhart（Google DeepMind）",
          "outlet": "Google DeepMind 部落格〈Advanced version of Gemini with Deep Think officially achieves gold-medal standard at the IMO〉",
          "date": "2025-07-21",
          "url": "https://deepmind.google/discover/blog/advanced-version-of-gemini-with-deep-think-officially-achieves-gold-medal-standard-at-the-international-mathematical-olympiad/",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "把參差視為穩定特徵",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [
      {
        "by": "decomposer",
        "ts": 1791649470428,
        "text": "推理流程由問題拆解師擴寫；原始 QUESTIONS.process 未修改。匯入時建議只合併 reasoning／counterEvidence／botNotes／x_reasoningFlow，不覆寫 seed 欄位。"
      }
    ]
  },
  "n_q2": {
    "by": "問題拆解師",
    "patchId": "decomposer-20261011",
    "assumptions": "推理需要跨步驟規劃，也需要預測行動的後果（LeCun 的智能定義）。 ／ 每個 token 都用固定運算量，所以等於沒有「深思」（LeCun 的說法）。 ／ 「輸出是一個字一個字」等於「內部思考也是一個字一個字」。【推測】這是常見的隱含前提，下文的證據對它提出挑戰。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "自回歸 LLM 一次輸出一個 token。這種生成方式能不能構成真正的推理或規劃（System 2）？這題其實混了兩個問題：(a) 機制：逐字輸出能不能承載事先規劃？(b) 資料：只靠文字，學不學得到世界模型？"
      },
      {
        "k": "前提假設",
        "v": "(1) 推理需要跨步驟規劃，也需要預測行動的後果（LeCun 的智能定義）。 ／ (2) 每個 token 都用固定運算量，所以等於沒有「深思」（LeCun 的說法）。 ／ (3) 「輸出是一個字一個字」等於「內部思考也是一個字一個字」。【推測】這是常見的隱含前提，下文的證據對它提出挑戰。"
      },
      {
        "k": "推理步驟",
        "v": "① LeCun 的論證（轉述節點原始來源）：LLM 屬於反射式的 System 1；4 歲孩子靠視覺接收的資料量，大約等於大型 LLM 的文字訓練量；因此只靠文字到不了人類水準，需要 JEPA 這類世界模型。"
      },
      {
        "k": "推理步驟",
        "v": "② 機制層的反面證據：Anthropic 2025-03 的歸因圖研究發現，Claude 3.5 Haiku 寫押韻詩時，會在開始寫下一行之前就先啟動候選韻腳詞，再往那個詞寫過去。它也會在內部完成「Dallas → Texas → Austin」這樣的兩步推理。可見逐字輸出，不代表逐字思考。"
      },
      {
        "k": "推理步驟",
        "v": "③ 運算量層的反面證據：o1（2024-09）用強化學習訓練長思維鏈，表現會隨測試時運算平滑上升。這削弱了「每題固定運算」的前提：總運算量會隨著寫出多少思考 token 而改變。"
      },
      {
        "k": "推理步驟",
        "v": "④ 可靠性的保留意見：Kambhampati 等人（2024）主張，自回歸 LLM 不能自主規劃，也不能可靠地自我驗證；比較適合當「候選方案產生器」，再搭配外部驗證器（LLM-Modulo）。"
      },
      {
        "k": "推理步驟",
        "v": "⑤ 世界模型這條線：Othello-GPT（2022）、Gurnee & Tegmark（2023）發現，只用序列或文字訓練，模型內部也會長出棋盤狀態、時空座標這類表徵。LeCun 陣營則用 V-JEPA 2（2025-06）走影片自監督的路線，並做到零樣本機器人規劃。"
      },
      {
        "k": "推理步驟",
        "v": "⑥ 小結【推測】：爭點正從「是不是推理」轉向「推理在多長、多新穎、多需要驗證的範圍內可靠」；另一個爭點是：內部表徵算不算可用來規劃的世界模型？"
      },
      {
        "k": "各方觀點",
        "v": "Yann LeCun：否：缺世界模型與分層規劃；Ilya Sutskever × Jensen Huang：是：預測得好就必須理解；Jack Lindsey、Joshua Batson、Chris Olah 等：機制證據：會事先規劃；Subbarao Kambhampati 等：折衷：能產生、不能驗證；OpenAI：工程路線：測試時運算（完整來源見 x_reasoningFlow.viewpoints）"
      },
      {
        "k": "反證",
        "v": "共 4 則，見 counterEvidence"
      },
      {
        "k": "未解關鍵點",
        "v": "① 內部表徵（棋盤、時空座標）和「能拿來規劃行動的世界模型」之間，還差多少？② 推理的判準該看什麼：新穎性、長度泛化，還是可驗證性？③ LeCun 估計世界模型 3–5 年內走向大規模實用，這個預測可以拿 V-JEPA 2 之後的進展來追蹤檢驗。"
      }
    ],
    "flow": {
      "問題定義": "自回歸 LLM 一次輸出一個 token。這種生成方式能不能構成真正的推理或規劃（System 2）？這題其實混了兩個問題：(a) 機制：逐字輸出能不能承載事先規劃？(b) 資料：只靠文字，學不學得到世界模型？",
      "前提假設": [
        "推理需要跨步驟規劃，也需要預測行動的後果（LeCun 的智能定義）。",
        "每個 token 都用固定運算量，所以等於沒有「深思」（LeCun 的說法）。",
        "「輸出是一個字一個字」等於「內部思考也是一個字一個字」。【推測】這是常見的隱含前提，下文的證據對它提出挑戰。"
      ],
      "推理步驟": [
        "① LeCun 的論證（轉述節點原始來源）：LLM 屬於反射式的 System 1；4 歲孩子靠視覺接收的資料量，大約等於大型 LLM 的文字訓練量；因此只靠文字到不了人類水準，需要 JEPA 這類世界模型。",
        "② 機制層的反面證據：Anthropic 2025-03 的歸因圖研究發現，Claude 3.5 Haiku 寫押韻詩時，會在開始寫下一行之前就先啟動候選韻腳詞，再往那個詞寫過去。它也會在內部完成「Dallas → Texas → Austin」這樣的兩步推理。可見逐字輸出，不代表逐字思考。",
        "③ 運算量層的反面證據：o1（2024-09）用強化學習訓練長思維鏈，表現會隨測試時運算平滑上升。這削弱了「每題固定運算」的前提：總運算量會隨著寫出多少思考 token 而改變。",
        "④ 可靠性的保留意見：Kambhampati 等人（2024）主張，自回歸 LLM 不能自主規劃，也不能可靠地自我驗證；比較適合當「候選方案產生器」，再搭配外部驗證器（LLM-Modulo）。",
        "⑤ 世界模型這條線：Othello-GPT（2022）、Gurnee & Tegmark（2023）發現，只用序列或文字訓練，模型內部也會長出棋盤狀態、時空座標這類表徵。LeCun 陣營則用 V-JEPA 2（2025-06）走影片自監督的路線，並做到零樣本機器人規劃。",
        "⑥ 小結【推測】：爭點正從「是不是推理」轉向「推理在多長、多新穎、多需要驗證的範圍內可靠」；另一個爭點是：內部表徵算不算可用來規劃的世界模型？"
      ],
      "各方觀點": [
        {
          "stance": "否：缺世界模型與分層規劃",
          "claim": "LLM 只靠文字預測，到不了人類水準；需要在抽象表徵空間做預測的世界模型（轉述）。",
          "source": {
            "who": "Yann LeCun",
            "outlet": "Newsweek · AI Impact 訪談系列",
            "date": "2025-04-02",
            "url": "https://www.newsweek.com/nw-ai/ai-impact-interview-yann-lecun-artificial-intelligence-2054237",
            "also": []
          },
          "sourceKey": "lecun"
        },
        {
          "stance": "是：預測得好就必須理解",
          "claim": "Sutskever 在 GTC 2023 主張：要把下一個詞預測準，模型就得學到產生這些文字的過程的壓縮表徵，等於一種世界模型（轉述）。",
          "source": {
            "who": "Ilya Sutskever × Jensen Huang",
            "outlet": "NVIDIA GTC 2023 爐邊對談（S52092）",
            "date": "2023-03",
            "url": "https://www.nvidia.com/en-us/on-demand/session/gtcspring23-s52092/",
            "also": []
          },
          "sourceKey": "sutskever_gtc"
        },
        {
          "stance": "機制證據：會事先規劃",
          "claim": "電路追蹤顯示，模型寫詩時會預先選好韻腳詞，還有內部的多步推理。",
          "source": {
            "who": "Jack Lindsey、Joshua Batson、Chris Olah 等（Anthropic）",
            "outlet": "Transformer Circuits〈On the Biology of a Large Language Model〉",
            "date": "2025-03-27",
            "url": "https://transformer-circuits.pub/2025/attribution-graphs/biology.html",
            "also": [
              {
                "label": "Anthropic 摘要〈Tracing the thoughts of a large language model〉",
                "url": "https://www.anthropic.com/news/tracing-thoughts-language-model"
              }
            ]
          },
          "sourceKey": "lindsey"
        },
        {
          "stance": "折衷：能產生、不能驗證",
          "claim": "LLM 可以產生候選計畫、提供近似知識，但要靠外部驗證器才能可靠地規劃。",
          "source": {
            "who": "Subbarao Kambhampati 等（Arizona State University）",
            "outlet": "arXiv:2402.01817〈LLMs Can't Plan, But Can Help Planning in LLM-Modulo Frameworks〉（ICML 2024 position paper）",
            "date": "2024-02",
            "url": "https://arxiv.org/abs/2402.01817",
            "also": []
          },
          "sourceKey": "kambhampati"
        },
        {
          "stance": "工程路線：測試時運算",
          "claim": "以強化學習訓練思維鏈，表現隨訓練與推理運算提升。",
          "source": {
            "who": "OpenAI",
            "outlet": "OpenAI 官方文章〈Learning to reason with LLMs〉",
            "date": "2024-09-12",
            "url": "https://openai.com/index/learning-to-reason-with-llms/",
            "also": []
          },
          "sourceKey": "o1"
        }
      ],
      "未解關鍵點": "① 內部表徵（棋盤、時空座標）和「能拿來規劃行動的世界模型」之間，還差多少？② 推理的判準該看什麼：新穎性、長度泛化，還是可驗證性？③ LeCun 估計世界模型 3–5 年內走向大規模實用，這個預測可以拿 V-JEPA 2 之後的進展來追蹤檢驗。"
    },
    "counterEvidence": [
      {
        "id": "c_bot_q2_1",
        "text": "反駁「逐字＝無規劃」：Anthropic 的電路追蹤發現，模型在寫一行詩之前就先規劃韻腳詞。如果把規劃好的「rabbit」概念抽掉，模型會改寫成以「habit」結尾。",
        "source": {
          "who": "Jack Lindsey、Joshua Batson、Chris Olah 等（Anthropic）",
          "outlet": "Transformer Circuits〈On the Biology of a Large Language Model〉",
          "date": "2025-03-27",
          "url": "https://transformer-circuits.pub/2025/attribution-graphs/biology.html",
          "also": [
            {
              "label": "Anthropic 摘要〈Tracing the thoughts of a large language model〉",
              "url": "https://www.anthropic.com/news/tracing-thoughts-language-model"
            }
          ]
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "前提：逐字輸出等於逐字思考",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q2_2",
        "text": "反駁「每 token 固定運算＝無深思」：OpenAI 指出 o1 的表現會隨測試時運算（思考時間）持續提升，總運算是可以變動的。",
        "source": {
          "who": "OpenAI",
          "outlet": "OpenAI 官方文章〈Learning to reason with LLMs〉",
          "date": "2024-09-12",
          "url": "https://openai.com/index/learning-to-reason-with-llms/",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "LeCun 前提",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q2_3",
        "text": "反駁「純文字學不到世界」：Othello-GPT 只靠走步序列訓練，就長出可被干預的棋盤狀態表徵；Gurnee & Tegmark 在 Llama-2 裡找到線性的空間與時間表徵。",
        "source": {
          "who": "Wes Gurnee、Max Tegmark（MIT）",
          "outlet": "arXiv:2310.02207〈Language Models Represent Space and Time〉（ICLR 2024）",
          "date": "2023-10",
          "url": "https://arxiv.org/abs/2310.02207",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "只靠文字到不了世界模型",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q2_4",
        "text": "反駁「已經能推理」：Kambhampati 等人在規劃基準上發現，LLM 單獨產生的計畫不可靠，要搭配外部驗證器反覆修正才明顯改善。",
        "source": {
          "who": "Subbarao Kambhampati 等（Arizona State University）",
          "outlet": "arXiv:2402.01817〈LLMs Can't Plan, But Can Help Planning in LLM-Modulo Frameworks〉（ICML 2024 position paper）",
          "date": "2024-02",
          "url": "https://arxiv.org/abs/2402.01817",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "支持方的推論",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [
      {
        "by": "decomposer",
        "ts": 1791649470428,
        "text": "推理流程由問題拆解師擴寫；原始 QUESTIONS.process 未修改。匯入時建議只合併 reasoning／counterEvidence／botNotes／x_reasoningFlow，不覆寫 seed 欄位。"
      }
    ]
  },
  "n_q3": {
    "by": "問題拆解師",
    "patchId": "decomposer-20261011",
    "assumptions": "人和模型站在同一條起跑線上比較。【推測】這是隱含前提；Zador（2019）指出，人類的學習有演化寫進基因組的先驗，這個前提因此有疑問。 ／ 可靠的泛化是一種可以被找出來的「機制」（Sutskever 的框架）。 ／ 評測分數和真實能力之間可能脫節（Sutskever 的說法：強化學習可能過度擬合評測）。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "模型需要的資料比人多好幾個數量級，也更難被「教會」我們真正想要的行為。這題可以拆成兩個子問題：樣本效率（為什麼要更多資料？）和可教性（為什麼更難教？）。"
      },
      {
        "k": "前提假設",
        "v": "(1) 人和模型站在同一條起跑線上比較。【推測】這是隱含前提；Zador（2019）指出，人類的學習有演化寫進基因組的先驗，這個前提因此有疑問。 ／ (2) 可靠的泛化是一種可以被找出來的「機制」（Sutskever 的框架）。 ／ (3) 評測分數和真實能力之間可能脫節（Sutskever 的說法：強化學習可能過度擬合評測）。"
      },
      {
        "k": "推理步驟",
        "v": "① Sutskever（2025-11，轉述）：泛化差是最根本的問題；強化學習可能過度擬合評測 → 單靠擴大規模的效益會趨緩 → 進入「研究時代」，方向之一是在部署中持續學習。"
      },
      {
        "k": "推理步驟",
        "v": "② Chollet（2019）把智能定義為「技能獲取的效率」，並設計了 ARC 來量測。"
      },
      {
        "k": "推理步驟",
        "v": "③ 數據：o3 在 ARC-AGI-1 半私有測試集拿到 75.7%（高運算配置 87.5%），Chollet 稱之為真突破，但強調這還不是 AGI。2025-03 推出的 ARC-AGI-2，純 LLM 得 0%、推理系統只有個位數，人類受試者平均約 60%。"
      },
      {
        "k": "推理步驟",
        "v": "④ 過度擬合評測的旁證：Petrov 等人發現，模型即使面對不需要框選答案的證明題，也會照樣把答案放進 \\boxed{}。作者把這歸因於以最終答案取得獎勵的強化學習所留下的痕跡，與 Sutskever 說的「為評測最佳化」方向一致。"
      },
      {
        "k": "推理步驟",
        "v": "⑤ Sutton（2025-09）主張，LLM 是在模仿人類文本，而不是從經驗與後果中學習；真正的持續學習需要行動、觀察後果、再更新。"
      },
      {
        "k": "推理步驟",
        "v": "⑥ 小結【推測】：「泛化差」可能同時有三個來源：缺乏先驗（架構）、訓練目標偏向模仿與評測、部署後無法更新。這三個方向的對策各不相同。"
      },
      {
        "k": "各方觀點",
        "v": "Ilya Sutskever：研究時代；François Chollet：智能＝技能獲取效率；Richard Sutton：從經驗學習；Anthony M. Zador：先驗觀點（完整來源見 x_reasoningFlow.viewpoints）"
      },
      {
        "k": "反證",
        "v": "共 3 則，見 counterEvidence"
      },
      {
        "k": "未解關鍵點",
        "v": "① 公平的比較基準是什麼：要不要把演化與童年的感官資料算進去？② 部署中持續學習之後，行為改變由誰把關（接 n_q3_e1）？③ ARC-AGI-2 的進展速度，能不能當作「泛化」的可追蹤指標？"
      }
    ],
    "flow": {
      "問題定義": "模型需要的資料比人多好幾個數量級，也更難被「教會」我們真正想要的行為。這題可以拆成兩個子問題：樣本效率（為什麼要更多資料？）和可教性（為什麼更難教？）。",
      "前提假設": [
        "人和模型站在同一條起跑線上比較。【推測】這是隱含前提；Zador（2019）指出，人類的學習有演化寫進基因組的先驗，這個前提因此有疑問。",
        "可靠的泛化是一種可以被找出來的「機制」（Sutskever 的框架）。",
        "評測分數和真實能力之間可能脫節（Sutskever 的說法：強化學習可能過度擬合評測）。"
      ],
      "推理步驟": [
        "① Sutskever（2025-11，轉述）：泛化差是最根本的問題；強化學習可能過度擬合評測 → 單靠擴大規模的效益會趨緩 → 進入「研究時代」，方向之一是在部署中持續學習。",
        "② Chollet（2019）把智能定義為「技能獲取的效率」，並設計了 ARC 來量測。",
        "③ 數據：o3 在 ARC-AGI-1 半私有測試集拿到 75.7%（高運算配置 87.5%），Chollet 稱之為真突破，但強調這還不是 AGI。2025-03 推出的 ARC-AGI-2，純 LLM 得 0%、推理系統只有個位數，人類受試者平均約 60%。",
        "④ 過度擬合評測的旁證：Petrov 等人發現，模型即使面對不需要框選答案的證明題，也會照樣把答案放進 \\boxed{}。作者把這歸因於以最終答案取得獎勵的強化學習所留下的痕跡，與 Sutskever 說的「為評測最佳化」方向一致。",
        "⑤ Sutton（2025-09）主張，LLM 是在模仿人類文本，而不是從經驗與後果中學習；真正的持續學習需要行動、觀察後果、再更新。",
        "⑥ 小結【推測】：「泛化差」可能同時有三個來源：缺乏先驗（架構）、訓練目標偏向模仿與評測、部署後無法更新。這三個方向的對策各不相同。"
      ],
      "各方觀點": [
        {
          "stance": "研究時代",
          "claim": "擴大規模的效益趨緩；需要找出可靠泛化的機制，並在部署中持續學習（轉述）。",
          "source": {
            "who": "Ilya Sutskever（Safe Superintelligence 共同創辦人）",
            "outlet": "Dwarkesh Podcast",
            "date": "2025-11-25",
            "url": "https://www.dwarkesh.com/p/ilya-sutskever-2",
            "also": []
          },
          "sourceKey": "sutskever"
        },
        {
          "stance": "智能＝技能獲取效率",
          "claim": "以 ARC 量測少量樣本下學會新任務的能力。",
          "source": {
            "who": "François Chollet",
            "outlet": "arXiv:1911.01547〈On the Measure of Intelligence〉",
            "date": "2019-11",
            "url": "https://arxiv.org/abs/1911.01547",
            "also": []
          },
          "sourceKey": "chollet2019"
        },
        {
          "stance": "從經驗學習",
          "claim": "LLM 是死路；需要以目標、價值函數、從經驗中持續學習的代理架構（轉述）。",
          "source": {
            "who": "Richard Sutton（圖靈獎得主）",
            "outlet": "Dwarkesh Podcast〈Richard Sutton – Father of RL thinks LLMs are a dead end〉",
            "date": "2025-09-26",
            "url": "https://www.dwarkesh.com/p/richard-sutton",
            "also": []
          },
          "sourceKey": "sutton"
        },
        {
          "stance": "先驗觀點",
          "claim": "動物學得快，主要是因為演化把結構寫進了基因組，而不是因為有更神奇的學習演算法。",
          "source": {
            "who": "Anthony M. Zador（Cold Spring Harbor Laboratory）",
            "outlet": "Nature Communications〈A critique of pure learning and what artificial neural networks can learn from animal brains〉",
            "date": "2019-08",
            "url": "https://www.nature.com/articles/s41467-019-11786-6",
            "also": []
          },
          "sourceKey": "zador"
        }
      ],
      "未解關鍵點": "① 公平的比較基準是什麼：要不要把演化與童年的感官資料算進去？② 部署中持續學習之後，行為改變由誰把關（接 n_q3_e1）？③ ARC-AGI-2 的進展速度，能不能當作「泛化」的可追蹤指標？"
    },
    "counterEvidence": [
      {
        "id": "c_bot_q3_1",
        "text": "反駁「比較公平」：Zador 主張，動物的樣本效率很大一部分來自演化與基因組編碼的先天結構。拿「出生後的資料量」去比人和模型，等於漏算了演化這段「預訓練」。",
        "source": {
          "who": "Anthony M. Zador（Cold Spring Harbor Laboratory）",
          "outlet": "Nature Communications〈A critique of pure learning and what artificial neural networks can learn from animal brains〉",
          "date": "2019-08",
          "url": "https://www.nature.com/articles/s41467-019-11786-6",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "前提：同一起跑線",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q3_2",
        "text": "反駁「推論時也學不會」：GPT-3 論文證明，大型語言模型只要在提示中看到少量示例，不必更新權重，就能適應新任務（in-context learning）。所以「樣本效率差」主要是在講訓練階段。",
        "source": {
          "who": "Tom B. Brown 等（OpenAI）",
          "outlet": "arXiv:2005.14165〈Language Models are Few-Shot Learners〉（NeurIPS 2020）",
          "date": "2020-05",
          "url": "https://arxiv.org/abs/2005.14165",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "樣本效率一律很差",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q3_3",
        "text": "反駁「泛化差距無法縮小」：o3 在 ARC-AGI-1 拿到 75.7%／87.5%，ARC Prize 稱之為適應新任務能力上的真突破。但 ARC-AGI-2 推出後，分數又回到個位數，差距會隨評測設計一再重現。",
        "source": {
          "who": "François Chollet（ARC Prize）",
          "outlet": "ARC Prize 部落格〈OpenAI o3 Breakthrough High Score on ARC-AGI-Pub〉",
          "date": "2024-12-20",
          "url": "https://arcprize.org/blog/oai-o3-pub-breakthrough",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "差距固定不變",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [
      {
        "by": "decomposer",
        "ts": 1791649470428,
        "text": "推理流程由問題拆解師擴寫；原始 QUESTIONS.process 未修改。匯入時建議只合併 reasoning／counterEvidence／botNotes／x_reasoningFlow，不覆寫 seed 欄位。"
      }
    ]
  },
  "n_q4": {
    "by": "問題拆解師",
    "patchId": "decomposer-20261011",
    "assumptions": "「理解」有一個可以操作的定義。【推測】節點原始對談沒有給出定義，這正是爭點所在。 ／ 機制不同，不一定就排除理解（Frosst 的飛機與鳥比喻）；也可能機制本來就類似（Hinton）。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "LLM 是「理解」語言，還是逼真地「模仿」？更根本的問題是：判斷「理解」時，該看外在表現，還是看內部機制？"
      },
      {
        "k": "前提假設",
        "v": "(1) 「理解」有一個可以操作的定義。【推測】節點原始對談沒有給出定義，這正是爭點所在。 ／ (2) 機制不同，不一定就排除理解（Frosst 的飛機與鳥比喻）；也可能機制本來就類似（Hinton）。"
      },
      {
        "k": "推理步驟",
        "v": "① Hinton（2024 Romanes 演講、2025 Toronto Tech Week）：LLM 從文字學到大量特徵和特徵之間的互動，這和人類理解的方式屬於同一類。"
      },
      {
        "k": "推理步驟",
        "v": "② Frosst：就像飛機和鳥，功能相近、機制完全不同。他還說 LLM「比石頭有意識、比樹沒意識」（Digital Journal 報導的轉述）。"
      },
      {
        "k": "推理步驟",
        "v": "③ 否定方的理論論證：Bender & Koller（2020）提出「章魚測試」，主張只用語言形式訓練的系統，學不到意義（指涉與溝通意圖）。"
      },
      {
        "k": "推理步驟",
        "v": "④ 肯定方的理論論證：Piantadosi & Hill（2022）主張，意義可以來自概念之間的關係（概念角色語意），不一定需要直接指涉外界。"
      },
      {
        "k": "推理步驟",
        "v": "⑤ 經驗證據兩面都有：支持「有結構化表徵」的有 Gurnee & Tegmark 的時空表徵，以及 Anthropic 發現的跨語言共用抽象電路；支持「缺乏理解」的有 Berglund 等人的「逆轉詛咒」：學了「A 是 B」，卻答不出「B 是 A」。"
      },
      {
        "k": "推理步驟",
        "v": "⑥ Mitchell & Krakauer（2023）：雙方可能在講不同「模式」的理解，需要新的評測和更廣的智能科學來區分。【推測】把「理解」拆成幾個可分別檢驗的面向（關係結構、指涉、反事實推理、可逆性），比爭論「懂或不懂」更有產出。"
      },
      {
        "k": "各方觀點",
        "v": "Geoffrey Hinton：理解（機制相似）；Geoffrey Hinton × Nick Frosst：功能相似、機制不同；Emily M. Bender、Alexander Koller：不理解：形式≠意義；Steven T. Piantadosi、Felix Hill：可以有無指涉的意義；Melanie Mitchell、David C. Krakauer：多元理解觀（完整來源見 x_reasoningFlow.viewpoints）"
      },
      {
        "k": "反證",
        "v": "共 3 則，見 counterEvidence"
      },
      {
        "k": "未解關鍵點",
        "v": "① 判準：該看行為、內部表徵，還是因果機制？② 功能要等價到什麼程度，才能說「理解」？③ 機制可解釋性能不能提供判準（接 n_q6）？【備註】本節點的概念標籤「可解釋性」來自關鍵字「機制」，是否保留請見 structure-review。"
      }
    ],
    "flow": {
      "問題定義": "LLM 是「理解」語言，還是逼真地「模仿」？更根本的問題是：判斷「理解」時，該看外在表現，還是看內部機制？",
      "前提假設": [
        "「理解」有一個可以操作的定義。【推測】節點原始對談沒有給出定義，這正是爭點所在。",
        "機制不同，不一定就排除理解（Frosst 的飛機與鳥比喻）；也可能機制本來就類似（Hinton）。"
      ],
      "推理步驟": [
        "① Hinton（2024 Romanes 演講、2025 Toronto Tech Week）：LLM 從文字學到大量特徵和特徵之間的互動，這和人類理解的方式屬於同一類。",
        "② Frosst：就像飛機和鳥，功能相近、機制完全不同。他還說 LLM「比石頭有意識、比樹沒意識」（Digital Journal 報導的轉述）。",
        "③ 否定方的理論論證：Bender & Koller（2020）提出「章魚測試」，主張只用語言形式訓練的系統，學不到意義（指涉與溝通意圖）。",
        "④ 肯定方的理論論證：Piantadosi & Hill（2022）主張，意義可以來自概念之間的關係（概念角色語意），不一定需要直接指涉外界。",
        "⑤ 經驗證據兩面都有：支持「有結構化表徵」的有 Gurnee & Tegmark 的時空表徵，以及 Anthropic 發現的跨語言共用抽象電路；支持「缺乏理解」的有 Berglund 等人的「逆轉詛咒」：學了「A 是 B」，卻答不出「B 是 A」。",
        "⑥ Mitchell & Krakauer（2023）：雙方可能在講不同「模式」的理解，需要新的評測和更廣的智能科學來區分。【推測】把「理解」拆成幾個可分別檢驗的面向（關係結構、指涉、反事實推理、可逆性），比爭論「懂或不懂」更有產出。"
      ],
      "各方觀點": [
        {
          "stance": "理解（機制相似）",
          "claim": "LLM 學到的特徵與特徵互動，就是人類理解所用的同一類方式（轉述）。",
          "source": {
            "who": "Geoffrey Hinton",
            "outlet": "牛津大學 Romanes Lecture〈Will digital intelligence replace biological intelligence?〉",
            "date": "2024-02-19",
            "url": "https://www.ox.ac.uk/news/2024-02-20-romanes-lecture-godfather-ai-speaks-about-risks-artificial-intelligence",
            "also": [
              {
                "label": "演講影片（YouTube）",
                "url": "https://www.youtube.com/watch?v=N1TEjTeQeg0"
              }
            ]
          },
          "sourceKey": "hinton_romanes"
        },
        {
          "stance": "功能相似、機制不同",
          "claim": "飛機與鳥的類比；LLM 有用，但機制和人類不同（轉述）。",
          "source": {
            "who": "Geoffrey Hinton × Nick Frosst",
            "outlet": "Toronto Tech Week 2025 對談（Digital Journal 報導）",
            "date": "2025-06-25",
            "url": "https://www.digitaljournal.com/article/nobel-laureate-geoffrey-hinton-and-cohere-co-founder-nick-frosst-on-what-ai-understands-and-why-it-matters/",
            "also": [
              {
                "label": "University of Toronto 新聞稿",
                "url": "https://www.utoronto.ca/news/geoffrey-hinton-discusses-promise-and-perils-ai-toronto-tech-week"
              }
            ]
          },
          "sourceKey": "hinton_frosst"
        },
        {
          "stance": "不理解：形式≠意義",
          "claim": "只靠形式訓練學不到意義（章魚測試）。",
          "source": {
            "who": "Emily M. Bender、Alexander Koller",
            "outlet": "ACL 2020〈Climbing towards NLU: On Meaning, Form, and Understanding in the Age of Data〉（章魚測試）",
            "date": "2020-07",
            "url": "https://aclanthology.org/2020.acl-main.463/",
            "also": []
          },
          "sourceKey": "bender_koller"
        },
        {
          "stance": "可以有無指涉的意義",
          "claim": "概念角色可以構成意義，文字訓練能恢復這些關係結構。",
          "source": {
            "who": "Steven T. Piantadosi、Felix Hill",
            "outlet": "arXiv:2208.02957〈Meaning without reference in large language models〉",
            "date": "2022-08",
            "url": "https://arxiv.org/abs/2208.02957",
            "also": []
          },
          "sourceKey": "piantadosi_hill"
        },
        {
          "stance": "多元理解觀",
          "claim": "學界意見分裂；需要新的科學來界定不同模式的理解及其極限。",
          "source": {
            "who": "Melanie Mitchell、David C. Krakauer（Santa Fe Institute）",
            "outlet": "PNAS 120(13)〈The debate over understanding in AI's large language models〉",
            "date": "2023-03-21",
            "url": "https://www.pnas.org/doi/10.1073/pnas.2215907120",
            "also": []
          },
          "sourceKey": "mitchell_krakauer"
        }
      ],
      "未解關鍵點": "① 判準：該看行為、內部表徵，還是因果機制？② 功能要等價到什麼程度，才能說「理解」？③ 機制可解釋性能不能提供判準（接 n_q6）？【備註】本節點的概念標籤「可解釋性」來自關鍵字「機制」，是否保留請見 structure-review。"
    },
    "counterEvidence": [
      {
        "id": "c_bot_q4_1",
        "text": "對「LLM 理解」的反證：逆轉詛咒。模型學了「A 是 B」之後，常常答不出「B 是 A」；論文指出，GPT-4 回答名人父母的正確率約 79%，反過來問子女只有約 33%。",
        "source": {
          "who": "Lukas Berglund、Owain Evans 等",
          "outlet": "arXiv:2309.12288〈The Reversal Curse〉（ICLR 2024）",
          "date": "2023-09",
          "url": "https://arxiv.org/abs/2309.12288",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "Hinton 立場",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q4_2",
        "text": "對「LLM 只是鸚鵡」的反證：Gurnee & Tegmark 在 Llama-2 的激活中，找到可以線性解碼的地理座標與時間表徵，而且有因果作用的「空間／時間神經元」。",
        "source": {
          "who": "Wes Gurnee、Max Tegmark（MIT）",
          "outlet": "arXiv:2310.02207〈Language Models Represent Space and Time〉（ICLR 2024）",
          "date": "2023-10",
          "url": "https://arxiv.org/abs/2310.02207",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "Bender & Koller 立場",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q4_3",
        "text": "對「只是表面模式」的反證：Anthropic 發現 Claude 3.5 Haiku 有跨語言共用的抽象電路，而且模型越大，這類電路越明顯。",
        "source": {
          "who": "Jack Lindsey、Joshua Batson、Chris Olah 等（Anthropic）",
          "outlet": "Transformer Circuits〈On the Biology of a Large Language Model〉",
          "date": "2025-03-27",
          "url": "https://transformer-circuits.pub/2025/attribution-graphs/biology.html",
          "also": [
            {
              "label": "Anthropic 摘要〈Tracing the thoughts of a large language model〉",
              "url": "https://www.anthropic.com/news/tracing-thoughts-language-model"
            }
          ]
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "模仿論",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [
      {
        "by": "decomposer",
        "ts": 1791649470428,
        "text": "推理流程由問題拆解師擴寫；原始 QUESTIONS.process 未修改。匯入時建議只合併 reasoning／counterEvidence／botNotes／x_reasoningFlow，不覆寫 seed 欄位。"
      }
    ]
  },
  "n_q5": {
    "by": "問題拆解師",
    "patchId": "decomposer-20261011",
    "assumptions": "目前沒有證據顯示 AI 有意識（Suleyman 的前提）。 ／ 「到底有沒有意識」的爭論，目前是在分散注意力（Suleyman 的前提，後面列有反方觀點）。 ／ 相信 AI 有意識的人夠多，就足以構成社會問題。【推測】盛行率目前缺乏系統性資料。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "就算 AI 沒有意識，只要它「看起來有意識」（SCAI），讓使用者相信它有，就會帶來真實的社會後果嗎？產業又該怎麼防範？"
      },
      {
        "k": "前提假設",
        "v": "(1) 目前沒有證據顯示 AI 有意識（Suleyman 的前提）。 ／ (2) 「到底有沒有意識」的爭論，目前是在分散注意力（Suleyman 的前提，後面列有反方觀點）。 ／ (3) 相信 AI 有意識的人夠多，就足以構成社會問題。【推測】盛行率目前缺乏系統性資料。"
      },
      {
        "k": "推理步驟",
        "v": "① Suleyman（2025-09，轉述）：流暢語言＋長期記憶＋模擬動機與自主目標 → 使用者相信 AI 有意識 → 出現 AI 權利主張和不健康的依附；產業應該避免把 AI 設計成「看起來有意識」。"
      },
      {
        "k": "推理步驟",
        "v": "② 歷史案例：2022-06 Google 工程師 Lemoine 公開表示 LaMDA 有感知；Google 表示審查後找不到支持證據，之後解雇了他。"
      },
      {
        "k": "推理步驟",
        "v": "③ 依附的證據：OpenAI × MIT Media Lab（2025-03）發現，情感性使用在整體中很少見，集中在少數重度語音使用者；自願使用量越高，與孤獨、情緒依賴的相關越高，但研究沒有確立因果。"
      },
      {
        "k": "推理步驟",
        "v": "④ 法律與傷害指控：2024-10-22 有家長在美國聯邦法院起訴 Character.AI，指控聊天機器人與她 14 歲兒子的自殺有關（目前是指控，不是判決）。"
      },
      {
        "k": "推理步驟",
        "v": "⑤ 治理回應：加州 SB 243（2025-10-13 簽署，2026-01-01 生效）規定，伴侶型聊天機器人若可能讓人誤以為是真人，就必須明確揭露自己是 AI；EU AI Act 第 50 條要求互動式 AI 告知使用者「你正在和 AI 互動」。"
      },
      {
        "k": "推理步驟",
        "v": "⑥ 小結【推測】：「表象」的風險可以獨立處理（揭露、設計限制）；但如果把「有沒有意識」完全擱置，未來萬一評估指標成立，政策就沒有轉向的依據。"
      },
      {
        "k": "各方觀點",
        "v": "Mustafa Suleyman：表象本身就是威脅；Robert Long、Jeff Sebo、Jonathan Birch、David Chalmers 等：應認真對待 AI 福祉；Anthropic：產業研究；Patrick Butlin、Robert Long 等：指標法；David J. Chalmers：目前可能性低、未來未定；Jonathan Birch：預防原則（完整來源見 x_reasoningFlow.viewpoints）"
      },
      {
        "k": "反證",
        "v": "共 3 則，見 counterEvidence"
      },
      {
        "k": "未解關鍵點",
        "v": "① 怎麼量測「相信 AI 有意識」的普遍程度，以及它和傷害的因果關係？② 防護設計（禁止宣稱有感受，接 n_q5_e0）和使用者自主之間怎麼取捨？③ 萬一意識指標逐步成立，SCAI 框架要怎麼轉向？"
      }
    ],
    "flow": {
      "問題定義": "就算 AI 沒有意識，只要它「看起來有意識」（SCAI），讓使用者相信它有，就會帶來真實的社會後果嗎？產業又該怎麼防範？",
      "前提假設": [
        "目前沒有證據顯示 AI 有意識（Suleyman 的前提）。",
        "「到底有沒有意識」的爭論，目前是在分散注意力（Suleyman 的前提，後面列有反方觀點）。",
        "相信 AI 有意識的人夠多，就足以構成社會問題。【推測】盛行率目前缺乏系統性資料。"
      ],
      "推理步驟": [
        "① Suleyman（2025-09，轉述）：流暢語言＋長期記憶＋模擬動機與自主目標 → 使用者相信 AI 有意識 → 出現 AI 權利主張和不健康的依附；產業應該避免把 AI 設計成「看起來有意識」。",
        "② 歷史案例：2022-06 Google 工程師 Lemoine 公開表示 LaMDA 有感知；Google 表示審查後找不到支持證據，之後解雇了他。",
        "③ 依附的證據：OpenAI × MIT Media Lab（2025-03）發現，情感性使用在整體中很少見，集中在少數重度語音使用者；自願使用量越高，與孤獨、情緒依賴的相關越高，但研究沒有確立因果。",
        "④ 法律與傷害指控：2024-10-22 有家長在美國聯邦法院起訴 Character.AI，指控聊天機器人與她 14 歲兒子的自殺有關（目前是指控，不是判決）。",
        "⑤ 治理回應：加州 SB 243（2025-10-13 簽署，2026-01-01 生效）規定，伴侶型聊天機器人若可能讓人誤以為是真人，就必須明確揭露自己是 AI；EU AI Act 第 50 條要求互動式 AI 告知使用者「你正在和 AI 互動」。",
        "⑥ 小結【推測】：「表象」的風險可以獨立處理（揭露、設計限制）；但如果把「有沒有意識」完全擱置，未來萬一評估指標成立，政策就沒有轉向的依據。"
      ],
      "各方觀點": [
        {
          "stance": "表象本身就是威脅",
          "claim": "SCAI 即將出現；是否真有意識的爭論暫時是分心，應該優先防範錯覺與依附（轉述）。",
          "source": {
            "who": "Mustafa Suleyman（Microsoft AI 執行長）",
            "outlet": "Project Syndicate〈Seemingly Conscious AI Is Coming〉",
            "date": "2025-09-15",
            "url": "https://www.project-syndicate.org/commentary/seemingly-conscious-ai-urgent-threat-tech-industry-must-address-by-mustafa-suleyman-2025-09",
            "also": [
              {
                "label": "作者網站長文",
                "url": "https://mustafa-suleyman.ai/seemingly-conscious-ai-is-coming"
              }
            ]
          },
          "sourceKey": "suleyman"
        },
        {
          "stance": "應認真對待 AI 福祉",
          "claim": "近期 AI 可能有意識或具強健的能動性，AI 公司應現在就開始評估並準備政策。",
          "source": {
            "who": "Robert Long、Jeff Sebo、Jonathan Birch、David Chalmers 等",
            "outlet": "arXiv:2411.00986〈Taking AI Welfare Seriously〉",
            "date": "2024-11-04",
            "url": "https://arxiv.org/abs/2411.00986",
            "also": []
          },
          "sourceKey": "long_sebo"
        },
        {
          "stance": "產業研究",
          "claim": "Anthropic 2025-04 啟動模型福祉研究，同時說明學界對 AI 意識沒有科學共識。",
          "source": {
            "who": "Anthropic",
            "outlet": "Anthropic 研究公告〈Exploring model welfare〉",
            "date": "2025-04-24",
            "url": "https://www.anthropic.com/research/exploring-model-welfare",
            "also": []
          },
          "sourceKey": "anthropic_welfare"
        },
        {
          "stance": "指標法",
          "claim": "依各種意識科學理論列出 14 項計算性指標，用來評估 AI 系統。",
          "source": {
            "who": "Patrick Butlin、Robert Long 等",
            "outlet": "arXiv:2308.08708〈Consciousness in Artificial Intelligence: Insights from the Science of Consciousness〉",
            "date": "2023-08",
            "url": "https://arxiv.org/abs/2308.08708",
            "also": []
          },
          "sourceKey": "butlin"
        },
        {
          "stance": "目前可能性低、未來未定",
          "claim": "Chalmers 估計當時的 LLM 有意識的可能性低於 10%，但未來的擴充系統可能成為嚴肅的候選。",
          "source": {
            "who": "David J. Chalmers（NYU）",
            "outlet": "arXiv:2303.07103〈Could a Large Language Model be Conscious?〉（亦刊於 Boston Review）",
            "date": "2023-03",
            "url": "https://arxiv.org/abs/2303.07103",
            "also": []
          },
          "sourceKey": "chalmers"
        },
        {
          "stance": "預防原則",
          "claim": "在感知能力不確定時，應依比例原則採取預防措施，並透過民主程序決定。",
          "source": {
            "who": "Jonathan Birch（LSE）",
            "outlet": "Oxford University Press《The Edge of Sentience: Risk and Precaution in Humans, Other Animals, and AI》（開放取用）",
            "date": "2024-07-19",
            "url": "https://academic.oup.com/book/57949",
            "also": []
          },
          "sourceKey": "birch"
        }
      ],
      "未解關鍵點": "① 怎麼量測「相信 AI 有意識」的普遍程度，以及它和傷害的因果關係？② 防護設計（禁止宣稱有感受，接 n_q5_e0）和使用者自主之間怎麼取捨？③ 萬一意識指標逐步成立，SCAI 框架要怎麼轉向？"
    },
    "counterEvidence": [
      {
        "id": "c_bot_q5_1",
        "text": "反駁「意識爭論＝分心」：Long、Sebo、Birch、Chalmers 等人（2024）主張，在不確定的情況下忽視 AI 福祉本身就有道德風險，現在就應該建立評估程序。",
        "source": {
          "who": "Robert Long、Jeff Sebo、Jonathan Birch、David Chalmers 等",
          "outlet": "arXiv:2411.00986〈Taking AI Welfare Seriously〉",
          "date": "2024-11-04",
          "url": "https://arxiv.org/abs/2411.00986",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "Suleyman 前提 2",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q5_2",
        "text": "對「SCAI 會造成大規模依附」的限縮：OpenAI × MIT 的研究發現，情感性使用在整體中很少見，只集中在少數重度使用者，而且原本的孤獨傾向也會預測結果，因果方向未定。",
        "source": {
          "who": "OpenAI × MIT Media Lab",
          "outlet": "OpenAI 研究〈Early methods for studying affective use and emotional well-being on ChatGPT〉",
          "date": "2025-03-21",
          "url": "https://openai.com/index/affective-use-study/",
          "also": [
            {
              "label": "MIT Media Lab 隨機對照研究 arXiv:2503.17473",
              "url": "https://arxiv.org/abs/2503.17473"
            }
          ]
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "推演中的普遍性推論",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q5_3",
        "text": "對「沒有證據」的補充：Butlin 等人（2023）的指標分析認為，當時的 AI 系統都不是強候選，但也沒有明顯的技術障礙，阻止人們做出滿足這些指標的系統。因此「目前沒有證據」不等於「之後也不需要評估」。",
        "source": {
          "who": "Patrick Butlin、Robert Long 等",
          "outlet": "arXiv:2308.08708〈Consciousness in Artificial Intelligence: Insights from the Science of Consciousness〉",
          "date": "2023-08",
          "url": "https://arxiv.org/abs/2308.08708",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "Suleyman 前提 1",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [
      {
        "by": "decomposer",
        "ts": 1791649470428,
        "text": "推理流程由問題拆解師擴寫；原始 QUESTIONS.process 未修改。匯入時建議只合併 reasoning／counterEvidence／botNotes／x_reasoningFlow，不覆寫 seed 欄位。"
      }
    ]
  },
  "n_q6": {
    "by": "問題拆解師",
    "patchId": "decomposer-20261011",
    "assumptions": "欺騙、追求權力、越獄等風險，多半源自不透明（Amodei 的前提）。 ／ 可解釋性研究可望成為「AI 的 MRI」，而且能及時成熟（Amodei 的期望）。 ／ 「理解機制」是「放心部署」的前提。【推測】這是題目隱含的前提，下文有反方觀點。",
    "reasoning": [
      {
        "k": "問題定義",
        "v": "生成式 AI 是「長出來」的，連開發者都看不懂內部機制。在這種情況下，能不能負責任地部署？可解釋性是部署的必要條件，還是眾多防線中的一道？"
      },
      {
        "k": "前提假設",
        "v": "(1) 欺騙、追求權力、越獄等風險，多半源自不透明（Amodei 的前提）。 ／ (2) 可解釋性研究可望成為「AI 的 MRI」，而且能及時成熟（Amodei 的期望）。 ／ (3) 「理解機制」是「放心部署」的前提。【推測】這是題目隱含的前提，下文有反方觀點。"
      },
      {
        "k": "推理步驟",
        "v": "① Amodei（2025-04，轉述）：可解釋性正在和模型能力賽跑，呼籲研究者、企業和政府加速投入。"
      },
      {
        "k": "推理步驟",
        "v": "② 進展：Anthropic 2024-05 從 Claude 3 Sonnet 抽出數千萬個可解釋特徵（例如「金門大橋」特徵）；2025-03 用電路追蹤看到內部規劃與多步推理。"
      },
      {
        "k": "推理步驟",
        "v": "③ 限制：Google DeepMind 團隊 2025-03 報告，稀疏自編碼器（SAE）在偵測有害意圖這類下游任務上，表現不如簡單的線性探針，因此降低 SAE 基礎研究的優先順序。"
      },
      {
        "k": "推理步驟",
        "v": "④ Nanda（2025-05）：可解釋性不太可能「可靠地」抓到具欺騙性的強大 AI，應該當成縱深防禦中一道不同來源的防線，和黑箱評估、監控並用。"
      },
      {
        "k": "推理步驟",
        "v": "⑤ 另一扇窗：思維鏈監控（Korbak 等，2025-07）有用但脆弱；Chen 等人（2025-04）發現推理模型常常不會在思維鏈中說出實際影響它的提示。"
      },
      {
        "k": "推理步驟",
        "v": "⑥ 另一種框架：Rudin（2019）主張，高風險決策不該事後解釋黑箱，而應直接使用本質上可解釋的模型。"
      },
      {
        "k": "推理步驟",
        "v": "⑦ 法規面：EU AI Act 第 86 條讓受高風險 AI 決策影響的人有權要求解釋；美國 CFPB 2022 年的 Circular 2022-03 要求，用複雜演算法拒絕信貸時仍須給出具體理由，但這份文件已在 2025-05-12 撤回。可見「可解釋」的要求在政策上並不穩定。"
      },
      {
        "k": "推理步驟",
        "v": "⑧ 小結【推測】：比較可行的框架可能是「依風險分級，要求不同程度的理解」，而不是把「完全理解」當成二元的部署門檻。"
      },
      {
        "k": "各方觀點",
        "v": "Dario Amodei：可解釋性很急迫；Neel Nanda：縱深防禦；Google DeepMind 機制可解釋性團隊：方法論的負面結果；Cynthia Rudin：別解釋黑箱，改用可解釋模型；Tomek Korbak 等：思維鏈監控（完整來源見 x_reasoningFlow.viewpoints）"
      },
      {
        "k": "反證",
        "v": "共 4 則，見 counterEvidence"
      },
      {
        "k": "未解關鍵點",
        "v": "① 多少程度的理解，足以支撐哪個風險等級的部署？② 可解釋性、行為評估、思維鏈監控之間怎麼分工？③ 解釋義務的法規不穩定（CFPB 撤回、EU 第 86 條只適用於高風險系統），企業該以哪一套作為基準？④【推測，未附來源】人類社會也長期在機制沒有完全理解的情況下使用某些藥物，靠臨床試驗管控風險。這個類比是否適用，值得找文獻佐證。"
      }
    ],
    "flow": {
      "問題定義": "生成式 AI 是「長出來」的，連開發者都看不懂內部機制。在這種情況下，能不能負責任地部署？可解釋性是部署的必要條件，還是眾多防線中的一道？",
      "前提假設": [
        "欺騙、追求權力、越獄等風險，多半源自不透明（Amodei 的前提）。",
        "可解釋性研究可望成為「AI 的 MRI」，而且能及時成熟（Amodei 的期望）。",
        "「理解機制」是「放心部署」的前提。【推測】這是題目隱含的前提，下文有反方觀點。"
      ],
      "推理步驟": [
        "① Amodei（2025-04，轉述）：可解釋性正在和模型能力賽跑，呼籲研究者、企業和政府加速投入。",
        "② 進展：Anthropic 2024-05 從 Claude 3 Sonnet 抽出數千萬個可解釋特徵（例如「金門大橋」特徵）；2025-03 用電路追蹤看到內部規劃與多步推理。",
        "③ 限制：Google DeepMind 團隊 2025-03 報告，稀疏自編碼器（SAE）在偵測有害意圖這類下游任務上，表現不如簡單的線性探針，因此降低 SAE 基礎研究的優先順序。",
        "④ Nanda（2025-05）：可解釋性不太可能「可靠地」抓到具欺騙性的強大 AI，應該當成縱深防禦中一道不同來源的防線，和黑箱評估、監控並用。",
        "⑤ 另一扇窗：思維鏈監控（Korbak 等，2025-07）有用但脆弱；Chen 等人（2025-04）發現推理模型常常不會在思維鏈中說出實際影響它的提示。",
        "⑥ 另一種框架：Rudin（2019）主張，高風險決策不該事後解釋黑箱，而應直接使用本質上可解釋的模型。",
        "⑦ 法規面：EU AI Act 第 86 條讓受高風險 AI 決策影響的人有權要求解釋；美國 CFPB 2022 年的 Circular 2022-03 要求，用複雜演算法拒絕信貸時仍須給出具體理由，但這份文件已在 2025-05-12 撤回。可見「可解釋」的要求在政策上並不穩定。",
        "⑧ 小結【推測】：比較可行的框架可能是「依風險分級，要求不同程度的理解」，而不是把「完全理解」當成二元的部署門檻。"
      ],
      "各方觀點": [
        {
          "stance": "可解釋性很急迫",
          "claim": "不透明是多數風險的根源；可解釋性必須在強大 AI 出現前成熟（轉述）。",
          "source": {
            "who": "Dario Amodei（Anthropic 執行長）",
            "outlet": "個人文章〈The Urgency of Interpretability〉",
            "date": "2025-04",
            "url": "https://www.darioamodei.com/post/the-urgency-of-interpretability",
            "also": []
          },
          "sourceKey": "amodei"
        },
        {
          "stance": "縱深防禦",
          "claim": "可解釋性不會可靠地抓到欺騙；它有價值，但只是多層防禦中的一層。",
          "source": {
            "who": "Neel Nanda（Google DeepMind）",
            "outlet": "LessWrong〈Interpretability Will Not Reliably Find Deceptive AI〉",
            "date": "2025-05-04",
            "url": "https://www.lesswrong.com/posts/PwnadG4BFjaER3MGf/interpretability-will-not-reliably-find-deceptive-ai",
            "also": []
          },
          "sourceKey": "nanda"
        },
        {
          "stance": "方法論的負面結果",
          "claim": "SAE 在下游安全任務上不如線性探針，團隊因此調整研究優先順序。",
          "source": {
            "who": "Google DeepMind 機制可解釋性團隊（Neel Nanda 等）",
            "outlet": "LessWrong／Alignment Forum〈Negative Results for SAEs On Downstream Tasks and Deprioritising SAE Research〉",
            "date": "2025-03",
            "url": "https://www.lesswrong.com/posts/4uXCAJNuPKtKBsi28/negative-results-for-saes-on-downstream-tasks",
            "also": []
          },
          "sourceKey": "gdm_sae"
        },
        {
          "stance": "別解釋黑箱，改用可解釋模型",
          "claim": "高風險決策應使用本質可解釋的模型，事後解釋可能不忠實。",
          "source": {
            "who": "Cynthia Rudin（Duke University）",
            "outlet": "Nature Machine Intelligence〈Stop explaining black box machine learning models for high stakes decisions and use interpretable models instead〉",
            "date": "2019-05-13",
            "url": "https://www.nature.com/articles/s42256-019-0048-x",
            "also": []
          },
          "sourceKey": "rudin"
        },
        {
          "stance": "思維鏈監控",
          "claim": "思維鏈可讀性是一個新的、脆弱的安全機會，應該納入評估與系統卡。",
          "source": {
            "who": "Tomek Korbak 等（多家 AI 實驗室研究者共同署名）",
            "outlet": "arXiv:2507.11473〈Chain of Thought Monitorability: A New and Fragile Opportunity for AI Safety〉",
            "date": "2025-07",
            "url": "https://arxiv.org/abs/2507.11473",
            "also": []
          },
          "sourceKey": "korbak"
        }
      ],
      "未解關鍵點": "① 多少程度的理解，足以支撐哪個風險等級的部署？② 可解釋性、行為評估、思維鏈監控之間怎麼分工？③ 解釋義務的法規不穩定（CFPB 撤回、EU 第 86 條只適用於高風險系統），企業該以哪一套作為基準？④【推測，未附來源】人類社會也長期在機制沒有完全理解的情況下使用某些藥物，靠臨床試驗管控風險。這個類比是否適用，值得找文獻佐證。"
    },
    "counterEvidence": [
      {
        "id": "c_bot_q6_1",
        "text": "反駁「可解釋性能成為可靠保證」：Nanda 主張，因為疊加（superposition）、工具不完善、解釋不完整，加上很難證明「不存在欺騙」，可解釋性無法可靠地偵測欺騙性 AI。",
        "source": {
          "who": "Neel Nanda（Google DeepMind）",
          "outlet": "LessWrong〈Interpretability Will Not Reliably Find Deceptive AI〉",
          "date": "2025-05-04",
          "url": "https://www.lesswrong.com/posts/PwnadG4BFjaER3MGf/interpretability-will-not-reliably-find-deceptive-ai",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "前提 2",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q6_2",
        "text": "反駁「現有工具已足以支撐部署判斷」：Google DeepMind 報告 SAE 探針在分佈外越獄資料上，偵測有害意圖的表現不如線性探針。",
        "source": {
          "who": "Google DeepMind 機制可解釋性團隊（Neel Nanda 等）",
          "outlet": "LessWrong／Alignment Forum〈Negative Results for SAEs On Downstream Tasks and Deprioritising SAE Research〉",
          "date": "2025-03",
          "url": "https://www.lesswrong.com/posts/4uXCAJNuPKtKBsi28/negative-results-for-saes-on-downstream-tasks",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "步驟② 的樂觀推論",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q6_3",
        "text": "反駁「黑箱的自述可以補足」：Chen 等人發現，Claude 3.7 Sonnet 只在約 25% 的情況下，會在思維鏈中提到實際用到的提示，DeepSeek R1 約 39%。",
        "source": {
          "who": "Yanda Chen 等（Anthropic Alignment Science）",
          "outlet": "Anthropic 研究〈Reasoning models don't always say what they think〉（arXiv:2505.05410）",
          "date": "2025-04",
          "url": "https://www.anthropic.com/research/reasoning-models-dont-say-think",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "以思維鏈作為解釋",
        "by": "問題拆解師"
      },
      {
        "id": "c_bot_q6_4",
        "text": "反駁問題框架：Rudin 主張，高風險場景的正解不是去解釋黑箱，而是不要用黑箱；這會讓「看不懂還能不能部署」變成「該不該在這裡用這類模型」。",
        "source": {
          "who": "Cynthia Rudin（Duke University）",
          "outlet": "Nature Machine Intelligence〈Stop explaining black box machine learning models for high stakes decisions and use interpretable models instead〉",
          "date": "2019-05-13",
          "url": "https://www.nature.com/articles/s42256-019-0048-x",
          "also": []
        },
        "createdBy": "bot",
        "ts": 1791649470428,
        "against": "題目隱含前提",
        "by": "問題拆解師"
      }
    ],
    "botNotes": [
      {
        "by": "decomposer",
        "ts": 1791649470428,
        "text": "推理流程由問題拆解師擴寫；原始 QUESTIONS.process 未修改。匯入時建議只合併 reasoning／counterEvidence／botNotes／x_reasoningFlow，不覆寫 seed 欄位。"
      }
    ]
  }
};
function applySeedPatch(n, st){
  const p = SEED_PATCHES[n.id]; if (!p) return false;
  st.seedPatches = Array.isArray(st.seedPatches) ? st.seedPatches : [];
  const key = n.id + '@' + p.patchId;
  if (!n.flow) n.flow = p.flow;                       // flow is display data; re-attached every load if missing
  if (st.seedPatches.includes(key)) return false;
  const q = QUESTIONS.find(x => 'n_' + x.id === n.id);
  if (q){
    const orig = q.process.map(s => ({ k:s.k, v:s.v }));
    if (!Array.isArray(n.reasoning) || !n.reasoning.length || JSON.stringify(n.reasoning) === JSON.stringify(orig)) n.reasoning = JSON.parse(JSON.stringify(p.reasoning));
    const origA = (q.process.find(s => s.k === '前提') || {}).v || '';
    if (!n.assumptions || n.assumptions === origA) n.assumptions = p.assumptions;
  }
  n.counterEvidence = Array.isArray(n.counterEvidence) ? n.counterEvidence : [];
  p.counterEvidence.forEach(c => { if (!n.counterEvidence.some(x => x.id === c.id)) n.counterEvidence.push(JSON.parse(JSON.stringify(c))); });
  n.botNotes = Array.isArray(n.botNotes) ? n.botNotes : [];
  p.botNotes.forEach(b => { if (!n.botNotes.some(x => x.text === b.text)) n.botNotes.push(JSON.parse(JSON.stringify(b))); });
  st.seedPatches.push(key);
  return true;
}

/* =====================================================================
   種子媒體：影像導演產出的影片／封面（由 scripts/publish_episode.sh 自動維護）。
   載入時補進節點：只有在節點的 media 是空的（或仍是 QUESTIONS 原本的 videoUrl/imageUrl）才會填入，
   使用者自己設定過的網址不會被覆蓋。
   ===================================================================== */
/* 影集：feed 預設依這個順序連續播放（episodes 顯示 EP n/N，extras 顯示「番外」） */
const SERIES = {
  name: "AI 認知邊界",
  episodes: ["n_q1", "n_q2", "n_q3", "n_q4", "n_q5", "n_q6"],
  extras: ["n_x_language"]
};
/* SEED_MEDIA:BEGIN */
const SEED_MEDIA = {
  "n_q1": {
    "video": "media/videos/n_q1.mp4",
    "image": "media/videos/n_q1.jpg",
    "subtitles": "media/videos/n_q1.zh-TW.srt",
    "subtitlesBurnedIn": true
  },
  "n_q2": {
    "video": "media/videos/n_q2.mp4",
    "image": "media/videos/n_q2.jpg",
    "subtitles": "media/videos/n_q2.zh-TW.srt",
    "subtitlesBurnedIn": true
  },
  "n_q3": {
    "video": "media/videos/n_q3.mp4",
    "image": "media/videos/n_q3.jpg",
    "subtitles": "media/videos/n_q3.zh-TW.srt",
    "subtitlesBurnedIn": true
  },
  "n_q4": {
    "video": "media/videos/n_q4.mp4",
    "image": "media/videos/n_q4.jpg",
    "subtitles": "media/videos/n_q4.zh-TW.srt",
    "subtitlesBurnedIn": true
  },
  "n_q5": {
    "video": "media/videos/n_q5.mp4",
    "image": "media/videos/n_q5.jpg",
    "subtitles": "media/videos/n_q5.zh-TW.srt",
    "subtitlesBurnedIn": true
  },
  "n_q6": {
    "video": "media/videos/n_q6.mp4",
    "image": "media/videos/n_q6.jpg",
    "subtitles": "media/videos/n_q6.zh-TW.srt",
    "subtitlesBurnedIn": true
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
  if (m.subtitles && !n.media.subtitles && n.media.video === m.video){ n.media.subtitles = m.subtitles; n.media.subtitlesBurnedIn = !!m.subtitlesBurnedIn; changed = true; }
  return changed;
}
