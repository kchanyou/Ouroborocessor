import type { ReactNode } from "react";

export type IconName =
  | "add"
  | "book"
  | "chevronDown"
  | "chevronLeft"
  | "chevronRight"
  | "chevronUp"
  | "document"
  | "drag"
  | "focus"
  | "folder"
  | "indent"
  | "import"
  | "inspector"
  | "outdent"
  | "search"
  | "searchAll"
  | "settings"
  | "sidebar"
  | "splitRight"
  | "trash";

const paths: Record<IconName, ReactNode> = {
  add: <path d="M12 5v14M5 12h14" />,
  book: <path d="M12 6.5C10 5 7.5 4.5 4 4.5v13c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-13c-3.5 0-6 .5-8 2Zm0 0v13" />,
  chevronDown: <path d="m7 10 5 5 5-5" />,
  chevronLeft: <path d="m14.5 7-5 5 5 5" />,
  chevronRight: <path d="m9.5 7 5 5-5 5" />,
  chevronUp: <path d="m7 14 5-5 5 5" />,
  document: <path d="M7 3.5h7l4 4V20.5H7v-17Zm7 0v4h4M10 12h5M10 15.5h5" />,
  drag: (
    <>
      <circle cx="9" cy="7" r="1" />
      <circle cx="15" cy="7" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="9" cy="17" r="1" />
      <circle cx="15" cy="17" r="1" />
    </>
  ),
  focus: <path d="M8 4H4v4M16 4h4v4M8 20H4v-4M16 20h4v-4" />,
  folder: <path d="M3.5 7.5h6l2-2h9v13h-17v-11Z" />,
  indent: <path d="M4 6h9M4 10h9M4 14h5M4 18h5m5-6 4 3-4 3" />,
  import: <path d="M12 4v10m-4-4 4 4 4-4M5 14v5h14v-5" />,
  inspector: <path d="M4 5h16v14H4V5Zm11 0v14M17.5 9h.01M17.5 12h.01" />,
  outdent: <path d="M4 6h9M4 10h9M8 14h5M8 18h5m-9-3 4-3v6Z" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="5.5" />
      <path d="m15 15 4.5 4.5" />
    </>
  ),
  searchAll: (
    <>
      <path d="M4 3h11M4 6h8M4 9h5" />
      <circle cx="13" cy="13" r="5" />
      <path d="m17 17 4 4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 13.5v-3l-2-.7-.5-1.2.9-1.9-2.1-2.1-1.9.9-1.2-.5-.7-2h-3l-.7 2-1.2.5-1.9-.9-2.1 2.1.9 1.9-.5 1.2-2 .7v3l2 .7.5 1.2-.9 1.9 2.1 2.1 1.9-.9 1.2.5.7 2h3l.7-2 1.2-.5 1.9.9 2.1-2.1-.9-1.9.5-1.2 2-.7Z" />
    </>
  ),
  sidebar: <path d="M4 5h16v14H4V5Zm5 0v14M6.5 8h.01M6.5 11h.01" />,
  splitRight: <path d="M4 5h16v14H4V5Zm8 0v14m3-8.5 2 1.5-2 1.5" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12M10 11v5M14 11v5" />,
};

export function AppIcon({ name }: { name: IconName }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}
