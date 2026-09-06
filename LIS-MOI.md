# SimpleNote.fr — ce qui a changé

## 🐛 Le bug des onglets vides — expliqué simplement

Ton site charge deux fichiers JavaScript : `firebase-init.js` (qui parle au
serveur) et `script.js` (qui gère toute l'appli). Le problème, c'est que
`script.js` disait en gros :

> « Je pars du principe que `firebase-init.js` a déjà fini de se charger,
> je vais direct utiliser ce qu'il a préparé. »

Mais parfois (connexion un peu lente, bloqueur de pub, etc.), `firebase-init.js`
n'avait pas encore fini. Résultat : `script.js` plantait tout de suite, en
silence, et plus rien ne s'affichait dans les onglets — même si visuellement
la page semblait normale.

**La correction :** `script.js` attend maintenant proprement un signal
(« fbapi-ready ») envoyé par `firebase-init.js` quand il est vraiment prêt,
avec :
- un petit rond qui tourne (⏳) pendant le chargement,
- un message clair si ça ne répond vraiment pas après 8 secondes,
- un filet de sécurité qui affiche un petit message (au lieu d'un écran
  tout vide) si jamais une autre erreur inattendue arrive plus tard.

## ✨ Les nouveautés

1. **Page d'accueil publique** — avant de se connecter, tes visiteurs voient
   maintenant une vraie page de présentation (« L'appli de notes open-source
   et parfaite ») avec un gros bouton **Commencer gratuitement**.
2. **Des onglets en haut** — Tableau de bord / Mes notes / Nouvelle note /
   Défi du jour / Partagées. Ils marchent en plus de ton menu de gauche
   (qui garde tous ses onglets originaux : Dossiers, Rappels, Corbeille,
   Statistiques, Mes données).
3. **Défi du jour** — une idée d'écriture différente chaque jour (30 défis
   qui tournent automatiquement, aucun serveur nécessaire pour ça).
4. **Notes partagées entre amis** (la vraie fonctionnalité « serveur ») —
   dans une note, bouton **Partager**, tu peux maintenant soit copier un
   lien (comme avant), soit taper l'email d'un ami : sa note arrive alors
   directement dans son onglet **Partagées** la prochaine fois qu'il se
   connecte, comme un petit email.
5. **Police moins lourde** — texte un peu plus grand, plus d'espace entre
   les lignes, étiquettes de formulaire moins en gras.

## ⚠️ Une seule chose à faire toi-même : les règles Firestore

Le partage entre amis utilise une nouvelle « boîte aux lettres » commune sur
le serveur (une collection appelée `shares`, différente de tes notes
personnelles). Il faut autoriser Firestore à l'utiliser :

1. Va sur https://console.firebase.google.com
2. Ouvre ton projet **simplenote-7a403**
3. Menu de gauche → **Firestore Database** → onglet **Règles**
4. Ajoute ce bloc (à côté de tes règles existantes pour `users/{uid}/...`) :

```
match /shares/{shareId} {
  // N'importe qui de connecté peut déposer une note pour un ami
  allow create: if request.auth != null
                && request.resource.data.fromUid == request.auth.uid;

  // On ne peut lire / supprimer que les notes qui nous sont adressées
  allow read, delete: if request.auth != null
                && request.auth.token.email == resource.data.toEmail;
}
```

5. Clique sur **Publier**.

C'est tout ! Sans cette règle, Firestore refusera poliment les nouvelles
notes partagées (mais le reste du site marchera quand même normalement).

## 📁 Fichiers à remettre sur GitHub

Remplace tes 4 fichiers (`index.html`, `script.js`, `style.css`,
`firebase-init.js`) par ceux fournis ici, et republie sur GitHub Pages
comme d'habitude.
