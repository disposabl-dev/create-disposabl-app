import { describe, expect, test } from "bun:test";
import { selectFeatures } from "../options";

describe("feature selection", () => {
  test("defaults to authentication but allows none and explicit choices", () => {
    expect(selectFeatures()).toEqual(["authentication"]);
    expect(selectFeatures("none")).toEqual([]);
    expect(selectFeatures("docs")).toEqual(["docs"]);
    expect(selectFeatures("authentication,docs")).toEqual([
      "docs",
      "authentication",
    ]);
    expect(() => selectFeatures("unknown")).toThrow();
  });
});
