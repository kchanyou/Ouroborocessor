import { expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { history, undo, redo, isolateHistory } from "@codemirror/commands";
import { editorChange, editorLinks, linkDecorations } from "./editorLinks";

it("replaces entire valid links without changing the saved document", () => {
  const doc = "A [[resource:stable|미라]] and [[Mira]].";
  const state = EditorState.create({ doc, extensions: [editorLinks] });
  expect(state.doc.toString()).toBe(doc);
  expect(state.field(editorLinks).size).toBe(2);
  expect(state.facet(EditorView.atomicRanges)).toHaveLength(1);
  const ranges: string[] = [];
  state.field(editorLinks).between(0, doc.length, (from, to) => { ranges.push(doc.slice(from, to)); });
  expect(ranges).toEqual(["[[resource:stable|미라]]", "[[Mira]]"]);
});
it("leaves incomplete or malformed link text editable", () => {
  expect(linkDecorations("[[resource:id|%GG]] [[incomplete").size).toBe(0);
});
it("preserves source and history while links stay inline", () => {
  let state = EditorState.create({ doc: "Hello ", extensions: [history(), editorLinks] });
  const after = "Hello [[resource:id|Mira]]";
  state = state.update({ changes: editorChange(state.doc.toString(), after), annotations: isolateHistory.of("full") }).state;
  const target = () => ({ state, dispatch: (transaction: import("@codemirror/state").Transaction) => { state = transaction.state; } });
  expect(undo(target())).toBe(true); expect(state.doc.toString()).toBe("Hello ");
  expect(redo(target())).toBe(true); expect(state.doc.toString()).toBe(after);
});
it("computes lossless local changes for Unicode and ordinary edits", () => {
  const examples = ["", "😀", "😁", "A😀日本語", "A😁日本語", "한국어\n中文", "[[resource:id|Mira]]", "hello world"];
  for (const before of examples) for (const after of examples) {
    const change = editorChange(before, after);
    expect(before.slice(0, change.from) + change.insert + before.slice(change.to)).toBe(after);
  }
});
