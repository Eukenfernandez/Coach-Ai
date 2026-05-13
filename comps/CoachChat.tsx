
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, Language, UserUsage, UserLimits } from '../types';
import { chatWithCoach } from '../svcs/geminiService';
import { Send, User, MessageSquareQuote, Loader2, Info } from 'lucide-react';

interface CoachChatProps {
  language: Language;
  usage: UserUsage | null;
  limits: UserLimits;
  onMessageSent: () => void;
}

const TEXTS = {
  es: {
    welcome: '¡Hola! Soy tu entrenador personal de IA. ¿Cómo te sientes hoy? Cuéntame sobre tu entrenamiento, lesiones, o dudas de nutrición.',
    placeholder: 'Pregunta sobre rutinas, dolores, o consejos...',
    writing: 'Escribiendo...',
    title: 'Entrenador IA',
    subtitle: 'Especialista en rendimiento, recuperación y estrategia.',
    limitReached: 'Has alcanzado el límite mensual de mensajes.',
    limitResponse: 'Has llegado al límite mensual de mensajes de IA de tu suscripción. Para seguir chateando, mejora tu plan o espera al próximo reseteo mensual.',
    messagesLeft: 'mensajes restantes este mes',
    unlimited: 'Mensajes ilimitados'
  },
  ing: {
    welcome: 'Hello! I am your AI personal coach. How are you feeling today? Tell me about your training, injuries, or nutrition questions.',
    placeholder: 'Ask about routines, pains, or tips...',
    writing: 'Writing...',
    title: 'AI Coach',
    subtitle: 'Performance, recovery and strategy specialist.',
    limitReached: 'Monthly message limit reached.',
    limitResponse: 'You have reached your subscription monthly AI message limit. Upgrade your plan or wait for the next monthly reset to keep chatting.',
    messagesLeft: 'messages left this month',
    unlimited: 'Unlimited messages'
  },
  eus: {
    welcome: 'Kaixo! Zure AI entrenatzaile pertsonala naiz. Nola sentitzen zara gaur? Kontatu entrenamenduaz, lesioez edo nutrizio-zalantzez.',
    placeholder: 'Galdetu errutinei, minei edo aholkuei buruz...',
    writing: 'Idazten...',
    title: 'AI Entrenatzailea',
    subtitle: 'Errendimendu, errekuperazio eta estrategia espezialista.',
    limitReached: 'Hileko mezu-muga gainditu duzu.',
    limitResponse: 'Zure harpidetzaren hileko IA mezuen mugara iritsi zara. Jarraitzeko, hobetu plana edo itxaron hileko berrezarpenera.',
    messagesLeft: 'mezu geratzen dira hilabete honetan',
    unlimited: 'Mezu mugagabeak'
  }
};

export const CoachChat: React.FC<CoachChatProps> = ({ language, usage, limits, onMessageSent }) => {
  const t = TEXTS[language] || TEXTS.es;
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'model',
      text: t.welcome,
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isUnlimited = limits.maxChatMessagesPerMonth === 'unlimited';
  const chatLimit = isUnlimited ? Infinity : (limits.maxChatMessagesPerMonth as number);
  const messagesUsed = usage?.chatCount || 0;
  const isLimitReached = messagesUsed >= chatLimit;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');

    if (isLimitReached) {
      setMessages(prev => [...prev, {
        id: `${Date.now()}-limit`,
        role: 'model',
        text: t.limitResponse,
        timestamp: new Date()
      }]);
      return;
    }

    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role,
        text: m.text
      }));
      
      const response = await chatWithCoach(userMsg.text, history, 'standard', language);
      
      const aiMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
      onMessageSent();
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: `${Date.now()}-error`,
        role: 'model',
        text: error instanceof Error ? error.message : t.limitResponse,
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col bg-neutral-950 max-w-5xl mx-auto border-x border-neutral-900 shadow-2xl transition-colors duration-300">
      <div className="p-6 border-b border-neutral-900 bg-neutral-950 z-10 flex items-center justify-between">
        <div className="flex items-center gap-3">
           <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/20">
              <MessageSquareQuote className="text-white" size={24} />
           </div>
           <div>
              <h2 className="text-xl font-bold text-white">{t.title}</h2>
              <p className="text-sm text-neutral-400">{t.subtitle}</p>
           </div>
        </div>
        
        {!isUnlimited && (
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-[10px] uppercase text-neutral-500 font-bold tracking-widest">Límite Mensual</span>
            <span className={`text-xs font-mono ${isLimitReached ? 'text-red-500' : 'text-blue-400'}`}>
              {Math.max(0, chatLimit - messagesUsed)} {t.messagesLeft}
            </span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg) => (
          <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
             <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center ${msg.role === 'user' ? 'bg-orange-600' : 'bg-blue-600'}`}>
                {msg.role === 'user' ? <User size={16} className="text-white" /> : <MessageSquareQuote size={16} className="text-white" />}
             </div>
             <div className={`max-w-[80%] p-4 rounded-2xl text-sm leading-relaxed shadow-md ${
               msg.role === 'user' 
               ? 'bg-neutral-800 text-white rounded-tr-none' 
               : 'bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-tl-none'
             }`}>
               {msg.text}
             </div>
          </div>
        ))}
        {isLoading && (
           <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                 <Loader2 size={16} className="animate-spin text-white" />
              </div>
              <div className="bg-neutral-900 border border-neutral-800 px-4 py-3 rounded-2xl rounded-tl-none">
                 <span className="text-neutral-400 text-sm">{t.writing}</span>
              </div>
           </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-6 border-t border-neutral-900 bg-neutral-950">
        {isLimitReached && (
          <div className="mb-4 p-3 bg-red-900/20 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400 text-sm">
             <Info size={18} />
             {t.limitReached}
          </div>
        )}
        <form onSubmit={handleSend} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={isLoading}
            placeholder={isLimitReached ? t.limitReached : t.placeholder}
            className="w-full bg-neutral-900 text-white rounded-xl py-4 pl-6 pr-16 border border-neutral-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 focus:outline-none transition-all disabled:opacity-50"
          />
          <button 
            type="submit" 
            disabled={!input.trim() || isLoading}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 bg-orange-600 rounded-lg text-white hover:bg-orange-500 disabled:opacity-50 transition-colors"
          >
            <Send size={20} />
          </button>
        </form>
        <div className="mt-3 sm:hidden text-center">
           <span className="text-[10px] text-neutral-500">
             {isUnlimited ? t.unlimited : `${Math.max(0, chatLimit - messagesUsed)} ${t.messagesLeft}`}
           </span>
        </div>
      </div>
    </div>
  );
};
