"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function CRMWhatsAppRedirectPage() {
 const router = useRouter();
 useEffect(() => {
 router.replace('/crm/inbox?source=whatsapp');
 }, [router]);
 return null;
}
