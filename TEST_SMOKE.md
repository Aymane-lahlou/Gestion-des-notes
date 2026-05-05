# Smoke tests frontend (manuel)

## Pre-requis
- Backend: `python manage.py migrate`
- Donnees demo: `python manage.py seed_demo`
- Frontend: `npm run dev`

## Scenarios
1. Connexion admin
- Se connecter avec `admin@ecole.ma / Admin123!`
- Verifier redirection vers `/admin/grades`
- Ajouter un etudiant
- Ajouter une matiere
- Ajouter/mettre a jour une note
- Telecharger un bulletin PDF
- Verifier stats classe (moyenne + taux reussite)

2. Connexion enseignant
- Se connecter avec `enseignant@ecole.ma / Teacher123!`
- Verifier redirection vers `/teacher/home`
- Saisir/mettre a jour une note pour une matiere autorisee
- Verifier affichage du tableau de notes

3. Connexion etudiant
- Se connecter avec `etudiant1@ecole.ma / Student123!`
- Verifier redirection vers `/student/grades`
- Verifier notes, moyenne et statut

4. Verification securite routes
- Connecte en etudiant, tenter URL `/admin/grades` -> redirection auto
- Connecte en enseignant, tenter URL `/student/grades` -> redirection auto

5. Gestion erreurs API
- Couper backend et verifier message d'erreur sur connexion/page protegee
- Remettre backend et verifier reprise normale
