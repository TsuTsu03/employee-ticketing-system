import Link from 'next/link';
import {
  ArrowRight,
  Clock,
  LifeBuoy,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Ticket,
} from 'lucide-react';

import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

const features = [
  {
    icon: Clock,
    title: 'GPS shift clock',
    desc: 'Employees clock in and out in one tap. Each punch records time and verified location.',
  },
  {
    icon: Ticket,
    title: 'Ticketing built in',
    desc: 'Raise issues against any service, set priority, and track them through to resolution.',
  },
  {
    icon: MessageSquare,
    title: 'Chat-first for the field',
    desc: 'A conversational assistant lets staff start work or report a problem without menus.',
  },
  {
    icon: LifeBuoy,
    title: 'Admin command center',
    desc: 'Assign, comment on, and resolve tickets. See who is on shift and what needs attention.',
  },
  {
    icon: MapPin,
    title: 'Multi-tenant',
    desc: 'Organizations, services, and members are fully isolated with row-level security.',
  },
  {
    icon: ShieldCheck,
    title: 'Role-based access',
    desc: 'Super admins, admins, and employees each get exactly the surface they need.',
  },
];

export default function Landing() {
  return (
    <div className="bg-aurora min-h-screen">
      <header className="container-page flex h-16 items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="bg-primary text-primary-foreground grid size-8 place-items-center rounded-xl font-bold">
            S
          </div>
          <span className="text-lg font-semibold tracking-tight">ShiftDesk</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button asChild>
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </div>
      </header>

      <main className="container-page">
        {/* Hero */}
        <section className="mx-auto max-w-3xl py-20 text-center sm:py-28">
          <div className="bg-card text-muted-foreground mx-auto mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
            <span className="bg-primary size-1.5 rounded-full" />
            Shift tracking + helpdesk in one
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-balance sm:text-6xl">
            Run your frontline team on{' '}
            <span className="text-brand-gradient">ShiftDesk</span>
          </h1>
          <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg text-pretty">
            Clock shifts with GPS, raise support tickets, and resolve them — a single workspace for
            employees, admins, and the people who run the show.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="gap-2">
              <Link href="/auth/login">
                Get started <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#features">See features</a>
            </Button>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="bg-card rounded-2xl border p-6 transition-shadow hover:shadow-md"
            >
              <div className="bg-primary/10 text-primary grid size-10 place-items-center rounded-xl">
                <f.icon className="size-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="text-muted-foreground mt-1.5 text-sm">{f.desc}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t">
        <div className="container-page text-muted-foreground flex h-16 items-center justify-between text-sm">
          <span>© {new Date().getFullYear()} ShiftDesk</span>
          <Link href="/auth/login" className="hover:text-foreground">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
