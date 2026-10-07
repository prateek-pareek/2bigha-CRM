import { redirect } from 'next/navigation';

export default function CRMPage() {
  // Root dispatcher picks the first screen the user's role can open.
  redirect('/');
}
