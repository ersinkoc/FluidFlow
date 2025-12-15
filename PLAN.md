# FluidFlow Refactoring Master Plan

> **Versiyon:** 1.0
> **Tarih:** 2025-12-15
> **Durum:** Planlama Aşaması

---

## İçindekiler

1. [Yönetici Özeti](#1-yönetici-özeti)
2. [Mevcut Durum Analizi](#2-mevcut-durum-analizi)
3. [Mimari Sorunlar ve Çözümler](#3-mimari-sorunlar-ve-çözümler)
4. [Kod Tekrarı Eliminasyonu](#4-kod-tekrarı-eliminasyonu)
5. [Performans Optimizasyonları](#5-performans-optimizasyonları)
6. [Kod Kalitesi İyileştirmeleri](#6-kod-kalitesi-iyileştirmeleri)
7. [AI Servisleri Refactoring](#7-ai-servisleri-refactoring)
8. [Yeni Dosya Yapısı](#8-yeni-dosya-yapısı)
9. [Uygulama Fazları](#9-uygulama-fazları)
10. [Test Stratejisi](#10-test-stratejisi)
11. [Risk Analizi](#11-risk-analizi)
12. [Başarı Metrikleri](#12-başarı-metrikleri)

---

## 1. Yönetici Özeti

### 1.1 Proje Durumu

FluidFlow, sketch-to-app prototyping aracı olarak güçlü özelliklere sahip ancak codebase'in büyümesiyle birlikte **teknik borç** birikmiştir:

| Metrik | Mevcut | Hedef | İyileşme |
|--------|--------|-------|----------|
| Toplam Satır Sayısı | ~25,000 | ~21,000 | -16% |
| Tekrar Eden Kod | ~1,500 satır | ~300 satır | -80% |
| God Component Sayısı | 3 | 0 | -100% |
| Modal Boilerplate | 2,000+ satır | 500 satır | -75% |
| Bundle Size | ~850KB | ~650KB | -24% |
| `any` Kullanımı | 88 adet | <10 adet | -89% |
| Magic Number/String | 25+ | 0 | -100% |

### 1.2 Kritik Bulgular

```
┌─────────────────────────────────────────────────────────────────┐
│  KRİTİK: 3 God Component (App.tsx, ControlPanel, PreviewPanel)  │
│  YÜKSEK: 150+ satır tekrar (AISettings), Memory Leak            │
│  ORTA:   JSON.stringify performans sorunu, Lazy loading eksik   │
│  DÜŞÜK:  Naming conventions, Dead code                          │
└─────────────────────────────────────────────────────────────────┘
```

### 1.3 Tahmini Efor

| Faz | Süre | Efor | Öncelik |
|-----|------|------|---------|
| Faz 1: Hızlı Kazanımlar | 2-3 gün | Düşük | P0 |
| Faz 2: Servis Katmanı | 5-7 gün | Orta | P1 |
| Faz 3: Bileşen Refactoring | 10-14 gün | Yüksek | P1 |
| Faz 4: AI Provider Refactoring | 5-7 gün | Orta | P2 |
| **Toplam** | **22-31 gün** | - | - |

---

## 2. Mevcut Durum Analizi

### 2.1 Dosya İstatistikleri

#### En Büyük Dosyalar (Satır Sayısı)

| # | Dosya | Satır | Sorun Seviyesi |
|---|-------|-------|----------------|
| 1 | `components/ControlPanel/index.tsx` | 3,343 | 🔴 Kritik |
| 2 | `App.tsx` | 1,411 | 🔴 Kritik |
| 3 | `utils/cleanCode.ts` | 1,063 | 🟠 Yüksek |
| 4 | `server/api/projects.ts` | 857 | 🟠 Yüksek |
| 5 | `hooks/useProject.ts` | 752 | 🟠 Yüksek |
| 6 | `components/AISettingsModal.tsx` | 686 | 🟡 Orta |
| 7 | `components/ControlPanel/AIProviderSettings.tsx` | 643 | 🟡 Orta |
| 8 | `contexts/AppContext.tsx` | 620 | 🟡 Orta |
| 9 | `components/PreviewPanel/index.tsx` | 600+ | 🟠 Yüksek |
| 10 | `services/ai/index.ts` | 519 | 🟡 Orta |

#### Dosya Dağılımı

```
components/     78 dosya   (~12,000 satır)
├── ControlPanel/    15 dosya
├── PreviewPanel/    18 dosya
├── MegaSettingsModal/  12 dosya
├── GitPanel/        6 dosya
└── shared/          2 dosya (YETERSİZ!)

services/       22 dosya   (~4,500 satır)
├── ai/             10 dosya
└── ...             12 dosya

hooks/          9 dosya    (~2,500 satır)
utils/          10 dosya   (~2,800 satır)
server/         12 dosya   (~2,200 satır)
```

### 2.2 Bağımlılık Haritası

```
                    ┌─────────────┐
                    │   App.tsx   │
                    │  (1,411 L)  │
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
           ▼               ▼               ▼
    ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
    │ControlPanel │ │ PreviewPanel│ │   Modals    │
    │  (3,343 L)  │ │   (600+ L)  │ │  (20+ adet) │
    └──────┬──────┘ └──────┬──────┘ └─────────────┘
           │               │
           ▼               ▼
    ┌─────────────┐ ┌─────────────┐
    │  useProject │ │  services/  │
    │   (752 L)   │ │     ai/     │
    └──────┬──────┘ └──────┬──────┘
           │               │
           ▼               ▼
    ┌─────────────┐ ┌─────────────┐
    │ projectApi  │ │  providers  │
    └─────────────┘ └─────────────┘
```

### 2.3 State Dağılımı

```
App.tsx State (18+ useState):
├── files, activeFile, activeTab
├── suggestions, isGenerating, resetKey
├── selectedModel
├── hasUncommittedChanges
├── pendingReview, autoAcceptChanges, diffModeEnabled
└── 18+ modal open/close states

ControlPanel State (15+ useState):
├── messages, conversationHistory
├── streamingStatus, streamingChars, streamingFiles
├── filePlan, truncationState, continuationState
├── expandedPromptMode, batchMode
└── ...

PreviewPanel State (20+ useState):
├── logs, networkLogs, iframeSrc
├── previewDevice, splitView
├── accessibilityReport, consultantReport
├── exportZip, isExporting
└── ...
```

---

## 3. Mimari Sorunlar ve Çözümler

### 3.1 God Components

#### 3.1.1 App.tsx (1,411 satır) → Hedef: ~300 satır

**Mevcut Sorumluluklar:**
- [ ] IndexedDB WIP storage (170 satır)
- [ ] DiffModal component inline (178 satır)
- [ ] Default files configuration (110 satır)
- [ ] Project initialization logic (170 satır)
- [ ] Git operations orchestration (50 satır)
- [ ] Command palette handler (50 satır)
- [ ] 18+ modal state management (100 satır)
- [ ] File change reviews & checkpoints (80 satır)
- [ ] Context persistence (50 satır)

**Çözüm Planı:**

```typescript
// ÖNCE: App.tsx (1,411 satır)
// SONRA: App.tsx (~300 satır) + aşağıdaki dosyalar

// 1. WIP Storage Service
// services/wipStorage.ts (~120 satır)
export interface WIPService {
  save(projectId: string, data: WIPData): Promise<void>;
  restore(projectId: string): Promise<WIPData | null>;
  clear(projectId: string): Promise<void>;
  exists(projectId: string): Promise<boolean>;
}

// 2. DiffModal Component
// components/DiffModal/index.tsx (~200 satır)
// components/DiffModal/DiffCalculator.ts (~50 satır)
// components/DiffModal/FileList.tsx (~80 satır)
// components/DiffModal/DiffView.tsx (~100 satır)

// 3. Default Files
// data/defaultFiles.ts (~120 satır)
export const DEFAULT_PROJECT_FILES: FileSystem = { ... };

// 4. Modal Manager Hook
// hooks/useModalManager.ts (~80 satır)
export function useModalManager() {
  const [modals, setModals] = useState<ModalState>({
    deploy: false,
    share: false,
    aiSettings: false,
    megaSettings: false,
    history: false,
    projectManager: false,
    credits: false,
    codeMap: false,
    // ... 18+ modal
  });

  const open = (modal: keyof ModalState) => { ... };
  const close = (modal: keyof ModalState) => { ... };
  const toggle = (modal: keyof ModalState) => { ... };

  return { modals, open, close, toggle };
}

// 5. Command Handlers
// services/commandHandlers.ts (~100 satır)
export const commandHandlers: Record<string, CommandHandler> = {
  'toggle-preview': (ctx) => ctx.setActiveTab(...),
  'reset': (ctx) => ctx.resetApp(),
  'snippets': (ctx) => ctx.openModal('snippets'),
  // ...
};
```

**Uygulama Adımları:**

| Adım | Görev | Dosya | Satır Taşıma |
|------|-------|-------|--------------|
| 3.1.1.1 | WIPStorage service oluştur | `services/wipStorage.ts` | 170 satır |
| 3.1.1.2 | DiffModal ayır | `components/DiffModal/` | 178 satır |
| 3.1.1.3 | Default files taşı | `data/defaultFiles.ts` | 110 satır |
| 3.1.1.4 | useModalManager hook | `hooks/useModalManager.ts` | 100 satır |
| 3.1.1.5 | Command handlers | `services/commandHandlers.ts` | 50 satır |
| 3.1.1.6 | App.tsx güncelle | `App.tsx` | - |

---

#### 3.1.2 ControlPanel/index.tsx (3,343 satır) → Hedef: ~500 satır

**Mevcut Sorumluluklar:**
- Chat management & message history
- File upload handling & processing
- AI generation orchestration
- Token tracking & context management
- Sketch/brand image processing
- Batch generation coordination
- Prompt engineering modal
- Model/provider selection
- Inspect edit flow
- AI history management

**Çözüm Planı:**

```
components/ControlPanel/
├── index.tsx                    (~500 satır - orchestrator only)
├── ChatModule/
│   ├── index.tsx               (~200 satır)
│   ├── ChatPanel.tsx           (mevcut, refactor)
│   ├── MessageList.tsx         (~150 satır - YENİ)
│   ├── MessageItem.tsx         (~100 satır - YENİ)
│   └── useChatState.ts         (~150 satır - YENİ)
├── GenerationModule/
│   ├── index.tsx               (~150 satır)
│   ├── GenerateButton.tsx      (mevcut)
│   ├── StreamingIndicator.tsx  (~80 satır - YENİ)
│   └── useGeneration.ts        (~200 satır - YENİ)
├── UploadModule/
│   ├── index.tsx               (~100 satır)
│   ├── FileUploadZone.tsx      (mevcut)
│   ├── UploadCards.tsx         (mevcut)
│   └── useFileUpload.ts        (~100 satır - YENİ)
├── SettingsModule/
│   ├── index.tsx               (~100 satır)
│   ├── ModelSelector.tsx       (~80 satır - YENİ)
│   └── SettingsPanel.tsx       (mevcut)
└── modals/
    ├── BatchGenerationModal.tsx (mevcut)
    ├── PromptImproverModal.tsx  (mevcut)
    ├── TechStackModal.tsx       (mevcut)
    └── ...
```

**Yeni Hook'lar:**

```typescript
// hooks/useChatState.ts
export function useChatState() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingStatus, setStreamingStatus] = useState<StreamingStatus>('idle');
  const [streamingChars, setStreamingChars] = useState(0);

  const addMessage = useCallback((msg: Message) => { ... }, []);
  const updateLastMessage = useCallback((content: string) => { ... }, []);
  const clearMessages = useCallback(() => { ... }, []);

  return {
    messages,
    streamingStatus,
    streamingChars,
    addMessage,
    updateLastMessage,
    clearMessages,
  };
}

// hooks/useGeneration.ts
export function useGeneration(options: GenerationOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);

  const generate = useCallback(async (prompt: string, files: FileSystem) => {
    setIsGenerating(true);
    try {
      // Generation logic moved here
    } finally {
      setIsGenerating(false);
    }
  }, []);

  const cancel = useCallback(() => { ... }, []);

  return { isGenerating, progress, generate, cancel };
}
```

---

#### 3.1.3 PreviewPanel/index.tsx (600+ satır) → Hedef: ~200 satır

**Çözüm Planı:**

```
components/PreviewPanel/
├── index.tsx                    (~200 satır - tab router only)
├── TabRouter.tsx               (~100 satır - YENİ)
├── tabs/
│   ├── PreviewTab.tsx          (~150 satır - YENİ, iframe logic)
│   ├── CodeTab.tsx             (~50 satır - wrapper)
│   ├── ConsoleTab.tsx          (~50 satır - wrapper)
│   ├── GitTab.tsx              (~50 satır - wrapper)
│   └── AnalysisTab.tsx         (~100 satır - YENİ, lazy)
├── CodeEditor.tsx              (mevcut)
├── ConsolePanel.tsx            (mevcut)
├── FileExplorer.tsx            (mevcut)
└── overlays/
    ├── InspectionOverlay.tsx   (~150 satır - YENİ)
    └── DeviceFrame.tsx         (~80 satır - YENİ)
```

**Lazy Loading Implementation:**

```typescript
// components/PreviewPanel/TabRouter.tsx
import { lazy, Suspense } from 'react';

const AnalysisTab = lazy(() => import('./tabs/AnalysisTab'));
const DBStudio = lazy(() => import('./DBStudio'));
const CodeMapTab = lazy(() => import('./CodeMapTab'));

export function TabRouter({ activeTab, ...props }: TabRouterProps) {
  const renderTab = () => {
    switch (activeTab) {
      case 'preview':
        return <PreviewTab {...props} />;
      case 'code':
        return <CodeTab {...props} />;
      case 'console':
        return <ConsoleTab {...props} />;
      case 'analysis':
        return (
          <Suspense fallback={<TabSkeleton />}>
            <AnalysisTab {...props} />
          </Suspense>
        );
      // ...
    }
  };

  return <div className="tab-content">{renderTab()}</div>;
}
```

---

### 3.2 Prop Drilling Çözümü

**Mevcut Sorun:**
```
App.tsx → ControlPanel → ChatPanel
         ↓
         20+ prop geçişi
```

**Çözüm: AppContext Aktivasyonu**

```typescript
// contexts/AppContext.tsx (güncelleme)
interface AppContextValue {
  // File Operations
  files: FileSystem;
  setFiles: (files: FileSystem, label?: string) => void;
  activeFile: string;
  setActiveFile: (file: string) => void;

  // Project Operations
  currentProject: Project | null;
  gitStatus: GitStatus | null;
  hasUncommittedChanges: boolean;

  // UI State
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  selectedModel: string;
  setSelectedModel: (model: string) => void;

  // Actions
  reviewChange: (label: string, newFiles: FileSystem) => void;
  saveCheckpoint: (files: FileSystem, label: string) => Promise<void>;

  // Modal Manager
  modals: ModalState;
  openModal: (modal: keyof ModalState) => void;
  closeModal: (modal: keyof ModalState) => void;
}

// App.tsx
export default function App() {
  // ... state definitions

  return (
    <AppProvider value={contextValue}>
      <div className="app-container">
        <ControlPanel /> {/* No more props! */}
        <PreviewPanel /> {/* No more props! */}
        <ModalLayer />
      </div>
    </AppProvider>
  );
}

// components/ControlPanel/index.tsx
export function ControlPanel() {
  const { files, setFiles, activeFile, reviewChange } = useAppContext();
  // ... component logic
}
```

---

### 3.3 useProject Hook Bölünmesi

**Mevcut: useProject.ts (752 satır)**

**Hedef Yapı:**

```typescript
// hooks/useProjectManagement.ts (~250 satır)
export function useProjectManagement() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const createProject = useCallback(async (...) => { ... }, []);
  const openProject = useCallback(async (...) => { ... }, []);
  const deleteProject = useCallback(async (...) => { ... }, []);
  const duplicateProject = useCallback(async (...) => { ... }, []);

  return { projects, currentProject, isLoading, createProject, openProject, ... };
}

// hooks/useGitOperations.ts (~200 satır)
export function useGitOperations(projectId: string | null) {
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const initGit = useCallback(async (...) => { ... }, []);
  const commit = useCallback(async (...) => { ... }, []);
  const checkout = useCallback(async (...) => { ... }, []);
  const refreshStatus = useCallback(async (...) => { ... }, []);

  return { gitStatus, isSyncing, initGit, commit, checkout, refreshStatus };
}

// hooks/useContextPersistence.ts (~150 satır)
export function useContextPersistence(projectId: string | null) {
  const saveContext = useCallback(async (...) => { ... }, []);
  const loadContext = useCallback(async (...) => { ... }, []);

  return { saveContext, loadContext };
}

// hooks/useProject.ts (~150 satır - composition)
export function useProject() {
  const projectMgmt = useProjectManagement();
  const gitOps = useGitOperations(projectMgmt.currentProject?.id ?? null);
  const contextPersist = useContextPersistence(projectMgmt.currentProject?.id ?? null);

  return {
    ...projectMgmt,
    ...gitOps,
    ...contextPersist,
  };
}
```

---

## 4. Kod Tekrarı Eliminasyonu

### 4.1 SafeJson Birleştirme

**Mevcut:**
- `utils/safeJson.ts` (61 satır)
- `server/utils/safeJson.ts` (97 satır)

**Çözüm:**

```typescript
// shared/safeJson.ts (yeni dizin: shared/)
export function safeJsonParse<T>(
  json: string,
  fallback: T,
  options?: { logErrors?: boolean }
): T {
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    if (options?.logErrors) {
      console.warn('[SafeJSON] Parse error:', error);
    }
    return fallback;
  }
}

export function safeJsonStringify(
  value: unknown,
  options?: {
    space?: number;
    handleBigInt?: boolean;
    fallback?: string;
  }
): string {
  const { space, handleBigInt = true, fallback = '{}' } = options ?? {};

  try {
    return JSON.stringify(
      value,
      handleBigInt
        ? (_, v) => (typeof v === 'bigint' ? v.toString() : v)
        : undefined,
      space
    );
  } catch {
    return fallback;
  }
}

// utils/safeJson.ts → re-export
export * from '../shared/safeJson';

// server/utils/safeJson.ts → re-export
export * from '../../shared/safeJson';
```

---

### 4.2 Provider Config Hook

**Mevcut Tekrar:**
- `AISettingsModal.tsx` (686 satır)
- `AIProviderSettings.tsx` (643 satır)
- ~150 satır aynı mantık

**Çözüm:**

```typescript
// hooks/useProviderConfig.ts (~200 satır)
export function useProviderConfig() {
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});

  // Provider CRUD
  const addProvider = useCallback((config: Partial<ProviderConfig>) => {
    const newProvider: ProviderConfig = {
      id: crypto.randomUUID(),
      name: config.name ?? 'New Provider',
      type: config.type ?? 'openai',
      apiKey: config.apiKey ?? '',
      baseUrl: config.baseUrl ?? '',
      models: config.models ?? [],
      isEnabled: true,
    };
    setProviders(prev => [...prev, newProvider]);
    return newProvider;
  }, []);

  const updateProvider = useCallback((id: string, updates: Partial<ProviderConfig>) => {
    setProviders(prev =>
      prev.map(p => p.id === id ? { ...p, ...updates } : p)
    );
  }, []);

  const deleteProvider = useCallback((id: string) => {
    setProviders(prev => prev.filter(p => p.id !== id));
    if (activeProviderId === id) {
      setActiveProviderId(providers[0]?.id ?? null);
    }
  }, [activeProviderId, providers]);

  // Model Management
  const addModel = useCallback((providerId: string, model: ModelConfig) => {
    updateProvider(providerId, {
      models: [...(providers.find(p => p.id === providerId)?.models ?? []), model],
    });
  }, [providers, updateProvider]);

  const updateModel = useCallback((providerId: string, modelId: string, updates: Partial<ModelConfig>) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    updateProvider(providerId, {
      models: provider.models.map(m =>
        m.id === modelId ? { ...m, ...updates } : m
      ),
    });
  }, [providers, updateProvider]);

  const deleteModel = useCallback((providerId: string, modelId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return;

    updateProvider(providerId, {
      models: provider.models.filter(m => m.id !== modelId),
    });
  }, [providers, updateProvider]);

  // Connection Testing
  const testConnection = useCallback(async (providerId: string) => {
    setTestResults(prev => ({ ...prev, [providerId]: { status: 'testing' } }));

    try {
      const provider = providers.find(p => p.id === providerId);
      if (!provider) throw new Error('Provider not found');

      const result = await providerManager.testConnection(provider);
      setTestResults(prev => ({
        ...prev,
        [providerId]: { status: result.success ? 'success' : 'error', message: result.error }
      }));
      return result;
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [providerId]: { status: 'error', message: error.message }
      }));
      return { success: false, error: error.message };
    }
  }, [providers]);

  // Fetch Available Models
  const fetchModels = useCallback(async (providerId: string) => {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) return [];

    try {
      return await providerManager.listModels(provider);
    } catch {
      return [];
    }
  }, [providers]);

  // Persistence
  useEffect(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('ai-providers');
    if (saved) {
      const parsed = safeJsonParse<ProviderConfig[]>(saved, []);
      setProviders(parsed);
      setActiveProviderId(parsed[0]?.id ?? null);
    }
  }, []);

  useEffect(() => {
    // Save to localStorage on change
    localStorage.setItem('ai-providers', safeJsonStringify(providers));
  }, [providers]);

  return {
    providers,
    activeProviderId,
    activeProvider: providers.find(p => p.id === activeProviderId) ?? null,
    testResults,
    setActiveProviderId,
    addProvider,
    updateProvider,
    deleteProvider,
    addModel,
    updateModel,
    deleteModel,
    testConnection,
    fetchModels,
  };
}
```

**Kullanım:**

```typescript
// components/AISettingsModal.tsx (~200 satır, eskiden 686)
export function AISettingsModal({ isOpen, onClose }) {
  const providerConfig = useProviderConfig();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="AI Settings">
      <ProviderList
        providers={providerConfig.providers}
        activeId={providerConfig.activeProviderId}
        onSelect={providerConfig.setActiveProviderId}
        onDelete={providerConfig.deleteProvider}
      />
      <ProviderEditor
        provider={providerConfig.activeProvider}
        onUpdate={(updates) => providerConfig.updateProvider(providerConfig.activeProviderId!, updates)}
        testResult={providerConfig.testResults[providerConfig.activeProviderId!]}
        onTest={() => providerConfig.testConnection(providerConfig.activeProviderId!)}
      />
    </Modal>
  );
}
```

---

### 4.3 BaseModal Component

**Mevcut: 20+ modal aynı yapıyı tekrarlıyor**

**Çözüm:**

```typescript
// components/shared/BaseModal.tsx
interface BaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  children: React.ReactNode;
  footer?: React.ReactNode;
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-2xl',
  lg: 'max-w-4xl',
  xl: 'max-w-6xl',
  full: 'max-w-[95vw]',
};

export function BaseModal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'lg',
  children,
  footer,
  showCloseButton = true,
  closeOnOverlayClick = true,
  className,
}: BaseModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={closeOnOverlayClick ? onClose : undefined}
    >
      <div
        className={cn(
          'w-full max-h-[90vh] bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200',
          sizeClasses[size],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-slate-950/50">
          <div>
            <h2 className="text-xl font-bold text-white">{title}</h2>
            {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
          </div>
          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-white/5 bg-slate-950/30">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Convenience components
export function ModalContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('p-6', className)}>{children}</div>;
}

export function ModalFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex items-center justify-end gap-3', className)}>{children}</div>;
}

export function ModalButton({
  variant = 'secondary',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-500 text-white',
    secondary: 'bg-white/5 hover:bg-white/10 text-slate-300',
    danger: 'bg-red-600 hover:bg-red-500 text-white',
  };

  return (
    <button
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-colors',
        variants[variant]
      )}
      {...props}
    >
      {children}
    </button>
  );
}
```

**Kullanım Örneği:**

```typescript
// ÖNCE: DeployModal.tsx (~200 satır)
// SONRA: DeployModal.tsx (~80 satır)

export function DeployModal({ isOpen, onClose, files }: DeployModalProps) {
  const [platform, setPlatform] = useState<Platform>('vercel');
  const [isDeploying, setIsDeploying] = useState(false);

  const handleDeploy = async () => { ... };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={onClose}
      title="Deploy Project"
      subtitle="Choose a platform to deploy your project"
      size="md"
      footer={
        <ModalFooter>
          <ModalButton variant="secondary" onClick={onClose}>Cancel</ModalButton>
          <ModalButton variant="primary" onClick={handleDeploy} disabled={isDeploying}>
            {isDeploying ? 'Deploying...' : 'Deploy'}
          </ModalButton>
        </ModalFooter>
      }
    >
      <ModalContent>
        <PlatformSelector value={platform} onChange={setPlatform} />
        <DeployOptions platform={platform} />
      </ModalContent>
    </BaseModal>
  );
}
```

---

## 5. Performans Optimizasyonları

### 5.1 JSON.stringify Karşılaştırması Optimizasyonu

**Mevcut Sorun:**

```typescript
// App.tsx:542 - HER dosya değişikliğinde çalışıyor
const currentFilesJson = JSON.stringify(files);  // 250KB+
const hasChanges = currentFilesJson !== lastCommittedFilesRef.current;  // String compare
```

**Çözüm:**

```typescript
// utils/fileComparison.ts
export function createFileHash(files: FileSystem): string {
  // O(n) where n = number of files, not content size
  return Object.entries(files)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => `${path}:${content.length}:${hashCode(content.slice(0, 100))}`)
    .join('|');
}

// Simple hash function for quick comparison
function hashCode(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash;
}

// For actual content comparison (when hash differs)
export function getChangedFiles(
  oldFiles: FileSystem,
  newFiles: FileSystem
): { added: string[]; modified: string[]; deleted: string[] } {
  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  const allPaths = new Set([...Object.keys(oldFiles), ...Object.keys(newFiles)]);

  for (const path of allPaths) {
    if (!(path in oldFiles)) {
      added.push(path);
    } else if (!(path in newFiles)) {
      deleted.push(path);
    } else if (oldFiles[path] !== newFiles[path]) {
      modified.push(path);
    }
  }

  return { added, modified, deleted };
}

// Usage in App.tsx
const fileHash = useMemo(() => createFileHash(files), [files]);
const lastCommittedHashRef = useRef<string>('');

useEffect(() => {
  const hasChanges = fileHash !== lastCommittedHashRef.current;
  setHasUncommittedChanges(hasChanges);
}, [fileHash]);
```

**Kazanım:**
- Mevcut: 250KB JSON serialize + string compare per edit
- Yeni: ~5KB hash calculate per edit
- **~98% performans iyileşmesi**

---

### 5.2 Modal Lazy Loading

**Mevcut:**
```typescript
// ControlPanel/index.tsx - Hepsi upfront yükleniyor (~102KB)
import { AIHistoryModal } from '../AIHistoryModal';
import { TechStackModal } from './TechStackModal';
import { PromptEngineerModal } from './PromptEngineerModal';
import { BatchGenerationModal } from './BatchGenerationModal';
import { CodebaseSyncModal } from '../CodebaseSyncModal';
import { PromptImproverModal } from './PromptImproverModal';
```

**Çözüm:**

```typescript
// components/LazyModals.tsx
import { lazy, Suspense } from 'react';

// Lazy imports
const AIHistoryModal = lazy(() => import('./AIHistoryModal'));
const TechStackModal = lazy(() => import('./ControlPanel/TechStackModal'));
const PromptEngineerModal = lazy(() => import('./ControlPanel/PromptEngineerModal'));
const BatchGenerationModal = lazy(() => import('./ControlPanel/BatchGenerationModal'));
const CodebaseSyncModal = lazy(() => import('./CodebaseSyncModal'));
const PromptImproverModal = lazy(() => import('./ControlPanel/PromptImproverModal'));
const DBStudio = lazy(() => import('./PreviewPanel/DBStudio'));
const CodeMapTab = lazy(() => import('./PreviewPanel/CodeMapTab'));

// Modal Loader Component
function ModalLoader({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
      </div>
    }>
      {children}
    </Suspense>
  );
}

// Export lazy modals with loader
export function LazyAIHistoryModal(props: AIHistoryModalProps) {
  return (
    <ModalLoader>
      <AIHistoryModal {...props} />
    </ModalLoader>
  );
}

// ... repeat for other modals
```

**Heavy Dependencies Lazy Loading:**

```typescript
// utils/lazyDeps.ts
export const loadJSZip = () => import('jszip');
export const loadFileSaver = () => import('file-saver');

// Usage in ExportModal
async function exportAsZip(files: FileSystem) {
  const [{ default: JSZip }, { saveAs }] = await Promise.all([
    loadJSZip(),
    loadFileSaver(),
  ]);

  const zip = new JSZip();
  // ... export logic
}
```

**Kazanım:**
- Initial bundle: ~102KB → ~0KB (lazy loaded)
- First modal open: +~20KB (specific modal)
- **~24% bundle size reduction**

---

### 5.3 Memory Leak Düzeltmeleri

#### 5.3.1 syncedMessageIdsRef Memory Leak

**Mevcut Sorun:**

```typescript
// ControlPanel/index.tsx:318-368
syncedMessageIdsRef.current.add(msg.id);
// Set sınırsız büyüyor, hiç temizlenmiyor!
```

**Çözüm:**

```typescript
// hooks/useChatState.ts
export function useChatState() {
  const [messages, setMessages] = useState<Message[]>([]);
  const syncedMessageIdsRef = useRef<Set<string>>(new Set());
  const previousMessageCountRef = useRef<number>(0);

  // Clear synced IDs when messages are compacted/cleared
  useEffect(() => {
    if (messages.length < previousMessageCountRef.current) {
      // Messages were compacted or cleared
      syncedMessageIdsRef.current.clear();
      // Re-add current message IDs
      messages.forEach(msg => syncedMessageIdsRef.current.add(msg.id));
    }
    previousMessageCountRef.current = messages.length;
  }, [messages.length]);

  // Clear on unmount
  useEffect(() => {
    return () => {
      syncedMessageIdsRef.current.clear();
    };
  }, []);

  // Clear when context changes (project switch, model change)
  const clearSyncState = useCallback(() => {
    syncedMessageIdsRef.current.clear();
  }, []);

  return {
    messages,
    setMessages,
    syncedMessageIdsRef,
    clearSyncState,
  };
}
```

#### 5.3.2 Timer Cleanup

**Çözüm:**

```typescript
// hooks/useTimers.ts
export function useTimeout() {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const set = useCallback((callback: () => void, delay: number) => {
    clear();
    timeoutRef.current = setTimeout(callback, delay);
  }, []);

  const clear = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return clear;
  }, [clear]);

  return { set, clear };
}

// Usage
function MyComponent() {
  const timeout = useTimeout();

  const handleAction = () => {
    timeout.set(() => {
      // delayed action
    }, 1000);
  };

  // No manual cleanup needed!
}
```

---

### 5.4 Memoization Eksiklikleri

**Düzeltilecek Dosyalar:**

```typescript
// hooks/useVersionHistory.ts
// ÖNCE:
const setFiles = useCallback((newFilesOrUpdater, label) => {
  // ... logic
}, [commitPendingChanges]); // commitPendingChanges değişince recreate

// SONRA:
const setFilesStable = useRef((newFilesOrUpdater: FileSystemUpdate, label?: string) => {
  // ... logic using refs
}).current;

const setFiles = useCallback(setFilesStable, []); // Stable reference

// components/ControlPanel/ChatPanel.tsx
// ÖNCE:
function renderMarkdown(content: string) { ... } // Her render'da yeniden oluşuyor

// SONRA:
const renderMarkdown = useMemo(() => {
  return (content: string) => { ... };
}, []); // Stable function

// Ya da module-level function:
const renderMarkdown = (content: string) => { ... }; // Component dışında

// components/shared/FileChangesSummary.tsx
// ÖNCE:
function FileChangesSummary({ changes }) { ... }

// SONRA:
const FileChangesSummary = React.memo(function FileChangesSummary({ changes }) {
  // ...
});
```

---

## 6. Kod Kalitesi İyileştirmeleri

### 6.1 Constants Dosyaları

**Frontend Constants:**

```typescript
// constants/index.ts

// Database
export const WIP_DB_NAME = 'fluidflow-wip';
export const WIP_DB_VERSION = 1;

// Timing
export const AUTO_SAVE_INTERVAL_MS = 30_000; // 30 seconds
export const STREAMING_SAVE_DEBOUNCE_MS = 2_000;
export const CREDITS_MODAL_DELAY_MS = 1_000;
export const WIP_SAVE_DEBOUNCE_MS = 1_000;

// Token Limits
export const DEFAULT_MAX_TOKENS = 8_000;
export const COMPACTION_THRESHOLD_TOKENS = 2_000;
export const TOKEN_ESTIMATION_CHARS_PER_TOKEN = 4;

// File Limits
export const MAX_JSON_REPAIR_SIZE = 500_000;
export const MAX_FILE_RECOVERY_SIZE = 100_000;
export const MAX_RECOVERY_ITERATIONS = 50;

// UI
export const MAX_VISIBLE_FILES_IN_PLAN = 5;
export const MAX_RELATED_PATHS_IN_ERROR = 3;

// Ignored Paths
export const IGNORED_PATHS = ['.git', '.git/', 'node_modules', 'node_modules/'] as const;
```

**Server Constants:**

```typescript
// server/constants.ts

// File Limits
export const MAX_SINGLE_FILE_SIZE = 5 * 1024 * 1024; // 5MB
export const MAX_TOTAL_PROJECT_SIZE = 50 * 1024 * 1024; // 50MB
export const MAX_FILE_COUNT = 1000;

// Lock Timeout
export const FILE_LOCK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// History Limits
export const MAX_VERSION_HISTORY = 30;
export const MAX_AI_HISTORY = 100;

// Runner Ports
export const RUNNER_PORT_MIN = 3300;
export const RUNNER_PORT_MAX = 3399;

// Timeouts
export const API_TIMEOUT_MS = 30_000;
export const GENERATION_TIMEOUT_MS = 300_000; // 5 minutes
```

---

### 6.2 Error Handling Standardizasyonu

**Mevcut Sorun:**
- 27 adet catch bloğu hataları yutuyor
- Generic error mesajları
- Tutarsız loglama

**Çözüm:**

```typescript
// utils/errors.ts
export class FluidFlowError extends Error {
  constructor(
    message: string,
    public code: ErrorCode,
    public context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'FluidFlowError';
  }
}

export enum ErrorCode {
  // File Operations
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',

  // Project Operations
  PROJECT_NOT_FOUND = 'PROJECT_NOT_FOUND',
  PROJECT_LOCKED = 'PROJECT_LOCKED',

  // Git Operations
  GIT_NOT_INITIALIZED = 'GIT_NOT_INITIALIZED',
  GIT_COMMIT_FAILED = 'GIT_COMMIT_FAILED',

  // AI Operations
  AI_PROVIDER_ERROR = 'AI_PROVIDER_ERROR',
  AI_RATE_LIMITED = 'AI_RATE_LIMITED',
  AI_CONTEXT_TOO_LONG = 'AI_CONTEXT_TOO_LONG',

  // Storage
  STORAGE_QUOTA_EXCEEDED = 'STORAGE_QUOTA_EXCEEDED',
  WIP_SAVE_FAILED = 'WIP_SAVE_FAILED',

  // Network
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}

// Centralized error handler
export function handleError(
  error: unknown,
  context: string,
  options?: { silent?: boolean; rethrow?: boolean }
): FluidFlowError {
  const fluidError = error instanceof FluidFlowError
    ? error
    : new FluidFlowError(
        error instanceof Error ? error.message : 'Unknown error',
        ErrorCode.UNKNOWN,
        { originalError: error }
      );

  // Structured logging
  console.error(`[${context}]`, {
    code: fluidError.code,
    message: fluidError.message,
    context: fluidError.context,
  });

  if (options?.rethrow) {
    throw fluidError;
  }

  return fluidError;
}

// Usage
try {
  await saveWIP(projectId, files);
} catch (error) {
  handleError(error, 'WIP.save', { silent: false });
  // Don't rethrow - WIP save failure is non-critical
}
```

---

### 6.3 TypeScript Strict Mode Geçişi

**any Kullanımı Düzeltmeleri:**

```typescript
// ÖNCE: utils/cleanCode.ts
function parseContent(content: any): ParsedContent { ... }

// SONRA:
interface ContentInput {
  code?: string;
  files?: Record<string, string>;
  text?: string;
}

function parseContent(content: ContentInput): ParsedContent { ... }

// ÖNCE: hooks/useAIHistory.ts
const [history, setHistory] = useState<any[]>([]);

// SONRA:
interface AIHistoryEntry {
  id: string;
  timestamp: number;
  prompt: string;
  response: string;
  model: string;
  tokens: { input: number; output: number };
}

const [history, setHistory] = useState<AIHistoryEntry[]>([]);

// ÖNCE: services/ai/index.ts
(providers as unknown as ProviderConfig[]).forEach(...)

// SONRA:
function isProviderConfigArray(arr: unknown): arr is ProviderConfig[] {
  return Array.isArray(arr) && arr.every(isProviderConfig);
}

if (isProviderConfigArray(providers)) {
  providers.forEach(...)
}
```

---

## 7. AI Servisleri Refactoring

### 7.1 Base Provider Class

```typescript
// services/ai/providers/base.ts
export abstract class BaseProvider implements AIProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  // Shared error handling
  protected async handleApiError(response: Response): Promise<never> {
    const errorText = await response.text();
    let errorMessage = `HTTP ${response.status}`;

    try {
      const error = JSON.parse(errorText);
      errorMessage = error.error?.message || error.message || errorMessage;
    } catch {
      if (errorText) {
        errorMessage += `: ${errorText.slice(0, 100)}`;
      }
    }

    throw new FluidFlowError(errorMessage, ErrorCode.AI_PROVIDER_ERROR, {
      status: response.status,
      provider: this.config.type,
    });
  }

  // Shared SSE parsing
  protected async parseSSEStream(
    response: Response,
    extractor: (chunk: unknown) => string | null,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<string> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;

          try {
            const parsed = JSON.parse(line.slice(6));
            const text = extractor(parsed);
            if (text) {
              fullText += text;
              onChunk({ text, done: false });
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    onChunk({ text: '', done: true });
    return fullText;
  }

  // Shared conversation history building
  protected buildMessages(
    history: ConversationMessage[],
    systemPrompt: string,
    currentPrompt: string
  ): ProviderMessage[] {
    return this.transformMessages([
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: currentPrompt },
    ]);
  }

  // Override in subclass for provider-specific transformations
  protected transformMessages(messages: ConversationMessage[]): ProviderMessage[] {
    return messages as ProviderMessage[];
  }

  // Abstract methods
  abstract testConnection(): Promise<ConnectionTestResult>;
  abstract generate(request: GenerationRequest, model: string): Promise<GenerationResponse>;
  abstract generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<string>;
  abstract listModels?(): Promise<ModelInfo[]>;
}
```

### 7.2 Provider Implementations

```typescript
// services/ai/providers/openai.ts
export class OpenAIProvider extends BaseProvider {
  protected transformMessages(messages: ConversationMessage[]): OpenAIMessage[] {
    // OpenAI uses messages as-is
    return messages.map(m => ({
      role: m.role,
      content: m.content,
    }));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await fetchWithTimeout(`${this.config.baseUrl}/models`, {
        headers: this.getHeaders(),
        timeout: 'test',
      });

      if (!response.ok) {
        await this.handleApiError(response);
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<string> {
    const response = await fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model,
        messages: this.buildMessages(
          request.conversationHistory,
          request.systemPrompt,
          request.prompt
        ),
        stream: true,
        stream_options: { include_usage: true },
      }),
      timeout: 'generate',
    });

    if (!response.ok) {
      await this.handleApiError(response);
    }

    return this.parseSSEStream(
      response,
      (chunk: any) => chunk.choices?.[0]?.delta?.content ?? null,
      onChunk
    );
  }

  // ... other methods
}

// services/ai/providers/gemini.ts
export class GeminiProvider extends BaseProvider {
  protected transformMessages(messages: ConversationMessage[]): GeminiContent[] {
    // Gemini uses 'model' instead of 'assistant'
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : m.role,
        parts: [{ text: m.content }],
      }));
  }

  // ... Gemini-specific implementation
}

// services/ai/providers/anthropic.ts
export class AnthropicProvider extends BaseProvider {
  protected transformMessages(messages: ConversationMessage[]): AnthropicMessage[] {
    // Anthropic uses separate system parameter
    return messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role,
        content: m.content,
      }));
  }

  private getSystemPrompt(messages: ConversationMessage[]): string {
    return messages.find(m => m.role === 'system')?.content ?? '';
  }

  // ... Anthropic-specific implementation
}
```

### 7.3 Provider Capability Registry

```typescript
// services/ai/capabilities.ts
export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsVision: boolean;
  supportsJsonSchema: boolean;
  supportsAdditionalProperties: boolean;
  maxContextTokens: number;
  defaultTimeouts: {
    test: number;
    generate: number;
    listModels: number;
  };
}

export const PROVIDER_CAPABILITIES: Record<ProviderType, ProviderCapabilities> = {
  gemini: {
    supportsStreaming: true,
    supportsVision: true,
    supportsJsonSchema: true,
    supportsAdditionalProperties: false,
    maxContextTokens: 1_000_000,
    defaultTimeouts: { test: 30_000, generate: 300_000, listModels: 30_000 },
  },
  openai: {
    supportsStreaming: true,
    supportsVision: true,
    supportsJsonSchema: true,
    supportsAdditionalProperties: true,
    maxContextTokens: 128_000,
    defaultTimeouts: { test: 30_000, generate: 300_000, listModels: 30_000 },
  },
  anthropic: {
    supportsStreaming: true,
    supportsVision: true,
    supportsJsonSchema: false, // Uses prompt engineering
    supportsAdditionalProperties: false,
    maxContextTokens: 200_000,
    defaultTimeouts: { test: 30_000, generate: 300_000, listModels: 30_000 },
  },
  ollama: {
    supportsStreaming: true,
    supportsVision: false, // Model dependent
    supportsJsonSchema: false,
    supportsAdditionalProperties: false,
    maxContextTokens: 32_000,
    defaultTimeouts: { test: 60_000, generate: 600_000, listModels: 30_000 },
  },
  lmstudio: {
    supportsStreaming: true,
    supportsVision: false,
    supportsJsonSchema: false,
    supportsAdditionalProperties: false,
    maxContextTokens: 32_000,
    defaultTimeouts: { test: 60_000, generate: 600_000, listModels: 30_000 },
  },
  zai: {
    supportsStreaming: true,
    supportsVision: true,
    supportsJsonSchema: true,
    supportsAdditionalProperties: true,
    maxContextTokens: 128_000,
    defaultTimeouts: { test: 30_000, generate: 300_000, listModels: 30_000 },
  },
  openrouter: {
    supportsStreaming: true,
    supportsVision: true, // Model dependent
    supportsJsonSchema: true, // Model dependent
    supportsAdditionalProperties: true,
    maxContextTokens: 128_000,
    defaultTimeouts: { test: 30_000, generate: 300_000, listModels: 30_000 },
  },
  custom: {
    supportsStreaming: true,
    supportsVision: false,
    supportsJsonSchema: false,
    supportsAdditionalProperties: false,
    maxContextTokens: 32_000,
    defaultTimeouts: { test: 30_000, generate: 300_000, listModels: 30_000 },
  },
};

// Helper functions
export function getCapabilities(type: ProviderType): ProviderCapabilities {
  return PROVIDER_CAPABILITIES[type];
}

export function supportsFeature(
  type: ProviderType,
  feature: keyof Omit<ProviderCapabilities, 'maxContextTokens' | 'defaultTimeouts'>
): boolean {
  return PROVIDER_CAPABILITIES[type][feature];
}
```

### 7.4 Retry Logic Entegrasyonu

```typescript
// services/ai/utils/retry.ts
export interface RetryOptions {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffFactor: number;
  retryableErrors: (error: unknown) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffFactor: 2,
  retryableErrors: isTransientError,
};

function isTransientError(error: unknown): boolean {
  if (error instanceof FluidFlowError) {
    return [
      ErrorCode.NETWORK_ERROR,
      ErrorCode.TIMEOUT,
      ErrorCode.AI_RATE_LIMITED,
    ].includes(error.code);
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('rate limit') ||
      message.includes('503') ||
      message.includes('429')
    );
  }

  return false;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries || !opts.retryableErrors(error)) {
        throw error;
      }

      console.warn(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * opts.backoffFactor, opts.maxDelayMs);
    }
  }

  throw lastError;
}

// Usage in providers
async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
  return withRetry(async () => {
    const response = await fetchWithTimeout(...);
    // ...
  });
}
```

---

## 8. Yeni Dosya Yapısı

### 8.1 Hedef Dizin Yapısı

```
FluidFlow/
├── App.tsx                          (~300 satır, orchestrator only)
├── index.tsx
│
├── components/
│   ├── shared/
│   │   ├── BaseModal.tsx            (YENİ)
│   │   ├── ProviderIcon.tsx         (mevcut)
│   │   ├── Button.tsx               (YENİ)
│   │   ├── Input.tsx                (YENİ)
│   │   └── Spinner.tsx              (YENİ)
│   │
│   ├── ControlPanel/
│   │   ├── index.tsx                (~500 satır, refactored)
│   │   ├── ChatModule/
│   │   │   ├── index.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── MessageList.tsx      (YENİ)
│   │   │   └── MessageItem.tsx      (YENİ)
│   │   ├── GenerationModule/
│   │   │   ├── index.tsx            (YENİ)
│   │   │   ├── GenerateButton.tsx
│   │   │   └── StreamingIndicator.tsx (YENİ)
│   │   ├── UploadModule/
│   │   │   ├── index.tsx            (YENİ)
│   │   │   ├── FileUploadZone.tsx
│   │   │   └── UploadCards.tsx
│   │   ├── modals/                  (lazy loaded)
│   │   │   ├── BatchGenerationModal.tsx
│   │   │   ├── PromptImproverModal.tsx
│   │   │   └── TechStackModal.tsx
│   │   └── ...
│   │
│   ├── PreviewPanel/
│   │   ├── index.tsx                (~200 satır, refactored)
│   │   ├── TabRouter.tsx            (YENİ)
│   │   ├── tabs/
│   │   │   ├── PreviewTab.tsx       (YENİ)
│   │   │   ├── CodeTab.tsx          (YENİ)
│   │   │   └── AnalysisTab.tsx      (YENİ, lazy)
│   │   ├── overlays/
│   │   │   ├── InspectionOverlay.tsx (YENİ)
│   │   │   └── DeviceFrame.tsx      (YENİ)
│   │   └── ...
│   │
│   ├── DiffModal/                   (YENİ - App.tsx'den)
│   │   ├── index.tsx
│   │   ├── DiffCalculator.ts
│   │   ├── FileList.tsx
│   │   └── DiffView.tsx
│   │
│   ├── GitPanel/                    (mevcut)
│   ├── MegaSettingsModal/           (mevcut)
│   └── ContextIndicator/            (mevcut)
│
├── hooks/
│   ├── useProject.ts                (~150 satır, composition)
│   ├── useProjectManagement.ts      (YENİ)
│   ├── useGitOperations.ts          (YENİ)
│   ├── useContextPersistence.ts     (YENİ)
│   ├── useVersionHistory.ts         (mevcut, optimized)
│   ├── useModalManager.ts           (YENİ)
│   ├── useProviderConfig.ts         (YENİ)
│   ├── useChatState.ts              (YENİ)
│   ├── useGeneration.ts             (YENİ)
│   ├── useFileUpload.ts             (YENİ)
│   ├── useTimers.ts                 (YENİ)
│   └── ...
│
├── services/
│   ├── ai/
│   │   ├── index.ts                 (refactored)
│   │   ├── capabilities.ts          (YENİ)
│   │   ├── types.ts                 (mevcut)
│   │   ├── providers/
│   │   │   ├── base.ts              (YENİ)
│   │   │   ├── index.ts
│   │   │   ├── gemini.ts            (refactored)
│   │   │   ├── openai.ts            (refactored)
│   │   │   ├── anthropic.ts         (refactored)
│   │   │   ├── ollama.ts            (refactored)
│   │   │   ├── lmstudio.ts          (refactored)
│   │   │   └── zai.ts               (refactored)
│   │   └── utils/
│   │       ├── errorHandling.ts     (YENİ)
│   │       ├── streamParser.ts      (YENİ)
│   │       ├── messageBuilder.ts    (YENİ)
│   │       ├── retry.ts             (YENİ)
│   │       ├── fetchWithTimeout.ts  (mevcut)
│   │       └── jsonOutput.ts        (mevcut)
│   │
│   ├── wipStorage.ts                (YENİ)
│   ├── commandHandlers.ts           (YENİ)
│   ├── fileOperations.ts            (YENİ)
│   ├── projectApi.ts                (mevcut)
│   └── ...
│
├── utils/
│   ├── fileComparison.ts            (YENİ)
│   ├── errors.ts                    (YENİ)
│   ├── cleanCode.ts                 (refactored, split)
│   ├── validation.ts                (mevcut)
│   └── ...
│
├── shared/                          (YENİ - client/server paylaşımlı)
│   ├── safeJson.ts
│   └── types.ts
│
├── constants/                       (YENİ)
│   ├── index.ts
│   ├── timing.ts
│   ├── limits.ts
│   └── ui.ts
│
├── data/                            (YENİ)
│   └── defaultFiles.ts
│
├── contexts/
│   └── AppContext.tsx               (aktif edilecek)
│
├── server/
│   ├── constants.ts                 (YENİ)
│   ├── api/
│   │   ├── projects.ts              (refactored, split)
│   │   ├── projectCrud.ts           (YENİ)
│   │   ├── fileLocking.ts           (YENİ)
│   │   └── ...
│   └── utils/
│       ├── safeJson.ts              → shared/safeJson.ts re-export
│       └── validation.ts            (mevcut)
│
└── types/
    └── index.ts                     (mevcut)
```

### 8.2 Dosya Sayısı Değişimi

| Dizin | Mevcut | Hedef | Değişim |
|-------|--------|-------|---------|
| components/ | 78 | 95 | +17 (daha küçük dosyalar) |
| hooks/ | 9 | 17 | +8 |
| services/ | 22 | 28 | +6 |
| utils/ | 10 | 12 | +2 |
| shared/ | 0 | 2 | +2 |
| constants/ | 0 | 4 | +4 |
| data/ | 0 | 1 | +1 |
| **Toplam** | **119** | **159** | **+40** |

**Not:** Dosya sayısı artıyor ancak:
- Ortalama dosya boyutu ~350 satırdan ~200 satıra düşüyor
- Her dosya tek bir sorumluluğa sahip oluyor
- Test edilebilirlik artıyor

---

## 9. Uygulama Fazları

### Faz 1: Hızlı Kazanımlar (2-3 gün)

**Hedef:** Minimum değişiklikle maksimum etki

| # | Görev | Dosya | Etki | Efor |
|---|-------|-------|------|------|
| 1.1 | constants.ts oluştur | `constants/` | Kod kalitesi | 2 saat |
| 1.2 | safeJson birleştir | `shared/safeJson.ts` | DRY | 1 saat |
| 1.3 | JSON.stringify optimize | `utils/fileComparison.ts` | Performans | 3 saat |
| 1.4 | Memory leak düzelt | `hooks/useChatState.ts` | Stabilite | 2 saat |
| 1.5 | errors.ts oluştur | `utils/errors.ts` | Kod kalitesi | 2 saat |

**Toplam Efor:** ~10 saat

**Checklist:**
- [ ] 1.1 `constants/index.ts` oluşturuldu
- [ ] 1.1 Tüm magic number'lar taşındı
- [ ] 1.2 `shared/safeJson.ts` oluşturuldu
- [ ] 1.2 Client/server re-export'ları güncellendi
- [ ] 1.3 `createFileHash()` fonksiyonu yazıldı
- [ ] 1.3 App.tsx'de JSON.stringify kaldırıldı
- [ ] 1.4 `syncedMessageIdsRef` temizleme eklendi
- [ ] 1.4 Timer cleanup hook'u oluşturuldu
- [ ] 1.5 `FluidFlowError` class'ı yazıldı
- [ ] 1.5 Error codes tanımlandı

---

### Faz 2: Servis Katmanı (5-7 gün)

**Hedef:** Tekrar eden mantığı merkezi servislere taşı

| # | Görev | Dosya | Etki | Efor |
|---|-------|-------|------|------|
| 2.1 | WIP Storage service | `services/wipStorage.ts` | Separation | 4 saat |
| 2.2 | AI error handling | `services/ai/utils/errorHandling.ts` | DRY | 3 saat |
| 2.3 | Stream parser | `services/ai/utils/streamParser.ts` | DRY | 4 saat |
| 2.4 | Provider capabilities | `services/ai/capabilities.ts` | Features | 2 saat |
| 2.5 | useProviderConfig hook | `hooks/useProviderConfig.ts` | DRY | 6 saat |
| 2.6 | Retry logic | `services/ai/utils/retry.ts` | Reliability | 3 saat |
| 2.7 | BaseProvider class | `services/ai/providers/base.ts` | DRY | 6 saat |

**Toplam Efor:** ~28 saat

**Checklist:**
- [ ] 2.1 `WIPService` interface tanımlandı
- [ ] 2.1 IndexedDB işlemleri App.tsx'den taşındı
- [ ] 2.2 `handleApiError()` centralize edildi
- [ ] 2.2 Tüm provider'lar güncellendi
- [ ] 2.3 `parseSSEStream()` yazıldı
- [ ] 2.3 OpenAI, Anthropic, ZAI, LMStudio güncellendi
- [ ] 2.4 Capability registry oluşturuldu
- [ ] 2.5 `useProviderConfig` hook'u yazıldı
- [ ] 2.5 AISettingsModal refactor edildi
- [ ] 2.5 AIProviderSettings refactor edildi
- [ ] 2.6 `withRetry()` entegre edildi
- [ ] 2.7 BaseProvider abstract class yazıldı
- [ ] 2.7 Tüm provider'lar extend edildi

---

### Faz 3: Bileşen Refactoring (10-14 gün)

**Hedef:** God component'ları parçala, prop drilling'i çöz

| # | Görev | Dosya | Etki | Efor |
|---|-------|-------|------|------|
| 3.1 | DiffModal ayır | `components/DiffModal/` | Separation | 4 saat |
| 3.2 | BaseModal oluştur | `components/shared/BaseModal.tsx` | DRY | 4 saat |
| 3.3 | useModalManager | `hooks/useModalManager.ts` | State mgmt | 3 saat |
| 3.4 | AppContext aktif et | `App.tsx`, `contexts/` | Prop drilling | 8 saat |
| 3.5 | ControlPanel split | `components/ControlPanel/` | Separation | 16 saat |
| 3.6 | PreviewPanel split | `components/PreviewPanel/` | Separation | 12 saat |
| 3.7 | useProject split | `hooks/` | Separation | 6 saat |
| 3.8 | Lazy loading modals | `components/` | Bundle size | 4 saat |
| 3.9 | Modal migrations | Tüm modal'lar | DRY | 8 saat |

**Toplam Efor:** ~65 saat

**Checklist:**
- [ ] 3.1 DiffModal component'ı ayrı klasöre taşındı
- [ ] 3.1 DiffCalculator utility'si oluşturuldu
- [ ] 3.2 BaseModal, ModalContent, ModalFooter yazıldı
- [ ] 3.2 ModalButton variants eklendi
- [ ] 3.3 Modal state management centralize edildi
- [ ] 3.3 18+ useState App.tsx'den kaldırıldı
- [ ] 3.4 AppProvider App.tsx'e eklendi
- [ ] 3.4 ControlPanel context'ten okuyor
- [ ] 3.4 PreviewPanel context'ten okuyor
- [ ] 3.5 ChatModule oluşturuldu
- [ ] 3.5 GenerationModule oluşturuldu
- [ ] 3.5 UploadModule oluşturuldu
- [ ] 3.5 useChatState hook'u yazıldı
- [ ] 3.5 useGeneration hook'u yazıldı
- [ ] 3.6 TabRouter oluşturuldu
- [ ] 3.6 Tab component'ları ayrıldı
- [ ] 3.6 InspectionOverlay ayrıldı
- [ ] 3.7 useProjectManagement ayrıldı
- [ ] 3.7 useGitOperations ayrıldı
- [ ] 3.7 useContextPersistence ayrıldı
- [ ] 3.8 React.lazy imports eklendi
- [ ] 3.8 Suspense boundaries eklendi
- [ ] 3.9 En az 10 modal BaseModal'a migrate edildi

---

### Faz 4: AI Provider Refactoring (5-7 gün)

**Hedef:** Provider'ları standardize et, test edilebilirliği artır

| # | Görev | Dosya | Etki | Efor |
|---|-------|-------|------|------|
| 4.1 | OpenAI migrate | `providers/openai.ts` | Standardization | 4 saat |
| 4.2 | Anthropic migrate | `providers/anthropic.ts` | Standardization | 4 saat |
| 4.3 | Gemini migrate | `providers/gemini.ts` | Standardization | 4 saat |
| 4.4 | Ollama/LMStudio | `providers/` | Standardization | 4 saat |
| 4.5 | ZAI migrate | `providers/zai.ts` | Standardization | 3 saat |
| 4.6 | Message builders | `utils/messageBuilder.ts` | DRY | 3 saat |
| 4.7 | Unit tests | `tests/ai/` | Quality | 6 saat |

**Toplam Efor:** ~28 saat

**Checklist:**
- [ ] 4.1 OpenAIProvider extends BaseProvider
- [ ] 4.1 Error handling centralized
- [ ] 4.1 Stream parsing centralized
- [ ] 4.2 AnthropicProvider extends BaseProvider
- [ ] 4.2 System prompt handling preserved
- [ ] 4.3 GeminiProvider extends BaseProvider
- [ ] 4.3 Role mapping preserved
- [ ] 4.4 OllamaProvider extends BaseProvider
- [ ] 4.4 LMStudioProvider extends BaseProvider
- [ ] 4.5 ZAIProvider extends BaseProvider
- [ ] 4.6 Message builder adapters yazıldı
- [ ] 4.7 Provider unit tests yazıldı
- [ ] 4.7 Integration tests yazıldı

---

## 10. Test Stratejisi

### 10.1 Test Kapsamı Hedefleri

| Katman | Mevcut | Hedef | Öncelik |
|--------|--------|-------|---------|
| Unit Tests | ~20% | 60% | P1 |
| Integration Tests | ~10% | 40% | P2 |
| E2E Tests | ~5% | 20% | P3 |

### 10.2 Kritik Test Alanları

```typescript
// tests/services/ai/providers/
describe('BaseProvider', () => {
  describe('handleApiError', () => {
    it('should parse JSON error messages', async () => { ... });
    it('should handle plain text errors', async () => { ... });
    it('should include status code', async () => { ... });
  });

  describe('parseSSEStream', () => {
    it('should parse complete chunks', async () => { ... });
    it('should handle buffer overflow', async () => { ... });
    it('should emit done signal', async () => { ... });
  });
});

// tests/hooks/useProviderConfig.test.ts
describe('useProviderConfig', () => {
  it('should add provider', () => { ... });
  it('should update provider', () => { ... });
  it('should delete provider', () => { ... });
  it('should persist to localStorage', () => { ... });
  it('should test connection', async () => { ... });
});

// tests/utils/fileComparison.test.ts
describe('createFileHash', () => {
  it('should produce stable hash for same files', () => { ... });
  it('should produce different hash for different files', () => { ... });
  it('should be order-independent', () => { ... });
});

// tests/services/wipStorage.test.ts
describe('WIPStorage', () => {
  it('should save WIP data', async () => { ... });
  it('should restore WIP data', async () => { ... });
  it('should clear WIP data', async () => { ... });
  it('should handle concurrent operations', async () => { ... });
});
```

### 10.3 Regression Test Checklist

Her faz sonunda çalıştırılacak:

- [ ] Mevcut testler geçiyor (`npm test`)
- [ ] Type check başarılı (`npm run type-check`)
- [ ] Lint hatasız (`npm run lint`)
- [ ] Build başarılı (`npm run build`)
- [ ] Manuel test: Proje oluşturma/açma
- [ ] Manuel test: AI generation (streaming)
- [ ] Manuel test: Git commit/push
- [ ] Manuel test: WIP persistence (sayfa yenileme)
- [ ] Manuel test: Modal'lar açılıp kapanıyor

---

## 11. Risk Analizi

### 11.1 Yüksek Riskli Değişiklikler

| Değişiklik | Risk | Mitigation |
|------------|------|------------|
| AppContext aktivasyonu | State sync sorunları | Kapsamlı test, incremental migration |
| BaseProvider migration | Provider regression | Her provider için ayrı test suite |
| ControlPanel split | Feature regression | Feature flag ile gradual rollout |
| JSON.stringify removal | Comparison bugs | Parallel run, hash validation |

### 11.2 Rollback Planı

```bash
# Her faz için branch oluştur
git checkout -b refactor/phase-1-quick-wins
git checkout -b refactor/phase-2-services
git checkout -b refactor/phase-3-components
git checkout -b refactor/phase-4-ai-providers

# Sorun durumunda
git checkout main
git branch -D refactor/phase-X  # Problematic branch
```

### 11.3 Feature Flags

```typescript
// utils/featureFlags.ts
export const FEATURE_FLAGS = {
  USE_NEW_FILE_COMPARISON: false,  // Faz 1 sonrası true
  USE_APP_CONTEXT: false,          // Faz 3 sonrası true
  USE_BASE_PROVIDER: false,        // Faz 4 sonrası true
  LAZY_LOAD_MODALS: false,         // Faz 3 sonrası true
} as const;

// Usage
if (FEATURE_FLAGS.USE_NEW_FILE_COMPARISON) {
  hasChanges = fileHash !== lastCommittedHashRef.current;
} else {
  hasChanges = JSON.stringify(files) !== lastCommittedFilesRef.current;
}
```

---

## 12. Başarı Metrikleri

### 12.1 Kod Metrikleri

| Metrik | Mevcut | Faz 1 | Faz 2 | Faz 3 | Faz 4 |
|--------|--------|-------|-------|-------|-------|
| Toplam Satır | 25,000 | 24,500 | 24,000 | 22,000 | 21,000 |
| Max Dosya Satırı | 3,343 | 3,343 | 3,000 | 800 | 500 |
| `any` Kullanımı | 88 | 88 | 70 | 40 | <10 |
| Magic Numbers | 25+ | 0 | 0 | 0 | 0 |
| Duplicate Code | 1,500 | 1,400 | 1,000 | 400 | 300 |

### 12.2 Performans Metrikleri

| Metrik | Mevcut | Hedef | Ölçüm Yöntemi |
|--------|--------|-------|---------------|
| Initial Bundle | ~850KB | ~650KB | `npm run build && du -h dist/` |
| File Change Response | ~100ms | ~5ms | Performance.mark() |
| Modal Open Time | ~200ms | ~50ms | React DevTools |
| Re-renders per Edit | ~15 | ~5 | React DevTools Profiler |
| Memory (1hr session) | ~200MB | ~100MB | Chrome DevTools |

### 12.3 Kalite Metrikleri

| Metrik | Mevcut | Hedef |
|--------|--------|-------|
| Test Coverage | ~20% | 60% |
| TypeScript Strict | Partial | Full |
| ESLint Warnings | 0 | 0 |
| Circular Dependencies | 3 | 0 |

---

## Appendix A: Komut Referansı

```bash
# Development
npm run dev                  # Start dev servers
npm run type-check           # TypeScript validation
npm run lint                 # ESLint check
npm run lint:fix             # Auto-fix lint issues

# Testing
npm test                     # Watch mode
npm run test:run             # Single run
npm run test:coverage        # With coverage

# Build
npm run build                # Production build
npm run analyze              # Bundle analysis (if configured)

# Git (Refactoring branches)
git checkout -b refactor/phase-X-description
git push -u origin refactor/phase-X-description
```

---

## Appendix B: Dosya Boyutu Referansı

```
Mevcut En Büyük Dosyalar (satır):
1. components/ControlPanel/index.tsx     3,343
2. App.tsx                                1,411
3. utils/cleanCode.ts                     1,063
4. server/api/projects.ts                   857
5. hooks/useProject.ts                      752
6. components/AISettingsModal.tsx           686
7. components/ControlPanel/AIProviderSettings.tsx  643
8. contexts/AppContext.tsx                  620
9. components/PreviewPanel/index.tsx        600+
10. services/ai/index.ts                    519

Hedef (satır):
- Hiçbir dosya >500 satır olmamalı
- Ortalama dosya boyutu: ~150-200 satır
- Component'lar: ~100-300 satır
- Hook'lar: ~50-150 satır
- Utility'ler: ~50-200 satır
```

---

## Appendix C: Changelog Template

```markdown
## [Unreleased]

### Refactoring Phase 1 - Quick Wins
- Added: `constants/` directory with centralized constants
- Added: `shared/safeJson.ts` for client/server code sharing
- Added: `utils/fileComparison.ts` with optimized file hashing
- Added: `utils/errors.ts` with structured error handling
- Fixed: Memory leak in syncedMessageIdsRef
- Changed: Replaced JSON.stringify comparison with hash-based comparison

### Refactoring Phase 2 - Services
- Added: `services/wipStorage.ts` for IndexedDB abstraction
- Added: `services/ai/utils/errorHandling.ts` for centralized error handling
- Added: `services/ai/utils/streamParser.ts` for unified SSE parsing
- Added: `services/ai/capabilities.ts` for provider feature registry
- Added: `hooks/useProviderConfig.ts` for provider management
- Changed: All AI providers now use centralized error handling
- Changed: All SSE-based providers use unified stream parser

### Refactoring Phase 3 - Components
...

### Refactoring Phase 4 - AI Providers
...
```

---

**Son Güncelleme:** 2025-12-15
**Sonraki Review:** Faz 1 tamamlandığında
