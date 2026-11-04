---
name: theme-clair-sombre
description: Met en place le thème clair/sombre de SentineDog (Tailwind 4, variables CSS, ThemeContext, ThemeToggle, script anti-flash). À utiliser pour la phase "Variables et thème".
---

# Thème clair / sombre

## Étapes

1. Lire `client/src/index.css`, `contexts/ThemeContext.tsx`, `client/index.html`.
2. Dans `index.css` : déclarer le variant, les variables et l'exposition Tailwind. Adapter aux noms déjà présents (exemple, à ajuster) :

```css
@custom-variant dark (&:where(.dark, .dark *));

:root {
  --background: #ffffff;
  --foreground: #222526;
  --card: #ffffff;
  --card-foreground: #222526;
  --border: #222526;
  --input: #222526;
  --ring: #222526;
  --primary: #222526;
  --primary-foreground: #ffffff;
  --sidebar: #e0e0e0;
  --sidebar-foreground: #222526;
  --sidebar-border: #222526;
}
.dark {
  --background: #000000;
  --foreground: #e0e0e0;
  --card: #000000;
  --card-foreground: #e0e0e0;
  --border: #e0e0e0;
  --input: #e0e0e0;
  --ring: #e0e0e0;
  --primary: #e0e0e0;
  --primary-foreground: #000000;
  --sidebar: #353a3e;
  --sidebar-foreground: #e0e0e0;
  --sidebar-border: #e0e0e0;
}
@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-border: var(--border);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
}
```

Les autres variables shadcn (`--secondary`, `--muted`, `--accent`, `--popover`, `--destructive`...) pointent vers ces mêmes valeurs ; les états (destructif, sélection) se distinguent par contour, libellé et icône.

3. `client/index.html` : script synchrone dans `<head>` pour éviter le flash :

```html
<script>
  (function () {
    try {
      var t = localStorage.getItem("theme");
      var dark = t
        ? t === "dark"
        : window.matchMedia("(prefers-color-scheme: dark)").matches;
      document.documentElement.classList.toggle("dark", dark);
    } catch (e) {}
  })();
</script>
```

4. `ThemeContext.tsx` : conserver l'API existante, clé `theme` (`'light'` | `'dark'`), fallback `prefers-color-scheme`, toujours dans un `try/catch`.
5. `ThemeToggle` : bouton natif, `aria-pressed` ou libellé dynamique, focus visible, icône + texte accessible.
6. Vérifier : rechargement conserve le choix ; aucun flash ; `pnpm check`.
