export type NodeKind = "group" | "scene";

export type ManuscriptNode = {
  id: string;
  title: string;
  kind: NodeKind;
  parentId: string | null;
  content: string;
  status: string;
  synopsis: string;
};

export type ProjectSnapshot = {
  canUndo: boolean;
  canRedo: boolean;
  projectPath: string;
  title: string;
  nodes: ManuscriptNode[];
};

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export type ResourceCard = {
  id: string; kind: "character" | "place" | "setting"; name: string;
  description: string; aliases: string[]; tags: string[]; deleted: boolean;
};
