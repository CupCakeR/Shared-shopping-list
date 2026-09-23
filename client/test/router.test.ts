import { expect, test } from "bun:test";
import { historyPath, listPath, parseRoute } from "../src/routes";

test("parses routes", () => {
  expect(parseRoute("/")).toEqual({ name: "home" });
  expect(parseRoute("/l/abc")).toEqual({ name: "list", listId: "abc" });
  expect(parseRoute("/l/abc/")).toEqual({ name: "list", listId: "abc" });
  expect(parseRoute("/l/abc/verlauf")).toEqual({ name: "history", listId: "abc" });
  expect(parseRoute("/l/default")).toEqual({ name: "home" });
  expect(parseRoute("/l/default/verlauf")).toEqual({ name: "history", listId: "default" });
  expect(parseRoute("/something/else")).toEqual({ name: "home" });
});

test("builds paths that round-trip", () => {
  expect(listPath("default")).toBe("/");
  for (const id of ["abc", "a b/ü"]) {
    expect(parseRoute(listPath(id))).toEqual({ name: "list", listId: id });
    expect(parseRoute(historyPath(id))).toEqual({ name: "history", listId: id });
  }
});
