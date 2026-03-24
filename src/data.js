export const monitoredUniverse = [
  {
    ticker: "NVDA",
    name: "NVIDIA",
    type: "Equity",
    bucket: "AI / Semis",
    thesis: "AI compute leader and primary beneficiary of accelerated infrastructure demand.",
    riskFlag: "Export-policy sensitivity remains elevated."
  },
  {
    ticker: "AMD",
    name: "Advanced Micro Devices",
    type: "Equity",
    bucket: "AI / Semis",
    thesis: "Second-derivative beneficiary when inference and accelerator competition broadens.",
    riskFlag: "Needs cleaner catalyst confirmation than NVIDIA."
  },
  {
    ticker: "TSM",
    name: "Taiwan Semiconductor",
    type: "Equity",
    bucket: "AI / Semis",
    thesis: "Manufacturing leverage to AI capex continuation.",
    riskFlag: "Macro and geopolitical exposure can override thesis momentum."
  },
  {
    ticker: "MSFT",
    name: "Microsoft",
    type: "Equity",
    bucket: "Large-Cap Tech",
    thesis: "Platform monetization of enterprise AI adoption.",
    riskFlag: "Narrative is often crowded and partly priced."
  },
  {
    ticker: "META",
    name: "Meta",
    type: "Equity",
    bucket: "Large-Cap Tech",
    thesis: "Ad monetization plus internal AI infra spend makes it signal-sensitive.",
    riskFlag: "Signal quality is lower when posts focus on product hype over revenue impact."
  },
  {
    ticker: "SOXX",
    name: "iShares Semiconductor ETF",
    type: "ETF",
    bucket: "Thematic ETF",
    thesis: "Diversified expression of semiconductor infrastructure narratives.",
    riskFlag: "Can lag single-name upside during concentrated rallies."
  },
  {
    ticker: "QQQ",
    name: "Invesco QQQ Trust",
    type: "ETF",
    bucket: "Broad Tech ETF",
    thesis: "Fallback expression when narrative is strong but single-name mapping is mixed.",
    riskFlag: "Broader index exposure dilutes thesis-specific conviction."
  },
  {
    ticker: "BTC",
    name: "Bitcoin",
    type: "Crypto",
    bucket: "Crypto",
    thesis: "Included for macro-liquidity and AI-adjacent risk appetite spillover.",
    riskFlag: "Requires stronger confirmation than equity signals."
  }
];

export const sources = [
  {
    id: "src-policywire",
    handle: "@policywire",
    name: "Policy Wire",
    category: "Institution / Policy",
    baselineReliability: 0.89,
    preferredHorizon: "3-10 days",
    policyTemplate: "High-credibility, low-frequency catalyst watcher",
    relevantSectors: ["Semiconductors", "AI Infrastructure", "Macro"],
    allowedAssets: ["NVDA", "AMD", "TSM", "SOXX", "QQQ"],
    specialHandling: "Posts are only treated as actionable when they include explicit regulatory or procurement signals.",
    tone: "Measured",
    lastActive: "2026-03-16 08:10 CET"
  },
  {
    id: "src-semiflow",
    handle: "@semiflow",
    name: "SemiFlow",
    category: "Sector Specialist",
    baselineReliability: 0.83,
    preferredHorizon: "2-7 days",
    policyTemplate: "High-signal industry channel checks",
    relevantSectors: ["Semiconductors", "Supply Chain"],
    allowedAssets: ["NVDA", "AMD", "TSM", "SOXX"],
    specialHandling: "Repeated claims need one corroborating source before they can upgrade to BUY.",
    tone: "Technical",
    lastActive: "2026-03-16 07:42 CET"
  },
  {
    id: "src-macrolens",
    handle: "@macrolens",
    name: "Macro Lens",
    category: "Macro Commentator",
    baselineReliability: 0.76,
    preferredHorizon: "4-12 days",
    policyTemplate: "Context and regime confirmation",
    relevantSectors: ["Rates", "Liquidity", "Risk Appetite"],
    allowedAssets: ["QQQ", "BTC", "SOXX", "MSFT", "META"],
    specialHandling: "Macro opinions can confirm but not originate single-name BUY actions on their own.",
    tone: "Analytical",
    lastActive: "2026-03-16 06:35 CET"
  },
  {
    id: "src-builderalpha",
    handle: "@builderalpha",
    name: "Builder Alpha",
    category: "Operator / Company Watcher",
    baselineReliability: 0.71,
    preferredHorizon: "2-5 days",
    policyTemplate: "Product and enterprise demand tracker",
    relevantSectors: ["AI Software", "Enterprise Adoption"],
    allowedAssets: ["MSFT", "META", "QQQ"],
    specialHandling: "Operator anecdotes are down-weighted unless there is broader source convergence.",
    tone: "Insider-ish",
    lastActive: "2026-03-16 10:24 CET"
  },
  {
    id: "src-chainpulse",
    handle: "@chainpulse",
    name: "Chain Pulse",
    category: "Crypto Market Desk",
    baselineReliability: 0.68,
    preferredHorizon: "1-5 days",
    policyTemplate: "Crypto regime confirmation",
    relevantSectors: ["Crypto", "Risk Appetite"],
    allowedAssets: ["BTC"],
    specialHandling: "Crypto signals must align with broader risk context or they default to HOLD.",
    tone: "Fast-moving",
    lastActive: "2026-03-16 09:02 CET"
  },
  {
    id: "src-polymarket",
    handle: "@polymarket",
    name: "Polymarket",
    category: "Prediction Market / Catalyst",
    baselineReliability: 0.86,
    preferredHorizon: "1-14 days",
    policyTemplate: "Market-implied probabilities and catalyst framing",
    relevantSectors: ["Macro", "Policy", "Politics", "AI Infrastructure", "Risk Appetite"],
    allowedAssets: ["NVDA", "AMD", "TSM", "SOXX", "QQQ", "MSFT", "META", "BTC"],
    specialHandling: "Useful for surfacing live event probabilities, but still translate market odds into asset impact before actioning them.",
    tone: "Market-priced",
    lastActive: ""
  },
  {
    id: "src-nolimitgains",
    handle: "@nolimitgains",
    name: "No Limit Gains",
    category: "Trader / Commentary",
    baselineReliability: 0.58,
    preferredHorizon: "1-3 days",
    policyTemplate: "Fast narrative scanner for momentum and positioning",
    relevantSectors: ["AI / Semis", "Large-Cap Tech", "Risk Appetite"],
    allowedAssets: ["NVDA", "AMD", "TSM", "SOXX", "QQQ", "MSFT", "META", "BTC"],
    specialHandling: "Treat as early radar only; corroboration is required before it can unlock an actionable view.",
    tone: "Fast-moving",
    lastActive: ""
  }
];

export const posts = [
  {
    id: "post-101",
    sourceId: "src-policywire",
    createdAt: "2026-03-16T08:10:00+01:00",
    timestamp: "2026-03-16 08:10 CET",
    body: "Draft export guidance looks narrower than feared. High-end AI accelerators still face scrutiny, but broad data-center demand assumptions may need to move up, not down.",
    actionable: true,
    claimType: "Policy interpretation",
    direction: "Bullish",
    explicitness: "Explicit",
    themes: ["AI accelerators", "Export policy", "Demand resilience"],
    confidence: 0.84,
    mappedAssets: ["NVDA", "SOXX", "TSM"],
    clusterId: "cluster-accelerators"
  },
  {
    id: "post-102",
    sourceId: "src-semiflow",
    createdAt: "2026-03-16T07:42:00+01:00",
    timestamp: "2026-03-16 07:42 CET",
    body: "Board checks still point to hyperscalers pulling forward AI rack deployments into next quarter. That keeps upstream semi orders tighter than the market narrative implies.",
    actionable: true,
    claimType: "Channel check",
    direction: "Bullish",
    explicitness: "Explicit",
    themes: ["Hyperscaler capex", "AI racks", "Semi orders"],
    confidence: 0.81,
    mappedAssets: ["NVDA", "TSM", "SOXX"],
    clusterId: "cluster-accelerators"
  },
  {
    id: "post-103",
    sourceId: "src-macrolens",
    createdAt: "2026-03-16T06:35:00+01:00",
    timestamp: "2026-03-16 06:35 CET",
    body: "Rates are not the story this week. Risk appetite is broadening and semis are leading again; that's a better backdrop for continuation than for fading strength.",
    actionable: true,
    claimType: "Macro context",
    direction: "Bullish",
    explicitness: "Interpretive",
    themes: ["Risk appetite", "Semis leadership", "Market regime"],
    confidence: 0.73,
    mappedAssets: ["SOXX", "QQQ", "BTC"],
    clusterId: "cluster-accelerators"
  },
  {
    id: "post-104",
    sourceId: "src-builderalpha",
    createdAt: "2026-03-15T23:11:00+01:00",
    timestamp: "2026-03-15 23:11 CET",
    body: "Enterprise buyers are talking AI copilots again, but budget owners still want proof of ROI before expanding seats. Demand tone is better, conversion is still lumpy.",
    actionable: true,
    claimType: "Operator commentary",
    direction: "Mixed",
    explicitness: "Interpretive",
    themes: ["Enterprise AI", "Seat expansion", "ROI scrutiny"],
    confidence: 0.64,
    mappedAssets: ["MSFT"],
    clusterId: "cluster-enterprise-ai"
  },
  {
    id: "post-105",
    sourceId: "src-policywire",
    createdAt: "2026-03-15T19:24:00+01:00",
    timestamp: "2026-03-15 19:24 CET",
    body: "A hearing headline is moving fast, but there is no confirmed proposal that changes current procurement policy. Most of the urgency looks narrative-driven, not operational.",
    actionable: false,
    claimType: "Debunk / clarification",
    direction: "Neutral",
    explicitness: "Explicit",
    themes: ["Policy noise", "Narrative reset"],
    confidence: 0.79,
    mappedAssets: ["AMD", "QQQ"],
    clusterId: "cluster-policy-noise"
  },
  {
    id: "post-106",
    sourceId: "src-chainpulse",
    createdAt: "2026-03-16T09:02:00+01:00",
    timestamp: "2026-03-16 09:02 CET",
    body: "BTC is catching some of the same liquidity bid as AI beta, but derivatives positioning is no longer clean. Good backdrop, messy trigger.",
    actionable: true,
    claimType: "Market desk note",
    direction: "Mixed",
    explicitness: "Interpretive",
    themes: ["BTC", "Liquidity", "Derivatives positioning"],
    confidence: 0.62,
    mappedAssets: ["BTC"],
    clusterId: "cluster-crypto-risk"
  },
  {
    id: "post-107",
    sourceId: "src-semiflow",
    createdAt: "2026-03-16T05:58:00+01:00",
    timestamp: "2026-03-16 05:58 CET",
    body: "Supply chain chatter still says liquid-cooled AI rack components are tight. That is usually not what you see when capex appetite is about to roll over.",
    actionable: true,
    claimType: "Supply chain read",
    direction: "Bullish",
    explicitness: "Interpretive",
    themes: ["Liquid cooling", "AI racks", "Capex durability"],
    confidence: 0.76,
    mappedAssets: ["NVDA", "TSM", "SOXX"],
    clusterId: "cluster-accelerators"
  },
  {
    id: "post-108",
    sourceId: "src-builderalpha",
    createdAt: "2026-03-16T10:24:00+01:00",
    timestamp: "2026-03-16 10:24 CET",
    body: "A few CIOs moved AI assistant pilots from experimentation to budget review this morning. Better pipeline, but still not enough to call broad monetization unlocked.",
    actionable: true,
    claimType: "Operator commentary",
    direction: "Mixed",
    explicitness: "Explicit",
    themes: ["Enterprise AI", "Pilots", "Budget review"],
    confidence: 0.67,
    mappedAssets: ["MSFT", "META"],
    clusterId: "cluster-enterprise-ai"
  },
  {
    id: "post-109",
    sourceId: "src-policywire",
    createdAt: "2026-03-15T13:18:00+01:00",
    timestamp: "2026-03-15 13:18 CET",
    body: "Nothing in the latest briefing points to a broad-based freeze in AI hardware procurement. The market is still over-reading the headline risk.",
    actionable: true,
    claimType: "Policy interpretation",
    direction: "Bullish",
    explicitness: "Explicit",
    themes: ["Procurement", "AI hardware", "Headline risk"],
    confidence: 0.82,
    mappedAssets: ["NVDA", "SOXX", "QQQ"],
    clusterId: "cluster-accelerators"
  },
  {
    id: "post-110",
    sourceId: "src-macrolens",
    createdAt: "2026-03-15T09:46:00+01:00",
    timestamp: "2026-03-15 09:46 CET",
    body: "If growth leadership keeps rotating back toward software without a rates scare, QQQ stays supported, but semis still have the cleaner social-signal setup.",
    actionable: true,
    claimType: "Macro context",
    direction: "Mixed",
    explicitness: "Interpretive",
    themes: ["Growth leadership", "Software", "QQQ"],
    confidence: 0.69,
    mappedAssets: ["QQQ", "MSFT", "SOXX"],
    clusterId: "cluster-enterprise-ai"
  },
  {
    id: "post-111",
    sourceId: "src-chainpulse",
    createdAt: "2026-03-15T21:07:00+01:00",
    timestamp: "2026-03-15 21:07 CET",
    body: "Spot demand is fine, but perp positioning is getting louder than the underlying flow. That usually keeps me from upgrading BTC from constructive to aggressive.",
    actionable: true,
    claimType: "Market desk note",
    direction: "Mixed",
    explicitness: "Explicit",
    themes: ["BTC", "Spot demand", "Perp positioning"],
    confidence: 0.66,
    mappedAssets: ["BTC"],
    clusterId: "cluster-crypto-risk"
  },
  {
    id: "post-112",
    sourceId: "src-policywire",
    createdAt: "2026-03-14T16:22:00+01:00",
    timestamp: "2026-03-14 16:22 CET",
    body: "The loud procurement rumor going around X still has no attached draft language or committee backing. Treat the move as narrative until evidence appears.",
    actionable: false,
    claimType: "Debunk / clarification",
    direction: "Neutral",
    explicitness: "Explicit",
    themes: ["Procurement rumor", "Narrative risk", "Verification"],
    confidence: 0.81,
    mappedAssets: ["AMD", "QQQ"],
    clusterId: "cluster-policy-noise"
  },
  {
    id: "post-113",
    sourceId: "src-semiflow",
    createdAt: "2026-03-14T10:05:00+01:00",
    timestamp: "2026-03-14 10:05 CET",
    body: "ODM chatter still implies faster AI server assembly into month-end. That does not guarantee upside, but it keeps the semi slowdown narrative looking early.",
    actionable: true,
    claimType: "Channel check",
    direction: "Bullish",
    explicitness: "Interpretive",
    themes: ["ODMs", "AI servers", "Semi slowdown"],
    confidence: 0.74,
    mappedAssets: ["NVDA", "TSM", "SOXX"],
    clusterId: "cluster-accelerators"
  },
  {
    id: "post-114",
    sourceId: "src-builderalpha",
    createdAt: "2026-03-14T14:33:00+01:00",
    timestamp: "2026-03-14 14:33 CET",
    body: "Plenty of AI demo energy, but most enterprise buyers are still separating workflow value from showpiece features. Good for attention, not enough for a clean BUY on its own.",
    actionable: true,
    claimType: "Operator commentary",
    direction: "Mixed",
    explicitness: "Interpretive",
    themes: ["Enterprise buyers", "Workflow value", "Feature hype"],
    confidence: 0.63,
    mappedAssets: ["MSFT", "META"],
    clusterId: "cluster-enterprise-ai"
  }
];

export const clusters = [
  {
    id: "cluster-accelerators",
    title: "AI infrastructure demand is holding firmer than feared",
    summary: "Policy interpretation, channel checks, and macro context all converged on sustained AI-capex demand over the next several days.",
    dominantDirection: "Bullish",
    novelty: "High",
    agreementScore: 0.87,
    timeWindow: "Last 3 days",
    mappedAssets: ["NVDA", "TSM", "SOXX", "QQQ"],
    relatedPostIds: ["post-101", "post-102", "post-103", "post-107", "post-109", "post-113"],
    sourceAgreement: "3 sources aligned across 6 posts",
    policyOutcome: "Eligible",
    marketContext: "Semis outperforming sector beta with supportive volume and broad risk-on tape."
  },
  {
    id: "cluster-enterprise-ai",
    title: "Enterprise AI demand improved, but monetization still needs proof",
    summary: "Operator commentary suggests a better tone in enterprise AI conversations without enough evidence for immediate reacceleration in paid adoption.",
    dominantDirection: "Mixed",
    novelty: "Medium",
    agreementScore: 0.58,
    timeWindow: "Last 3 days",
    mappedAssets: ["MSFT", "META", "QQQ"],
    relatedPostIds: ["post-104", "post-108", "post-110", "post-114"],
    sourceAgreement: "2 sources, improving but not decisive",
    policyOutcome: "Hold bias",
    marketContext: "Large-cap software has kept pace with the market, but not outperformed with enough force to confirm a fresh leg."
  },
  {
    id: "cluster-policy-noise",
    title: "Policy headline looked tradable but resolved as noise",
    summary: "A fast-moving regulatory headline lacked substance after source verification, so the initial negative read was vetoed.",
    dominantDirection: "Neutralized",
    novelty: "Low",
    agreementScore: 0.41,
    timeWindow: "Last 2 days",
    mappedAssets: ["AMD", "QQQ"],
    relatedPostIds: ["post-105", "post-112"],
    sourceAgreement: "Clarified twice, still no durable evidence",
    policyOutcome: "Vetoed",
    marketContext: "Price reaction faded and volume normalized quickly."
  },
  {
    id: "cluster-crypto-risk",
    title: "Crypto is participating in the risk bid, but the trigger is messy",
    summary: "BTC benefits from broader liquidity appetite, though derivatives crowding keeps the signal from graduating past HOLD.",
    dominantDirection: "Cautiously bullish",
    novelty: "Medium",
    agreementScore: 0.52,
    timeWindow: "Last 2 days",
    mappedAssets: ["BTC"],
    relatedPostIds: ["post-106", "post-111", "post-103"],
    sourceAgreement: "1 direct desk, 1 macro confirmation",
    policyOutcome: "Eligible but not decisive",
    marketContext: "Spot trend is positive, but volatility and positioning remain elevated."
  }
];

export const decisions = [
  {
    id: "dec-nvda",
    asset: "NVDA",
    action: "BUY",
    confidence: 0.86,
    horizon: "3-7 days",
    timestamp: "2026-03-16 09:15 CET",
    clusterIds: ["cluster-accelerators"],
    rationale: [
      "Three monitored sources converged on resilient AI infrastructure demand within the accepted latency window.",
      "The mapping is direct: export-guidance clarity and stronger rack deployment checks both land on NVIDIA demand sensitivity.",
      "5d price strength and abnormal volume support continuation rather than contradiction."
    ],
    whyNot: [
      "Not HOLD because novelty remains high and the narrative is still broadening, not merely repeating.",
      "Not SELL because the negative export-risk read softened after the more credible policy interpretation."
    ],
    uncertainty: [
      "The signal still depends on policy language staying narrower than market fears.",
      "Single-name upside is more sensitive to headline reversals than the ETF expression."
    ],
    vetoed: false,
    vetoReason: "",
    marketContext: {
      returns5d: "+7.4%",
      returns10d: "+12.1%",
      relativeVsSector: "+3.2%",
      volumeAbnormality: "1.8x",
      regime: "Risk-on"
    }
  },
  {
    id: "dec-tsm",
    asset: "TSM",
    action: "BUY",
    confidence: 0.72,
    horizon: "4-8 days",
    timestamp: "2026-03-16 09:15 CET",
    clusterIds: ["cluster-accelerators"],
    rationale: [
      "The accelerator-demand cluster also improves the foundry utilization and upstream manufacturing read-through for TSM.",
      "Multiple aligned posts strengthen the thesis even though TSM is a second-step mapping versus NVIDIA.",
      "Sector-relative strength supports owning manufacturing leverage while keeping single-name headline risk below the most crowded beneficiary."
    ],
    whyNot: [
      "Not HOLD because the cluster is still fresh and agreement is unusually strong for semi infrastructure.",
      "Not SELL because no conflicting posts or adverse market context have emerged in the current window."
    ],
    uncertainty: [
      "This is an indirect mapping and can lag faster-moving AI leaders if the market narrows its focus."
    ],
    vetoed: false,
    vetoReason: "",
    marketContext: {
      returns5d: "+4.6%",
      returns10d: "+8.7%",
      relativeVsSector: "+1.9%",
      volumeAbnormality: "1.2x",
      regime: "Constructive"
    }
  },
  {
    id: "dec-soxx",
    asset: "SOXX",
    action: "BUY",
    confidence: 0.79,
    horizon: "3-7 days",
    timestamp: "2026-03-16 09:15 CET",
    clusterIds: ["cluster-accelerators"],
    rationale: [
      "The same accelerator-demand cluster supports a diversified semiconductor expression.",
      "ETF mapping is favored when multiple semi names benefit and single-name event risk is still present.",
      "Sector-relative strength confirms the cluster without concentrating risk into one ticker."
    ],
    whyNot: [
      "Not HOLD because market context and source convergence are both supportive.",
      "Not SELL because the narrative remains constructive and current, not stale."
    ],
    uncertainty: [
      "SOXX may lag if the move concentrates into only a few mega-cap names."
    ],
    vetoed: false,
    vetoReason: "",
    marketContext: {
      returns5d: "+5.9%",
      returns10d: "+9.8%",
      relativeVsSector: "+2.6%",
      volumeAbnormality: "1.4x",
      regime: "Risk-on"
    }
  },
  {
    id: "dec-qqq",
    asset: "QQQ",
    action: "HOLD",
    confidence: 0.6,
    horizon: "3-7 days",
    timestamp: "2026-03-16 09:15 CET",
    clusterIds: ["cluster-accelerators", "cluster-policy-noise"],
    rationale: [
      "The broader tech tape is supportive, but the best evidence still points more cleanly to semiconductor-specific expressions than to the full QQQ basket.",
      "QQQ stays investable as a fallback mapping, yet policy engine rules prefer tighter asset-expression matches when they exist.",
      "The product doc favors narrow before broad, so diffuse signals default to HOLD instead of forcing a generic ETF BUY."
    ],
    whyNot: [
      "Not BUY because sector-specific mappings are materially stronger than the broad-tech alternative.",
      "Not SELL because macro regime and leadership breadth remain constructive."
    ],
    uncertainty: [
      "If narrative breadth expands beyond semis into software and internet, QQQ could graduate from fallback to primary expression."
    ],
    vetoed: false,
    vetoReason: "",
    marketContext: {
      returns5d: "+3.8%",
      returns10d: "+6.5%",
      relativeVsSector: "+0.8%",
      volumeAbnormality: "1.1x",
      regime: "Constructive"
    }
  },
  {
    id: "dec-msft",
    asset: "MSFT",
    action: "HOLD",
    confidence: 0.61,
    horizon: "4-8 days",
    timestamp: "2026-03-16 09:15 CET",
    clusterIds: ["cluster-enterprise-ai"],
    rationale: [
      "Demand tone improved, but the only direct evidence is still anecdotal and conversion remains uneven.",
      "The signal maps to Microsoft, but not with enough corroboration to justify a fresh BUY.",
      "Market context is constructive rather than contradictory, which keeps the recommendation from turning negative."
    ],
    whyNot: [
      "Not BUY because source convergence is weak and monetization proof is still missing.",
      "Not SELL because there is no deterioration signal; the issue is insufficient evidence, not adverse evidence."
    ],
    uncertainty: [
      "A second operator or official source could quickly change this into a BUY.",
      "Crowded enterprise AI narratives can appear stronger on social than in revenue timelines."
    ],
    vetoed: false,
    vetoReason: "",
    marketContext: {
      returns5d: "+2.1%",
      returns10d: "+4.0%",
      relativeVsSector: "+0.3%",
      volumeAbnormality: "1.0x",
      regime: "Constructive"
    }
  },
  {
    id: "dec-meta",
    asset: "META",
    action: "HOLD",
    confidence: 0.51,
    horizon: "3-6 days",
    timestamp: "2026-03-16 09:15 CET",
    clusterIds: ["cluster-enterprise-ai"],
    rationale: [
      "There is still not enough direct source evidence linking the current monitored narratives to Meta-specific revenue or infrastructure upside.",
      "Risk appetite is supportive for high-beta tech, which prevents a negative call, but the asset mapping remains too soft for BUY.",
      "In this v1 system, weak single-name mapping is a strong reason to stay at HOLD."
    ],
    whyNot: [
      "Not BUY because the monitored posts are primarily about enterprise software and AI infrastructure rather than Meta-specific catalysts.",
      "Not SELL because there is no adverse signal cluster pointing at deterioration."
    ],
    uncertainty: [
      "A product or ad-monetization-specific narrative would matter more here than the current generic AI enthusiasm."
    ],
    vetoed: false,
    vetoReason: "",
    marketContext: {
      returns5d: "+2.9%",
      returns10d: "+5.1%",
      relativeVsSector: "+0.4%",
      volumeAbnormality: "0.95x",
      regime: "Constructive"
    }
  },
  {
    id: "dec-amd",
    asset: "AMD",
    action: "SELL",
    confidence: 0.57,
    horizon: "2-5 days",
    timestamp: "2026-03-16 09:15 CET",
    clusterIds: ["cluster-policy-noise"],
    rationale: [
      "A noisy policy-driven spike faded quickly, removing the bullish narrative support that would justify staying aggressive.",
      "Within the curated universe, AMD carries the weakest confirmed catalyst support right now.",
      "The SELL label is being used as a reduce-or-exit instruction under the PRD's v1 definition."
    ],
    whyNot: [
      "Not HOLD because the apparent catalyst was invalidated and relative strength is lagging the rest of the AI semi basket.",
      "Not BUY because the most recent policy cluster was explicitly downgraded by a higher-credibility source."
    ],
    uncertainty: [
      "This is the lowest-confidence directional call in the active book and should be treated cautiously."
    ],
    vetoed: false,
    vetoReason: "",
    marketContext: {
      returns5d: "-1.4%",
      returns10d: "+1.2%",
      relativeVsSector: "-3.1%",
      volumeAbnormality: "0.9x",
      regime: "Diverging"
    }
  },
  {
    id: "dec-btc",
    asset: "BTC",
    action: "HOLD",
    confidence: 0.55,
    horizon: "2-6 days",
    timestamp: "2026-03-16 09:15 CET",
    clusterIds: ["cluster-crypto-risk"],
    rationale: [
      "BTC is participating in the same broad risk-on environment that helps AI beta, but the direct signal is messy.",
      "The crypto desk note is supportive enough to avoid a SELL, yet not clean enough to authorize a BUY.",
      "Elevated volatility and crowded derivatives positioning keep the policy engine conservative."
    ],
    whyNot: [
      "Not BUY because positioning weakens signal quality.",
      "Not SELL because spot trend and macro risk appetite remain constructive."
    ],
    uncertainty: [
      "A cleaner spot-led move or second confirmation source could upgrade the call.",
      "Crypto still has the strictest evidence threshold in this v1 configuration."
    ],
    vetoed: false,
    vetoReason: "",
    marketContext: {
      returns3d: "+4.8%",
      returns7d: "+6.2%",
      returns14d: "+10.4%",
      volatility: "Elevated",
      regime: "Risk-on but crowded"
    }
  }
];

export const vetoedSignals = [
  {
    id: "veto-1",
    asset: "QQQ",
    candidateAction: "BUY",
    finalAction: "HOLD",
    reason: "Narrative was broad but too diffuse to justify an ETF upgrade over stronger sector-specific mappings.",
    clusterId: "cluster-policy-noise",
    status: "Vetoed by policy engine"
  },
  {
    id: "veto-2",
    asset: "AMD",
    candidateAction: "BUY",
    finalAction: "SELL",
    reason: "Initial bullish read came from a headline that was later clarified as operationally irrelevant.",
    clusterId: "cluster-policy-noise",
    status: "Vetoed by credibility check"
  }
];

export const placeholders = {
  decisionLogs: [
    {
      id: "log-slot-001",
      name: "Decision history",
      description: "Reserved list for locked reference prices and later outcome attribution.",
      state: "Schema reserved"
    },
    {
      id: "log-slot-002",
      name: "Replay hooks",
      description: "Future event replay and simulation runs will attach here once backtesting is introduced.",
      state: "UI placeholder"
    }
  ],
  simulationRuns: [
    {
      id: "sim-slot-001",
      name: "No simulations yet",
      description: "v1 intentionally stops before paper trading or PnL simulation.",
      state: "Execution disabled"
    }
  ]
};

export const pipeline = [
  {
    stage: "Ingestion",
    description: "Curated X accounts land as raw posts with timestamps and source metadata."
  },
  {
    stage: "Claim extraction",
    description: "Posts become structured claims with direction, horizon, and actionable status."
  },
  {
    stage: "Asset mapping",
    description: "Claims can only map into the approved AI/tech universe."
  },
  {
    stage: "Event clustering",
    description: "Repeated aligned posts merge into one higher-level event."
  },
  {
    stage: "Policy + veto",
    description: "Deterministic checks gate stale, weak, or contradicted signals."
  },
  {
    stage: "Decision + explainability",
    description: "Final BUY/HOLD/SELL output carries reasons, why-not logic, and uncertainty."
  }
];

function formatRelativeWindow(oldestPostAt, generatedAt) {
  const oldestTime = new Date(oldestPostAt).getTime();
  const generatedTime = new Date(generatedAt).getTime();

  if (!Number.isFinite(oldestTime) || !Number.isFinite(generatedTime)) {
    return "Last 3 days";
  }

  const hours = Math.max(1, Math.round((generatedTime - oldestTime) / (60 * 60 * 1000)));

  if (hours >= 48) {
    return `Last ${Math.ceil(hours / 24)} days`;
  }

  return `Last ${hours} hours`;
}

function formatLastActive(createdAt, fallbackValue) {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return fallbackValue;
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Berlin",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const timeZoneName =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Berlin",
      timeZoneName: "short"
    })
      .formatToParts(date)
      .find((part) => part.type === "timeZoneName")?.value || "CET";

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${timeZoneName}`;
}

function buildRuntimeSources(runtimePosts, baseSources) {
  return baseSources.map((source) => {
    const latestPost = [...runtimePosts]
      .filter((post) => post.sourceId === source.id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0];

    return latestPost
      ? {
          ...source,
          lastActive: formatLastActive(latestPost.createdAt, source.lastActive)
        }
      : source;
  });
}

function buildRuntimeClusters(runtimePosts, generatedAt) {
  return clusters.map((cluster) => {
    const clusterPosts = [...runtimePosts]
      .filter((post) => post.clusterId === cluster.id)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    if (!clusterPosts.length) {
      return cluster;
    }

    const sourceCount = new Set(clusterPosts.map((post) => post.sourceId)).size;

    return {
      ...cluster,
      relatedPostIds: clusterPosts.map((post) => post.id),
      sourceAgreement: `${sourceCount} sources across ${clusterPosts.length} posts`,
      timeWindow: formatRelativeWindow(clusterPosts.at(-1)?.createdAt, generatedAt)
    };
  });
}

export function getAppData(options = {}) {
  const runtimePosts = options.posts || posts;
  const runtimeSources = options.sources || sources;
  const generatedAt = options.generatedAt || new Date().toISOString();
  const runtimeClusters = options.clusters || buildRuntimeClusters(runtimePosts, generatedAt);
  const runtimeDecisions = options.decisions || decisions;
  const runtimeVetoedSignals = options.vetoedSignals || vetoedSignals;

  return {
    metadata: {
      snapshotLabel: options.snapshotLabel || "Seeded operator snapshot",
      universeFocus: "Focused AI / tech / crypto day-one universe",
      latencyWindow: "Up to 12 hours",
      generatedAt,
      tweetFeedMode: options.tweetFeedMode || "seeded",
      tweetFeedCount: runtimePosts.length,
      ...(options.metadataExtras || {})
    },
    engine: options.engine || {
      mode: "seeded",
      generatedAt,
      extractor: {
        requestedMode: "heuristic",
        activeMode: "heuristic",
        provider: "heuristic-fallback",
        model: "",
        cacheHits: 0,
        liveExtractions: 0,
        cacheWrites: 0,
        fallbackCount: runtimePosts.length
      },
      summary: {
        claimCount: runtimePosts.length,
        actionableCount: runtimePosts.filter((post) => post.actionable).length,
        clusterCount: runtimeClusters.length,
        decisionCount: runtimeDecisions.length,
        vetoCount: runtimeVetoedSignals.length,
        sourceCount: runtimeSources.length,
        newestPostAt: runtimePosts[0]?.createdAt || "",
        oldestPostAt: runtimePosts.at(-1)?.createdAt || ""
      },
      stages: [],
      notes: []
    },
    monitoredUniverse,
    sources: buildRuntimeSources(runtimePosts, runtimeSources),
    posts: runtimePosts,
    clusters: runtimeClusters,
    decisions: runtimeDecisions,
    vetoedSignals: runtimeVetoedSignals,
    runtime: options.runtime || null,
    placeholders: options.placeholders || placeholders,
    history: options.history || {
      latestRunId: "",
      runs: [],
      decisionLog: []
    },
    evaluation: options.evaluation || {
      latestRun: null,
      history: []
    },
    ingestion: options.ingestion || null,
    market: options.market || null,
    pipeline
  };
}
