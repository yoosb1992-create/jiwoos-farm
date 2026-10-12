/** Keep the actual body scroller, tab strip and visible inventory card in place
 * when an authoritative update replaces the DOM (including a removed stack). */
export function updatePanelContent(panel: HTMLElement, body: HTMLElement, render: () => void): void {
  const active = document.activeElement;
  // Let Android/Korean IME finish its current syllable before replacing inputs.
  if (active instanceof HTMLInputElement && body.contains(active) && active.dataset.composing === "true") return;
  const selection = active instanceof HTMLInputElement && active.selectionStart !== null
    ? [active.selectionStart, active.selectionEnd ?? active.selectionStart] as const : undefined;
  const panelTop = panel.scrollTop, bodyTop = body.scrollTop;
  const bounds = body.getBoundingClientRect();
  const anchors = [...body.querySelectorAll<HTMLElement>("[data-scroll-key]")]
    .map(node => ({ key: node.dataset.scrollKey, rect: node.getBoundingClientRect() }))
    .filter(a => a.rect.bottom > bounds.top && a.rect.top < bounds.bottom);
  const scrolls = new Map([...body.querySelectorAll<HTMLElement>("[data-scroll]")]
    .map(node => [node.dataset.scroll, { top: node.scrollTop, left: node.scrollLeft }]));
  const focus = body.contains(document.activeElement)
    ? (document.activeElement as HTMLElement)?.dataset.focus : undefined;
  render();
  if (focus) {
    const restored = [...body.querySelectorAll<HTMLElement>("[data-focus]")].find(node => node.dataset.focus === focus);
    restored?.focus({ preventScroll: true });
    if (selection && restored instanceof HTMLInputElement) restored.setSelectionRange(...selection);
  }
  for (const node of body.querySelectorAll<HTMLElement>("[data-scroll]")) {
    const saved = scrolls.get(node.dataset.scroll);
    node.scrollTop = saved?.top ?? 0;
    node.scrollLeft = saved?.left ?? 0;
  }
  panel.scrollTop = panelTop;
  body.scrollTop = bodyTop;
  const cards = [...body.querySelectorAll<HTMLElement>("[data-scroll-key]")];
  for (const anchor of anchors) {
    const card = cards.find(node => node.dataset.scrollKey === anchor.key);
    if (!card) continue;
    body.scrollTop += card.getBoundingClientRect().top - anchor.rect.top;
    break;
  }
}
