export const WORKSPACE_COLORS = [
  { value: "#ff7a95", name: "Pastel Pink" },
  { value: "#ffb366", name: "Pastel Peach" },
  { value: "#ffeb3b", name: "Pastel Yellow" },
  { value: "#4dd0e1", name: "Pastel Mint" },
  { value: "#64b5f6", name: "Pastel Blue" },
  { value: "#ba68c8", name: "Pastel Lavender" },
  { value: "#f06292", name: "Pastel Rose" },
  { value: "#9575cd", name: "Lavender" },
  { value: "#d4c157", name: "Pastel Khaki" },
  { value: "#26a69a", name: "Pastel Turquoise" },
  { value: "#ff8a95", name: "Pastel Coral" },
  { value: "#7986cb", name: "Pastel Periwinkle" },
  { value: "#ef5350", name: "Pastel Red" },
  { value: "#66bb6a", name: "Pastel Green" },
] as const

export function getRandomWorkspaceColor() {
  const randomColor = WORKSPACE_COLORS[Math.floor(Math.random() * WORKSPACE_COLORS.length)]!
  return randomColor.value
}
