const ADJECTIVES = [
  "Rapid",
  "Witty",
  "Brave",
  "Silent",
  "Bright",
  "Calm",
  "Bold",
  "Eager",
  "Gentle",
  "Happy",
  "Jolly",
  "Keen",
  "Lively",
  "Merry",
  "Noble",
  "Proud",
  "Quick",
  "Royal",
  "Smart",
  "Tender",
  "Vivid",
  "Warm",
  "Zesty",
  "Mighty",
  "Sunny",
  "Lucky",
  "Snowy",
  "Clever",
  "Daring",
  "Sleek",
];

const NOUNS = [
  "Fox",
  "Wolf",
  "Bear",
  "Otter",
  "Lynx",
  "Hawk",
  "Owl",
  "Crane",
  "Stag",
  "Tiger",
  "Panda",
  "Eagle",
  "Falcon",
  "Heron",
  "Koala",
  "Lemur",
  "Lion",
  "Moose",
  "Panther",
  "Pelican",
  "Raven",
  "Robin",
  "Salmon",
  "Sparrow",
  "Swift",
  "Tortoise",
  "Whale",
  "Zebra",
  "Buffalo",
  "Cheetah",
];

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function generateDisplayName(): string {
  const digits = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `${pick(ADJECTIVES)}${pick(NOUNS)}${digits}`;
}
