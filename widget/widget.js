/* ---------------------------------------------------------
   Terminal Garden — Seedling v0.1
   Goal state, rendering, persistence, and SE event handling
--------------------------------------------------------- */

"use strict";

const STORAGE_KEY = "terminalGardenSeedling";

const DEFAULT_SETTINGS = {
  goalLabel: "ACTIVE GOAL",
  goalName: "Wacom MovInk Pad Pro 14",
  goalAmount: 1400,
  displayMode: "both",
  currencySymbol: "$",

  tier1Value: 2.5,
  tier2Value: 5,
  tier3Value: 12.5,
  bitsPerDollar: 100,

  goalActive: false
};

const state = {
  amount: 0,
  active: false,
  initialized: false
};

let settings = { ...DEFAULT_SETTINGS };
let messageTimer = null;

const elements = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  render();

  /*
    Local browser preview:
    StreamElements does not exist in Live Server, so use defaults.
  */
  if (!isStreamElementsEnvironment()) {
    state.initialized = true;
    showMessage("LOCAL PREVIEW — STREAM EVENTS DISABLED");
    render();
  }
});

window.addEventListener("onWidgetLoad", async (obj) => {
  cacheElements();

  const fieldData = obj?.detail?.fieldData || {};

  settings = {
    ...DEFAULT_SETTINGS,
    ...fieldData,

    goalAmount: positiveNumber(
      fieldData.goalAmount,
      DEFAULT_SETTINGS.goalAmount
    ),

    tier1Value: nonNegativeNumber(
      fieldData.tier1Value,
      DEFAULT_SETTINGS.tier1Value
    ),

    tier2Value: nonNegativeNumber(
      fieldData.tier2Value,
      DEFAULT_SETTINGS.tier2Value
    ),

    tier3Value: nonNegativeNumber(
      fieldData.tier3Value,
      DEFAULT_SETTINGS.tier3Value
    ),

    bitsPerDollar: positiveNumber(
      fieldData.bitsPerDollar,
      DEFAULT_SETTINGS.bitsPerDollar
    )
  };

  await loadStoredState();

  state.initialized = true;

  showMessage(
    state.active
      ? "SYSTEM ONLINE — WAITING FOR NEW CONTRIBUTIONS"
      : "GOAL INACTIVE — PRESS START / RESET GOAL"
  );

  render();
});

window.addEventListener("onEventReceived", async (obj) => {
  const listener = obj?.detail?.listener;
  const event = obj?.detail?.event || {};

  if (!listener) {
    return;
  }

  if (listener === "widget-button") {
    await handleWidgetButton(event);
    return;
  }

  if (listener === "kvstore:update") {
    handleStoreUpdate(event);
    return;
  }

  if (!state.initialized || !state.active) {
    return;
  }

  const contribution = calculateContribution(listener, event);

  if (contribution <= 0) {
    return;
  }

  state.amount = roundCurrency(state.amount + contribution);

  await saveStoredState();

  showContributionReaction(
    event.name || event.sender || "A VIEWER",
    contribution
  );

  render();
});

function cacheElements() {
  elements.root = document.getElementById("terminal-garden");
  elements.goalLabel = document.getElementById("goal-label");
  elements.goalName = document.getElementById("goal-name");
  elements.progressTrack = document.getElementById("progress-track");
  elements.progressFill = document.getElementById("progress-fill");
  elements.progressPercent = document.getElementById("progress-percent");
  elements.progressMoney = document.getElementById("progress-money");
  elements.activityMessage = document.getElementById("activity-message");
  elements.catMascot = document.getElementById("cat-mascot");
}

function render() {
  if (!elements.root) {
    return;
  }

  const goalAmount = positiveNumber(
    settings.goalAmount,
    DEFAULT_SETTINGS.goalAmount
  );

  const percentage = Math.min(
    Math.max((state.amount / goalAmount) * 100, 0),
    100
  );

  elements.goalLabel.textContent =
    settings.goalLabel || DEFAULT_SETTINGS.goalLabel;

  elements.goalName.textContent =
    settings.goalName || DEFAULT_SETTINGS.goalName;

  elements.progressFill.style.width = `${percentage}%`;

  elements.progressTrack.setAttribute(
    "aria-valuemax",
    String(goalAmount)
  );

  elements.progressTrack.setAttribute(
    "aria-valuenow",
    String(state.amount)
  );

  elements.progressPercent.textContent =
    `${Math.floor(percentage)}%`;

  elements.progressMoney.textContent =
    `${formatMoney(state.amount)} / ${formatMoney(goalAmount)}`;

  applyDisplayMode(settings.displayMode);

  elements.root.classList.toggle(
    "goal-is-inactive",
    !state.active
  );

  elements.root.classList.toggle(
    "goal-is-complete",
    percentage >= 100
  );
}

function applyDisplayMode(mode) {
  const selectedMode = String(mode || "both");

  elements.progressPercent.hidden =
    selectedMode === "money" ||
    selectedMode === "hidden";

  elements.progressMoney.hidden =
    selectedMode === "percentage" ||
    selectedMode === "hidden";
}

function calculateContribution(listener, event) {
  if (listener === "tip-latest") {
    return nonNegativeNumber(event.amount, 0);
  }

  if (listener === "cheer-latest") {
    const bits = nonNegativeNumber(event.amount, 0);

    return bits / settings.bitsPerDollar;
  }

  if (listener === "subscriber-latest") {
    return calculateSubscriptionContribution(event);
  }

  return 0;
}

function calculateSubscriptionContribution(event) {
  /*
    A community gift can produce one bulk event and then individual
    recipient events. Ignore those recipient events to avoid counting
    the same gifted subscriptions twice.
  */
  if (event.isCommunityGift || event.playedAsCommunityGift) {
    return 0;
  }

  const tierValue = getSubscriptionTierValue(event);

  if (event.bulkGifted) {
    const giftCount = Math.max(
      Math.floor(nonNegativeNumber(event.amount, 0)),
      0
    );

    return tierValue * giftCount;
  }

  /*
    A normal sub, resub, or single gifted sub counts as one.
  */
  return tierValue;
}

function getSubscriptionTierValue(event) {
  const rawTier =
    event.tier ??
    event.subTier ??
    event.data?.tier ??
    "1000";

  const tier = String(rawTier);

  if (
    tier === "3000" ||
    tier === "3" ||
    tier.toLowerCase() === "tier 3"
  ) {
    return settings.tier3Value;
  }

  if (
    tier === "2000" ||
    tier === "2" ||
    tier.toLowerCase() === "tier 2"
  ) {
    return settings.tier2Value;
  }

  return settings.tier1Value;
}

async function handleWidgetButton(event) {
  const field = event?.field;

  if (field === "startResetGoal") {
    state.amount = 0;
    state.active = true;

    await saveStoredState();

    showMessage("NEW GOAL ACTIVATED — PROGRESS RESET TO ZERO");
    render();

    return;
  }

  if (field === "pauseResumeGoal") {
    state.active = !state.active;

    await saveStoredState();

    showMessage(
      state.active
        ? "GOAL RESUMED — NEW CONTRIBUTIONS ENABLED"
        : "GOAL PAUSED — CONTRIBUTIONS WILL NOT COUNT"
    );

    render();

    return;
  }

  if (field === "testContribution") {
    state.amount = roundCurrency(state.amount + 5);

    await saveStoredState();

    showContributionReaction("TEST SIGNAL", 5);
    render();
  }
}

async function loadStoredState() {
  if (!isStreamElementsEnvironment()) {
    return;
  }

  try {
    const stored = await SE_API.store.get(STORAGE_KEY);

    if (
      stored &&
      typeof stored === "object"
    ) {
      state.amount = nonNegativeNumber(stored.amount, 0);
      state.active = stored.active === true;
    }
  } catch (error) {
    state.amount = 0;
    state.active = false;

    showMessage("STORAGE READ ERROR — GOAL NOT ACTIVATED");
  }
}

async function saveStoredState() {
  if (!isStreamElementsEnvironment()) {
    return;
  }

  const storedState = {
    amount: roundCurrency(state.amount),
    active: state.active,
    updatedAt: Date.now()
  };

  try {
    SE_API.store.set(STORAGE_KEY, storedState);
  } catch (error) {
    showMessage("STORAGE WRITE ERROR");
  }
}

function handleStoreUpdate(event) {
  const data = event?.data;

  if (!data || !String(data.key).endsWith(STORAGE_KEY)) {
    return;
  }

  const value = data.value;

  if (!value || typeof value !== "object") {
    return;
  }

  state.amount = nonNegativeNumber(
    value.amount,
    state.amount
  );

  state.active = value.active === true;

  render();
}

function showContributionReaction(name, amount) {
  showMessage(
    `NEW CONTRIBUTION — ${sanitizeDisplayName(name)} +${formatMoney(amount)}`
  );

  if (!elements.catMascot) {
    return;
  }

  elements.catMascot.classList.remove("cat-reacting");

  void elements.catMascot.offsetWidth;

  elements.catMascot.classList.add("cat-reacting");

  window.setTimeout(() => {
    elements.catMascot?.classList.remove("cat-reacting");
  }, 1600);
}

function showMessage(message) {
  if (!elements.activityMessage) {
    return;
  }

  elements.activityMessage.textContent = message;

  window.clearTimeout(messageTimer);

  messageTimer = window.setTimeout(() => {
    elements.activityMessage.textContent = state.active
      ? "SYSTEM ONLINE — WAITING FOR NEW CONTRIBUTIONS"
      : "GOAL INACTIVE — PRESS START / RESET GOAL";
  }, 5000);
}

function formatMoney(value) {
  const symbol =
    settings.currencySymbol ||
    DEFAULT_SETTINGS.currencySymbol;

  return `${symbol}${nonNegativeNumber(value, 0).toLocaleString(
    "en-US",
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }
  )}`;
}

function sanitizeDisplayName(value) {
  return String(value || "A VIEWER")
    .replace(/[<>]/g, "")
    .slice(0, 30)
    .toUpperCase();
}

function positiveNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function nonNegativeNumber(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? number
    : fallback;
}

function roundCurrency(value) {
  return Math.round(
    (nonNegativeNumber(value, 0) + Number.EPSILON) * 100
  ) / 100;
}

function isStreamElementsEnvironment() {
  return (
    typeof window.SE_API !== "undefined" &&
    SE_API?.store &&
    typeof SE_API.store.get === "function" &&
    typeof SE_API.store.set === "function"
  );
}