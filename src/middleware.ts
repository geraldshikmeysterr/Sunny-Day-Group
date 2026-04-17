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
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, csp: string): void {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

export async function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Pass nonce to server components via request header
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
          response = NextResponse.next({ request });
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
  if (user && isLogin) return NextResponse.redirect(new URL("/active-orders", request.url));

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
