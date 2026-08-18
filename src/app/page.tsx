import Link from "next/link";

export default function Home() {
  return (
    <main className="portal-shell flex min-h-screen flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="portal-content flex flex-col items-center gap-6">
        <div className="portal-crest">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/school-crest.png" alt="University of Mines and Technology crest" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-portal-text">Dues Payment Portal</h1>
          <p className="portal-text-on-photo mx-auto mt-2 max-w-md text-base font-medium">
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
