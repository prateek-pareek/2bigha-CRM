/**
 * Common E.164 country calling codes for CRM phone fields (dropdowns).
 * Sorted by region then name for easier scanning.
 */
export const CRM_PHONE_COUNTRY_OPTIONS: { value: string; label: string }[] = [
  { value: '+93', label: '🇦🇫 Afghanistan +93' },
  { value: '+91', label: '🇮🇳 India +91' },
  { value: '+880', label: '🇧🇩 Bangladesh +880' },
  { value: '+94', label: '🇱🇰 Sri Lanka +94' },
  { value: '+977', label: '🇳🇵 Nepal +977' },
  { value: '+92', label: '🇵🇰 Pakistan +92' },
  { value: '+971', label: '🇦🇪 UAE +971' },
  { value: '+966', label: '🇸🇦 Saudi Arabia +966' },
  { value: '+965', label: '🇰🇼 Kuwait +965' },
  { value: '+974', label: '🇶🇦 Qatar +974' },
  { value: '+973', label: '🇧🇭 Bahrain +973' },
  { value: '+968', label: '🇴🇲 Oman +968' },
  { value: '+962', label: '🇯🇴 Jordan +962' },
  { value: '+961', label: '🇱🇧 Lebanon +961' },
  { value: '+972', label: '🇮🇱 Israel +972' },
  { value: '+98', label: '🇮🇷 Iran +98' },
  { value: '+964', label: '🇮🇶 Iraq +964' },
  { value: '+90', label: '🇹🇷 Turkey +90' },
  { value: '+7', label: '🇷🇺 Russia/KZ +7' },
  { value: '+380', label: '🇺🇦 Ukraine +380' },
  { value: '+48', label: '🇵🇱 Poland +48' },
  { value: '+420', label: '🇨🇿 Czechia +420' },
  { value: '+36', label: '🇭🇺 Hungary +36' },
  { value: '+40', label: '🇷🇴 Romania +40' },
  { value: '+359', label: '🇧🇬 Bulgaria +359' },
  { value: '+385', label: '🇭🇷 Croatia +385' },
  { value: '+386', label: '🇸🇮 Slovenia +386' },
  { value: '+421', label: '🇸🇰 Slovakia +421' },
  { value: '+43', label: '🇦🇹 Austria +43' },
  { value: '+49', label: '🇩🇪 Germany +49' },
  { value: '+41', label: '🇨🇭 Switzerland +41' },
  { value: '+31', label: '🇳🇱 Netherlands +31' },
  { value: '+32', label: '🇧🇪 Belgium +32' },
  { value: '+33', label: '🇫🇷 France +33' },
  { value: '+34', label: '🇪🇸 Spain +34' },
  { value: '+351', label: '🇵🇹 Portugal +351' },
  { value: '+39', label: '🇮🇹 Italy +39' },
  { value: '+30', label: '🇬🇷 Greece +30' },
  { value: '+353', label: '🇮🇪 Ireland +353' },
  { value: '+44', label: '🇬🇧 United Kingdom +44' },
  { value: '+46', label: '🇸🇪 Sweden +46' },
  { value: '+47', label: '🇳🇴 Norway +47' },
  { value: '+45', label: '🇩🇰 Denmark +45' },
  { value: '+358', label: '🇫🇮 Finland +358' },
  { value: '+1', label: '🇺🇸 United States +1' },
  { value: '+52', label: '🇲🇽 Mexico +52' },
  { value: '+55', label: '🇧🇷 Brazil +55' },
  { value: '+54', label: '🇦🇷 Argentina +54' },
  { value: '+56', label: '🇨🇱 Chile +56' },
  { value: '+57', label: '🇨🇴 Colombia +57' },
  { value: '+51', label: '🇵🇪 Peru +51' },
  { value: '+58', label: '🇻🇪 Venezuela +58' },
  { value: '+27', label: '🇿🇦 South Africa +27' },
  { value: '+234', label: '🇳🇬 Nigeria +234' },
  { value: '+254', label: '🇰🇪 Kenya +254' },
  { value: '+20', label: '🇪🇬 Egypt +20' },
  { value: '+212', label: '🇲🇦 Morocco +212' },
  { value: '+61', label: '🇦🇺 Australia +61' },
  { value: '+64', label: '🇳🇿 New Zealand +64' },
  { value: '+65', label: '🇸🇬 Singapore +65' },
  { value: '+60', label: '🇲🇾 Malaysia +60' },
  { value: '+62', label: '🇮🇩 Indonesia +62' },
  { value: '+63', label: '🇵🇭 Philippines +63' },
  { value: '+66', label: '🇹🇭 Thailand +66' },
  { value: '+84', label: '🇻🇳 Vietnam +84' },
  { value: '+86', label: '🇨🇳 China +86' },
  { value: '+852', label: '🇭🇰 Hong Kong +852' },
  { value: '+853', label: '🇲🇴 Macau +853' },
  { value: '+886', label: '🇹🇼 Taiwan +886' },
  { value: '+81', label: '🇯🇵 Japan +81' },
  { value: '+82', label: '🇰🇷 South Korea +82' },
];

const SORTED_BY_CODE_LEN = [...CRM_PHONE_COUNTRY_OPTIONS].sort(
  (a, b) => b.value.length - a.value.length
);

/** Pick country code from a stored value like "+91 98765 43210". */
export function getDefaultCountryCodeFromPhone(full: string | undefined): string {
  if (!full || typeof full !== 'string') return '+91';
  const trimmed = full.trim();
  for (const o of SORTED_BY_CODE_LEN) {
    if (trimmed.startsWith(o.value + ' ') || trimmed === o.value) return o.value;
  }
  const first = trimmed.split(/\s+/)[0];
  if (first?.startsWith('+') && CRM_PHONE_COUNTRY_OPTIONS.some((o) => o.value === first)) {
    return first;
  }
  return '+91';
}

/** National part after the country code (digits/spaces). */
export function getNationalDigitsFromPhone(full: string | undefined): string {
  if (!full?.trim()) return '';
  const code = getDefaultCountryCodeFromPhone(full);
  return full.trim().slice(code.length).trim();
}
