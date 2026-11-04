import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeAuthCallbackPath } from "@/lib/auth/redirects";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const otpTypes: EmailOtpType[] = [
  "email",
  "recovery",
  "invite",
  "email_change",
  "signup",
  "magiclink",
];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return Boolean(value && otpTypes.includes(value as EmailOtpType));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const nextPath = getSafeAuthCallbackPath(
    request.nextUrl.searchParams.get("next"),
  );
  const supabase = await createSupabaseServerClient();

  let succeeded = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    succeeded = !error;
  } else if (tokenHash && isEmailOtpType(type)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    succeeded = !error;
  }

  const destination = succeeded
    ? new URL(nextPath, request.url)
    : new URL("/giris?error=auth-link", request.url);

  return NextResponse.redirect(destination);
}
