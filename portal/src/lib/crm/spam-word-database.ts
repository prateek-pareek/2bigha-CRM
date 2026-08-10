/** Severity tiers aligned with TrulyInbox-style spam checkers. */
export type SpamWordSeverity = 'critical' | 'high' | 'medium' | 'low';

export type SpamPhraseEntry = {
  phrase: string;
  severity: SpamWordSeverity;
  /** Optional friendlier alternative */
  suggestion?: string;
};

/** Point deductions per match (first occurrence per phrase in combined text). */
export const SPAM_SEVERITY_PENALTY: Record<SpamWordSeverity, number> = {
  critical: 15,
  high: 10,
  medium: 5,
  low: 2,
};

const SEVERITY_RANK: Record<SpamWordSeverity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Comma-separated spam trigger phrases — add new phrases to the relevant list.
 * Longer phrases are matched first at scan time.
 */
export const CRITICAL_SPAM_WORDS_CSV = `act now, 100% free, 100% satisfied, no cost, click below, winner, you have been selected, you are a winner, congratulations, urgent, free access, free gift, free trial, double your, earn money, make money, make money fast, cash bonus, million dollars, billion dollars, be your own boss, work from home, additional income, all-new, get rich quick, fast cash, easy money, instant cash, instant earnings, instant income, instant profit, pure profit, serious cash, big bucks, $$$, pennies a day, cents on the dollar, get paid, earn extra cash, extra cash, extra income, expect to earn, potential earnings, financial freedom, money making, income from home, while you sleep, verify your account, account suspended, confirm your identity, security alert, password reset, update your account, click to verify, immediate action required, final notice, this is not a scam, this is not spam, not junk, jackpot, lottery, casino, spin to win, claim your prize, collect your winnings, viagra, valium, xanax, online pharmacy, no prescription needed, miracle cure, human growth hormone, cialis, levitra, hydrocodone, oxycodone, oxycontin, fentanyl, tramadol, adderall, ritalin, modafinil, phentermine, ambien, kamagra, male enhancement, enlargement pills, herbal viagra, canadian pharmacy, buy meds online, prescription not required, testosterone booster, crypto giveaway, free tokens, double your bitcoin, guaranteed crypto returns, bitcoin opportunity, cryptocurrency investment, forex signals, binary options, guaranteed ROI, trading signals, automated trading, risk-free trading, AI trading bot, pay in bitcoin, your computer has been compromised, virus detected, malware found, your device has been hacked, call microsoft, reactivate your license, software license expired, system infected, package delivery failed, customs clearance required, pay shipping fee, missed delivery notification, parcel awaiting collection, tariff payment required, IRS notification, tax refund pending, unclaimed tax refund, government grant, social security suspension, stimulus payment, tax debt settlement, federal tax alert, IRS lawsuit, tax lien notice, nigerian prince, transfer funds, unclaimed inheritance, dying billionaire, estate settlement, you are entitled to, bequeath fortune, hot singles, adult content, meet tonight, local hookups, escort services, sweepstakes winner, prize claim, lottery winner, you've won, winning, selected, bonus offer, unlimited income, urgent action required, 100% satisfaction, miracle solution, scrape leads, email blast, bulk outreach, unlimited contacts, AI automation guaranteed, instant AI automation, 100% secure`;

export const HIGH_SPAM_WORDS_CSV = `guaranteed, no obligation, limited time, exclusive deal, buy now, risk-free, act immediately, act fast, apply now, call now, do it today, don't delete, don't hesitate, don't wait, don't delay, don't miss out, expires, for instant access, get it now, grab it now, get yours now, hurry up, instant, immediately, last chance, final call, final opportunity, limited offer, limited slots, limited seats, limited availability, limited stock, only a few left, new customers only, now only, now or never, offer expires, once in a lifetime, only today, today only, ending soon, ends tonight, order now, claim now, claim your discount, reserve now, secure your spot, please read, special promotion, supplies are limited, take action, action required, this won't last, time limited, time-sensitive, before it's too late, what are you waiting for, while supplies last, you won't believe, rush, lowest price, best price, bargain, cheap, compare rates, no catch, no gimmick, no credit check, no fees, no hidden costs, no hidden fees, no hidden charges, no interest, no investment, no purchase necessary, no experience needed, pre-approved, consolidate debt, eliminate debt, get out of debt, guaranteed income, double your income, double your wealth, credit card offers, unsecured credit, bumping this, did you see my last email, circling back, looping back, per my last email, hoping to connect, sorry to bother you, apologies for the intrusion, whom should i speak with, if you're not the right person, guaranteed approval, bad credit ok, debt forgiveness, credit repair, fix your credit, remove negative items, lower your interest rate, student loan forgiveness, cut your debt in half, stop creditor calls, buy followers, free followers, follower boost, get verified, buy engagement, trial ending soon, auto-renewal notice, cancel now to avoid charges, subscription charged, envelope stuffing, mystery shopper, online data entry, start earning today, keep this confidential, do not share this information, processing fee to claim, release fee required, antivirus renewal, remote access required, geek squad charged, incredible deal, no risk, immediate response, confidential offer, exclusive invitation, special deal, promotional offer, instant access, free consultation, free demo, best deal, lowest rates, save thousands, massive savings, instant results, boost revenue fast, skyrocket sales, explosive growth, unlimited traffic, generate leads instantly, guaranteed leads, debt relief, credit approval, pre-qualified, investment secret, hidden opportunity, double your business, fastest way, easy approval, increase followers instantly, automation secret, rank #1 on Google, SEO expert guaranteed, guaranteed rankings, sales explosion, hottest opportunity, urgent business proposal, opportunity expires, open immediately, cheap development, guaranteed clients`;

export const MEDIUM_SPAM_WORDS_CSV = `click here, click now, click this link, click to remove, special offer, exclusive offer, exclusive access, don't miss, subscribe, buy, discount, free, bonus, deal, giveaway, clearance, flash sale, coupon, prize, 50% off, lifetime deal, lifetime access, full refund, increase sales, join now, join millions, sign up free, download now, activate now, install now, open this email, incredible, amazing, unbelievable, sensational, phenomenal, mind-blowing, jaw-dropping, world-class, unprecedented, groundbreaking, life-changing, game-changer, cutting-edge, state-of-the-art, extraordinary, ultimate, insanely effective, save big, save up to, no strings attached, opt in, cancel anytime, no questions asked, satisfaction guaranteed, money back, as seen on, best-selling, top-rated, number one, #1, award-winning, huge, massive, revolutionary, breakthrough, profit, eliminate, explode, skyrocket, 100%, weight loss, lose weight, anti-aging, all natural, detox, fat burner, reverse aging, refinance, stock alert, stock pick, penny stocks, avoid bankruptcy, multi-level marketing, mass email, bulk email, email harvest, increase traffic, web traffic, go viral, social proof, influencer opportunity, passive income, residual income, side hustle, turnkey business, home-based business, network marketing, pyramid scheme, autopilot income, done for you, plug and play, just launched, wire transfer, offshore account, tax haven, offshore investment, hot stock tip, accident claim, injury settlement, mesothelioma, triple your, 10x your, unlock your potential, crush your goals, dominate your market, crush the competition, zero risk, no brainer, this is not a commercial email, you opted in, you signed up, if you no longer wish to receive, incredible results, viral growth, fast response requested, best IT company, top-rated agency, fully automated business`;

export const LOW_SPAM_WORDS_CSV = `reminder, opportunity, dear friend, dear sir, dear madam, dear sir/madam, dear customer, dear valued customer, dear beneficiary, valued customer, to whom it may concern, important information, important notice, important announcement, important reminder, for you, just for you, special for you, greetings, good day, good news, hello there, hi there, hope this finds you well, i am writing to, per our conversation, exciting, fantastic, perfect, wonderful, please find attached, don't forget, check out, looking forward, confidential, for your eyes only, private and confidential, we hate spam, sent in compliance, promise you, believe me, quick question, just checking in, touching base, circle back, not sure if you saw, i know you're busy, no worries if not, friendly reminder, are you the right person, attention, reaching out, i'd love to chat, do you have 5 minutes, can i pick your brain, thought this might interest you, i'll keep this brief, i'll be quick, can we set up a call, when can we schedule, wanted to introduce myself, hope you're doing well, as per my previous email, game changing, best in class, synergy, leverage, paradigm shift, disruptive, next generation, best regards, warm regards, dear business owner`;

/** Parse comma-separated phrase list (trim, drop empties). */
export function parseSpamWordsCsv(csv: string): string[] {
  return csv
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
}

function buildDatabaseFromCsv(): SpamPhraseEntry[] {
  const byPhrase = new Map<string, SpamPhraseEntry>();

  const tiers: { csv: string; severity: SpamWordSeverity }[] = [
    { csv: CRITICAL_SPAM_WORDS_CSV, severity: 'critical' },
    { csv: HIGH_SPAM_WORDS_CSV, severity: 'high' },
    { csv: MEDIUM_SPAM_WORDS_CSV, severity: 'medium' },
    { csv: LOW_SPAM_WORDS_CSV, severity: 'low' },
  ];

  for (const { csv, severity } of tiers) {
    for (const phrase of parseSpamWordsCsv(csv)) {
      const key = phrase.toLowerCase();
      const existing = byPhrase.get(key);
      if (
        !existing ||
        SEVERITY_RANK[severity] > SEVERITY_RANK[existing.severity]
      ) {
        byPhrase.set(key, { phrase, severity });
      }
    }
  }

  return [...byPhrase.values()].sort((a, b) => b.phrase.length - a.phrase.length);
}

/** Full spam phrase database (built from tier CSV lists). */
export const SPAM_PHRASE_DATABASE: SpamPhraseEntry[] = buildDatabaseFromCsv();

/** Counts per severity tier (for UI / debugging). */
export const SPAM_PHRASE_COUNTS: Record<SpamWordSeverity, number> = {
  critical: SPAM_PHRASE_DATABASE.filter((e) => e.severity === 'critical').length,
  high: SPAM_PHRASE_DATABASE.filter((e) => e.severity === 'high').length,
  medium: SPAM_PHRASE_DATABASE.filter((e) => e.severity === 'medium').length,
  low: SPAM_PHRASE_DATABASE.filter((e) => e.severity === 'low').length,
};
