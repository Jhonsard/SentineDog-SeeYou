# Snort Network Monitoring Application - Guide d'Installation

## 📋 Contenu du projet

Ce projet contient :
- **Application Web** : Interface interactive de présentation (React + TypeScript + Tailwind CSS)
- **Application Java** : Interface graphique Snort (Java Swing)

## 🚀 Démarrage rapide

### Prérequis
- Node.js 18+ et npm
- Java 17+ (pour l'application Java)
- VS Code (recommandé)

### Étape 1 : Installation des dépendances
```bash
npm install
```

### Étape 2 : Lancer le serveur de développement
```bash
npm run dev
```

### Étape 3 : Ouvrir dans le navigateur
Ouvrez `http://localhost:5173/` dans votre navigateur

## 🎨 Design

L'application utilise un design **Cyberpunk** avec :
- Couleurs : Vert néon (#00ff41), Cyan électrique (#00d4ff), Crimson rouge (#ff0055)
- Thème sombre par défaut
- Polices : Space Mono (titres), Roboto (corps)

## 📱 Pages disponibles

1. **Accueil** : Présentation générale de l'application
2. **Fonctionnalités** : Détails des contrôles et graphiques
3. **Layout** : Description de l'interface graphique
4. **Implémentation Java** : Informations techniques

## 🖥️ Application Java

Pour exécuter l'application Java :

```bash
java -cp . SnortGUI
```

### Composants Java
- **Bouton gauche** : Démarrer la surveillance (Vert lime)
- **Bouton droit** : Arrêter la surveillance (Crimson rouge)
- **Bouton haut-droit** : Accès à l'IA (Cyan électrique)
- **Menu déroulant** : 4 pages de navigation
- **Centre** : Espace pour graphiques temps réel

## 📦 Structure du projet

```
snort_network_monitor/
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Home.tsx (page principale)
│   │   │   └── NotFound.tsx (page 404)
│   │   ├── components/
│   │   │   └── ui/ (composants shadcn)
│   │   ├── contexts/
│   │   │   └── ThemeContext.tsx
│   │   ├── lib/
│   │   │   └── utils.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css
│   ├── public/
│   │   ├── hero-banner.png
│   │   └── feature-graph.png
│   └── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── tailwind.config.ts
```

## 🛠️ Scripts disponibles

- `npm run dev` - Lancer le serveur de développement
- `npm run build` - Compiler pour la production
- `npm run preview` - Prévisualiser la build
- `npm run check` - Vérifier les types TypeScript
- `npm run format` - Formater le code

## 🎯 Prochaines étapes

1. **Développer la page IA** : Ajouter les fonctionnalités d'IA
2. **Intégrer les graphiques** : Utiliser Recharts pour les graphiques temps réel
3. **Backend** : Ajouter une API pour la surveillance réseau
4. **Déploiement** : Publier l'application

## 📞 Support

Pour toute question ou problème, consultez :
- Documentation Manus : https://help.manus.im
- Documentation React : https://react.dev
- Documentation Tailwind : https://tailwindcss.com

---

**Créé avec ❤️**
