import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const ADMIN_ONLY_ROUTES = [
  "/menu-editor",
  "/menu/schedule",
  "/carousel",
  "/cities",
  "/promos",
  "/users",
];

function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // https://api-maps.yandex.ru and https://yastatic.net are fallbacks for browsers
    // that don't propagate strict-dynamic trust to dynamically injected scripts
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://api-maps.yandex.ru https://yastatic.net`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://supabase.shilmeyster.ru https://*.maps.yandex.net https://yastatic.net https://yandex.ru https://yandex.st https://mc.yandex.ru https://log.api.maps.yandex.ru",
    "connect-src 'self' https://supabase.shilmeyster.ru wss://supabase.shilmeyster.ru https://api-maps.yandex.ru https://yastatic.net https://*.maps.yandex.net https://yandex.ru https://mc.yandex.ru https://log.api.maps.yandex.ru",
    "worker-src blob: 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, csp: string): void {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

async function isMfaComplete(supabase: any, user: any): Promise<boolean> {
  const hasVerifiedTotp = (user.factors ?? []).some(
    (f: any) => f.factor_type === "totp" && f.status === "verified"
  );
  if (!hasVerifiedTotp) return true;
  const { data: { session } } = await supabase.auth.getSession();
  try {
    const payload = JSON.parse(
      Buffer.from(session!.access_token.split(".")[1], "base64").toString()
    );
    return (payload.amr ?? []).some((m: any) => m.method === "totp");
  } catch {
    return false;
  }
}

function isAdminOnlyPath(path: string): boolean {
  return ADMIN_ONLY_ROUTES.some((r) => path === r || path.startsWith(r + "/"));
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, csp);

  const supabase = createServerClient( // NOSONAR — using getAll/setAll (non-deprecated overload); SonarQube incorrectly flags all calls when any overload is @deprecated
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request: { headers: requestHeaders } });
          applySecurityHeaders(response, csp);
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isLogin = path.startsWith("/login");

  if (!user && !isLogin) return NextResponse.redirect(new URL("/login", request.url));

  if (user) {
    const mfaComplete = await isMfaComplete(supabase, user);
    if (!mfaComplete && !isLogin) return NextResponse.redirect(new URL("/login", request.url));
    if (mfaComplete && isLogin) return NextResponse.redirect(new URL("/active-orders", request.url));
  }

  if (user && isAdminOnlyPath(path)) {
    const { data: admin } = await supabase
      .from("admins").select("id").eq("id", user.id).maybeSingle();
    if (!admin) return NextResponse.redirect(new URL("/active-orders", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};
