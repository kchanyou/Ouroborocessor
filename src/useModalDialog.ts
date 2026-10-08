import { useEffect, useRef } from "react";

/** Native modality keeps background controls inert and restores the opener's focus. */
export function useModalDialog() {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return ref;
}
