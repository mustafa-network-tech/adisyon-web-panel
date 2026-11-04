const allowedApplicationPaths = ["/app/", "/mk-admin"];

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

export function getSafeAuthCallbackPath(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/giris";
  }

  return value.startsWith("/sifre-guncelle") ? value : "/giris";
}
