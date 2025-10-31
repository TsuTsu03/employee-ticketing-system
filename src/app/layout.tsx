import './globals.css';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'SaaS Tickets',
  description: 'Modern ticketing & shift tracking',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full">
        <header className="border-b border-[rgb(var(--border))] bg-[rgb(var(--bg))]/70 backdrop-blur">
          <div className="container-page flex h-14 items-center justify-between">
            <Link href="/portal" className="flex items-center gap-2 text-base font-semibold">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[rgb(var(--accent))] text-white">
                S
              </span>
              SaaS Tickets
            </Link>
            <nav className="flex items-center gap-1">
              <Link className="btn btn--ghost" href="/app/dashboard">
                Employee
              </Link>
              <Link className="btn btn--ghost" href="/admin/dashboard">
                Admin
              </Link>
              <Link className="btn btn--ghost" href="/superadmin/dashboard">
                SuperAdmin
              </Link>
              <Link className="btn btn--ghost" href="/auth/logout">
                Logout
              </Link>
            </nav>
          </div>
        </header>

        <main className="container-page py-6">{children}</main>

        <footer className="container-page py-6 text-center text-xs text-[rgb(var(--muted))]">
          © {new Date().getFullYear()} SaaS Tickets
        </footer>
      </body>
    </html>
  );
}
