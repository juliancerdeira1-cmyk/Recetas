"use client"

import * as React from "react"
import { Download, AlertCircle, CheckCircle2, Copy } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { useFirestore } from "@/firebase"
import { collection, addDoc, serverTimestamp, getDocs } from "firebase/firestore"
import { useRouter } from "next/navigation"
import { USER_ID } from "@/lib/constants"
import { categorizeIngredient, normalizeIngredientName } from "@/lib/categorizeIngredient"

const PROMPT_TEMPLATE = `Generame recetas en formato JSON. Una sola receta = objeto {}. Varias = array [{}, {}].

REGLAS ESTRICTAS — seguir sin excepción:

━━━ NOMBRE ━━━
- Nombre del plato tal cual se conoce. Sin marcas comerciales.

━━━ DESCRIPCIÓN ━━━
- 2-3 oraciones: sabor, textura, ocasión ideal y origen del plato.

━━━ HISTORIA ━━━
- 1-2 oraciones sobre el origen cultural o anécdota del plato. Si no tiene historia conocida, inventar un dato curioso relacionado con el ingrediente principal.

━━━ MOMENTOS (categorias) ━━━
- Array con uno o varios de estos valores EXACTOS:
  "Desayuno" | "Almuerzo" | "Cena" | "Merienda" | "Postre" | "Snack"

━━━ PORCIONES ━━━
- Número entero entre 2 y 6. Representa porciones para adultos.

━━━ DIFICULTAD ━━━
- "Fácil": menos de 30 min total, sin técnica especial.
- "Media": 30-60 min total o requiere alguna técnica (ej: punto de caramelo, corte juliana).
- "Difícil": más de 60 min o técnicas avanzadas (ej: masa hojaldrada, temperado de chocolate).

━━━ TIEMPOS ━━━
- tiempoPreparacion: minutos de trabajo activo (picar, mezclar, armar).
- tiempoCoccion: minutos de cocción pasiva (horno, hervor, reposo en heladera).
- Ambos son números enteros.

━━━ INGREDIENTES ━━━
- Listar SOLO ingredientes crudos tal como se compran en el supermercado.
- NUNCA poner subpreparaciones ("sofrito", "salsa", "caldo casero"). Descomponer en ingredientes base.
- PROHIBIDO: "c/n", "a gusto", "pizca", "un poco", "al gusto". TODO debe tener cantidad numérica exacta.
- "nombre": sustantivo genérico en singular y minúsculas (ej: "cebolla", "pechuga de pollo", "sal fina"). NUNCA incluir cantidad, tamaño o marca en el nombre.
- "cantidad": número > 0. Puede ser decimal (ej: 0.5).
- "unidad": OBLIGATORIO usar una de estas EXACTAS: "g" | "kg" | "ml" | "l" | "unidad" | "cucharada" | "cucharadita" | "taza" | "docena"
- "preparacion": cómo preparar el ingrediente antes de usarlo (ej: "picada en cubos", "rallado", "en juliana", "a temperatura ambiente"). Dejar "" si se usa tal cual.
- "categoria": EXACTAMENTE una de:
  "Lácteos y Huevos" | "Carnes y Aves" | "Pescados y Mariscos" | "Frutas y Verduras" | "Almacén" | "Especias y Condimentos" | "Bebidas" | "Otros"

━━━ UTENSILIOS ━━━
- Inferir de las técnicas usadas en los pasos. Incluir todos los necesarios.
- Ejemplos: "Sartén antiadherente", "Cuchillo de chef", "Tabla de picar", "Horno", "Batidora eléctrica".

━━━ PASOS ━━━
- Cada paso debe ser ejecutable por alguien que nunca cocinó. Ser explícito con temperaturas, tiempos y señales visuales ("hasta que dore", "cuando burbujee").
- Mínimo de pasos según dificultad: Fácil = 3, Media = 5, Difícil = 7. No agrupar acciones distintas en un solo paso.
- "orden": número secuencial empezando en 1.
- "titulo": resumen corto de la acción (ej: "Preparar la masa", "Sellar la carne").
- "descripcion": instrucción detallada. Mencionar utensilios, fuego (bajo/medio/alto), y qué resultado esperar.
- "timerSegundos": EN SEGUNDOS. Ej: 5 minutos = 300, 1 hora = 3600. Usar null si el paso es acción activa sin espera.

━━━ TIPS DEL CHEF ━━━
- 2-4 consejos prácticos: sustituciones, cómo potenciar sabor, métodos de conservación, errores comunes a evitar.

━━━ MACROS (por porción individual) ━━━
- Calcular con precisión nutricional real considerando las cantidades EXACTAS de todos los ingredientes (incluido aceite, manteca, sal).
- Dividir el total entre el número de porciones.
- calorias: kcal | proteinas: g | carbohidratos: g | grasas: g | fibra: g | azucar: g | sodio: mg
- pesoPorPorcion: peso aproximado en gramos de una porción servida (suma del peso cocido total dividido porciones). Número entero.
- Todos los valores son números, no strings.

━━━ TAGS ━━━
- 6 a 12 tags en minúsculas y sin tildes.
- Ejemplos: "rapido", "alto-en-proteina", "sin-gluten", "vegetariano", "italiana", "horno", "comfort-food", "meal-prep", "economico", "para-ninos", "picante", "sin-lactosa"

━━━ FORMATO DE SALIDA (RFC 8259) ━━━
- SOLO JSON válido. Sin markdown, sin texto fuera del JSON, sin backticks.

{
  "nombre": "",
  "descripcion": "",
  "historia": "",
  "categorias": ["Almuerzo"],
  "porciones": 4,
  "tiempoPreparacion": 0,
  "tiempoCoccion": 0,
  "dificultad": "Fácil|Media|Difícil",
  "ingredientes": [
    {"nombre": "", "cantidad": 0, "unidad": "g", "preparacion": "", "categoria": ""}
  ],
  "utensilios": [""],
  "pasos": [
    {"orden": 1, "titulo": "", "descripcion": "", "timerSegundos": null}
  ],
  "tips": [""],
  "macros": {"calorias": 0, "proteinas": 0, "carbohidratos": 0, "grasas": 0, "fibra": 0, "azucar": 0, "sodio": 0, "pesoPorPorcion": 0},
  "tags": [""]
}`

export function RecipeImportModal({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const db = useFirestore()
  const [jsonText, setJsonText] = React.useState("")
  const [isValid, setIsValid] = React.useState<boolean | null>(null)
  const [errors, setErrors] = React.useState<string[]>([])
  const [isImporting, setIsImporting] = React.useState(false)
  const [importCount, setImportCount] = React.useState(0)

  React.useEffect(() => {
    if (!open) {
      setJsonText("")
      setIsValid(null)
      setErrors([])
      setImportCount(0)
    }
  }, [open])

  const validateJson = (text: string) => {
    setJsonText(text)
    if (!text.trim()) {
      setIsValid(null)
      setErrors([])
      setImportCount(0)
      return
    }

    try {
      const parsed = JSON.parse(text)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      const requiredFields = ["nombre", "descripcion", "porciones", "ingredientes", "pasos", "macros"]
      
      const newErrors: string[] = []
      items.forEach((item, index) => {
        const missing = requiredFields.filter(f => !item[f])
        if (missing.length > 0) {
          newErrors.push(`Receta ${index + 1}: Faltan campos (${missing.join(", ")})`)
        }
      })

      if (newErrors.length > 0) {
        setIsValid(false)
        setErrors(newErrors)
        setImportCount(0)
      } else {
        setIsValid(true)
        setErrors([])
        setImportCount(items.length)
      }
    } catch (e) {
      setIsValid(false)
      setErrors(["JSON no válido. Revisá los corchetes y comillas."])
      setImportCount(0)
    }
  }

  const handleImport = async () => {
    if (!isValid || !db) return
    setIsImporting(true)
    try {
      const parsed = JSON.parse(jsonText)
      const items = Array.isArray(parsed) ? parsed : [parsed]
      
      const ingredientsCol = collection(db, "users", USER_ID, "ingredients")
      const recipesCol = collection(db, "users", USER_ID, "recipes")

      let firstRecipeId = ""

      // Traer todos los ingredientes existentes de una sola vez
      const existingSnap = await getDocs(ingredientsCol)
      const existingNames = new Set(
        existingSnap.docs.map(d => (d.data().nombre || "").toLowerCase().trim())
      )

      for (const recipeData of items) {
        // Normalización de categorías de receta
        let rawCats = recipeData.categorias || recipeData.categoria || ["Almuerzo"];
        const categorias = Array.isArray(rawCats) ? rawCats : [rawCats];
        recipeData.categorias = categorias;
        recipeData.categoria = categorias[0];

        // Asegurar campos si no existen
        recipeData.utensilios = recipeData.utensilios || [];
        recipeData.tips = recipeData.tips || [];

        recipeData.ingredientes = (recipeData.ingredientes || []).map((ing: any) => {
          const normalizedName = normalizeIngredientName(ing.nombre);
          return {
            ...ing,
            nombre: normalizedName,
            categoria: categorizeIngredient(normalizedName)
          }
        });

        recipeData.fotoURL = null
        recipeData.userId = USER_ID
        recipeData.createdAt = serverTimestamp()
        recipeData.updatedAt = serverTimestamp()

        // Guardar la receta
        const docRef = await addDoc(recipesCol, recipeData)
        if (!firstRecipeId) firstRecipeId = docRef.id

        // Agregar ingredientes nuevos a la despensa (sin consultar uno por uno)
        const newIngredients = (recipeData.ingredientes || []).filter((ing: any) => {
          const name = (ing.nombre || "").toLowerCase().trim()
          return name && !existingNames.has(name)
        })

        // Guardar en paralelo todos los ingredientes nuevos de una vez
        await Promise.all(newIngredients.map((ing: any) => {
          existingNames.add(ing.nombre.toLowerCase().trim()) // evitar duplicados dentro del mismo import
          return addDoc(ingredientsCol, {
            nombre: ing.nombre,
            categoria: ing.categoria || categorizeIngredient(ing.nombre),
            unidad: ing.unidad || "unidad",
            stockActual: 0,
            stockMinimo: 0,
            userId: USER_ID,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          })
        }))
      }

      toast({ 
        title: "¡Importación exitosa!", 
        description: `Se ${items.length === 1 ? 'guardó 1 receta' : `guardaron ${items.length} recetas`} correctamente.`
      })
      onOpenChange(false)
      if (items.length === 1 && firstRecipeId) {
        router.push(`/recetas/${firstRecipeId}`)
      } else {
        router.push("/recetas")
      }
    } catch (e) {
      console.error(e)
      toast({ variant: "destructive", title: "Error al importar", description: "Revisá tu conexión e intentá de nuevo." })
    } finally {
      setIsImporting(false)
    }
  }

  const copyPrompt = () => {
    navigator.clipboard.writeText(PROMPT_TEMPLATE)
    toast({ title: "Prompt copiado", description: "Pegalo en tu IA favorita." })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-3xl p-6">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-primary flex items-center gap-2">
            <Download className="h-6 w-6" /> Importar IA
          </DialogTitle>
          <DialogDescription className="text-sm font-bold text-muted-foreground uppercase tracking-widest pt-2">
            Formato Estricto RFC 8259
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="bg-primary-suave p-4 rounded-2xl border border-primary/10 relative">
             <div className="flex justify-between items-center mb-2">
                <span className="text-[10px] font-black uppercase text-primary">Prompt Maestro Actualizado</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyPrompt}>
                  <Copy className="h-4 w-4" />
                </Button>
             </div>
             <p className="text-[10px] text-primary/70 font-medium line-clamp-3 italic">
               {PROMPT_TEMPLATE}
             </p>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-black uppercase text-muted-foreground tracking-widest">Contenido JSON</label>
            <Textarea 
              placeholder='Pegá el JSON aquí...' 
              className="min-h-[160px] rounded-2xl border-2 font-mono text-xs focus-visible:ring-primary"
              value={jsonText}
              onChange={(e) => validateJson(e.target.value)}
            />
          </div>

          {isValid === false && (
            <div className="bg-destructive/10 p-3 rounded-xl flex items-start gap-2 border border-destructive/20">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <div className="flex-1 overflow-y-auto max-h-24">
                {errors.map((err, i) => <p key={i} className="text-xs font-bold text-destructive">{err}</p>)}
              </div>
            </div>
          )}

          {isValid === true && (
            <div className="bg-primary/10 p-3 rounded-xl flex items-center gap-2 border border-primary/20">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              <p className="text-xs font-bold text-primary">Listo para importar {importCount} recetas.</p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1 rounded-2xl h-12" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              className="flex-1 rounded-2xl h-12 bg-primary text-white font-black" 
              disabled={!isValid || isImporting}
              onClick={handleImport}
            >
              {isImporting ? "Importando..." : "Confirmar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
