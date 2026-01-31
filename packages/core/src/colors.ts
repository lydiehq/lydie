export const COLORS = [
  { id: "coral", value: "#E09C9C", name: "Coral Blush" },
  { id: "purple", value: "#C9A0DC", name: "Lavender Dream" },
  { id: "blue", value: "#9BB5D4", name: "Sky Mist" },
  { id: "mint", value: "#81C5BE", name: "Mint Frost" },
  { id: "gold", value: "#E8B974", name: "Golden Sand" },
  { id: "pink", value: "#DF8EA3", name: "Rose Petal" },
  { id: "periwinkle", value: "#A8B8E8", name: "Periwinkle" },
  { id: "green", value: "#90C9AA", name: "Sage Green" },
  { id: "peach", value: "#E3A587", name: "Peach Cream" },
  { id: "violet", value: "#B89CD9", name: "Violet Haze" },
  { id: "cyan", value: "#7DBCD6", name: "Ocean Breeze" },
  { id: "rose", value: "#D4A5A5", name: "Dusty Rose" },
] as const;

export function getColorById(id: string) {
  return COLORS.find((color) => color.id === id);
}

export function getRandomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)];
}

export type ColorId = (typeof COLORS)[number]["id"];
