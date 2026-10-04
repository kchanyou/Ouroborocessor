// Print preview window. The app injects the manuscript as a complete HTML document before this
// page loads (see print_manuscript in src-tauri). Its styles and body replace this page while
// it is still parsing, so embedded pictures finish loading before the load event, which is when
// the app opens the print panel.
(() => {
  const source = window.__OUROBOROCESSOR_PRINT__;
  if (typeof source !== "string") return;
  const parsed = new DOMParser().parseFromString(source, "text/html");
  document.title = parsed.title;
  for (const style of parsed.head.querySelectorAll("style")) document.head.append(style);
  document.body.replaceChildren(...parsed.body.childNodes);
})();
