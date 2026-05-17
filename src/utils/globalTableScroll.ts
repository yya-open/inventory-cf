const TABLE_SELECTOR = '.el-table';
const ROOT_ATTR = 'data-app-table-scroll-enhanced';

type Cleanup = () => void;

interface EnhancedTable {
  root: HTMLElement;
  bar: HTMLElement;
  inner: HTMLElement;
  cleanup: Cleanup;
}

function resolveScrollElement(root: HTMLElement): HTMLElement | null {
  const candidates = [
    ...Array.from(root.querySelectorAll<HTMLElement>('.el-table__body-wrapper .el-scrollbar__wrap')),
    ...Array.from(root.querySelectorAll<HTMLElement>('.el-table__body-wrapper')),
    ...Array.from(root.querySelectorAll<HTMLElement>('.el-scrollbar__wrap')),
  ];
  if (!candidates.length) return null;
  return candidates.find((el) => el.scrollWidth > el.clientWidth + 8) || candidates[0] || null;
}

function enhanceSingleTable(root: HTMLElement): EnhancedTable | null {
  if (root.getAttribute(ROOT_ATTR) === '1') return null;
  const parent = root.parentElement;
  if (!parent) return null;

  root.setAttribute(ROOT_ATTR, '1');

  const bar = document.createElement('div');
  bar.className = 'app-table-scroll-shell__topbar';
  bar.setAttribute('aria-hidden', 'true');
  const inner = document.createElement('div');
  inner.className = 'app-table-scroll-shell__topbar-inner';
  bar.appendChild(inner);
  parent.insertBefore(bar, root);

  let scrollEl: HTMLElement | null = null;
  let syncingFromTop = false;
  let syncingFromBody = false;
  let removeScrollListener: Cleanup = () => {};
  const resizeObserver = new ResizeObserver(() => scheduleRefresh());
  const mutationObserver = new MutationObserver(() => scheduleRefresh());

  const onTopScroll = () => {
    if (!scrollEl || syncingFromBody) return;
    syncingFromTop = true;
    scrollEl.scrollLeft = bar.scrollLeft;
    syncingFromTop = false;
  };
  bar.addEventListener('scroll', onTopScroll, { passive: true });

  const bindScrollElement = (next: HTMLElement | null) => {
    if (scrollEl === next) return;
    removeScrollListener();
    scrollEl = next;
    if (!scrollEl) {
      bar.style.display = 'none';
      return;
    }
    const onBodyScroll = () => {
      if (syncingFromTop) return;
      syncingFromBody = true;
      bar.scrollLeft = scrollEl?.scrollLeft || 0;
      syncingFromBody = false;
    };
    scrollEl.addEventListener('scroll', onBodyScroll, { passive: true });
    removeScrollListener = () => scrollEl?.removeEventListener('scroll', onBodyScroll);
  };

  let refreshTimer: number | null = null;
  const refresh = () => {
    refreshTimer = null;
    bindScrollElement(resolveScrollElement(root));
    const next = scrollEl;
    if (!next) {
      bar.style.display = 'none';
      return;
    }
    const overflow = next.scrollWidth > next.clientWidth + 8;
    if (!overflow) {
      bar.style.display = 'none';
      return;
    }
    bar.style.display = '';
    inner.style.width = `${next.scrollWidth}px`;
    bar.scrollLeft = next.scrollLeft;
  };

  const scheduleRefresh = () => {
    if (refreshTimer != null) window.cancelAnimationFrame(refreshTimer);
    refreshTimer = window.requestAnimationFrame(refresh);
  };

  resizeObserver.observe(root);
  mutationObserver.observe(root, { subtree: true, childList: true, attributes: true, characterData: false });
  scheduleRefresh();

  const cleanup = () => {
    if (refreshTimer != null) window.cancelAnimationFrame(refreshTimer);
    removeScrollListener();
    resizeObserver.disconnect();
    mutationObserver.disconnect();
    bar.removeEventListener('scroll', onTopScroll);
    bar.remove();
    root.removeAttribute(ROOT_ATTR);
  };

  return { root, bar, inner, cleanup };
}

export function installGlobalTableScrollEnhancer(): Cleanup {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  const enhanced = new Map<HTMLElement, EnhancedTable>();

  const refreshAll = () => {
    const current = new Set(Array.from(document.querySelectorAll<HTMLElement>(TABLE_SELECTOR)));

    current.forEach((root) => {
      if (enhanced.has(root)) return;
      const item = enhanceSingleTable(root);
      if (item) enhanced.set(root, item);
    });

    Array.from(enhanced.keys()).forEach((root) => {
      if (document.contains(root)) return;
      enhanced.get(root)?.cleanup();
      enhanced.delete(root);
    });
  };

  const observer = new MutationObserver(() => refreshAll());
  observer.observe(document.body, { subtree: true, childList: true });
  refreshAll();
  window.addEventListener('resize', refreshAll, { passive: true });

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', refreshAll);
    enhanced.forEach((item) => item.cleanup());
    enhanced.clear();
  };
}
