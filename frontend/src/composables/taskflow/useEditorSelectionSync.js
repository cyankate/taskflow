import { onMounted, onUnmounted } from "vue";

export function useEditorSelectionSync({ syncDescriptionToolbarState, syncWikiToolbarState }) {
  function onGlobalSelectionChange() {
    syncDescriptionToolbarState();
    syncWikiToolbarState();
  }

  onMounted(() => {
    if (typeof document !== "undefined") {
      document.addEventListener("selectionchange", onGlobalSelectionChange);
    }
  });

  onUnmounted(() => {
    if (typeof document !== "undefined") {
      document.removeEventListener("selectionchange", onGlobalSelectionChange);
    }
  });
}
