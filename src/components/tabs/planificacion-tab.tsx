'use client';

import * as React from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Trash2,
  Eye,
  Plus,
  Sparkles,
  Loader2,
  CalendarX,
  Flame,
  Beef,
  Wheat,
  Droplets,
  Activity,
  MoreVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format, addDays, startOfWeek, subWeeks, addWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { collection, writeBatch, doc, serverTimestamp, getDocs, query, where, increment } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { toast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { useAppStore } from '@/store/app-store';
import { AddMealPlanDialog } from '@/components/plan/add-meal-plan-dialog';
import { USER_ID } from '@/lib/constants';
import { cn, getSafeImageSource } from '@/lib/utils';
import { GradientPlaceholder } from '@/components/gradient-placeholder';
import { motion, AnimatePresence } from 'framer-motion';
// Planificador aleatorio local — sin IA, sin API key
const MEAL_TYPES = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena'] as const;
type MealType = typeof MEAL_TYPES[number];

function pickRandomRecipe(recetas: any[], mealType: MealType): any | null {
  const matching = recetas.filter(r => {
    const cats: string[] = r.categorias || (r.categoria ? [r.categoria] : []);
    return cats.includes(mealType);
  });
  const pool = matching.length > 0 ? matching : recetas;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function buildRandomDayPlans(recetas: any[], date: string) {
  return MEAL_TYPES.map(mealType => {
    const recipe = pickRandomRecipe(recetas, mealType);
    if (!recipe) return null;
    return { date, mealType, recipeId: recipe.id, recipeName: recipe.nombre };
  }).filter(Boolean);
}
import Image from "next/image";
import { syncShoppingList } from '@/lib/sync-logic';

const MOMENTOS = ["Desayuno", "Almuerzo", "Merienda", "Cena"];

function WeeklyMacroRing({ label, value, target, size = 60, strokeWidth = 5, icon: Icon }: { label: string, value: number, target: number, size?: number, strokeWidth?: number, icon?: any }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const rawPercentage = target > 0 ? (value / target) * 100 : 0;
  const visualPercentage = Math.min(rawPercentage, 100);
  const offset = circumference - (visualPercentage / 100) * circumference;

  let ringColor = "text-primary";
  if (rawPercentage > 110) ringColor = "text-destructive";
  else if (rawPercentage > 100) ringColor = "text-accent";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="w-full h-full transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="transparent" stroke="currentColor" strokeWidth={strokeWidth} className="text-primary-suave" />
          <circle 
            cx={size / 2} cy={size / 2} r={radius} fill="transparent" stroke="currentColor" 
            strokeWidth={strokeWidth} strokeDasharray={circumference} strokeDashoffset={offset} 
            strokeLinecap="round" className={`${ringColor} transition-all duration-700 ease-out`} 
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {Icon && <Icon className={cn("h-3 w-3 mb-0.5", ringColor)} />}
          <span className="text-[10px] font-black leading-none">{Math.round(rawPercentage)}%</span>
        </div>
      </div>
      <span className="text-[8px] font-black text-muted-foreground uppercase tracking-tighter">{label}</span>
    </div>
  );
}

export function PlanificacionTab() {
  const router = useRouter();
  const db = useFirestore();
  const { planificacion, planificacionCargada, recetas, activeProfile, userProfile } = useAppStore();
  
  const [currentWeek, setCurrentWeek] = React.useState(new Date());
  const [expandedDay, setExpandedDay] = React.useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = React.useState<any>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isAutoPlanning, setIsAutoPlanning] = React.useState(false);
  const [isAutoPlanningDay, setIsAutoPlanningDay] = React.useState<string | null>(null);
  const [isClearing, setIsClearing] = React.useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = React.useState(false);

  const startDate = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startDate, i));

  const goals = userProfile?.objetivosMacros || { calorias: 2000, proteinas: 150, carbohidratos: 250, grasas: 65 };
  const weeklyGoals = React.useMemo(() => ({
    calorias: goals.calorias * 7,
    proteinas: goals.proteinas * 7,
    carbohidratos: goals.carbohidratos * 7,
    grasas: goals.grasas * 7
  }), [goals]);

  const weeklyTotals = React.useMemo(() => {
    const weekStrArray = weekDays.map(d => format(d, "yyyy-MM-dd"));
    const weekPlans = planificacion.filter(p => weekStrArray.includes(p.date));
    
    return weekPlans.reduce((acc, p) => {
      const m = p.macros || {};
      return {
        calorias: acc.calorias + (Number(m.calorias) || 0),
        proteinas: acc.proteinas + (Number(m.proteinas) || 0),
        carbohidratos: acc.carbohidratos + (Number(m.carbohidratos) || 0),
        grasas: acc.grasas + (Number(m.grasas) || 0),
      };
    }, { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 });
  }, [planificacion, weekDays]);

  React.useEffect(() => {
    if (planificacionCargada && !expandedDay) {
      setExpandedDay(format(new Date(), "yyyy-MM-dd"));
    }
  }, [planificacionCargada, expandedDay]);

  const handleAutoPlan = async () => {
    if (!db || recetas.length === 0) return;
    setIsAutoPlanning(true);
    try {
      const weekStr = weekDays.map(d => format(d, "yyyy-MM-dd"));
      const result = { plans: weekStr.flatMap(date => buildRandomDayPlans(recetas, date)) };

      const batch = writeBatch(db);
      
      const currentPlansSnap = await getDocs(query(
        collection(db, "users", USER_ID, "meal_plans"), 
        where("date", "in", weekStr),
        where("perfil", "==", activeProfile)
      ));
      currentPlansSnap.docs.forEach(d => batch.delete(d.ref));
      
      const currentLogsSnap = await getDocs(query(
        collection(db, "users", USER_ID, "daily_logs"), 
        where("date", "in", weekStr),
        where("perfil", "==", activeProfile)
      ));
      currentLogsSnap.docs.forEach(d => batch.delete(d.ref));

      for (const date of weekStr) {
        const summaryId = `${date}_${activeProfile}`
        batch.set(doc(db, "users", USER_ID, "daily_macro_summaries", summaryId), {
          totalesDia: { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 },
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      for (const p of result.plans) {
        const fullRecipe = recetas.find(r => r.id === p.recipeId);
        if (!fullRecipe) continue;

        const m = fullRecipe.macros || {};
        const macrosCalculados = {
          calorias: Math.round(Number(m.calorias || 0)),
          proteinas: Math.round(Number(m.proteinas || 0)),
          carbohidratos: Math.round(Number(m.carbohidratos || 0)),
          grasas: Math.round(Number(m.grasas || 0)),
        };

        const planRef = doc(collection(db, "users", USER_ID, "meal_plans"));
        batch.set(planRef, {
          userId: USER_ID,
          perfil: activeProfile,
          date: p.date,
          mealType: p.mealType,
          recipeId: p.recipeId,
          recipeName: p.recipeName,
          recipeCategory: fullRecipe.categoria || "Almuerzo",
          recipeImageUrl: fullRecipe.fotoURL || fullRecipe.imageUrl || null,
          plannedPortions: 3,
          recipeOriginalPortions: fullRecipe.porciones || 1,
          macros: macrosCalculados,
          ingredientes: fullRecipe.ingredientes || [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        batch.set(doc(collection(db, "users", USER_ID, "daily_logs")), {
          userId: USER_ID,
          perfil: activeProfile,
          date: p.date,
          momento: p.mealType,
          recetaId: p.recipeId,
          recetaNombre: p.recipeName,
          recetaCategoria: fullRecipe.categoria || "Almuerzo",
          porciones: 1, 
          macros: macrosCalculados,
          planId: planRef.id,
          createdAt: serverTimestamp()
        });

        const summaryRef = doc(db, "users", USER_ID, "daily_macro_summaries", `${p.date}_${activeProfile}`);
        batch.set(summaryRef, {
          totalesDia: {
            calorias: increment(macrosCalculados.calorias),
            proteinas: increment(macrosCalculados.proteinas),
            carbohidratos: increment(macrosCalculados.carbohidratos),
            grasas: increment(macrosCalculados.grasas)
          },
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      await batch.commit();
      await syncShoppingList(db, activeProfile);
      toast({ title: `¡Plan de ${activeProfile} listo! ✨` });
    } catch (e) {
      console.error(e);
      toast({ variant: "destructive", title: "Error al generar plan semanal" });
    } finally {
      setIsAutoPlanning(false);
    }
  };

  const handleAutoPlanDay = async (date: Date) => {
    if (!db || recetas.length === 0) return;

    const dateStr = format(date, "yyyy-MM-dd");
    setIsAutoPlanningDay(dateStr);
    try {
      const result = { plans: buildRandomDayPlans(recetas, dateStr) };

      const batch = writeBatch(db);

      // Delete existing meal_plans and daily_logs for this day before re-planning
      const [existingPlansSnap, existingLogsSnap] = await Promise.all([
        getDocs(query(collection(db, "users", USER_ID, "meal_plans"), where("date", "==", dateStr), where("perfil", "==", activeProfile))),
        getDocs(query(collection(db, "users", USER_ID, "daily_logs"), where("date", "==", dateStr), where("perfil", "==", activeProfile)))
      ]);
      existingPlansSnap.docs.forEach(d => batch.delete(d.ref));
      existingLogsSnap.docs.forEach(d => batch.delete(d.ref));

      // Accumulate total macros to write summaryRef only once
      const totalMacros = { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 };

      for (const p of result.plans) {
        const fullRecipe = recetas.find(r => r.id === p.recipeId);
        if (!fullRecipe) continue;

        const m = fullRecipe.macros || {};
        const macrosCalculados = {
          calorias: Math.round(Number(m.calorias || 0)),
          proteinas: Math.round(Number(m.proteinas || 0)),
          carbohidratos: Math.round(Number(m.carbohidratos || 0)),
          grasas: Math.round(Number(m.grasas || 0)),
        };

        totalMacros.calorias += macrosCalculados.calorias;
        totalMacros.proteinas += macrosCalculados.proteinas;
        totalMacros.carbohidratos += macrosCalculados.carbohidratos;
        totalMacros.grasas += macrosCalculados.grasas;

        const planRef = doc(collection(db, "users", USER_ID, "meal_plans"));
        batch.set(planRef, {
          userId: USER_ID,
          perfil: activeProfile,
          date: dateStr,
          mealType: p.mealType,
          recipeId: p.recipeId,
          recipeName: p.recipeName,
          recipeCategory: fullRecipe.categoria || "Almuerzo",
          recipeImageUrl: fullRecipe.fotoURL || fullRecipe.imageUrl || null,
          plannedPortions: 3,
          recipeOriginalPortions: fullRecipe.porciones || 1,
          macros: macrosCalculados,
          ingredientes: fullRecipe.ingredientes || [],
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        batch.set(doc(collection(db, "users", USER_ID, "daily_logs")), {
          userId: USER_ID,
          perfil: activeProfile,
          date: dateStr,
          momento: p.mealType,
          recetaId: p.recipeId,
          recetaNombre: p.recipeName,
          recetaCategoria: fullRecipe.categoria || "Almuerzo",
          porciones: 1,
          macros: macrosCalculados,
          planId: planRef.id,
          createdAt: serverTimestamp()
        });
      }

      // Single write to summaryRef with accumulated totals
      const summaryRef = doc(db, "users", USER_ID, "daily_macro_summaries", `${dateStr}_${activeProfile}`);
      batch.set(summaryRef, {
        date: dateStr,
        userId: USER_ID,
        perfil: activeProfile,
        totalesDia: totalMacros,
        updatedAt: serverTimestamp()
      }, { merge: true });

      await batch.commit();
      await syncShoppingList(db, activeProfile);

      toast({ title: `Día de ${activeProfile} planeado ✓` });
      setExpandedDay(dateStr);
    } catch (e) {
      console.error("Error autoPlanDay:", e);
      toast({ variant: "destructive", title: "Error al planear el día" });
    } finally {
      setIsAutoPlanningDay(null);
    }
  };

  const handleUnplanWeek = async () => {
    if (!db) return;
    setIsClearing(true);
    try {
      const batch = writeBatch(db);
      const weekStr = weekDays.map(d => format(d, "yyyy-MM-dd"));
      
      const currentPlansSnap = await getDocs(query(
        collection(db, "users", USER_ID, "meal_plans"), 
        where("date", "in", weekStr),
        where("perfil", "==", activeProfile)
      ));
      
      const currentLogsSnap = await getDocs(query(
        collection(db, "users", USER_ID, "daily_logs"), 
        where("date", "in", weekStr),
        where("perfil", "==", activeProfile)
      ));
      
      currentPlansSnap.docs.forEach(d => batch.delete(d.ref));
      currentLogsSnap.docs.forEach(d => batch.delete(d.ref));
      
      for (const date of weekStr) {
        const summaryId = `${date}_${activeProfile}`
        batch.set(doc(db, "users", USER_ID, "daily_macro_summaries", summaryId), {
          totalesDia: { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 },
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      await batch.commit();
      await syncShoppingList(db, activeProfile);
      toast({ title: `Semana desplanificada` });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al limpiar plan" });
    } finally {
      setIsClearing(false);
    }
  };

  const handleUpdatePortions = async (planId: string, currentPortions: number, delta: number) => {
    if (!db) return;
    const newPortions = Math.max(1, currentPortions + delta);
    try {
      const planRef = doc(db, "users", USER_ID, "meal_plans", planId);
      await writeBatch(db)
        .update(planRef, { plannedPortions: newPortions, updatedAt: serverTimestamp() })
        .commit();
      await syncShoppingList(db, activeProfile);
    } catch (e) {}
  };

  const handleDeleteFromPlan = async () => {
    if (!db || !selectedPlan) return;
    setIsDeleting(true);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, "users", USER_ID, "meal_plans", selectedPlan.id));
      
      const logSnap = await getDocs(query(
        collection(db, "users", USER_ID, "daily_logs"), 
        where("planId", "==", selectedPlan.id),
        where("perfil", "==", activeProfile)
      ));
      logSnap.docs.forEach(d => batch.delete(d.ref));

      const macros = selectedPlan.macros || {};
      const summaryRef = doc(db, "users", USER_ID, "daily_macro_summaries", `${selectedPlan.date}_${activeProfile}`);
      batch.set(summaryRef, {
        totalesDia: {
          calorias: increment(-Math.round(macros.calorias || 0)),
          proteinas: increment(-Math.round(macros.proteinas || 0)),
          carbohidratos: increment(-Math.round(macros.carbohidratos || 0)),
          grasas: increment(-Math.round(macros.grasas || 0))
        },
        updatedAt: serverTimestamp()
      }, { merge: true });

      await batch.commit();
      await syncShoppingList(db, activeProfile);
      
      toast({ title: "Comida eliminada" });
      setSelectedPlan(null);
    } catch (e) { 
      toast({ variant: "destructive", title: "Error al borrar" }); 
    }
    finally { setIsDeleting(false); }
  };

  if (!planificacionCargada && planificacion.length === 0) {
    return (
      <div className="space-y-6">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500 pb-12">
      {/* Header compacto con dropdown de acciones */}
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-2xl font-black text-primary leading-none">Plan</h1>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mt-0.5">{activeProfile}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0 bg-white border rounded-full px-1 py-1 shadow-sm">
            <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))} className="h-7 w-7 rounded-full">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-[10px] font-black px-2 tabular-nums">
              {format(startDate, "d MMM", { locale: es })} – {format(addDays(startDate, 6), "d MMM", { locale: es })}
            </span>
            <Button variant="ghost" size="icon" onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))} className="h-7 w-7 rounded-full">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 bg-primary-suave text-primary rounded-full">
                {isAutoPlanning || isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-2xl">
              <DropdownMenuItem onClick={handleAutoPlan} disabled={isAutoPlanning} className="gap-3 font-bold">
                <Sparkles className="h-4 w-4 text-accent" /> Planear semana con IA
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsConfirmClearOpen(true)} className="gap-3 font-bold text-destructive focus:text-destructive">
                <CalendarX className="h-4 w-4" /> Vaciar semana
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Macro rings compactos */}
      <Card className="border-none shadow-sm bg-white rounded-3xl overflow-hidden border border-primary/5">
        <CardContent className="p-4">
          <div className="flex justify-around items-center">
            <WeeklyMacroRing label="Kcal" value={weeklyTotals.calorias} target={weeklyGoals.calorias} size={72} strokeWidth={6} icon={Flame} />
            <WeeklyMacroRing label="Prot" value={weeklyTotals.proteinas} target={weeklyGoals.proteinas} size={56} strokeWidth={5} icon={Beef} />
            <WeeklyMacroRing label="Carbs" value={weeklyTotals.carbohidratos} target={weeklyGoals.carbohidratos} size={56} strokeWidth={5} icon={Wheat} />
            <WeeklyMacroRing label="Grasas" value={weeklyTotals.grasas} target={weeklyGoals.grasas} size={56} strokeWidth={5} icon={Droplets} />
          </div>
        </CardContent>
      </Card>

      {/* Calendar strip horizontal */}
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {weekDays.map((day) => {
          const dayStr = format(day, "yyyy-MM-dd");
          const isSelected = expandedDay === dayStr;
          const isToday = dayStr === format(new Date(), "yyyy-MM-dd");
          const dayPlansCount = planificacion.filter(p => p.date === dayStr).length;

          return (
            <button
              key={dayStr}
              onClick={() => setExpandedDay(isSelected ? null : dayStr)}
              className={cn(
                "flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl transition-all shrink-0 min-w-[52px]",
                isSelected
                  ? "bg-primary text-white shadow-md"
                  : isToday
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-white text-foreground border border-border"
              )}
            >
              <span className="text-[9px] font-black uppercase tracking-widest opacity-80">
                {format(day, "EEE", { locale: es })}
              </span>
              <span className="text-lg font-black leading-none">{format(day, "d")}</span>
              <div className="flex gap-0.5 h-1.5 items-center">
                {dayPlansCount > 0
                  ? Array.from({ length: Math.min(dayPlansCount, 4) }).map((_, i) => (
                      <div key={i} className={cn("h-1 w-1 rounded-full", isSelected ? "bg-white/70" : "bg-primary")} />
                    ))
                  : <div className={cn("h-1 w-1 rounded-full", isSelected ? "bg-white/30" : "bg-border")} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Vista del día seleccionado */}
      <AnimatePresence mode="wait">
        {expandedDay && (() => {
          const day = weekDays.find(d => format(d, "yyyy-MM-dd") === expandedDay);
          if (!day) return null;
          const dayStr = expandedDay;
          const plans = planificacion.filter(p => p.date === dayStr);
          const isLoadingThisDay = isAutoPlanningDay === dayStr;

          return (
            <motion.div
              key={expandedDay}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="space-y-2.5"
            >
              <div className="flex items-center justify-between px-1">
                <span className="text-sm font-black text-primary capitalize">
                  {format(day, "EEEE d 'de' MMMM", { locale: es })}
                </span>
                <Button
                  variant="ghost" size="icon"
                  className="h-8 w-8 bg-accent/8 text-accent rounded-full hover:bg-accent/15"
                  onClick={() => handleAutoPlanDay(day)}
                  disabled={!!isAutoPlanningDay}
                >
                  {isLoadingThisDay ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                </Button>
              </div>

              {MOMENTOS.map((m) => {
                const mealPlans = plans.filter(p => p.mealType === m);

                return (
                  <div key={m} className="flex gap-3 items-start">
                    <span className="w-16 text-[9px] font-black text-muted-foreground uppercase shrink-0 text-right pt-3">{m}</span>
                    <div className="flex-1 space-y-1.5 min-w-0">
                      {mealPlans.map((plan) => {
                        const recipe = recetas.find(r => r.id === plan.recipeId);
                        const imageUrl = getSafeImageSource(plan) || getSafeImageSource(recipe);
                        return (
                          <div key={plan.id} className="flex items-center gap-2.5 bg-white p-2 rounded-2xl relative shadow-sm border border-border/60">
                            <div className="h-10 w-10 rounded-xl overflow-hidden shrink-0 relative bg-muted">
                              {imageUrl ? (
                                <Image src={imageUrl} alt={plan.recipeName} fill className="object-cover" unoptimized />
                              ) : (
                                <GradientPlaceholder categoria={plan.recipeCategory || "Almuerzo"} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 pr-14">
                              <h4 className="font-bold text-xs truncate leading-tight cursor-pointer" onClick={() => router.push(`/recetas/${plan.recipeId}`)}>
                                {plan.recipeName}
                              </h4>
                              <div className="flex items-center gap-2 mt-0.5">
                                <div className="flex items-center gap-1">
                                  <button onClick={() => handleUpdatePortions(plan.id, plan.plannedPortions || 3, -1)} className="h-4 w-4 bg-muted rounded text-xs font-black flex items-center justify-center">-</button>
                                  <span className="text-[9px] font-black tabular-nums">{plan.plannedPortions || 3}p</span>
                                  <button onClick={() => handleUpdatePortions(plan.id, plan.plannedPortions || 3, 1)} className="h-4 w-4 bg-muted rounded text-xs font-black flex items-center justify-center">+</button>
                                </div>
                                <span className="text-[9px] font-black text-primary">{plan.macros?.calorias ?? recipe?.macros?.calorias ?? 0} kcal</span>
                              </div>
                            </div>
                            <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex gap-0.5">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-primary" onClick={() => router.push(`/recetas/${plan.recipeId}`)}><Eye className="h-3 w-3" /></Button>
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive" onClick={() => setSelectedPlan(plan)}><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        );
                      })}
                      <AddMealPlanDialog date={day} momento={m} onSave={() => {}}>
                        <button className={cn(
                          "w-full border border-dashed border-border rounded-2xl flex items-center justify-center gap-1.5 text-muted-foreground hover:bg-primary/5 transition-colors",
                          mealPlans.length === 0 ? "h-10" : "h-7 rounded-xl border-border/50"
                        )}>
                          <Plus className="h-3 w-3" />
                          {mealPlans.length === 0 && <span className="text-[9px] font-black uppercase">Agregar</span>}
                        </button>
                      </AddMealPlanDialog>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          );
        })()}
      </AnimatePresence>

      {/* Confirm vaciar semana */}
      <AlertDialog open={isConfirmClearOpen} onOpenChange={setIsConfirmClearOpen}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black text-primary text-xl">¿Vaciar tu semana?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium">Se quitarán todas las comidas de esta semana.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl font-bold">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setIsConfirmClearOpen(false); handleUnplanWeek(); }} className="bg-destructive text-white rounded-xl font-black">
              {isClearing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Vaciar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm eliminar receta del plan */}
      <AlertDialog open={!!selectedPlan} onOpenChange={(open) => !open && setSelectedPlan(null)}>
        <AlertDialogContent className="rounded-[2rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black text-primary text-xl">¿Eliminar del plan?</AlertDialogTitle>
            <AlertDialogDescription className="text-sm font-medium">
              Se quitará <span className="font-bold text-foreground">{selectedPlan?.recipeName}</span> de tu plan.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl font-bold">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFromPlan} disabled={isDeleting} className="bg-destructive text-white rounded-xl font-black">
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
