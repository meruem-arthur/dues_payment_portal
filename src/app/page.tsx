import Link from "next/link";
import { GraduationCap } from "lucide-react";

export default function Home() {
  return (
    <main className="portal-shell flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="portal-content flex flex-col items-center gap-6">
        <div className="portal-crest">
          <GraduationCap size={28} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-portal-text">Dues Payment Portal</h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-portal-muted">
            Ask your department for its payment link, or sign in below if you are an administrator.
          </p>
        </div>
        <Link href="/login" className="portal-btn-primary">
          Admin Sign In
        </Link>
      </div>
    </main>
  );
}
