/**
 * Joins class names; a later class replaces an earlier one from the same
 * utility group (e.g. `w-full` then `w-40` → `w-40`, `px-3.5` then `px-0` →
 * `px-0`), so callers can override component defaults. Variants (`sm:`,
 * `hover:`) are part of the group. Unknown utilities are simply joined.
 */
export function cn(...classes: Array<string | false | null | undefined>): string {
  const byGroup = new Map<string, string>();
  const order: string[] = [];
  for (const token of classes.filter(Boolean).join(' ').split(/\s+/)) {
    if (!token) continue;
    const key = groupOf(token) ?? `#${token}`;
    if (!byGroup.has(key)) order.push(key);
    else order.push(order.splice(order.indexOf(key), 1)[0]!);
    byGroup.set(key, token);
  }
  return order.map((key) => byGroup.get(key)).join(' ');
}

const TEXT_SIZE = /^text-(xs|sm|base|lg|xl|\dxl|\[[^\]]+\])$/;
const GROUPS =
  /^-?(w|h|size|min-w|max-w|min-h|max-h|px|py|pt|pb|pl|pr|p|mx|my|mt|mb|ml|mr|m|gap|rounded|bg|font|leading|shadow|flex-(?:row|col))(?:-|$)/;

function groupOf(token: string): string | null {
  const index = token.lastIndexOf(':');
  const variant = index >= 0 ? token.slice(0, index + 1) : '';
  const utility = index >= 0 ? token.slice(index + 1) : token;
  if (utility.startsWith('text-'))
    return `${variant}${TEXT_SIZE.test(utility) ? 'text-size' : 'text-color'}`;
  // `font-mono`/`font-sans` are families, `font-medium` etc. are weights.
  if (/^font-(sans|serif|mono)$/.test(utility)) return `${variant}font-family`;
  const match = GROUPS.exec(utility);
  return match ? `${variant}${match[1]}` : null;
}
