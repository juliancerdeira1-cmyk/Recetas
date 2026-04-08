
import { create } from 'zustand';
import { format } from 'date-fns';

const CACHE_KEY = 'cocina_familiar_cache';

const getCachedData = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const updateCache = (key: string, data: any) => {
  if (typeof window === 'undefined') return;
  try {
    const current = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...current, [key]: data }));
  } catch {}
};

export type UserProfileName = 'Javi' | 'Mary';

interface AppState {
  // Perfil activo
  activeProfile: UserProfileName;
  isProfileConfirmed: boolean;
  
  // Datos
  recetas: any[];
  ingredientes: any[];
  planificacion: any[];
  listaCompras: any[];
  macrosHoy: any | null;
  macrosSemana: any[];
  historialCompras: any[];
  userProfile: any | null;
  
  // Estados de carga
  recetasCargadas: boolean;
  ingredientesCargadas: boolean;
  planificacionCargada: boolean;
  listaComprasCargada: boolean;
  macrosCargados: boolean;
  profileCargado: boolean;

  // UI
  activeTab: string;

  // Setters
  setActiveProfile: (profile: UserProfileName) => void;
  confirmProfile: () => void;
  setRecetas: (data: any[]) => void;
  setIngredientes: (data: any[]) => void;
  setPlanificacion: (data: any[]) => void;
  setListaCompras: (data: any[]) => void;
  setMacrosHoy: (data: any | null) => void;
  setMacrosSemana: (data: any[]) => void;
  setHistorialCompras: (data: any[]) => void;
  setUserProfile: (data: any | null) => void;
  setActiveTab: (tab: string) => void;
  
  resetStore: () => void;
  optimisticToggleCompra: (id: string) => void;
}

const cached = getCachedData();

const initialState = {
  activeProfile: (cached?.activeProfile as UserProfileName) ?? 'Javi',
  isProfileConfirmed: true, // Cambiado a true por defecto para evitar overlay
  
  recetas: cached?.recetas ?? [],
  ingredientes: cached?.ingredientes ?? [],
  planificacion: cached?.planificacion ?? [],
  listaCompras: cached?.listaCompras ?? [],
  macrosHoy: cached?.macrosHoy ?? null,
  macrosSemana: cached?.macrosSemana ?? [],
  historialCompras: cached?.historialCompras ?? [],
  userProfile: cached?.userProfile ?? null,
  
  recetasCargadas: !!cached?.recetas?.length,
  ingredientesCargadas: !!cached?.ingredientes?.length,
  planificacionCargada: !!cached?.planificacion?.length,
  listaComprasCargada: !!cached?.listaCompras?.length,
  macrosCargados: !!cached?.macrosHoy || !!cached?.macrosSemana?.length,
  profileCargado: !!cached?.userProfile,

  activeTab: 'inicio',
};

export const useAppStore = create<AppState>((set) => ({
  ...initialState,

  setActiveProfile: (profile) => {
    updateCache('activeProfile', profile);
    set({
      activeProfile: profile,
      isProfileConfirmed: true,
      macrosCargados: false,
      macrosHoy: null,
      macrosSemana: [],
      planificacion: [],
      planificacionCargada: false,
      userProfile: null,
      profileCargado: false,
    });
  },

  confirmProfile: () => set({ isProfileConfirmed: true }),

  setRecetas: (data) => {
    updateCache('recetas', data);
    set({ recetas: data, recetasCargadas: true });
  },
  setIngredientes: (data) => {
    updateCache('ingredientes', data);
    set({ ingredientes: data, ingredientesCargadas: true });
  },
  setPlanificacion: (data) => {
    updateCache('planificacion', data);
    set({ planificacion: data, planificacionCargada: true });
  },
  setListaCompras: (data) => {
    updateCache('listaCompras', data);
    set({ listaCompras: data, listaComprasCargada: true });
  },
  
  setMacrosSemana: (data) => {
    const todayStr = format(new Date(), "yyyy-MM-dd");
    const todayMacros = data.find(m => m.date === todayStr) || null;
    
    if (typeof window !== 'undefined') {
      updateCache('macrosSemana', data);
      updateCache('macrosHoy', todayMacros);
    }

    set({ macrosSemana: data, macrosHoy: todayMacros, macrosCargados: true });
  },

  setMacrosHoy: (data) => {
    updateCache('macrosHoy', data);
    set({ macrosHoy: data, macrosCargados: true });
  },

  setHistorialCompras: (data) => {
    updateCache('historialCompras', data);
    set({ historialCompras: data });
  },
  
  setUserProfile: (data) => {
    updateCache('userProfile', data);
    set({ userProfile: data, profileCargado: true });
  },
  
  setActiveTab: (tab) => set({ activeTab: tab }),

  optimisticToggleCompra: (id) => set((state) => ({
    listaCompras: state.listaCompras.map(item => 
      item.id === id ? { ...item, isPurchased: !item.isPurchased } : item
    )
  })),

  resetStore: () => {
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(CACHE_KEY); } catch {}
    }
    set(initialState);
  },
}));
