'use client';

import * as React from 'react';
import { useSearchParams } from "next/navigation";
import {
  Search, Plus, Minus, Package,
  AlertCircle, RotateCcw, X, Check,
  ChevronDown, ChevronUp, MoreVertical, History, CalendarDays
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { doc, serverTimestamp, collection, writeBatch, getDocs, updateDoc, addDoc } from "firebase/firestore";
import { useFirestore } from "@/firebase";
import { StockFormDialog } from "@/components/stock/stock-form-dialog";
import { BulkCategoryDialog } from "@/components/stock/bulk-category-dialog";
import { StockHistorialDialog } from "@/components/stock/stock-historial-dialog";
import { CategoryManagerDialog, normalizeCategoria } from "@/components/stock/category-manager-dialog";
import { toast } from "@/hooks/use-toast";
import { useAppStore } from '@/store/app-store';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { USER_ID } from '@/lib/constants';
import { cn, formatPrecio } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

export function StockTab() {
  const searchParams = useSearchParams();
  const db = useFirestore();
  const { ingredientes, ingredientesCargadas, planificacion } = useAppStore();
  
  const [search, setSearch] = React.useState("");
  const [showLowStockOnly, setShowLowStockOnly] = React.useState(false);
  const [showPlannedOnly, setShowPlannedOnly] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);


  // Ingredientes que aparecen en el plan de la semana
  const plannedIngredientNames = React.useMemo(() => {
    const names = new Set<string>();
    planificacion.forEach(plan => {
      (plan.ingredientes || []).forEach((ing: any) => {
        if (ing.nombre) names.add(ing.nombre.toLowerCase().trim());
      });
    });
    return names;
  }, [planificacion]);
  
  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  
  // Contraído por defecto: array vacío
  const [expandedItems, setExpandedItems] = React.useState<string[]>([]);

  const categoriesInView = React.useMemo(() => {
    const cats = Array.from(new Set(ingredientes.map(i => i.categoria || "Otros")));
    return cats.sort();
  }, [ingredientes]);

  // Manejo de filtro por URL - Solo se ejecuta al montar o cambiar el parámetro
  React.useEffect(() => {
    const filtro = searchParams?.get("filtro");
    if (filtro === "stockBajo") {
      setShowLowStockOnly(true);
    }
  }, [searchParams]);

  const toggleExpandAll = () => {
    if (expandedItems.length === categoriesInView.length) {
      setExpandedItems([]);
    } else {
      setExpandedItems(categoriesInView);
    }
  };

  const handleResetAllMinStock = async () => {
    if (!db) return;
    setIsResetting(true);
    try {
      const batch = writeBatch(db);
      const snap = await getDocs(collection(db, "users", USER_ID, "ingredients"));
      snap.docs.forEach(d => {
        batch.update(d.ref, { stockMinimo: 0, updatedAt: serverTimestamp() });
      });
      await batch.commit();
      toast({ title: "¡Listo!", description: "Todos los stock mínimos se pusieron en 0." });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al resetear" });
    } finally {
      setIsResetting(false);
    }
  };

  const updateStockDirect = async (id: string, val: number) => {
    if (!db) return;
    const ing = ingredientes.find(i => i.id === id);
    if (!ing) return;
    const newVal = Math.max(0, val);
    try {
      await updateDoc(doc(db, "users", USER_ID, "ingredients", id), { stockActual: newVal, updatedAt: serverTimestamp() });
      await addDoc(collection(db, "users", USER_ID, "stock_historial"), {
        ingredienteId: id,
        ingredienteNombre: ing.nombre,
        tipo: 'ajuste',
        cantidadAntes: ing.stockActual,
        cantidadDespues: newVal,
        diferencia: newVal - ing.stockActual,
        unidad: ing.unidad,
        fecha: serverTimestamp(),
      });
    } catch (e) {
      console.error("Error actualizando stock:", e);
      toast({ variant: "destructive", title: "Error al actualizar stock" });
    }
  };

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const filteredIngredients = React.useMemo(() => {
    return ingredientes.filter(item => {
      const matchesSearch = (item.nombre || "").toLowerCase().includes(search.toLowerCase());
      const isLow = item.stockActual <= (item.stockMinimo || 0);
      const isPlanned = plannedIngredientNames.has((item.nombre || "").toLowerCase().trim());
      return matchesSearch && (!showLowStockOnly || isLow) && (!showPlannedOnly || isPlanned);
    });
  }, [ingredientes, search, showLowStockOnly, showPlannedOnly, plannedIngredientNames]);

  const grouped = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredIngredients.forEach(item => {
      const cat = normalizeCategoria(item.categoria || "Otros");
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    // Sort within each category: with stock A-Z first, then without stock A-Z
    Object.keys(groups).forEach(cat => {
      groups[cat].sort((a, b) => {
        const aHas = (a.stockActual || 0) > 0 ? 0 : 1;
        const bHas = (b.stockActual || 0) > 0 ? 0 : 1;
        if (aHas !== bHas) return aHas - bHas;
        return (a.nombre || "").localeCompare(b.nombre || "", "es");
      });
    });
    return groups;
  }, [filteredIngredients]);

  if (!ingredientesCargadas && ingredientes.length === 0) {
    return (
      <div className="p-4 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-2xl" />
        ))}
      </div>
    );
  }

  const allSelected = selectedIds.size > 0 && selectedIds.size === filteredIngredients.length;

  return (
    <div className="flex flex-col gap-3 animate-in fade-in duration-500 pb-20">
      <header className="flex flex-col gap-2.5 sticky top-0 bg-background/95 backdrop-blur-md z-30 -mx-4 px-4 pb-2.5">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-black tracking-tight text-primary">
            {isSelectionMode ? `(${selectedIds.size})` : 'Despensa'}
          </h1>
          <div className="flex gap-2">
            {isSelectionMode ? (
              <Button size="icon" variant="ghost" onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }} className="rounded-full h-10 w-10 bg-primary text-white">
                <X className="h-5 w-5" />
              </Button>
            ) : (
              <>
                <StockFormDialog />
                <Button variant="ghost" size="icon" onClick={toggleExpandAll} className="h-10 w-10 rounded-full bg-primary-suave text-primary">
                  {expandedItems.length === categoriesInView.length ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-primary-suave text-primary">
                      <MoreVertical className="h-5 w-5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="rounded-2xl">
                    <DropdownMenuItem onClick={() => setIsSelectionMode(true)} className="gap-3 font-bold">
                      <Check className="h-4 w-4" /> Seleccionar
                    </DropdownMenuItem>
                    <StockHistorialDialog asMenuItem />
                    <CategoryManagerDialog asMenuItem />
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-3 font-bold text-accent focus:text-accent">
                          <RotateCcw className="h-4 w-4" /> Resetear mínimos a 0
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent className="rounded-[2rem]">
                        <AlertDialogHeader>
                          <AlertDialogTitle className="font-black text-primary">¿Poner todos los mínimos en 0?</AlertDialogTitle>
                          <AlertDialogDescription>Nada aparecerá automáticamente en la lista de compras salvo que lo planees.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter className="gap-2">
                          <AlertDialogCancel className="rounded-xl font-bold">Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="bg-accent text-white rounded-xl font-black" onClick={handleResetAllMinStock}>Sí, poner en 0</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </div>
        </div>

        {!isSelectionMode && (
          <>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por nombre..." className="pl-9 h-10 bg-white rounded-xl border-2 border-primary/5 font-bold text-sm" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Badge variant={showLowStockOnly ? "default" : "secondary"} className={cn("px-3 py-1 rounded-lg cursor-pointer font-black text-[9px] uppercase w-fit tracking-wider", showLowStockOnly ? "bg-destructive text-white" : "bg-destructive/10 text-destructive border-none")} onClick={() => setShowLowStockOnly(!showLowStockOnly)}>
                {showLowStockOnly ? "Viendo Stock Bajo" : "⚠️ Filtrar Stock Bajo"}
              </Badge>
              <Badge variant={showPlannedOnly ? "default" : "secondary"} className={cn("px-3 py-1 rounded-lg cursor-pointer font-black text-[9px] uppercase w-fit tracking-wider flex items-center gap-1", showPlannedOnly ? "bg-primary text-white" : "bg-primary/10 text-primary border-none")} onClick={() => setShowPlannedOnly(!showPlannedOnly)}>
                <CalendarDays className="h-3 w-3" />
                {showPlannedOnly ? "Viendo Planificado" : "Filtrar Planificado"}
              </Badge>
            </div>
          </>
        )}

        {isSelectionMode && (
          <div className="flex flex-wrap gap-2 py-1">
            <Button 
              variant="outline" 
              size="sm" 
              className="rounded-xl h-8 px-3 text-[10px] font-black uppercase"
              onClick={() => {
                if (allSelected) setSelectedIds(new Set());
                else setSelectedIds(new Set(filteredIngredients.map(i => i.id)));
              }}
            >
              {allSelected ? "Desmarcar todos" : "Seleccionar visibles"}
            </Button>
          </div>
        )}
      </header>

      {Object.keys(grouped).length > 0 ? (
        <Accordion 
          type="multiple" 
          value={expandedItems} 
          onValueChange={setExpandedItems}
          className="space-y-1.5"
        >
          {Object.keys(grouped).sort().map(category => (
            <AccordionItem key={category} value={category} className="border-none">
              <AccordionTrigger className="flex hover:no-underline bg-white px-4 py-2 rounded-2xl border border-border shadow-sm mb-0.5 transition-all">
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-primary" />
                  <span className="text-[11px] font-black uppercase text-primary tracking-tight">{category}</span>
                  <Badge variant="secondary" className="ml-auto bg-primary-suave text-primary border-none text-[9px] h-5 px-1.5">{grouped[category].length}</Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-0.5 space-y-1 px-1">
                {grouped[category].map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => isSelectionMode && toggleSelection(item.id)}
                    className={cn(
                      "bg-white py-2 px-3 rounded-xl border border-border/50 flex items-center justify-between gap-3 transition-all",
                      isSelectionMode && "active:scale-[0.98] cursor-pointer",
                      selectedIds.has(item.id) && "ring-2 ring-primary bg-primary/5 border-primary/20"
                    )}
                  >
                    {isSelectionMode && (
                      <div className={cn(
                        "h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
                        selectedIds.has(item.id) ? "bg-primary border-primary text-white" : "border-muted-foreground/30"
                      )}>
                        {selectedIds.has(item.id) && <Check className="h-3.5 w-3.5 stroke-[4]" />}
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate leading-tight">{item.nombre}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {item.stockMinimo > 0 && item.stockActual <= item.stockMinimo ? (
                          <span className="text-[8px] font-black text-destructive uppercase flex items-center gap-0.5">
                            <AlertCircle className="h-2.5 w-2.5" /> Bajo
                          </span>
                        ) : null}
                        <span className={cn("text-[9px] font-black tabular-nums", item.stockActual <= (item.stockMinimo || 0) && item.stockMinimo > 0 ? "text-destructive" : "text-primary")}>
                          {item.stockActual} {item.unidad}
                        </span>
                        {item.stockMinimo > 0 && (
                          <span className="text-[8px] font-bold text-muted-foreground">mín {item.stockMinimo}</span>
                        )}
                        {item.precioUnitario > 0 && (
                          <span className="text-[8px] font-bold text-muted-foreground opacity-60">
                            {formatPrecio(item.precioUnitario)}/{item.unidad}
                          </span>
                        )}
                      </div>
                    </div>

                    {!isSelectionMode && (
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        <StockFormDialog ingredientToEdit={item} />
                        <div className="flex items-center gap-0.5 bg-background p-0.5 rounded-xl border border-border/50">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-primary hover:bg-white active:scale-90 transition-transform" 
                            onClick={(e) => { e.stopPropagation(); updateStockDirect(item.id, item.stockActual - 1); }}
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </Button>
                          <div className="w-6 text-center font-black text-xs text-primary tabular-nums">
                            {item.stockActual}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-primary hover:bg-white active:scale-90 transition-transform" 
                            onClick={(e) => { e.stopPropagation(); updateStockDirect(item.id, item.stockActual + 1); }}
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <div className="py-20 text-center opacity-40">
          <Package className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-xs font-black uppercase">Sin resultados en la despensa</p>
        </div>
      )}

      <AnimatePresence>
        {isSelectionMode && selectedIds.size > 0 && (
          <motion.div 
            initial={{ y: 100, opacity: 0 }} 
            animate={{ y: 0, opacity: 1 }} 
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-20 left-4 right-4 z-[60] max-w-lg mx-auto"
          >
            <div className="bg-primary shadow-2xl rounded-3xl p-4 flex items-center justify-between border-2 border-white/20">
              <span className="text-white font-black text-sm">{selectedIds.size} seleccionados</span>
              <div className="flex gap-2">
                <BulkCategoryDialog 
                  selectedIds={Array.from(selectedIds)} 
                  onSuccess={() => {
                    setSelectedIds(new Set());
                    setIsSelectionMode(false);
                  }}
                />
                <Button 
                  variant="ghost" 
                  onClick={() => { setIsSelectionMode(false); setSelectedIds(new Set()); }}
                  className="bg-white/10 text-white rounded-2xl h-12 px-4 font-black uppercase text-[10px]"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}