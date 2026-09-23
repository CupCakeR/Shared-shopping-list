import { describe, expect, test } from "bun:test";
import type { Item } from "../../shared/types";
import { groupHistory } from "../src/history";
import { rankHistory, suggest } from "../src/suggest";

const DAY = 24 * 3600_000;
const NOW = new Date(2026, 8, 23, 18, 0).getTime(); // Wed 23 Sep 2026, 18:00 local

let n = 0;
function item(name: string, o: Partial<Item> = {}): Item {
  return {
    id: String(n++),
    list_id: "default",
    name,
    quantity: null,
    note: null,
    category: null,
    checked: true,
    checked_at: NOW,
    checked_by: "tom",
    added_by: "tom",
    created_at: NOW,
    updated_at: NOW,
    deleted_at: NOW,
    rev: 1,
    ...o,
  };
}

const names = (s: { name: string }[]) => s.map((x) => x.name);

describe("rankHistory", () => {
  test("ranks by frequency, merging spellings and using the latest one", () => {
    const ranked = rankHistory(
      [item("milch", { created_at: NOW - 2 * DAY }), item("Milch "), item("Brot"), item("Milch", { created_at: NOW - DAY })],
      "default",
      NOW,
    );
    expect(names(ranked)).toEqual(["Milch", "Brot"]);
  });

  test("recent use beats old use", () => {
    const ranked = rankHistory(
      [item("Eier", { created_at: NOW - 200 * DAY }), item("Eier", { created_at: NOW - 200 * DAY }), item("Käse")],
      "default",
      NOW,
    );
    expect(names(ranked)).toEqual(["Käse", "Eier"]);
  });

  test("the current list counts double", () => {
    const ranked = rankHistory(
      [item("Schrauben", { list_id: "hw" }), item("Nudeln"), item("Schrauben", { list_id: "hw" }), item("Nudeln")],
      "hw",
      NOW,
    );
    expect(names(ranked)).toEqual(["Schrauben", "Nudeln"]);
  });

  test("names already open on the list are left out", () => {
    const ranked = rankHistory([item("Milch"), item("milch", { checked: false, deleted_at: null }), item("Brot")], "default", NOW);
    expect(names(ranked)).toEqual(["Brot"]);
  });
});

describe("suggest", () => {
  const ranked = rankHistory(
    ["Hafermilch", "Frische Milch", "Milchreis", "Buttermilch", "Brot", "Milch"].map((name) => item(name)),
    "default",
    NOW,
  );

  test("prefix, then word start, then substring; exact match dropped", () => {
    expect(names(suggest(ranked, "milch"))).toEqual(["Milchreis", "Frische Milch", "Hafermilch", "Buttermilch"]);
  });

  test("empty query returns the top of the ranking", () => {
    expect(suggest(ranked, "  ", 2)).toHaveLength(2);
  });

  test("is case- and umlaut-safe", () => {
    const r = rankHistory([item("Äpfel")], "default", NOW);
    expect(names(suggest(r, "äp"))).toEqual(["Äpfel"]);
  });
});

describe("groupHistory", () => {
  test("groups checked items by day, newest first, with German labels", () => {
    const days = groupHistory(
      [
        item("Milch", { checked_at: NOW - 1000 }),
        item("Brot", { checked_at: NOW - DAY }),
        item("Eier", { checked_at: NOW - 3 * DAY }),
        item("Käse", { checked_at: NOW - 60 }),
        item("Offen", { checked: false, checked_at: null, deleted_at: null }),
        item("Andere Liste", { list_id: "hw" }),
      ],
      "default",
      NOW,
    );
    expect(days.map((d) => [d.label, names(d.items)])).toEqual([
      ["Heute", ["Käse", "Milch"]],
      ["Gestern", ["Brot"]],
      ["Sonntag, 20. September", ["Eier"]],
    ]);
  });

  test("adds the year for older days", () => {
    const [day] = groupHistory([item("Milch", { checked_at: new Date(2025, 11, 24).getTime() })], "default", NOW);
    expect(day!.label).toBe("Mittwoch, 24. Dezember 2025");
  });
});
