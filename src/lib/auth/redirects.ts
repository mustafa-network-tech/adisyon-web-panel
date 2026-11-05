const allowedApplicationPaths = ["/app/", "/mk-admin", "/baslangic"];

export function getSafeReturnPath(
  value: FormDataEntryValue | string | null | undefined,
) {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;

  return allowedApplicationPaths.some(
    (path) => value === path.replace(/\/$/, "") || value.startsWith(path),
  )
    ? value
    : null;
}

/**
 * /baslangic, optionally with the package and support hints of the call to
 * action. Only these exact query shapes pass; anything else falls back.
 */
const onboardingEntryPath =
  /^\/baslangic(\?(paket=(baslangic|profesyonel|cok-subeli)(&kurulum=destek)?|kurulum=destek))?$/;

export function getSafeAuthCallbackPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/giris";
  }

  return value.startsWith("/sifre-guncelle") || onboardingEntryPath.test(value)
    ? value
    : "/giris";
}
