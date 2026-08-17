export { default } from "next-auth/middleware";

// Route-level gate. Fine-grained department authorization still happens
// server-side in every API route via requireDepartmentAccess() - this
// middleware only guarantees the user is authenticated before reaching
// any admin page, and next-auth will redirect to /login otherwise.
export const config = {
  matcher: ["/dashboard/:path*", "/departments/:path*", "/students/:path*", "/sessions/:path*"],
};
