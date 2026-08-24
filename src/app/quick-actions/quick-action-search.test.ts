import { describe, expect, test } from "vitest";

import {
  buildQuickActionSearchDocument,
  searchQuickActions,
  type QuickActionSearchable,
} from "./quick-action-search";

function makeEntry(
  id: string,
  fields: { group?: string; keywords?: string[]; prose?: string; title: string },
  priority = 1,
): QuickActionSearchable & { title: string } {
  return {
    document: buildQuickActionSearchDocument({
      groupLabel: fields.group ?? "",
      keywords: fields.keywords ?? [],
      prose: fields.prose ?? "",
      title: fields.title,
    }),
    id,
    priority,
    title: fields.title,
  };
}

function rank(entries: readonly (QuickActionSearchable & { title: string })[], query: string) {
  return (searchQuickActions(entries, query, 20) ?? []).map((result) => result.entry.title);
}

describe("field weighting", () => {
  const entries = [
    makeEntry("title", { title: "Reflection" }),
    makeEntry("keyword", { keywords: ["reflection"], title: "Roughness" }),
    makeEntry("prose", { prose: "Controls how much reflection the floor shows.", title: "Kind" }),
  ];

  test("a hit in the title outranks the same hit in a keyword, which outranks prose", () => {
    expect(rank(entries, "reflection")).toEqual(["Reflection", "Roughness", "Kind"]);
  });
});

describe("matching by prefix", () => {
  const entries = [makeEntry("a", { title: "Roughness" }), makeEntry("b", { title: "Rim" })];

  test("an unfinished word still finds its control", () => {
    expect(rank(entries, "rough")).toEqual(["Roughness"]);
  });

  test("a finished word outranks a prefix of the same length elsewhere", () => {
    expect(rank([...entries, makeEntry("c", { title: "Rim light" })], "rim")[0]).toBe("Rim");
  });
});

describe("coverage", () => {
  const entries = [
    makeEntry("both", { title: "Shadow softness" }),
    makeEntry("one", { title: "Shadow" }),
  ];

  test("an entry accounting for every word beats one answering half of it", () => {
    expect(rank(entries, "shadow softness")).toEqual(["Shadow softness", "Shadow"]);
  });

  test("a partial match is still offered rather than dropped", () => {
    // The whole point of describing rather than naming: half an answer beats none.
    expect(rank(entries, "shadow softness blur")).toContain("Shadow");
  });
});

describe("describing rather than naming", () => {
  const entries = [
    makeEntry("finish", { title: "Finish" }),
    makeEntry("scale", { title: "Scale" }),
  ];

  test("a word that appears nowhere in the schema still reaches the right control", () => {
    // "shiny" is in no label, no description and no option; only the concept map connects it.
    expect(rank(entries, "shiny")[0]).toBe("Finish");
  });

  test("naming the control outranks describing it", () => {
    const direct = searchQuickActions(entries, "finish", 5) ?? [];
    const described = searchQuickActions(entries, "shiny", 5) ?? [];
    expect(direct[0].score).toBeGreaterThan(described[0].score);
  });
});

describe("ambiguous words", () => {
  const entries = [
    makeEntry("oak", { group: "Surface", title: "Oak" }),
    makeEntry("bg-on", { group: "Setup", title: "Background on" }),
  ];

  test("a preposition does not outrank the word carrying the intent", () => {
    // "on" is a real state elsewhere, so it counts — just not enough to win.
    expect(rank(entries, "put it on wood")[0]).toBe("Oak");
  });

  test("the same word still wins when it is the intent", () => {
    expect(rank(entries, "background on")[0]).toBe("Background on");
  });

  test("a two-character resolution is not treated as a preposition", () => {
    const resolutions = [makeEntry("4k", { title: "4K" }), makeEntry("8k", { title: "8K" })];
    expect(rank(resolutions, "4k")).toEqual(["4K"]);
  });
});

describe("ranking stability", () => {
  test("a secondary action does not tie with the control it acts on", () => {
    const entries = [
      makeEntry("spin", { title: "Spin" }),
      makeEntry("reset-spin", { title: "Reset Spin" }, 0.85),
    ];
    expect(rank(entries, "spin")).toEqual(["Spin", "Reset Spin"]);
  });

  test("equal scores resolve the same way every time", () => {
    const entries = [makeEntry("b", { title: "Format" }), makeEntry("a", { title: "Format" })];
    expect(rank(entries, "format")).toEqual(rank(entries, "format"));
  });

  test("a title containing the whole phrase wins outright", () => {
    const entries = [
      makeEntry("a", { title: "Export Video" }),
      makeEntry("b", { keywords: ["export", "video"], title: "Format" }),
    ];
    expect(rank(entries, "export video")[0]).toBe("Export Video");
  });
});

describe("empty queries", () => {
  test("nothing to match on is reported as such, not as no results", () => {
    const entries = [makeEntry("a", { title: "Spin" })];
    // `null` is the caller's cue to show its default suggestions.
    expect(searchQuickActions(entries, "   ", 5)).toBeNull();
    expect(searchQuickActions(entries, "the and of", 5)).toBeNull();
  });

  test("a query matching nothing returns an empty list, not everything", () => {
    const entries = [makeEntry("a", { title: "Spin" })];
    expect(searchQuickActions(entries, "zzzzqqq", 5)).toEqual([]);
  });
});

describe("result limits", () => {
  test("the caller's limit is honoured", () => {
    const entries = Array.from({ length: 30 }, (_, index) =>
      makeEntry(`e${index}`, { title: `Light ${index}` }),
    );
    expect(searchQuickActions(entries, "light", 7)).toHaveLength(7);
  });
});
