import { posts as seedPosts } from "./data.js";

const BERLIN_TIMEZONE = "Europe/Berlin";
const clusterCycle = [
  "cluster-accelerators",
  "cluster-enterprise-ai",
  "cluster-accelerators",
  "cluster-crypto-risk",
  "cluster-policy-noise",
  "cluster-accelerators",
  "cluster-enterprise-ai",
  "cluster-accelerators",
  "cluster-crypto-risk",
  "cluster-enterprise-ai"
];

const sourcePoolsByCluster = {
  "cluster-accelerators": ["src-policywire", "src-semiflow", "src-macrolens"],
  "cluster-enterprise-ai": ["src-builderalpha", "src-macrolens"],
  "cluster-policy-noise": ["src-policywire", "src-macrolens"],
  "cluster-crypto-risk": ["src-chainpulse", "src-macrolens"]
};

const sourceConfig = {
  "src-policywire": {
    claimType: ["Policy interpretation", "Debunk / clarification"],
    explicitness: ["Explicit", "Interpretive"],
    confidenceBase: 0.8
  },
  "src-semiflow": {
    claimType: ["Channel check", "Supply chain read"],
    explicitness: ["Explicit", "Interpretive"],
    confidenceBase: 0.78
  },
  "src-macrolens": {
    claimType: ["Macro context"],
    explicitness: ["Interpretive"],
    confidenceBase: 0.72
  },
  "src-builderalpha": {
    claimType: ["Operator commentary"],
    explicitness: ["Explicit", "Interpretive"],
    confidenceBase: 0.66
  },
  "src-chainpulse": {
    claimType: ["Market desk note"],
    explicitness: ["Explicit", "Interpretive"],
    confidenceBase: 0.64
  }
};

const clusterMappedAssets = {
  "cluster-accelerators": [
    ["NVDA", "SOXX"],
    ["NVDA", "TSM", "SOXX"],
    ["TSM", "SOXX"],
    ["NVDA", "QQQ"]
  ],
  "cluster-enterprise-ai": [
    ["MSFT"],
    ["MSFT", "QQQ"],
    ["META"],
    ["MSFT", "META"]
  ],
  "cluster-policy-noise": [
    ["AMD", "QQQ"],
    ["QQQ"],
    ["AMD"]
  ],
  "cluster-crypto-risk": [
    ["BTC"],
    ["BTC", "QQQ"]
  ]
};

const clusterThemes = {
  "cluster-accelerators": [
    ["AI accelerators", "Hyperscaler capex", "Demand resilience"],
    ["AI racks", "Supply chain", "Semiconductor orders"],
    ["Infrastructure demand", "Semis leadership", "Data center buildout"]
  ],
  "cluster-enterprise-ai": [
    ["Enterprise AI", "Seat expansion", "Monetization"],
    ["Copilots", "Workflow adoption", "ROI scrutiny"],
    ["Software demand", "Budget review", "Platform usage"]
  ],
  "cluster-policy-noise": [
    ["Policy noise", "Narrative reset", "Verification"],
    ["Rumor control", "Procurement headlines", "Evidence quality"]
  ],
  "cluster-crypto-risk": [
    ["BTC", "Liquidity", "Risk appetite"],
    ["Spot demand", "Derivatives positioning", "Volatility"]
  ]
};

const acceleratorCopy = {
  "src-policywire": {
    openings: [
      "Updated guidance read:",
      "Policy note:",
      "Procurement takeaway:",
      "Fresh export-language read:"
    ],
    middles: [
      "the latest language still looks narrower than the market feared on AI compute",
      "nothing here looks like a broad stop sign for AI infrastructure spending",
      "the tape is still overpricing the odds of a full procurement freeze",
      "headline risk remains, but the operative restriction path is still tighter than the rumor mill suggests"
    ],
    endings: [
      "That keeps NVIDIA and the semi basket skewed to continuation over retrace.",
      "The cleanest read-through still lands on accelerators and upstream semi demand.",
      "For now this reads as a demand reset higher, not a policy shock lower.",
      "It is hard to downgrade the infrastructure complex on this evidence set."
    ]
  },
  "src-semiflow": {
    openings: [
      "Channel follow-up:",
      "Board-check note:",
      "ODM chatter:",
      "Supply chain follow-through:"
    ],
    middles: [
      "AI rack scheduling is still being pulled forward rather than pushed out",
      "upstream component tightness is inconsistent with a clean capex slowdown call",
      "server assembly cadence still points to firm accelerator demand into next month",
      "liquid-cooled rack parts are not behaving like a market preparing for a demand air pocket"
    ],
    endings: [
      "That keeps the semi slowdown narrative looking early.",
      "Foundry and accelerator names still have better support than the tape implies.",
      "This still argues for owning the infrastructure side over fading it.",
      "The cleanest read-through remains NVDA, TSM, and SOXX."
    ]
  },
  "src-macrolens": {
    openings: [
      "Regime check:",
      "Tape read:",
      "Macro lens:",
      "Market context:"
    ],
    middles: [
      "semis are still leading the growth complex without a rates shock getting in the way",
      "risk appetite is broad enough to confirm continuation but still concentrated enough to favor sector-specific bets",
      "the market is rewarding AI infrastructure breadth more than it is punishing valuation right now",
      "leadership still belongs to higher-quality AI beta, not defensive rotation"
    ],
    endings: [
      "That remains a better backdrop for BUY than for sitting in HOLD.",
      "Broad tech works, but semis still have the cleaner social plus market setup.",
      "This is confirmation, not origination, but it still matters for the policy engine.",
      "If the regime holds, accelerator-linked names stay first in line."
    ]
  }
};

const enterpriseCopy = {
  "src-builderalpha": {
    openings: [
      "Operator read:",
      "Customer call note:",
      "Enterprise check:",
      "Field takeaway:"
    ],
    middles: [
      "buyers are moving AI copilots from demo mode into real budget review",
      "usage conversations are improving faster than procurement conversion",
      "pipeline quality is up, but proof-of-ROI is still the gating item",
      "interest is broadening, even if deployment decisions are still uneven"
    ],
    endings: [
      "That keeps Microsoft on HOLD-to-BUY watch rather than clean BUY today.",
      "Meta still needs a more direct monetization read-through before the signal sharpens.",
      "Good tone, not decisive evidence.",
      "This is the kind of setup that can improve fast with one more confirming source."
    ]
  },
  "src-macrolens": {
    openings: [
      "Growth rotation note:",
      "Leadership check:",
      "Macro overlay:",
      "Cross-asset read:"
    ],
    middles: [
      "software is participating, but it still trails semis in signal clarity",
      "the market is supportive enough for enterprise AI, just not with enough force to force fresh buys everywhere",
      "QQQ is being helped by the same risk bid, although single-name mapping remains mixed",
      "broad growth is fine, but clean product monetization proof still matters"
    ],
    endings: [
      "That is why HOLD remains the honest default here.",
      "Macro confirmation helps, but it still cannot originate a single-name BUY on its own.",
      "This keeps the software basket constructive without making it urgent.",
      "The regime is friendly; the evidence is still partial."
    ]
  }
};

const policyNoiseCopy = {
  "src-policywire": {
    openings: [
      "Verification note:",
      "Headline check:",
      "Rumor-control read:",
      "Clarification:"
    ],
    middles: [
      "there is still no hard language backing the loud procurement rumor",
      "the circulating policy headline is running ahead of what is actually confirmed",
      "the rumor has narrative velocity, but not enough documentary support",
      "the apparent catalyst still looks more social than operational"
    ],
    endings: [
      "That keeps the signal vetoed for now.",
      "This should not graduate into a buyable AMD narrative without new evidence.",
      "Treat it as noise until the paper trail improves.",
      "The policy engine should keep this downgraded."
    ]
  },
  "src-macrolens": {
    openings: [
      "Tape sanity check:",
      "Macro reality check:",
      "Positioning read:",
      "Flow note:"
    ],
    middles: [
      "price reacted faster than the evidence stack justified",
      "the market impulse looks narrative-driven rather than information-driven",
      "the move faded the moment confirmation failed to show up",
      "this looks like noise getting mistaken for confirmation"
    ],
    endings: [
      "That is exactly the kind of setup the veto layer is meant to block.",
      "QQQ can absorb it, but AMD-specific conviction still looks weak.",
      "Until the catalyst firms up, HOLD or SELL is cleaner than forcing BUY.",
      "This is a downgrade in tradability, not necessarily a long-term thesis call."
    ]
  }
};

const cryptoCopy = {
  "src-chainpulse": {
    openings: [
      "Desk note:",
      "Crypto flow read:",
      "Positioning update:",
      "BTC market check:"
    ],
    middles: [
      "spot demand still looks fine, but derivatives are getting louder",
      "BTC is participating in the risk bid, even if leverage is doing too much of the talking",
      "the backdrop is constructive, but the trigger quality is still messy",
      "risk appetite helps, though the clean spot-led setup is still missing"
    ],
    endings: [
      "That keeps BTC closer to HOLD than BUY.",
      "I would rather wait for a cleaner entry than chase this print.",
      "Good tape, mixed signal quality.",
      "This is supportive enough to avoid SELL, not strong enough to force BUY."
    ]
  },
  "src-macrolens": {
    openings: [
      "Risk-on read:",
      "Macro spillover:",
      "Cross-market note:",
      "Liquidity lens:"
    ],
    middles: [
      "BTC is still getting help from the same liquidity impulse lifting AI beta",
      "broad risk appetite is leaning positive for crypto, but confirmation still matters more here",
      "the macro tailwind exists, though it cannot override crowded derivatives on its own",
      "cross-asset conditions are good enough for support, not yet good enough for conviction"
    ],
    endings: [
      "That is why HOLD still looks more honest than BUY.",
      "Macro helps, but crypto still has the strictest evidence threshold in this product.",
      "This is supporting context, not a standalone trigger.",
      "The signal survives, but it does not clear the aggressive bar."
    ]
  }
};

function pick(list, index) {
  return list[index % list.length];
}

export function formatBerlinTimestamp(dateInput) {
  const date = new Date(dateInput);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: BERLIN_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });

  const timeZoneFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN_TIMEZONE,
    timeZoneName: "short"
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  const timeZoneName =
    timeZoneFormatter.formatToParts(date).find((part) => part.type === "timeZoneName")?.value || "CET";

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${timeZoneName}`;
}

function buildOffsetMinutes(index, count) {
  const spread = Math.floor((71 * 60) / Math.max(count, 1));
  const jitter = (index * 17) % 29;
  return 25 + index * spread + jitter;
}

function buildConfidence(clusterId, sourceId, index) {
  const clusterBase =
    clusterId === "cluster-accelerators"
      ? 0.78
      : clusterId === "cluster-enterprise-ai"
        ? 0.65
        : clusterId === "cluster-policy-noise"
          ? 0.74
          : 0.62;

  const sourceBase = sourceConfig[sourceId].confidenceBase;
  return Number(Math.min(0.91, Math.max(0.51, (clusterBase + sourceBase) / 2 + ((index % 7) - 3) * 0.01)).toFixed(2));
}

function buildBody(clusterId, sourceId, index) {
  const copyByCluster = {
    "cluster-accelerators": acceleratorCopy,
    "cluster-enterprise-ai": enterpriseCopy,
    "cluster-policy-noise": policyNoiseCopy,
    "cluster-crypto-risk": cryptoCopy
  };
  const copy = copyByCluster[clusterId][sourceId];

  return `${pick(copy.openings, index)} ${pick(copy.middles, index + 1)}. ${pick(copy.endings, index + 2)}`;
}

function buildDirection(clusterId, sourceId, index) {
  if (clusterId === "cluster-accelerators") {
    return "Bullish";
  }

  if (clusterId === "cluster-policy-noise") {
    return index % 2 === 0 ? "Neutral" : "Mixed";
  }

  if (clusterId === "cluster-crypto-risk") {
    return sourceId === "src-chainpulse" ? "Mixed" : "Bullish";
  }

  return index % 3 === 0 ? "Bullish" : "Mixed";
}

function buildActionable(clusterId, index) {
  if (clusterId === "cluster-policy-noise") {
    return index % 3 !== 0;
  }

  return true;
}

function buildGeneratedTweet(index, count, snapshotDate) {
  const clusterId = clusterCycle[index % clusterCycle.length];
  const sourceOptions = sourcePoolsByCluster[clusterId];
  const sourceId = pick(sourceOptions, index);
  const claimType = pick(sourceConfig[sourceId].claimType, index);
  const explicitness = pick(sourceConfig[sourceId].explicitness, index + 1);
  const mappedAssets = pick(clusterMappedAssets[clusterId], index + 2);
  const themes = pick(clusterThemes[clusterId], index + 3);
  const createdAt = new Date(snapshotDate.getTime() - buildOffsetMinutes(index, count) * 60_000).toISOString();

  return {
    id: `post-auto-${String(index + 1).padStart(3, "0")}`,
    sourceId,
    createdAt,
    timestamp: formatBerlinTimestamp(createdAt),
    body: buildBody(clusterId, sourceId, index),
    actionable: buildActionable(clusterId, index),
    claimType,
    direction: buildDirection(clusterId, sourceId, index),
    explicitness,
    themes,
    confidence: buildConfidence(clusterId, sourceId, index),
    mappedAssets,
    clusterId
  };
}

function remapSeedPost(post, index, count, snapshotDate) {
  const createdAt = new Date(snapshotDate.getTime() - buildOffsetMinutes(index, count) * 60_000).toISOString();

  return {
    ...post,
    createdAt,
    timestamp: formatBerlinTimestamp(createdAt)
  };
}

export function generateFakeTweets({ count = 140, snapshotTime = new Date().toISOString() } = {}) {
  const snapshotDate = new Date(snapshotTime);
  const remappedSeedPosts = seedPosts.slice(0, Math.min(seedPosts.length, count)).map((post, index) => remapSeedPost(post, index, count, snapshotDate));
  const generatedPosts = [];

  for (let index = remappedSeedPosts.length; index < count; index += 1) {
    generatedPosts.push(buildGeneratedTweet(index, count, snapshotDate));
  }

  return [...remappedSeedPosts, ...generatedPosts].sort(
    (left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
  );
}
