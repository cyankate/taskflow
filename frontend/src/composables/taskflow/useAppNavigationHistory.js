import { nextTick, onMounted, onUnmounted, watch } from "vue";

const DEFAULT_NAV = { tab: "dashboard", role: null, ticket: null, wiki: null };

function normalizeNav(raw) {
  const tab = String(raw?.tab || "dashboard");
  const role = raw?.role ? String(raw.role) : null;
  const ticket = Number(raw?.ticket || 0) > 0 ? Number(raw.ticket) : null;
  const wiki = Number(raw?.wiki || 0) > 0 ? Number(raw.wiki) : null;
  return { tab, role, ticket, wiki };
}

function navStatesEqual(a, b) {
  const left = normalizeNav(a);
  const right = normalizeNav(b);
  return (
    left.tab === right.tab &&
    left.role === right.role &&
    left.ticket === right.ticket &&
    left.wiki === right.wiki
  );
}

function buildHistoryUrl(nav) {
  const state = normalizeNav(nav);
  if (state.ticket) return `/ticket/${state.ticket}`;
  if (state.wiki && state.tab === "wiki") return `/wiki/${state.wiki}`;
  if (state.tab === "project_hub" && state.role) {
    return `/project_hub/${encodeURIComponent(state.role)}`;
  }
  return `/${state.tab}`;
}

function parseHistoryPath(pathname) {
  const raw = String(pathname || "").split("?")[0].split("#")[0];
  const path = raw.startsWith("/") ? raw.slice(1) : raw;
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return { ...DEFAULT_NAV };
  if (parts[0] === "ticket" && parts[1]) {
    return normalizeNav({ tab: "dashboard", ticket: parts[1] });
  }
  if (parts[0] === "wiki" && parts[1]) {
    return normalizeNav({ tab: "wiki", wiki: parts[1] });
  }
  if (parts[0] === "project_hub") {
    return normalizeNav({
      tab: "project_hub",
      role: parts[1] ? decodeURIComponent(parts[1]) : null,
    });
  }
  return normalizeNav({ tab: parts[0] });
}

export function useAppNavigationHistory({
  token,
  appBootstrapped,
  activeTab,
  projectHubRoleKey,
  ticketDetail,
  wikiDetail,
  wikiViewMode,
  openTicketDetail,
  openWikiDetailRaw,
}) {
  let syncingFromHistory = false;
  let lastPushedNav = null;
  let appHistoryDepth = 0;
  let pushTimer = null;
  let historyInitialized = false;

  function serializeNavState() {
    const nav = {
      tab: activeTab.value,
      role: projectHubRoleKey.value || null,
      ticket: null,
      wiki: null,
    };
    if (ticketDetail.visible && ticketDetail.ticket?.id) {
      nav.ticket = Number(ticketDetail.ticket.id);
    }
    if (wikiViewMode?.value === "detail" && wikiDetail?.article?.id) {
      nav.wiki = Number(wikiDetail.article.id);
    }
    return normalizeNav(nav);
  }

  function writeHistory(nav, { replace = false } = {}) {
    if (typeof window === "undefined") return;
    const payload = { taskflow: true, nav: normalizeNav(nav) };
    const url = buildHistoryUrl(payload.nav);
    if (replace) {
      window.history.replaceState(payload, "", url);
      appHistoryDepth = 0;
    } else {
      window.history.pushState(payload, "", url);
      appHistoryDepth += 1;
    }
    lastPushedNav = { ...payload.nav };
  }

  function closeTicketOverlay() {
    const fallbackScrollY = Number(ticketDetail.returnContext?.scrollY || 0);
    ticketDetail.visible = false;
    ticketDetail.editing = false;
    ticketDetail.descriptionEditing = false;
    nextTick(() => {
      if (typeof window !== "undefined") {
        window.scrollTo({ top: Math.max(0, fallbackScrollY), behavior: "auto" });
      }
    });
  }

  function closeWikiOverlay() {
    if (wikiViewMode) wikiViewMode.value = "list";
    if (wikiDetail) wikiDetail.visible = false;
  }

  async function applyNavState(rawNav) {
    const nav = normalizeNav(rawNav);
    const ownedSync = !syncingFromHistory;
    if (ownedSync) syncingFromHistory = true;
    try {
      if (activeTab.value !== nav.tab) {
        activeTab.value = nav.tab;
      }

      if (nav.tab === "project_hub") {
        projectHubRoleKey.value = nav.role;
      } else {
        projectHubRoleKey.value = null;
      }

      if (nav.ticket) {
        closeWikiOverlay();
        if (!ticketDetail.visible || Number(ticketDetail.ticket?.id) !== nav.ticket) {
          await openTicketDetail({ id: nav.ticket });
        }
        return;
      }

      if (ticketDetail.visible) {
        closeTicketOverlay();
      }

      if (nav.wiki && nav.tab === "wiki") {
        if (wikiViewMode?.value !== "detail" || Number(wikiDetail?.article?.id) !== nav.wiki) {
          await openWikiDetailRaw({ id: nav.wiki });
          if (wikiViewMode) wikiViewMode.value = "detail";
        }
        return;
      }

      closeWikiOverlay();
    } finally {
      if (ownedSync) syncingFromHistory = false;
    }
  }

  function scheduleHistoryPush() {
    if (syncingFromHistory || typeof window === "undefined") return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      const nextNav = serializeNavState();
      if (lastPushedNav && navStatesEqual(nextNav, lastPushedNav)) return;
      writeHistory(nextNav);
    }, 0);
  }

  async function onPopState(event) {
    if (typeof window === "undefined") return;
    appHistoryDepth = Math.max(0, appHistoryDepth - 1);
    const nav = event.state?.taskflow ? event.state.nav : parseHistoryPath(window.location.pathname);
    await applyNavState(nav || DEFAULT_NAV);
    lastPushedNav = serializeNavState();
  }

  function goBackInApp() {
    if (typeof window === "undefined") return false;
    if (appHistoryDepth > 0) {
      window.history.back();
      return true;
    }
    return false;
  }

  async function bootstrapHistoryFromUrl() {
    if (typeof window === "undefined") return;
    syncingFromHistory = true;
    try {
      const fromState = history.state?.taskflow ? history.state.nav : null;
      const fromPath = parseHistoryPath(window.location.pathname);
      const initialNav = fromState || fromPath;
      const hasDeepLink =
        initialNav.tab !== "dashboard" ||
        initialNav.role ||
        initialNav.ticket ||
        initialNav.wiki;

      if (hasDeepLink) {
        await applyNavState(initialNav);
      }

      const currentNav = serializeNavState();
      writeHistory(currentNav, { replace: true });
    } finally {
      syncingFromHistory = false;
    }
  }

  watch(
    () => [
      activeTab.value,
      projectHubRoleKey.value,
      ticketDetail.visible,
      ticketDetail.ticket?.id,
      wikiViewMode?.value,
      wikiDetail?.visible,
      wikiDetail?.article?.id,
    ],
    () => {
      if (!token.value || !appBootstrapped.value || !historyInitialized) return;
      scheduleHistoryPush();
    },
  );

  async function ensureHistoryInitialized() {
    if (historyInitialized || !token.value || !appBootstrapped.value) return;
    await bootstrapHistoryFromUrl();
    historyInitialized = true;
  }

  watch([token, appBootstrapped], ([nextToken, ready]) => {
    if (!nextToken || !ready) {
      historyInitialized = false;
      lastPushedNav = null;
      appHistoryDepth = 0;
      return;
    }
    nextTick(() => {
      ensureHistoryInitialized();
    });
  });

  onMounted(() => {
    if (typeof window === "undefined") return;
    window.addEventListener("popstate", onPopState);
    ensureHistoryInitialized();
  });

  onUnmounted(() => {
    if (typeof window === "undefined") return;
    window.removeEventListener("popstate", onPopState);
    if (pushTimer) clearTimeout(pushTimer);
  });

  function closeTicketDetailWithHistory(closeTicketDetailCore) {
    if (goBackInApp()) return;
    closeTicketDetailCore();
  }

  function backToWikiListWithHistory(backToWikiListCore) {
    if (goBackInApp()) return;
    backToWikiListCore();
  }

  return {
    goBackInApp,
    closeTicketDetailWithHistory,
    backToWikiListWithHistory,
  };
}
