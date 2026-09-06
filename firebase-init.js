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
  addDoc, query, where, updateDoc, arrayUnion, arrayRemove,
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

// "shares" est une collection à part (pas rangée par utilisateur) qui
// sert de boîte aux lettres commune : quand on partage une note à un
// ami, on y dépose un petit document avec l'email du destinataire. Cet
// ami, une fois connecté, va relire cette boîte aux lettres pour voir
// s'il y a des notes qui lui sont destinées (voir fetchSharesForMe).
const sharesCol = collection(db, "shares");

// "hub_posts" est la grande salle commune et PUBLIQUE du Hub : tout le
// monde peut la lire (même sans compte), mais seule une personne
// connectée peut y publier, aimer (❤️) ou signaler une note.
const hubCol = collection(db, "hub_posts");

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

  // ── Partage entre amis ──
  // Dépose une copie de la note dans la boîte aux lettres commune, à
  // l'attention de l'email du destinataire.
  async shareNoteWithFriend(fromUid, fromEmail, toEmail, note) {
    await addDoc(sharesCol, {
      fromUid, fromEmail,
      toEmail: toEmail.trim().toLowerCase(),
      note, sharedAt: new Date().toISOString(),
    });
  },
  // Va chercher tout ce qui, dans la boîte aux lettres, est adressé à
  // l'email de l'utilisateur connecté.
  async fetchSharesForMe(email) {
    const q = query(sharesCol, where("toEmail", "==", email.trim().toLowerCase()));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ shareId: d.id, ...d.data() }));
  },
  // Retire un partage de la boîte aux lettres (après import ou pour l'ignorer).
  dismissShare(shareId) { return deleteDoc(doc(sharesCol, shareId)); },

  // ── Le Hub (communauté publique) ──
  // Dépose une copie de la note dans la salle commune, visible par tous.
  async publishToHub(uid, email, note) {
    await addDoc(hubCol, {
      authorUid: uid, authorEmail: email,
      ...note,
      likedBy: [], reported: false,
      createdAt: new Date().toISOString(),
    });
  },
  // Récupère TOUTES les publications du Hub (lecture publique, pas besoin
  // d'être connecté). Le tri/filtre se fait ensuite côté script.js.
  async fetchHubPosts() {
    const snap = await getDocs(hubCol);
    return snap.docs.map((d) => ({ hubId: d.id, ...d.data() }));
  },
  // Ajoute ou retire l'uid de la liste "likedBy" d'une publication.
  toggleHubLike(hubId, uid, currentlyLiked) {
    return updateDoc(doc(hubCol, hubId), {
      likedBy: currentlyLiked ? arrayRemove(uid) : arrayUnion(uid),
    });
  },
  // Marque une publication comme signalée, pour qu'elle remonte en haut
  // de la page Modération.
  reportHubPost(hubId) { return updateDoc(doc(hubCol, hubId), { reported: true }); },
  // Supprime définitivement une publication du Hub (par son auteur, ou
  // par toi via la page Modération).
  deleteHubPost(hubId) { return deleteDoc(doc(hubCol, hubId)); },
};

window.dispatchEvent(new Event("fbapi-ready"));
