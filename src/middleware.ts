import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Routes accessible only to admins (superadmin role)
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
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://supabase.shilmeyster.ru",
    "connect-src 'self' https://supabase.shilmeyster.ru wss://supabase.shilmeyster.ru",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, csp: string): void {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Forward nonce to Next.js so it applies it to its own inline scripts
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  applySecurityHeaders(response, csp);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
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
    // Determine if user has enrolled TOTP and whether current session satisfies it.
    // user.factors comes from getUser() — reliable server-side data.
    const hasVerifiedTotp = (user.factors ?? []).some(
      (f: any) => f.factor_type === "totp" && f.status === "verified"
    );

    let mfaComplete = true; // assume complete if no TOTP enrolled
    if (hasVerifiedTotp) {
      // Decode JWT AMR claim — no extra network call; JWT is signed by GoTrue.
      const { data: { session } } = await supabase.auth.getSession();
      try {
        const payload = JSON.parse(
          Buffer.from(session!.access_token.split(".")[1], "base64").toString()
        );
        mfaComplete = (payload.amr ?? []).some((m: any) => m.method === "totp");
      } catch { mfaComplete = false; }
    }

    if (!mfaComplete && !isLogin) {
      // Prevent AAL1 users with enrolled TOTP from accessing any admin route
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (mfaComplete && isLogin) {
      return NextResponse.redirect(new URL("/active-orders", request.url));
    }
    // !mfaComplete && isLogin → stay on /login so client shows MFA form
  }

  // Enforce superadmin-only route access at the server level
  if (user && ADMIN_ONLY_ROUTES.some(r => path === r || path.startsWith(r + "/"))) {
    const { data: admin } = await supabase
      .from("admins").select("id").eq("id", user.id).maybeSingle();
    if (!admin) return NextResponse.redirect(new URL("/active-orders", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png).*)"],
};
