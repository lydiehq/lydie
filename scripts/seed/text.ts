// Deterministic text for the seed and for benchmarks that must not load the store (@lydie/markdown).

export const WORDS = (
  "alpha beta gamma delta river mountain garden kitchen budget roadmap meeting design review " +
  "launch research customer interview pricing hiring onboarding sprint retro backlog feature " +
  "editor sync offline search graph markdown folder vault publish draft outline summary idea " +
  "question answer metric revenue churn growth essay chapter travel recipe tomato coffee book"
).split(" ");

// mulberry32
export function createRandom(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max: number) => Math.floor(next() * max),
    pick: <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)]!,
    words(n: number) {
      return Array.from({ length: n }, () => WORDS[Math.floor(next() * WORDS.length)]!).join(" ");
    },
  };
}

export function sentence(random: ReturnType<typeof createRandom>, n: number): string {
  const text = random.words(n);
  return `${text[0]!.toUpperCase()}${text.slice(1)}.`;
}

export function longMarkdown(blocks: number, seed = 7): string {
  const random = createRandom(seed);
  const out: string[] = ["# Long document", ""];
  for (let i = 0; i < blocks; i++) {
    const kind = i % 10;
    if (kind === 0) out.push(`## Section ${i / 10 + 1}`);
    else if (kind === 3) out.push(`- ${sentence(random, 6)}\n- ${sentence(random, 5)} ^item-${i}`);
    else if (kind === 6) out.push(`> ${sentence(random, 12)}`);
    else if (kind === 8) out.push("```ts\nconst x = " + i + ";\n```");
    else out.push(`${sentence(random, 18)} ${i % 50 === 1 ? `^b${i}` : ""}`.trimEnd());
    out.push("");
  }
  return out.join("\n");
}
