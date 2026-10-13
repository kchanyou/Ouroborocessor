import { EditorState } from "@codemirror/state";
import { expect, it } from "vitest";
import { editorMatchOffsets, searchProject } from "./projectSearch";
import { sourceOffsetForEditor } from "./editorOffsets";
import { replaceCurrentMatch } from "./findReplace";
import type { ManuscriptNode } from "./types";

const scenes: ManuscriptNode[] = [
  { id: "one", kind: "scene", parentId: null, title: "앞부분", content: "시작 한국어 😀\r\n앞부분 종료\r\n", synopsis: "검색대상", status: "draft" },
  { id: "two", kind: "scene", parentId: null, title: "뒷부분", content: "검색대상 日本語 中文 español\r\n특수문자 & < >\t보존\r\n끝", synopsis: "", status: "draft" },
];

it("selects the exact project hit in a real CodeMirror state after crossing documents", () => {
  for (const query of ["日本語", "특수문자", "끝"]) {
    const result = searchProject(scenes, query, true);
    expect(result.hits).toHaveLength(1);
    const hit = result.hits[0];
    expect(hit.sceneId).toBe("two");
    const offsets = editorMatchOffsets(hit);
    const editor = EditorState.create({ doc: hit.source.replace(/\r\n?/g, "\n") });
    const next = editor.update({ selection: { anchor: offsets.start, head: offsets.end } }).state;
    expect(next.sliceDoc(next.selection.main.from, next.selection.main.to)).toBe(query);
    expect(sourceOffsetForEditor(hit.source, next.selection.main.from)).toBe(hit.start);
    expect(sourceOffsetForEditor(hit.source, next.selection.main.to)).toBe(hit.end);
  }
});

it("searches the latest replacement without matching private notes or stale text", () => {
  const changed = replaceCurrentMatch(scenes[1].content, "검색대상", "새 검색어 😀", true, 0);
  const nodes = scenes.map(node => node.id === "two" ? { ...node, content: changed.content } : node);
  expect(searchProject(nodes, "검색대상", true).count).toBe(0);
  const hit = searchProject(nodes, "새 검색어 😀", true).hits[0];
  const { start, end } = editorMatchOffsets(hit);
  const editor = EditorState.create({ doc: hit.source.replace(/\r\n?/g, "\n"), selection: { anchor: start, head: end } });
  expect(editor.sliceDoc(editor.selection.main.from, editor.selection.main.to)).toBe("새 검색어 😀");
  expect(searchProject(scenes, "검색대상", true).count).toBe(1);
});
