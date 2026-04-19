const setCatalog = [
  { code: "DFT", name: "Aetherdrift", color: "linear-gradient(135deg, #ff7a18, #ffb347)" },
  { code: "TDM", name: "Tarkir: Dragonstorm", color: "linear-gradient(135deg, #00a896, #7dd3fc)" },
  { code: "FDN", name: "Foundations", color: "linear-gradient(135deg, #7c3aed, #c084fc)" },
  { code: "DSK", name: "Duskmourn", color: "linear-gradient(135deg, #ff5f6d, #7b2ff7)" },
  { code: "BLB", name: "Bloomburrow", color: "linear-gradient(135deg, #5fb65f, #dce35b)" },
  { code: "MH3", name: "Modern Horizons 3", color: "linear-gradient(135deg, #4facfe, #00f2fe)" }
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

const events = [
  { id: 1, date: "2026-04-19", set: "TDM", index: 1, location: "Fantasy Stronghold" },
  { id: 2, date: "2026-04-19", set: "DFT", index: 1, location: "Sendepause" }
];

let currentDate = "";
let selectedEventId = null;
let nextEventId = events.length + 1;
let nextUserId = users.length + 1;
let activeUserId = null;

const screens = {
  start: document.getElementById("screen-start"),
  date: document.getElementById("screen-date"),
  details: document.getElementById("screen-details"),
  entry: document.getElementById("screen-entry-placeholder")
};

const elements = {
  trackButton: document.getElementById("track-button"),
  activeUserSelect: document.getElementById("active-user-select"),
  newUserInput: document.getElementById("new-user-input"),
  createUserButton: document.getElementById("create-user-button"),
  userAlert: document.getElementById("user-alert"),
  dateInput: document.getElementById("event-date"),
  createEventButton: document.getElementById("create-event-button"),
  dateEventList: document.getElementById("date-event-list"),
  dateEventEmpty: document.getElementById("date-event-empty"),
  dateEventCount: document.getElementById("date-event-count"),
  entryBackButton: document.getElementById("entry-back-button"),
  selectedDatePill: document.getElementById("selected-date-pill"),
  duplicateAlert: document.getElementById("duplicate-alert"),
  setSelect: document.getElementById("set-select"),
  locationSelect: document.getElementById("location-select"),
  newLocationInput: document.getElementById("new-location-input"),
  createLocationButton: document.getElementById("create-location-button"),
  eventForm: document.getElementById("event-form"),
  createdEventSummary: document.getElementById("created-event-summary"),
  trackAnotherButton: document.getElementById("track-another-button")
};

function init() {
  populateSetSelect();
  populateUserSelect();
  populateLocationSelect();
  setDateInputToToday();
  syncDateView(elements.dateInput.value);

  elements.trackButton.addEventListener("click", () => {
    if (!activeUserId) {
      showUserAlert("Select a user first.");
      return;
    }

    setDateInputToToday();
    syncDateView(elements.dateInput.value);
    showScreen("date");
    elements.dateInput.focus();
  });

  elements.activeUserSelect.addEventListener("change", () => {
    activeUserId = Number(elements.activeUserSelect.value) || null;
    elements.userAlert.classList.add("d-none");
  });
  elements.createUserButton.addEventListener("click", handleCreateUser);
  elements.newUserInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleCreateUser();
    }
  });
  wireSelectCaret(elements.activeUserSelect);
  wireSelectCaret(elements.locationSelect);

  document.querySelectorAll("[data-back]").forEach(button => {
    button.addEventListener("click", () => showScreenById(button.dataset.back));
  });

  elements.dateInput.addEventListener("focus", setDateInputToToday);
  elements.dateInput.addEventListener("input", () => syncDateView(elements.dateInput.value));
  elements.createEventButton.addEventListener("click", enterDetailsStep);
  elements.eventForm.addEventListener("submit", handleSaveEvent);
  elements.trackAnotherButton.addEventListener("click", resetToStart);
  elements.createLocationButton.addEventListener("click", handleCreateLocation);
  elements.newLocationInput.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleCreateLocation();
    }
  });

  [
    elements.setSelect,
    elements.locationSelect
  ].forEach(input => input.addEventListener("input", () => {
    if (selectedEventId !== null) {
      selectedEventId = null;
    }

    updatePotentialDuplicateNotice();
  }));
}

function populateSetSelect() {
  elements.setSelect.innerHTML = '<option value="">Choose...</option>';

  setCatalog.forEach(set => {
    const option = document.createElement("option");
    option.value = set.code;
    option.textContent = `${set.code} - ${set.name}`;
    elements.setSelect.appendChild(option);
  });
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

  if (activeUserId !== null) {
    elements.activeUserSelect.value = String(activeUserId);
  } else {
    elements.activeUserSelect.value = "";
  }
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

function setDateInputToToday() {
  const today = getTodayIsoLocal();
  elements.dateInput.value = today;
}

function getEventsOnDate(date) {
  return events
    .filter(event => event.date === date)
    .sort((a, b) => a.index - b.index || a.set.localeCompare(b.set));
}

function getMatchingEvents(date, set, location) {
  return events
    .filter(event =>
      event.date === date &&
      event.set === set &&
      normalize(event.location) === normalize(location)
    )
    .sort((a, b) => a.index - b.index);
}

function getNextIndex(date, set, location) {
  const matchingEvents = getMatchingEvents(date, set, location);
  if (!matchingEvents.length) {
    return 1;
  }

  return Math.max(...matchingEvents.map(event => event.index)) + 1;
}

function getSet(code) {
  return setCatalog.find(set => set.code === code);
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
      <div class="d-flex justify-content-between align-items-start gap-3">
        <div>
          <div class="fw-bold">${formatCompactEventLabel(event)}</div>
          <div class="small text-secondary mt-1">${set ? set.name : event.set}</div>
        </div>
        <div class="set-badge" style="width:3rem;height:3rem;border-radius:1rem;background:${set ? set.color : "linear-gradient(135deg, #64748b, #94a3b8)"}">
          <span class="date-event-label">${event.set}</span>
        </div>
      </div>
      <div class="event-meta">
        <span class="meta-pill">${event.location || "No location"}</span>
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
  selectedEventId = null;
  elements.duplicateAlert.classList.add("d-none");
  elements.selectedDatePill.textContent = formatDate(currentDate);
  resetFormForDate();
  showScreen("details");
}

function resetFormForDate() {
  elements.setSelect.value = "";
  populateLocationSelect();
  elements.newLocationInput.value = "";
}

function chooseExistingEvent(eventId) {
  const event = events.find(item => item.id === eventId);
  if (!event) {
    return;
  }

  selectedEventId = eventId;
  elements.entryBackButton.dataset.back = "screen-date";
  renderEntryPlaceholder(event, false);
  showScreen("entry");
}

function handleSaveEvent(event) {
  event.preventDefault();

  if (selectedEventId !== null) {
    const existing = events.find(item => item.id === selectedEventId);
    renderEntryPlaceholder(existing, false);
    showScreen("entry");
    return;
  }

  const set = elements.setSelect.value;
  const location = elements.locationSelect.value.trim();

  if (!currentDate || !set || !location) {
    return;
  }

  const nextIndex = getNextIndex(currentDate, set, location);
  const matchingEvents = getMatchingEvents(currentDate, set, location);

  if (matchingEvents.length) {
    const confirmation = window.confirm(
      `An event with the same date, set, and location already exists. ` +
      `If you continue, you will create Event ${nextIndex}.`
    );

    if (!confirmation) {
      updatePotentialDuplicateNotice();
      return;
    }
  }

  const createdEvent = {
    id: nextEventId++,
    date: currentDate,
    set,
    index: nextIndex,
    location
  };

  events.push(createdEvent);
  elements.entryBackButton.dataset.back = "screen-details";
  renderDateEvents(currentDate);
  renderEntryPlaceholder(createdEvent, true);
  showScreen("entry");
}

function renderEntryPlaceholder(event, created) {
  const set = getSet(event.set);
  const status = created ? "Created in memory" : "Existing event selected";

  elements.createdEventSummary.innerHTML = `
    <h3>${status}</h3>
    <div class="summary-grid">
      <div class="summary-row"><span>User</span><span>${getActiveUserName()}</span></div>
      <div class="summary-row"><span>Date</span><span>${formatDate(event.date)}</span></div>
      <div class="summary-row"><span>Set</span><span>${event.set}${set ? ` - ${set.name}` : ""}</span></div>
      <div class="summary-row"><span>Event</span><span>${formatEventNumber(event)}</span></div>
      <div class="summary-row"><span>Location</span><span>${event.location || "Not set"}</span></div>
    </div>
  `;
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

function resetToStart() {
  currentDate = getTodayIsoLocal();
  selectedEventId = null;
  elements.dateInput.value = currentDate;
  syncDateView(currentDate);
  resetFormForDate();
  elements.duplicateAlert.classList.add("d-none");
  elements.entryBackButton.dataset.back = "screen-details";
  showScreen("start");
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
  activeUserId = users[users.length - 1].id;
  populateUserSelect();
  populateLocationSelect(elements.locationSelect.value);
  elements.newUserInput.value = "";
  elements.userAlert.classList.add("d-none");
}

function getActiveUserName() {
  return users.find(user => user.id === activeUserId)?.name ?? "Unknown";
}

function showUserAlert(message) {
  elements.userAlert.textContent = message;
  elements.userAlert.classList.remove("d-none");
}

function handleCreateLocation() {
  const trimmedLocation = elements.newLocationInput.value.trim();

  if (!trimmedLocation) {
    elements.duplicateAlert.textContent = "Enter a location name before creating one.";
    elements.duplicateAlert.classList.remove("d-none");
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

function wireSelectCaret(selectElement) {
  selectElement.addEventListener("change", () => setSelectOpen(selectElement, false));
  selectElement.addEventListener("focus", () => setSelectOpen(selectElement, true));
  selectElement.addEventListener("blur", () => setSelectOpen(selectElement, false));
  selectElement.addEventListener("pointerdown", () => handleSelectPointerDown(selectElement));
}

function handleSelectPointerDown(selectElement) {
  const isFocused = document.activeElement === selectElement;
  const nextState = isFocused ? !getSelectOpen(selectElement) : true;
  setSelectOpen(selectElement, nextState);
}

function setSelectOpen(selectElement, isOpen) {
  selectElement.dataset.open = isOpen ? "true" : "false";
  const wrapper = selectElement.closest(".select-wrap");
  if (!wrapper) {
    return;
  }

  wrapper.classList.toggle("open", isOpen);
}

function getSelectOpen(selectElement) {
  return selectElement.dataset.open === "true";
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

function getLocationOptions() {
  const homeLocations = users.map(user => `${user.name}'s Home`);
  const combined = [...baseLocations, ...homeLocations, ...customLocations];
  const uniqueLocations = [];

  combined.forEach(location => {
    if (!uniqueLocations.some(existing => normalize(existing) === normalize(location))) {
      uniqueLocations.push(location);
    }
  });

  return uniqueLocations;
}

function ensureLocationExists(location) {
  if (!location) {
    return;
  }

  const exists = getLocationOptions().some(existing => normalize(existing) === normalize(location));
  if (!exists) {
    customLocations.push(location);
  }
}

function updatePotentialDuplicateNotice() {
  if (selectedEventId !== null) {
    elements.duplicateAlert.classList.add("d-none");
    return;
  }

  const set = elements.setSelect.value;
  const location = elements.locationSelect.value.trim();

  if (!currentDate || !set || !location) {
    elements.duplicateAlert.classList.add("d-none");
    return;
  }

  const nextIndex = getNextIndex(currentDate, set, location);
  if (nextIndex === 1) {
    elements.duplicateAlert.classList.add("d-none");
    return;
  }

  elements.duplicateAlert.textContent =
    `A matching event already exists. Saving will ask for confirmation and create Event ${nextIndex}.`;
  elements.duplicateAlert.classList.remove("d-none");
}

function formatCompactEventLabel(event) {
  const matchingEvents = getMatchingEvents(event.date, event.set, event.location);
  const needsEventNumber = matchingEvents.length > 1;
  return `${event.set} - ${event.location}${needsEventNumber ? ` - Event ${event.index}` : ""}`;
}

function formatEventNumber(event) {
  const matchingEvents = getMatchingEvents(event.date, event.set, event.location);
  return matchingEvents.length > 1 ? `Event ${event.index}` : "Event 1";
}

init();
