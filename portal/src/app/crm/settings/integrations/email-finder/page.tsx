"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Redirect legacy URL to email intelligence settings. */
export default function EmailFinderRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/crm/settings/integrations/email-intelligence');
  }, [router]);
  return null;
}
