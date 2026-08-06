'use client';

import { Sparkles, ArrowUpRight, Zap, Shield, BarChart3, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { HS_PANEL } from './panel-styles';

const SERVICES = [
  {
    title: 'SEO Optimization',
    description: 'Boost your visibility and rank higher on search engines.',
    icon: <BarChart3 className="h-5 w-5" />,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
  },
  {
    title: 'Priority Support',
    description: '24/7 dedicated support line for all your critical needs.',
    icon: <Zap className="h-5 w-5" />,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
  },
  {
    title: 'Cloud Maintenance',
    description: 'Monthly security audits and performance tuning.',
    icon: <Shield className="h-5 w-5" />,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
  },
  {
    title: 'Content Strategy',
    description: 'Data-driven content planning to engage your audience.',
    icon: <Globe className="h-5 w-5" />,
    color: 'text-[var(--hs-link)]',
    bgColor: 'bg-[#e6f4f7]',
  },
];

export function PortalServicesSection() {
  const handleServiceClick = () => {
    // Redirect to company service page
    window.open('https://mathionix.tech/services', '_blank');
  };

  return (
    <section id="portal-services" className={cn(HS_PANEL, "scroll-mt-28 p-5 md:p-6 md:scroll-mt-24 bg-gradient-to-br from-white to-[var(--background)]/30")}>
      <div className="flex items-center justify-between gap-3 border-b border-[var(--surface-dim)] pb-3 mb-5">
        <h2 className="text-[16px] font-semibold tracking-tight text-[var(--text-main)] flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[var(--hs-link)]" />
          Additional Services
        </h2>
        <span className="text-xs font-bold text-[var(--hs-link)] bg-[#fff1ee] px-2 py-1 rounded-full uppercase tracking-wider">Growth Tools</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {SERVICES.map((service, idx) => (
          <button
            key={idx}
            onClick={handleServiceClick}
            className="group flex flex-col p-4 rounded-xl border border-[var(--surface-dim)] bg-white text-left hover:border-[var(--hs-link)]/40 hover:shadow-lg transition-all duration-300"
          >
            <div className={cn("p-2 rounded-lg w-fit mb-3 transition-transform group-hover:scale-110 duration-300", service.bgColor, service.color)}>
              {service.icon}
            </div>
            <div className="flex items-start justify-between gap-2 mb-1">
              <h3 className="text-sm font-bold text-[var(--text-main)] leading-tight group-hover:text-[var(--hs-link)] transition-colors">{service.title}</h3>
              <ArrowUpRight className="h-3.5 w-3.5 text-[var(--border-color)] group-hover:text-[var(--hs-link)] transition-all transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </div>
            <p className="text-xs text-[var(--text-muted)] leading-snug line-clamp-2">{service.description}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-lg bg-[#fafbfc] border border-[var(--surface-dim)] flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-[var(--text-main)]">Need something custom?</p>
          <p className="text-xs text-[var(--text-muted)]">Talk to your account manager about tailored solutions.</p>
        </div>
        <button 
          onClick={handleServiceClick}
          className="text-xs font-bold text-[var(--hs-link)] hover:underline flex items-center gap-1"
        >
          Explore All Services <ArrowUpRight className="h-3 w-3" />
        </button>
      </div>
    </section>
  );
}
