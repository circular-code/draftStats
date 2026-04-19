const seededSetCatalog = [
  { code: "DFT", name: "Aetherdrift", color: "linear-gradient(135deg, #ff7a18, #ffb347)", iconSvgUri: "" },
  { code: "TDM", name: "Tarkir: Dragonstorm", color: "linear-gradient(135deg, #00a896, #7dd3fc)", iconSvgUri: "" },
  { code: "FDN", name: "Foundations", color: "linear-gradient(135deg, #7c3aed, #c084fc)", iconSvgUri: "" },
  { code: "DSK", name: "Duskmourn", color: "linear-gradient(135deg, #ff5f6d, #7b2ff7)", iconSvgUri: "" },
  { code: "BLB", name: "Bloomburrow", color: "linear-gradient(135deg, #5fb65f, #dce35b)", iconSvgUri: "" },
  { code: "MH3", name: "Modern Horizons 3", color: "linear-gradient(135deg, #4facfe, #00f2fe)", iconSvgUri: "" }
];

const seededSetColors = new Map(seededSetCatalog.map(set => [set.code, set.color]));
const neutralSetColor = "linear-gradient(135deg, #64748b, #94a3b8)";

function getInitialSetCatalog() {
  const preloadedSetCatalog = typeof window !== "undefined" && Array.isArray(window.preloadedSetCatalog)
    ? window.preloadedSetCatalog
    : [];

  const source = preloadedSetCatalog.length ? preloadedSetCatalog : seededSetCatalog;
  return source.map(set => ({
    ...set,
    color: set.color || seededSetColors.get(set.code) || neutralSetColor
  }));
}

const setCatalog = getInitialSetCatalog();

const draftableSetTypes = new Set([
  "core",
  "expansion",
  "masters",
  "draft_innovation"
]);

let availableSetCatalog = [...setCatalog];
let manaSymbolCatalog = {};

const enhancedSelects = {
  set: null,
  deckColors: null
};

const manaSymbolFallbacks = {
  W: { label: "W", className: "white" },
  U: { label: "U", className: "blue" },
  B: { label: "B", className: "black" },
  R: { label: "R", className: "red" },
  G: { label: "G", className: "green" }
};

const colorGroups = [
  {
    label: "Mono",
    options: [
      { value: "W", label: "White" },
      { value: "U", label: "Blue" },
      { value: "B", label: "Black" },
      { value: "R", label: "Red" },
      { value: "G", label: "Green" }
    ]
  },
  {
    label: "Dual",
    options: [
      { value: "WU", label: "Azorius" },
      { value: "WB", label: "Orzhov" },
      { value: "WR", label: "Boros" },
      { value: "WG", label: "Selesnya" },
      { value: "UB", label: "Dimir" },
      { value: "UR", label: "Izzet" },
      { value: "UG", label: "Simic" },
      { value: "BR", label: "Rakdos" },
      { value: "BG", label: "Golgari" },
      { value: "RG", label: "Gruul" }
    ]
  },
  {
    label: "Tri",
    options: [
      { value: "WBG", label: "Abzan" },
      { value: "WUG", label: "Bant" },
      { value: "WUB", label: "Esper" },
      { value: "UBR", label: "Grixis" },
      { value: "WUR", label: "Jeskai" },
      { value: "BRG", label: "Jund" },
      { value: "WBR", label: "Mardu" },
      { value: "WRG", label: "Naya" },
      { value: "UBG", label: "Sultai" },
      { value: "URG", label: "Temur" }
    ]
  },
  {
    label: "Four Color",
    options: [
      { value: "UBRG", label: "4C No White" },
      { value: "WBRG", label: "4C No Blue" },
      { value: "WURG", label: "4C No Black" },
      { value: "WUBG", label: "4C No Red" },
      { value: "WUBR", label: "4C No Green" }
    ]
  },
  {
    label: "Five Color",
    options: [
      { value: "WUBRG", label: "Five-Color" }
    ]
  }
];

const archetypeOptions = [
  "Aggro",
  "Midrange",
  "Control",
  "Tempo",
  "Ramp",
  "Tribal",
  "Artifacts",
  "Enchantments",
  "Go-Wide",
  "Goodstuff",
  "Reanimator",
  "Tokens",
  "Sacrifice",
  "Spells"
];

const users = [
  { id: 1, name: "Alex" },
  { id: 2, name: "Berni" },
  { id: 3, name: "Dennis" },
  { id: 4, name: "Duc" },
  { id: 5, name: "Ersin" },
  { id: 6, name: "Jonas" },
  { id: 7, name: "Kevin Schweizer" },
  { id: 8, name: "Kevin Thies" },
  { id: 9, name: "Leo" },
  { id: 10, name: "Sergej" },
  { id: 11, name: "Steph" },
  { id: 12, name: "Tilman" }
];

const baseLocations = [
  "Fantasy Stronghold",
  "Sendepause",
  "unschlagBar"
];

const customLocations = [];
const customOpponents = [];

const events = [
  { id: 1, date: "2026-04-19", set: "TDM", index: 1, location: "Fantasy Stronghold" },
  { id: 2, date: "2026-04-19", set: "DFT", index: 1, location: "Sendepause" }
];

const eventPods = [];
const eventProfiles = [];
const matchEntries = [];

let currentDate = "";
let currentEventId = null;
let currentMatchBack = "screen-date";
let activeUserId = null;
let nextUserId = users.length + 1;
let nextEventId = events.length + 1;
let nextMatchId = 1;
let currentScore = "2-0";

const screens = {
  start: document.getElementById("screen-start"),
  date: document.getElementById("screen-date"),
  details: document.getElementById("screen-details"),
  match: document.getElementById("screen-match"),
  stats: document.getElementById("screen-stats")
};

const elements = {
  trackButton: document.getElementById("track-button"),
  statsButton: document.getElementById("stats-button"),
  activeUserSelect: document.getElementById("active-user-select"),
  newUserInput: document.getElementById("new-user-input"),
  createUserButton: document.getElementById("create-user-button"),
  userAlert: document.getElementById("user-alert"),
  dateInput: document.getElementById("event-date"),
  dateEventList: document.getElementById("date-event-list"),
  dateEventEmpty: document.getElementById("date-event-empty"),
  dateEventCount: document.getElementById("date-event-count"),
  createEventButton: document.getElementById("create-event-button"),
  selectedDatePill: document.getElementById("selected-date-pill"),
  duplicateAlert: document.getElementById("duplicate-alert"),
  eventForm: document.getElementById("event-form"),
  setSelect: document.getElementById("set-select"),
  locationSelect: document.getElementById("location-select"),
  podCountInput: document.getElementById("pod-count-input"),
  newLocationInput: document.getElementById("new-location-input"),
  createLocationButton: document.getElementById("create-location-button"),
  matchBackButton: document.getElementById("match-back-button"),
  currentEventBanner: document.getElementById("current-event-banner"),
  podSelect: document.getElementById("pod-select"),
  deckColorSelect: document.getElementById("deck-color-select"),
  archetypeSelect: document.getElementById("archetype-select"),
  matchAlert: document.getElementById("match-alert"),
  matchForm: document.getElementById("match-form"),
  opponentSelect: document.getElementById("opponent-select"),
  newOpponentInput: document.getElementById("new-opponent-input"),
  createOpponentButton: document.getElementById("create-opponent-button"),
  scoreRow: document.getElementById("score-row"),
  matchNotesInput: document.getElementById("match-notes-input"),
  saveMatchButton: document.getElementById("save-match-button"),
  statsBackButton: document.getElementById("stats-back-button"),
  statsSubtitle: document.getElementById("stats-subtitle"),
  statsOverviewGrid: document.getElementById("stats-overview-grid"),
  statsPersonal: document.getElementById("stats-personal"),
  statsLeaderboard: document.getElementById("stats-leaderboard"),
  statsHeadToHead: document.getElementById("stats-head-to-head"),
  statsRivalries: document.getElementById("stats-rivalries"),
  statsHistory: document.getElementById("stats-history")
};

function init() {
  populateSetSelect();
  populateUserSelect();
  populateLocationSelect();
  populateDeckColorSelect();
  populateArchetypeSelect();
  initializeEnhancedSelects();
  setDateInputToToday();
  syncDateView(elements.dateInput.value);
  loadSetCatalogFromScryfall();
  loadManaSymbolCatalogFromScryfall();

  [elements.activeUserSelect, elements.locationSelect, elements.podSelect, elements.archetypeSelect, elements.opponentSelect].forEach(wireSelectCaret);

  elements.trackButton.addEventListener("click", handleTrackStart);
  elements.statsButton.addEventListener("click", () => openStats("screen-start"));
  elements.activeUserSelect.addEventListener("change", handleActiveUserChange);
  elements.createUserButton.addEventListener("click", handleCreateUser);
  elements.newUserInput.addEventListener("keydown", handleEnterToCreateUser);
  elements.dateInput.addEventListener("focus", setDateInputToToday);
  elements.dateInput.addEventListener("input", () => syncDateView(elements.dateInput.value));
  elements.createEventButton.addEventListener("click", enterDetailsStep);
  elements.eventForm.addEventListener("submit", handleSaveEvent);
  elements.setSelect.addEventListener("change", () => {
    updateSetPreview();
    updatePotentialDuplicateNotice();
  });
  elements.createLocationButton.addEventListener("click", handleCreateLocation);
  elements.newLocationInput.addEventListener("keydown", handleEnterToCreateLocation);
  elements.createOpponentButton.addEventListener("click", handleCreateOpponent);
  elements.newOpponentInput.addEventListener("keydown", handleEnterToCreateOpponent);
  elements.podSelect.addEventListener("change", saveCurrentProfile);
  elements.deckColorSelect.addEventListener("change", saveCurrentProfile);
  elements.archetypeSelect.addEventListener("change", saveCurrentProfile);
  elements.matchForm.addEventListener("submit", handleSaveMatch);
  elements.scoreRow.addEventListener("click", handleScoreClick);

  elements.locationSelect.addEventListener("input", updatePotentialDuplicateNotice);

  document.querySelectorAll("[data-back]").forEach(button => {
    button.addEventListener("click", () => showScreenById(button.dataset.back));
  });

  updateScoreUi();
}

function initializeEnhancedSelects() {
  initializeSetSelectEnhancer();
  initializeDeckColorSelectEnhancer();
}

function initializeSetSelectEnhancer() {
  if (typeof TomSelect === "undefined" || !elements.setSelect) {
    return;
  }

  const selectedValue = elements.setSelect.value;
  if (enhancedSelects.set) {
    enhancedSelects.set.destroy();
  }

  enhancedSelects.set = new TomSelect(elements.setSelect, {
    maxItems: 1,
    allowEmptyOption: true,
    create: false,
    searchField: ["text", "code", "name"],
    render: {
      option: (data, escape) => {
        const setData = getSet(data.value) || {
          code: data.code || data.value || "",
          name: data.name || data.text || "",
          iconSvgUri: data.iconSvgUri || ""
        };

        return `
        <div class="rich-option rich-option-set">
          ${renderSetIcon(setData)}
          <div class="rich-option-copy">
            <div class="rich-option-title">${escape(setData.code || "")}</div>
            <div class="rich-option-subtitle">${escape(setData.name || "")}</div>
          </div>
        </div>
      `;
      },
      item: (data, escape) => {
        if (!data.value) {
          return `<div>${escape(data.text || "Choose...")}</div>`;
        }

        const setData = getSet(data.value) || {
          code: data.code || data.value || "",
          name: data.name || data.text || "",
          iconSvgUri: data.iconSvgUri || ""
        };

        return `
          <div class="rich-item rich-item-set">
            ${renderSetIcon(setData)}
            <span>${escape(setData.code || "")}</span>
          </div>
        `;
      }
    },
    onChange: value => {
      elements.setSelect.value = value;
      updateSetPreview();
      updatePotentialDuplicateNotice();
    }
  });

  enhancedSelects.set.wrapper.classList.add("required-rich-select");

  enhancedSelects.set.setValue(selectedValue || "", true);
}

function initializeDeckColorSelectEnhancer() {
  if (typeof TomSelect === "undefined" || !elements.deckColorSelect) {
    return;
  }

  const selectedValue = elements.deckColorSelect.value;
  if (enhancedSelects.deckColors) {
    enhancedSelects.deckColors.destroy();
  }

  enhancedSelects.deckColors = new TomSelect(elements.deckColorSelect, {
    maxItems: 1,
    allowEmptyOption: true,
    create: false,
    controlInput: null,
    searchField: ["text", "label", "manaCode"],
    dataAttr: "data-data",
    render: {
      option: (data, escape) => {
        if (!data.value) {
          return `<div>${escape(data.text || "Choose...")}</div>`;
        }

        return `
          <div class="rich-option rich-option-colors">
            <div class="mana-symbol-stack">${renderManaSymbols(data.manaCode || data.value)}</div>
            <div class="rich-option-copy">
              <div class="rich-option-title">${escape(data.groupLabel || "")}</div>
              <div class="rich-option-subtitle">${escape(data.label || data.text || "")}</div>
            </div>
          </div>
        `;
      },
      item: data => {
        if (!data.value) {
          return `<div>Choose...</div>`;
        }

        return `
          <div class="rich-item rich-item-colors">
            <span class="mana-symbol-stack">${renderManaSymbols(data.manaCode || data.value)}</span>
            <span class="rich-item-label">${escapeHtml(data.label || data.text || "")}</span>
          </div>
        `;
      }
    },
    onChange: value => {
      elements.deckColorSelect.value = value;
      saveCurrentProfile();
    }
  });

  enhancedSelects.deckColors.setValue(selectedValue || "", true);
}

function renderSetIcon(data) {
  if (!data.iconSvgUri) {
    return '<span class="set-symbol-fallback" aria-hidden="true">?</span>';
  }

  return `<img class="set-symbol" src="${escapeHtml(data.iconSvgUri)}" alt="" aria-hidden="true">`;
}

function renderManaSymbols(value) {
  return String(value)
    .split("")
    .map(colorCode => renderSingleManaSymbol(colorCode))
    .join("");
}

function renderSingleManaSymbol(colorCode) {
  const symbol = manaSymbolCatalog[colorCode];
  if (symbol?.svgUri) {
    return `<img class="mana-symbol" src="${escapeHtml(symbol.svgUri)}" alt="${escapeHtml(symbol.label)}" title="${escapeHtml(symbol.label)}">`;
  }

  const fallback = manaSymbolFallbacks[colorCode] || { label: colorCode, className: "generic" };
  return `<span class="mana-pip ${fallback.className}" title="${escapeHtml(fallback.label)}">${escapeHtml(fallback.label)}</span>`;
}

function handleTrackStart() {
  if (!activeUserId) {
    showUserAlert("Select a user first.");
    return;
  }

  setDateInputToToday();
  syncDateView(elements.dateInput.value);
  showScreen("date");
  elements.dateInput.focus();
}

function handleActiveUserChange() {
  activeUserId = Number(elements.activeUserSelect.value) || null;
  elements.userAlert.classList.add("d-none");

  if (screens.match.classList.contains("active")) {
    populateOpponentSelect(elements.opponentSelect.value);
    renderCurrentEventBanner();
  }
}

function handleCreateUser() {
  const trimmedName = elements.newUserInput.value.trim();
  if (!trimmedName) {
    showUserAlert("Enter a user name before creating one.");
    return;
  }

  const exists = users.some(user => normalize(user.name) === normalize(trimmedName));
  if (exists) {
    showUserAlert("That user already exists. Select them from the dropdown.");
    return;
  }

  users.push({ id: nextUserId++, name: trimmedName });
  users.sort((left, right) => left.name.localeCompare(right.name));
  activeUserId = users.find(user => user.name === trimmedName)?.id ?? activeUserId;
  populateUserSelect();
  populateLocationSelect(elements.locationSelect.value);
  populateOpponentSelect(elements.opponentSelect?.value || "");
  elements.newUserInput.value = "";
  elements.userAlert.classList.add("d-none");
}

function handleEnterToCreateUser(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleCreateUser();
  }
}

function handleCreateLocation() {
  const trimmedLocation = elements.newLocationInput.value.trim();
  if (!trimmedLocation) {
    showDuplicateAlert("Enter a location name before creating one.");
    return;
  }

  const existingLocation = getLocationOptions().find(location => normalize(location) === normalize(trimmedLocation));
  if (existingLocation) {
    populateLocationSelect(existingLocation);
    elements.newLocationInput.value = "";
    updatePotentialDuplicateNotice();
    return;
  }

  customLocations.push(trimmedLocation);
  populateLocationSelect(trimmedLocation);
  elements.newLocationInput.value = "";
  updatePotentialDuplicateNotice();
}

function handleCreateOpponent() {
  const trimmedOpponent = elements.newOpponentInput.value.trim();
  if (!trimmedOpponent) {
    showMatchAlert("Enter an opponent name before adding one.");
    return;
  }

  const trackedOpponent = users.find(user => normalize(user.name) === normalize(trimmedOpponent));
  if (trackedOpponent) {
    populateOpponentSelect(`user:${trackedOpponent.id}`);
    elements.newOpponentInput.value = "";
    hideMatchAlert();
    return;
  }

  const existingOpponent = customOpponents.find(name => normalize(name) === normalize(trimmedOpponent));
  if (!existingOpponent) {
    customOpponents.push(trimmedOpponent);
  }

  const selectedName = existingOpponent || trimmedOpponent;
  populateOpponentSelect(`named:${selectedName}`);
  elements.newOpponentInput.value = "";
  hideMatchAlert();
}

function handleEnterToCreateLocation(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleCreateLocation();
  }
}

function handleEnterToCreateOpponent(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleCreateOpponent();
  }
}

function handleScoreClick(event) {
  const target = event.target.closest("[data-score]");
  if (!target) {
    return;
  }

  currentScore = target.dataset.score;
  updateScoreUi();
}

function handleSaveEvent(event) {
  event.preventDefault();

  const date = currentDate || elements.dateInput.value;
  const set = elements.setSelect.value;
  const location = elements.locationSelect.value.trim();
  const podCount = Number(elements.podCountInput.value);

  if (!date || !set || !location || !Number.isInteger(podCount) || podCount < 1) {
    showDuplicateAlert("Set, location, and a valid pod count are required.");
    return;
  }

  const matchingEvents = getMatchingEvents(date, set, location);
  const nextIndex = getNextIndex(date, set, location);
  if (matchingEvents.length) {
    const confirmation = window.confirm(
      `An event with the same date, set, and location already exists. If you continue, you will create Event ${nextIndex}.`
    );

    if (!confirmation) {
      updatePotentialDuplicateNotice();
      return;
    }
  }

  const createdEvent = {
    id: nextEventId++,
    date,
    set,
    index: nextIndex,
    location,
    podCount
  };

  events.push(createdEvent);
  currentEventId = createdEvent.id;
  currentMatchBack = "screen-details";
  elements.matchBackButton.dataset.back = currentMatchBack;
  seedPodsForEvent(currentEventId, podCount);
  syncDateView(date);
  renderMatchScreen();
  showScreen("match");
}

function handleSaveMatch(event) {
  event.preventDefault();
  if (!currentEventId || !activeUserId) {
    return;
  }

  hideMatchAlert();
  saveCurrentProfile();

  const opponent = getOpponentPayload();
  if (!opponent) {
    return;
  }

  const selectedPod = elements.podSelect.value;
  if (!selectedPod) {
    showMatchAlert("Select a pod before saving.");
    return;
  }

  const score = currentScore;
  if (!score) {
    showMatchAlert("Select a score before saving.");
    return;
  }

  const result = inferResultFromScore(score);
  const round = getNextRoundSuggestion();

  const profile = getOrCreateEventProfile(currentEventId, activeUserId);

  const payload = {
    eventId: currentEventId,
    userId: activeUserId,
    round,
    pod: profile.pod,
    deckColors: profile.deckColors,
    archetype: profile.archetype,
    opponentKind: opponent.kind,
    opponentUserId: opponent.userId,
    opponentName: opponent.name,
    result,
    score,
    notes: elements.matchNotesInput.value.trim()
  };

  matchEntries.push({
    id: nextMatchId++,
    ...payload
  });

  renderCurrentEventBanner();
  resetMatchForm();
}

function getOpponentPayload() {
  const selectedOpponent = elements.opponentSelect.value;
  if (!selectedOpponent) {
    showMatchAlert("Select an opponent before saving.");
    return null;
  }

  if (selectedOpponent === "npc") {
    return {
      kind: "unknown",
      userId: null,
      name: "NPC Opponent"
    };
  }

  if (selectedOpponent.startsWith("user:")) {
    const opponentUserId = Number(selectedOpponent.slice(5));
    if (opponentUserId === activeUserId) {
      showMatchAlert("You cannot log yourself as the opponent.");
      return null;
    }

    return {
      kind: "tracked",
      userId: opponentUserId,
      name: getUserName(opponentUserId)
    };
  }

  const namedOpponent = selectedOpponent.startsWith("named:") ? selectedOpponent.slice(6) : selectedOpponent;
  return {
    kind: "named",
    userId: null,
    name: namedOpponent
  };
}

function resetMatchForm() {
  currentScore = "2-0";
  populateOpponentSelect("npc");
  elements.newOpponentInput.value = "";
  elements.matchNotesInput.value = "";
  updateScoreUi();
  elements.saveMatchButton.textContent = "Save match";
  hideMatchAlert();
}

function populateSetSelect() {
  const selectedValue = elements.setSelect.value;
  elements.setSelect.innerHTML = '<option value="">Choose...</option>';
  availableSetCatalog.forEach(set => {
    const option = document.createElement("option");
    option.value = set.code;
    option.textContent = `${set.code} - ${set.name}`;
    option.dataset.data = JSON.stringify({
      code: set.code,
      name: set.name,
      iconSvgUri: set.iconSvgUri || "",
      text: `${set.code} - ${set.name}`
    });
    elements.setSelect.appendChild(option);
  });

  if (selectedValue && availableSetCatalog.some(set => set.code === selectedValue)) {
    elements.setSelect.value = selectedValue;
  }

  if (enhancedSelects.set) {
    initializeSetSelectEnhancer();
  }

  updateSetPreview();
}

function populateUserSelect() {
  elements.activeUserSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select user...";
  elements.activeUserSelect.appendChild(placeholder);

  users.forEach(user => {
    const option = document.createElement("option");
    option.value = String(user.id);
    option.textContent = user.name;
    elements.activeUserSelect.appendChild(option);
  });

  elements.activeUserSelect.value = activeUserId ? String(activeUserId) : "";
}

function populateLocationSelect(selectedLocation = "") {
  elements.locationSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select location...";
  elements.locationSelect.appendChild(placeholder);

  getLocationOptions().forEach(location => {
    const option = document.createElement("option");
    option.value = location;
    option.textContent = location;
    elements.locationSelect.appendChild(option);
  });

  elements.locationSelect.value = selectedLocation || "";
}

function populatePodSelect(selectedPod = "Pod 1") {
  if (!currentEventId) {
    elements.podSelect.innerHTML = "";
    return;
  }

  ensureDefaultPod(currentEventId);
  const availablePods = getPodsForEvent(currentEventId);
  const podWrapper = elements.podSelect.closest(".select-wrap");
  elements.podSelect.innerHTML = "";
  availablePods.forEach(label => {
    const option = document.createElement("option");
    option.value = label;
    option.textContent = formatPodShortLabel(label);
    elements.podSelect.appendChild(option);
  });

  elements.podSelect.value = availablePods.includes(selectedPod) ? selectedPod : availablePods[0];
  const hasMultiplePods = availablePods.length > 1;
  elements.podSelect.disabled = false;
  elements.podSelect.classList.toggle("has-caret", hasMultiplePods);
  elements.podSelect.tabIndex = hasMultiplePods ? 0 : -1;
  elements.podSelect.setAttribute("aria-disabled", String(!hasMultiplePods));
  if (podWrapper) {
    podWrapper.classList.toggle("no-caret", !hasMultiplePods);
    podWrapper.classList.toggle("locked-select", !hasMultiplePods);
  }
}

function populateDeckColorSelect(selectedValue = "") {
  elements.deckColorSelect.innerHTML = '<option value="">Choose...</option>';
  colorGroups.forEach(group => {
    const optgroup = document.createElement("optgroup");
    optgroup.label = group.label;
    group.options.forEach(optionData => {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      option.dataset.data = JSON.stringify({
        label: optionData.label,
        manaCode: optionData.value,
        groupLabel: group.label,
        text: optionData.label
      });
      optgroup.appendChild(option);
    });
    elements.deckColorSelect.appendChild(optgroup);
  });
  elements.deckColorSelect.value = selectedValue || "";

  if (enhancedSelects.deckColors) {
    initializeDeckColorSelectEnhancer();
  }
}

function populateArchetypeSelect(selectedValue = "") {
  elements.archetypeSelect.innerHTML = '<option value="">Choose...</option>';
  archetypeOptions.forEach(archetype => {
    const option = document.createElement("option");
    option.value = archetype;
    option.textContent = archetype;
    elements.archetypeSelect.appendChild(option);
  });
  elements.archetypeSelect.value = selectedValue || "";
}

function populateOpponentSelect(selectedValue = "") {
  if (!elements.opponentSelect) {
    return;
  }

  elements.opponentSelect.innerHTML = "";

  const unknownOption = document.createElement("option");
  unknownOption.value = "npc";
  unknownOption.textContent = "NPC opponent";
  elements.opponentSelect.appendChild(unknownOption);

  users
    .filter(user => user.id !== activeUserId)
    .forEach(user => {
      const option = document.createElement("option");
      option.value = `user:${user.id}`;
      option.textContent = user.name;
      elements.opponentSelect.appendChild(option);
    });

  [...customOpponents]
    .sort((left, right) => left.localeCompare(right))
    .forEach(name => {
      const option = document.createElement("option");
      option.value = `named:${name}`;
      option.textContent = name;
      elements.opponentSelect.appendChild(option);
    });

  const optionValues = [...elements.opponentSelect.options].map(option => option.value);
  elements.opponentSelect.value = optionValues.includes(selectedValue) ? selectedValue : "npc";
}

function wireSelectCaret(selectElement) {
  if (!selectElement) {
    return;
  }

  selectElement.addEventListener("change", () => setSelectOpen(selectElement, false));
  selectElement.addEventListener("focus", () => setSelectOpen(selectElement, true));
  selectElement.addEventListener("blur", () => setSelectOpen(selectElement, false));
  selectElement.addEventListener("pointerdown", () => handleSelectPointerDown(selectElement));
}

function handleSelectPointerDown(selectElement) {
  const nextState = document.activeElement === selectElement ? !getSelectOpen(selectElement) : true;
  setSelectOpen(selectElement, nextState);
}

function setSelectOpen(selectElement, isOpen) {
  selectElement.dataset.open = isOpen ? "true" : "false";
  const wrapper = selectElement.closest(".select-wrap");
  if (wrapper) {
    wrapper.classList.toggle("open", isOpen);
  }
}

function getSelectOpen(selectElement) {
  return selectElement.dataset.open === "true";
}

function showScreen(name) {
  Object.values(screens).forEach(screen => screen.classList.remove("active"));
  screens[name].classList.add("active");
}

function showScreenById(id) {
  Object.values(screens).forEach(screen => screen.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function syncDateView(date) {
  currentDate = date;
  renderDateEvents(date);
}

function renderDateEvents(date) {
  const dayEvents = getEventsOnDate(date);
  elements.dateEventList.innerHTML = "";
  elements.dateEventCount.textContent = `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`;
  elements.dateEventEmpty.classList.toggle("d-none", dayEvents.length > 0);

  dayEvents.forEach(event => {
    const set = getSet(event.set);
    const wrapper = document.createElement("article");
    wrapper.className = "event-option";

    const button = document.createElement("button");
    button.type = "button";
    button.innerHTML = `
      <div class="list-title-row">
        <div>
          <div class="fw-bold">${formatCompactEventLabel(event)}</div>
          <div class="small text-secondary mt-1">${set ? set.name : event.set}</div>
        </div>
        <div class="set-badge" style="background:${set ? set.color : "linear-gradient(135deg, #64748b, #94a3b8)"}">${event.set}</div>
      </div>
      <div class="event-meta">
        <span class="meta-pill">${event.location}</span>
      </div>
    `;

    button.addEventListener("click", () => chooseExistingEvent(event.id));
    wrapper.appendChild(button);
    elements.dateEventList.appendChild(wrapper);
  });
}

function enterDetailsStep() {
  if (!elements.dateInput.value) {
    elements.dateInput.focus();
    return;
  }

  currentDate = elements.dateInput.value;
  elements.selectedDatePill.textContent = formatDate(currentDate);
  resetEventForm();
  updatePotentialDuplicateNotice();
  showScreen("details");
}

function resetEventForm() {
  if (enhancedSelects.set) {
    enhancedSelects.set.setValue("", true);
  } else {
    elements.setSelect.value = "";
  }
  populateLocationSelect();
  elements.podCountInput.value = "1";
  elements.newLocationInput.value = "";
  updateSetPreview();
  hideDuplicateAlert();
}

function chooseExistingEvent(eventId) {
  currentEventId = eventId;
  currentMatchBack = "screen-date";
  elements.matchBackButton.dataset.back = currentMatchBack;
  renderMatchScreen();
  showScreen("match");
}

function renderMatchScreen() {
  const event = getCurrentEvent();
  if (!event || !activeUserId) {
    return;
  }

  ensureDefaultPod(event.id);
  const profile = getOrCreateEventProfile(event.id, activeUserId);
  populatePodSelect(profile.pod);
  populateDeckColorSelect(profile.deckColors);
  populateArchetypeSelect(profile.archetype);
  populateOpponentSelect();
  renderCurrentEventBanner();
  resetMatchForm();
}

function saveCurrentProfile() {
  if (!currentEventId || !activeUserId) {
    return;
  }

  const profile = getOrCreateEventProfile(currentEventId, activeUserId);
  profile.pod = elements.podSelect.value || "Pod 1";
  profile.deckColors = elements.deckColorSelect.value;
  profile.archetype = elements.archetypeSelect.value;
}

function renderCurrentEventBanner() {
  const event = getCurrentEvent();
  if (!event || !activeUserId) {
    return;
  }

  const set = getSet(event.set);
  const duplicateSeries = getMatchingEvents(event.date, event.set, event.location).length > 1;
  const podLabels = getPodsForEvent(event.id);

  elements.currentEventBanner.innerHTML = `
    <div class="compact-banner">
      <div class="compact-banner-title">${event.set}${set ? ` - ${set.name}` : ""}${duplicateSeries ? ` - Event ${event.index}` : ""}</div>
      <div class="event-meta compact-banner-meta">
        <span class="meta-pill">${getActiveUserName()}</span>
        <span class="meta-pill">${formatDate(event.date)}</span>
        <span class="meta-pill">${event.location}</span>
        <span class="meta-pill">${podLabels.length} pod${podLabels.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  `;
}

function updateScoreUi() {
  elements.scoreRow.querySelectorAll("[data-score]").forEach(button => {
    button.classList.toggle("active", button.dataset.score === currentScore);
  });
}

function openStats(backId) {
  if (!activeUserId) {
    showUserAlert("Select a user first.");
    return;
  }

  elements.statsBackButton.dataset.back = backId;
  renderStats();
  showScreen("stats");
}

function renderStats() {
  const personalEntries = matchEntries.filter(entry => entry.userId === activeUserId);
  const canonicalFriendMatches = buildCanonicalFriendMatches();
  const activeUsersWithMatches = users.filter(user => matchEntries.some(entry => entry.userId === user.id));
  const eventIdsWithMatches = [...new Set(matchEntries.map(entry => entry.eventId))];
  const mostPlayedSet = getMostPlayedSet();

  elements.statsSubtitle.textContent = `All-time numbers for the group and personal stats for ${getActiveUserName()}.`;
  elements.statsOverviewGrid.innerHTML = [
    createStatTile(matchEntries.length, "matches logged"),
    createStatTile(eventIdsWithMatches.length, "events with data"),
    createStatTile(canonicalFriendMatches.length, "friend matchups"),
    createStatTile(mostPlayedSet || "-", "most played set")
  ].join("");

  renderPersonalStats(personalEntries);
  renderLeaderboardStats(activeUsersWithMatches);
  renderHeadToHeadStats(canonicalFriendMatches);
  renderRivalryStats(canonicalFriendMatches);
  renderPersonalHistory(personalEntries);
}

function renderPersonalStats(personalEntries) {
  if (!personalEntries.length) {
    elements.statsPersonal.innerHTML = '<div class="empty-state">No personal matches logged yet for this user.</div>';
    return;
  }

  const overall = computeEntryStats(personalEntries);
  const friendOnly = computeEntryStats(personalEntries.filter(entry => entry.opponentKind === "tracked"));
  const profileSummary = getProfileSummary(activeUserId);

  elements.statsPersonal.innerHTML = `
    ${createListCard("Overall", `${overall.wins}-${overall.losses}-${overall.draws} match record`, [
      `Match win rate: ${formatPercent(overall.matchWinRate)}`,
      `Game win rate: ${formatPercent(overall.gameWinRate)}`,
      `Matches logged: ${overall.matches}`
    ])}
    ${createListCard("Friend-only", `${friendOnly.wins}-${friendOnly.losses}-${friendOnly.draws} vs tracked friends`, [
      `Friend-only win rate: ${formatPercent(friendOnly.matchWinRate)}`,
      `Friend-only game win rate: ${formatPercent(friendOnly.gameWinRate)}`,
      `Tracked matches: ${friendOnly.matches}`
    ])}
    ${createListCard("Deck trends", profileSummary.primary, [
      `Top colors: ${profileSummary.colors}`,
      `Top archetype: ${profileSummary.archetype}`,
      `Events logged: ${profileSummary.events}`
    ])}
  `;
}

function renderLeaderboardStats(activeUsersWithMatches) {
  if (!activeUsersWithMatches.length) {
    elements.statsLeaderboard.innerHTML = '<div class="empty-state">No group data yet. Log some matches first.</div>';
    return;
  }

  const rows = activeUsersWithMatches
    .map(user => {
      const allStats = computeEntryStats(matchEntries.filter(entry => entry.userId === user.id));
      const friendStats = computeEntryStats(matchEntries.filter(entry => entry.userId === user.id && entry.opponentKind === "tracked"));
      return { user, allStats, friendStats };
    })
    .sort((left, right) => {
      if (right.friendStats.matchWinRate !== left.friendStats.matchWinRate) {
        return right.friendStats.matchWinRate - left.friendStats.matchWinRate;
      }
      return right.allStats.matchWinRate - left.allStats.matchWinRate;
    });

  elements.statsLeaderboard.innerHTML = rows.map(({ user, allStats, friendStats }, index) =>
    createListCard(
      `#${index + 1} ${user.name}`,
      `${allStats.wins}-${allStats.losses}-${allStats.draws} overall`,
      [
        `Overall win rate: ${formatPercent(allStats.matchWinRate)}`,
        `Friend-only win rate: ${formatPercent(friendStats.matchWinRate)}`,
        `Logged matches: ${allStats.matches}`
      ]
    )
  ).join("");
}

function renderHeadToHeadStats(canonicalFriendMatches) {
  const rows = users
    .filter(user => user.id !== activeUserId)
    .map(user => {
      const matches = canonicalFriendMatches.filter(match =>
        (match.playerAId === activeUserId && match.playerBId === user.id) ||
        (match.playerBId === activeUserId && match.playerAId === user.id)
      );

      if (!matches.length) {
        return null;
      }

      let wins = 0;
      let losses = 0;
      let draws = 0;
      let gamesWon = 0;
      let gamesLost = 0;

      matches.forEach(match => {
        if (match.winnerId === activeUserId) {
          wins += 1;
        } else if (match.winnerId === user.id) {
          losses += 1;
        } else {
          draws += 1;
        }

        if (match.playerAId === activeUserId) {
          gamesWon += match.gamesA;
          gamesLost += match.gamesB;
        } else {
          gamesWon += match.gamesB;
          gamesLost += match.gamesA;
        }
      });

      return {
        user,
        matches: matches.length,
        wins,
        losses,
        draws,
        gameWinRate: calculateRate(gamesWon, gamesWon + gamesLost)
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.matches - left.matches || right.wins - left.wins);

  if (!rows.length) {
    elements.statsHeadToHead.innerHTML = '<div class="empty-state">No tracked head-to-head matches yet.</div>';
    return;
  }

  elements.statsHeadToHead.innerHTML = rows.map(row =>
    createListCard(
      row.user.name,
      `${row.wins}-${row.losses}-${row.draws}`,
      [
        `Meetings: ${row.matches}`,
        `Game win rate: ${formatPercent(row.gameWinRate)}`,
        `Series edge: ${row.wins > row.losses ? "Ahead" : row.wins < row.losses ? "Behind" : "Even"}`
      ]
    )
  ).join("");
}

function renderRivalryStats(canonicalFriendMatches) {
  if (!canonicalFriendMatches.length) {
    elements.statsRivalries.innerHTML = '<div class="empty-state">No friend-vs-friend rivalry data yet.</div>';
    return;
  }

  const rivalries = new Map();
  canonicalFriendMatches.forEach(match => {
    const key = `${match.playerAId}-${match.playerBId}`;
    if (!rivalries.has(key)) {
      rivalries.set(key, {
        playerAId: match.playerAId,
        playerBId: match.playerBId,
        meetings: 0,
        winsA: 0,
        winsB: 0,
        draws: 0
      });
    }

    const record = rivalries.get(key);
    record.meetings += 1;
    if (match.winnerId === match.playerAId) {
      record.winsA += 1;
    } else if (match.winnerId === match.playerBId) {
      record.winsB += 1;
    } else {
      record.draws += 1;
    }
  });

  const rows = [...rivalries.values()]
    .sort((left, right) =>
      right.meetings - left.meetings ||
      Math.abs(left.winsA - left.winsB) - Math.abs(right.winsA - right.winsB)
    )
    .slice(0, 8);

  elements.statsRivalries.innerHTML = rows.map(row =>
    createListCard(
      `${getUserName(row.playerAId)} vs ${getUserName(row.playerBId)}`,
      `${row.winsA}-${row.winsB}-${row.draws}`,
      [
        `Meetings: ${row.meetings}`,
        `Most recent shape: ${Math.abs(row.winsA - row.winsB) <= 1 ? "Close rivalry" : "One-sided streak"}`,
        `Friends only: yes`
      ]
    )
  ).join("");
}

function renderPersonalHistory(personalEntries) {
  if (!personalEntries.length) {
    elements.statsHistory.innerHTML = '<div class="empty-state">No event history yet for this user.</div>';
    return;
  }

  const grouped = new Map();
  personalEntries.forEach(entry => {
    if (!grouped.has(entry.eventId)) {
      grouped.set(entry.eventId, []);
    }
    grouped.get(entry.eventId).push(entry);
  });

  const rows = [...grouped.entries()]
    .map(([eventId, entries]) => {
      const event = events.find(item => item.id === eventId);
      const profile = eventProfiles.find(item => item.eventId === eventId && item.userId === activeUserId);
      const stats = computeEntryStats(entries);
      return { event, profile, stats };
    })
    .filter(row => row.event)
    .sort((left, right) => right.event.date.localeCompare(left.event.date));

  elements.statsHistory.innerHTML = rows.map(({ event, profile, stats }) =>
    createListCard(
        `${formatDate(event.date)} - ${formatCompactEventLabel(event)}`,
        `${stats.wins}-${stats.losses}-${stats.draws}`,
      [
        `Pod: ${profile?.pod || "Pod 1"}`,
        `Deck: ${getDeckColorLabel(profile?.deckColors)} / ${profile?.archetype || "No archetype"}`,
        `Matches logged: ${stats.matches}`
      ]
    )
  ).join("");
}

function buildCanonicalFriendMatches() {
  const map = new Map();
  matchEntries
    .filter(entry => entry.opponentKind === "tracked" && entry.opponentUserId)
    .forEach(entry => {
      const playerAId = Math.min(entry.userId, entry.opponentUserId);
      const playerBId = Math.max(entry.userId, entry.opponentUserId);
      const key = `${entry.eventId}|${entry.round}|${playerAId}|${playerBId}`;
      if (map.has(key)) {
        return;
      }

      const parsedScore = parseScore(entry.score);
      const isPlayerAReporter = entry.userId === playerAId;
      map.set(key, {
        eventId: entry.eventId,
        round: entry.round,
        playerAId,
        playerBId,
        winnerId: entry.result === "draw" ? null : entry.result === "win" ? entry.userId : entry.opponentUserId,
        gamesA: isPlayerAReporter ? parsedScore.won : parsedScore.lost,
        gamesB: isPlayerAReporter ? parsedScore.lost : parsedScore.won
      });
    });

  return [...map.values()];
}

function computeEntryStats(entries) {
  const wins = entries.filter(entry => entry.result === "win").length;
  const losses = entries.filter(entry => entry.result === "loss").length;
  const draws = entries.filter(entry => entry.result === "draw").length;
  const gameTotals = entries.reduce((totals, entry) => {
    const parsed = parseScore(entry.score);
    return {
      won: totals.won + parsed.won,
      lost: totals.lost + parsed.lost
    };
  }, { won: 0, lost: 0 });

  const matches = entries.length;
  return {
    matches,
    wins,
    losses,
    draws,
    matchWinRate: calculateRate(wins, matches),
    gameWinRate: calculateRate(gameTotals.won, gameTotals.won + gameTotals.lost)
  };
}

function getProfileSummary(userId) {
  const profiles = eventProfiles.filter(profile => profile.userId === userId);
  if (!profiles.length) {
    return {
      primary: "No deck profile data yet",
      colors: "Not logged",
      archetype: "Not logged",
      events: 0
    };
  }

  return {
    primary: `${profiles.length} event profile${profiles.length === 1 ? "" : "s"} logged`,
    colors: mostCommonLabel(profiles.map(profile => getDeckColorLabel(profile.deckColors)).filter(label => label !== "Not logged")) || "Not logged",
    archetype: mostCommonLabel(profiles.map(profile => profile.archetype).filter(Boolean)) || "Not logged",
    events: profiles.length
  };
}

function createStatTile(value, label) {
  return `<div class="stat-tile"><strong>${value}</strong><span>${label}</span></div>`;
}

function createListCard(title, subtitle, rows) {
  return `
    <article class="list-card">
      <div class="fw-bold">${title}</div>
      <div class="small text-secondary mt-1">${subtitle}</div>
      <div class="match-meta">
        ${rows.map(row => `<span class="meta-pill">${row}</span>`).join("")}
      </div>
    </article>
  `;
}

function removeMatch(matchId) {
  const index = matchEntries.findIndex(entry => entry.id === matchId);
  if (index !== -1) {
    matchEntries.splice(index, 1);
  }
}

function getMatchesForCurrentPlayerEvent() {
  return matchEntries
    .filter(entry => entry.eventId === currentEventId && entry.userId === activeUserId)
    .sort((left, right) => left.round - right.round);
}

function getNextRoundSuggestion(increment = true) {
  const eventMatches = getMatchesForCurrentPlayerEvent();
  if (!eventMatches.length) {
    return 1;
  }

  const highestRound = Math.max(...eventMatches.map(entry => entry.round));
  return increment ? highestRound + 1 : highestRound;
}

function getEventsOnDate(date) {
  return events
    .filter(event => event.date === date)
    .sort((left, right) => left.index - right.index || left.set.localeCompare(right.set));
}

function getMatchingEvents(date, set, location) {
  return events
    .filter(event =>
      event.date === date &&
      event.set === set &&
      normalize(event.location) === normalize(location)
    )
    .sort((left, right) => left.index - right.index);
}

function getNextIndex(date, set, location) {
  const matchingEvents = getMatchingEvents(date, set, location);
  return matchingEvents.length
    ? Math.max(...matchingEvents.map(event => event.index)) + 1
    : 1;
}

function getLocationOptions() {
  const homeLocations = [...users]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(user => `${user.name}'s Home`);

  const merged = [...baseLocations, ...homeLocations, ...customLocations];
  return dedupeStrings(merged);
}

function getPodsForEvent(eventId) {
  ensureDefaultPod(eventId);
  return eventPods
    .filter(entry => entry.eventId === eventId)
    .map(entry => entry.label)
    .sort((left, right) => extractPodNumber(left) - extractPodNumber(right) || left.localeCompare(right));
}

function ensureDefaultPod(eventId) {
  const hasPod = eventPods.some(entry => entry.eventId === eventId);
  if (!hasPod) {
    eventPods.push({ eventId, label: "Pod 1" });
  }
}

function seedPodsForEvent(eventId, podCount) {
  const existingPods = eventPods.filter(entry => entry.eventId === eventId);
  if (existingPods.length) {
    return;
  }

  for (let index = 0; index < podCount; index += 1) {
    eventPods.push({ eventId, label: `Pod ${index + 1}` });
  }
}

function getOrCreateEventProfile(eventId, userId) {
  let profile = eventProfiles.find(entry => entry.eventId === eventId && entry.userId === userId);
  if (!profile) {
    ensureDefaultPod(eventId);
    profile = {
      eventId,
      userId,
      pod: "Pod 1",
      deckColors: "",
      archetype: ""
    };
    eventProfiles.push(profile);
  }
  return profile;
}

function getCurrentEvent() {
  return events.find(event => event.id === currentEventId) || null;
}

function getSet(code) {
  return availableSetCatalog.find(set => set.code === code) || setCatalog.find(set => set.code === code);
}

function updateSetPreview() {
  return getSet(elements.setSelect.value);
}

async function loadSetCatalogFromScryfall() {
  try {
    const response = await fetch("https://api.scryfall.com/sets", {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (!payload?.data || !Array.isArray(payload.data)) {
      return;
    }

    const seededColors = new Map(setCatalog.map(set => [set.code, set.color]));
    availableSetCatalog = payload.data
      .filter(set => draftableSetTypes.has(set.set_type))
      .filter(set => set.code && set.name && set.released_at)
      .sort((left, right) => right.released_at.localeCompare(left.released_at))
      .map(set => ({
        code: String(set.code).toUpperCase(),
        name: set.name,
        releasedAt: set.released_at,
        setType: set.set_type,
        color: seededColors.get(String(set.code).toUpperCase()) || neutralSetColor,
        iconSvgUri: set.icon_svg_uri || ""
      }));

    if (!availableSetCatalog.length) {
      availableSetCatalog = [...setCatalog];
    }

    populateSetSelect();
  } catch {
    availableSetCatalog = [...setCatalog];
    populateSetSelect();
  }
}

async function loadManaSymbolCatalogFromScryfall() {
  try {
    const response = await fetch("https://api.scryfall.com/symbology", {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      return;
    }

    const payload = await response.json();
    if (!payload?.data || !Array.isArray(payload.data)) {
      return;
    }

    manaSymbolCatalog = payload.data.reduce((catalog, symbol) => {
      const normalizedSymbol = String(symbol.symbol || "").replace(/[{}]/g, "");
      if (manaSymbolFallbacks[normalizedSymbol] && symbol.svg_uri) {
        catalog[normalizedSymbol] = {
          label: normalizedSymbol,
          svgUri: symbol.svg_uri
        };
      }
      return catalog;
    }, {});

    if (enhancedSelects.deckColors) {
      initializeDeckColorSelectEnhancer();
    }
  } catch {
    manaSymbolCatalog = {};
  }
}

function getUserName(userId) {
  return users.find(user => user.id === userId)?.name ?? "Unknown User";
}

function getActiveUserName() {
  return activeUserId ? getUserName(activeUserId) : "Unknown";
}

function getOpponentDisplayName(match) {
  if (match.opponentKind === "tracked") {
    return getUserName(match.opponentUserId);
  }
  return match.opponentName || "NPC Opponent";
}

function getDeckColorLabel(value) {
  if (!value) {
    return "Not logged";
  }

  for (const group of colorGroups) {
    const option = group.options.find(item => item.value === value);
    if (option) {
      return option.label;
    }
  }

  return value;
}

function getMostPlayedSet() {
  if (!matchEntries.length) {
    return "";
  }

  const counts = new Map();
  matchEntries.forEach(entry => {
    const event = events.find(item => item.id === entry.eventId);
    if (!event) {
      return;
    }

    counts.set(event.set, (counts.get(event.set) || 0) + 1);
  });

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "";
}

function formatCompactEventLabel(event) {
  const matchingEvents = getMatchingEvents(event.date, event.set, event.location);
  const needsIndex = matchingEvents.length > 1;
  return `${event.set} - ${event.location}${needsIndex ? ` - Event ${event.index}` : ""}`;
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(date);
}

function extractPodNumber(label) {
  const match = String(label).match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function formatPodShortLabel(label) {
  const number = extractPodNumber(label);
  return Number.isFinite(number) && number !== Number.MAX_SAFE_INTEGER ? String(number) : label;
}

function parseScore(score) {
  const parts = score.split("-").map(part => Number(part));
  return {
    won: parts[0] || 0,
    lost: parts[1] || 0
  };
}

function inferResultFromScore(score) {
  if (score === "1-1-1") {
    return "draw";
  }

  const parsed = parseScore(score);
  if (parsed.won > parsed.lost) {
    return "win";
  }

  if (parsed.won < parsed.lost) {
    return "loss";
  }

  return "draw";
}

function calculateRate(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : 0;
}

function formatPercent(value) {
  return `${Math.round(value * 100)}%`;
}

function mostCommonLabel(values) {
  if (!values.length) {
    return "";
  }

  const counts = new Map();
  values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0][0];
}

function dedupeStrings(values) {
  const output = [];
  values.forEach(value => {
    if (!output.some(existing => normalize(existing) === normalize(value))) {
      output.push(value);
    }
  });
  return output;
}

function showUserAlert(message) {
  elements.userAlert.textContent = message;
  elements.userAlert.classList.remove("d-none");
}

function showDuplicateAlert(message) {
  elements.duplicateAlert.textContent = message;
  elements.duplicateAlert.classList.remove("d-none");
}

function hideDuplicateAlert() {
  elements.duplicateAlert.classList.add("d-none");
}

function showMatchAlert(message) {
  elements.matchAlert.textContent = message;
  elements.matchAlert.classList.remove("d-none");
}

function hideMatchAlert() {
  elements.matchAlert.classList.add("d-none");
}

function updatePotentialDuplicateNotice() {
  const set = elements.setSelect.value;
  const location = elements.locationSelect.value.trim();
  if (!currentDate || !set || !location) {
    hideDuplicateAlert();
    return;
  }

  const nextIndex = getNextIndex(currentDate, set, location);
  if (nextIndex === 1) {
    hideDuplicateAlert();
    return;
  }

  showDuplicateAlert(`A matching event already exists. Saving will ask for confirmation and create Event ${nextIndex}.`);
}

function setDateInputToToday() {
  elements.dateInput.value = getTodayIsoLocal();
}

function getTodayIsoLocal() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

function normalize(value) {
  return value.trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function buildSetCatalogFallbackScript() {
  return `window.preloadedSetCatalog = ${JSON.stringify(availableSetCatalog, null, 2)};\n`;
}

if (typeof window !== "undefined") {
  window.dumpDraftStatsSetCatalog = () => {
    const payload = JSON.stringify(availableSetCatalog, null, 2);
    console.log(payload);
    return payload;
  };

  window.dumpDraftStatsSetCatalogScript = () => {
    const script = buildSetCatalogFallbackScript();
    console.log(script);
    return script;
  };
}

init();
