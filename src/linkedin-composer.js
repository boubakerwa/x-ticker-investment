const state = {
  isLoading: true,
  isSubmitting: false,
  isRewriting: false,
  error: "",
  notice: "",
  capabilities: null,
  tools: {
    rewritePresets: [],
    helperTools: []
  },
  drafts: [],
  latestDraft: null,
  selectedDraftId: "",
  telegramBot: null,
  filters: {
    pillar: "ALL",
    format: "ALL",
    status: "ALL"
  }
};

const elements = {
  form: document.querySelector("#composer-form"),
  xUrl: document.querySelector("#x-url"),
  voice: document.querySelector("#voice"),
  manualText: document.querySelector("#manual-text"),
  manualAuthor: document.querySelector("#manual-author"),
  manualMediaNotes: document.querySelector("#manual-media-notes"),
  generateButton: document.querySelector("#generate-button"),
  refreshButton: document.querySelector("#refresh-button"),
  copyButton: document.querySelector("#copy-button"),
  rewriteForm: document.querySelector("#rewrite-form"),
  rewriteVoice: document.querySelector("#rewrite-voice"),
  rewriteInstructions: document.querySelector("#rewrite-instructions"),
  rewriteButton: document.querySelector("#rewrite-button"),
  feedback: document.querySelector("#form-feedback"),
  capabilityBadges: document.querySelector("#capability-badges"),
  telegramStatus: document.querySelector("#telegram-status"),
  rewritePresets: document.querySelector("#rewrite-presets"),
  helperTools: document.querySelector("#helper-tools"),
  latestMeta: document.querySelector("#latest-meta"),
  pillarNav: document.querySelector("#pillar-nav"),
  formatNav: document.querySelector("#format-nav"),
  statusNav: document.querySelector("#status-nav"),
  librarySummary: document.querySelector("#library-summary"),
  draftLibrary: document.querySelector("#draft-library"),
  detailTitle: document.querySelector("#detail-title"),
  draftDetail: document.querySelector("#draft-detail"),
  draftVersions: document.querySelector("#draft-versions")
};

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) {
    return "Not captured yet";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    },
    ...options
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

function getDraftLibrary(draft = {}) {
  const library = draft.library || {};

  return {
    pillar: library.pillar || {
      id: "uncategorized",
      label: "Uncategorized"
    },
    format: library.format || {
      id: "insight",
      label: "Insight"
    },
    intent: library.intent || {
      id: "build-credibility",
      label: "Build Credibility"
    },
    status: library.status || "draft",
    sourceType: library.sourceType || draft?.source?.type || "manual",
    sourceLabel:
      library.sourceLabel ||
      draft?.source?.authorHandle ||
      draft?.source?.authorName ||
      draft?.origin ||
      "Unknown source",
    tags: Array.isArray(library.tags) ? library.tags : [],
    rootDraftId: library.rootDraftId || draft.id || "",
    parentDraftId: library.parentDraftId || "",
    revisionNumber: Number(library.revisionNumber || 1),
    rewriteInstructions: library.rewriteInstructions || ""
  };
}

function getSelectedDraft() {
  return state.drafts.find((draft) => draft.id === state.selectedDraftId) || null;
}

function getFilteredDrafts() {
  return state.drafts.filter((draft) => {
    const library = getDraftLibrary(draft);

    if (state.filters.pillar !== "ALL" && library.pillar.id !== state.filters.pillar) {
      return false;
    }

    if (state.filters.format !== "ALL" && library.format.id !== state.filters.format) {
      return false;
    }

    if (state.filters.status !== "ALL" && library.status !== state.filters.status) {
      return false;
    }

    return true;
  });
}

function getVersionThread(draft) {
  if (!draft) {
    return [];
  }

  const selectedLibrary = getDraftLibrary(draft);

  return [...state.drafts]
    .filter((item) => getDraftLibrary(item).rootDraftId === selectedLibrary.rootDraftId)
    .sort((left, right) => {
      const revisionDifference =
        getDraftLibrary(right).revisionNumber - getDraftLibrary(left).revisionNumber;

      if (revisionDifference !== 0) {
        return revisionDifference;
      }

      return new Date(right.updatedAt || right.createdAt).getTime() - new Date(left.updatedAt || left.createdAt).getTime();
    });
}

function buildFilterOptions(drafts, key) {
  const counts = new Map();

  for (const draft of drafts) {
    const library = getDraftLibrary(draft);
    const entry = library[key];
    const id = key === "status" ? library.status : entry?.id;
    const label = key === "status" ? library.status : entry?.label;

    if (!id || !label) {
      continue;
    }

    const current = counts.get(id) || {
      id,
      label,
      count: 0
    };
    current.count += 1;
    counts.set(id, current);
  }

  return [...counts.values()].sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));
}

function renderFeedback() {
  elements.feedback.textContent = state.error || state.notice || "";
  elements.feedback.className = "feedback-strip";

  if (state.error) {
    elements.feedback.classList.add("is-error");
  } else if (state.notice) {
    elements.feedback.classList.add("is-success");
  }
}

function renderCapabilities() {
  const capabilities = state.capabilities || {};
  const badges = [
    capabilities.publicXParsing ? "Public X parsing" : "Manual input",
    capabilities.manualFallback ? "Manual fallback ready" : "Manual fallback unavailable",
    capabilities.imagePreview ? "Media preview capture" : "No media preview",
    capabilities.generationMode === "template-only" ? "Template drafting" : "Model drafting"
  ];

  elements.capabilityBadges.innerHTML = badges
    .map((badge) => `<span class="badge">${escapeHtml(badge)}</span>`)
    .join("");

  if (!state.telegramBot) {
    elements.telegramStatus.textContent = "Telegram status unavailable";
    return;
  }

  if (state.telegramBot.active) {
    elements.telegramStatus.textContent = "Bot polling is active";
    return;
  }

  if (state.telegramBot.commandsEnabled) {
    elements.telegramStatus.textContent = "Configured, but not actively polling";
    return;
  }

  elements.telegramStatus.textContent = "Commands are not enabled";
}

function renderTools() {
  const rewritePresets = Array.isArray(state.tools?.rewritePresets) ? state.tools.rewritePresets : [];
  const helperTools = Array.isArray(state.tools?.helperTools) ? state.tools.helperTools : [];

  elements.rewritePresets.innerHTML = rewritePresets.length
    ? rewritePresets
        .map(
          (preset) => `
            <button class="tool-chip" type="button" data-preset-id="${escapeHtml(preset.id)}" data-preset-instruction="${escapeHtml(preset.instruction)}">
              ${escapeHtml(preset.label)}
            </button>
          `
        )
        .join("")
    : '<div class="empty-state">No rewrite presets available yet.</div>';

  elements.helperTools.innerHTML = helperTools.length
    ? `<ul class="helper-list">${helperTools
        .map((tool) => `<li>${escapeHtml(tool)}</li>`)
        .join("")}</ul>`
    : '<div class="empty-state">No helper tools available yet.</div>';
}

function renderLatestMeta() {
  const latestDraft = state.latestDraft;
  const selectedDraft = getSelectedDraft();

  if (!latestDraft) {
    elements.latestMeta.innerHTML =
      "<span>Library status</span><strong>No drafts yet</strong><span>Your next captured source will appear here.</span>";
    return;
  }

  const selectedLibrary = getDraftLibrary(selectedDraft || latestDraft);

  elements.latestMeta.innerHTML = `
    <span>Library status</span>
    <strong>${escapeHtml(state.drafts.length)} draft${state.drafts.length === 1 ? "" : "s"} saved</strong>
    <span>Latest: ${escapeHtml(formatDate(latestDraft.updatedAt || latestDraft.createdAt))}</span>
    <span>Selected pillar: ${escapeHtml(selectedLibrary.pillar.label)} · Selected intent: ${escapeHtml(selectedLibrary.intent.label)}</span>
  `;
}

function renderFilterNav(container, drafts, key, activeValue) {
  const options = buildFilterOptions(drafts, key);
  const label = key === "status" ? "All statuses" : `All ${key}s`;
  const allCount = drafts.length;
  const currentValue = activeValue || "ALL";

  container.innerHTML = [
    `<button class="filter-chip ${currentValue === "ALL" ? "is-active" : ""}" type="button" data-filter-group="${escapeHtml(key)}" data-filter-value="ALL">${escapeHtml(label)} (${allCount})</button>`,
    ...options.map(
      (option) => `
        <button class="filter-chip ${currentValue === option.id ? "is-active" : ""}" type="button" data-filter-group="${escapeHtml(
          key
        )}" data-filter-value="${escapeHtml(option.id)}">
          ${escapeHtml(option.label)} (${option.count})
        </button>
      `
    )
  ].join("");
}

function renderLibrary() {
  const filteredDrafts = getFilteredDrafts();
  elements.librarySummary.textContent = `Showing ${filteredDrafts.length} of ${state.drafts.length} drafts`;

  if (!filteredDrafts.length) {
    elements.draftLibrary.innerHTML =
      '<div class="empty-state">No drafts match the current filters. Clear a filter or create a new draft.</div>';
    return;
  }

  elements.draftLibrary.innerHTML = filteredDrafts
    .map((draft) => {
      const library = getDraftLibrary(draft);
      const isSelected = draft.id === state.selectedDraftId;

      return `
        <button class="library-item ${isSelected ? "is-selected" : ""}" type="button" data-draft-id="${escapeHtml(draft.id)}">
          <article class="draft-item">
            <div class="library-card-top">
              <span class="meta-pill">${escapeHtml(library.pillar.label)}</span>
              <span class="meta-pill">v${escapeHtml(library.revisionNumber)}</span>
            </div>
            <h3 class="library-card-title">${escapeHtml(draft.draft?.headline || "Untitled draft")}</h3>
            <p>${escapeHtml(draft.draft?.hook || draft.draft?.fullPost || "")}</p>
            <div class="library-card-meta">
              <span>${escapeHtml(library.format.label)}</span>
              <span>${escapeHtml(library.status)}</span>
              <span>${escapeHtml(library.sourceLabel)}</span>
              <span>${escapeHtml(formatDate(draft.updatedAt || draft.createdAt))}</span>
            </div>
          </article>
        </button>
      `;
    })
    .join("");
}

function buildSourceHtml(source = {}, warnings = []) {
  const media = Array.isArray(source.media) ? source.media : [];
  const links = Array.isArray(source.links) ? source.links : [];

  return `
    <div class="detail-block source-grid">
      <div class="source-meta">
        <span class="meta-pill">${escapeHtml(source.type === "x-post" ? "Parsed from X" : "Manual source")}</span>
        <span class="meta-pill">${escapeHtml(buildSourceLabel(source))}</span>
        <span class="meta-pill">${escapeHtml(source.mediaSummary || "No media")}</span>
      </div>
      <strong>Source context</strong>
      <p class="source-text">${escapeHtml(source.text || "No source text captured.")}</p>
      ${
        source.manualMediaNotes
          ? `<div class="meta-card"><span>Visual note</span><strong>${escapeHtml(source.manualMediaNotes)}</strong></div>`
          : ""
      }
      ${
        media.length
          ? `<div class="media-grid">${media
              .map(
                (item) =>
                  `<img src="${escapeHtml(item.previewUrl || item.assetUrl)}" alt="${escapeHtml(
                    item.type || "media preview"
                  )}" loading="lazy" />`
              )
              .join("")}</div>`
          : ""
      }
      ${
        links.length
          ? `<div class="link-list">${links
              .map(
                (item) =>
                  `<a href="${escapeHtml(item.expandedUrl)}" target="_blank" rel="noreferrer">${escapeHtml(
                    item.displayUrl || item.expandedUrl
                  )}</a>`
              )
              .join("")}</div>`
          : ""
      }
      ${
        warnings.length
          ? `<ul class="warning-list">${warnings
              .map((warning) => `<li>${escapeHtml(warning)}</li>`)
              .join("")}</ul>`
          : ""
      }
    </div>
  `;
}

function renderDetail() {
  const draft = getSelectedDraft();

  if (!draft) {
    elements.detailTitle.textContent = "Select a draft";
    elements.draftDetail.className = "empty-state";
    elements.draftDetail.innerHTML =
      "Choose a draft from the library to inspect the source, full post text, and revision history.";
    return;
  }

  const postDraft = draft.draft || {};
  const library = getDraftLibrary(draft);
  const warnings = Array.isArray(draft.warnings) ? draft.warnings : [];

  elements.detailTitle.textContent = postDraft.headline || "Selected draft";
  elements.rewriteVoice.value = draft.voice || "professional";
  elements.draftDetail.className = "detail-stack";
  elements.draftDetail.innerHTML = `
    <div class="detail-block">
      <div class="detail-toolbar">
        <span class="meta-pill">${escapeHtml(library.pillar.label)}</span>
        <span class="meta-pill">${escapeHtml(library.format.label)}</span>
        <span class="meta-pill">${escapeHtml(library.intent.label)}</span>
        <span class="meta-pill">${escapeHtml(library.status)}</span>
      </div>
      <h3 class="draft-headline">${escapeHtml(postDraft.headline || "Untitled draft")}</h3>
      <p class="draft-text">${escapeHtml(postDraft.fullPost || "")}</p>
    </div>

    <div class="detail-block">
      <strong>Draft metadata</strong>
      <ul class="detail-list">
        <li>Voice: ${escapeHtml(draft.voice || "professional")}</li>
        <li>Source: ${escapeHtml(library.sourceLabel)}</li>
        <li>Revision: ${escapeHtml(String(library.revisionNumber))}</li>
        <li>Generated: ${escapeHtml(formatDate(draft.updatedAt || draft.createdAt))}</li>
        <li>Tags: ${escapeHtml(library.tags.join(", ") || "No tags yet")}</li>
        ${
          library.rewriteInstructions
            ? `<li>Rewrite brief: ${escapeHtml(library.rewriteInstructions)}</li>`
            : ""
        }
      </ul>
    </div>

    ${buildSourceHtml(draft.source || {}, warnings)}
  `;
}

function renderVersions() {
  const selectedDraft = getSelectedDraft();
  const versions = getVersionThread(selectedDraft);

  if (!versions.length) {
    elements.draftVersions.innerHTML =
      '<div class="empty-state">Version history will appear here.</div>';
    return;
  }

  elements.draftVersions.innerHTML = versions
    .map((draft) => {
      const library = getDraftLibrary(draft);

      return `
        <button class="version-select" type="button" data-draft-id="${escapeHtml(draft.id)}">
          <article class="version-item">
            <div class="version-top">
              <strong>v${escapeHtml(String(library.revisionNumber))} · ${escapeHtml(draft.draft?.headline || "Untitled draft")}</strong>
              <span class="version-meta">${escapeHtml(formatDate(draft.updatedAt || draft.createdAt))}</span>
            </div>
            <p>${escapeHtml(draft.draft?.hook || "")}</p>
          </article>
        </button>
      `;
    })
    .join("");
}

function render() {
  renderFeedback();
  renderCapabilities();
  renderTools();
  renderLatestMeta();
  renderFilterNav(elements.pillarNav, state.drafts, "pillar", state.filters.pillar);
  renderFilterNav(elements.formatNav, state.drafts, "format", state.filters.format);
  renderFilterNav(elements.statusNav, state.drafts, "status", state.filters.status);
  renderLibrary();
  renderDetail();
  renderVersions();
  elements.generateButton.disabled = state.isSubmitting;
  elements.generateButton.textContent = state.isSubmitting ? "Generating…" : "Generate Draft";
  elements.rewriteButton.disabled = state.isRewriting || !getSelectedDraft();
  elements.rewriteButton.textContent = state.isRewriting ? "Rewriting…" : "Rewrite With AI";
  elements.copyButton.disabled = !getSelectedDraft()?.draft?.fullPost;
}

function ensureValidSelection() {
  const filteredDrafts = getFilteredDrafts();
  const selectedDraftStillVisible = filteredDrafts.some((draft) => draft.id === state.selectedDraftId);

  if (selectedDraftStillVisible) {
    return;
  }

  state.selectedDraftId = filteredDrafts[0]?.id || state.latestDraft?.id || state.drafts[0]?.id || "";
}

async function loadState({ silent = false, selectedDraftId = state.selectedDraftId } = {}) {
  if (!silent) {
    state.isLoading = true;
  }

  try {
    const payload = await requestJson("/api/linkedin-composer/state", {
      cache: "no-store"
    });

    state.capabilities = payload.capabilities || null;
    state.tools = payload.tools || {
      rewritePresets: [],
      helperTools: []
    };
    state.drafts = Array.isArray(payload.drafts) ? payload.drafts : [];
    state.latestDraft = payload.latestDraft || state.drafts[0] || null;
    state.telegramBot = payload.telegramBot || null;
    state.selectedDraftId =
      selectedDraftId && state.drafts.some((draft) => draft.id === selectedDraftId)
        ? selectedDraftId
        : state.latestDraft?.id || state.drafts[0]?.id || "";
    ensureValidSelection();

    if (!silent) {
      state.error = "";
    }
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Could not load the draft library.";
  } finally {
    state.isLoading = false;
    render();
  }
}

async function handleCreateDraft(event) {
  event.preventDefault();
  state.isSubmitting = true;
  state.error = "";
  state.notice = "";
  render();

  try {
    const payload = await requestJson("/api/linkedin-composer/drafts", {
      method: "POST",
      body: JSON.stringify({
        xUrl: elements.xUrl.value,
        voice: elements.voice.value,
        manualText: elements.manualText.value,
        manualAuthor: elements.manualAuthor.value,
        manualMediaNotes: elements.manualMediaNotes.value,
        origin: "ui"
      })
    });

    state.notice = "Draft generated and added to the library.";
    elements.form.reset();
    elements.voice.value = "professional";
    await loadState({
      silent: true,
      selectedDraftId: payload.draft?.id || ""
    });
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Draft generation failed.";
  } finally {
    state.isSubmitting = false;
    render();
  }
}

async function handleRewriteDraft(event) {
  event.preventDefault();
  const selectedDraft = getSelectedDraft();

  if (!selectedDraft) {
    state.error = "Select a draft before asking for a rewrite.";
    state.notice = "";
    render();
    return;
  }

  state.isRewriting = true;
  state.error = "";
  state.notice = "";
  render();

  try {
    const payload = await requestJson(
      `/api/linkedin-composer/drafts/${encodeURIComponent(selectedDraft.id)}/rewrite`,
      {
        method: "POST",
        body: JSON.stringify({
          instructions: elements.rewriteInstructions.value,
          voice: elements.rewriteVoice.value,
          origin: "ui-rewrite"
        })
      }
    );

    state.notice = "Rewrite created as a new library version.";
    elements.rewriteInstructions.value = "";
    await loadState({
      silent: true,
      selectedDraftId: payload.draft?.id || ""
    });
  } catch (error) {
    state.error = error instanceof Error ? error.message : "Rewrite failed.";
  } finally {
    state.isRewriting = false;
    render();
  }
}

async function copySelectedDraft() {
  const text = getSelectedDraft()?.draft?.fullPost || "";

  if (!text) {
    state.error = "There is no selected draft to copy yet.";
    state.notice = "";
    render();
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    state.notice = "Selected draft copied to clipboard.";
    state.error = "";
  } catch (_error) {
    state.error = "Clipboard copy failed in this browser.";
    state.notice = "";
  }

  render();
}

elements.form.addEventListener("submit", handleCreateDraft);
elements.rewriteForm.addEventListener("submit", handleRewriteDraft);
elements.refreshButton.addEventListener("click", () => {
  state.notice = "";
  state.error = "";
  loadState();
});
elements.copyButton.addEventListener("click", copySelectedDraft);

elements.draftLibrary.addEventListener("click", (event) => {
  const button = event.target.closest("[data-draft-id]");

  if (!button) {
    return;
  }

  state.selectedDraftId = button.getAttribute("data-draft-id") || "";
  state.notice = "";
  state.error = "";
  render();
});

elements.draftVersions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-draft-id]");

  if (!button) {
    return;
  }

  state.selectedDraftId = button.getAttribute("data-draft-id") || "";
  render();
});

for (const nav of [elements.pillarNav, elements.formatNav, elements.statusNav]) {
  nav.addEventListener("click", (event) => {
    const button = event.target.closest("[data-filter-group]");

    if (!button) {
      return;
    }

    const group = button.getAttribute("data-filter-group");
    const value = button.getAttribute("data-filter-value") || "ALL";

    if (!group) {
      return;
    }

    state.filters[group] = value;
    ensureValidSelection();
    render();
  });
}

elements.rewritePresets.addEventListener("click", (event) => {
  const button = event.target.closest("[data-preset-instruction]");

  if (!button) {
    return;
  }

  elements.rewriteInstructions.value = button.getAttribute("data-preset-instruction") || "";
  elements.rewriteInstructions.focus();
  state.notice = "Rewrite preset loaded into the instruction box.";
  state.error = "";
  render();
});

function buildSourceLabel(source = {}) {
  return source.authorHandle || source.authorName || source.xUrl || "Manual source";
}

loadState();
window.setInterval(() => {
  loadState({
    silent: true,
    selectedDraftId: state.selectedDraftId
  });
}, 15000);
