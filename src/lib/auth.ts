import { type AuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { checkRateLimit, getClientIpFromHeaderRecord } from "@/lib/rate-limit";

// Login is throttled per-IP: 5 attempts / 10 minutes. This is the only
// unauthenticated, unthrottled-until-now entry point into admin accounts -
// nothing previously stopped scripted password guessing against
// e.g. superadmin@umat.test. A generic "Too many attempts" message is
// thrown (not "wrong password" vs "rate limited" - that distinction alone
// would leak whether an email exists) once the limit is hit.
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;
const LOGIN_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export const authOptions: AuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        const ip = getClientIpFromHeaderRecord(req?.headers as Record<string, string | string[] | undefined> | undefined);
        const rateLimit = checkRateLimit(`login:${ip}`, LOGIN_RATE_LIMIT_MAX_ATTEMPTS, LOGIN_RATE_LIMIT_WINDOW_MS);
        if (!rateLimit.allowed) {
          throw new Error("Too many login attempts. Please wait a few minutes and try again.");
        }

        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase().trim() },
        });

        if (!user || user.status !== "ACTIVE") return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          departmentId: user.departmentId,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role;
        token.departmentId = (user as any).departmentId;
        token.id = (user as any).id;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).departmentId = token.departmentId;
      }
      return session;
    },
  },
  secret: process.env.AUTH_SECRET,
};
