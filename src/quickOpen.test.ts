import { expect, it } from "vitest";
import { quickOpenDocuments, searchText } from "./quickOpen";
import type { ManuscriptNode } from "./types";

it("matches Korean initials and mixed syllables without rewriting titles", () => {
  expect(searchText("첫 장면 / 서울", "ㅊ ㅅㅇ")).toBe(true);
  expect(searchText("제1장", "ㅈ1장")).toBe(true);
  expect(searchText("까마귀", "ㄲㅁㄱ")).toBe(true);
  expect(searchText("가마귀", "ㄲㅁㄱ")).toBe(false);
  expect(searchText("서울", "ㅅㅇㅇ")).toBe(false);
  expect(searchText("한국어".normalize("NFD"), "ㅎㄱㅇ")).toBe(true);
  expect(searchText("Résumé Chapter", "résumé chapter")).toBe(true);
});

it("ranks recent documents and disambiguates duplicate titles by ancestor path", () => {
  const node = (id: string, title: string, parentId: string | null, kind: "group" | "scene" = "scene"): ManuscriptNode => ({ id, title, parentId, kind, content: "", status: "draft", synopsis: "" });
  const nodes = [node("a", "첫 부", null, "group"), node("b", "둘째 부", null, "group"), node("1", "장면", "a"), node("2", "장면", "b")];
  const items = quickOpenDocuments(nodes, ["2", "1"]);
  expect(items.map(item => item.node.id)).toEqual(["2", "1", "a", "b"]);
  expect(items.slice(0, 2).map(item => item.path)).toEqual(["둘째 부", "첫 부"]);
  expect(nodes[0].id).toBe("a");
});
