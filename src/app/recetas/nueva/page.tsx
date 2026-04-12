"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plus, Trash2, X, Image as ImageIcon, Loader2, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { toast } from "@/hooks/use-toast"
import { useFirestore } from "@/firebase"
import { collection, addDoc, serverTimestamp } from "firebase/firestore"
import { compressImageToBase64 } from "@/lib/utils"
import { USER_ID } from "@/lib/constants"
import Image from "next/image"
import { normalizeIngredientName, categorizeIngredient } from "@/lib/categorizeIngredient"

const CATEGORIES = ["Desayuno", "Almuerzo", "Cena", "Merienda", "Postre", "Snack"]
const UNITS = ["g", "kg", "ml", "l", "unidad", "taza", "cdta", "cda"]

export default function NewRecipePage() {
  const router = useRouter()
  const db = useFirestore()

  const [formData, setFormData] = React.useState<any>({
    nombre: "",
    descripcion: "",
    categoria: "Almuerzo",
    categorias: ["Almuerzo"],
    porciones: 3,
    tiempoPreparacion: 15,
    tiempoCoccion: 30,
    dificultad: "Media",
    utensilios: [],
    tips: [],
    tags: [],
    macros: { calorias: 0, proteinas: 0, carbohidratos: 0, grasas: 0 },
    ingredientes: [],
    pasos: []
  })

  const [imageFile, setImageFile] = React.useState<File | null>(null)
  const [imagePreview, setImagePreview] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [newTag, setNewTag] = React.useState("")
  const [newUtensil, setNewUtensil] = React.useState("")
  const [newTip, setNewTip] = React.useState("")

  const handleSave = async () => {
    if (!formData.nombre.trim() || !db) {
      toast({ variant: "destructive", title: "Faltan datos", description: "El nombre es obligatorio." })
      return
    }

    setIsSaving(true)
    let finalFotoURL = null

    try {
      if (imageFile) {
        toast({ title: "Procesando imagen..." })
        finalFotoURL = await compressImageToBase64(imageFile)
      }

      const ingredientesNormalizados = (formData.ingredientes || []).map((ing: any) => ({
        ...ing,
        nombre: normalizeIngredientName(ing.nombre),
        categoria: categorizeIngredient(ing.nombre)
      }))

      const recipeData = {
        ...formData,
        ingredientes: ingredientesNormalizados,
        userId: USER_ID,
        fotoURL: finalFotoURL,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      await addDoc(collection(db, "users", USER_ID, "recipes"), recipeData)
      toast({ title: "¡Receta creada! 🎉" })
      router.push("/recetas")
    } catch (e: any) {
      console.error("Error guardando receta:", e)
      toast({ variant: "destructive", title: "Error al guardar", description: e?.message || "Revisá tu conexión e intentá de nuevo." })
      setIsSaving(false)
    }
  }

  const addUtensil = () => {
    if (newUtensil.trim()) {
      setFormData({ ...formData, utensilios: [...formData.utensilios, newUtensil.trim()] })
      setNewUtensil("")
    }
  }

  const addTip = () => {
    if (newTip.trim()) {
      setFormData({ ...formData, tips: [...formData.tips, newTip.trim()] })
      setNewTip("")
    }
  }

  const addTag = () => {
    const tag = newTag.trim().toLowerCase()
    if (tag && !formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] })
      setNewTag("")
    }
  }

  const addIngrediente = () => {
    setFormData({
      ...formData,
      ingredientes: [...formData.ingredientes, { nombre: "", cantidad: 1, unidad: "unidad", preparacion: "" }]
    })
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
    setFormData({
      ...formData,
      pasos: [...formData.pasos, { orden: formData.pasos.length + 1, titulo: "", descripcion: "", timerSegundos: 0 }]
    })
  }

  const updatePaso = (idx: number, field: string, value: any) => {
    const newPasos = [...formData.pasos]
    newPasos[idx] = { ...newPasos[idx], [field]: value }
    setFormData({ ...formData, pasos: newPasos })
  }

  const removePaso = (idx: number) => {
    setFormData({ ...formData, pasos: formData.pasos.filter((_: any, i: number) => i !== idx) })
  }

  return (
    <div className="flex flex-col min-h-screen bg-background pb-32">
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="rounded-full">
            <ArrowLeft className="h-6 w-6" />
          </Button>
          <h1 className="text-xl font-black text-primary">Nueva Receta</h1>
        </div>
        <Button onClick={handleSave} disabled={isSaving} className="rounded-2xl px-6 uppercase text-xs font-black">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
        </Button>
      </header>

      <div className="p-6 space-y-8 max-w-lg mx-auto w-full">

        {/* Foto */}
        <section className="space-y-4">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-2">Foto del plato</label>
          <div
            className="relative h-56 w-full rounded-[2.5rem] border-4 border-dashed border-primary/10 bg-primary-suave/30 overflow-hidden cursor-pointer hover:border-primary/30 transition-all"
            onClick={() => document.getElementById('image-upload-nueva')?.click()}
          >
            {imagePreview ? (
              <Image src={imagePreview} alt="Preview" fill className="object-cover" unoptimized priority />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2 text-primary/60">
                <ImageIcon className="h-12 w-12" />
                <span className="text-[10px] font-black uppercase tracking-widest">Toca para cargar foto</span>
              </div>
            )}
            <input id="image-upload-nueva" type="file" accept="image/*" className="hidden" onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) { setImageFile(file); setImagePreview(URL.createObjectURL(file)) }
            }} />
          </div>
        </section>

        {/* Nombre y descripción */}
        <section className="space-y-4">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-2">Nombre del plato</label>
          <Input
            placeholder="Ej: Pasta Boloñesa"
            className="h-14 rounded-2xl border-2 font-bold text-lg"
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
          />
          <Textarea
            placeholder="Descripción breve (opcional)..."
            className="rounded-2xl border-2 min-h-[80px] font-medium"
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
          />
        </section>

        {/* Categoría */}
        <section className="space-y-3">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-2">Momento del día</label>
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
                    if (next.length > 0) setFormData({ ...formData, categorias: next, categoria: next[0] })
                  }}
                >
                  {cat}
                </Badge>
              )
            })}
          </div>
        </section>

        {/* Tiempos y porciones */}
        <section className="space-y-3">
          <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest px-2">Tiempos y porciones</label>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-muted-foreground uppercase px-1">Prep (min)</span>
              <Input type="number" className="h-12 rounded-xl border-2 font-bold" value={formData.tiempoPreparacion}
                onChange={(e) => setFormData({ ...formData, tiempoPreparacion: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-muted-foreground uppercase px-1">Cocción (min)</span>
              <Input type="number" className="h-12 rounded-xl border-2 font-bold" value={formData.tiempoCoccion}
                onChange={(e) => setFormData({ ...formData, tiempoCoccion: Number(e.target.value) })} />
            </div>
            <div className="space-y-1.5">
              <span className="text-[9px] font-black text-muted-foreground uppercase px-1">Porciones</span>
              <Input type="number" className="h-12 rounded-xl border-2 font-bold" value={formData.porciones}
                onChange={(e) => setFormData({ ...formData, porciones: Number(e.target.value) })} />
            </div>
          </div>
        </section>

        {/* Ingredientes */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-primary tracking-widest">Ingredientes</h3>
            <Button variant="ghost" size="sm" className="text-primary font-black text-[10px] uppercase" onClick={addIngrediente}>
              <Plus className="h-3 w-3 mr-1" /> Agregar
            </Button>
          </div>
          {formData.ingredientes.length === 0 && (
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest text-center py-4 border-2 border-dashed border-primary/10 rounded-2xl">
              Todavía no agregaste ingredientes
            </p>
          )}
          <div className="space-y-3">
            {formData.ingredientes.map((ing: any, i: number) => (
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

        {/* Pasos de preparación */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black uppercase text-primary tracking-widest">Preparación</h3>
            <Button variant="ghost" size="sm" className="text-primary font-black text-[10px] uppercase" onClick={addPaso}>
              <Plus className="h-3 w-3 mr-1" /> Agregar Paso
            </Button>
          </div>
          {formData.pasos.length === 0 && (
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest text-center py-4 border-2 border-dashed border-primary/10 rounded-2xl">
              Todavía no agregaste pasos
            </p>
          )}
          <div className="space-y-4">
            {formData.pasos.map((paso: any, i: number) => (
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

        {/* Utensilios */}
        <section className="space-y-4">
          <h3 className="text-sm font-black uppercase text-primary tracking-widest">Utensilios</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Ej: Sartén grande"
              className="rounded-xl"
              value={newUtensil}
              onChange={(e) => setNewUtensil(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addUtensil()}
            />
            <Button size="icon" onClick={addUtensil} className="rounded-xl"><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.utensilios.map((u: string, i: number) => (
              <Badge key={i} variant="secondary" className="bg-primary-suave text-primary border-none gap-2 px-3 py-1.5 rounded-xl font-bold">
                <Wrench className="h-3 w-3" /> {u}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setFormData({ ...formData, utensilios: formData.utensilios.filter((_: any, idx: number) => i !== idx) })} />
              </Badge>
            ))}
          </div>
        </section>

        {/* Tips */}
        <section className="space-y-4">
          <h3 className="text-sm font-black uppercase text-primary tracking-widest">Tips del Chef</h3>
          <div className="flex gap-2">
            <Textarea
              placeholder="Consejo de preparación..."
              className="rounded-xl min-h-[60px]"
              value={newTip}
              onChange={(e) => setNewTip(e.target.value)}
            />
            <Button size="icon" onClick={addTip} className="rounded-xl h-auto shrink-0"><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-2">
            {formData.tips.map((t: string, i: number) => (
              <div key={i} className="bg-accent/5 p-3 rounded-2xl border border-accent/10 flex justify-between gap-3">
                <p className="text-xs font-medium italic">{t}</p>
                <X className="h-4 w-4 text-destructive cursor-pointer shrink-0" onClick={() => setFormData({ ...formData, tips: formData.tips.filter((_: any, idx: number) => i !== idx) })} />
              </div>
            ))}
          </div>
        </section>

        {/* Tags */}
        <section className="space-y-4">
          <h3 className="text-sm font-black uppercase text-primary tracking-widest">Tags</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Ej: vegano, rápido..."
              className="rounded-xl"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTag()}
            />
            <Button size="icon" onClick={addTag} className="rounded-xl"><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {formData.tags.map((t: string, i: number) => (
              <Badge key={i} className="bg-muted text-muted-foreground border-none gap-2 px-3 py-1.5 rounded-xl font-bold text-[10px] uppercase">
                #{t}
                <X className="h-3 w-3 cursor-pointer" onClick={() => setFormData({ ...formData, tags: formData.tags.filter((_: any, idx: number) => i !== idx) })} />
              </Badge>
            ))}
          </div>
        </section>

      </div>

      {/* Botón flotante guardar */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/95 backdrop-blur-md border-t z-50 max-w-lg mx-auto">
        <Button
          className="w-full h-14 rounded-2xl bg-primary text-white font-black uppercase tracking-[0.2em] shadow-lg active:scale-95 transition-all"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Guardando...</> : "Guardar Receta"}
        </Button>
      </div>
    </div>
  )
}
