"use client"

import * as React from "react"
import { useAppStore, UserProfileName } from "@/store/app-store"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

export function ProfileSwitcher() {
  const { activeProfile, setActiveProfile } = useAppStore()

  const profiles: { id: UserProfileName; label: string; emoji: string; color: string }[] = [
    { id: 'Juli', label: 'Juli', emoji: '🧔‍♂️', color: 'bg-primary' },
    { id: 'Caro', label: 'Caro', emoji: '👩🏻‍🦰', color: 'bg-accent' }
  ]

  return (
    <div className="flex bg-primary-suave p-1 rounded-2xl border border-primary/10 w-fit">
      {profiles.map((p) => {
        const isActive = activeProfile === p.id
        return (
          <button
            key={p.id}
            onClick={() => setActiveProfile(p.id)}
            className={cn(
              "relative px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
              isActive ? "text-white" : "text-primary/60"
            )}
          >
            {isActive && (
              <motion.div
                layoutId="activeProfileBg"
                className={cn("absolute inset-0 rounded-xl shadow-sm", p.color)}
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{p.emoji}</span>
            <span className="relative z-10">{p.label}</span>
          </button>
        )
      })}
    </div>
  )
}