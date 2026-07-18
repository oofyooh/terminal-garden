"use strict";

const STORAGE_KEY = "terminalGardenSeedlingV2";

const defaults = {
  goalLabel: "ACTIVE GOAL",
  goalName: "Wacom MovInk Pad Pro 14",
  goalAmount: 1400,
  displayMode: "both",
  currencySymbol: "$",
  tier1Value: 2.5,
  tier2Value: 5,
  tier3Value: 12.5,
  bitsPerDollar: 100,
  resetCode: 0
};

let settings = { ...defaults };

let state = {
  amount: 0,
  active: true,
  lastResetCode: 0
};

let loaded = false;
let messageTimer = null;

const elements = {};

document.addEventListener("DOMContentLoaded", function () {
  cacheElements();

  if (!window.SE_API) {
    loaded = true;
    render();
    showMessage("LOCAL PREVIEW — STREAM EVENTS DISABLED");
  }
});

window.addEventListener("onWidgetLoad", function (obj) {
  cacheElements();

  const fields = obj.detail.fieldData || {};

  settings = {
    ...defaults,
    ...fields,
    goalAmount: validPositive(fields.goalAmount, defaults.goalAmount),
    tier1Value: validNonNegative(fields.tier1Value, defaults.tier1Value),
    tier2Value: validNonNegative(fields.tier2Value, defaults.tier2Value),
    tier3Value: validNonNegative(fields.tier3Value, defaults.tier3Value),
    bitsPerDollar: validPositive(
      fields.bitsPerDollar,
      defaults.bitsPerDollar
    ),
    resetCode: validNonNegative(fields.resetCode, 0)
  };

  SE_API.store
    .get(STORAGE_KEY)
    .then(function (stored) {
      if (stored && typeof stored === "object") {
        state.amount = validNonNegative(stored.amount, 0);
        state.active = stored.active !== false;
        state.lastResetCode = validNonNegative(
          stored.lastResetCode,
          0
        );
      } else {
        /*
          First installation of this widget version:
          begin fresh at zero automatically.
        */
        state.amount = 0;
        state.active = true;
        state.lastResetCode = settings.resetCode;
        saveState();
      }

      /*
        Changing Reset Code in Fields resets the goal.
      */
      if (settings.resetCode !== state.lastResetCode) {
        state.amount = 0;
        state.active = true;
        state.lastResetCode = settings.resetCode;
        saveState();
        showMessage("NEW GOAL ACTIVATED — PROGRESS RESET TO ZERO");
      }

      loaded = true;
      render();

      if (state.amount === 0) {
        showMessage("GOAL ACTIVE — WAITING FOR NEW CONTRIBUTIONS");
      }
    })
    .catch(function () {
      state.amount = 0;
      state.active = true;
      loaded = true;
      render();
      showMessage("STORAGE ERROR — TEMPORARY ZERO STATE");
    });
});

window.addEventListener("onEventReceived", function (obj) {
  if (!loaded || !state.active) {
    return;
  }

  const listener = obj.detail.listener;
  const event = obj.detail.event || {};

  if (listener === "kvstore:update") {
    handleStoreUpdate(event);
    return;
  }

  let contribution = 0;

  if (listener === "tip-latest") {
    contribution = validNonNegative(event.amount, 0);
  }

  if (listener === "cheer-latest") {
    const bits = validNonNegative(event.amount, 0);
    contribution = bits / settings.bitsPerDollar;
  }

  if (listener === "subscriber-latest") {
    contribution = subscriptionValue(event);
  }

  if (contribution <= 0) {
    return;
  }

  state.amount = roundMoney(state.amount + contribution);

  saveState();
  render();

  showContributionReaction(
    event.name || event.sender || "VIEWER",
    contribution
  );
});

function cacheElements() {
  elements.root = document.getElementById("terminal-garden");
  elements.goalLabel = document.getElementById("goal-label");
  elements.goalName = document.getElementById("goal-name");
  elements.progressTrack = document.getElementById("progress-track");
  elements.progressFill = document.getElementById("progress-fill");
  elements.progressPercent =
    document.getElementById("progress-percent");
  elements.progressMoney =
    document.getElementById("progress-money");
  elements.activityMessage =
    document.getElementById("activity-message");
}

function subscriptionValue(event) {
  /*
    Ignore individual recipient events from community gift batches.
    The bulk event will be counted instead.
  */
  if (event.isCommunityGift || event.playedAsCommunityGift) {
    return 0;
  }

  const tier = String(
    event.tier || event.subTier || "1000"
  );

  let value = settings.tier1Value;

  if (tier === "2000" || tier === "2") {
    value = settings.tier2Value;
  }

  if (tier === "3000" || tier === "3") {
    value = settings.tier3Value;
  }

  if (event.bulkGifted) {
    const quantity = Math.max(
      Math.floor(validNonNegative(event.amount, 0)),
      0
    );

    return value * quantity;
  }

  return value;
}

function render() {
  if (!elements.root) {
    return;
  }

  const goal = validPositive(
    settings.goalAmount,
    defaults.goalAmount
  );

  const percentage = Math.min(
    Math.max((state.amount / goal) * 100, 0),
    100
  );

  elements.goalLabel.textContent =
    settings.goalLabel || defaults.goalLabel;

  elements.goalName.textContent =
    settings.goalName || defaults.goalName;

  elements.progressFill.style.width = percentage + "%";

  elements.progressTrack.setAttribute(
    "aria-valuemax",
    String(goal)
  );

  elements.progressTrack.setAttribute(
    "aria-valuenow",
    String(state.amount)
  );

  /*
    Use one decimal below 10% so small tests are visible.
  */
  elements.progressPercent.textContent =
    percentage > 0 && percentage < 10
      ? percentage.toFixed(1) + "%"
      : Math.floor(percentage) + "%";

  elements.progressMoney.textContent =
    formatMoney(state.amount) + " / " + formatMoney(goal);

  const mode = String(settings.displayMode || "both");

  elements.progressPercent.hidden =
    mode === "money" || mode === "hidden";

  elements.progressMoney.hidden =
    mode === "percentage" || mode === "hidden";

  elements.root.classList.toggle(
    "goal-is-complete",
    percentage >= 100
  );

  elements.root.classList.remove("goal-is-inactive");
}

function saveState() {
  SE_API.store.set(STORAGE_KEY, {
    amount: roundMoney(state.amount),
    active: state.active,
    lastResetCode: state.lastResetCode,
    updatedAt: Date.now()
  });
}

function handleStoreUpdate(event) {
  const data = event.data;

  if (!data || !String(data.key).endsWith(STORAGE_KEY)) {
    return;
  }

  const stored = data.value;

  if (!stored || typeof stored !== "object") {
    return;
  }

  state.amount = validNonNegative(stored.amount, state.amount);
  state.active = stored.active !== false;
  state.lastResetCode = validNonNegative(
    stored.lastResetCode,
    state.lastResetCode
  );

  render();
}

function showContributionReaction(name, amount) {
  showMessage(
    "NEW CONTRIBUTION — " +
      cleanName(name) +
      " +" +
      formatMoney(amount)
  );

  elements.root?.classList.remove("contribution-reacting");

  void elements.root?.offsetWidth;

  elements.root?.classList.add("contribution-reacting");

  window.setTimeout(function () {
    elements.root?.classList.remove("contribution-reacting");
  }, 900);
}

function formatMoney(value) {
  const symbol =
    settings.currencySymbol || defaults.currencySymbol;

  return (
    symbol +
    validNonNegative(value, 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  );
}

function cleanName(value) {
  return String(value || "VIEWER")
    .replace(/[<>]/g, "")
    .slice(0, 30)
    .toUpperCase();
}

function validPositive(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number > 0
    ? number
    : fallback;
}

function validNonNegative(value, fallback) {
  const number = Number(value);

  return Number.isFinite(number) && number >= 0
    ? number
    : fallback;
}

function roundMoney(value) {
  return Math.round(
    (validNonNegative(value, 0) + Number.EPSILON) * 100
  ) / 100;
}