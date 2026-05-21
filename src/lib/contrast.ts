const DARK_TEXT = "#1f2933";
const LIGHT_TEXT = "#ffffff";
const DEFAULT_TEXT = "#1f2933";

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const srgb = channel / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : Math.pow((srgb + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function pickTextColor(fills: string[]): string {
  if (fills.length === 0) {
    return DEFAULT_TEXT;
  }

  const luminances = fills.map(relativeLuminance);
  const avg = luminances.reduce((sum, value) => sum + value, 0) / luminances.length;
  return avg > 0.5 ? DARK_TEXT : LIGHT_TEXT;
}

export function pickTextStyle(fills: string[]): string {
  const color = pickTextColor(fills);

  if (fills.length < 2) {
    return `color: ${color}`;
  }

  const luminances = fills.map(relativeLuminance);
  const spread = Math.max(...luminances) - Math.min(...luminances);

  if (spread <= 0.4) {
    return `color: ${color}`;
  }

  const shadow = color === DARK_TEXT ? LIGHT_TEXT : DARK_TEXT;
  return `color: ${color}; text-shadow: 0 0 2px ${shadow}, 0 0 2px ${shadow}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "").trim();
  const expanded = value.length === 3
    ? value.split("").map((char) => char + char).join("")
    : value;

  const int = Number.parseInt(expanded, 16);
  if (!Number.isFinite(int)) {
    return [0, 0, 0];
  }

  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff];
}
