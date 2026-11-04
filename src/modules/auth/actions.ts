"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { resolveDefaultDestination } from "@/lib/auth/destination";
import { getSafeReturnPath } from "@/lib/auth/redirects";
import { createBusinessSchema } from "@/modules/settings/validation";
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
  const destination =
    requestedPath ||
    (await resolveDefaultDestination(data.user.id)) ||
    "/baslangic";

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

const signUpSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  email: z.email().max(254),
  password: z.string().min(8).max(128),
});

export async function signUpAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const values = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!values.success) {
    return errorState("Ad soyad, e-posta ve en az 8 karakterli şifre girin.");
  }

  const origin = getApplicationOrigin(await headers());
  if (!origin) return errorState("İstek adresi doğrulanamadı.");

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: values.data.email,
    password: values.data.password,
    options: {
      data: { full_name: values.data.fullName },
      emailRedirectTo: `${origin}/auth/callback?next=/baslangic`,
    },
  });
  if (error) return errorState("Üyelik oluşturulamadı. Bilgileri kontrol edip tekrar deneyin.");

  // With e-mail confirmation disabled Supabase returns a session right away.
  if (data.session) redirect("/baslangic");

  // Same response whether or not the address was already registered.
  return {
    status: "success",
    message: "Üyeliğiniz oluşturuldu. E-posta kutunuzdaki doğrulama bağlantısına tıklayın.",
  };
}

export async function createBusinessAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const values = createBusinessSchema.safeParse({
    name: formData.get("name"),
    branchName: formData.get("branchName"),
  });
  if (!values.success) return errorState("İşletme ve şube adını girin.");

  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) redirect("/giris?next=%2Fbaslangic");

  const { data, error } = await supabase.rpc("create_my_tenant", {
    target_name: values.data.name,
    target_branch_name: values.data.branchName,
  });
  if (error) {
    return errorState(
      error.message.includes("tenant_already_owned")
        ? "Bu hesapla zaten bir işletme kurdunuz."
        : "İşletme oluşturulamadı. Bilgileri kontrol edip tekrar deneyin.",
    );
  }

  const payload = data as { tenantSlug?: string; branchSlug?: string } | null;
  if (!payload?.tenantSlug || !payload.branchSlug) {
    return errorState("İşletme yanıtı doğrulanamadı.");
  }
  redirect(`/app/${payload.tenantSlug}/${payload.branchSlug}/masalar`);
}
