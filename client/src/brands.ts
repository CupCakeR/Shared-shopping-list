import {
  siAldinord,
  siAldisud,
  siDm,
  siEdeka,
  siGlobus,
  siHandm,
  siIkea,
  siKaufland,
  siLidl,
  siMediamarkt,
  siMuller,
  siNetto,
  siPenny,
  siPicnic,
  siRewe,
  siRossmann,
  siSaturn,
} from "simple-icons";

export type Brand = { background: string; foreground: string; path?: string; letter: string };

/** Lowercase letters and digits only, umlauts spelled out: "Müller" and "mueller" match. */
export const brandKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");

type BrandIcon = { title: string; hex: string; path?: string };

/** Pickable brands, keyed by id (stored in List.icon). Ids double as name keys: "REWE City" → rewe. */
const brands: Record<string, BrandIcon> = {
  aldinord: siAldinord,
  aldisued: siAldisud,
  lidl: siLidl,
  rewe: siRewe,
  edeka: siEdeka,
  kaufland: siKaufland,
  penny: siPenny,
  netto: siNetto,
  globus: siGlobus,
  picnic: siPicnic,
  dm: siDm,
  rossmann: siRossmann,
  mueller: siMuller,
  ikea: siIkea,
  mediamarkt: siMediamarkt,
  saturn: siSaturn,
  hm: siHandm,
  // Not in Simple Icons: a letter in the brand color.
  bauhaus: { title: "Bauhaus", hex: "E30613" },
  obi: { title: "OBI", hex: "FF7E21" },
  hornbach: { title: "Hornbach", hex: "F7A600" },
  decathlon: { title: "Decathlon", hex: "0082C3" },
};

// Name prefixes that aren't a brand id. Plain "Aldi" is Nord; name the store "Aldi Süd" for the other one.
const aliases: Record<string, string> = { aldi: "aldinord" };

// A store matches when its key starts with one of these. Longest wins, so "aldisued" beats "aldi".
const prefixes: [string, string][] = [...Object.keys(brands).map((id): [string, string] => [id, id]), ...Object.entries(aliases)].sort(
  (a, b) => b[0].length - a[0].length,
);

/** For the icon picker: every brand, in the order above. */
export const brandChoices = Object.entries(brands).map(([id, b]) => ({ id, title: b.title }));

/** Forces the plain letter badge, for stores that happen to start like a brand. */
export const LETTER_ICON = "letter";

/** Black or white, whichever reads better on the brand color (Netto's yellow needs black). */
function foregroundFor(hex: string) {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.4 ? "#000" : "#fff";
}

/** The store's pick (List.icon) wins; null, or an id this version doesn't know, matches the name. */
function brandId(key: string, icon: string | null): string | undefined {
  if (icon === LETTER_ICON) return undefined;
  if (icon && Object.hasOwn(brands, icon)) return icon;
  return prefixes.find(([prefix]) => key.startsWith(prefix))?.[1];
}

export function brandOf(name: string, icon: string | null = null): Brand {
  const key = brandKey(name);
  const letter = ([...name.trim()][0] ?? "?").toUpperCase();
  const id = brandId(key, icon);
  const match = id && brands[id];
  if (match) {
    // Letter-only brands show their own initial, also when picked for a store with another name.
    const initial = match.path ? letter : match.title[0]!;
    return { background: `#${match.hex}`, foreground: foregroundFor(match.hex), path: match.path, letter: initial };
  }
  // No brand: a stable color from the name, so the store keeps the same badge.
  let hue = 0;
  for (const ch of key) hue = (hue * 31 + ch.charCodeAt(0)) % 360;
  return { background: `oklch(0.62 0.13 ${hue})`, foreground: "#fff", letter };
}
