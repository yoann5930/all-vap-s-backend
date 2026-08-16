/**
 * Permissions-Policy micro/caméra — site public AVA vs inventaire.
 * AVA (HolographicAssistant) est montée sur le chrome boutique, donc
 * microphone=(self) est requis sur `/`, `/e-liquides`, etc.
 * L’inventaire reste camera=(self) / microphone=().
 */

export function isInventoryCameraPath(pathname: string): boolean {
  return (
    pathname === "/inventaire" ||
    pathname.startsWith("/inventaire/") ||
    pathname === "/admin/inventaire" ||
    pathname.startsWith("/admin/inventaire/") ||
    pathname === "/admin/inventaires" ||
    pathname.startsWith("/admin/inventaires/")
  );
}

/** true = getUserMedia micro autorisé par la policy (prompt navigateur possible). */
export function publicSiteMicrophoneAllowed(pathname: string): boolean {
  return !isInventoryCameraPath(pathname);
}

export function permissionsPolicyForPath(pathname: string): string {
  const camera = isInventoryCameraPath(pathname)
    ? "camera=(self)"
    : "camera=()";
  const microphone = publicSiteMicrophoneAllowed(pathname)
    ? "microphone=(self)"
    : "microphone=()";
  return `${camera}, ${microphone}, geolocation=()`;
}

export function microphoneEnabledInPolicy(policy: string): boolean {
  return /microphone=\(self\)/i.test(policy);
}
