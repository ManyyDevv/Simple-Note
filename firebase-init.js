/* ════════════════════════════════════════════════════════════
   SimpleNote.fr — Firebase (Auth + Firestore)
   Ce fichier est un module ES : il tourne dans son propre espace,
   c'est pourquoi on expose tout ce dont script.js a besoin sur
   window.fbApi (script.js, lui, n'est PAS un module).
════════════════════════════════════════════════════════════ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged,
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, sendPasswordResetEmail,
  updatePassword, reauthenticateWithCredential, EmailAuthProvider,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDocs, setDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Ta configuration de projet (l'apiKey d'une app web Firebase est
// publique par nature : la vraie sécurité vient des règles Firestore
// + de l'authentification, pas du secret de cette clé).
const firebaseConfig = {
  apiKey: "AIzaSyAXB3xVKfbjruoPHLzvSp_iTq-VAOMGV88",
  authDomain: "simplenote-7a403.firebaseapp.com",
  projectId: "simplenote-7a403",
  storageBucket: "simplenote-7a403.firebasestorage.app",
  messagingSenderId: "642147020578",
  appId: "1:642147020578:web:9b7c01bbeca1eecfdebf7b",
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

const notesCol   = (uid) => collection(db, "users", uid, "notes");
const foldersCol = (uid) => collection(db, "users", uid, "folders");

async function fetchAll(col) {
  const snap = await getDocs(col);
  return snap.docs.map((d) => d.data());
}

// Écrit/à jour tous les éléments locaux, et supprime dans Firestore
// ceux qui n'existent plus localement (corbeille vidée, suppression
// définitive, réinitialisation, etc.)
async function syncCollection(col, items) {
  const snap = await getDocs(col);
  const existingIds = new Set(snap.docs.map((d) => d.id));
  const currentIds  = new Set(items.map((it) => it.id));
  await Promise.all(items.map((it) => setDoc(doc(col, it.id), it)));
  const toDelete = [...existingIds].filter((id) => !currentIds.has(id));
  await Promise.all(toDelete.map((id) => deleteDoc(doc(col, id))));
}

window.fbApi = {
  onAuthChange(cb) { onAuthStateChanged(auth, cb); },

  signUp(email, pw)  { return createUserWithEmailAndPassword(auth, email, pw); },
  signIn(email, pw)  { return signInWithEmailAndPassword(auth, email, pw); },
  signOutUser()      { return signOut(auth); },
  resetPassword(email){ return sendPasswordResetEmail(auth, email); },

  async changePassword(currentPw, newPw) {
    const user = auth.currentUser;
    const cred = EmailAuthProvider.credential(user.email, currentPw);
    await reauthenticateWithCredential(user, cred);
    await updatePassword(user, newPw);
  },

  fetchNotes(uid)   { return fetchAll(notesCol(uid)); },
  fetchFolders(uid) { return fetchAll(foldersCol(uid)); },

  syncNotes(uid, notesArr)     { return syncCollection(notesCol(uid), notesArr); },
  syncFolders(uid, foldersArr) { return syncCollection(foldersCol(uid), foldersArr); },
};

window.dispatchEvent(new Event("fbapi-ready"));
