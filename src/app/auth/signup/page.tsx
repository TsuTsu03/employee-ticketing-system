import { redirect } from 'next/navigation';

export default function SignupRedirect() {
  // why: disable public registration; admin invites employees
  redirect('/auth/login');
}
