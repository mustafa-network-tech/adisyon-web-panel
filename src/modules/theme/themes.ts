/** Colour themes a business can pick. The values live in src/app/globals.css ([data-theme]). */
export type ThemeId = "classic" | "ocean" | "burgundy";

export type ThemeOption = {
  id: ThemeId;
  name: string;
  description: string;
  /** Preview colours: sidebar, accent, soft background. */
  swatches: [string, string, string];
};

export const themes: ThemeOption[] = [
  {
    id: "classic",
    name: "Klasik",
    description: "Koyu yeşil zemin, turuncu vurgu. Varsayılan görünüm.",
    swatches: ["#17211d", "#e8623a", "#fff0ea"],
  },
  {
    id: "ocean",
    name: "Okyanus",
    description: "Lacivert zemin, mavi vurgu. Sakin ve kurumsal.",
    swatches: ["#14263a", "#1f78c8", "#e8f2fc"],
  },
  {
    id: "burgundy",
    name: "Bordo",
    description: "Koyu bordo zemin, şarap kırmızısı vurgu. Sıcak ve şık.",
    swatches: ["#2a1620", "#b3263f", "#fdecef"],
  },
];

export const defaultTheme: ThemeId = "classic";

export function isTheme(value: unknown): value is ThemeId {
  return themes.some((theme) => theme.id === value);
}

/** Unknown or missing values fall back to the default theme. */
export function resolveTheme(value: unknown): ThemeId {
  return isTheme(value) ? value : defaultTheme;
}
