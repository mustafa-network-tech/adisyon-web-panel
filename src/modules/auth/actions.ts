"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSafeReturnPath } from "@/lib/auth/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { AuthActionState } from "@/modules/auth/state";

const signInSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

const passwordSchema = z
  .object({
    password: z.string().min(8).max(128),
    passwordConfirm: z.string().min(8).max(128),
  })
  .refine((values) => values.password === values.passwordConfirm, {
    message: "Şifreler birbiriyle eşleşmiyor.",
  });

function errorState(message: string): AuthActionState {
  return { status: "error", message };
}

async function getDefaultDestination(userId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: platformAdmin } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (platformAdmin) return "/mk-admin";

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!membership) return null;

  const [{ data: tenant }, { data: branch }] = await Promise.all([
    supabase
      .from("tenants")
      .select("slug")
      .eq("id", membership.tenant_id)
      .eq("is_active", true)
      .maybeSingle(),
    supabase
      .from("branches")
      .select("slug")
      .eq("tenant_id", membership.tenant_id)
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  return tenant && branch ? `/app/${tenant.slug}/${branch.slug}/masalar` : null;
}

export async function signInAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const values = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!values.success) {
    return errorState("E-posta adresini ve şifrenizi kontrol edin.");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword(values.data);

  if (error || !data.user) {
    return errorState("E-posta veya şifre doğrulanamadı.");
  }

  const requestedPath = getSafeReturnPath(formData.get("next"));
  const destination = requestedPath || (await getDefaultDestination(data.user.id));

  if (!destination) {
    await supabase.auth.signOut();
    return errorState("Hesabınıza aktif bir işletme erişimi tanımlanmamış.");
  }

  redirect(destination);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/giris");
}

function getApplicationOrigin(headerStore: Headers) {
  const origin = headerStore.get("origin");
  if (origin) return origin;

  const host = headerStore.get("x-forwarded-host") || headerStore.get("host");
  const protocol = headerStore.get("x-forwarded-proto") || "https";
  return host ? `${protocol}://${host}` : null;
}

export async function requestPasswordResetAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = z.email().max(254).safeParse(formData.get("email"));

  if (!email.success) {
    return errorState("Geçerli bir e-posta adresi girin.");
  }

  const origin = getApplicationOrigin(await headers());
  if (!origin) return errorState("İstek adresi doğrulanamadı.");

  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${origin}/auth/callback?next=/sifre-guncelle`,
  });

  // Use the same response for existing and unrelated accounts.
  return {
    status: "success",
    message:
      "Bu adres kayıtlıysa şifre yenileme bağlantısı e-posta kutunuza gönderildi.",
  };
}

export async function updatePasswordAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const values = passwordSchema.safeParse({
    password: formData.get("password"),
    passwordConfirm: formData.get("passwordConfirm"),
  });

  if (!values.success) {
    return errorState(
      values.error.issues[0]?.message || "Şifre bilgilerini kontrol edin.",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) {
    return errorState("Şifre yenileme oturumu geçersiz veya süresi dolmuş.");
  }

  const { error } = await supabase.auth.updateUser({
    password: values.data.password,
  });

  if (error) return errorState("Şifre güncellenemedi. Yeni bağlantı isteyin.");

  await supabase.auth.signOut();
  redirect("/giris?success=password-updated");
}
