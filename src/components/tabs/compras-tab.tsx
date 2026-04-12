'use client';

import * as React from 'react';
import { Package, ArrowUpCircle, DollarSign, AlertTriangle, RefreshCcw, Tag, ChevronDown, ChevronUp, Plus, ShoppingCart, MoreVertical, Trash2, CheckSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import { SwipeToDelete } from "@/components/ui/swipe-to-delete";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { useFirestore } from "@/firebase";
import { doc, updateDoc, writeBatch, serverTimestamp, getDoc, collection, deleteDoc, addDoc, getDocs, query, where } from "firebase/firestore";
import { useAppStore } from '@/store/app-store';
import { USER_ID } from '@/lib/constants';
import { format } from 'date-fns';
import { cn, formatPrecio, convertirCantidad } from '@/lib/utils';
import { StockFormDialog } from '@/components/stock/stock-form-dialog';
import { AddShoppingItemDialog } from '@/components/shopping/add-shopping-item-dialog';
import { syncShoppingList } from '@/lib/sync-logic';

export function ComprasTab() {
  const db = useFirestore();
  const { listaCompras, listaComprasCargada, optimisticToggleCompra, activeProfile } = useAppStore();
  const [isUpdatingStock, setIsUpdatingStock] = React.useState(false);
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [expandedItems, setExpandedItems] = React.useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const hasSyncedRef = React.useRef(false);

  const manualItems = React.useMemo(
    () => listaCompras.filter(i => i.source === "manual" || i.reason === "Manual"),
    [listaCompras]
  );

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  // Auto-sync al montar en modo Plan para limpiar ítems obsoletos
  React.useEffect(() => {
    if (!db || hasSyncedRef.current) return;
    hasSyncedRef.current = true;
    setIsSyncing(true);
    syncShoppingList(db, activeProfile)
      .catch(() => {})
      .finally(() => setIsSyncing(false));
  }, [db]);

  // Mostrar todos los ítems juntos (plan + manuales)
  const filteredItems = listaCompras;

  const groupedItems = React.useMemo(() => {
    const groups: Record<string, any[]> = {};
    filteredItems.forEach(item => {
      const cat = (item.categoria || "Otros").toUpperCase();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [filteredItems]);

  const categories = React.useMemo(() => Object.keys(groupedItems).sort(), [groupedItems]);

  const toggleExpandAll = () => {
    if (expandedItems.length === categories.length) {
      setExpandedItems([]);
    } else {
      setExpandedItems(categories);
    }
  };

  const totalEstimado = React.useMemo(() => {
    return filteredItems
      .filter(i => !i.isPurchased)
      .reduce((sum, item) => sum + (item.subtotal || 0), 0);
  }, [filteredItems]);

  const itemsSinPrecio = React.useMemo(() => {
    return filteredItems.filter(i => !i.isPurchased && (!i.precioUnitario || i.precioUnitario === 0)).length;
  }, [filteredItems]);

  const handleSync = async () => {
    if (!db) return;
    setIsSyncing(true);
    try {
      await syncShoppingList(db, activeProfile);
      toast({ title: "Sincronizado con el plan ✓" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al sincronizar" });
    } finally {
      setIsSyncing(false);
    }
  };

  // Limpieza forzada: borra todos los ítems del plan directo en Firestore y luego resincroniza
  const handleForceClear = async () => {
    if (!db) return;
    setIsSyncing(true);
    try {
      const snap = await getDocs(query(
        collection(db, "users", USER_ID, "shopping_list_items"),
        where("source", "==", "plan")
      ));
      if (snap.empty) {
        toast({ title: "La lista del plan ya está vacía" });
        return;
      }
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
      await syncShoppingList(db, activeProfile);
      toast({ title: `${snap.size} ítem(s) eliminados ✓` });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al limpiar" });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateStock = async () => {
    if (!db) return;
    const purchased = listaCompras.filter(i => i.isPurchased);
    if (purchased.length === 0) return;

    setIsUpdatingStock(true);
    try {
      const batch = writeBatch(db);
      let realTotalSpent = 0;
      const itemsCompradosDetalle: any[] = [];

      for (const item of purchased) {
        if (item.ingredienteId) {
          const ingRef = doc(db, "users", USER_ID, "ingredients", item.ingredienteId);
          const snap = await getDoc(ingRef);
          if (snap.exists()) {
            const data = snap.data();
            const current = Number(data.stockActual) || 0;
            const cantASumar = convertirCantidad(Number(item.cantidad), item.unidad, data.unidad);
            const newStock = current + cantASumar;
            batch.update(ingRef, { stockActual: newStock, updatedAt: serverTimestamp() });
            await addDoc(collection(db, "users", USER_ID, "stock_historial"), {
              ingredienteId: item.ingredienteId,
              ingredienteNombre: item.nombre,
              tipo: 'compra',
              cantidadAntes: current,
              cantidadDespues: newStock,
              diferencia: cantASumar,
              unidad: data.unidad,
              fecha: serverTimestamp(),
            });
          }
        }

        realTotalSpent += (item.subtotal || 0);
        itemsCompradosDetalle.push({
          nombre: item.nombre,
          cantidad: item.cantidad,
          unidad: item.unidad,
          precioUnitario: item.precioUnitario || 0,
          subtotal: item.subtotal || 0
        });

        batch.delete(doc(db, "users", USER_ID, "shopping_list_items", item.id));
      }

      const weekId = format(new Date(), "yyyy-'W'ww");
      const historyRef = doc(db, "users", USER_ID, "historial_compras", weekId);
      const historySnap = await getDoc(historyRef);

      if (historySnap.exists()) {
        const existingData = historySnap.data();
        batch.update(historyRef, {
          totalGastado: (existingData.totalGastado || 0) + realTotalSpent,
          itemsComprados: [...(existingData.itemsComprados || []), ...itemsCompradosDetalle],
          updatedAt: serverTimestamp()
        });
      } else {
        batch.set(historyRef, {
          semana: weekId,
          totalGastado: realTotalSpent,
          itemsComprados: itemsCompradosDetalle,
          creadoEn: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }

      await batch.commit();
      await syncShoppingList(db, activeProfile);
      toast({ title: "Stock actualizado ✓" });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al actualizar stock" });
    } finally {
      setIsUpdatingStock(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!db) return;
    try {
      await deleteDoc(doc(db, "users", USER_ID, "shopping_list_items", id));
    } catch (e) {
      toast({ variant: "destructive", title: "Error al borrar" });
    }
  };

  const handleDeleteAllManual = async () => {
    if (!db) return;
    if (manualItems.length === 0) {
      toast({ title: "No hay ítems manuales" });
      return;
    }
    try {
      const batch = writeBatch(db);
      manualItems.forEach(i => batch.delete(doc(db, "users", USER_ID, "shopping_list_items", i.id)));
      await batch.commit();
      toast({ title: `${manualItems.length} ítem(s) manuales eliminados ✓` });
    } catch (e) {
      toast({ variant: "destructive", title: "Error al borrar manuales" });
    }
  };

  const handleDeleteSelected = async () => {
    if (!db || selectedIds.size === 0) return;
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => batch.delete(doc(db, "users", USER_ID, "shopping_list_items", id)));
      await batch.commit();
      toast({ title: `${selectedIds.size} ítem(s) eliminados ✓` });
      exitSelectionMode();
    } catch (e) {
      toast({ variant: "destructive", title: "Error al borrar seleccionados" });
    }
  };

  const toggleItem = async (id: string, current: boolean) => {
    if (!db) return;
    optimisticToggleCompra(id);
    try {
      await updateDoc(doc(db, "users", USER_ID, "shopping_list_items", id), {
        isPurchased: !current,
        purchasedAt: !current ? serverTimestamp() : null
      });
    } catch {
      optimisticToggleCompra(id);
      toast({ variant: "destructive", title: "Error al marcar ítem" });
    }
  };

  if (!listaComprasCargada && listaCompras.length === 0) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-3xl" />
        ))}
      </div>
    );
  }

  const purchasedCount = listaCompras.filter(i => i.isPurchased).length;
  const totalCount = listaCompras.length;

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500 pb-20">
      <header className="flex items-center justify-between">
        {isSelectionMode ? (
          <>
            <div>
              <h1 className="text-xl font-black text-primary leading-tight">
                {selectedIds.size === 0 ? "Seleccionar" : `${selectedIds.size} seleccionado${selectedIds.size !== 1 ? "s" : ""}`}
              </h1>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">
                {manualItems.length} ítems manuales
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (selectedIds.size === manualItems.length) {
                    setSelectedIds(new Set());
                  } else {
                    setSelectedIds(new Set(manualItems.map(i => i.id)));
                  }
                }}
                className="h-9 rounded-2xl text-[10px] font-black uppercase px-3 bg-primary-suave text-primary"
              >
                {selectedIds.size === manualItems.length ? "Desmarcar" : "Todos"}
              </Button>
              <Button
                onClick={handleDeleteSelected}
                disabled={selectedIds.size === 0}
                className="h-9 rounded-2xl text-[10px] font-black uppercase px-3 bg-destructive text-white gap-1.5"
              >
                <Trash2 className="h-3.5 w-3.5" /> Eliminar
              </Button>
              <Button variant="ghost" size="icon" onClick={exitSelectionMode} className="h-9 w-9 rounded-full bg-primary-suave text-primary">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <>
            <div>
              <h1 className="text-3xl font-black text-primary leading-tight">Compras</h1>
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mt-0.5">
                {purchasedCount} de {totalCount} en el carrito
              </p>
            </div>
            <div className="flex gap-2 items-center">
              <AddShoppingItemDialog>
                <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-primary text-white shadow-md">
                  <Plus className="h-6 w-6" />
                </Button>
              </AddShoppingItemDialog>

              <Button
                onClick={handleUpdateStock}
                disabled={!listaCompras.some(i => i.isPurchased) || isUpdatingStock}
                className="bg-primary text-white rounded-2xl h-10 font-black uppercase text-[10px] px-4 gap-2"
              >
                <ArrowUpCircle className="h-4 w-4" />
                {isUpdatingStock ? "..." : "Terminar"}
              </Button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10 rounded-full bg-primary-suave text-primary">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-2xl">
                  <DropdownMenuItem onClick={toggleExpandAll} className="gap-3 font-bold">
                    {expandedItems.length === categories.length ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    {expandedItems.length === categories.length ? "Contraer todo" : "Expandir todo"}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleSync} disabled={isSyncing} className="gap-3 font-bold">
                    <RefreshCcw className={cn("h-4 w-4", isSyncing && "animate-spin")} /> Sincronizar plan
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => { setIsSelectionMode(true); setExpandedItems(categories); }}
                    disabled={manualItems.length === 0}
                    className="gap-3 font-bold"
                  >
                    <CheckSquare className="h-4 w-4" /> Seleccionar manuales
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteAllManual} className="gap-3 font-bold text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4" /> Borrar todos manuales
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </>
        )}
      </header>

      {filteredItems.length > 0 && (
        <Card className="border-none shadow-sm bg-primary-suave/50 rounded-3xl overflow-hidden border-2 border-primary/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="space-y-0.5">
              <p className="text-2xl font-black text-primary leading-none">{formatPrecio(totalEstimado)} <span className="text-[10px] font-bold opacity-60 uppercase">Estimado</span></p>
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-black text-muted-foreground uppercase">{filteredItems.filter(i => !i.isPurchased).length} ítems pendientes</span>
                {itemsSinPrecio > 0 && (
                  <div className="flex items-center gap-1 text-accent font-black text-[9px] uppercase">
                    <AlertTriangle className="h-3 w-3" /> {itemsSinPrecio} sin precio
                  </div>
                )}
              </div>
            </div>
            <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center shadow-sm">
              <DollarSign className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
      )}

      {filteredItems.length > 0 ? (
        <Accordion
          type="multiple"
          value={expandedItems}
          onValueChange={setExpandedItems}
          className="space-y-2"
        >
          {categories.map((category) => (
            <AccordionItem key={category} value={category} className="border-none">
              <AccordionTrigger className="flex hover:no-underline bg-white px-4 py-2 rounded-2xl border border-border shadow-sm mb-1 transition-all">
                <div className="flex items-center gap-3">
                  <Package className="h-4 w-4 text-primary" />
                  <div className="flex flex-col items-start">
                    <span className="text-xs font-black uppercase text-primary tracking-tight">{category}</span>
                    <span className="text-[8px] font-black text-muted-foreground uppercase">{groupedItems[category].length} productos</span>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pt-0 space-y-0.5 px-0 bg-background/50 rounded-b-2xl overflow-hidden border-x border-b">
                {groupedItems[category].map((item) => {
                  const isManual = item.source === "manual" || item.reason === "Manual";
                  const isSelected = selectedIds.has(item.id);
                  const row = (
                    <div
                      className={cn(
                        "p-3 px-4 flex items-center gap-4 bg-white border-b border-border/50 group transition-colors",
                        isSelectionMode && isManual && isSelected && "bg-accent/5"
                      )}
                      onClick={isSelectionMode && isManual ? () => toggleSelection(item.id) : undefined}
                    >
                      {isSelectionMode && isManual ? (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelection(item.id)}
                          className="h-6 w-6 rounded-lg border-2"
                        />
                      ) : (
                        <Checkbox
                          checked={item.isPurchased}
                          onCheckedChange={() => !isSelectionMode && toggleItem(item.id, item.isPurchased)}
                          disabled={isSelectionMode}
                          className={cn("h-6 w-6 rounded-lg border-2", isSelectionMode && !isManual && "opacity-30")}
                        />
                      )}
                      <div className={cn("flex-1 min-w-0 flex items-center justify-between gap-3", isSelectionMode && !isManual && "opacity-40")}>
                        <div className="flex flex-col min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`font-bold text-sm truncate ${item.isPurchased ? 'line-through text-muted-foreground' : ''}`}>
                              {item.nombre}
                            </span>
                            {isManual && (
                              <span className="text-[8px] font-black bg-accent/10 text-accent border border-accent/20 px-1.5 py-0.5 rounded-md uppercase shrink-0">Manual</span>
                            )}
                            {!item.isPurchased && !isSelectionMode && (
                              <StockFormDialog
                                ingredientToEdit={{
                                  id: item.ingredienteId,
                                  nombre: item.nombre,
                                  categoria: item.categoria,
                                  unidad: item.unidad,
                                  precioUnitario: item.precioUnitario
                                }}
                                trigger={
                                  <button className="p-1.5 rounded-lg bg-primary-suave text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Tag className="h-3.5 w-3.5" />
                                  </button>
                                }
                              />
                            )}
                          </div>
                          <span className="text-[9px] font-black text-muted-foreground uppercase">
                            {item.cantidad.toLocaleString('es-ES', { maximumFractionDigits: 2 })} {item.unidad}
                          </span>
                          {item.justificacion && !item.isPurchased && item.source === "plan" && (
                            <span className="text-[8px] font-bold text-primary/60 mt-0.5 truncate">
                              {item.justificacion === "Stock mínimo"
                                ? "⚠ Stock mínimo configurado"
                                : `Receta: ${item.justificacion}`}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            {item.precioUnitario > 0 ? (
                              <p className="text-xs font-black text-primary">{formatPrecio(item.subtotal)}</p>
                            ) : (
                              <p className="text-[9px] font-bold text-muted-foreground opacity-40">$ —</p>
                            )}
                          </div>
                          {isManual && !isSelectionMode && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDeleteItem(item.id); }}
                              className="p-1.5 rounded-lg text-destructive/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                  return isSelectionMode ? (
                    <div key={item.id}>{row}</div>
                  ) : (
                    <SwipeToDelete key={item.id} onDelete={() => handleDeleteItem(item.id)}>
                      {row}
                    </SwipeToDelete>
                  );
                })}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      ) : (
        <div className="py-24 text-center space-y-4">
          <div className="bg-primary-suave w-24 h-24 rounded-full flex items-center justify-center mx-auto">
            <ShoppingCart className="h-12 w-12 text-primary" />
          </div>
          <h2 className="text-2xl font-black text-primary">Lista vacía</h2>
          <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">
            Sincronizá el plan o agregá productos manualmente.
          </p>
          <Button onClick={handleSync} disabled={isSyncing} className="bg-primary text-white rounded-2xl gap-2">
            <RefreshCcw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
            Sincronizar ahora
          </Button>
        </div>
      )}
    </div>
  );
}
