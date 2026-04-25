import {
  changeCurrentUserPassword,
  deleteCustomLocation,
  deleteEvent,
  deleteEventProfile,
  deleteMatchEntry,
  deleteCustomOpponent,
  initializeFirebasePersistence,
  isFirebasePersistenceEnabled,
  loadPersistedState,
  loadUserProfile,
  requestPasswordReset,
  saveCustomLocation,
  saveCustomOpponent,
  saveEvent,
  saveEventProfile,
  saveMatchEntry,
  saveUserProfile,
  signInWithEmail,
  signInWithGoogle,
  signOutCurrentUser,
  signUpWithEmail,
  subscribeToAuthState,
  updateAuthNickname
} from "./firebase-backend.js";

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
const formatColors = {
  Draft: "linear-gradient(135deg, #ff7a18, #ffb347)",
  Sealed: "linear-gradient(135deg, #00a896, #7dd3fc)",
  Mixed: "linear-gradient(to bottom left, #ffb347 0 50%, #7dd3fc 50% 100%)"
};

function getNormalizedFormat(format) {
  return format === "Sealed" ? "Sealed" : "Draft";
}

function getFormatColor(format) {
  return formatColors[getNormalizedFormat(format)] || formatColors.Draft;
}

function getEventColorForDate(dayEvents) {
  const formats = [...new Set(dayEvents.map(event => getNormalizedFormat(event.format)))];

  if (formats.length > 1) {
    return formatColors.Mixed;
  }

  if (formats.length === 1) {
    return getFormatColor(formats[0]);
  }

  return neutralSetColor;
}

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
  deckColors: null,
  splashColors: null,
  archetypes: null
};

const STATUS_RULES = [
  {
    id: "on_fire",
    label: "On fire",
    shortLabel: "W5",
    tone: "hot",
    priority: 100,
    description: context => `${context.currentWinStreak} wins in a row`,
    predicate: context => context.currentWinStreak >= 5
  },
  {
    id: "slumping",
    label: "Slumping",
    shortLabel: "L5",
    tone: "cold",
    priority: 95,
    description: context => `${context.currentLossStreak} losses in a row`,
    predicate: context => context.currentLossStreak >= 5
  },
  {
    id: "hot_streak",
    label: "Hot streak",
    shortLabel: "W3",
    tone: "hot",
    priority: 80,
    description: context => `${context.currentWinStreak} wins in a row`,
    predicate: context => context.currentWinStreak >= 3 && context.currentWinStreak < 5
  },
  {
    id: "cold_streak",
    label: "Cold streak",
    shortLabel: "L3",
    tone: "cold",
    priority: 75,
    description: context => `${context.currentLossStreak} losses in a row`,
    predicate: context => context.currentLossStreak >= 3 && context.currentLossStreak < 5
  },
  {
    id: "active",
    label: "Active",
    shortLabel: "A",
    tone: "active",
    priority: 40,
    description: () => "Logged a match in the last 7 days",
    predicate: context => context.lastMatchTimestamp > 0 && (Date.now() - context.lastMatchTimestamp) <= 7 * 24 * 60 * 60 * 1000
  }
];

const TROPHY_RULES = [
  {
    id: "most_logged_matches",
    label: "Most logged matches",
    description: () => "Currently holds the highest total match count among tracked players.",
    predicate: (context, summary) => context.totalMatches > 0 && context.totalMatches === summary.maxMatches
  },
  {
    id: "most_attended_events",
    label: "Most attended events",
    description: () => "Currently holds the highest attended-event count among tracked players.",
    predicate: (context, summary) => context.totalEvents > 0 && context.totalEvents === summary.maxEvents
  }
];

const ACHIEVEMENT_RULES = [
  {
    id: "first_event",
    label: "First event",
    description: () => "Log your first tracked event.",
    predicate: context => context.totalEvents >= 1
  },
  {
    id: "regular",
    label: "Regular",
    description: () => "Attend 10 tracked events.",
    predicate: context => context.totalEvents >= 10
  },
  {
    id: "grinder",
    label: "Grinder",
    description: () => "Log 50 matches.",
    predicate: context => context.totalMatches >= 50
  },
  {
    id: "archivist",
    label: "Archivist",
    description: () => "Log 100 matches.",
    predicate: context => context.totalMatches >= 100
  },
  {
    id: "monocolor_mage",
    label: "Monocolor mage",
    description: () => "Play all 5 mono-color decks at least once.",
    predicate: context => context.monoColorsPlayed.size >= 5
  },
  {
    id: "two_color_explorer",
    label: "Two-color explorer",
    description: () => "Play all 10 two-color pairs.",
    predicate: context => context.colorPairsPlayed.size >= 10
  },
  {
    id: "archetype_collector",
    label: "Archetype collector",
    description: () => "Play 10 different archetypes.",
    predicate: context => context.uniqueArchetypes.size >= 10
  },
  {
    id: "knows_the_field",
    label: "Knows the field",
    description: () => "Play against every other tracked player.",
    predicate: context => context.allOtherTrackedUsers.size > 0 && context.trackedOpponentsFaced.size >= context.allOtherTrackedUsers.size
  },
  {
    id: "beat_the_field",
    label: "Beat the field",
    description: () => "Record at least one win against every other tracked player.",
    predicate: context => context.allOtherTrackedUsers.size > 0 && context.trackedOpponentsBeaten.size >= context.allOtherTrackedUsers.size
  },
  {
    id: "fell_to_the_field",
    label: "Fell to the field",
    description: () => "Record at least one loss against every other tracked player.",
    predicate: context => context.allOtherTrackedUsers.size > 0 && context.trackedOpponentsLostTo.size >= context.allOtherTrackedUsers.size
  }
];

const manaSymbolFallbacks = {
  W: { label: "White mana", className: "white" },
  U: { label: "Blue mana", className: "blue" },
  B: { label: "Black mana", className: "black" },
  R: { label: "Red mana", className: "red" },
  G: { label: "Green mana", className: "green" }
};

const defaultAccentColor = "#ff7a18";

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
  "Flyers",
  "Tribal",
  "Go-Wide",
  "Value",
  "Reanimator",
  "Tokens",
  "Sacrifice",
  "Spellslinger"
];

const users = [];
const userProfiles = [];

const baseLocations = [];

const customLocations = [];
const customOpponents = [];

const events = [];

const eventPods = [];
const eventProfiles = [];
const matchEntries = [];

let currentDate = "";
let currentCalendarMonth = "";
let currentEventId = null;
let editingEventId = null;
let currentMatchBack = "screen-date";
let activeUserId = null;
let impersonatedUserId = null;
let viewedPersonalStatsSubject = null;
let viewedEventParticipantSubject = null;
let currentAuthUser = null;
let authResolved = false;
let authBusy = false;
let needsNicknameSetup = false;
let isAuthModalOpen = false;
let authModalMode = "register";
let isAccountModalOpen = false;
let isRoundPrefillModalOpen = false;
let lastShownRoundPrefillKey = "";
let currentSelectedRound = 1;
let currentScore = "2-0";
let pendingAccentColor = defaultAccentColor;
let navigationHistoryIndex = 0;
let isRestoringNavigationState = false;
let matchInteractionState = {
  opponent: false,
  score: false
};

const screens = {
  start: document.getElementById("screen-start"),
  date: document.getElementById("screen-date"),
  details: document.getElementById("screen-details"),
  match: document.getElementById("screen-match"),
  stats: document.getElementById("screen-stats"),
  friendsStats: document.getElementById("screen-friends-stats"),
  opponentsStats: document.getElementById("screen-opponents-stats"),
  personalStats: document.getElementById("screen-personal-stats"),
  eventPlayerStats: document.getElementById("screen-event-player-stats")
};

const elements = {
  trackButton: document.getElementById("track-button"),
  globalStatsButton: document.getElementById("global-stats-button"),
  friendsStatsButton: document.getElementById("friends-stats-button"),
  opponentsStatsButton: document.getElementById("opponents-stats-button"),
  personalStatsButton: document.getElementById("personal-stats-button"),
  statsShortcutsBlock: document.getElementById("stats-shortcuts-block"),
  authPrimaryRow: document.getElementById("auth-primary-row"),
  authGoogleLaunch: document.getElementById("auth-google-launch"),
  primaryRegisterButton: document.getElementById("primary-register-button"),
  primaryLoginButton: document.getElementById("primary-login-button"),
  welcomeMessage: document.getElementById("welcome-message"),
  homeNavButton: document.getElementById("home-nav-button"),
  accountMenuButton: document.getElementById("account-menu-button"),
  accountMenuAvatar: document.getElementById("account-menu-avatar"),
  authLoadingOverlay: document.getElementById("auth-loading-overlay"),
  authLoadingTitle: document.getElementById("auth-loading-title"),
  authLoadingCopy: document.getElementById("auth-loading-copy"),
  authModalShell: document.getElementById("auth-modal-shell"),
  authModalBackdrop: document.getElementById("auth-modal-backdrop"),
  authModalClose: document.getElementById("auth-modal-close"),
  authModalTitle: document.getElementById("auth-modal-title"),
  authModalHint: document.getElementById("auth-modal-hint"),
  authModalAlert: document.getElementById("auth-modal-alert"),
  authNicknameRow: document.getElementById("auth-nickname-row"),
  authSignedOut: document.getElementById("auth-signed-out"),
  googleSignInButton: document.getElementById("google-sign-in-button"),
  emailInput: document.getElementById("email-input"),
  passwordInput: document.getElementById("password-input"),
  forgotPasswordRow: document.getElementById("forgot-password-row"),
  forgotPasswordButton: document.getElementById("forgot-password-button"),
  registerNicknameInput: document.getElementById("register-nickname-input"),
  emailSignInButton: document.getElementById("email-sign-in-button"),
  emailRegisterButton: document.getElementById("email-register-button"),
  accountModalShell: document.getElementById("account-modal-shell"),
  accountModalBackdrop: document.getElementById("account-modal-backdrop"),
  accountModal: document.getElementById("account-modal"),
  accountModalClose: document.getElementById("account-modal-close"),
  accountModalHint: document.getElementById("account-modal-hint"),
  accountEmailPill: document.getElementById("account-email-pill"),
  accountModalAlert: document.getElementById("account-modal-alert"),
  accountStylePreviewAvatar: document.getElementById("account-style-preview-avatar"),
  accountStylePreviewCore: document.getElementById("account-style-preview-core"),
  accountStylePreviewName: document.getElementById("account-style-preview-name"),
  profileColorInput: document.getElementById("profile-color-input"),
  profileColorValue: document.getElementById("profile-color-value"),
  adminVisibilitySection: document.getElementById("admin-visibility-section"),
  adminVisibilityTitle: document.getElementById("admin-visibility-title"),
  adminVisibilityHint: document.getElementById("admin-visibility-hint"),
  toggleAdminUiButton: document.getElementById("toggle-admin-ui-button"),
  adminImpersonationSection: document.getElementById("admin-impersonation-section"),
  adminImpersonationSelect: document.getElementById("admin-impersonation-select"),
  adminImpersonationHint: document.getElementById("admin-impersonation-hint"),
  roundPrefillModalShell: document.getElementById("round-prefill-modal-shell"),
  roundPrefillModalBackdrop: document.getElementById("round-prefill-modal-backdrop"),
  roundPrefillModalClose: document.getElementById("round-prefill-modal-close"),
  roundPrefillMessage: document.getElementById("round-prefill-message"),
  roundPrefillAcknowledgeButton: document.getElementById("round-prefill-acknowledge-button"),
  nicknameInput: document.getElementById("nickname-input"),
  saveNicknameButton: document.getElementById("save-nickname-button"),
  passwordSection: document.getElementById("password-section"),
  passwordUnavailableNote: document.getElementById("password-unavailable-note"),
  currentPasswordInput: document.getElementById("current-password-input"),
  newPasswordInput: document.getElementById("new-password-input"),
  confirmPasswordInput: document.getElementById("confirm-password-input"),
  changePasswordButton: document.getElementById("change-password-button"),
  signOutButton: document.getElementById("sign-out-button"),
  adminLocationTools: document.getElementById("admin-location-tools"),
  removeLocationSelect: document.getElementById("remove-location-select"),
  removeLocationButton: document.getElementById("remove-location-button"),
  adminEventTools: document.getElementById("admin-event-tools"),
  editEventSelect: document.getElementById("edit-event-select"),
  editEventButton: document.getElementById("edit-event-button"),
  removeEventSelect: document.getElementById("remove-event-select"),
  removeEventButton: document.getElementById("remove-event-button"),
  removeEventPlayerEventSelect: document.getElementById("remove-event-player-event-select"),
  removeEventPlayerSelect: document.getElementById("remove-event-player-select"),
  removeEventPlayerButton: document.getElementById("remove-event-player-button"),
  adminOpponentTools: document.getElementById("admin-opponent-tools"),
  removeOpponentSelect: document.getElementById("remove-opponent-select"),
  removeOpponentButton: document.getElementById("remove-opponent-button"),
  userAlert: document.getElementById("user-alert"),
  dateInput: document.getElementById("event-date"),
  calendarTodayButton: document.getElementById("calendar-today-button"),
  calendarPrevButton: document.getElementById("calendar-prev-button"),
  calendarNextButton: document.getElementById("calendar-next-button"),
  calendarMonthLabel: document.getElementById("calendar-month-label"),
  calendarGrid: document.getElementById("calendar-grid"),
  selectedDateLabel: document.getElementById("selected-date-label"),
  dateEventList: document.getElementById("date-event-list"),
  dateEventEmpty: document.getElementById("date-event-empty"),
  dateEventCount: document.getElementById("date-event-count"),
  createEventButton: document.getElementById("create-event-button"),
  selectedDatePill: document.getElementById("selected-date-pill"),
    duplicateAlert: document.getElementById("duplicate-alert"),
    eventForm: document.getElementById("event-form"),
    eventDetailsTitle: document.getElementById("event-details-title"),
    setSelect: document.getElementById("set-select"),
    eventFormatSelect: document.getElementById("event-format-select"),
    eventRoundsInput: document.getElementById("event-rounds-input"),
    locationSelect: document.getElementById("location-select"),
  podCountInput: document.getElementById("pod-count-input"),
  newLocationInput: document.getElementById("new-location-input"),
  createLocationButton: document.getElementById("create-location-button"),
  saveEventButton: document.getElementById("save-event-button"),
    matchBackButton: document.getElementById("match-back-button"),
    currentEventBanner: document.getElementById("current-event-banner"),
    matchRoundNav: document.getElementById("match-round-nav"),
  podSelect: document.getElementById("pod-select"),
  deckColorSelect: document.getElementById("deck-color-select"),
  splashColorSelect: document.getElementById("splash-color-select"),
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
  statsLeaderboardHeading: document.getElementById("stats-leaderboard-heading"),
  statsLeaderboard: document.getElementById("stats-leaderboard"),
  statsAllPlayers: document.getElementById("stats-all-players"),
  statsAllOpponents: document.getElementById("stats-all-opponents"),
  friendsStatsBackButton: document.getElementById("friends-stats-back-button"),
  friendsStatsSubtitle: document.getElementById("friends-stats-subtitle"),
  friendsOverviewGrid: document.getElementById("friends-overview-grid"),
  friendsLeaderboard: document.getElementById("friends-leaderboard"),
  friendsRivalries: document.getElementById("friends-rivalries"),
  opponentsStatsBackButton: document.getElementById("opponents-stats-back-button"),
  opponentsStatsSubtitle: document.getElementById("opponents-stats-subtitle"),
  opponentsOverviewGrid: document.getElementById("opponents-overview-grid"),
  opponentsLeaderboard: document.getElementById("opponents-leaderboard"),
  activityFeed: document.getElementById("activity-feed"),
  statsHistory: document.getElementById("stats-history"),
  statsPersonal: document.getElementById("stats-personal"),
  personalHeadToHead: document.getElementById("personal-head-to-head"),
  personalStatsBackButton: document.getElementById("personal-stats-back-button"),
  eventPlayerStatsBackButton: document.getElementById("event-player-stats-back-button"),
  personalStatsTitle: document.getElementById("personal-stats-title"),
  personalStatsSubtitle: document.getElementById("personal-stats-subtitle"),
  personalStatsSnapshotHeading: document.getElementById("personal-stats-snapshot-heading"),
  personalStatsHeadToHeadHeading: document.getElementById("personal-stats-head-to-head-heading"),
  personalStatsHistoryHeading: document.getElementById("personal-stats-history-heading"),
  eventPlayerStatsTitle: document.getElementById("event-player-stats-title"),
  eventPlayerStatsSubtitle: document.getElementById("event-player-stats-subtitle"),
  eventPlayerStatsSummary: document.getElementById("event-player-stats-summary"),
  eventPlayerStatsRounds: document.getElementById("event-player-stats-rounds")
};

async function init() {
  try {
    await initializeFirebasePersistence();
    await hydratePersistedState();
  } catch (error) {
    console.error("Failed to initialize Firebase persistence.", error);
  }

  populateSetSelect();
  populateLocationSelect();
  populateDeckColorSelect();
  populateSplashColorSelect();
  populateArchetypeSelect();
  initializeEnhancedSelects();
  setDateInputToToday();
  setCalendarMonthFromDate(elements.dateInput.value);
  renderCalendar();
  syncDateView(elements.dateInput.value);
  loadSetCatalogFromScryfall();
  loadManaSymbolCatalogFromScryfall();

  [
    elements.eventFormatSelect,
    elements.locationSelect,
    elements.podSelect,
    elements.archetypeSelect,
    elements.opponentSelect,
    elements.adminImpersonationSelect,
    elements.editEventSelect,
    elements.removeEventSelect,
    elements.removeLocationSelect,
    elements.removeOpponentSelect
  ].forEach(wireSelectCaret);

  elements.trackButton.addEventListener("click", handleTrackStart);
  elements.globalStatsButton.addEventListener("click", () => openGlobalStats("screen-start"));
  elements.friendsStatsButton.addEventListener("click", () => openFriendsStats("screen-start"));
  elements.opponentsStatsButton.addEventListener("click", () => openOpponentsStats("screen-start"));
  elements.personalStatsButton.addEventListener("click", () => openPersonalStats("screen-start"));
  elements.googleSignInButton?.addEventListener("click", handleGoogleSignIn);
  elements.emailSignInButton?.addEventListener("click", handleEmailSignIn);
  elements.emailRegisterButton?.addEventListener("click", handleEmailRegister);
  elements.forgotPasswordButton?.addEventListener("click", handleForgotPasswordReset);
  elements.primaryRegisterButton?.addEventListener("click", () => openAuthModal("register"));
  elements.primaryLoginButton?.addEventListener("click", () => openAuthModal("login"));
  elements.authModalClose?.addEventListener("click", closeAuthModal);
  elements.authModalBackdrop?.addEventListener("click", closeAuthModal);
  elements.homeNavButton?.addEventListener("click", handleHomeNavigation);
  elements.accountMenuButton?.addEventListener("click", openAccountModal);
  elements.accountModalClose?.addEventListener("click", closeAccountModal);
  elements.accountModalBackdrop?.addEventListener("click", closeAccountModal);
  elements.roundPrefillModalClose?.addEventListener("click", closeRoundPrefillModal);
  elements.roundPrefillModalBackdrop?.addEventListener("click", closeRoundPrefillModal);
  elements.roundPrefillAcknowledgeButton?.addEventListener("click", closeRoundPrefillModal);
  elements.saveNicknameButton?.addEventListener("click", handleSaveNickname);
  elements.changePasswordButton?.addEventListener("click", handleChangePassword);
  elements.signOutButton?.addEventListener("click", handleSignOut);
  elements.toggleAdminUiButton?.addEventListener("click", handleToggleAdminUiVisibility);
  elements.adminImpersonationSelect?.addEventListener("change", handleAdminImpersonationChange);
  elements.profileColorInput?.addEventListener("input", handleAccentColorInput);
  elements.nicknameInput?.addEventListener("input", updateProfileStylePreview);
  elements.passwordInput?.addEventListener("keydown", handleAuthPasswordKeydown);
  elements.registerNicknameInput?.addEventListener("keydown", handleRegisterNicknameKeydown);
  elements.nicknameInput?.addEventListener("keydown", handleNicknameSaveKeydown);
  [
    elements.currentPasswordInput,
    elements.newPasswordInput,
    elements.confirmPasswordInput
  ].forEach(input => input?.addEventListener("keydown", handlePasswordChangeKeydown));
  elements.calendarTodayButton.addEventListener("click", handleCalendarToday);
  elements.calendarPrevButton.addEventListener("click", () => shiftCalendarMonth(-1));
  elements.calendarNextButton.addEventListener("click", () => shiftCalendarMonth(1));
  elements.eventFormatSelect.addEventListener("change", handleEventFormatChange);
  elements.createEventButton.addEventListener("click", enterDetailsStep);
  elements.eventForm.addEventListener("submit", handleSaveEvent);
  elements.setSelect.addEventListener("change", () => {
    updateSetPreview();
    updatePotentialDuplicateNotice();
  });
  elements.createLocationButton.addEventListener("click", handleCreateLocation);
  elements.removeLocationButton?.addEventListener("click", handleRemoveLocation);
  elements.editEventButton?.addEventListener("click", handleEditEvent);
  elements.removeEventButton?.addEventListener("click", handleRemoveEvent);
  elements.removeEventPlayerEventSelect?.addEventListener("change", handleRemoveEventPlayerEventChange);
  elements.removeEventPlayerButton?.addEventListener("click", handleRemoveEventPlayer);
  elements.newLocationInput.addEventListener("keydown", handleEnterToCreateLocation);
  elements.createOpponentButton.addEventListener("click", handleCreateOpponent);
  elements.removeOpponentButton?.addEventListener("click", handleRemoveOpponent);
  elements.newOpponentInput.addEventListener("keydown", handleEnterToCreateOpponent);
  elements.podSelect.addEventListener("change", saveCurrentProfile);
  elements.deckColorSelect.addEventListener("change", saveCurrentProfile);
  elements.splashColorSelect.addEventListener("change", saveCurrentProfile);
  elements.archetypeSelect.addEventListener("change", saveCurrentProfile);
  elements.matchForm.addEventListener("submit", event => event.preventDefault());
  elements.opponentSelect.addEventListener("change", handleOpponentSelectionChange);
  elements.matchNotesInput.addEventListener("input", handleMatchNotesInput);
  elements.saveMatchButton.addEventListener("click", handleDoneWithMatch);
  elements.scoreRow.addEventListener("click", handleScoreClick);
  elements.activityFeed?.addEventListener("click", handlePlayerStatsNavigationClick);
  elements.dateEventList?.addEventListener("click", handlePlayerStatsNavigationClick);
  elements.statsLeaderboard?.addEventListener("click", handlePlayerStatsNavigationClick);
  elements.statsAllPlayers?.addEventListener("click", handlePlayerStatsNavigationClick);
  elements.statsAllOpponents?.addEventListener("click", handlePlayerStatsNavigationClick);
  elements.friendsLeaderboard?.addEventListener("click", handlePlayerStatsNavigationClick);
  elements.opponentsLeaderboard?.addEventListener("click", handlePlayerStatsNavigationClick);
  elements.personalHeadToHead?.addEventListener("click", handlePlayerStatsNavigationClick);
  elements.friendsRivalries?.addEventListener("click", handlePlayerStatsNavigationClick);
  elements.statsHistory?.addEventListener("click", handlePlayerStatsNavigationClick);

  elements.locationSelect.addEventListener("input", updatePotentialDuplicateNotice);

  document.querySelectorAll("[data-back]").forEach(button => {
    button.addEventListener("click", () => handleBackNavigation(button.dataset.back));
  });

  document.querySelectorAll("[data-stats-view]").forEach(button => {
    button.addEventListener("click", () => {
      const target = button.dataset.statsView;
      if (target === "global") {
        openGlobalStats("screen-start");
      } else if (target === "friends") {
        openFriendsStats("screen-start");
      } else if (target === "opponents") {
        openOpponentsStats("screen-start");
      } else if (target === "personal") {
        openPersonalStats("screen-start");
      }
    });
  });

  document.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("popstate", handleBrowserPopState);

  updateScoreUi();
  updateAdminUiState();
  renderActivityFeed();
  renderAuthUi();
  initializeNavigationHistory();
  subscribeToAuthState(handleAuthStateChange);
}

async function hydratePersistedState() {
  const persistedState = await loadPersistedState();

  mergePersistedUsers(persistedState.userProfiles || []);
  replaceStringCollection(customLocations, persistedState.customLocations || []);
  replaceStringCollection(customOpponents, persistedState.customOpponents || []);
  mergePersistedEvents(persistedState.events || []);

  eventProfiles.splice(
    0,
    eventProfiles.length,
    ...((persistedState.eventProfiles || []).map(profile => ({
      ...profile,
      archetype: normalizeArchetypes(profile.archetype)
    })))
  );
  matchEntries.splice(
    0,
    matchEntries.length,
    ...((persistedState.matchEntries || []).map(entry => ({
      ...entry,
      archetype: normalizeArchetypes(entry.archetype)
    })))
  );
  reconcileTrackedUserOpponentIdentities();
  eventPods.splice(0, eventPods.length);
}

function mergePersistedUsers(persistedUsers) {
  persistedUsers.forEach(user => {
    if (!user?.id) {
      return;
    }

    const normalizedId = normalizeUserId(user.id);
    const existingIndex = userProfiles.findIndex(entry => entry.id === normalizedId);
    if (existingIndex !== -1) {
      userProfiles[existingIndex] = {
        ...userProfiles[existingIndex],
        id: normalizedId,
        nickname: user.nickname || userProfiles[existingIndex].nickname || "",
        provider: user.provider || userProfiles[existingIndex].provider || "",
        accentColor: sanitizeAccentColor(
          user.accentColor ||
          user.accentTheme ||
          userProfiles[existingIndex].accentColor ||
          userProfiles[existingIndex].accentTheme
        ),
        showAdminUi: user.showAdminUi ?? userProfiles[existingIndex].showAdminUi ?? true
      };
    } else {
      userProfiles.push({
        id: normalizedId,
        nickname: user.nickname || "",
        provider: user.provider || "",
        accentColor: sanitizeAccentColor(user.accentColor || user.accentTheme),
        showAdminUi: user.showAdminUi ?? true
      });
    }
  });

  rebuildUsers();
}

function rebuildUsers() {
  users.splice(0, users.length);

  userProfiles
    .filter(user => user.nickname)
    .forEach(user => {
      users.push({
        id: normalizeUserId(user.id),
        name: user.nickname,
        source: "auth",
        accentColor: sanitizeAccentColor(user.accentColor || user.accentTheme)
      });
    });

  users.sort((left, right) => left.name.localeCompare(right.name));
}

function replaceStringCollection(targetCollection, values) {
  targetCollection.splice(0, targetCollection.length, ...dedupeStrings(values.filter(Boolean)));
}

function normalizeUserId(value) {
  return value == null ? "" : String(value);
}

function normalizeRecordId(value) {
  return value == null ? "" : String(value);
}

function createClientRecordId(prefix) {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) {
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function compareUserIds(left, right) {
  return String(left).localeCompare(String(right));
}

function getProviderLabel(user) {
  if (!user?.providerData?.length) {
    return "password";
  }

  return user.providerData.some(entry => entry.providerId === "google.com") ? "google" : "password";
}

function getActiveUserRecord() {
  return activeUserId ? getUserRecord(activeUserId) : null;
}

function getAuthenticatedUserId() {
  return currentAuthUser ? normalizeUserId(currentAuthUser.uid) : null;
}

function getAuthenticatedUserRecord() {
  const authenticatedUserId = getAuthenticatedUserId();
  return authenticatedUserId ? getUserRecord(authenticatedUserId) : null;
}

function getUserProfileRecord(userId) {
  return userProfiles.find(user => user.id === normalizeUserId(userId)) || null;
}

function getActiveUserProfile() {
  return activeUserId ? getUserProfileRecord(activeUserId) : null;
}

function getAuthenticatedUserProfile() {
  const authenticatedUserId = getAuthenticatedUserId();
  return authenticatedUserId ? getUserProfileRecord(authenticatedUserId) : null;
}

function getUserRecord(userId) {
  return users.find(user => user.id === normalizeUserId(userId)) || null;
}

function getTrackedUserByNormalizedName(normalizedName, excludeId = "") {
  if (!normalizedName) {
    return null;
  }

  return users.find(user =>
    user.name &&
    normalize(user.name) === normalizedName &&
    user.id !== normalizeUserId(excludeId)
  ) || null;
}

function getTrackedUserByName(name, excludeId = "") {
  const trimmedName = String(name || "").trim();
  return trimmedName ? getTrackedUserByNormalizedName(normalize(trimmedName), excludeId) : null;
}

function getNamedOpponentSelfConflictEntries(userId, opponentName) {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedName = normalize(String(opponentName || "").trim());
  if (!normalizedUserId || !normalizedName) {
    return [];
  }

  return matchEntries.filter(entry =>
    normalizeUserId(entry.userId) === normalizedUserId &&
    entry.opponentKind === "named" &&
    normalize(entry.opponentName || "") === normalizedName
  );
}

function hasUsableNickname() {
  return Boolean(getActiveUserRecord()?.name);
}

function hasAuthenticatedUserNickname() {
  return Boolean(getAuthenticatedUserRecord()?.name);
}

function ensureAuthenticatedForApp() {
  if (!currentAuthUser) {
    showUserAlert("Sign in first.");
    return false;
  }

  if (!hasUsableNickname()) {
    showUserAlert("Choose a nickname before using the app.");
    return false;
  }

  return true;
}

function isAdminCapableUser() {
  return normalize(getAuthenticatedUserName()) === "steph";
}

function isAdminUiEnabled() {
  if (!isAdminCapableUser()) {
    return false;
  }

  return getAuthenticatedUserProfile()?.showAdminUi !== false;
}

function updateAdminUiState() {
  const showAdminTools = isAdminUiEnabled();
  elements.adminEventTools?.classList.toggle("d-none", !showAdminTools);
  elements.adminLocationTools?.classList.toggle("d-none", !showAdminTools);
  elements.adminOpponentTools?.classList.toggle("d-none", !showAdminTools);

  if (!showAdminTools) {
    return;
  }

  populateEditEventSelect();
  populateRemoveEventSelect();
  populateRemoveEventPlayerEventSelect();
  populateRemoveLocationSelect();
  populateRemoveOpponentSelect();
}

function populateEventAdminSelect(selectElement, selectedValue = "") {
  if (!selectElement) {
    return [];
  }

  const selectedDate = currentDate || elements.dateInput?.value || "";
  const dayEvents = selectedDate ? getEventsOnDate(selectedDate) : [];

  selectElement.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select event...";
  selectElement.appendChild(placeholder);

  dayEvents.forEach(event => {
    const option = document.createElement("option");
    option.value = String(event.id);
    option.textContent = getEventAdminLabel(event);
    selectElement.appendChild(option);
  });

  const optionValues = [...selectElement.options].map(option => option.value);
  selectElement.value = optionValues.includes(String(selectedValue)) ? String(selectedValue) : "";
  selectElement.disabled = dayEvents.length === 0;

  return dayEvents;
}

function populateEditEventSelect(selectedValue = "") {
  const dayEvents = populateEventAdminSelect(elements.editEventSelect, selectedValue);
  if (elements.editEventButton) {
    elements.editEventButton.disabled = dayEvents.length === 0;
  }
}

function populateRemoveUserSelect() {
  if (!elements.removeUserSelect) {
    return;
  }

  elements.removeUserSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select player...";
  elements.removeUserSelect.appendChild(placeholder);

  users
    .filter(user => normalize(user.name) !== "steph")
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach(user => {
      const option = document.createElement("option");
      option.value = String(user.id);
      option.textContent = user.name;
      elements.removeUserSelect.appendChild(option);
    });

  elements.removeUserSelect.value = "";
}

function populateRemoveLocationSelect() {
  if (!elements.removeLocationSelect) {
    return;
  }

  elements.removeLocationSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select location...";
  elements.removeLocationSelect.appendChild(placeholder);

  [...customLocations]
    .sort((left, right) => left.localeCompare(right))
    .forEach(location => {
      const option = document.createElement("option");
      option.value = location;
      option.textContent = location;
      elements.removeLocationSelect.appendChild(option);
    });

  elements.removeLocationSelect.value = "";
}

function populateRemoveEventSelect(selectedValue = "") {
  if (!elements.removeEventSelect) {
    return;
  }

  const dayEvents = populateEventAdminSelect(elements.removeEventSelect, selectedValue);
  if (elements.removeEventButton) {
    elements.removeEventButton.disabled = dayEvents.length === 0;
  }
}

function getTrackedParticipantsForEvent(eventId) {
  return getEventParticipants(eventId).filter(participant => participant.kind === "tracked" && participant.id);
}

function populateRemoveEventPlayerEventSelect(selectedEventId = "", selectedUserId = "") {
  if (!elements.removeEventPlayerEventSelect) {
    return;
  }

  const selectedDate = currentDate || elements.dateInput?.value || "";
  const dayEvents = selectedDate ? getEventsOnDate(selectedDate) : [];

  elements.removeEventPlayerEventSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select event...";
  elements.removeEventPlayerEventSelect.appendChild(placeholder);

  dayEvents.forEach(event => {
    const option = document.createElement("option");
    option.value = String(event.id);
    option.textContent = getEventAdminLabel(event);
    elements.removeEventPlayerEventSelect.appendChild(option);
  });

  const optionValues = [...elements.removeEventPlayerEventSelect.options].map(option => option.value);
  const resolvedEventId = optionValues.includes(String(selectedEventId))
    ? String(selectedEventId)
    : "";

  elements.removeEventPlayerEventSelect.value = resolvedEventId;
  elements.removeEventPlayerEventSelect.disabled = dayEvents.length === 0;
  populateRemoveEventPlayerSelect(resolvedEventId, selectedUserId);
}

function populateRemoveEventPlayerSelect(eventId = "", selectedUserId = "") {
  if (!elements.removeEventPlayerSelect) {
    return;
  }

  const normalizedEventId = normalizeRecordId(eventId);
  const participants = normalizedEventId ? getTrackedParticipantsForEvent(normalizedEventId) : [];

  elements.removeEventPlayerSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select player...";
  elements.removeEventPlayerSelect.appendChild(placeholder);

  participants.forEach(participant => {
    const option = document.createElement("option");
    option.value = participant.id;
    option.textContent = participant.name;
    elements.removeEventPlayerSelect.appendChild(option);
  });

  const optionValues = [...elements.removeEventPlayerSelect.options].map(option => option.value);
  elements.removeEventPlayerSelect.value = optionValues.includes(String(selectedUserId)) ? String(selectedUserId) : "";
  elements.removeEventPlayerSelect.disabled = !normalizedEventId || participants.length === 0;
  if (elements.removeEventPlayerButton) {
    elements.removeEventPlayerButton.disabled = !normalizedEventId || participants.length === 0;
  }
}

function populateRemoveOpponentSelect() {
  if (!elements.removeOpponentSelect) {
    return;
  }

  elements.removeOpponentSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select opponent...";
  elements.removeOpponentSelect.appendChild(placeholder);

  [...customOpponents]
    .filter(name => !getTrackedUserByName(name))
    .sort((left, right) => left.localeCompare(right))
    .forEach(name => {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      elements.removeOpponentSelect.appendChild(option);
    });

  elements.removeOpponentSelect.value = "";
}

function mergePersistedEvents(persistedEvents) {
  persistedEvents.forEach(event => {
    const existingIndex = events.findIndex(entry => entry.id === event.id);
    if (existingIndex !== -1) {
      events[existingIndex] = {
        ...events[existingIndex],
        ...event
      };
      return;
    }

    events.push(event);
  });
}

function logPersistenceFailure(context, error) {
  if (!isFirebasePersistenceEnabled()) {
    return;
  }

  console.error(`Failed to persist ${context}.`, error);
}

function persistCustomLocationRecord(locationName) {
  void saveCustomLocation(locationName).catch(error => logPersistenceFailure("custom location", error));
}

function persistDeletedCustomLocation(locationName) {
  void deleteCustomLocation(locationName).catch(error => logPersistenceFailure("custom location cleanup", error));
}

function persistCustomOpponentRecord(opponentName) {
  void saveCustomOpponent(opponentName).catch(error => logPersistenceFailure("custom opponent", error));
}

function deleteCustomOpponentRecord(opponentName) {
  void deleteCustomOpponent(opponentName).catch(error => logPersistenceFailure("custom opponent cleanup", error));
}

function persistEventRecord(event) {
  void saveEvent(event).catch(error => logPersistenceFailure("event", error));
}

function persistDeletedEventRecord(event) {
  void deleteEvent(event).catch(error => logPersistenceFailure("event cleanup", error));
}

function persistEventProfileRecord(profile) {
  void saveEventProfile(profile).catch(error => logPersistenceFailure("event profile", error));
}

function persistDeletedEventProfile(profile) {
  void deleteEventProfile(profile).catch(error => logPersistenceFailure("event profile cleanup", error));
}

function persistMatchEntryRecord(matchEntry) {
  void saveMatchEntry(matchEntry).catch(error => logPersistenceFailure("match entry", error));
}

function persistDeletedMatchEntry(matchEntry) {
  void deleteMatchEntry(matchEntry).catch(error => logPersistenceFailure("match entry cleanup", error));
}

function initializeEnhancedSelects() {
  initializeSetSelectEnhancer();
  initializeDeckColorSelectEnhancer();
  initializeSplashColorSelectEnhancer();
  initializeArchetypeSelectEnhancer();
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

function initializeSplashColorSelectEnhancer() {
  if (typeof TomSelect === "undefined" || !elements.splashColorSelect) {
    return;
  }

  const selectedValue = elements.splashColorSelect.value;
  if (enhancedSelects.splashColors) {
    enhancedSelects.splashColors.destroy();
  }

  enhancedSelects.splashColors = new TomSelect(elements.splashColorSelect, {
    maxItems: 1,
    allowEmptyOption: true,
    create: false,
    controlInput: null,
    searchField: ["text", "label", "manaCode"],
    dataAttr: "data-data",
    render: {
      option: (data, escape) => {
        if (!data.value) {
          return `<div>${escape(data.text || "None")}</div>`;
        }

        return `
          <div class="rich-option rich-option-colors">
            <div class="mana-symbol-stack">${renderManaSymbols(data.manaCode || data.value)}</div>
          </div>
        `;
      },
      item: data => {
        if (!data.value) {
          return `<div>None</div>`;
        }

        return `
          <div class="rich-item rich-item-colors">
            <span class="mana-symbol-stack">${renderManaSymbols(data.manaCode || data.value)}</span>
          </div>
        `;
      }
    },
    onChange: value => {
      elements.splashColorSelect.value = value;
      saveCurrentProfile();
    }
  });

  enhancedSelects.splashColors.setValue(selectedValue || "", true);
}

function initializeArchetypeSelectEnhancer() {
  if (typeof TomSelect === "undefined" || !elements.archetypeSelect) {
    return;
  }

  const selectedValues = normalizeArchetypes([...elements.archetypeSelect.selectedOptions].map(option => option.value));
  if (enhancedSelects.archetypes) {
    enhancedSelects.archetypes.destroy();
  }

  enhancedSelects.archetypes = new TomSelect(elements.archetypeSelect, {
    maxItems: null,
    create: false,
    hidePlaceholder: true,
    hideSelected: false,
    closeAfterSelect: false,
    searchField: ["text", "value"],
    controlInput: null,
    render: {
      option: (data, escape) => `
        <div class="rich-option rich-option-archetype">
          <div class="rich-option-copy">
            <div class="rich-option-title">${escape(data.text || data.value || "")}</div>
          </div>
        </div>
      `,
      item: (data, escape) => `
        <div class="rich-item rich-item-archetype">
          <span class="rich-item-label">${escape(data.text || data.value || "")}</span>
        </div>
      `
    },
    onChange: values => {
      const nextValues = Array.isArray(values) ? values : [values].filter(Boolean);
      [...elements.archetypeSelect.options].forEach(option => {
        option.selected = nextValues.includes(option.value);
      });
      saveCurrentProfile();
      syncArchetypeDropdownSelectionState(this);
    },
    onInitialize() {
      this.dropdown_content.addEventListener("mousedown", event => {
        const option = event.target.closest("[data-selectable]");
        if (!option) {
          return;
        }

        const value = option.dataset.value;
        if (!value || !this.items.includes(value)) {
          return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        this.removeItem(value);
        this.refreshOptions(false);
        syncArchetypeDropdownSelectionState(this);
      });

      syncArchetypeDropdownSelectionState(this);
    },
    onDropdownOpen() {
      syncArchetypeDropdownSelectionState(this);
    }
  });

  enhancedSelects.archetypes.setValue(selectedValues, true);
}

function syncArchetypeDropdownSelectionState(instance) {
  if (!instance?.dropdown_content) {
    return;
  }

  const selectedValues = new Set(instance.items || []);
  instance.dropdown_content.querySelectorAll("[data-selectable]").forEach(option => {
    option.classList.toggle("is-selected", selectedValues.has(option.dataset.value || ""));
  });
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
  return `<span class="mana-pip ${fallback.className}" title="${escapeHtml(fallback.label)}">${escapeHtml(colorCode)}</span>`;
}

function renderDeckColorSummary(value) {
  if (!value) {
    return "Not logged";
  }

  return `
    <span class="inline-deck-colors">
      <span class="mana-symbol-stack">${renderManaSymbols(value)}</span>
      <span>${escapeHtml(getDeckColorLabel(value))}</span>
    </span>
  `;
}

function getDeckColorCombinationKey(deckColors, splashColor = "") {
  const main = String(deckColors || "").trim();
  const splash = String(splashColor || "").trim();
  return `${main}::${splash}`;
}

function parseDeckColorCombinationKey(value) {
  const [deckColors = "", splashColor = ""] = String(value || "").split("::");
  return {
    deckColors,
    splashColor
  };
}

function renderDeckColorCombinationSummary(value) {
  const { deckColors, splashColor } = parseDeckColorCombinationKey(value);
  return getDeckSummaryLabel(deckColors, splashColor, "");
}

function setAuthControlsDisabled(isDisabled) {
  [
    elements.googleSignInButton,
    elements.emailInput,
    elements.passwordInput,
    elements.forgotPasswordButton,
    elements.registerNicknameInput,
    elements.emailSignInButton,
    elements.emailRegisterButton,
    elements.accountMenuButton,
    elements.nicknameInput,
    elements.saveNicknameButton,
    elements.currentPasswordInput,
    elements.newPasswordInput,
    elements.confirmPasswordInput,
    elements.changePasswordButton,
    elements.toggleAdminUiButton,
    elements.adminImpersonationSelect,
    elements.signOutButton
  ].forEach(control => {
    if (control) {
      control.disabled = isDisabled;
    }
  });
}

function syncModalBodyState() {
  document.body.classList.toggle(
    "account-modal-open",
    isAuthModalOpen || isAccountModalOpen || isRoundPrefillModalOpen
  );
}

function hasPasswordProvider(user = currentAuthUser) {
  return Boolean(user?.providerData?.some(profile => profile.providerId === "password"));
}

function getLegacyAccentColor(value) {
  const normalizedValue = String(value || "").trim();
  const legacyAccentMap = {
    ember: "#ff7a18",
    tide: "#38bdf8",
    verdant: "#22c55e",
    crimson: "#ef4444",
    amethyst: "#8b5cf6",
    sunlit: "#facc15",
    slate: "#64748b",
    midnight: "#111827"
  };
  return legacyAccentMap[normalizedValue] || "";
}

function sanitizeAccentColor(value) {
  const normalizedValue = String(value || "").trim();
  const legacyAccentColor = getLegacyAccentColor(normalizedValue);
  if (legacyAccentColor) {
    return legacyAccentColor;
  }

  const normalizedHex = normalizedValue.startsWith("#") ? normalizedValue : `#${normalizedValue}`;
  if (/^#[0-9a-fA-F]{6}$/.test(normalizedHex)) {
    return normalizedHex.toLowerCase();
  }

  return defaultAccentColor;
}

function getContrastTextColor(backgroundColor) {
  const accentColor = sanitizeAccentColor(backgroundColor).slice(1);
  const red = Number.parseInt(accentColor.slice(0, 2), 16);
  const green = Number.parseInt(accentColor.slice(2, 4), 16);
  const blue = Number.parseInt(accentColor.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;
  return luminance >= 160 ? "#111111" : "#ffffff";
}

function getAvatarRingColor(backgroundColor) {
  const accentColor = sanitizeAccentColor(backgroundColor);
  return `linear-gradient(135deg, ${accentColor}, rgba(255, 255, 255, 0.18))`;
}

function getUserAppearance(userId) {
  const userRecord = getUserRecord(userId);
  return {
    accentColor: sanitizeAccentColor(userRecord?.accentColor || userRecord?.accentTheme)
  };
}

function getAvatarAppearance(accentColor = defaultAccentColor) {
  const normalizedAccentColor = sanitizeAccentColor(accentColor);
  return {
    fill: normalizedAccentColor,
    text: getContrastTextColor(normalizedAccentColor),
    ring: getAvatarRingColor(normalizedAccentColor)
  };
}

function getAvatarStyleAttribute(accentColor) {
  const appearance = getAvatarAppearance(accentColor);
  return `--player-avatar-fill:${appearance.fill}; --player-avatar-text:${appearance.text}; --player-avatar-ring:${appearance.ring};`;
}

function getConsecutiveResultCount(entries, result) {
  let count = 0;
  for (const entry of entries) {
    if (entry.result !== result) {
      break;
    }
    count += 1;
  }
  return count;
}

function buildPlayerProgressContext(userId) {
  const normalizedUserId = normalizeUserId(userId);
  const personalEntries = matchEntries
    .filter(entry => normalizeUserId(entry.userId) === normalizedUserId)
    .sort((left, right) => getMatchActivityTimestamp(right) - getMatchActivityTimestamp(left));
  const profiles = eventProfiles.filter(profile => normalizeUserId(profile.userId) === normalizedUserId);
  const trackedEntries = personalEntries.filter(entry => entry.opponentKind === "tracked" && entry.opponentUserId);
  const totalMatches = personalEntries.length;
  const totalEvents = new Set([
    ...profiles.map(profile => profile.eventId),
    ...personalEntries.map(entry => entry.eventId)
  ].filter(Boolean)).size;
  const deckColorsPlayed = new Set(profiles.map(profile => profile.deckColors).filter(Boolean));
  const monoColorsPlayed = new Set([...deckColorsPlayed].filter(color => String(color).length === 1));
  const colorPairsPlayed = new Set([...deckColorsPlayed].filter(color => String(color).length === 2));
  const uniqueArchetypes = new Set(profiles.flatMap(profile => normalizeArchetypes(profile.archetype)));
  const trackedOpponentsFaced = new Set(trackedEntries.map(entry => normalizeUserId(entry.opponentUserId)).filter(Boolean));
  const trackedOpponentsBeaten = new Set(trackedEntries.filter(entry => entry.result === "win").map(entry => normalizeUserId(entry.opponentUserId)).filter(Boolean));
  const trackedOpponentsLostTo = new Set(trackedEntries.filter(entry => entry.result === "loss").map(entry => normalizeUserId(entry.opponentUserId)).filter(Boolean));
  const allOtherTrackedUsers = new Set(
    users
      .map(user => normalizeUserId(user.id))
      .filter(otherUserId => otherUserId && otherUserId !== normalizedUserId)
  );

  return {
    userId: normalizedUserId,
    totalMatches,
    totalEvents,
    deckColorsPlayed,
    monoColorsPlayed,
    colorPairsPlayed,
    uniqueArchetypes,
    trackedOpponentsFaced,
    trackedOpponentsBeaten,
    trackedOpponentsLostTo,
    allOtherTrackedUsers,
    currentWinStreak: getConsecutiveResultCount(personalEntries, "win"),
    currentLossStreak: getConsecutiveResultCount(personalEntries, "loss"),
    lastMatchTimestamp: personalEntries.length ? getMatchActivityTimestamp(personalEntries[0]) : 0
  };
}

function getAllPlayerProgressContexts() {
  return users
    .map(user => buildPlayerProgressContext(user.id))
    .filter(context => context.userId);
}

function getPlayerTrophySummary(contexts = getAllPlayerProgressContexts()) {
  return {
    maxMatches: Math.max(0, ...contexts.map(context => context.totalMatches || 0)),
    maxEvents: Math.max(0, ...contexts.map(context => context.totalEvents || 0))
  };
}

function evaluateRuleSet(rules, context, summary = null) {
  return rules
    .filter(rule => rule.predicate(context, summary))
    .map(rule => ({
      ...rule,
      descriptionText: typeof rule.description === "function" ? rule.description(context, summary) : rule.description || ""
    }));
}

function getPlayerStatuses(userId) {
  const context = buildPlayerProgressContext(userId);
  return evaluateRuleSet(STATUS_RULES, context)
    .sort((left, right) => right.priority - left.priority || left.label.localeCompare(right.label));
}

function getPrimaryPlayerStatus(userId) {
  return getPlayerStatuses(userId)[0] || null;
}

function getPlayerTrophies(userId) {
  const contexts = getAllPlayerProgressContexts();
  const summary = getPlayerTrophySummary(contexts);
  const context = contexts.find(item => item.userId === normalizeUserId(userId)) || buildPlayerProgressContext(userId);
  return evaluateRuleSet(TROPHY_RULES, context, summary);
}

function getPlayerAchievements(userId) {
  return evaluateRuleSet(ACHIEVEMENT_RULES, buildPlayerProgressContext(userId));
}

function createTrackedMatchPerspective(match, userId) {
  const normalizedUserId = normalizeUserId(userId);
  const isPlayerA = normalizedUserId === match.playerAId;
  const gamesWon = isPlayerA ? match.gamesA : match.gamesB;
  const gamesLost = isPlayerA ? match.gamesB : match.gamesA;
  const opponentUserId = isPlayerA ? match.playerBId : match.playerAId;
  const result = match.winnerId
    ? match.winnerId === normalizedUserId ? "win" : "loss"
    : "draw";

  return {
    eventId: match.eventId,
    userId: normalizedUserId,
    round: match.round,
    opponentKind: "tracked",
    opponentUserId,
    opponentName: getUserName(opponentUserId),
    result,
    score: `${gamesWon}-${gamesLost}`
  };
}

function getGlobalStatsEntriesForUser(userId, canonicalFriendMatches = buildCanonicalFriendMatches()) {
  const normalizedUserId = normalizeUserId(userId);
  const directUntrackedEntries = matchEntries.filter(entry =>
    normalizeUserId(entry.userId) === normalizedUserId &&
    !(entry.opponentKind === "tracked" && entry.opponentUserId)
  );
  const trackedPerspectives = canonicalFriendMatches
    .filter(match => match.playerAId === normalizedUserId || match.playerBId === normalizedUserId)
    .map(match => createTrackedMatchPerspective(match, normalizedUserId));

  return [...directUntrackedEntries, ...trackedPerspectives];
}

function getGlobalMatchCount(canonicalFriendMatches = buildCanonicalFriendMatches()) {
  const untrackedEntries = matchEntries.filter(entry =>
    !(entry.opponentKind === "tracked" && entry.opponentUserId)
  );
  return untrackedEntries.length + canonicalFriendMatches.length;
}

function getGlobalLeaderboardRows(activeUsers = users) {
  const canonicalFriendMatches = buildCanonicalFriendMatches();
  return activeUsers
    .map(user => {
      const allEntries = getGlobalStatsEntriesForUser(user.id, canonicalFriendMatches);
      const friendEntries = allEntries.filter(entry => entry.opponentKind === "tracked");
      const allStats = computeEntryStats(allEntries);
      const friendStats = computeEntryStats(friendEntries);
      return { user, allStats, friendStats };
    })
    .filter(row => row.allStats.matches > 0)
    .sort((left, right) =>
      right.allStats.matchWinRate - left.allStats.matchWinRate ||
      right.allStats.matches - left.allStats.matches ||
      right.friendStats.matchWinRate - left.friendStats.matchWinRate
    );
}

function getTopRankedTrackedUserId() {
  return getGlobalLeaderboardRows()[0]?.user?.id || "";
}

function isTopRankedTrackedUser(userId) {
  return Boolean(userId && normalizeUserId(userId) === getTopRankedTrackedUserId());
}

function renderTrackedPlayerAvatar(name, userId, sizeClass) {
  const appearance = getUserAppearance(userId);
  const topRankClass = isTopRankedTrackedUser(userId) ? " is-top-ranked" : "";
  const status = getPrimaryPlayerStatus(userId);
  const statusClass = status ? ` has-status is-status-${status.tone || "active"}` : "";
  const statusAttributes = status
    ? ` data-status-short="${escapeHtml(status.shortLabel)}" title="${escapeHtml(status.label)}"`
    : "";
  return `
    <span class="player-avatar-shell ${sizeClass}${topRankClass}${statusClass}" style="${getAvatarStyleAttribute(appearance.accentColor)}"${statusAttributes} aria-hidden="true">
      <span class="player-avatar-core">${escapeHtml(getParticipantMonogram(name))}</span>
    </span>
  `;
}

function renderBasicPlayerAvatar(name, sizeClass) {
  return `
    <span class="player-avatar-shell ${sizeClass}" aria-hidden="true">
      <span class="player-avatar-core">${escapeHtml(getParticipantMonogram(name))}</span>
    </span>
  `;
}

function openAuthModal(mode = "register") {
  if (currentAuthUser) {
    return;
  }

  authModalMode = mode === "login" ? "login" : "register";
  isAuthModalOpen = true;
  elements.authModalShell?.classList.remove("d-none");
  elements.authModalShell?.setAttribute("aria-hidden", "false");
  hideUserAlert();
  renderAuthUi();
  syncModalBodyState();

  const preferredFocusTarget = authModalMode === "register"
    ? elements.registerNicknameInput
    : elements.emailInput;
  window.setTimeout(() => preferredFocusTarget?.focus(), 0);
}

function closeAuthModal() {
  if (!isAuthModalOpen) {
    return;
  }

  isAuthModalOpen = false;
  elements.authModalShell?.classList.add("d-none");
  elements.authModalShell?.setAttribute("aria-hidden", "true");
  hideUserAlert();
  renderAuthUi();
  syncModalBodyState();
}

function openAccountModal() {
  if (!currentAuthUser) {
    return;
  }

  hydratePendingProfileCustomizationFromAuthenticatedUser();
  isAccountModalOpen = true;
  elements.accountModalShell?.classList.remove("d-none");
  elements.accountModalShell?.setAttribute("aria-hidden", "false");
  syncModalBodyState();
  hideAccountModalAlert();
  renderAuthUi();

  const preferredFocusTarget = needsNicknameSetup
    ? elements.nicknameInput
    : hasPasswordProvider()
      ? elements.currentPasswordInput
      : elements.nicknameInput;

  window.setTimeout(() => preferredFocusTarget?.focus(), 0);
}

function closeAccountModal() {
  if (!isAccountModalOpen) {
    return;
  }

  isAccountModalOpen = false;
  elements.accountModalShell?.classList.add("d-none");
  elements.accountModalShell?.setAttribute("aria-hidden", "true");
  hideAccountModalAlert();
  renderAuthUi();
  syncModalBodyState();
}

function openRoundPrefillModal(sourceEntry) {
  if (!sourceEntry || !elements.roundPrefillModalShell) {
    return;
  }

  const opponentName = getUserName(sourceEntry.userId);
  if (elements.roundPrefillMessage) {
    elements.roundPrefillMessage.textContent = `This round (Round ${sourceEntry.round}) was already entered by your opponent ${opponentName}.`;
  }

  isRoundPrefillModalOpen = true;
  elements.roundPrefillModalShell.classList.remove("d-none");
  elements.roundPrefillModalShell.setAttribute("aria-hidden", "false");
  syncModalBodyState();
}

function closeRoundPrefillModal() {
  if (!isRoundPrefillModalOpen || !elements.roundPrefillModalShell) {
    return;
  }

  isRoundPrefillModalOpen = false;
  elements.roundPrefillModalShell.classList.add("d-none");
  elements.roundPrefillModalShell.setAttribute("aria-hidden", "true");
  syncModalBodyState();
}

function showAccountModalAlert(message) {
  if (!elements.accountModalAlert) {
    return;
  }

  elements.accountModalAlert.textContent = message;
  elements.accountModalAlert.classList.remove("d-none");
}

function hideAccountModalAlert() {
  if (!elements.accountModalAlert) {
    return;
  }

  elements.accountModalAlert.textContent = "";
  elements.accountModalAlert.classList.add("d-none");
}

function renderAuthUi() {
  const isSignedIn = Boolean(currentAuthUser);
  const canUseApp = Boolean(isSignedIn && hasUsableNickname());
  const displayName = hasUsableNickname() ? getActiveUserName() : "Nickname needed";
  const authenticatedDisplayName = hasAuthenticatedUserNickname() ? getAuthenticatedUserName() : "Nickname needed";
  const passwordEnabled = hasPasswordProvider();
  const showAuthLoadingOverlay = !authResolved || (authBusy && !currentAuthUser);

  elements.authSignedOut?.classList.toggle("d-none", isSignedIn);
  elements.authPrimaryRow?.classList.toggle("d-none", isSignedIn);
  elements.authGoogleLaunch?.classList.toggle("d-none", isSignedIn);
  elements.statsShortcutsBlock?.classList.toggle("d-none", !isSignedIn);
  elements.trackButton?.classList.toggle("d-none", !isSignedIn);
  elements.welcomeMessage?.classList.toggle("d-none", !isSignedIn);
  elements.accountMenuButton?.classList.toggle("d-none", !isSignedIn);
  elements.accountMenuButton?.setAttribute("aria-label", isSignedIn ? `Open account menu for ${authenticatedDisplayName}` : "Open account menu");

  if (elements.welcomeMessage) {
    if (isSignedIn) {
      const emailMarkup = currentAuthUser?.email
        ? `<div class="welcome-subtitle">${escapeHtml(currentAuthUser.email)}</div>`
        : "";

      elements.welcomeMessage.innerHTML = `
        <div class="welcome-avatar-wrap">
          ${renderTrackedPlayerAvatar(displayName, activeUserId, "welcome-avatar")}
        </div>
        <div class="welcome-copy">
          <div class="welcome-kicker">Welcome back</div>
          <div class="welcome-heading-row">
            <div class="welcome-name">${escapeHtml(displayName)}</div>
          </div>
          ${emailMarkup}
        </div>
      `;
    } else {
      elements.welcomeMessage.innerHTML = "";
    }
  }

  if (elements.accountModalHint) {
    elements.accountModalHint.textContent = isSignedIn
      ? needsNicknameSetup
        ? "Pick the nickname the rest of the app should use for you."
        : "Manage your nickname, accent color, and sign-in settings."
      : "Sign in with Google or email, then choose the nickname you want to be known by.";
  }

  if (elements.authModalTitle) {
    elements.authModalTitle.textContent = authModalMode === "login" ? "Log in" : "Register";
  }

  if (elements.authModalHint) {
    elements.authModalHint.textContent = authModalMode === "login"
      ? "Use your email and password to get back into your tracking."
      : "Create your account with email and choose the nickname players should know you by.";
  }

  elements.authNicknameRow?.classList.toggle("d-none", authModalMode === "login");
  elements.forgotPasswordRow?.classList.toggle("d-none", authModalMode !== "login");

  if (elements.accountEmailPill) {
    elements.accountEmailPill.textContent = currentAuthUser?.email || "No email";
  }

  updateAccountMenuAvatar();

  if (elements.nicknameInput) {
    const currentValue = elements.nicknameInput.value.trim();
    const desiredValue = hasAuthenticatedUserNickname() ? getAuthenticatedUserName() : elements.registerNicknameInput?.value.trim() || "";
    if (!currentValue || currentValue === desiredValue || needsNicknameSetup) {
      elements.nicknameInput.value = desiredValue;
    }
  }

  renderProfileCustomizationControls();
  renderAdminVisibilityControls();

  elements.passwordSection?.classList.toggle("d-none", !passwordEnabled);
  elements.passwordUnavailableNote?.classList.toggle("d-none", passwordEnabled);

  [
    elements.trackButton,
    elements.globalStatsButton,
    elements.friendsStatsButton,
    elements.opponentsStatsButton,
    elements.personalStatsButton
  ].forEach(button => {
    if (button) {
      button.disabled = !canUseApp || authBusy || !authResolved;
    }
  });

  setAuthControlsDisabled(authBusy);
  renderAuthLoadingOverlay(showAuthLoadingOverlay);
}

function renderAuthLoadingOverlay(isVisible) {
  if (!elements.authLoadingOverlay) {
    return;
  }

  const isRestoringSession = !authResolved;
  if (elements.authLoadingTitle) {
    elements.authLoadingTitle.textContent = isRestoringSession ? "Restoring your session" : "Signing you in";
  }
  if (elements.authLoadingCopy) {
    elements.authLoadingCopy.textContent = isRestoringSession
      ? "Just a moment while we restore your login."
      : "Just a moment while we sign you in.";
  }

  elements.authLoadingOverlay.classList.toggle("d-none", !isVisible);
  elements.authLoadingOverlay.setAttribute("aria-hidden", isVisible ? "false" : "true");
  document.body.classList.toggle("auth-loading-open", isVisible);
}

function hydratePendingProfileCustomizationFromAuthenticatedUser() {
  const appearance = getUserAppearance(getAuthenticatedUserId());
  pendingAccentColor = appearance.accentColor;
}

function renderProfileCustomizationControls() {
  if (!elements.profileColorInput) {
    return;
  }

  elements.profileColorInput.value = sanitizeAccentColor(pendingAccentColor);
  if (elements.profileColorValue) {
    elements.profileColorValue.textContent = sanitizeAccentColor(pendingAccentColor).toUpperCase();
  }

  updateProfileStylePreview();
}

function renderAdminVisibilityControls() {
  const canManageAdminUi = isAdminCapableUser();
  const adminUiVisible = isAdminUiEnabled();

  elements.adminVisibilitySection?.classList.toggle("d-none", !canManageAdminUi);
  elements.adminImpersonationSection?.classList.toggle("d-none", !canManageAdminUi);

  if (!canManageAdminUi) {
    return;
  }

  if (elements.adminVisibilityTitle) {
    elements.adminVisibilityTitle.textContent = adminUiVisible ? "Admin UI enabled" : "Admin UI hidden";
  }

  if (elements.adminVisibilityHint) {
    elements.adminVisibilityHint.textContent = adminUiVisible
      ? "You can hide the delete and cleanup controls until you need them again."
      : "The admin tools are currently hidden across the app. You can turn them back on here anytime.";
  }

  if (elements.toggleAdminUiButton) {
    elements.toggleAdminUiButton.textContent = adminUiVisible ? "Hide admin UI" : "Show admin UI";
  }

  populateAdminImpersonationSelect();
}

function populateAdminImpersonationSelect() {
  if (!elements.adminImpersonationSelect) {
    return;
  }

  const authenticatedUserId = getAuthenticatedUserId();
  const authenticatedName = getAuthenticatedUserName();
  const currentValue = impersonatedUserId || authenticatedUserId || "";

  elements.adminImpersonationSelect.innerHTML = "";

  const ownOption = document.createElement("option");
  ownOption.value = authenticatedUserId || "";
  ownOption.textContent = `${authenticatedName} (my account)`;
  elements.adminImpersonationSelect.appendChild(ownOption);

  users
    .filter(user => user.id !== authenticatedUserId)
    .sort((left, right) => left.name.localeCompare(right.name))
    .forEach(user => {
      const option = document.createElement("option");
      option.value = user.id;
      option.textContent = user.name;
      elements.adminImpersonationSelect.appendChild(option);
    });

  const optionValues = [...elements.adminImpersonationSelect.options].map(option => option.value);
  if (!optionValues.includes(currentValue)) {
    impersonatedUserId = null;
    applyEffectiveActiveUser();
  }
  elements.adminImpersonationSelect.value = optionValues.includes(currentValue) ? currentValue : authenticatedUserId || "";

  if (elements.adminImpersonationHint) {
    elements.adminImpersonationHint.textContent = impersonatedUserId
      ? `Viewing the app as ${getUserName(impersonatedUserId)}.`
      : "Choose a player to view and enter data as them.";
  }
}

function updateProfileStylePreview() {
  const previewName = elements.nicknameInput?.value.trim() || getAuthenticatedUserName();
  const appearance = getAvatarAppearance(pendingAccentColor);

  if (elements.accountStylePreviewAvatar) {
    elements.accountStylePreviewAvatar.style.setProperty("--player-avatar-fill", appearance.fill);
    elements.accountStylePreviewAvatar.style.setProperty("--player-avatar-text", appearance.text);
    elements.accountStylePreviewAvatar.style.setProperty("--player-avatar-ring", appearance.ring);
  }
  if (elements.accountStylePreviewCore) {
    elements.accountStylePreviewCore.textContent = getParticipantMonogram(previewName);
  }
  if (elements.accountStylePreviewName) {
    elements.accountStylePreviewName.textContent = previewName || "Your profile";
  }
}

function updateAccountMenuAvatar() {
  if (!elements.accountMenuAvatar) {
    return;
  }

  const appearance = getUserAppearance(activeUserId);
  const avatarAppearance = getAvatarAppearance(appearance.accentColor);
  const status = getPrimaryPlayerStatus(activeUserId);
  elements.accountMenuAvatar.style.setProperty("--player-avatar-fill", avatarAppearance.fill);
  elements.accountMenuAvatar.style.setProperty("--player-avatar-text", avatarAppearance.text);
  elements.accountMenuAvatar.style.setProperty("--player-avatar-ring", avatarAppearance.ring);
  elements.accountMenuAvatar.classList.toggle("is-top-ranked", isTopRankedTrackedUser(activeUserId));
  elements.accountMenuAvatar.classList.toggle("has-status", Boolean(status));
  elements.accountMenuAvatar.classList.toggle("is-status-hot", status?.tone === "hot");
  elements.accountMenuAvatar.classList.toggle("is-status-cold", status?.tone === "cold");
  elements.accountMenuAvatar.classList.toggle("is-status-active", status?.tone === "active");
  if (status) {
    elements.accountMenuAvatar.dataset.statusShort = status.shortLabel;
    elements.accountMenuAvatar.title = status.label;
  } else {
    delete elements.accountMenuAvatar.dataset.statusShort;
    elements.accountMenuAvatar.removeAttribute("title");
  }
}

function refreshUserBoundUi() {
  populateLocationSelect(elements.locationSelect?.value || "");
  populateOpponentSelect(elements.opponentSelect?.value || "npc");
  updateAdminUiState();
  renderActivityFeed();
  renderAuthUi();

  if (screens.match.classList.contains("active") && currentEventId && ensureAuthenticatedSilently()) {
    renderMatchScreen();
  } else if (screens.personalStats.classList.contains("active") && ensureAuthenticatedSilently()) {
    renderPersonalStatsPage();
  } else if (screens.opponentsStats.classList.contains("active")) {
    renderOpponentsStats();
  } else if (screens.stats.classList.contains("active")) {
    renderGlobalStats();
  } else if (screens.friendsStats.classList.contains("active")) {
    renderFriendsStats();
  }
}

function ensureAuthenticatedSilently() {
  return Boolean(currentAuthUser && hasUsableNickname());
}

function createTrackedPersonalStatsSubject(userId) {
  return {
    kind: "tracked",
    userId: normalizeUserId(userId)
  };
}

function createNamedOpponentPersonalStatsSubject(name) {
  return {
    kind: "named",
    name: String(name || "").trim()
  };
}

function createTrackedEventParticipantSubject(userId, eventId) {
  return {
    kind: "tracked",
    userId: normalizeUserId(userId),
    eventId: normalizeRecordId(eventId)
  };
}

function createNamedEventParticipantSubject(name, eventId) {
  return {
    kind: "named",
    name: String(name || "").trim(),
    eventId: normalizeRecordId(eventId)
  };
}

function getViewedPersonalStatsSubject() {
  if (viewedPersonalStatsSubject?.kind === "tracked") {
    const normalizedViewedUserId = normalizeUserId(viewedPersonalStatsSubject.userId);
    if (normalizedViewedUserId && users.some(user => user.id === normalizedViewedUserId)) {
      return createTrackedPersonalStatsSubject(normalizedViewedUserId);
    }
  }

  if (viewedPersonalStatsSubject?.kind === "named") {
    const opponentName = String(viewedPersonalStatsSubject.name || "").trim();
    if (opponentName) {
      return createNamedOpponentPersonalStatsSubject(opponentName);
    }
  }

  viewedPersonalStatsSubject = createTrackedPersonalStatsSubject(activeUserId);
  return viewedPersonalStatsSubject;
}

function cloneViewedEventParticipantSubject(subject) {
  if (!subject || typeof subject !== "object" || !subject.eventId) {
    return null;
  }

  if (subject.kind === "tracked") {
    return createTrackedEventParticipantSubject(subject.userId, subject.eventId);
  }

  if (subject.kind === "named") {
    return createNamedEventParticipantSubject(subject.name, subject.eventId);
  }

  return null;
}

function getFriendlyAuthError(error) {
  const code = error?.code || "";

  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "That login didn't work. Check your email and password.";
  }

  if (code.includes("email-already-in-use")) {
    return "That email is already registered. Try signing in instead.";
  }

  if (code.includes("weak-password")) {
    return "Choose a stronger password with at least 6 characters.";
  }

  if (code.includes("invalid-email")) {
    return "Enter a valid email address first.";
  }

  if (code.includes("too-many-requests")) {
    return "Too many attempts right now. Give it a moment and try again.";
  }

  if (code.includes("popup-closed-by-user")) {
    return "Google sign-in was closed before it finished.";
  }

  return error?.message || "Authentication failed.";
}

function findAuthUserByNickname(nickname, excludeId = "") {
  return getTrackedUserByName(nickname, excludeId);
}

function upsertCurrentAuthProfile(profile) {
  mergePersistedUsers([{
    id: normalizeUserId(profile.id),
    nickname: profile.nickname || "",
    provider: profile.provider || getProviderLabel(currentAuthUser),
    accentColor: sanitizeAccentColor(profile.accentColor || profile.accentTheme),
    showAdminUi: profile.showAdminUi
  }]);
}

async function handleAuthStateChange(user) {
  authResolved = false;
  renderAuthUi();
  currentAuthUser = user;
  impersonatedUserId = null;
  applyEffectiveActiveUser();
  viewedPersonalStatsSubject = createTrackedPersonalStatsSubject(activeUserId);
  viewedEventParticipantSubject = null;

  if (!user) {
    needsNicknameSetup = false;
    hideUserAlert();
    closeAuthModal();
    closeAccountModal();
    closeRoundPrefillModal();
    showScreen("start");
    syncNavigationHistory("replace", "screen-start");
    authResolved = true;
    refreshUserBoundUi();
    return;
  }

  try {
    const persistedProfile = await loadUserProfile(user.uid);
    const profile = persistedProfile || {
      id: normalizeUserId(user.uid),
      nickname: "",
      provider: getProviderLabel(user),
      accentColor: defaultAccentColor,
      showAdminUi: true
    };

    upsertCurrentAuthProfile(profile);
    needsNicknameSetup = !profile.nickname;
  } catch (error) {
    console.error("Failed to sync auth state.", error);
    showUserAlert("Signed in, but the player profile could not be loaded yet.");
  }

  closeAuthModal();
  authResolved = true;
  refreshUserBoundUi();
  if (needsNicknameSetup) {
    openAccountModal();
  }
}

async function handleGoogleSignIn() {
  authBusy = true;
  renderAuthUi();
  hideUserAlert();

  try {
    await signInWithGoogle();
  } catch (error) {
    showUserAlert(getFriendlyAuthError(error));
  } finally {
    authBusy = false;
    renderAuthUi();
  }
}

async function handleEmailSignIn() {
  const email = elements.emailInput?.value.trim() || "";
  const password = elements.passwordInput?.value || "";

  if (!email || !password) {
    showUserAlert("Enter your email and password to sign in.");
    return;
  }

  authBusy = true;
  renderAuthUi();
  hideUserAlert();

  try {
    await signInWithEmail(email, password);
    if (elements.passwordInput) {
      elements.passwordInput.value = "";
    }
  } catch (error) {
    showUserAlert(getFriendlyAuthError(error));
  } finally {
    authBusy = false;
    renderAuthUi();
  }
}

async function handleEmailRegister() {
  const nickname = elements.registerNicknameInput?.value.trim() || "";
  const email = elements.emailInput?.value.trim() || "";
  const password = elements.passwordInput?.value || "";

  if (!nickname) {
    showUserAlert("Choose a nickname before creating an account.");
    return;
  }

  if (findAuthUserByNickname(nickname)) {
    showUserAlert("That nickname is already taken.");
    return;
  }

  if (!email || !password) {
    showUserAlert("Enter an email and password to create an account.");
    return;
  }

  authBusy = true;
  renderAuthUi();
  hideUserAlert();

  try {
    const credential = await signUpWithEmail(email, password, nickname);
    await saveProfileForCurrentUser({
      nickname,
      accentColor: defaultAccentColor
    }, credential.user, { successMessage: "" });
    if (elements.passwordInput) {
      elements.passwordInput.value = "";
    }
  } catch (error) {
    showUserAlert(getFriendlyAuthError(error));
  } finally {
    authBusy = false;
    renderAuthUi();
  }
}

async function handleForgotPasswordReset() {
  const email = elements.emailInput?.value.trim() || "";
  if (!email) {
    showUserAlert("Enter your email first, then use forgot password.");
    return;
  }

  authBusy = true;
  renderAuthUi();
  hideUserAlert();

  try {
    await requestPasswordReset(email);
    showUserAlert("Password reset email sent. Check your inbox.");
  } catch (error) {
    showUserAlert(getFriendlyAuthError(error));
  } finally {
    authBusy = false;
    renderAuthUi();
  }
}

async function handleSaveNickname() {
  const nickname = elements.nicknameInput?.value.trim() || "";
  await saveProfileForCurrentUser({
    nickname,
    accentColor: pendingAccentColor
  }, currentAuthUser, { successMessage: "Profile updated." });
}

async function saveProfileForCurrentUser(profileDraft, authUser = currentAuthUser, options = {}) {
  const { successMessage = "Profile updated." } = options;
  if (!authUser) {
    showAccountModalAlert("Sign in before choosing a nickname.");
    return;
  }

  const nickname = profileDraft?.nickname?.trim() || "";
  if (!nickname) {
    showAccountModalAlert("Enter the nickname you want to use.");
    return;
  }

  const conflictingAuthUser = findAuthUserByNickname(nickname, authUser.uid);
  if (conflictingAuthUser) {
    showAccountModalAlert("That nickname is already taken.");
    return;
  }

  const normalizedAuthUserId = normalizeUserId(authUser.uid);
  const currentNickname = userProfiles.find(profile => profile.id === normalizedAuthUserId)?.nickname || "";
  const isChangingNickname = normalize(currentNickname || "") !== normalize(nickname);
  if (isChangingNickname) {
    const selfConflictEntries = getNamedOpponentSelfConflictEntries(normalizedAuthUserId, nickname);
    if (selfConflictEntries.length) {
      showAccountModalAlert("That nickname is already used in your own unregistered-opponent history. Pick another nickname first.");
      return;
    }
  }

  authBusy = true;
  renderAuthUi();
  hideAccountModalAlert();

  try {
    const existingAppearance = getUserAppearance(authUser.uid);
    const userProfile = {
      id: normalizeUserId(authUser.uid),
      nickname,
      provider: getProviderLabel(authUser),
      accentColor: sanitizeAccentColor(profileDraft?.accentColor || existingAppearance.accentColor),
      showAdminUi: profileDraft?.showAdminUi ?? getAuthenticatedUserProfile()?.showAdminUi ?? true
    };

    await saveUserProfile(userProfile);
    upsertCurrentAuthProfile(userProfile);
    await updateAuthNickname(authUser, nickname);
    reconcileTrackedUserOpponentIdentities();
    const mergeResult = mergeNamedOpponentIntoTrackedUser({
      id: normalizeUserId(authUser.uid),
      name: nickname
    });
    if (mergeResult.blockedSelfConflicts.length) {
      throw new Error("nickname-self-conflict");
    }

    if (!isAdminCapableUser()) {
      impersonatedUserId = null;
    }
    applyEffectiveActiveUser();
    needsNicknameSetup = false;
    pendingAccentColor = userProfile.accentColor;
    if (elements.registerNicknameInput) {
      elements.registerNicknameInput.value = "";
    }
    if (successMessage) {
      showAccountModalAlert(successMessage);
    }
  } catch (error) {
    console.error("Failed to save profile.", error);
    showAccountModalAlert(error?.message === "nickname-self-conflict"
      ? "That nickname would collide with your own unregistered-opponent history. Pick another nickname first."
      : "Could not save that profile yet.");
  } finally {
    authBusy = false;
    refreshUserBoundUi();
  }
}

function handleAccentColorInput(event) {
  pendingAccentColor = sanitizeAccentColor(event.target?.value);
  renderProfileCustomizationControls();
}

function applyEffectiveActiveUser() {
  activeUserId = impersonatedUserId || getAuthenticatedUserId();
}

function handleAdminImpersonationChange() {
  if (!isAdminCapableUser()) {
    return;
  }

  const authenticatedUserId = getAuthenticatedUserId();
  const selectedUserId = normalizeUserId(elements.adminImpersonationSelect?.value || "");
  const canImpersonateSelectedUser = selectedUserId && users.some(user => user.id === selectedUserId);
  impersonatedUserId = canImpersonateSelectedUser && selectedUserId !== authenticatedUserId ? selectedUserId : null;
  applyEffectiveActiveUser();
  viewedPersonalStatsSubject = createTrackedPersonalStatsSubject(activeUserId);
  viewedEventParticipantSubject = null;
  closeRoundPrefillModal();
  refreshUserBoundUi();
  syncNavigationHistory("replace", getActiveScreenId());
  showAccountModalAlert(impersonatedUserId
    ? `Viewing as ${getUserName(impersonatedUserId)}.`
    : "Back to your account.");
}

async function handleToggleAdminUiVisibility() {
  if (!currentAuthUser || !isAdminCapableUser()) {
    return;
  }

  const nextShowAdminUi = getAuthenticatedUserProfile()?.showAdminUi === false;
  await saveProfileForCurrentUser({
    nickname: elements.nicknameInput?.value.trim() || getAuthenticatedUserName(),
    accentColor: pendingAccentColor,
    showAdminUi: nextShowAdminUi
  }, currentAuthUser, {
    successMessage: nextShowAdminUi ? "Admin UI enabled." : "Admin UI hidden."
  });
}

async function handleChangePassword() {
  if (!currentAuthUser) {
    showAccountModalAlert("Sign in before changing your password.");
    return;
  }

  if (!hasPasswordProvider()) {
    showAccountModalAlert("This account does not use password sign-in.");
    return;
  }

  const currentPassword = elements.currentPasswordInput?.value || "";
  const newPassword = elements.newPasswordInput?.value || "";
  const confirmPassword = elements.confirmPasswordInput?.value || "";

  if (!currentPassword || !newPassword || !confirmPassword) {
    showAccountModalAlert("Fill in your current password and the new password twice.");
    return;
  }

  if (newPassword.length < 6) {
    showAccountModalAlert("Choose a new password with at least 6 characters.");
    return;
  }

  if (newPassword !== confirmPassword) {
    showAccountModalAlert("The new passwords do not match.");
    return;
  }

  authBusy = true;
  renderAuthUi();
  hideAccountModalAlert();

  try {
    await changeCurrentUserPassword(currentPassword, newPassword);
    [
      elements.currentPasswordInput,
      elements.newPasswordInput,
      elements.confirmPasswordInput
    ].forEach(input => {
      if (input) {
        input.value = "";
      }
    });
    showAccountModalAlert("Password updated.");
  } catch (error) {
    console.error("Failed to change password.", error);
    showAccountModalAlert(getFriendlyAuthError(error));
  } finally {
    authBusy = false;
    renderAuthUi();
  }
}

async function handleSignOut() {
  authBusy = true;
  renderAuthUi();
  hideAccountModalAlert();

  try {
    await signOutCurrentUser();
    closeAccountModal();
    showScreen("start");
    syncNavigationHistory("replace", "screen-start");
  } catch (error) {
    showAccountModalAlert(getFriendlyAuthError(error));
  } finally {
    authBusy = false;
    renderAuthUi();
  }
}

function handleAuthPasswordKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    if (authModalMode === "register") {
      handleEmailRegister();
      return;
    }
    handleEmailSignIn();
  }
}

function handleRegisterNicknameKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleEmailRegister();
  }
}

function handleNicknameSaveKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleSaveNickname();
  }
}

function handlePasswordChangeKeydown(event) {
  if (event.key === "Enter") {
    event.preventDefault();
    handleChangePassword();
  }
}

function handleGlobalKeydown(event) {
  if (event.key !== "Escape") {
    return;
  }

  if (isAuthModalOpen) {
    closeAuthModal();
    return;
  }

  if (isRoundPrefillModalOpen) {
    closeRoundPrefillModal();
    return;
  }

  if (isAccountModalOpen) {
    closeAccountModal();
  }
}

function mergeProfileValues(primaryValue, fallbackValue, defaultValue = "") {
  return primaryValue || fallbackValue || defaultValue;
}

function normalizeArchetypes(value) {
  if (Array.isArray(value)) {
    return dedupeStrings(value.map(entry => String(entry || "").trim()).filter(Boolean));
  }

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  return [];
}

function mergeArchetypeValues(primaryValue, fallbackValue) {
  const primaryArchetypes = normalizeArchetypes(primaryValue);
  if (primaryArchetypes.length) {
    return primaryArchetypes;
  }

  return normalizeArchetypes(fallbackValue);
}

function mergeProfileRecords(targetProfile, sourceProfile) {
  return {
    ...targetProfile,
    pod: mergeProfileValues(targetProfile.pod, sourceProfile.pod, "Pod 1"),
    deckColors: mergeProfileValues(targetProfile.deckColors, sourceProfile.deckColors),
    splashColor: mergeProfileValues(targetProfile.splashColor, sourceProfile.splashColor),
    archetype: mergeArchetypeValues(targetProfile.archetype, sourceProfile.archetype)
  };
}

function mergeMatchRecords(targetEntry, sourceEntry) {
  return {
    ...sourceEntry,
    ...targetEntry,
    notes: mergeProfileValues(targetEntry.notes, sourceEntry.notes),
    score: mergeProfileValues(targetEntry.score, sourceEntry.score, "2-0"),
    result: mergeProfileValues(targetEntry.result, sourceEntry.result, "win")
  };
}

function handleTrackStart() {
  if (!ensureAuthenticatedForApp()) {
    return;
  }

  setDateInputToToday();
  setCalendarMonthFromDate(elements.dateInput.value);
  renderCalendar();
  syncDateView(elements.dateInput.value);
  showScreen("date");
  syncNavigationHistory("push", "screen-date");
}

function mergeNamedOpponentIntoTrackedUser(createdUser, options = {}) {
  const { persist = true, refreshSelection = true } = options;
  const normalizedName = normalize(String(createdUser?.name || "").trim());
  const normalizedUserId = normalizeUserId(createdUser?.id);
  if (!normalizedName || !normalizedUserId) {
    return {
      removedOpponentNames: [],
      updatedMatches: [],
      blockedSelfConflicts: []
    };
  }

  const blockedSelfConflicts = getNamedOpponentSelfConflictEntries(normalizedUserId, createdUser.name);
  if (blockedSelfConflicts.length) {
    return {
      removedOpponentNames: [],
      updatedMatches: [],
      blockedSelfConflicts
    };
  }

  const duplicateOpponents = customOpponents.filter(name => normalize(name) === normalizedName);

  for (let index = customOpponents.length - 1; index >= 0; index -= 1) {
    if (normalize(customOpponents[index]) === normalizedName) {
      customOpponents.splice(index, 1);
    }
  }

  const updatedMatches = [];
  matchEntries.forEach(entry => {
    if (entry.opponentKind !== "named" || !entry.opponentName) {
      return;
    }

    if (normalize(entry.opponentName) !== normalizedName) {
      return;
    }

    entry.opponentKind = "tracked";
    entry.opponentUserId = normalizedUserId;
    entry.opponentName = createdUser.name;
    updatedMatches.push(entry);
  });

  const selectedOpponentValue = elements.opponentSelect?.value || "";
  const shouldSelectTrackedUser = duplicateOpponents.some(name => selectedOpponentValue === `named:${name}`);

  if (viewedPersonalStatsSubject?.kind === "named" && normalize(viewedPersonalStatsSubject.name || "") === normalizedName) {
    viewedPersonalStatsSubject = createTrackedPersonalStatsSubject(normalizedUserId);
  }

  if (elements.opponentSelect && refreshSelection) {
    populateOpponentSelect(shouldSelectTrackedUser ? `user:${normalizedUserId}` : selectedOpponentValue);
  }

  if (persist) {
    duplicateOpponents.forEach(name => deleteCustomOpponentRecord(name));
    updatedMatches.forEach(entry => persistMatchEntryRecord(entry));
  }

  return {
    removedOpponentNames: duplicateOpponents,
    updatedMatches,
    blockedSelfConflicts: []
  };
}

function reconcileTrackedUserOpponentIdentities(options = {}) {
  const { persist = true, refreshSelection = true } = options;
  const blockedSelfConflicts = [];

  users.forEach(user => {
    const result = mergeNamedOpponentIntoTrackedUser(user, {
      persist,
      refreshSelection: false
    });

    if (result.blockedSelfConflicts.length) {
      blockedSelfConflicts.push(...result.blockedSelfConflicts);
    }
  });

  if (elements.opponentSelect && refreshSelection) {
    populateOpponentSelect(elements.opponentSelect.value || "npc");
  }

  return {
    blockedSelfConflicts
  };
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
  persistCustomLocationRecord(trimmedLocation);
}

function handleRemoveLocation() {
  const selectedLocation = elements.removeLocationSelect?.value || "";
  if (!selectedLocation) {
    showDuplicateAlert("Select a location to remove.");
    return;
  }

  const confirmation = window.confirm(`Remove location ${selectedLocation} from the quick-pick list?`);
  if (!confirmation) {
    return;
  }

  const locationIndex = customLocations.findIndex(location => normalize(location) === normalize(selectedLocation));
  if (locationIndex !== -1) {
    customLocations.splice(locationIndex, 1);
  }

  populateLocationSelect(elements.locationSelect.value === selectedLocation ? "" : elements.locationSelect.value);
  updateAdminUiState();
  updatePotentialDuplicateNotice();
  persistDeletedCustomLocation(selectedLocation);
}

function handleRemoveEvent() {
  const selectedValue = elements.removeEventSelect?.value || "";
  if (!selectedValue) {
    window.alert("Select an event to delete.");
    return;
  }

  const selectedEventId = normalizeRecordId(selectedValue);

  const event = events.find(entry => entry.id === selectedEventId);
  if (!event) {
    window.alert("That event could not be found.");
    populateRemoveEventSelect();
    return;
  }

  const confirmation = window.confirm(
    `Delete ${getEventAdminLabel(event)}?\n\nThis will remove the event, its participant profiles, and all logged rounds for it.`
  );

  if (!confirmation) {
    return;
  }

  deleteEventById(selectedEventId);
}

function handleEditEvent() {
  const selectedValue = elements.editEventSelect?.value || "";
  if (!selectedValue) {
    window.alert("Select an event to edit.");
    return;
  }

  const selectedEventId = normalizeRecordId(selectedValue);
  const event = events.find(entry => entry.id === selectedEventId);
  if (!event) {
    window.alert("That event could not be found.");
    populateEditEventSelect();
    return;
  }

  currentDate = event.date;
  if (elements.dateInput) {
    elements.dateInput.value = event.date;
  }
  setCalendarMonthFromDate(event.date);
  syncDateView(event.date);
  populateEventFormForEdit(event.id);
  showScreen("details");
  syncNavigationHistory("push", "screen-details");
}

function handleRemoveEventPlayerEventChange() {
  populateRemoveEventPlayerSelect(elements.removeEventPlayerEventSelect?.value || "");
}

function handleRemoveEventPlayer() {
  const selectedEventId = normalizeRecordId(elements.removeEventPlayerEventSelect?.value || "");
  const selectedUserId = normalizeUserId(elements.removeEventPlayerSelect?.value || "");

  if (!selectedEventId) {
    window.alert("Select an event first.");
    return;
  }

  if (!selectedUserId) {
    window.alert("Select a player to remove.");
    return;
  }

  const event = events.find(entry => entry.id === selectedEventId);
  const user = getUserRecord(selectedUserId);
  if (!event || !user) {
    window.alert("That event or player could not be found.");
    populateRemoveEventPlayerEventSelect(selectedEventId);
    return;
  }

  const confirmation = window.confirm(
    `Remove ${user.name} from ${getEventAdminLabel(event)}?\n\nThis will delete that player's event profile and all logged rounds in that event involving them.`
  );

  if (!confirmation) {
    return;
  }

  removePlayerFromEvent(selectedEventId, selectedUserId);
}

function handleEventFormatChange() {
  const defaultRounds = elements.eventFormatSelect.value === "Sealed" ? 6 : 3;
  elements.eventRoundsInput.value = String(defaultRounds);
}

function handleCreateOpponent() {
  const trimmedOpponent = elements.newOpponentInput.value.trim();
  if (!trimmedOpponent) {
    showMatchAlert("Enter an opponent name before adding one.");
    return;
  }

  const matchingTrackedUser = getTrackedUserByName(trimmedOpponent);
  if (matchingTrackedUser) {
    if (matchingTrackedUser.id === activeUserId) {
      showMatchAlert("That name already belongs to your registered player profile.");
      return;
    }

    populateOpponentSelect(`user:${matchingTrackedUser.id}`);
    elements.newOpponentInput.value = "";
    hideMatchAlert();
    handleOpponentSelectionChange();
    return;
  }

  const existingOptionValue = findExistingOpponentOptionValueByName(trimmedOpponent);
  if (existingOptionValue) {
    populateOpponentSelect(existingOptionValue);
    elements.newOpponentInput.value = "";
    hideMatchAlert();
    handleOpponentSelectionChange();
    return;
  }

  customOpponents.push(trimmedOpponent);
  replaceStringCollection(customOpponents, customOpponents);
  populateOpponentSelect(`named:${trimmedOpponent}`);
  elements.newOpponentInput.value = "";
  hideMatchAlert();
  handleOpponentSelectionChange();
  persistCustomOpponentRecord(trimmedOpponent);
}

function handleRemoveOpponent() {
  const selectedOpponent = elements.removeOpponentSelect?.value || "";
  if (!selectedOpponent) {
    showMatchAlert("Select an opponent to remove.");
    return;
  }

  const confirmation = window.confirm(`Remove opponent ${selectedOpponent} from the quick-pick list?`);
  if (!confirmation) {
    return;
  }

  const opponentIndex = customOpponents.findIndex(name => normalize(name) === normalize(selectedOpponent));
  if (opponentIndex !== -1) {
    customOpponents.splice(opponentIndex, 1);
  }

  const currentValue = elements.opponentSelect?.value || "npc";
  const nextValue = currentValue === `named:${selectedOpponent}` ? "npc" : currentValue;
  populateOpponentSelect(nextValue);
  updateAdminUiState();
  hideMatchAlert();
  deleteCustomOpponentRecord(selectedOpponent);
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
  matchInteractionState.score = true;
  updateScoreUi();
  attemptAutosaveCurrentRound();
}

function handleOpponentSelectionChange() {
  matchInteractionState.opponent = true;
  attemptAutosaveCurrentRound();
}

function handleMatchNotesInput() {
  attemptAutosaveCurrentRound();
}

function handleDoneWithMatch() {
  if (areAllRoundsLogged()) {
    attemptAutosaveCurrentRound({ force: true });
    showScreen("start");
    syncNavigationHistory("push", "screen-start");
    return;
  }

  attemptAutosaveCurrentRound({ force: true });
  if (areAllRoundsLogged()) {
    renderCurrentEventBanner();
    renderMatchRoundNav();
    loadMatchForSelectedRound();
    return;
  }

  const nextRound = getNextUnloggedRound();
  if (nextRound) {
    currentSelectedRound = nextRound;
    renderMatchRoundNav();
    loadMatchForSelectedRound();
  }
}

function handleSaveEvent(event) {
  event.preventDefault();

  const date = currentDate || elements.dateInput.value;
  const set = elements.setSelect.value;
  const format = elements.eventFormatSelect.value;
  const rounds = Number(elements.eventRoundsInput.value);
  const location = elements.locationSelect.value.trim();
  const podCount = Number(elements.podCountInput.value);
  const editingEvent = editingEventId ? events.find(entry => entry.id === editingEventId) : null;

  if (!date || !set || !format || !location || !Number.isInteger(rounds) || rounds < 1 || !Number.isInteger(podCount) || podCount < 1) {
    showDuplicateAlert("Set, format, rounds, location, and a valid pod count are required.");
    return;
  }

  const matchingEvents = getMatchingEvents(date, set, location, format)
    .filter(event => event.id !== editingEventId);
  const isSameSeries = editingEvent &&
    editingEvent.date === date &&
    editingEvent.set === set &&
    getNormalizedFormat(editingEvent.format) === getNormalizedFormat(format) &&
    normalize(editingEvent.location) === normalize(location);
  const nextIndex = isSameSeries && editingEvent
    ? editingEvent.index || 1
    : getNextIndexExcludingEvent(date, set, location, format, editingEventId);
  if (matchingEvents.length && !isSameSeries) {
    const confirmation = window.confirm(
      `An event with the same date, set, format, and location already exists. If you continue, you will create Event ${nextIndex}.`
    );

    if (!confirmation) {
      updatePotentialDuplicateNotice();
      return;
    }
  }

  if (editingEvent) {
    const previousSeries = {
      date: editingEvent.date,
      set: editingEvent.set,
      location: editingEvent.location,
      format: editingEvent.format
    };

    Object.assign(editingEvent, {
      date,
      set,
      index: nextIndex,
      format,
      rounds,
      location,
      podCount
    });

    reconcilePodsForEvent(editingEvent.id, podCount);
    persistEventRecord(editingEvent);
    reindexMatchingEventSeries(previousSeries.date, previousSeries.set, previousSeries.location, previousSeries.format);
    reindexMatchingEventSeries(date, set, location, format);
    editingEventId = null;
    syncDateView(date);
    renderActivityFeed();
    showScreen("date");
    syncNavigationHistory("replace", "screen-date");
    return;
  }

  const createdEvent = {
    id: createClientRecordId("evt"),
    date,
    set,
    index: nextIndex,
    format,
    rounds,
    location,
    podCount
  };

  events.push(createdEvent);
  currentEventId = createdEvent.id;
  currentMatchBack = "screen-details";
  elements.matchBackButton.dataset.back = currentMatchBack;
  seedPodsForEvent(currentEventId, podCount);
  persistEventRecord(createdEvent);
  syncDateView(date);
  renderMatchScreen();
  showScreen("match");
  syncNavigationHistory("push", "screen-match");
}

function attemptAutosaveCurrentRound(options = {}) {
  const { force = false } = options;
  if (!currentEventId || !activeUserId) {
    return false;
  }

  hideMatchAlert();
  saveCurrentProfile();

  const existingMatch = getMatchForCurrentRound();
  const opponent = getOpponentPayload({ silent: true });
  if (!opponent) {
    return false;
  }

  const selectedPod = elements.podSelect.value;
  if (!selectedPod) {
    return false;
  }

  const score = currentScore;
  if (!score) {
    return false;
  }

  const currentEvent = getCurrentEvent();
  const totalRounds = currentEvent?.rounds || 3;
  const round = currentSelectedRound;
  if (!Number.isInteger(round) || round < 1 || round > totalRounds) {
    return false;
  }

  const hasIntentToSave = force || Boolean(existingMatch) || matchInteractionState.opponent || matchInteractionState.score || Boolean(elements.matchNotesInput.value.trim());
  if (!hasIntentToSave) {
    return false;
  }

  const result = inferResultFromScore(score);

  const profile = getOrCreateEventProfile(currentEventId, activeUserId);

  const payload = {
    eventId: currentEventId,
    userId: activeUserId,
    round,
    pod: profile.pod,
    deckColors: profile.deckColors,
    splashColor: profile.splashColor,
    archetype: profile.archetype,
    opponentKind: opponent.kind,
    opponentUserId: opponent.userId,
    opponentName: opponent.name,
    result,
    score,
    notes: elements.matchNotesInput.value.trim()
  };

  const existingMatchIndex = matchEntries.findIndex(entry =>
    entry.eventId === currentEventId &&
    entry.userId === activeUserId &&
    entry.round === round
  );

  let persistedMatchEntry = null;

  if (existingMatchIndex !== -1) {
    matchEntries[existingMatchIndex] = {
      ...matchEntries[existingMatchIndex],
      ...payload
    };
    persistedMatchEntry = matchEntries[existingMatchIndex];
  } else {
    matchEntries.push({
      id: createClientRecordId("match"),
      ...payload
    });
    persistedMatchEntry = matchEntries[matchEntries.length - 1];
  }

  if (currentEvent) {
    persistEventRecord(currentEvent);
  }
  if (persistedMatchEntry) {
    persistMatchEntryRecord(persistedMatchEntry);
    syncTrackedMatchWithReciprocalEntry(persistedMatchEntry);
  }

  renderActivityFeed();
  renderDateEvents(currentEvent?.date || currentDate);
  renderCurrentEventBanner();
  renderMatchRoundNav();
  updateMatchActionButton();
  return true;
}

function getOpponentPayload(options = {}) {
  const { silent = false } = options;
  const selectedOpponent = elements.opponentSelect.value;
  if (!selectedOpponent) {
    if (!silent) {
      showMatchAlert("Select an opponent before saving.");
    }
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
    const opponentUserId = normalizeUserId(selectedOpponent.slice(5));
    if (opponentUserId === activeUserId) {
      if (!silent) {
        showMatchAlert("You cannot log yourself as the opponent.");
      }
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

function resetMatchForm(keepOpponentSelection = false) {
  currentScore = "2-0";
  matchInteractionState = {
    opponent: false,
    score: false
  };
  populateOpponentSelect(keepOpponentSelection ? elements.opponentSelect.value : "npc");
  elements.newOpponentInput.value = "";
  elements.matchNotesInput.value = "";
  updateScoreUi();
  updateMatchActionButton();
  hideMatchAlert();
}

function getReciprocalTrackedMatchEntry(eventId, userId, round) {
  const matches = matchEntries
    .filter(entry =>
      entry.eventId === eventId &&
      entry.round === round &&
      entry.opponentKind === "tracked" &&
      entry.opponentUserId === userId
    )
    .sort((left, right) => getMatchActivityTimestamp(right) - getMatchActivityTimestamp(left));

  return matches[0] || null;
}

function prefillRoundFromOpponentEntry(sourceEntry) {
  if (!sourceEntry) {
    resetMatchForm();
    return;
  }

  currentScore = getMirroredScore(sourceEntry.score) || "2-0";
  matchInteractionState = {
    opponent: false,
    score: false
  };
  populateOpponentSelect(`user:${sourceEntry.userId}`);
  elements.newOpponentInput.value = "";
  elements.matchNotesInput.value = "";
  updateMatchActionButton();
  updateScoreUi();
  hideMatchAlert();
}

function getRoundPrefillKey(sourceEntry) {
  if (!sourceEntry) {
    return "";
  }

  return `${sourceEntry.eventId}:${sourceEntry.round}:${sourceEntry.userId}:${sourceEntry.opponentUserId || ""}:${sourceEntry.id || ""}`;
}

function getMirroredMatchResult(result) {
  if (result === "win") {
    return "loss";
  }

  if (result === "loss") {
    return "win";
  }

  return "draw";
}

function getMirroredScore(score) {
  if (!score || score === "BYE") {
    return score;
  }

  const [won, lost] = String(score).split("-");
  return `${lost || 0}-${won || 0}`;
}

function syncTrackedMatchWithReciprocalEntry(matchEntry) {
  if (matchEntry.opponentKind !== "tracked" || !matchEntry.opponentUserId) {
    return;
  }

  const reciprocalIndex = matchEntries.findIndex(entry =>
    entry.eventId === matchEntry.eventId &&
    entry.round === matchEntry.round &&
    entry.userId === matchEntry.opponentUserId &&
    entry.opponentKind === "tracked" &&
    entry.opponentUserId === matchEntry.userId
  );

  if (reciprocalIndex === -1) {
    return;
  }

  const reciprocalEntry = matchEntries[reciprocalIndex];
  const mirroredScore = getMirroredScore(matchEntry.score);
  const mirroredResult = getMirroredMatchResult(matchEntry.result);

  const hasSharedChange =
    reciprocalEntry.score !== mirroredScore ||
    reciprocalEntry.result !== mirroredResult ||
    reciprocalEntry.opponentName !== getUserName(matchEntry.userId);

  if (!hasSharedChange) {
    return;
  }

  matchEntries[reciprocalIndex] = {
    ...reciprocalEntry,
    opponentKind: "tracked",
    opponentUserId: matchEntry.userId,
    opponentName: getUserName(matchEntry.userId),
    score: mirroredScore,
    result: mirroredResult
  };

  persistMatchEntryRecord(matchEntries[reciprocalIndex]);
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
  if (!elements.activeUserSelect) {
    return;
  }

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
  if (isAdminUiEnabled()) {
    populateRemoveUserSelect();
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
  if (isAdminUiEnabled()) {
    populateRemoveLocationSelect();
  }
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

function populateSplashColorSelect(selectedValue = "") {
  elements.splashColorSelect.innerHTML = '<option value="">None</option>';
  const monoGroup = colorGroups.find(group => group.label === "Mono");
  (monoGroup?.options || []).forEach(optionData => {
    const option = document.createElement("option");
    option.value = optionData.value;
    option.textContent = optionData.label;
    option.dataset.data = JSON.stringify({
      label: optionData.label,
      manaCode: optionData.value,
      text: optionData.label
    });
    elements.splashColorSelect.appendChild(option);
  });
  elements.splashColorSelect.value = selectedValue || "";

  if (enhancedSelects.splashColors) {
    initializeSplashColorSelectEnhancer();
  }
}

function populateArchetypeSelect(selectedValue = "") {
  const selectedArchetypes = normalizeArchetypes(selectedValue);
  elements.archetypeSelect.innerHTML = "";
  archetypeOptions.forEach(archetype => {
    const option = document.createElement("option");
    option.value = archetype;
    option.textContent = archetype;
    option.selected = selectedArchetypes.includes(archetype);
    elements.archetypeSelect.appendChild(option);
  });

  if (enhancedSelects.archetypes) {
    initializeArchetypeSelectEnhancer();
  }
}

function populateOpponentSelect(selectedValue = "") {
  if (!elements.opponentSelect) {
    return;
  }

  replaceStringCollection(customOpponents, customOpponents);
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
    .filter(name => !getTrackedUserByName(name))
    .sort((left, right) => left.localeCompare(right))
    .forEach(name => {
      const option = document.createElement("option");
      option.value = `named:${name}`;
      option.textContent = name;
      elements.opponentSelect.appendChild(option);
    });

  const optionValues = [...elements.opponentSelect.options].map(option => option.value);
  elements.opponentSelect.value = optionValues.includes(selectedValue) ? selectedValue : "npc";
  if (isAdminUiEnabled()) {
    populateRemoveOpponentSelect();
  }
}

function findExistingOpponentOptionValueByName(name) {
  const normalizedName = normalize(name);
  const trackedOpponent = getTrackedUserByNormalizedName(normalizedName, activeUserId);
  if (trackedOpponent) {
    return `user:${trackedOpponent.id}`;
  }

  const existingNamedOpponent = dedupeStrings(customOpponents).find(entry => normalize(entry) === normalizedName);
  if (existingNamedOpponent) {
    return `named:${existingNamedOpponent}`;
  }

  return "";
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

function getActiveScreenId() {
  return Object.values(screens).find(screen => screen.classList.contains("active"))?.id || "screen-start";
}

function isManagedNavigationState(state) {
  return Boolean(state && state.__draftStatsNavigation === true);
}

function cloneViewedPersonalStatsSubject(subject) {
  if (!subject || typeof subject !== "object") {
    return null;
  }

  if (subject.kind === "tracked") {
    return createTrackedPersonalStatsSubject(subject.userId);
  }

  if (subject.kind === "named") {
    return createNamedOpponentPersonalStatsSubject(subject.name);
  }

  return null;
}

function createNavigationState(screenId = getActiveScreenId()) {
  return {
    __draftStatsNavigation: true,
    historyIndex: navigationHistoryIndex,
    screenId,
    currentDate: currentDate || elements.dateInput?.value || getTodayIsoLocal(),
    currentCalendarMonth: currentCalendarMonth || getMonthStartIso(currentDate || elements.dateInput?.value || getTodayIsoLocal()),
    currentEventId: currentEventId || "",
    editingEventId: editingEventId || "",
    impersonatedUserId: impersonatedUserId || "",
    currentMatchBack,
    currentSelectedRound,
    viewedPersonalStatsSubject: cloneViewedPersonalStatsSubject(viewedPersonalStatsSubject),
    viewedEventParticipantSubject: cloneViewedEventParticipantSubject(viewedEventParticipantSubject),
    statsBackId: elements.statsBackButton?.dataset.back || "screen-start",
    friendsBackId: elements.friendsStatsBackButton?.dataset.back || "screen-start",
    opponentsBackId: elements.opponentsStatsBackButton?.dataset.back || "screen-start",
    personalBackId: elements.personalStatsBackButton?.dataset.back || "screen-start",
    eventPlayerBackId: elements.eventPlayerStatsBackButton?.dataset.back || "screen-date"
  };
}

function applyNavigationState(state) {
  const nextState = isManagedNavigationState(state) ? state : createNavigationState();
  const nextDate = nextState.currentDate || elements.dateInput?.value || getTodayIsoLocal();
  currentCalendarMonth = nextState.currentCalendarMonth || getMonthStartIso(nextDate);
  syncDateView(nextDate);

  currentEventId = nextState.currentEventId || null;
  editingEventId = nextState.editingEventId || null;
  impersonatedUserId = isAdminCapableUser() && nextState.impersonatedUserId
    ? normalizeUserId(nextState.impersonatedUserId)
    : null;
  applyEffectiveActiveUser();
  currentMatchBack = nextState.currentMatchBack || "screen-date";
  currentSelectedRound = Number.isInteger(nextState.currentSelectedRound) ? nextState.currentSelectedRound : Number(nextState.currentSelectedRound) || 1;
  viewedPersonalStatsSubject = cloneViewedPersonalStatsSubject(nextState.viewedPersonalStatsSubject) || createTrackedPersonalStatsSubject(activeUserId);
  viewedEventParticipantSubject = cloneViewedEventParticipantSubject(nextState.viewedEventParticipantSubject);

  if (elements.matchBackButton) {
    elements.matchBackButton.dataset.back = currentMatchBack;
  }
  if (elements.statsBackButton) {
    elements.statsBackButton.dataset.back = nextState.statsBackId || "screen-start";
  }
  if (elements.friendsStatsBackButton) {
    elements.friendsStatsBackButton.dataset.back = nextState.friendsBackId || "screen-start";
  }
  if (elements.opponentsStatsBackButton) {
    elements.opponentsStatsBackButton.dataset.back = nextState.opponentsBackId || "screen-start";
  }
  if (elements.personalStatsBackButton) {
    elements.personalStatsBackButton.dataset.back = nextState.personalBackId || "screen-start";
  }
  if (elements.eventPlayerStatsBackButton) {
    elements.eventPlayerStatsBackButton.dataset.back = nextState.eventPlayerBackId || "screen-date";
  }

  switch (nextState.screenId) {
    case "screen-date":
      showScreen("date");
      return;
    case "screen-details":
      currentDate = nextDate;
      if (elements.selectedDatePill) {
        elements.selectedDatePill.textContent = formatDate(currentDate);
      }
      if (editingEventId) {
        populateEventFormForEdit(editingEventId);
      } else {
        resetEventForm();
      }
      updatePotentialDuplicateNotice();
      showScreen("details");
      return;
    case "screen-match":
      if (getCurrentEvent() && ensureAuthenticatedSilently()) {
        renderMatchScreen();
        showScreen("match");
      } else {
        showScreen("date");
      }
      return;
    case "screen-stats":
      renderGlobalStats();
      showScreen("stats");
      return;
    case "screen-friends-stats":
      renderFriendsStats();
      showScreen("friendsStats");
      return;
    case "screen-opponents-stats":
      renderOpponentsStats();
      showScreen("opponentsStats");
      return;
    case "screen-personal-stats":
      if (ensureAuthenticatedSilently()) {
        renderPersonalStatsPage();
        showScreen("personalStats");
      } else {
        showScreen("start");
      }
      return;
    case "screen-event-player-stats":
      if (ensureAuthenticatedSilently() && viewedEventParticipantSubject?.eventId) {
        renderEventParticipantStatsPage();
        showScreen("eventPlayerStats");
      } else {
        showScreen("date");
      }
      return;
    case "screen-start":
    default:
      showScreen("start");
  }
}

function syncNavigationHistory(mode = "push", screenId = getActiveScreenId()) {
  if (isRestoringNavigationState || typeof window === "undefined" || !window.history) {
    return;
  }

  if (mode === "push") {
    navigationHistoryIndex += 1;
    window.history.pushState({
      ...createNavigationState(screenId),
      historyIndex: navigationHistoryIndex
    }, "");
    return;
  }

  const existingState = window.history.state;
  if (isManagedNavigationState(existingState) && Number.isInteger(existingState.historyIndex)) {
    navigationHistoryIndex = existingState.historyIndex;
  }

  window.history.replaceState({
    ...createNavigationState(screenId),
    historyIndex: navigationHistoryIndex
  }, "");
}

function initializeNavigationHistory() {
  if (typeof window === "undefined" || !window.history) {
    return;
  }

  const existingState = window.history.state;
  if (isManagedNavigationState(existingState) && Number.isInteger(existingState.historyIndex)) {
    navigationHistoryIndex = existingState.historyIndex;
    return;
  }

  navigationHistoryIndex = 0;
  syncNavigationHistory("replace");
}

function handleBrowserPopState(event) {
  if (!isManagedNavigationState(event.state)) {
    return;
  }

  navigationHistoryIndex = Number.isInteger(event.state.historyIndex) ? event.state.historyIndex : 0;
  isRestoringNavigationState = true;
  try {
    applyNavigationState(event.state);
  } finally {
    isRestoringNavigationState = false;
  }
}

function handleBackNavigation(fallbackScreenId = "screen-start") {
  if (typeof window !== "undefined" && window.history && navigationHistoryIndex > 0) {
    window.history.back();
    return;
  }

  const fallbackState = {
    ...createNavigationState(fallbackScreenId),
    screenId: fallbackScreenId
  };
  applyNavigationState(fallbackState);
  syncNavigationHistory("replace", fallbackScreenId);
}

function handleHomeNavigation() {
  showScreen("start");
  syncNavigationHistory("push", "screen-start");
}

function updateHomeNavVisibility() {
  if (!elements.homeNavButton) {
    return;
  }

  elements.homeNavButton.classList.toggle("d-none", getActiveScreenId() === "screen-start");
}

function showScreen(name) {
  Object.values(screens).forEach(screen => screen.classList.remove("active"));
  screens[name].classList.add("active");
  if (name !== "match") {
    closeRoundPrefillModal();
  }
  updateAdminUiState();
  updateHomeNavVisibility();
}

function showScreenById(id) {
  Object.values(screens).forEach(screen => screen.classList.remove("active"));
  document.getElementById(id).classList.add("active");
  if (id !== "screen-match") {
    closeRoundPrefillModal();
  }
  updateAdminUiState();
  updateHomeNavVisibility();
}

function syncDateView(date) {
  currentDate = date;
  elements.dateInput.value = date;
  updateSelectedDateLabel(date);
  renderCalendar();
  renderDateEvents(date);
}

function renderCalendar() {
  if (!currentCalendarMonth) {
    currentCalendarMonth = getMonthStartIso(currentDate || elements.dateInput.value || getTodayIsoLocal());
  }

  const monthDate = parseIsoDate(currentCalendarMonth);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1, 12);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7;
  const gridStart = new Date(year, month, 1 - firstWeekday, 12);
  const today = getTodayIsoLocal();

  elements.calendarMonthLabel.textContent = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric"
  }).format(monthDate);

  elements.calendarGrid.innerHTML = "";

  for (let index = 0; index < 42; index += 1) {
    const cellDate = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index, 12);
    const iso = formatDateAsIso(cellDate);
    const dayEvents = getEventsOnDate(iso);
    const eventCount = dayEvents.length;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day";
    button.textContent = String(cellDate.getDate());

    if (cellDate.getMonth() !== month) {
      button.classList.add("is-outside");
    }
    if (iso === currentDate) {
      button.classList.add("is-selected");
    }
    if (iso === today) {
      button.classList.add("is-today");
    }
    if (eventCount > 0) {
      button.classList.add("has-events");
      button.dataset.eventCount = String(eventCount);
      button.style.setProperty("--calendar-event-accent", getEventColorForDate(dayEvents));
    }

    button.addEventListener("click", () => {
      if (cellDate.getMonth() !== month) {
        currentCalendarMonth = getMonthStartIso(iso);
      }
      syncDateView(iso);
    });

    elements.calendarGrid.appendChild(button);
  }
}

function renderDateEvents(date) {
  const dayEvents = getEventsOnDate(date);
  elements.dateEventList.innerHTML = "";
  elements.dateEventCount.textContent = `${dayEvents.length} event${dayEvents.length === 1 ? "" : "s"}`;
  elements.dateEventEmpty.classList.toggle("d-none", dayEvents.length > 0);
  populateRemoveEventSelect();

  dayEvents.forEach(event => {
    const set = getSet(event.set);
    const participantsMarkup = renderEventParticipantsSummary(event.id);
    const wrapper = document.createElement("article");
    wrapper.className = "event-option";

    const card = document.createElement("div");
    card.className = "event-option-body";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `Open ${getEventAdminLabel(event)}`);
    card.style.setProperty("--event-format-accent", getFormatColor(event.format));
    card.innerHTML = `
        <div class="list-title-row">
          <div>
              <div class="fw-bold">${formatCompactEventLabel(event)}</div>
              <div class="small text-secondary mt-1">${set ? set.name : event.set} - ${event.format || "Draft"} - ${event.rounds || 3} rounds</div>
              ${participantsMarkup}
          </div>
          <div class="set-badge" style="background:${getFormatColor(event.format)}">
            ${set?.iconSvgUri ? renderSetIcon(set) : `<span class="set-badge-code">${escapeHtml(event.set)}</span>`}
          </div>
        </div>
      `;

    card.addEventListener("click", eventObject => {
      if (eventObject.target.closest("[data-event-player-user], [data-event-player-opponent], [data-personal-stats-user], [data-personal-stats-opponent]")) {
        return;
      }
      chooseExistingEvent(event.id);
    });
    card.addEventListener("keydown", eventObject => {
      if (eventObject.key !== "Enter" && eventObject.key !== " ") {
        return;
      }
      eventObject.preventDefault();
      chooseExistingEvent(event.id);
    });
    wrapper.appendChild(card);
    elements.dateEventList.appendChild(wrapper);
  });
}

function handleCalendarToday() {
  const today = getTodayIsoLocal();
  setDateInputToToday();
  setCalendarMonthFromDate(today);
  syncDateView(today);
}

function shiftCalendarMonth(delta) {
  const monthDate = parseIsoDate(currentCalendarMonth || getMonthStartIso(currentDate || getTodayIsoLocal()));
  const shifted = new Date(monthDate.getFullYear(), monthDate.getMonth() + delta, 1, 12);
  currentCalendarMonth = formatDateAsIso(shifted);
  renderCalendar();
}

function enterDetailsStep() {
  if (!elements.dateInput.value) {
    elements.dateInput.focus();
    return;
  }

  currentDate = elements.dateInput.value;
  elements.selectedDatePill.textContent = formatDate(currentDate);
  editingEventId = null;
  resetEventForm();
  updatePotentialDuplicateNotice();
  showScreen("details");
  syncNavigationHistory("push", "screen-details");
}

function resetEventForm() {
  editingEventId = null;
  updateEventDetailsMode();
  if (enhancedSelects.set) {
    enhancedSelects.set.setValue("", true);
  } else {
    elements.setSelect.value = "";
  }
  elements.eventFormatSelect.value = "Draft";
  elements.eventRoundsInput.value = "3";
  populateLocationSelect();
  elements.podCountInput.value = "1";
  elements.newLocationInput.value = "";
  updateSetPreview();
  hideDuplicateAlert();
}

function populateEventFormForEdit(eventId) {
  const event = events.find(entry => entry.id === normalizeRecordId(eventId));
  if (!event) {
    resetEventForm();
    return;
  }

  editingEventId = event.id;
  currentDate = event.date;
  if (elements.selectedDatePill) {
    elements.selectedDatePill.textContent = formatDate(currentDate);
  }
  updateEventDetailsMode();

  if (enhancedSelects.set) {
    enhancedSelects.set.setValue(event.set || "", true);
  } else {
    elements.setSelect.value = event.set || "";
  }

  elements.eventFormatSelect.value = getNormalizedFormat(event.format);
  elements.eventRoundsInput.value = String(event.rounds || 3);
  populateLocationSelect(event.location || "");
  elements.podCountInput.value = String(event.podCount || 1);
  elements.newLocationInput.value = "";
  updateSetPreview();
  updatePotentialDuplicateNotice();
}

function updateEventDetailsMode() {
  const isEditing = Boolean(editingEventId);
  if (elements.eventDetailsTitle) {
    elements.eventDetailsTitle.textContent = isEditing ? "Edit event" : "Create new event";
  }
  if (elements.saveEventButton) {
    elements.saveEventButton.textContent = isEditing ? "Save changes" : "Save / Create";
  }
}

function chooseExistingEvent(eventId) {
  currentEventId = eventId;
  currentMatchBack = "screen-date";
  elements.matchBackButton.dataset.back = currentMatchBack;
  renderMatchScreen();
  showScreen("match");
  syncNavigationHistory("push", "screen-match");
}

function renderMatchScreen() {
  const event = getCurrentEvent();
  if (!event || !activeUserId) {
    return;
  }

  ensureDefaultPod(event.id);
  const hadProfile = eventProfiles.some(entry => entry.eventId === event.id && entry.userId === activeUserId);
  const profile = getOrCreateEventProfile(event.id, activeUserId);
  if (!hadProfile) {
    persistEventProfileRecord(profile);
  }
  populatePodSelect(profile.pod);
  populateDeckColorSelect(profile.deckColors);
  populateSplashColorSelect(profile.splashColor);
  populateArchetypeSelect(profile.archetype);
  populateOpponentSelect();
  selectBestNextRound();
  renderDateEvents(event.date);
  renderCurrentEventBanner();
  renderMatchRoundNav();
  loadMatchForSelectedRound();
}

function saveCurrentProfile() {
  if (!currentEventId || !activeUserId) {
    return;
  }

  const profile = getOrCreateEventProfile(currentEventId, activeUserId);
  profile.pod = elements.podSelect.value || "Pod 1";
  profile.deckColors = elements.deckColorSelect.value;
  profile.splashColor = elements.splashColorSelect.value;
  profile.archetype = [...elements.archetypeSelect.selectedOptions]
    .map(option => option.value)
    .filter(Boolean);
  const currentEvent = getCurrentEvent();
  if (currentEvent) {
    persistEventRecord(currentEvent);
  }
  persistEventProfileRecord(profile);
}

function renderCurrentEventBanner() {
  const event = getCurrentEvent();
  if (!event || !activeUserId) {
    return;
  }

  const set = getSet(event.set);
  const duplicateSeries = getMatchingEvents(event.date, event.set, event.location, event.format).length > 1;
  const podLabels = getPodsForEvent(event.id);
  const loggedRounds = getMatchesForCurrentPlayerEvent().length;
  const format = event.format || "Draft";
  const subtitleParts = [];

  if (duplicateSeries) {
    subtitleParts.push(`Event ${event.index}`);
  }

  elements.currentEventBanner.innerHTML = `
    <div class="compact-banner">
      <div class="compact-banner-heading">
        <div class="compact-banner-title">${format} - ${event.set}${set ? ` - ${set.name}` : ""}</div>
        <div class="compact-banner-date">${formatDate(event.date)}</div>
      </div>
      ${subtitleParts.length ? `<div class="compact-banner-subtitle">${subtitleParts.join(" - ")}</div>` : ""}
      <div class="event-meta compact-banner-meta">
        <span class="meta-pill">${getActiveUserName()}</span>
        <span class="meta-pill">${event.location}</span>
        <span class="meta-pill">${loggedRounds}/${event.rounds || 3} rounds</span>
        <span class="meta-pill">${podLabels.length} pod${podLabels.length === 1 ? "" : "s"}</span>
      </div>
    </div>
  `;
}

function getEventParticipants(eventId) {
  const trackedParticipants = new Map();
  const mockParticipants = new Map();

  eventProfiles
    .filter(profile => profile.eventId === eventId && profile.userId)
    .forEach(profile => {
      const userId = normalizeUserId(profile.userId);
      const name = getUserName(userId);
      if (name !== "Unknown player") {
        trackedParticipants.set(userId, {
          kind: "tracked",
          id: userId,
          name
        });
      }
    });

  matchEntries
    .filter(entry => entry.eventId === eventId)
    .forEach(entry => {
      const reporterId = normalizeUserId(entry.userId);
      const reporterName = getUserName(reporterId);
      if (reporterId && reporterName !== "Unknown player") {
        trackedParticipants.set(reporterId, {
          kind: "tracked",
          id: reporterId,
          name: reporterName
        });
      }

      if (entry.opponentKind === "tracked" && entry.opponentUserId) {
        const opponentId = normalizeUserId(entry.opponentUserId);
        const opponentName = getUserName(opponentId);
        if (opponentName !== "Unknown player") {
          trackedParticipants.set(opponentId, {
            kind: "tracked",
            id: opponentId,
            name: opponentName
          });
        }
      }

      if (entry.opponentKind === "named" && entry.opponentName) {
        const opponentName = entry.opponentName.trim();
        if (opponentName && normalize(opponentName) !== "npc opponent") {
          mockParticipants.set(normalize(opponentName), {
            kind: "mock",
            name: opponentName
          });
        }
      }
    });

  const trackedNameSet = new Set(
    [...trackedParticipants.values()].map(participant => normalize(participant.name))
  );

  const orderedTrackedParticipants = [...trackedParticipants.values()]
    .sort((left, right) => left.name.localeCompare(right.name));
  const orderedMockParticipants = [...mockParticipants.values()]
    .filter(participant => !trackedNameSet.has(normalize(participant.name)))
    .sort((left, right) => left.name.localeCompare(right.name));

  return [...orderedTrackedParticipants, ...orderedMockParticipants];
}

function renderEventParticipantsSummary(eventId) {
  const participants = getEventParticipants(eventId);
  if (!participants.length) {
    return "";
  }

  return `
    <div class="event-participant-block">
      <div class="event-participant-label">Participants</div>
      <div class="event-participant-row">
        ${participants.map(participant => renderEventParticipantChip(participant, eventId)).join("")}
      </div>
    </div>
  `;
}

function renderEventParticipantChip(participant, eventId) {
  const isMock = participant.kind === "mock";
  const canOpenTrackedStats = participant.kind === "tracked" && participant.id;
  const canOpenOpponentStats = isMock && participant.name && normalize(participant.name) !== "npc opponent";
  const tagName = canOpenTrackedStats || canOpenOpponentStats ? "button type=\"button\"" : "span";
  const dataAttributes = canOpenTrackedStats
    ? ` data-event-player-user="${escapeHtml(participant.id)}" data-event-player-event="${escapeHtml(eventId)}" data-event-player-back="screen-date"`
    : canOpenOpponentStats
      ? ` data-event-player-opponent="${escapeHtml(participant.name)}" data-event-player-event="${escapeHtml(eventId)}" data-event-player-back="screen-date"`
      : "";
  return `
    <${tagName} class="event-participant-chip${isMock ? " is-mock" : ""}${canOpenTrackedStats || canOpenOpponentStats ? " is-clickable" : ""}"${dataAttributes}>
      ${canOpenTrackedStats
        ? renderTrackedPlayerAvatar(participant.name, participant.id, "event-participant-avatar")
        : renderBasicPlayerAvatar(participant.name, "event-participant-avatar")}
      <span class="event-participant-name">${escapeHtml(participant.name)}</span>
    </${canOpenTrackedStats || canOpenOpponentStats ? "button" : "span"}>
  `;
}

function getParticipantMonogram(name) {
  const parts = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "?";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
}

function renderMatchRoundNav() {
  const event = getCurrentEvent();
  if (!event) {
    elements.matchRoundNav.innerHTML = "";
    return;
  }

  const totalRounds = event.rounds || 3;
  const loggedRounds = new Set(getMatchesForCurrentPlayerEvent().map(entry => entry.round));
  const allRoundsComplete = loggedRounds.size >= totalRounds;

  elements.matchRoundNav.innerHTML = "";
  for (let round = 1; round <= totalRounds; round += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "round-chip";
    button.textContent = String(round);
    if (round === currentSelectedRound) {
      button.classList.add("is-active");
    }
    if (loggedRounds.has(round)) {
      button.classList.add("is-complete");
    }
    if (allRoundsComplete) {
      button.classList.add("is-all-complete");
    }

    button.addEventListener("click", () => {
      currentSelectedRound = round;
      renderMatchRoundNav();
      loadMatchForSelectedRound();
    });

    elements.matchRoundNav.appendChild(button);
  }
}

function loadMatchForSelectedRound() {
  const existingMatch = getMatchForCurrentRound();
  if (existingMatch) {
    currentScore = existingMatch.score || "2-0";
    matchInteractionState = {
      opponent: true,
      score: true
    };
    populateOpponentSelect(getOpponentSelectValue(existingMatch));
    elements.newOpponentInput.value = "";
    elements.matchNotesInput.value = existingMatch.notes || "";
    updateMatchActionButton();
    updateScoreUi();
    hideMatchAlert();
    lastShownRoundPrefillKey = "";
    closeRoundPrefillModal();
    return;
  }

  const reciprocalEntry = getReciprocalTrackedMatchEntry(currentEventId, activeUserId, currentSelectedRound);
  if (reciprocalEntry) {
    prefillRoundFromOpponentEntry(reciprocalEntry);
    const prefillKey = getRoundPrefillKey(reciprocalEntry);
    if (prefillKey !== lastShownRoundPrefillKey) {
      openRoundPrefillModal(reciprocalEntry);
      lastShownRoundPrefillKey = prefillKey;
    }
    return;
  }

  lastShownRoundPrefillKey = "";
  closeRoundPrefillModal();
  resetMatchForm();
}

function selectBestNextRound() {
  const event = getCurrentEvent();
  if (!event) {
    currentSelectedRound = 1;
    return;
  }

  const totalRounds = event.rounds || 3;
  const loggedRounds = new Set(getMatchesForCurrentPlayerEvent().map(entry => entry.round));
  for (let round = 1; round <= totalRounds; round += 1) {
    if (!loggedRounds.has(round)) {
      currentSelectedRound = round;
      return;
    }
  }
  currentSelectedRound = totalRounds;
}

function getNextUnloggedRound() {
  const event = getCurrentEvent();
  if (!event) {
    return null;
  }

  const totalRounds = event.rounds || 3;
  const loggedRounds = new Set(getMatchesForCurrentPlayerEvent().map(entry => entry.round));
  for (let round = 1; round <= totalRounds; round += 1) {
    if (!loggedRounds.has(round)) {
      return round;
    }
  }

  return null;
}

function areAllRoundsLogged() {
  const event = getCurrentEvent();
  if (!event) {
    return false;
  }

  return getMatchesForCurrentPlayerEvent().length >= (event.rounds || 3);
}

function updateMatchActionButton() {
  if (areAllRoundsLogged()) {
    elements.saveMatchButton.textContent = "Done";
    return;
  }

  elements.saveMatchButton.textContent = `Save round ${currentSelectedRound}`;
}

function getMatchForCurrentRound() {
  return matchEntries.find(entry =>
    entry.eventId === currentEventId &&
    entry.userId === activeUserId &&
    entry.round === currentSelectedRound
  ) || null;
}

function getOpponentSelectValue(matchEntry) {
  if (!matchEntry) {
    return "npc";
  }
  if (matchEntry.opponentKind === "tracked" && matchEntry.opponentUserId) {
    return `user:${matchEntry.opponentUserId}`;
  }
  if (matchEntry.opponentKind === "named" && matchEntry.opponentName) {
    return `named:${matchEntry.opponentName}`;
  }
  return "npc";
}

function updateScoreUi() {
  elements.scoreRow.querySelectorAll("[data-score]").forEach(button => {
    button.classList.toggle("active", button.dataset.score === currentScore);
  });
}

function openGlobalStats(backId) {
  if (!ensureAuthenticatedForApp()) {
    return;
  }

  elements.statsBackButton.dataset.back = backId;
  renderGlobalStats();
  showScreen("stats");
  syncNavigationHistory("push", "screen-stats");
}

function openStats(backId) {
  openGlobalStats(backId);
}

function openFriendsStats(backId) {
  if (!ensureAuthenticatedForApp()) {
    return;
  }

  elements.friendsStatsBackButton.dataset.back = backId;
  renderFriendsStats();
  showScreen("friendsStats");
  syncNavigationHistory("push", "screen-friends-stats");
}

function openOpponentsStats(backId) {
  if (!ensureAuthenticatedForApp()) {
    return;
  }

  elements.opponentsStatsBackButton.dataset.back = backId;
  renderOpponentsStats();
  showScreen("opponentsStats");
  syncNavigationHistory("push", "screen-opponents-stats");
}

function openPersonalStats(backId) {
  if (!ensureAuthenticatedForApp()) {
    return;
  }

  openPersonalStatsForUser(activeUserId, backId);
}

function openPersonalStatsForUser(userId, backId = "screen-start") {
  if (!ensureAuthenticatedForApp()) {
    return;
  }

  const normalizedUserId = normalizeUserId(userId);
  if (!normalizedUserId || !users.some(user => user.id === normalizedUserId)) {
    return;
  }

  viewedPersonalStatsSubject = createTrackedPersonalStatsSubject(normalizedUserId);
  elements.personalStatsBackButton.dataset.back = backId;
  renderPersonalStatsPage();
  showScreen("personalStats");
  syncNavigationHistory("push", "screen-personal-stats");
}

function openPersonalStatsForOpponent(name, backId = "screen-start") {
  if (!ensureAuthenticatedForApp()) {
    return;
  }

  const normalizedName = String(name || "").trim();
  if (!normalizedName || normalize(normalizedName) === "npc opponent") {
    return;
  }

  viewedPersonalStatsSubject = createNamedOpponentPersonalStatsSubject(normalizedName);
  elements.personalStatsBackButton.dataset.back = backId;
  renderPersonalStatsPage();
  showScreen("personalStats");
  syncNavigationHistory("push", "screen-personal-stats");
}

function openEventParticipantStatsForUser(userId, eventId, backId = "screen-date") {
  if (!ensureAuthenticatedForApp()) {
    return;
  }

  const normalizedUserId = normalizeUserId(userId);
  const normalizedEventId = normalizeRecordId(eventId);
  if (!normalizedUserId || !normalizedEventId) {
    return;
  }

  viewedEventParticipantSubject = createTrackedEventParticipantSubject(normalizedUserId, normalizedEventId);
  elements.eventPlayerStatsBackButton.dataset.back = backId;
  renderEventParticipantStatsPage();
  showScreen("eventPlayerStats");
  syncNavigationHistory("push", "screen-event-player-stats");
}

function openEventParticipantStatsForOpponent(name, eventId, backId = "screen-date") {
  if (!ensureAuthenticatedForApp()) {
    return;
  }

  const normalizedName = String(name || "").trim();
  const normalizedEventId = normalizeRecordId(eventId);
  if (!normalizedName || !normalizedEventId) {
    return;
  }

  viewedEventParticipantSubject = createNamedEventParticipantSubject(normalizedName, normalizedEventId);
  elements.eventPlayerStatsBackButton.dataset.back = backId;
  renderEventParticipantStatsPage();
  showScreen("eventPlayerStats");
  syncNavigationHistory("push", "screen-event-player-stats");
}

function renderEventParticipantStatsPage() {
  const subject = cloneViewedEventParticipantSubject(viewedEventParticipantSubject);
  const event = events.find(item => item.id === subject?.eventId);

  if (!subject || !event) {
    elements.eventPlayerStatsSummary.innerHTML = '<div class="empty-state">No event participant data available.</div>';
    elements.eventPlayerStatsRounds.innerHTML = "";
    return;
  }

  const eventLabel = `${formatDate(event.date)} - ${formatCompactEventLabel(event)}`;
  if (subject.kind === "tracked") {
    renderTrackedEventParticipantStats(subject.userId, event, eventLabel);
    return;
  }

  renderNamedEventParticipantStats(subject.name, event, eventLabel);
}

function renderTrackedEventParticipantStats(userId, event, eventLabel) {
  const entries = matchEntries
    .filter(entry => entry.eventId === event.id && normalizeUserId(entry.userId) === normalizeUserId(userId))
    .sort((left, right) => left.round - right.round);
  const profile = eventProfiles.find(item => item.eventId === event.id && normalizeUserId(item.userId) === normalizeUserId(userId));
  const stats = computeEntryStats(entries);
  const playerName = getUserName(userId);

  elements.eventPlayerStatsTitle.textContent = playerName;
  elements.eventPlayerStatsSubtitle.textContent = eventLabel;
  elements.eventPlayerStatsSummary.innerHTML = createListCard("Overall", `${stats.wins}-${stats.losses}-${stats.draws}`, [
    `${profile?.pod || "Pod 1"}`,
    `Deck: ${getDeckSummaryLabel(profile?.deckColors, profile?.splashColor, profile?.archetype)}`,
    `Matches logged: ${stats.matches}`
  ]);
  elements.eventPlayerStatsRounds.innerHTML = renderTrackedEventRoundCards(entries) || '<div class="empty-state">No rounds logged yet for this player in this event.</div>';
}

function renderNamedEventParticipantStats(opponentName, event, eventLabel) {
  const entries = getNamedOpponentEntries(opponentName)
    .filter(entry => entry.eventId === event.id)
    .sort((left, right) => left.round - right.round);
  const stats = computeOpponentPerspectiveStats(entries);
  const playersFaced = dedupeStrings(entries.map(entry => getUserName(entry.userId)).filter(name => name !== "Unknown player"));

  elements.eventPlayerStatsTitle.textContent = opponentName;
  elements.eventPlayerStatsSubtitle.textContent = eventLabel;
  elements.eventPlayerStatsSummary.innerHTML = createListCard("Overall", `${stats.wins}-${stats.losses}-${stats.draws}`, [
    `Players faced: ${playersFaced.join(", ") || "Unknown player"}`,
    `Location: ${event.location || "Unknown location"}`,
    `Matches logged: ${entries.length}`
  ]);
  elements.eventPlayerStatsRounds.innerHTML = renderNamedEventRoundCards(entries) || '<div class="empty-state">No rounds logged yet for this player in this event.</div>';
}

function renderTrackedEventRoundCards(entries) {
  return entries.map(entry =>
    createListCard(
      `Round ${entry.round}`,
      describeMatchResult(entry),
      [
        `Opponent: ${getOpponentDisplayName(entry)}`,
        ...(entry.notes ? [`Notes: ${entry.notes}`] : [])
      ]
    )
  ).join("");
}

function renderNamedEventRoundCards(entries) {
  return entries.map(entry =>
    createListCard(
      `Round ${entry.round}`,
      `${getMirroredScore(entry.score) || "0-0"} ${getResultVerb(getMirroredMatchResult(entry.result))}`,
      [
        `Opponent: ${getUserName(entry.userId)}`,
        ...(entry.notes ? [`Notes: ${entry.notes}`] : [])
      ]
    )
  ).join("");
}

function renderGlobalStats() {
  const canonicalFriendMatches = buildCanonicalFriendMatches();
  const eventIdsWithMatches = [...new Set(matchEntries.map(entry => entry.eventId))];
  const mostPlayedSet = getMostPlayedSet();

  elements.statsSubtitle.textContent = "Shared leaderboard, registered players, and opponent pool across all tracked matches.";
  if (elements.statsLeaderboardHeading) {
    elements.statsLeaderboardHeading.innerHTML = renderGlobalLeaderboardHeading(mostPlayedSet);
  }
  elements.statsOverviewGrid.innerHTML = [
    createStatTile(getGlobalMatchCount(canonicalFriendMatches), "matches logged"),
    createStatTile(eventIdsWithMatches.length, "events with data"),
    createStatTile(mostPlayedSet || "-", "most played set")
  ].join("");

  renderGlobalLeaderboardStats();
  renderGlobalRosters();
}

function renderStats() {
  renderGlobalStats();
}

function renderFriendsStats() {
  const canonicalFriendMatches = buildCanonicalFriendMatches();
  const topRivalry = getTopRivalrySummary(canonicalFriendMatches);

  elements.friendsStatsSubtitle.textContent = "Tracked-friend results, rivalries, and in-group standings.";
  elements.friendsOverviewGrid.innerHTML = renderTopRivalrySpotlight(topRivalry);

  renderFriendsLeaderboardStats(canonicalFriendMatches);
  renderRivalryStats(canonicalFriendMatches, elements.friendsRivalries);
}

function renderOpponentsStats() {
  const namedOpponentRows = getNamedOpponentLeaderboardRows();
  const mostDangerousOpponent = namedOpponentRows[0] || null;
  const mostPlayedOpponent = [...namedOpponentRows]
    .sort((left, right) => right.matches - left.matches || left.name.localeCompare(right.name))[0]?.name || "";

  if (elements.opponentsStatsSubtitle) {
    elements.opponentsStatsSubtitle.textContent = "";
  }
  elements.opponentsOverviewGrid.innerHTML = [
    renderOpponentSummaryTile(mostDangerousOpponent?.name || "No opponent logged yet", "most dangerous opponent"),
    renderOpponentSummaryTile(mostPlayedOpponent || "No opponent logged yet", "most played opponent")
  ].join("");

  renderOpponentsLeaderboardStats(namedOpponentRows);
}

function renderPersonalStatsPage() {
  const subject = getViewedPersonalStatsSubject();

  if (subject.kind === "named") {
    renderNamedOpponentStatsPage(subject.name);
    return;
  }

  const userId = subject.userId;
  const personalEntries = matchEntries.filter(entry => entry.userId === userId);
  const canonicalFriendMatches = buildCanonicalFriendMatches();
  const isOwnStats = userId === activeUserId;
  const playerName = getUserName(userId);

  if (elements.personalStatsTitle) {
    elements.personalStatsTitle.textContent = isOwnStats ? "Your stats" : playerName;
  }
  if (elements.personalStatsSubtitle) {
    elements.personalStatsSubtitle.textContent = "Limited stats and match history.";
  }
  if (elements.personalStatsSnapshotHeading) {
    elements.personalStatsSnapshotHeading.textContent = "Snapshot";
  }
  if (elements.personalStatsHeadToHeadHeading) {
    elements.personalStatsHeadToHeadHeading.textContent = "Head-to-head";
  }
  if (elements.personalStatsHistoryHeading) {
    elements.personalStatsHistoryHeading.textContent = "Event history";
  }

  renderDetailedPersonalStats(userId, personalEntries, canonicalFriendMatches, elements.statsPersonal);
  renderHeadToHeadStats(userId, canonicalFriendMatches, elements.personalHeadToHead);
  renderPersonalHistoryToTarget(userId, personalEntries, elements.statsHistory);
}

function renderActivityFeed() {
  if (!elements.activityFeed) {
    return;
  }

  const recentEntries = [...matchEntries]
    .sort((left, right) =>
      getMatchActivityTimestamp(right) - getMatchActivityTimestamp(left) ||
      (Number(right.id) || 0) - (Number(left.id) || 0)
    )
    .slice(0, 3);

  if (!recentEntries.length) {
    elements.activityFeed.innerHTML = '<div class="empty-state">No matches tracked yet. Your latest logged rounds will show up here.</div>';
    return;
  }

  elements.activityFeed.innerHTML = recentEntries.map(entry => {
    const event = events.find(item => item.id === entry.eventId);
    const set = event ? getSet(event.set) : null;
    const reporterName = getUserName(entry.userId);
    const opponentName = getOpponentDisplayName(entry);
    const matchingEvents = event ? getMatchingEvents(event.date, event.set, event.location, event.format) : [];
    const subtitleParts = [
      set?.name || event?.set || "Unknown event",
      matchingEvents.length > 1 ? `Event ${event.index}` : "",
      `Round ${entry.round}`
    ].filter(Boolean);

    return createActivityCard({
      reporterId: entry.userId,
      reporterName,
      opponentUserId: entry.opponentKind === "tracked" ? entry.opponentUserId : null,
      opponentName,
      opponentKind: entry.opponentKind,
      eventId: entry.eventId
    }, subtitleParts.join(" - "), [
      describeMatchResult(entry),
      event ? formatDate(event.date) : "Unknown date",
      event?.location || "Unknown location"
    ], "screen-start");
  }).join("");
}

function renderDetailedPersonalStats(userId, personalEntries, canonicalFriendMatches, targetElement) {
  if (!personalEntries.length) {
    targetElement.innerHTML = '<div class="empty-state">No personal matches logged yet for this user.</div>';
    return;
  }

  const overall = computeEntryStats(personalEntries);
  const friendOnly = computeEntryStats(personalEntries.filter(entry => entry.opponentKind === "tracked"));
  const matchupSummary = getPersonalMatchupSummary(canonicalFriendMatches, userId);
  const profileBreakdowns = getPersonalProfileBreakdowns(userId, personalEntries);
  const trophies = getPlayerTrophies(userId);
  const achievements = getPlayerAchievements(userId);

  targetElement.innerHTML = `
    ${createListCard("Overall", "", [
      `Match win rate: ${formatPercent(overall.matchWinRate)}`,
      `Game win rate: ${formatPercent(overall.gameWinRate)}`,
      `Friend-only win rate: ${formatPercent(friendOnly.matchWinRate)}`
    ])}
    ${createProgressListCard("Trophies", trophies, "No trophies right now")}
    ${createProgressListCard("Achievements", achievements, "No achievements unlocked yet")}
    ${renderPersonalMatchupSpotlights(matchupSummary)}
    ${createListCard("Matchup story", "", [
      `Most-played rival: ${matchupSummary.rival}`
    ])}
    ${createListCard("Color combinations", "", profileBreakdowns.colors.rows)}
    ${createListCard("Archetypes", "", profileBreakdowns.archetypes.rows)}
  `;
}

function renderNamedOpponentStatsPage(opponentName) {
  const opponentEntries = getNamedOpponentEntries(opponentName);

  if (elements.personalStatsTitle) {
    elements.personalStatsTitle.textContent = opponentName;
  }
  if (elements.personalStatsSubtitle) {
    elements.personalStatsSubtitle.textContent = "Stats from logged matches against this opponent.";
  }
  if (elements.personalStatsSnapshotHeading) {
    elements.personalStatsSnapshotHeading.textContent = "Snapshot";
  }
  if (elements.personalStatsHeadToHeadHeading) {
    elements.personalStatsHeadToHeadHeading.textContent = "Tracked matchups";
  }
  if (elements.personalStatsHistoryHeading) {
    elements.personalStatsHistoryHeading.textContent = "Event history";
  }

  renderNamedOpponentSummary(opponentName, opponentEntries, elements.statsPersonal);
  renderNamedOpponentHeadToHead(opponentName, opponentEntries, elements.personalHeadToHead);
  renderNamedOpponentHistory(opponentName, opponentEntries, elements.statsHistory);
}

function renderGlobalLeaderboardStats() {
  const rows = getGlobalLeaderboardRows();

  if (!rows.length) {
    elements.statsLeaderboard.innerHTML = '<div class="empty-state">No group data yet. Log some matches first.</div>';
    return;
  }

  elements.statsLeaderboard.innerHTML = rows.map(({ user, allStats, friendStats }, index) =>
    createListCard(
      "",
      `${allStats.wins}-${allStats.losses}-${allStats.draws} overall`,
      [
        `Overall win rate: ${formatPercent(allStats.matchWinRate)}`,
        `Friend-only win rate: ${formatPercent(friendStats.matchWinRate)}`,
        `Matches: ${allStats.matches}`
      ],
      {
        titleHtml: renderLeaderboardTitle(user.id, index + 1, "screen-stats")
      }
    )
  ).join("");
  }

function renderFriendsLeaderboardStats(canonicalFriendMatches) {
  if (!canonicalFriendMatches.length) {
    elements.friendsLeaderboard.innerHTML = '<div class="empty-state">No friend-only matchups yet.</div>';
    return;
  }

  const rows = new Map();
  canonicalFriendMatches.forEach(match => {
    [match.playerAId, match.playerBId].forEach(playerId => {
      if (!rows.has(playerId)) {
        rows.set(playerId, {
          userId: playerId,
          wins: 0,
          losses: 0,
          draws: 0,
          gamesWon: 0,
          gamesLost: 0,
          matches: 0
        });
      }
    });

    const playerA = rows.get(match.playerAId);
    const playerB = rows.get(match.playerBId);

    playerA.matches += 1;
    playerB.matches += 1;
    playerA.gamesWon += match.gamesA;
    playerA.gamesLost += match.gamesB;
    playerB.gamesWon += match.gamesB;
    playerB.gamesLost += match.gamesA;

    if (match.winnerId === match.playerAId) {
      playerA.wins += 1;
      playerB.losses += 1;
    } else if (match.winnerId === match.playerBId) {
      playerB.wins += 1;
      playerA.losses += 1;
    } else {
      playerA.draws += 1;
      playerB.draws += 1;
    }
  });

  const ordered = [...rows.values()]
    .map(row => ({
      ...row,
      matchWinRate: calculateRate(row.wins, row.matches),
      gameWinRate: calculateRate(row.gamesWon, row.gamesWon + row.gamesLost)
    }))
    .sort((left, right) =>
      right.matchWinRate - left.matchWinRate ||
      right.matches - left.matches ||
      right.gameWinRate - left.gameWinRate
    );

  elements.friendsLeaderboard.innerHTML = ordered.map((row, index) =>
    createListCard(
      "",
      `${row.wins}-${row.losses}-${row.draws} vs tracked friends`,
      [
        `Friend win rate: ${formatPercent(row.matchWinRate)}`,
        `Game win rate: ${formatPercent(row.gameWinRate)}`,
        `Games: ${row.matches}`
      ],
      {
        titleHtml: renderLeaderboardTitle(row.userId, index + 1, "screen-friends-stats")
      }
    )
  ).join("");
}

function renderGlobalRosters() {
  const registeredPlayers = [...users]
    .sort((left, right) => left.name.localeCompare(right.name));
  const namedOpponents = [...new Set(matchEntries
    .filter(entry => entry.opponentKind === "named" && normalize(entry.opponentName || "") !== "npc opponent")
    .map(entry => String(entry.opponentName || "").trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));

  elements.statsAllPlayers.innerHTML = registeredPlayers.length
    ? registeredPlayers.map(user => renderActivityPlayerBadge(user.name, "tracked", user.id, "screen-stats")).join("")
    : '<div class="empty-state">No registered players yet.</div>';

  elements.statsAllOpponents.innerHTML = namedOpponents.length
    ? namedOpponents.map(name => renderActivityPlayerBadge(name, "mock", "", "screen-stats", name)).join("")
    : '<div class="empty-state">No named opponents yet.</div>';
}

function renderOpponentsLeaderboardStats(rows) {
  if (!rows.length) {
    elements.opponentsLeaderboard.innerHTML = '<div class="empty-state">No named-opponent data yet.</div>';
    return;
  }

  elements.opponentsLeaderboard.innerHTML = rows.map((row, index) =>
    createListCard(
      "",
      `${row.wins}-${row.losses}-${row.draws} vs tracked players`,
      [
        `Match win rate: ${formatPercent(row.matchWinRate)}`,
        `Game win rate: ${formatPercent(row.gameWinRate)}`,
        `Matches: ${row.matches}`
      ],
      {
        titleHtml: renderOpponentLeaderboardTitle(row.name, index + 1, "screen-opponents-stats")
      }
    )
  ).join("");
}

function renderHeadToHeadStats(userId, canonicalFriendMatches, targetElement) {
    const rows = users
      .filter(user => user.id !== userId)
      .map(user => {
        const matches = canonicalFriendMatches.filter(match =>
          (match.playerAId === userId && match.playerBId === user.id) ||
        (match.playerBId === userId && match.playerAId === user.id)
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
        if (match.winnerId === userId) {
          wins += 1;
        } else if (match.winnerId === user.id) {
          losses += 1;
        } else {
          draws += 1;
        }

        if (match.playerAId === userId) {
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
      targetElement.innerHTML = '<div class="empty-state">No tracked head-to-head matches yet.</div>';
      return;
    }

    targetElement.innerHTML = rows.map(row =>
      createListCard(
        "",
        `${row.wins}-${row.losses}-${row.draws}`,
        [
          `Games: ${row.matches}`,
          `Game win rate: ${formatPercent(row.gameWinRate)}`
        ],
        {
          titleHtml: renderTrackedPlayerCardTitle(row.user.id, "screen-personal-stats")
        }
      )
    ).join("");
  }

function renderRivalryStats(canonicalFriendMatches, targetElement) {
    if (!canonicalFriendMatches.length) {
      targetElement.innerHTML = '<div class="empty-state">No friend-vs-friend rivalry data yet.</div>';
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

    targetElement.innerHTML = rows.map(row =>
      createListCard(
        "",
        `${row.winsA}-${row.winsB}-${row.draws}`,
        [
          `Games: ${row.meetings}`
        ],
        {
          titleHtml: renderRivalryCardTitle(row.playerAId, row.playerBId, "screen-friends-stats")
        }
      )
    ).join("");
}

function renderPersonalHistory(personalEntries) {
  const subject = getViewedPersonalStatsSubject();
  if (subject.kind === "tracked") {
    renderPersonalHistoryToTarget(subject.userId, personalEntries, elements.statsHistory);
  }
}

function renderPersonalHistoryToTarget(userId, personalEntries, targetElement) {
  if (!personalEntries.length) {
    targetElement.innerHTML = '<div class="empty-state">No event history yet for this user.</div>';
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
      const profile = eventProfiles.find(item => item.eventId === eventId && item.userId === userId);
      const stats = computeEntryStats(entries);
      return { event, profile, stats };
    })
    .filter(row => row.event)
    .sort((left, right) => right.event.date.localeCompare(left.event.date));

  targetElement.innerHTML = rows.map(({ event, profile, stats }) =>
      createListCard(
          `${formatDate(event.date)} - ${formatCompactEventLabel(event)}`,
          `${stats.wins}-${stats.losses}-${stats.draws}`,
      [
        `${profile?.pod || "Pod 1"}`,
        `Deck: ${getDeckSummaryLabel(profile?.deckColors, profile?.splashColor, profile?.archetype)}`,
        `Matches logged: ${stats.matches}`
      ],
      {
        className: "is-clickable",
        dataAttributes: ` data-event-player-user="${escapeHtml(userId)}" data-event-player-event="${escapeHtml(event.id)}" data-event-player-back="screen-personal-stats"`
      }
    )
  ).join("");
}

function buildCanonicalFriendMatches() {
  const map = new Map();
  matchEntries
    .filter(entry => entry.opponentKind === "tracked" && entry.opponentUserId)
    .forEach(entry => {
      const orderedIds = [normalizeUserId(entry.userId), normalizeUserId(entry.opponentUserId)]
        .sort(compareUserIds);
      const [playerAId, playerBId] = orderedIds;
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

function getPersonalProfileBreakdowns(userId, personalEntries) {
  const profiles = eventProfiles.filter(profile => profile.userId === userId);
  const entriesByEventId = personalEntries.reduce((map, entry) => {
    if (!map.has(entry.eventId)) {
      map.set(entry.eventId, []);
    }
    map.get(entry.eventId).push(entry);
    return map;
  }, new Map());
  const colorCounts = new Map();
  const archetypeCounts = new Map();

  profiles.forEach(profile => {
    const profileEntries = entriesByEventId.get(profile.eventId) || [];

    if (profile.deckColors) {
      const colorKey = getDeckColorCombinationKey(profile.deckColors, profile.splashColor);
      const colorRecord = colorCounts.get(colorKey) || { count: 0, entries: [] };
      colorRecord.count += 1;
      colorRecord.entries.push(...profileEntries);
      colorCounts.set(colorKey, colorRecord);
    }

    normalizeArchetypes(profile.archetype).forEach(archetype => {
      const archetypeRecord = archetypeCounts.get(archetype) || { count: 0, entries: [] };
      archetypeRecord.count += 1;
      archetypeRecord.entries.push(...profileEntries);
      archetypeCounts.set(archetype, archetypeRecord);
    });
  });

  return {
    colors: createProfileBreakdownSummary(
      colorCounts,
      "No color combinations logged yet",
      "No event profiles with deck colors yet",
      value => renderDeckColorCombinationSummary(value)
    ),
    archetypes: createProfileBreakdownSummary(
      archetypeCounts,
      "No archetypes logged yet",
      "No event profiles with archetypes yet"
    )
  };
}

function createProfileBreakdownSummary(counts, emptySubtitle, emptyRow, renderLabel = label => escapeHtml(label)) {
  const rows = [...counts.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
    .map(([label, record]) => {
      const stats = computeEntryStats(record.entries);
      const eventLabel = `${record.count} event${record.count === 1 ? "" : "s"}`;
      const winRateLabel = stats.matches ? `${formatPercent(stats.matchWinRate)} WR` : "No matches";
      return `
        <span class="profile-breakdown-row">
          <span class="profile-breakdown-label">${renderLabel(label)}</span>
          <span class="profile-breakdown-stats">${escapeHtml(eventLabel)} · ${escapeHtml(winRateLabel)}</span>
        </span>
      `;
    });

  return {
    subtitle: counts.size ? `${counts.size}` : emptySubtitle,
    rows: rows.length ? rows : [emptyRow]
  };
}

function getTopRivalrySummary(canonicalFriendMatches) {
  if (!canonicalFriendMatches.length) {
    return {
      label: "",
      score: ""
    };
  }

  const counts = new Map();
  canonicalFriendMatches.forEach(match => {
    const key = `${match.playerAId}-${match.playerBId}`;
    if (!counts.has(key)) {
      counts.set(key, {
        label: `${getUserName(match.playerAId)} vs ${getUserName(match.playerBId)}`,
        meetings: 0,
        winsA: 0,
        winsB: 0,
        draws: 0
      });
    }
    const rivalry = counts.get(key);
    rivalry.meetings += 1;
    if (match.winnerId === match.playerAId) {
      rivalry.winsA += 1;
    } else if (match.winnerId === match.playerBId) {
      rivalry.winsB += 1;
    } else {
      rivalry.draws += 1;
    }
  });

  const top = [...counts.values()].sort((left, right) => right.meetings - left.meetings)[0];
  return top
    ? {
      label: top.label,
      score: `${top.winsA}-${top.winsB}-${top.draws}`
    }
    : {
      label: "",
      score: ""
    };
}

function getPersonalMatchupSummary(canonicalFriendMatches, userId) {
  const rows = canonicalFriendMatches
    .filter(match => match.playerAId === userId || match.playerBId === userId)
    .reduce((map, match) => {
      const opponentId = match.playerAId === userId ? match.playerBId : match.playerAId;
      if (!map.has(opponentId)) {
        map.set(opponentId, {
          opponentId,
          meetings: 0,
          wins: 0,
          losses: 0,
          draws: 0
        });
      }

      const row = map.get(opponentId);
      row.meetings += 1;

      if (match.winnerId === userId) {
        row.wins += 1;
      } else if (match.winnerId === opponentId) {
        row.losses += 1;
      } else {
        row.draws += 1;
      }

      return map;
    }, new Map());

  const matchupRows = [...rows.values()].map(row => ({
    ...row,
    matchWinRate: calculateRate(row.wins, row.meetings)
  }));

  if (!matchupRows.length) {
    return {
      subtitle: "No tracked friend matchups yet",
      nemesis: "Not enough data",
      bestMatchup: "Not enough data",
      rival: "Not enough data",
      nemesisRow: null,
      bestMatchupRow: null
    };
  }

  const nemesis = [...matchupRows]
    .sort((left, right) =>
      left.matchWinRate - right.matchWinRate ||
      right.meetings - left.meetings ||
      left.wins - right.wins
    )[0];

  const bestMatchup = [...matchupRows]
    .sort((left, right) =>
      right.matchWinRate - left.matchWinRate ||
      right.meetings - left.meetings ||
      right.wins - left.wins
    )[0];

  const rival = [...matchupRows]
    .sort((left, right) => right.meetings - left.meetings || Math.abs(left.wins - left.losses) - Math.abs(right.wins - right.losses))[0];

  return {
    subtitle: `${matchupRows.length} tracked friend matchup${matchupRows.length === 1 ? "" : "s"} logged`,
    nemesis: `${getUserName(nemesis.opponentId)} (${nemesis.wins}-${nemesis.losses}-${nemesis.draws})`,
    bestMatchup: `${getUserName(bestMatchup.opponentId)} (${bestMatchup.wins}-${bestMatchup.losses}-${bestMatchup.draws})`,
    rival: `${getUserName(rival.opponentId)} (${rival.meetings} game${rival.meetings === 1 ? "" : "s"})`,
    nemesisRow: nemesis,
    bestMatchupRow: bestMatchup
  };
}

function renderPersonalMatchupSpotlights(matchupSummary) {
  return `
    <div class="matchup-spotlight-grid">
      ${createPersonalMatchupSpotlightCard("Your nemesis", matchupSummary.nemesisRow, "screen-personal-stats")}
      ${createPersonalMatchupSpotlightCard("Your easy win", matchupSummary.bestMatchupRow, "screen-personal-stats")}
    </div>
  `;
}

function createPersonalMatchupSpotlightCard(label, row, backId) {
  if (!row) {
    return `
      <article class="list-card matchup-spotlight-card">
        <div class="eyebrow matchup-spotlight-kicker">${escapeHtml(label)}</div>
        <strong class="matchup-spotlight-empty">Not enough data</strong>
      </article>
    `;
  }

  return `
    <article class="list-card matchup-spotlight-card">
      <div class="eyebrow matchup-spotlight-kicker">${escapeHtml(label)}</div>
      <div class="matchup-spotlight-title">${renderTrackedPlayerCardTitle(row.opponentId, backId)}</div>
      <div class="match-meta">
        <span class="meta-pill">${escapeHtml(`${row.wins}-${row.losses}-${row.draws}`)}</span>
        <span class="meta-pill">${escapeHtml(`${formatPercent(row.matchWinRate)} win rate`)}</span>
      </div>
    </article>
  `;
}

function getNamedOpponentEntries(opponentName) {
  const normalizedName = normalize(opponentName || "");
  return matchEntries.filter(entry =>
    entry.opponentKind === "named" &&
    normalize(entry.opponentName || "") === normalizedName
  );
}

function getNamedOpponentLeaderboardRows() {
  const names = [...new Set(matchEntries
    .filter(entry => entry.opponentKind === "named" && normalize(entry.opponentName || "") !== "npc opponent")
    .map(entry => String(entry.opponentName || "").trim())
    .filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));

  return names
    .map(name => {
      const entries = getNamedOpponentEntries(name);
      if (!entries.length) {
        return null;
      }

      const stats = computeOpponentPerspectiveStats(entries);
      return {
        name,
        entries,
        matches: stats.matches,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        matchWinRate: stats.matchWinRate,
        gameWinRate: stats.gameWinRate,
        trackedPlayersFaced: new Set(entries.map(entry => normalizeUserId(entry.userId)).filter(Boolean)).size
      };
    })
    .filter(Boolean)
    .sort((left, right) =>
      right.matchWinRate - left.matchWinRate ||
      right.matches - left.matches ||
      left.name.localeCompare(right.name)
    );
}

function computeOpponentPerspectiveStats(entries) {
  const reporterStats = computeEntryStats(entries);
  const gameTotals = entries.reduce((totals, entry) => {
    const parsedScore = parseScore(entry.score);
    return {
      won: totals.won + parsedScore.lost,
      lost: totals.lost + parsedScore.won
    };
  }, { won: 0, lost: 0 });

  return {
    matches: reporterStats.matches,
    wins: reporterStats.losses,
    losses: reporterStats.wins,
    draws: reporterStats.draws,
    matchWinRate: calculateRate(reporterStats.losses, reporterStats.matches),
    gameWinRate: calculateRate(gameTotals.won, gameTotals.won + gameTotals.lost)
  };
}

function getNamedOpponentMatchupSummary(opponentName, entries) {
  const rows = entries.reduce((map, entry) => {
    const reporterId = normalizeUserId(entry.userId);
    if (!reporterId || !users.some(user => user.id === reporterId)) {
      return map;
    }

    if (!map.has(reporterId)) {
      map.set(reporterId, {
        reporterId,
        meetings: 0,
        wins: 0,
        losses: 0,
        draws: 0
      });
    }

    const row = map.get(reporterId);
    row.meetings += 1;

    if (entry.result === "loss") {
      row.wins += 1;
    } else if (entry.result === "win") {
      row.losses += 1;
    } else {
      row.draws += 1;
    }

    return map;
  }, new Map());

  const matchupRows = [...rows.values()].map(row => ({
    ...row,
    matchWinRate: calculateRate(row.wins, row.meetings)
  }));

  if (!matchupRows.length) {
    return {
      subtitle: "No tracked matchups logged yet",
      toughest: "Not enough data",
      best: "Not enough data",
      rival: "Not enough data"
    };
  }

  const toughest = [...matchupRows]
    .sort((left, right) =>
      left.matchWinRate - right.matchWinRate ||
      right.meetings - left.meetings ||
      left.wins - right.wins
    )[0];

  const best = [...matchupRows]
    .sort((left, right) =>
      right.matchWinRate - left.matchWinRate ||
      right.meetings - left.meetings ||
      right.wins - left.wins
    )[0];

  const rival = [...matchupRows]
    .sort((left, right) =>
      right.meetings - left.meetings ||
      Math.abs(left.wins - left.losses) - Math.abs(right.wins - right.losses)
    )[0];

  return {
    subtitle: `${matchupRows.length} tracked player matchup${matchupRows.length === 1 ? "" : "s"} logged`,
    toughest: `${getUserName(toughest.reporterId)} (${toughest.wins}-${toughest.losses}-${toughest.draws})`,
    best: `${getUserName(best.reporterId)} (${best.wins}-${best.losses}-${best.draws})`,
    rival: `${getUserName(rival.reporterId)} (${rival.meetings} game${rival.meetings === 1 ? "" : "s"})`
  };
}

function getNamedOpponentEventSummary(entries) {
  const relevantEvents = entries
    .map(entry => events.find(event => event.id === entry.eventId))
    .filter(Boolean);

  if (!relevantEvents.length) {
    return {
      subtitle: "No event data yet",
      set: "Not enough data",
      location: "Not enough data",
      format: "Not enough data"
    };
  }

  return {
    subtitle: `${new Set(relevantEvents.map(event => event.id)).size} event${new Set(relevantEvents.map(event => event.id)).size === 1 ? "" : "s"} logged`,
    set: mostCommonLabel(relevantEvents.map(event => event.set).filter(Boolean)) || "Not enough data",
    location: mostCommonLabel(relevantEvents.map(event => event.location).filter(Boolean)) || "Not enough data",
    format: mostCommonLabel(relevantEvents.map(event => getNormalizedFormat(event.format)).filter(Boolean)) || "Not enough data"
  };
}

function renderNamedOpponentSummary(opponentName, opponentEntries, targetElement) {
  if (!opponentEntries.length) {
    targetElement.innerHTML = '<div class="empty-state">No logged matches yet for this opponent.</div>';
    return;
  }

  const overall = computeOpponentPerspectiveStats(opponentEntries);
  const matchupSummary = getNamedOpponentMatchupSummary(opponentName, opponentEntries);
  const eventSummary = getNamedOpponentEventSummary(opponentEntries);
  const trackedPlayersFaced = new Set(opponentEntries.map(entry => normalizeUserId(entry.userId)).filter(Boolean)).size;

  targetElement.innerHTML = `
    ${createListCard("Overall", "", [
      `Match win rate: ${formatPercent(overall.matchWinRate)}`,
      `Game win rate: ${formatPercent(overall.gameWinRate)}`,
      `Tracked players faced: ${trackedPlayersFaced}`
    ])}
    ${createListCard("Matchup story", "", [
      `Toughest matchup: ${matchupSummary.toughest}`,
      `Best matchup: ${matchupSummary.best}`,
      `Most-played rival: ${matchupSummary.rival}`
    ])}
    ${createListCard("Event footprint", "", [
      `Most-played set: ${eventSummary.set}`,
      `Most-played location: ${eventSummary.location}`,
      `Most-seen format: ${eventSummary.format}`
    ])}
  `;
}

function renderNamedOpponentHeadToHead(opponentName, opponentEntries, targetElement) {
  const rows = users
    .map(user => {
      const matches = opponentEntries.filter(entry => normalizeUserId(entry.userId) === user.id);
      if (!matches.length) {
        return null;
      }

      const stats = computeOpponentPerspectiveStats(matches);
      return {
        user,
        matches: stats.matches,
        wins: stats.wins,
        losses: stats.losses,
        draws: stats.draws,
        gameWinRate: stats.gameWinRate
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.matches - left.matches || right.wins - left.wins);

  if (!rows.length) {
    targetElement.innerHTML = '<div class="empty-state">No tracked players have logged matches against this opponent yet.</div>';
    return;
  }

  targetElement.innerHTML = rows.map(row =>
    createListCard(
      "",
      `${row.wins}-${row.losses}-${row.draws} for ${opponentName}`,
      [
        `Games: ${row.matches}`,
        `Game win rate: ${formatPercent(row.gameWinRate)}`
      ],
      {
        titleHtml: renderTrackedPlayerCardTitle(row.user.id, "screen-personal-stats")
      }
    )
  ).join("");
}

function renderNamedOpponentHistory(opponentName, opponentEntries, targetElement) {
  if (!opponentEntries.length) {
    targetElement.innerHTML = '<div class="empty-state">No event history yet for this opponent.</div>';
    return;
  }

  const grouped = new Map();
  opponentEntries.forEach(entry => {
    if (!grouped.has(entry.eventId)) {
      grouped.set(entry.eventId, []);
    }
    grouped.get(entry.eventId).push(entry);
  });

  const rows = [...grouped.entries()]
    .map(([eventId, entries]) => {
      const event = events.find(item => item.id === eventId);
      if (!event) {
        return null;
      }

      const stats = computeOpponentPerspectiveStats(entries);
      const playersFaced = dedupeStrings(entries.map(entry => getUserName(entry.userId)).filter(name => name !== "Unknown player"));
      return { event, stats, playersFaced, entries };
    })
    .filter(Boolean)
    .sort((left, right) => right.event.date.localeCompare(left.event.date));

  targetElement.innerHTML = rows.map(({ event, stats, playersFaced, entries }) =>
    createListCard(
      `${formatDate(event.date)} - ${formatCompactEventLabel(event)}`,
      `${stats.wins}-${stats.losses}-${stats.draws}`,
      [
        `Players faced: ${playersFaced.join(", ") || "Unknown player"}`,
        `Location: ${event.location || "Unknown location"}`,
        `Matches logged: ${entries.length}`
      ],
      {
        className: "is-clickable",
        dataAttributes: ` data-event-player-opponent="${escapeHtml(opponentName)}" data-event-player-event="${escapeHtml(event.id)}" data-event-player-back="screen-personal-stats"`
      }
    )
  ).join("");
}

function createStatTile(value, label) {
  return `<div class="stat-tile"><strong>${value}</strong><span>${label}</span></div>`;
}

function createProgressListCard(title, items, emptyMessage) {
  return `
    <article class="list-card">
      <div class="fw-bold">${escapeHtml(title)}</div>
      <div class="match-meta">
        ${items.length
          ? items.map(item => {
            const tooltip = item.descriptionText
              ? `${item.label}: ${item.descriptionText}`
              : item.label;
            return `<span class="meta-pill progress-pill" title="${escapeHtml(tooltip)}">${escapeHtml(item.label)}</span>`;
          }).join("")
          : `<span class="meta-pill progress-pill is-empty">${escapeHtml(emptyMessage)}</span>`}
      </div>
    </article>
  `;
}

function renderGlobalLeaderboardHeading(setCode) {
  const set = setCode ? getSet(setCode) : null;
  const seasonLabel = set?.name ? `${set.name} Season` : "";

  return `
    <h3 class="small-heading mb-0">Global leaderboard</h3>
    ${seasonLabel ? `
      <div class="leaderboard-season-chip">
        ${set?.iconSvgUri ? renderSetIcon(set) : `<span class="leaderboard-season-code">${escapeHtml(setCode)}</span>`}
        <span>${escapeHtml(seasonLabel)}</span>
      </div>
    ` : ""}
  `;
}

function renderTopRivalrySpotlight(topRivalry) {
  if (!topRivalry?.label) {
    return `
      <article class="stat-tile rivalry-spotlight-tile">
        <div class="eyebrow rivalry-spotlight-kicker">Top rivalry</div>
        <strong class="rivalry-spotlight-title">No rivalry logged yet</strong>
        <span class="rivalry-spotlight-caption">Start logging friend matchups to build the first rivalry.</span>
      </article>
    `;
  }

  return `
    <article class="stat-tile rivalry-spotlight-tile">
      <div class="rivalry-spotlight-layout">
        <div class="rivalry-spotlight-copy">
          <div class="eyebrow rivalry-spotlight-kicker">Top rivalry</div>
          <strong class="rivalry-spotlight-title">${escapeHtml(topRivalry.label)}</strong>
        </div>
        ${topRivalry.score ? `<div class="rivalry-spotlight-score">${escapeHtml(topRivalry.score)}</div>` : ""}
      </div>
    </article>
  `;
}

function renderOpponentSummaryTile(value, label) {
  return `
    <article class="stat-tile opponent-summary-tile">
      <strong>${escapeHtml(value)}</strong>
      <span>${escapeHtml(label)}</span>
    </article>
  `;
}

function createListCard(title, subtitle, rows, options = {}) {
  const titleMarkup = options.titleHtml || `<div class="fw-bold">${title}</div>`;
  const className = options.className ? ` ${options.className}` : "";
  const dataAttributes = options.dataAttributes || "";
  return `
    <article class="list-card${className}"${dataAttributes}>
      ${titleMarkup}
      ${subtitle ? `<div class="small text-secondary mt-1">${subtitle}</div>` : ""}
      <div class="match-meta">
        ${rows.map(row => `<span class="meta-pill">${row}</span>`).join("")}
      </div>
    </article>
  `;
}

function renderLeaderboardTitle(userId, rank, backId) {
  const playerName = getUserName(userId);
  return `
    <div class="leaderboard-card-title">
      <span class="leaderboard-rank">#${rank}</span>
      ${renderActivityPlayerBadge(playerName, "tracked", userId, backId)}
    </div>
  `;
}

function renderOpponentLeaderboardTitle(opponentName, rank, backId) {
  return `
    <div class="leaderboard-card-title">
      <span class="leaderboard-rank">#${rank}</span>
      ${renderActivityPlayerBadge(opponentName, "mock", "", backId, opponentName)}
    </div>
  `;
}

function renderTrackedPlayerCardTitle(userId, backId) {
  return renderActivityPlayerBadge(getUserName(userId), "tracked", userId, backId);
}

function renderRivalryCardTitle(leftUserId, rightUserId, backId) {
  return `
    <div class="activity-player-row">
      ${renderTrackedPlayerCardTitle(leftUserId, backId)}
      <span class="activity-player-versus">vs</span>
      ${renderTrackedPlayerCardTitle(rightUserId, backId)}
    </div>
  `;
}

function createActivityCard(players, subtitle, rows, backId = "screen-start") {
  const reporterName = players?.reporterName || "Unknown player";
  const opponentName = players?.opponentName || "Unknown player";
  const opponentState = getActivityOpponentAvatarState(players?.opponentKind, opponentName);
  const eventId = normalizeRecordId(players?.eventId);
  const articleDataAttributes = players?.reporterId && eventId
    ? ` data-event-player-user="${escapeHtml(players.reporterId)}" data-event-player-event="${escapeHtml(eventId)}" data-event-player-back="${escapeHtml(backId)}"`
    : "";

  return `
    <article class="list-card activity-card${articleDataAttributes ? " is-clickable" : ""}"${articleDataAttributes}>
      <div class="activity-player-row">
        ${renderActivityPlayerBadge(reporterName, "tracked", players?.reporterId, backId)}
        <span class="activity-player-versus">vs</span>
        ${renderActivityPlayerBadge(opponentName, opponentState, players?.opponentUserId, backId, players?.opponentKind === "named" ? opponentName : "")}
      </div>
      <div class="small text-secondary mt-2">${subtitle}</div>
      <div class="match-meta">
        ${rows.map(row => `<span class="meta-pill">${row}</span>`).join("")}
      </div>
    </article>
  `;
}

function renderActivityPlayerBadge(name, state = "tracked", userId = "", backId = "screen-start", opponentName = "") {
  const normalizedUserId = normalizeUserId(userId);
  const normalizedOpponentName = String(opponentName || "").trim();
  const canOpenTrackedStats = state === "tracked" && normalizedUserId;
  const canOpenOpponentStats = state === "mock" && normalizedOpponentName && normalize(normalizedOpponentName) !== "npc opponent";
  const tagName = canOpenTrackedStats || canOpenOpponentStats ? "button type=\"button\"" : "span";
  const dataAttributes = canOpenTrackedStats
    ? ` data-personal-stats-user="${escapeHtml(normalizedUserId)}" data-personal-stats-back="${escapeHtml(backId)}"`
    : canOpenOpponentStats
      ? ` data-personal-stats-opponent="${escapeHtml(normalizedOpponentName)}" data-personal-stats-back="${escapeHtml(backId)}"`
      : "";
  return `
    <${tagName} class="activity-player-badge${state !== "tracked" ? ` is-${state}` : ""}${canOpenTrackedStats || canOpenOpponentStats ? " is-clickable" : ""}"${dataAttributes}>
      ${canOpenTrackedStats
        ? renderTrackedPlayerAvatar(name, normalizedUserId, "activity-player-avatar")
        : renderBasicPlayerAvatar(name, "activity-player-avatar")}
      <span class="activity-player-name">${escapeHtml(name)}</span>
    </${canOpenTrackedStats || canOpenOpponentStats ? "button" : "span"}>
  `;
}

function getActivityOpponentAvatarState(opponentKind, opponentName) {
  if (opponentKind === "named") {
    return "mock";
  }

  if (normalize(opponentName || "") === "npc opponent") {
    return "npc";
  }

  return "tracked";
}

function removeMatch(matchId) {
  const index = matchEntries.findIndex(entry => entry.id === matchId);
  if (index !== -1) {
    matchEntries.splice(index, 1);
  }
}

function handlePlayerStatsNavigationClick(event) {
  const trigger = event.target.closest("[data-event-player-user], [data-event-player-opponent], [data-personal-stats-user], [data-personal-stats-opponent]");
  if (!trigger) {
    return;
  }

  const eventBackId = trigger.dataset.eventPlayerBack || "screen-date";
  if (trigger.dataset.eventPlayerUser && trigger.dataset.eventPlayerEvent) {
    openEventParticipantStatsForUser(trigger.dataset.eventPlayerUser, trigger.dataset.eventPlayerEvent, eventBackId);
    return;
  }

  if (trigger.dataset.eventPlayerOpponent && trigger.dataset.eventPlayerEvent) {
    openEventParticipantStatsForOpponent(trigger.dataset.eventPlayerOpponent, trigger.dataset.eventPlayerEvent, eventBackId);
    return;
  }

  const backId = trigger.dataset.personalStatsBack || "screen-start";
  if (trigger.dataset.personalStatsUser) {
    openPersonalStatsForUser(trigger.dataset.personalStatsUser, backId);
    return;
  }

  if (trigger.dataset.personalStatsOpponent) {
    openPersonalStatsForOpponent(trigger.dataset.personalStatsOpponent, backId);
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

function deleteEventById(eventId) {
  const event = events.find(entry => entry.id === eventId);
  if (!event) {
    return;
  }

  const relatedProfiles = eventProfiles.filter(profile => profile.eventId === eventId);
  const relatedMatches = matchEntries.filter(entry => entry.eventId === eventId);

  for (let index = eventProfiles.length - 1; index >= 0; index -= 1) {
    if (eventProfiles[index].eventId === eventId) {
      eventProfiles.splice(index, 1);
    }
  }

  for (let index = matchEntries.length - 1; index >= 0; index -= 1) {
    if (matchEntries[index].eventId === eventId) {
      matchEntries.splice(index, 1);
    }
  }

  for (let index = eventPods.length - 1; index >= 0; index -= 1) {
    if (eventPods[index].eventId === eventId) {
      eventPods.splice(index, 1);
    }
  }

  const eventIndex = events.findIndex(entry => entry.id === eventId);
  if (eventIndex !== -1) {
    events.splice(eventIndex, 1);
  }

  relatedProfiles.forEach(profile => persistDeletedEventProfile(profile));
  relatedMatches.forEach(entry => persistDeletedMatchEntry(entry));
  persistDeletedEventRecord(event);

  reindexMatchingEventSeries(event.date, event.set, event.location, event.format);

  if (currentEventId === eventId) {
    currentEventId = null;
    closeRoundPrefillModal();
  }

  renderActivityFeed();
  syncDateView(event.date);
  updateAdminUiState();
}

function removePlayerFromEvent(eventId, userId) {
  const event = events.find(entry => entry.id === eventId);
  if (!event) {
    return;
  }

  const relatedProfiles = eventProfiles.filter(profile =>
    profile.eventId === eventId &&
    normalizeUserId(profile.userId) === userId
  );
  const relatedMatches = matchEntries.filter(entry =>
    entry.eventId === eventId &&
    (
      normalizeUserId(entry.userId) === userId ||
      (entry.opponentKind === "tracked" && normalizeUserId(entry.opponentUserId) === userId)
    )
  );

  for (let index = eventProfiles.length - 1; index >= 0; index -= 1) {
    if (
      eventProfiles[index].eventId === eventId &&
      normalizeUserId(eventProfiles[index].userId) === userId
    ) {
      eventProfiles.splice(index, 1);
    }
  }

  for (let index = matchEntries.length - 1; index >= 0; index -= 1) {
    if (
      matchEntries[index].eventId === eventId &&
      (
        normalizeUserId(matchEntries[index].userId) === userId ||
        (matchEntries[index].opponentKind === "tracked" && normalizeUserId(matchEntries[index].opponentUserId) === userId)
      )
    ) {
      matchEntries.splice(index, 1);
    }
  }

  relatedProfiles.forEach(profile => persistDeletedEventProfile(profile));
  relatedMatches.forEach(entry => persistDeletedMatchEntry(entry));

  if (currentEventId === eventId && activeUserId === userId) {
    currentEventId = null;
    closeRoundPrefillModal();
    showScreen("date");
    syncNavigationHistory("replace", "screen-date");
  }

  renderActivityFeed();
  syncDateView(event.date);
  populateRemoveEventPlayerEventSelect(eventId);
  updateAdminUiState();
}

function reindexMatchingEventSeries(date, set, location, format = "Draft") {
  const matchingEvents = getMatchingEvents(date, set, location, format);
  matchingEvents.forEach((event, index) => {
    const nextIndex = index + 1;
    if (event.index !== nextIndex) {
      event.index = nextIndex;
      persistEventRecord(event);
    }
  });
}

function getMatchingEvents(date, set, location, format = "Draft") {
  const normalizedFormat = getNormalizedFormat(format);
  return events
    .filter(event =>
      event.date === date &&
      event.set === set &&
      getNormalizedFormat(event.format) === normalizedFormat &&
      normalize(event.location) === normalize(location)
    )
    .sort((left, right) => left.index - right.index);
}

function getNextIndex(date, set, location, format = "Draft") {
  const matchingEvents = getMatchingEvents(date, set, location, format);
  return matchingEvents.length
    ? Math.max(...matchingEvents.map(event => event.index)) + 1
    : 1;
}

function getNextIndexExcludingEvent(date, set, location, format = "Draft", excludedEventId = "") {
  const normalizedExcludedEventId = normalizeRecordId(excludedEventId);
  const matchingEvents = getMatchingEvents(date, set, location, format)
    .filter(event => event.id !== normalizedExcludedEventId);
  return matchingEvents.length
    ? Math.max(...matchingEvents.map(event => event.index)) + 1
    : 1;
}

function getLocationOptions() {
  const merged = [...baseLocations, ...customLocations];
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
    const event = events.find(item => item.id === eventId);
    const podCount = event?.podCount || 1;
    seedPodsForEvent(eventId, podCount);
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

function reconcilePodsForEvent(eventId, podCount) {
  const normalizedEventId = normalizeRecordId(eventId);
  const nextPodCount = Math.max(1, Number(podCount) || 1);
  const existingPods = eventPods
    .filter(entry => entry.eventId === normalizedEventId)
    .sort((left, right) => extractPodNumber(left.label) - extractPodNumber(right.label) || left.label.localeCompare(right.label));

  for (let index = existingPods.length; index < nextPodCount; index += 1) {
    eventPods.push({ eventId: normalizedEventId, label: `Pod ${index + 1}` });
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
      splashColor: "",
      archetype: []
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

    renderAuthUi();
  } catch {
    manaSymbolCatalog = {};
    renderAuthUi();
  }
}

function getUserName(userId) {
  return users.find(user => user.id === normalizeUserId(userId))?.name ?? "Unknown player";
}

function getActiveUserName() {
  return activeUserId ? getUserName(activeUserId) : "Unknown player";
}

function getAuthenticatedUserName() {
  const authenticatedUserId = getAuthenticatedUserId();
  return authenticatedUserId ? getUserName(authenticatedUserId) : "Unknown player";
}

function getOpponentDisplayName(match) {
  if (match.opponentKind === "tracked") {
    return getUserName(match.opponentUserId);
  }
  return match.opponentName || "NPC Opponent";
}

function getMatchActivityTimestamp(entry) {
  if (entry?.persistedAt) {
    const parsedPersistedAt = Date.parse(entry.persistedAt);
    if (Number.isFinite(parsedPersistedAt)) {
      return parsedPersistedAt;
    }
  }

  const event = events.find(item => item.id === entry?.eventId);
  if (event?.date) {
    const parsedEventDate = Date.parse(`${event.date}T12:00:00`);
    if (Number.isFinite(parsedEventDate)) {
      return parsedEventDate;
    }
  }

  return Number(entry?.id) || 0;
}

function describeMatchResult(entry) {
  const recordLabel = `${entry.score || "0-0"} ${getResultVerb(entry.result)}`;
  return entry.pod ? `${recordLabel} - ${entry.pod}` : recordLabel;
}

function getResultVerb(result) {
  if (result === "win") {
    return "win";
  }

  if (result === "loss") {
    return "loss";
  }

  return "draw";
}

function getActivityLoggedLabel(entry) {
  if (entry?.persistedAt) {
    return formatDateTime(entry.persistedAt);
  }

  return "Recently logged";
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

function getArchetypeLabel(value) {
  const archetypes = normalizeArchetypes(value);
  return archetypes.length ? archetypes.join(", ") : "No archetype";
}

function getDeckSummaryLabel(deckColors, splashColor, archetype) {
  const deckParts = [renderDeckColorSummary(deckColors)];
  if (splashColor) {
    deckParts.push(`Splash ${renderDeckColorSummary(splashColor)}`);
  }
  const parts = [`<span class="inline-deck-summary">${deckParts.join(" / ")}</span>`];
  const archetypeLabel = normalizeArchetypes(archetype).join(", ");
  if (archetypeLabel) {
    parts.push(escapeHtml(archetypeLabel));
  }
  return parts.join(" / ");
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
  const matchingEvents = getMatchingEvents(event.date, event.set, event.location, event.format);
  const needsIndex = matchingEvents.length > 1;
  return `${event.set} - ${event.location}${needsIndex ? ` - Event ${event.index}` : ""}`;
}

function getEventAdminLabel(event) {
  return `${event.set} - ${event.format || "Draft"} - ${event.location}${getMatchingEvents(event.date, event.set, event.location, event.format).length > 1 ? ` - Event ${event.index}` : ""}`;
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

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
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
  if (score === "BYE") {
    return {
      won: 2,
      lost: 0
    };
  }

  const parts = score.split("-").map(part => Number(part));
  return {
    won: parts[0] || 0,
    lost: parts[1] || 0
  };
}

function inferResultFromScore(score) {
  if (score === "BYE") {
    return "win";
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
  const target = isAuthModalOpen && !currentAuthUser
    ? elements.authModalAlert
    : elements.userAlert;
  if (!target) {
    return;
  }

  target.textContent = message;
  target.classList.remove("d-none");
}

function hideUserAlert() {
  [elements.userAlert, elements.authModalAlert].forEach(target => {
    if (!target) {
      return;
    }

    target.textContent = "";
    target.classList.add("d-none");
  });
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
  const format = elements.eventFormatSelect.value;
  const location = elements.locationSelect.value.trim();
  if (!currentDate || !set || !format || !location) {
    hideDuplicateAlert();
    return;
  }

  const matchingEvents = getMatchingEvents(currentDate, set, location, format)
    .filter(event => event.id !== editingEventId);
  const editingEvent = editingEventId ? events.find(event => event.id === editingEventId) : null;
  const isSameSeries = editingEvent &&
    editingEvent.date === currentDate &&
    editingEvent.set === set &&
    getNormalizedFormat(editingEvent.format) === getNormalizedFormat(format) &&
    normalize(editingEvent.location) === normalize(location);

  if (!matchingEvents.length || isSameSeries) {
    hideDuplicateAlert();
    return;
  }

  const nextIndex = getNextIndexExcludingEvent(currentDate, set, location, format, editingEventId);
  showDuplicateAlert(`A matching event already exists for this set, format, and location. Saving will ask for confirmation and create Event ${nextIndex}.`);
}

function setDateInputToToday() {
  elements.dateInput.value = getTodayIsoLocal();
}

function setCalendarMonthFromDate(dateString) {
  currentCalendarMonth = getMonthStartIso(dateString || getTodayIsoLocal());
}

function getMonthStartIso(dateString) {
  const date = parseIsoDate(dateString);
  return formatDateAsIso(new Date(date.getFullYear(), date.getMonth(), 1, 12));
}

function parseIsoDate(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

function formatDateAsIso(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function updateSelectedDateLabel(dateString) {
  const count = getEventsOnDate(dateString).length;
  elements.selectedDateLabel.textContent = `${formatDate(dateString)}${count ? ` - ${count} event${count === 1 ? "" : "s"}` : ""}`;
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
