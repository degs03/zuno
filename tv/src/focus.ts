/**
 * Spatial navigation for the TV remote.
 *
 * Anything with `data-focus` can take focus. The arrows pick the nearest focusable in that
 * direction by geometry. A container with `data-group="<name>"` remembers its last focused
 * child, so leaving the sidebar and coming back lands where you were, and a shelf row
 * remembers its column. The topmost `data-layer` (dialogs, the karaoke screen) traps focus.
 *
 * Real DOM focus is used as well as the `is-focus` class: inputs need it for the webOS
 * on-screen keyboard, and the Magic Remote pointer moves it on hover.
 */

export type Direction = "up" | "down" | "left" | "right";

let current: HTMLElement | null = null;
const remembered: Record<string, HTMLElement> = {};

function layer(): ParentNode {
  const layers = document.querySelectorAll("[data-layer]");
  return layers.length ? layers[layers.length - 1] : document;
}

function focusables(): HTMLElement[] {
  const nodes = layer().querySelectorAll("[data-focus]");
  const out: HTMLElement[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const el = nodes[i] as HTMLElement;
    if (el.offsetParent !== null || el.getAttribute("data-focus") === "fixed") out.push(el);
  }
  return out;
}

function groupOf(el: Element | null): HTMLElement | null {
  let node = el ? el.parentElement : null;
  while (node) {
    if (node.hasAttribute("data-group")) return node;
    node = node.parentElement;
  }
  return null;
}

function isAttached(el: HTMLElement): boolean {
  return document.body.contains(el) && layer().contains(el);
}

/** Keeps `el` inside every scrollable ancestor marked `data-scroll`, with some margin. */
function reveal(el: HTMLElement): void {
  let node = el.parentElement;
  while (node) {
    const axis = node.getAttribute("data-scroll");
    if (axis) {
      const box = node.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      if (axis === "x") {
        const margin = 120;
        if (rect.left < box.left + margin) node.scrollLeft -= box.left + margin - rect.left;
        else if (rect.right > box.right - margin) node.scrollLeft += rect.right - (box.right - margin);
      } else {
        const margin = 260;
        if (rect.top < box.top + margin) node.scrollTop -= box.top + margin - rect.top;
        else if (rect.bottom > box.bottom - margin) node.scrollTop += rect.bottom - (box.bottom - margin);
      }
    }
    node = node.parentElement;
  }
}

export function focus(el: HTMLElement | null): void {
  if (!el) return;
  if (current && current !== el) current.className = current.className.replace(/\s?is-focus\b/g, "");
  current = el;
  if (!/\bis-focus\b/.test(el.className)) el.className += " is-focus";
  if (!el.hasAttribute("tabindex") && el.tagName !== "INPUT") el.setAttribute("tabindex", "-1");
  try {
    // An input only takes real focus on OK (keys.ts): on webOS that opens the keyboard, which
    // must not pop up just because the user arrowed past the search field.
    if (el.tagName === "INPUT") {
      if (document.activeElement && document.activeElement !== el) (document.activeElement as HTMLElement).blur();
    } else el.focus();
  } catch {
    // Some elements refuse focus; the class still shows it.
  }
  const group = groupOf(el);
  if (group) remembered[group.getAttribute("data-group") as string] = el;
  reveal(el);
}

export function getFocused(): HTMLElement | null {
  return current && isAttached(current) ? current : null;
}

/** Focus the element marked `data-autofocus`, else a remembered one in `group`, else the first. */
export function focusFirst(group?: string): void {
  const memory = group ? remembered[group] : undefined;
  if (memory && isAttached(memory)) return focus(memory);
  const auto = layer().querySelector("[data-autofocus]") as HTMLElement | null;
  if (auto) return focus(auto);
  const all = focusables();
  if (all.length) focus(all[0]);
}

/** If focus was lost (its element re-rendered away), put it somewhere sensible. */
export function ensureFocus(): void {
  if (!getFocused()) focusFirst();
}

function center(rect: ClientRect) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export function move(direction: Direction): boolean {
  const from = getFocused();
  if (!from) {
    focusFirst();
    return true;
  }
  const origin = from.getBoundingClientRect();
  const o = center(origin);
  const fromGroup = groupOf(from);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  const candidates = focusables();
  for (let i = 0; i < candidates.length; i++) {
    const el = candidates[i];
    if (el === from) continue;
    const rect = el.getBoundingClientRect();
    const c = center(rect);
    let primary: number;
    let secondary: number;
    if (direction === "right") {
      if (rect.left < origin.right - 4) continue;
      primary = rect.left - origin.right;
      secondary = Math.abs(c.y - o.y);
    } else if (direction === "left") {
      if (rect.right > origin.left + 4) continue;
      primary = origin.left - rect.right;
      secondary = Math.abs(c.y - o.y);
    } else if (direction === "down") {
      if (rect.top < origin.bottom - 4) continue;
      primary = rect.top - origin.bottom;
      secondary = Math.abs(c.x - o.x);
    } else {
      if (rect.bottom > origin.top + 4) continue;
      primary = origin.top - rect.bottom;
      secondary = Math.abs(c.x - o.x);
    }
    const score = primary + secondary * 2;
    if (score < bestScore) {
      bestScore = score;
      best = el;
    }
  }
  if (!best) return false;

  // Entering another group: go back to where you were in it.
  const toGroup = groupOf(best);
  if (toGroup && toGroup !== fromGroup) {
    const memory = remembered[toGroup.getAttribute("data-group") as string];
    if (memory && isAttached(memory) && memory !== from) best = memory;
  }
  focus(best);
  return true;
}

/** Magic Remote pointer: hovering a focusable focuses it. */
export function installPointerFocus(): void {
  document.addEventListener("mouseover", (event) => {
    let node = event.target as HTMLElement | null;
    while (node && node !== document.body) {
      if (node.hasAttribute && node.hasAttribute("data-focus")) {
        if (node !== current && layer().contains(node)) focus(node);
        return;
      }
      node = node.parentElement;
    }
  });
}
