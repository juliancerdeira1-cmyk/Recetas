"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Trash2, X, Camera, Image as ImageIcon, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { useFirestore, useDoc, useMemoFirebase } from "@/firebase"
import { doc, updateDoc, serverTimestamp } from "firebase/firestore"
import { compressImageToBase64 } from "@/lib/utils"
import { USER_ID } from "@/lib/constants"
import Image from "next/image"
import { errorEmitter } from "@/firebase/error-emitter"
import { FirestorePermissionError } from "@/firebase/errors"
import { normalizeIngredientName } from "@/lib/categorizeIngredient"

export function EditRecipeClient({ recipeId }: { recipeId: string }) {
  const router = useRouter()
  const db = useFirestore()

  const recipeRef = useMemoFirebase(() => {
    if (!db || !recipeId) return null
    return doc(db, "users", USER_ID, "recipes", recipeId)
  }, [db, recipeId])

  const { data: recipe, isLoading } = useDoc(recipeRef)
  const [formData, setFormData] = React.useState<any>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  
  const [imageFile, setImageFile] = React.useState<File | null>(null)
  const [imagePreview, setImagePreview] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (recipe && !formData) {
      setFormData({
        ...recipe,
        categorias: Array.isArray(recipe.categorias) ? recipe.categorias : (recipe.categoria ? [recipe.categoria] : ["Almuerzo"]),
        tags: recipe.tags || [],
        ingredientes: recipe.ingredientes || [],
        pasos: recipe.pasos || [],
        macros: recipe.macros || { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 }
      })
      setImagePreview(recipe.fotoURL || recipe.imageUrl || null)
    }
  }, [recipe, formData])

  React.useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            if (file.size > 5 * 1024 * 1024) {
              toast({ variant: "destructive", title: "Imagen muy pesada", description: "El límite es 5MB." });
              continue;
            }
            setImageFile(file);
            setImagePreview(URL.createObjectURL(file));
            toast({ title: "¡Imagen pegada! 📋", description: "Nueva imagen cargada desde el portapapeles." });
          }
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast({ variant: "destructive", title: "Imagen muy pesada", description: "Límite 5MB." })
        return
      }
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const handleSave = async () => {
    if (!formData.nombre || !db || !recipeId) {
      toast({ variant: "destructive", title: "Faltan datos", description: "El nombre es obligatorio." })
      return
    }

    setIsSaving(true)
    let finalFotoURL = formData.fotoURL || formData.imageUrl || null

    try {
      if (imageFile) {
        toast({ title: "Procesando imagen..." });
        try {
          finalFotoURL = await compressImageToBase64(imageFile);
        } catch (imgError) {
          console.error("Error procesando imagen:", imgError);
          toast({ variant: "destructive", title: "No se pudo procesar la imagen" });
        }
      }

      const ingredientesNormalizados = (formData.ingredientes || []).map((ing: any) => ({
        ...ing,
        nombre: normalizeIngredientName(ing.nombre)
      }));

      const { imageUrl, fotoURL, ...restFormData } = formData;

      const updatedData = {
        ...restFormData,
        ingredientes: ingredientesNormalizados,
        fotoURL: finalFotoURL,
        categoria: formData.categorias?.[0] || "Almuerzo",
        updatedAt: serverTimestamp(),
      }

      const docRef = doc(db, "users", USER_ID, "recipes", recipeId);
      
      await updateDoc(docRef, updatedData);

      toast({ title: "¡Receta actualizada!" })
      router.push(`/recetas/${recipeId}`)
    } catch (e) {
      console.error(e)
      toast({ variant: "destructive", title: "Error fatal", description: "No se pudo procesar el guardado." })
      setIsSaving(false)
    }
  }

  const addIngrediente = () => {
    const newIng = { nombre: "", cantidad: 1, unidad: "unidad", preparacion: "" }
    setFormData({ ...formData, ingredientes: [...(formData.ingredientes || []), newIng] })
  }

  const updateIngrediente = (idx: number, field: string, value: any) => {
    const newIngs = [...formData.ingredientes]
    newIngs[idx] = { ...newIngs[idx], [field]: value }
    setFormData({ ...formData, ingredientes: newIngs })
  }

  const removeIngrediente = (idx: number) => {
    setFormData({ ...formData, ingredientes: formData.ingredientes.filter((_: any, i: number) => i !== idx) })
  }

  const addPaso = () => {
    const newPaso = { 
      orden: (formData.pasos?.length || 0) + 1, 
      titulo: "", 
      descripcion: "", 
      timerSegundos: 0 
    }
    setFormData({ ...formData, pasos: [...(formData.pasos || []), newPaso] })
  }

  const updatePaso = (idx: number, field: string, value: any) => {
    const newPasos = [...formData.pasos]
    newPasos[idx] = { ...newPasos[idx], [field]: value }
    setFormData({ ...formData, pasos: newPasos })
  }

  const removePaso = (idx: number) => {
    setFormData({ ...formData, pasos: formData.pasos.filter((_: any, i: number) => i !== idx) })
  }

  if (isLoading || !formData) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Loader2 className="h-10 w-10 text-primary animate-spin" />
      <p className="font-black uppercase text-[10px] tracking-widest text-primary">Cargando editor de receta...</p>
    </div>
  )

  const CATEGORIES = ["Desayuno", "Almuerzo", "Cena", "Merienda", "Postre", "Snack"]

  return (
    <div className="flex flex-col min-h-screen bg-background animate-in fade-in duration-500 pb-24">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-xl font-black text-primary">Editar Receta</h1>
        </div>
        <Button 
          className="bg-primary text-white rounded-2xl h-10 px-6 font-black uppercase text-xs shadow-lg active:scale-95 transition-all"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
        </Button>
      </header>

      <div className="p-6 space-y-8 max-w-lg mx-auto w-full">
        <section className="space-y-4">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-2">Imagen del plato</label>
          <div 
            className="relative h-56 w-full rounded-[2.5rem] border-4 border-dashed border-primary/10 bg-primary-suave/30 overflow-hidden group cursor-pointer hover:border-primary/30 transition-all"
            onClick={() => document.getElementById('image-upload')?.click()}
          >
            {imagePreview ? (
              <Image src={imagePreview} alt="Preview" fill className="object-cover" unoptimized priority />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-primary/60">
                <ImageIcon className="h-12 w-12" />
                <span className="text-[10px] font-black uppercase tracking-widest">Cambiar o Pegar imagen</span>
              </div>
            )}
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <div className="bg-white/90 p-4 rounded-full shadow-xl">
                <ImageIcon className="text-primary h-8 w-8" />
              </div>
            </div>
            <input 
              id="image-upload" 
              type="file" 
              accept="image/*" 
              className="hidden" 
              onChange={handleImageChange} 
            />
          </div>
          <p className="text-[9px] font-black text-muted-foreground text-center uppercase tracking-[0.2em]">PNG, JPG · Máx 5MB · <span className="text-primary">Ctrl+V para pegar</span></p>
        </section>

        <section className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-2">Nombre del plato</label>
            <Input 
              placeholder="Ej: Pasta Boloñesa" 
              className="h-14 rounded-2xl border-2 font-bold text-lg focus-visible:ring-primary"
              value={formData.nombre}
              onChange={(e) => setFormData({...formData, nombre: e.target.value})}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-2">Descripción</label>
            <Textarea 
              placeholder="Contanos un poco sobre este plato..." 
              className="min-h-[100px] rounded-2xl border-2 font-medium focus-visible:ring-primary"
              value={formData.descripcion}
              onChange={(e) => setFormData({...formData, descripcion: e.target.value})}
            />
          </div>
        </section>

        <section className="space-y-3">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-2">Momentos del día</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => {
              const isSelected = (formData.categorias || []).includes(cat)
              return (
                <Badge 
                  key={cat} 
                  variant={isSelected ? "default" : "secondary"}
                  className={`px-4 py-2 rounded-full cursor-pointer font-bold transition-all ${isSelected ? "bg-primary text-white shadow-md" : "bg-primary-suave text-primary border-none"}`}
                  onClick={() => {
                    const current = formData.categorias || []
                    const next = isSelected ? current.filter((c: string) => c !== cat) : [...current, cat]
                    if (next.length > 0) setFormData({ ...formData, categorias: next })
                  }}
                >
                  {cat}
                </Badge>
              )
            })}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-primary tracking-widest">Ingredientes</h3>
            <Button variant="ghost" size="sm" className="text-primary font-black text-[10px] uppercase" onClick={addIngrediente}>
              <Plus className="h-3 w-3 mr-1" /> Agregar
            </Button>
          </div>
          <div className="space-y-3">
            {formData.ingredientes?.map((ing: any, i: number) => (
              <Card key={i} className="border-none shadow-sm bg-white rounded-2xl overflow-hidden border-2 border-primary/5">
                <CardContent className="p-3 grid grid-cols-12 gap-2">
                  <Input 
                    placeholder="Ingrediente" 
                    className="col-span-6 h-10 rounded-xl border-none bg-background/50 font-bold"
                    value={ing.nombre}
                    onChange={(e) => updateIngrediente(i, 'nombre', e.target.value)}
                  />
                  <Input 
                    type="number"
                    placeholder="Cant." 
                    className="col-span-3 h-10 rounded-xl border-none bg-background/50 font-bold"
                    value={ing.cantidad}
                    onChange={(e) => updateIngrediente(i, 'cantidad', Number(e.target.value))}
                  />
                  <Input 
                    placeholder="Unid." 
                    className="col-span-2 h-10 rounded-xl border-none bg-background/50 px-2 font-bold"
                    value={ing.unidad}
                    onChange={(e) => updateIngrediente(i, 'unidad', e.target.value)}
                  />
                  <Button variant="ghost" size="icon" className="col-span-1 h-10 w-10 text-destructive hover:bg-destructive/10" onClick={() => removeIngrediente(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-primary tracking-widest">Preparación</h3>
            <Button variant="ghost" size="sm" className="text-primary font-black text-[10px] uppercase" onClick={addPaso}>
              <Plus className="h-3 w-3 mr-1" /> Agregar Paso
            </Button>
          </div>
          <div className="space-y-4">
            {formData.pasos?.map((paso: any, i: number) => (
              <Card key={i} className="rounded-3xl border-2 border-border/50 overflow-hidden">
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center border-b pb-2">
                    <span className="text-[10px] font-black uppercase text-primary tracking-widest">Paso {i + 1}</span>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" onClick={() => removePaso(i)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <Input 
                    placeholder="Título del paso (opcional)" 
                    className="h-10 border-none font-bold p-0 focus-visible:ring-0 text-primary"
                    value={paso.titulo}
                    onChange={(e) => updatePaso(i, 'titulo', e.target.value)}
                  />
                  <Textarea 
                    placeholder="Explicación detallada de qué hacer..." 
                    className="min-h-[80px] border-none p-0 focus-visible:ring-0 text-sm font-medium leading-relaxed"
                    value={paso.descripcion}
                    onChange={(e) => updatePaso(i, 'descripcion', e.target.value)}
                  />
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t border-border z-50 safe-area-pb max-w-lg mx-auto">
        <Button 
          className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? "Guardando cambios..." : "Actualizar Receta"}
        </Button>
      </div>
    </div>
  )
}
