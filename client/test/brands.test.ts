import { expect, test } from "bun:test";
import { brandKey, brandOf } from "../src/brands";

test("normalizes store names", () => {
  expect(brandKey("Müller")).toBe("mueller");
  expect(brandKey("H&M")).toBe("hm");
  expect(brandKey(" REWE City ")).toBe("rewecity");
});

test("matches known brands by prefix, longest first", () => {
  expect(brandOf("REWE City").background).toBe("#CC071E");
  expect(brandOf("Aldi Nord").background).toBe("#2490D7");
  expect(brandOf("Aldi").background).toBe("#2490D7");
  expect(brandOf("Aldi Süd").background).toBe("#00005F");
  expect(brandOf("mueller").path).toBeDefined();
  expect(brandOf("Bauhaus")).toMatchObject({ background: "#E30613", path: undefined, letter: "B" });
});

test("picks a readable foreground", () => {
  expect(brandOf("Netto").foreground).toBe("#000");
  expect(brandOf("Lidl").foreground).toBe("#fff");
});

test("unknown stores get a stable letter badge", () => {
  const a = brandOf("Wochenmarkt");
  expect(a.letter).toBe("W");
  expect(a.path).toBeUndefined();
  expect(brandOf("wochenmarkt").background).toBe(a.background);
  expect(brandOf("").letter).toBe("?");
});

test("an explicit icon wins over the name", () => {
  expect(brandOf("Supermarkt", "rewe").background).toBe("#CC071E");
  expect(brandOf("Lidl", "letter").path).toBeUndefined();
  expect(brandOf("Lidl", "gone-in-a-newer-version").background).toBe("#0050AA");
  expect(brandOf("Lidl", "toString").background).toBe("#0050AA");
});
