import React, { useState } from 'react';
import { Check, CreditCard, Gift, Loader2, Mail, ShieldCheck, X } from 'lucide-react';

import type { Language } from '../types';

interface MarketingTrialOfferProps {
  language: Language;
  role: 'athlete' | 'coach';
  monthlyPriceLabel: string;
  onAccept: () => Promise<void>;
  onDismiss: () => Promise<void>;
}

const COPY = {
  es: {
    eyebrow: 'OFERTA DE BIENVENIDA',
    title: 'Tu primer mes de CoachAI Pro, gratis',
    description: 'Activa las funciones Pro y recibe por email novedades, consejos de entrenamiento y ofertas de CoachAI.',
    noChargeToday: 'HOY NO SE TE COBRA NADA',
    today: 'Hoy',
    after: 'Desde el segundo mes',
    free: '0 €',
    month: 'mes',
    athletePlan: 'Atleta Pro',
    coachPlan: 'Entrenador Pro',
    card: 'Stripe te pedirá una tarjeta para activar el primer mes gratis.',
    renewal: 'La suscripción se renovará y cobrará automáticamente desde el segundo mes, salvo que canceles antes. No se pedirá una segunda confirmación.',
    stripePrice: 'Stripe mostrará {price}/mes y aplicará automáticamente “Primer mes gratis” (−100 %). El total de hoy será 0 €.',
    consent: 'Quiero recibir novedades, consejos y ofertas especiales de CoachAI por email y activar mi primer mes gratis con renovación automática.',
    continue: 'Activar mi primer mes gratis por 0 €',
    later: 'Ahora no',
  },
  ing: {
    eyebrow: 'WELCOME OFFER',
    title: 'Your first month of CoachAI Pro, free',
    description: 'Unlock Pro features and receive CoachAI news, training tips and offers by email.',
    noChargeToday: 'YOU WILL NOT BE CHARGED TODAY',
    today: 'Today',
    after: 'From the second month',
    free: '€0',
    month: 'month',
    athletePlan: 'Athlete Pro',
    coachPlan: 'Coach Pro',
    card: 'Stripe will ask for a card to activate your free first month.',
    renewal: 'The subscription will renew and be charged automatically from the second month unless you cancel first. No second confirmation will be requested.',
    stripePrice: 'Stripe will display {price}/month and automatically apply “First month free” (−100%). Today’s total will be €0.',
    consent: 'I want to receive CoachAI news, tips and special offers by email and activate my free first month with automatic renewal.',
    continue: 'Activate my first month free for €0',
    later: 'Not now',
  },
  eus: {
    eyebrow: 'ONGI ETORRI ESKAINTZA',
    title: 'CoachAI Pro-ren lehen hilabetea, doan',
    description: 'Aktibatu Pro funtzioak eta jaso CoachAI-ren berriak, entrenamendu aholkuak eta eskaintzak posta elektronikoz.',
    noChargeToday: 'GAUR EZ ZAIZU EZER KOBRATUKO',
    today: 'Gaur',
    after: 'Bigarren hilabetetik aurrera',
    free: '0 €',
    month: 'hilean',
    athletePlan: 'Atleta Pro',
    coachPlan: 'Entrenatzaile Pro',
    card: 'Stripe-k txartel bat eskatuko dizu lehen hilabete doakoa aktibatzeko.',
    renewal: 'Harpidetza bigarren hilabetetik aurrera automatikoki berritu eta kobratuko da, lehenago bertan behera uzten ez baduzu. Ez da bigarren baieztapenik eskatuko.',
    stripePrice: 'Stripe-n {price}/hilean agertuko da eta “Lehen hilabetea doan” (−% 100) automatikoki aplikatuko da. Gaurko guztizkoa 0 € izango da.',
    consent: 'CoachAI-ren berriak, aholkuak eta eskaintza bereziak posta elektronikoz jaso eta nire lehen hilabete doakoa berritze automatikoarekin aktibatu nahi dut.',
    continue: 'Aktibatu nire lehen hilabetea doan, 0 €-ren truke',
    later: 'Orain ez',
  },
} as const;

export const MarketingTrialOffer: React.FC<MarketingTrialOfferProps> = ({
  language,
  role,
  monthlyPriceLabel,
  onAccept,
  onDismiss,
}) => {
  const [accepted, setAccepted] = useState(false);
  const [action, setAction] = useState<'accept' | 'dismiss' | null>(null);
  const t = COPY[language] || COPY.es;
  const planName = role === 'coach' ? t.coachPlan : t.athletePlan;

  const handleAccept = async () => {
    if (!accepted || action) return;
    setAction('accept');
    try {
      await onAccept();
    } finally {
      setAction(null);
    }
  };

  const handleDismiss = async () => {
    if (action) return;
    setAction('dismiss');
    try {
      await onDismiss();
    } finally {
      setAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="marketing-trial-title"
        className="relative w-full max-w-lg overflow-hidden rounded-3xl border border-orange-500/25 bg-white shadow-2xl dark:bg-neutral-950"
      >
        <button
          type="button"
          onClick={() => void handleDismiss()}
          disabled={Boolean(action)}
          aria-label={t.later}
          className="absolute right-4 top-4 z-10 rounded-full border border-neutral-200 bg-white/90 p-2 text-neutral-500 transition hover:text-neutral-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-900/90 dark:text-neutral-400 dark:hover:text-white"
        >
          {action === 'dismiss' ? <Loader2 size={18} className="animate-spin" /> : <X size={18} />}
        </button>

        <div className="bg-gradient-to-br from-orange-600 to-orange-500 px-6 pb-7 pt-8 text-white sm:px-8">
          <div className="mb-4 inline-flex rounded-2xl bg-white/15 p-3 ring-1 ring-white/20">
            <Gift size={28} />
          </div>
          <p className="text-xs font-black tracking-[0.18em] text-orange-100">{t.eyebrow}</p>
          <h2 id="marketing-trial-title" className="mt-2 pr-8 text-2xl font-black leading-tight sm:text-3xl">
            {t.title}
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-orange-50">{t.description}</p>
          <div className="mt-4 inline-flex rounded-full bg-white px-4 py-2 text-xs font-black tracking-wide text-orange-600 shadow-sm">
            {t.noChargeToday}
          </div>
        </div>

        <div className="space-y-5 p-6 sm:p-8">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-900/70 dark:bg-emerald-950/30">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{t.today}</p>
              <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-300">{t.free}</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-xs font-semibold text-neutral-500">{t.after}</p>
              <p className="mt-1 text-lg font-black text-neutral-900 dark:text-white">{monthlyPriceLabel}<span className="text-xs font-medium text-neutral-500">/{t.month}</span></p>
              <p className="text-xs text-neutral-500">{planName}</p>
            </div>
          </div>

          <div className="space-y-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">
            <p className="flex items-start gap-2"><CreditCard size={15} className="mt-0.5 flex-shrink-0 text-orange-500" />{t.card}</p>
            <p className="flex items-start gap-2"><ShieldCheck size={15} className="mt-0.5 flex-shrink-0 text-orange-500" />{t.renewal}</p>
          </div>

          <p className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-xs font-semibold leading-relaxed text-orange-900 dark:border-orange-900/60 dark:bg-orange-950/30 dark:text-orange-200">
            {t.stripePrice.replace('{price}', monthlyPriceLabel)}
          </p>

          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-neutral-200 p-4 dark:border-neutral-800">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="sr-only"
            />
            <span className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border ${accepted ? 'border-orange-600 bg-orange-600' : 'border-neutral-300 dark:border-neutral-600'}`}>
              {accepted && <Check size={14} className="text-white" />}
            </span>
            <span className="flex-1 text-xs font-medium leading-relaxed text-neutral-700 dark:text-neutral-200">
              <Mail size={14} className="mr-1.5 inline text-orange-500" />
              {t.consent}
            </span>
          </label>

          <button
            type="button"
            onClick={() => void handleAccept()}
            disabled={!accepted || Boolean(action)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action === 'accept' && <Loader2 size={17} className="animate-spin" />}
            {t.continue}
          </button>
          <button
            type="button"
            onClick={() => void handleDismiss()}
            disabled={Boolean(action)}
            className="w-full text-sm font-semibold text-neutral-500 transition hover:text-neutral-900 disabled:opacity-50 dark:hover:text-white"
          >
            {t.later}
          </button>
        </div>
      </div>
    </div>
  );
};
