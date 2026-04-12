'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { useAppStore, UserProfileName } from '@/store/app-store';
import { cn } from '@/lib/utils';

export function ProfileSelectionOverlay() {
  const { setActiveProfile } = useAppStore();

  const profiles: { id: UserProfileName; label: string; emoji: string; color: string; description: string }[] = [
    { 
      id: 'Juli', 
      label: 'Juli', 
      emoji: '🧔‍♂️', 
      color: 'bg-primary',
      description: 'Planes de hipertrofia y volumen'
    },
    { 
      id: 'Caro', 
      label: 'Caro', 
      emoji: '👩🏻‍🦰', 
      color: 'bg-accent',
      description: 'Recetas saludables y equilibrio'
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center p-6 text-center">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12 space-y-2"
      >
        <h1 className="text-4xl font-black text-primary tracking-tight">¡Hola!</h1>
        <p className="text-muted-foreground font-bold uppercase text-xs tracking-[0.2em]">¿Quién va a cocinar hoy?</p>
      </motion.div>

      <div className="grid grid-cols-1 gap-4 w-full max-w-xs">
        {profiles.map((p, idx) => (
          <motion.button
            key={p.id}
            initial={{ opacity: 0, x: idx % 2 === 0 ? -20 : 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * idx }}
            onClick={() => setActiveProfile(p.id)}
            className="group relative flex flex-col items-center p-8 rounded-[2.5rem] bg-white border-2 border-primary/5 shadow-xl active:scale-95 transition-all overflow-hidden"
          >
            <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity", p.color)} />
            <span className="text-6xl mb-4 filter drop-shadow-sm">{p.emoji}</span>
            <span className="text-2xl font-black text-primary mb-1 uppercase tracking-tight">{p.label}</span>
            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">{p.description}</span>
          </motion.button>
        ))}
      </div>

      <motion.p 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-12 text-[10px] font-black text-muted-foreground uppercase tracking-widest"
      >
        Cocina Familiar · Sesión Privada
      </motion.p>
    </div>
  );
}
