import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.0/firebase-app.js";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-auth.js";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.12.0/firebase-firestore.js";
import { firebaseConfig, firebaseOptions } from "./firebase-config.js";

const COLLECTIONS = {
  users: "users",
  customLocations: "customLocations",
  customOpponents: "customOpponents",
  events: "events",
  eventProfiles: "eventProfiles",
  matchEntries: "matchEntries"
};

let auth = null;
let firestore = null;
let firebaseReady = false;

function hasUsableFirebaseConfig() {
  if (!firebaseOptions.enabled) {
    return false;
  }

  return ["apiKey", "authDomain", "projectId", "appId"].every(key => Boolean(firebaseConfig[key]));
}

function collectionRef(name) {
  return collection(firestore, name);
}

function withTimestamp(payload) {
  return {
    ...payload,
    persistedAt: new Date().toISOString()
  };
}

function normalizeUserId(value) {
  return value == null ? "" : String(value);
}

function profileDocId(profile) {
  return `${profile.eventId}_${encodeURIComponent(normalizeUserId(profile.userId))}`;
}

function matchDocId(matchEntry) {
  return String(matchEntry.id);
}

function normalizeRecordId(value) {
  return value == null ? "" : String(value);
}

function normalizeArchetypes(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(entry => String(entry || "").trim()).filter(Boolean))];
  }

  if (typeof value === "string") {
    return value.trim() ? [value.trim()] : [];
  }

  return [];
}

async function readCollection(name) {
  if (!firebaseReady) {
    return [];
  }

  const snapshot = await getDocs(collectionRef(name));
  return snapshot.docs.map(entry => entry.data());
}

export async function initializeFirebasePersistence() {
  if (!hasUsableFirebaseConfig()) {
    return {
      enabled: false,
      reason: "Firebase config missing or disabled."
    };
  }

  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  firestore = getFirestore(app);

  await setPersistence(auth, browserLocalPersistence);

  if (firebaseOptions.useEmulator) {
    connectFirestoreEmulator(firestore, firebaseOptions.emulatorHost, firebaseOptions.emulatorPort);
  }

  firebaseReady = true;
  return {
    enabled: true,
    reason: ""
  };
}

export function isFirebasePersistenceEnabled() {
  return firebaseReady;
}

export function subscribeToAuthState(callback) {
  if (!auth) {
    callback(null);
    return () => {};
  }

  return onAuthStateChanged(auth, callback);
}

export async function signInWithGoogle() {
  if (!auth) {
    throw new Error("Firebase Auth is not initialized.");
  }

  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export async function signInWithEmail(email, password) {
  if (!auth) {
    throw new Error("Firebase Auth is not initialized.");
  }

  return signInWithEmailAndPassword(auth, email, password);
}

export async function signUpWithEmail(email, password, nickname) {
  if (!auth) {
    throw new Error("Firebase Auth is not initialized.");
  }

  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (nickname) {
    await updateProfile(credential.user, {
      displayName: nickname
    });
  }
  return credential;
}

export async function requestPasswordReset(email) {
  if (!auth) {
    throw new Error("Firebase Auth is not initialized.");
  }

  return sendPasswordResetEmail(auth, email);
}

export async function updateAuthNickname(user, nickname) {
  if (!user || !nickname) {
    return;
  }

  await updateProfile(user, {
    displayName: nickname
  });
}

export async function changeCurrentUserPassword(currentPassword, newPassword) {
  if (!auth?.currentUser) {
    throw new Error("No authenticated user.");
  }

  if (!auth.currentUser.email) {
    throw new Error("The current user does not have an email address.");
  }

  const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
  await reauthenticateWithCredential(auth.currentUser, credential);
  await updatePassword(auth.currentUser, newPassword);
}

export async function signOutCurrentUser() {
  if (!auth) {
    return;
  }

  await signOut(auth);
}

export async function loadPersistedState() {
  if (!firebaseReady) {
    return {
      userProfiles: [],
      customLocations: [],
      customOpponents: [],
      events: [],
      eventProfiles: [],
      matchEntries: []
    };
  }

  const [
    userProfiles,
    customLocations,
    customOpponents,
    events,
    eventProfiles,
    matchEntries
  ] = await Promise.all([
    readCollection(COLLECTIONS.users),
    readCollection(COLLECTIONS.customLocations),
    readCollection(COLLECTIONS.customOpponents),
    readCollection(COLLECTIONS.events),
    readCollection(COLLECTIONS.eventProfiles),
    readCollection(COLLECTIONS.matchEntries)
  ]);

  return {
    userProfiles: userProfiles
      .map(user => ({
        id: normalizeUserId(user.id),
        nickname: user.nickname || "",
        provider: user.provider || "",
        accentColor: user.accentColor || user.accentTheme || ""
      }))
      .filter(user => user.id),
    customLocations: customLocations.map(entry => entry.name || "").filter(Boolean),
    customOpponents: customOpponents.map(entry => entry.name || "").filter(Boolean),
    events: events.map(event => ({
      ...event,
      id: normalizeRecordId(event.id),
      index: Number(event.index) || 1,
      rounds: Number(event.rounds) || 3,
      podCount: Number(event.podCount) || 1
    })),
    eventProfiles: eventProfiles
      .map(profile => ({
        ...profile,
        eventId: normalizeRecordId(profile.eventId),
        userId: normalizeUserId(profile.userId),
        archetype: normalizeArchetypes(profile.archetype)
      }))
      .filter(profile => profile.userId),
    matchEntries: matchEntries
      .map(entry => ({
        ...entry,
        id: normalizeRecordId(entry.id),
        eventId: normalizeRecordId(entry.eventId),
        userId: normalizeUserId(entry.userId),
        opponentUserId: entry.opponentUserId == null ? null : normalizeUserId(entry.opponentUserId),
        round: Number(entry.round) || 1,
        archetype: normalizeArchetypes(entry.archetype)
      }))
      .filter(entry => entry.userId)
  };
}

export async function loadUserProfile(userId) {
  if (!firebaseReady || !userId) {
    return null;
  }

  const snapshot = await getDoc(doc(firestore, COLLECTIONS.users, normalizeUserId(userId)));
  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    id: normalizeUserId(data.id || userId),
    nickname: data.nickname || "",
    provider: data.provider || "",
    accentColor: data.accentColor || data.accentTheme || ""
  };
}

export async function saveUserProfile(userProfile) {
  if (!firebaseReady || !userProfile?.id) {
    return;
  }

  await setDoc(
    doc(firestore, COLLECTIONS.users, normalizeUserId(userProfile.id)),
    withTimestamp({
      id: normalizeUserId(userProfile.id),
      nickname: userProfile.nickname || "",
      provider: userProfile.provider || "",
      accentColor: userProfile.accentColor || ""
    }),
    { merge: true }
  );
}

export async function saveCustomLocation(name) {
  if (!firebaseReady) {
    return;
  }

  await setDoc(
    doc(firestore, COLLECTIONS.customLocations, encodeURIComponent(name)),
    withTimestamp({ name })
  );
}

export async function deleteCustomLocation(name) {
  if (!firebaseReady) {
    return;
  }

  await deleteDoc(doc(firestore, COLLECTIONS.customLocations, encodeURIComponent(name)));
}

export async function saveCustomOpponent(name) {
  if (!firebaseReady) {
    return;
  }

  await setDoc(
    doc(firestore, COLLECTIONS.customOpponents, encodeURIComponent(name)),
    withTimestamp({ name })
  );
}

export async function deleteCustomOpponent(name) {
  if (!firebaseReady) {
    return;
  }

  await deleteDoc(doc(firestore, COLLECTIONS.customOpponents, encodeURIComponent(name)));
}

export async function saveEvent(event) {
  if (!firebaseReady) {
    return;
  }

  await setDoc(
    doc(firestore, COLLECTIONS.events, String(event.id)),
    withTimestamp({
      id: event.id,
      date: event.date,
      set: event.set,
      index: event.index,
      location: event.location,
      format: event.format,
      rounds: event.rounds,
      podCount: event.podCount
    })
  );
}

export async function deleteEvent(event) {
  if (!firebaseReady || !event?.id) {
    return;
  }

  await deleteDoc(doc(firestore, COLLECTIONS.events, String(event.id)));
}

export async function saveEventProfile(profile) {
  if (!firebaseReady) {
    return;
  }

  await setDoc(
    doc(firestore, COLLECTIONS.eventProfiles, profileDocId(profile)),
    withTimestamp({
      eventId: profile.eventId,
      userId: normalizeUserId(profile.userId),
      pod: profile.pod,
      deckColors: profile.deckColors,
      archetype: normalizeArchetypes(profile.archetype)
    })
  );
}

export async function deleteEventProfile(profile) {
  if (!firebaseReady) {
    return;
  }

  await deleteDoc(doc(firestore, COLLECTIONS.eventProfiles, profileDocId(profile)));
}

export async function saveMatchEntry(matchEntry) {
  if (!firebaseReady) {
    return;
  }

  await setDoc(
    doc(firestore, COLLECTIONS.matchEntries, matchDocId(matchEntry)),
    withTimestamp({
      ...matchEntry,
      userId: normalizeUserId(matchEntry.userId),
      opponentUserId: matchEntry.opponentUserId == null ? null : normalizeUserId(matchEntry.opponentUserId),
      archetype: normalizeArchetypes(matchEntry.archetype)
    })
  );
}

export async function deleteMatchEntry(matchEntry) {
  if (!firebaseReady) {
    return;
  }

  await deleteDoc(doc(firestore, COLLECTIONS.matchEntries, matchDocId(matchEntry)));
}
