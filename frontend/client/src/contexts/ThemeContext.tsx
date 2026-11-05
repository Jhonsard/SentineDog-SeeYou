import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

export type Theme = "light" | "dark";

export const COLOR_THEMES = [
  { id: "theme-1", label: "Thème Neutre" },
  { id: "theme-2", label: "Thème Bleu / Violet" },
  { id: "theme-3", label: "Thème Rouge / Bordeaux" },
  { id: "theme-4", label: "Thème Vert / Teal" },
  { id: "theme-5", label: "Thème Minimaliste (Noir & Blanc)" },
] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number]["id"];

export const DEFAULT_COLOR_THEME: ColorTheme = "theme-5";

const STORAGE_KEY = "theme";
const COLOR_THEME_KEY = "color-theme";
const COLOR_THEME_IDS: readonly string[] = COLOR_THEMES.map((item) => item.id);

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  colorTheme: ColorTheme;
  setColorTheme: (theme: ColorTheme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultTheme?: Theme;
}

function getStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    return null;
  }
}

function getStoredColorTheme(): ColorTheme {
  try {
    const stored = window.localStorage.getItem(COLOR_THEME_KEY);
    if (stored && COLOR_THEME_IDS.includes(stored)) {
      return stored as ColorTheme;
    }
  } catch {
    // Stockage indisponible : thème par défaut.
  }
  return DEFAULT_COLOR_THEME;
}

function getSystemTheme(): Theme | null {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return null;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => getStoredTheme() ?? getSystemTheme() ?? defaultTheme,
  );
  const [colorTheme, setColorTheme] = useState<ColorTheme>(getStoredColorTheme);
  const userChosenRef = useRef(false);

  // Applique la classe du thème de couleurs sur <html>.
  useEffect(() => {
    const root = document.documentElement;
    COLOR_THEMES.forEach(({ id }) => root.classList.remove(id));
    root.classList.add(colorTheme);
  }, [colorTheme]);

  // Applique le mode clair/sombre sans toucher au thème de couleurs.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Persiste le thème de couleurs.
  useEffect(() => {
    try {
      window.localStorage.setItem(COLOR_THEME_KEY, colorTheme);
    } catch {
      // Stockage indisponible : le thème reste fonctionnel.
    }
  }, [colorTheme]);

  // Persiste uniquement un choix explicite du mode clair/sombre.
  useEffect(() => {
    if (!userChosenRef.current) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Stockage indisponible (navigation privée) : le thème reste fonctionnel.
    }
  }, [theme]);

  // Tant qu'aucun choix de mode n'est stocké, suivre les changements du système.
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      if (!getStoredTheme()) {
        setTheme(event.matches ? "dark" : "light");
      }
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggleTheme = useCallback(() => {
    userChosenRef.current = true;
    setTheme((prev) => (prev === "light" ? "dark" : "light"));
  }, []);

  const chooseColorTheme = useCallback((next: ColorTheme) => {
    if (COLOR_THEME_IDS.includes(next)) {
      setColorTheme(next);
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        colorTheme,
        setColorTheme: chooseColorTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
