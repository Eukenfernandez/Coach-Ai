
import React, { useState } from 'react';
import { Check, Zap, ShieldCheck, Loader2, Star, Circle, XCircle, Crown, AlertTriangle, Settings } from 'lucide-react';
import { createCheckoutSession, createPortalSession, STRIPE_PRICES, getUserLimits } from '../svcs/subscriptionService';
import { StorageService } from '../svcs/storageService';
import { User, Language } from '../types';

interface PricingSectionProps {
  currentUser: User;
  language: Language;
}

interface PlanItem {
  id: string;
  name: string;
  price: string;
  period: string;
  icon: React.ReactNode;
  features: string[];
  buttonText: string;
  actionType: 'checkout' | 'portal' | 'none';
  disabled: boolean;
  highlight: boolean;
  tierId: string;
  isBlack?: boolean;
  badge?: string;
}

const TEXTS = {
  es: {
    title: 'Domina tu Entrenamiento',
    subtitle: 'Planes diseñados específicamente para tu rol y objetivos.',
    monthly: '/mes',
    free: 'Gratuito',
    athletePro: 'Atleta Pro',
    athletePremium: 'Atleta Premium',
    coachPro: 'Entrenador Pro',
    coachPremium: 'Entrenador Premium',
    upgrade: 'Subir Nivel',
    select: 'Elegir Plan',
    current: 'Tu Plan Actual',
    manage: 'Gestionar Suscripción',
    downgrade: 'Bajar a Gratis',
    downgradeModalTitle: '¿Bajar al Plan Gratuito?',
    downgradeModalDesc: 'Serás redirigido al portal de Stripe para cancelar tu suscripción actual.',
    downgradeModalList: [
      'Mantendrás tus privilegios hasta final de mes.',
      'No se te cobrará el próximo ciclo.',
      'Debes confirmar la cancelación en la página de Stripe.'
    ],
    downgradeConfirmBtn: 'Ir a Cancelar Suscripción',
    cancelBtn: 'Volver',
    mostPopular: 'Más Popular',
    bestValue: 'Elite'
  },
  ing: {
    title: 'Master Your Training',
    subtitle: 'Plans designed specifically for your role and goals.',
    monthly: '/mo',
    free: 'Free',
    athletePro: 'Athlete Pro',
    athletePremium: 'Athlete Premium',
    coachPro: 'Coach Pro',
    coachPremium: 'Coach Premium',
    upgrade: 'Upgrade',
    select: 'Select Plan',
    current: 'Current Plan',
    manage: 'Manage Subscription',
    downgrade: 'Downgrade to Free',
    downgradeModalTitle: 'Downgrade to Free?',
    downgradeModalDesc: 'You will be redirected to the Stripe portal to cancel your current subscription.',
    downgradeModalList: [
      'You keep benefits until the end of the month.',
      'You will not be charged for the next cycle.',
      'You must confirm the cancellation on the Stripe page.'
    ],
    downgradeConfirmBtn: 'Go to Cancel Subscription',
    cancelBtn: 'Go Back',
    mostPopular: 'Most Popular',
    bestValue: 'Elite'
  },
  eus: {
    title: 'Entrenamendua Menderatu',
    subtitle: 'Zure rol eta helburuetarako diseinatutako planak.',
    monthly: '/hil',
    free: 'Doakoa',
    athletePro: 'Pro Atleta',
    athletePremium: 'Premium Atleta',
    coachPro: 'Pro Entrenatzailea',
    coachPremium: 'Premium Entrenatzailea',
    upgrade: 'Maila Igo',
    select: 'Hautatu Plana',
    current: 'Zure Plana',
    manage: 'Harpidetza Kudeatu',
    downgrade: 'Doakora Jaitsi',
    downgradeModalTitle: 'Doako Planera Jaitsi?',
    downgradeModalDesc: 'Stripe atarira bideratuko zaitugu harpidetza ezeztatzeko.',
    downgradeModalList: [
      'Abantailak hilabete amaiera arte mantenduko dituzu.',
      'Ez zaizu hurrengo zikloan kobratuko.',
      'Stripe orrian ezeztapena berretsi behar duzu.'
    ],
    downgradeConfirmBtn: 'Joan Harpidetza Ezeztatzera',
    cancelBtn: 'Itzuli',
    mostPopular: 'Ezagunena',
    bestValue: 'Elite'
  }
};

export const PricingSection: React.FC<PricingSectionProps> = ({ currentUser, language }) => {
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const [showDowngradeModal, setShowDowngradeModal] = useState(false);
  const [downgradeWarning, setDowngradeWarning] = useState<string | null>(null);
  const t = TEXTS[language as keyof typeof TEXTS] || TEXTS.es;

  const currentTier = currentUser.profile?.subscriptionTier || 'FREE';
  const isPaidUser = currentTier !== 'FREE';
  const isCoach = currentUser.profile?.role === 'coach';

  const processStripeAction = async (planId: string, actionType: 'checkout' | 'portal') => {
    setLoadingPriceId(planId);
    try {
      if (actionType === 'portal') {
         await createPortalSession(currentUser.id);
      } else {
         await createCheckoutSession(currentUser.id, planId);
      }
    } catch (error: any) {
      console.error(error);
      alert(`Error: ${error.message || "No se pudo conectar con el servidor."}`);
    } finally {
      setTimeout(() => setLoadingPriceId(null), 3000);
    }
  };

  const handlePlanAction = async (planId: string, actionType: 'checkout' | 'portal') => {
    if (planId === 'FREE' && actionType === 'portal') {
       const uData = await StorageService.getUserData(currentUser.id);
       const targetLimit = getUserLimits('FREE').maxStoredVideos || 3;
       if (uData.videos.length > targetLimit) {
           setDowngradeWarning(`¡Cuidado! Tu galería tiene ${uData.videos.length} vídeos. El plan Gratuito solo permite ${targetLimit}. Si confirmas, entrarás en un periodo de gracia obligatorio de 3 días para borrar el exceso, o tu cuenta será eliminada permanentemente.`);
       } else {
           setDowngradeWarning(null);
       }
       setShowDowngradeModal(true);
       return;
    }
    await processStripeAction(planId, actionType);
  };

  const handleConfirmDowngrade = async () => {
     await processStripeAction('FREE', 'portal');
     setShowDowngradeModal(false);
  };

  // --- PLAN DEFINITIONS ---

  const freePlan: PlanItem = {
    id: 'FREE',
    name: t.free,
    price: '0€',
    period: t.monthly,
    icon: <Circle className="text-neutral-400" size={24} />,
    features: ['3 Análisis/mes', '10 Mensajes chat/mes', '3 Vídeos Máximos', '5 PDFs Máximos', 'Sin Comparador'],
    buttonText: currentTier === 'FREE' ? t.current : t.downgrade,
    actionType: currentTier === 'FREE' ? 'none' : 'portal',
    disabled: currentTier === 'FREE',
    highlight: false,
    tierId: 'FREE'
  };

  const athletePlans: PlanItem[] = [
    freePlan,
    {
      id: STRIPE_PRICES.PRO_ATHLETE,
      name: t.athletePro,
      price: '19,99€',
      period: t.monthly,
      icon: <Zap className="text-orange-500" size={24} />,
      features: ['15 Vídeos/mes', '100 Mensajes chat/mes', 'Comparador de Vídeo', 'Gemini 2.5 Flash', 'Prioridad Soporte'],
      buttonText: currentTier === 'PRO_ATHLETE' ? t.current : (currentTier === 'FREE' ? t.upgrade : t.select),
      actionType: currentTier === 'PRO_ATHLETE' ? 'none' : 'checkout',
      disabled: currentTier === 'PRO_ATHLETE',
      highlight: true,
      tierId: 'PRO_ATHLETE'
    },
    {
      id: STRIPE_PRICES.PRO_COACH,
      name: t.athletePremium,
      price: '49,99€',
      period: t.monthly,
      icon: <Crown className="text-yellow-500" size={24} />,
      features: ['100 Vídeos/mes', '200 Mensajes chat/mes', 'Comparador 4K', 'Gemini 3 Pro', 'Máxima Prioridad'],
      buttonText: currentTier === 'PRO_COACH' ? t.current : t.upgrade,
      actionType: currentTier === 'PRO_COACH' ? 'none' : 'checkout',
      disabled: currentTier === 'PRO_COACH',
      highlight: false,
      isBlack: true,
      badge: t.bestValue,
      tierId: 'PRO_COACH'
    }
  ];

  const coachPlans: PlanItem[] = [
    freePlan,
    {
      id: STRIPE_PRICES.PRO_COACH,
      name: t.coachPro,
      price: '49,99€',
      period: t.monthly,
      icon: <ShieldCheck className="text-blue-500" size={24} />,
      features: ['100 Vídeos/mes', '200 Mensajes chat/mes', 'Comparador de Vídeo', 'Gemini 2.5 Flash', 'Gestión de 20 Atletas'],
      buttonText: currentTier === 'PRO_COACH' ? t.current : t.select,
      actionType: currentTier === 'PRO_COACH' ? 'none' : 'checkout',
      disabled: currentTier === 'PRO_COACH',
      highlight: true,
      tierId: 'PRO_COACH'
    },
    {
      id: STRIPE_PRICES.PREMIUM,
      name: t.coachPremium,
      price: '79,99€',
      period: t.monthly,
      icon: <Crown className="text-yellow-500" size={24} />,
      features: ['300 Vídeos/mes', '500 Mensajes chat/mes', 'Comparador 4K', 'Gemini 3 Pro (Deep Analysis)', 'Gestión de 50 Atletas'],
      buttonText: currentTier === 'PREMIUM' ? t.current : t.upgrade,
      actionType: currentTier === 'PREMIUM' ? 'none' : 'checkout',
      disabled: currentTier === 'PREMIUM',
      highlight: false,
      isBlack: true,
      badge: t.bestValue,
      tierId: 'PREMIUM'
    }
  ];

  const visiblePlans = isCoach ? coachPlans : athletePlans;

  return (
    <div className="py-12 px-4 bg-gray-50 dark:bg-neutral-950 h-full overflow-y-auto transition-colors duration-300 relative">
      <div className="max-w-7xl mx-auto text-center mb-12 relative">
        <h2 className="text-3xl md:text-5xl font-black text-neutral-900 dark:text-white mb-4 tracking-tight">
          {t.title}
        </h2>
        <p className="text-neutral-500 dark:text-neutral-400 max-w-3xl mx-auto text-sm md:text-base">
          {t.subtitle}
        </p>

        {isPaidUser && (
           <div className="mt-6 flex justify-center">
              <button 
                 onClick={() => processStripeAction('PORTAL', 'portal')}
                 disabled={loadingPriceId === 'PORTAL'}
                 className="flex items-center gap-2 px-6 py-2 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-800 dark:text-white rounded-full font-bold text-sm transition-colors"
              >
                 {loadingPriceId === 'PORTAL' ? <Loader2 className="animate-spin" size={16} /> : <Settings size={16} />}
                 {t.manage}
              </button>
           </div>
        )}
      </div>

      <div className="flex flex-wrap justify-center gap-6 max-w-7xl mx-auto mb-16">
        {visiblePlans.map((plan) => {
          // Dynamic styles based on Light/Dark mode AND Card Type
          let containerClasses = "";
          let buttonClasses = "";
          
          if (plan.isBlack) {
             // Premium Plan:
             // Light Mode: White Background, Gold Border, Black Text.
             // Dark Mode: Black Background, Gold Border, White Text.
             containerClasses = "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white border-yellow-500 shadow-2xl shadow-yellow-500/10";
             buttonClasses = "bg-yellow-500 text-black hover:bg-yellow-400";
          } else if (plan.highlight) {
             // Highlighted Plan (Pro):
             // Light Mode: White Background, Orange Border, Black Text.
             // Dark Mode: Dark Background, Orange Border, White Text.
             containerClasses = "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white border-orange-500 shadow-xl scale-105 z-10";
             buttonClasses = "bg-orange-600 text-white hover:bg-orange-500";
          } else {
             // Standard Plan (Free):
             // Light Mode: White Background, Gray Border, Black Text.
             // Dark Mode: Dark Background, Dark Gray Border, White Text.
             containerClasses = "bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white border-neutral-200 dark:border-neutral-800";
             buttonClasses = "bg-neutral-900 dark:bg-white text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200";
          }

          // Disabled state overrides
          if (plan.disabled) {
             buttonClasses = "bg-neutral-200 dark:bg-neutral-800 !text-neutral-500 cursor-default border border-neutral-300 dark:border-neutral-700 shadow-none";
          }

          return (
            <div 
              key={plan.id}
              className={`relative p-6 rounded-3xl border transition-all duration-300 flex flex-col w-full md:w-[calc(50%-1.5rem)] lg:w-[calc(30%-1rem)] min-w-[280px] ${containerClasses} ${plan.disabled ? 'opacity-90' : 'opacity-100'}`}
            >
              {plan.badge && (
                <span className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${plan.isBlack ? 'bg-yellow-500 text-black' : 'bg-orange-600 text-white'}`}>
                  {plan.badge}
                </span>
              )}

              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-neutral-900 dark:text-white">
                  {plan.icon}
                </div>
                <h3 className="font-bold text-lg leading-tight">{plan.name}</h3>
              </div>

              <div className="mb-4">
                <span className="text-3xl lg:text-4xl font-black">{plan.price}</span>
                <span className="text-neutral-500 text-sm ml-1">{plan.period}</span>
              </div>

              <ul className="space-y-3 mb-8 flex-1">
                {plan.features.map((feature, idx) => {
                  const isLimited = plan.tierId === 'FREE' && feature === 'Sin Comparador';
                  return (
                    <li key={idx} className="flex items-center gap-2 text-xs">
                      {isLimited ? <XCircle size={14} className="text-red-500 shrink-0" /> : <Check size={14} className="text-green-500 shrink-0" />}
                      <span className={`${isLimited ? 'text-neutral-400 line-through' : 'opacity-90'}`}>{feature}</span>
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={() => handlePlanAction(plan.id, plan.actionType as 'checkout' | 'portal')}
                disabled={plan.disabled || (loadingPriceId !== null && loadingPriceId !== 'FREE')}
                className={`w-full py-3 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${buttonClasses} disabled:opacity-100`}
              >
                {loadingPriceId === plan.id ? <Loader2 className="animate-spin" size={18} /> : (
                   <>
                      {plan.disabled && <Check size={16} />}
                      {plan.buttonText}
                   </>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {showDowngradeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
           <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 p-6 rounded-3xl max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200 transition-colors">
              <div className="flex flex-col items-center text-center">
                 <div className="w-16 h-16 bg-orange-100 dark:bg-orange-500/10 rounded-full flex items-center justify-center mb-4 relative">
                    <AlertTriangle size={32} className="text-orange-600 dark:text-orange-500" />
                 </div>
                 
                 <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">
                    {t.downgradeModalTitle}
                 </h3>
                 
                 <p className="text-neutral-600 dark:text-neutral-300 text-sm mb-4 font-medium">
                    {t.downgradeModalDesc}
                 </p>

                 <div className="bg-neutral-50 dark:bg-neutral-800/50 rounded-xl p-4 text-left w-full mb-6 border border-neutral-100 dark:border-neutral-800">
                    <ul className="space-y-2">
                       {t.downgradeModalList.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-xs text-neutral-600 dark:text-neutral-400">
                             <Check size={14} className="text-green-500 mt-0.5 shrink-0" />
                             <span>{item}</span>
                          </li>
                       ))}
                    </ul>
                 </div>
                 
                 {downgradeWarning && (
                     <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-left w-full mb-6 relative">
                        <AlertTriangle size={18} className="absolute top-4 left-4 text-red-500" />
                        <p className="text-red-600 dark:text-red-400 text-xs font-bold leading-relaxed pl-8">
                            {downgradeWarning}
                        </p>
                     </div>
                 )}

                 <div className="flex flex-col gap-3 w-full">
                    <button 
                       onClick={handleConfirmDowngrade}
                       disabled={loadingPriceId === 'FREE'}
                       className="w-full py-3 px-4 bg-neutral-900 dark:bg-white text-white dark:text-black font-bold rounded-xl hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                    >
                       {loadingPriceId === 'FREE' && <Loader2 className="animate-spin" size={16} />}
                       {t.downgradeConfirmBtn}
                    </button>
                    <button 
                       onClick={() => setShowDowngradeModal(false)}
                       disabled={loadingPriceId === 'FREE'}
                       className="w-full py-3 px-4 bg-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 font-medium rounded-xl transition-colors"
                    >
                       {t.cancelBtn}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

    </div>
  );
};
