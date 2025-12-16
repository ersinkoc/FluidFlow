# FluidFlow Refactoring Plan

Bu dosya, FluidFlow projesinin refactoring planını içerir.

---

## Mevcut Durum Analizi

### Kritik Boyut Sorunları

| Dosya | Satır | Sorun |
|-------|-------|-------|
| `components/ControlPanel/index.tsx` | 1,122 | Çok fazla sorumluluk (chat, generation, context, modals) |
| `hooks/useCodeGeneration.ts` | 979 | Streaming, parsing, continuation hepsi bir arada |
| `services/errorFixAgent.ts` | 973 | localFixEngine ile kod tekrarı |
| `components/PreviewPanel/index.tsx` | 872 | 10+ tab yönetimi tek dosyada |
| `hooks/useContinuationGeneration.ts` | 810 | useCodeGeneration ile benzer mantık |
| `services/localFixEngine.ts` | 806 | errorFixAgent ile kod tekrarı |
| `hooks/useAutoFix.ts` | 586 | Parsing mantığı tekrarı |

### Kod Tekrarı

- **Error Fix Servisleri:** `errorFixAgent.ts` + `localFixEngine.ts` = 1,779 satır (benzer mantık)
- **AI Providers:** 6 provider dosyası, her birinde tekrarlanan fetch/parse/stream kodu
- **Hook'larda Error Handling:** Her hook'ta benzer try-catch pattern

---

## Faz 1: Kritik Dosyaları Küçültme

### 1.1 ControlPanel Refactoring

**Hedef:** 1,122 satır → ~400-500 satır

**Yeni Dosyalar:**
```
components/ControlPanel/
├── index.tsx                 # Ana orchestrator (400-500 satır)
├── ChatContainer.tsx         # ChatPanel + ChatInput yönetimi
├── GenerationController.tsx  # Generation state ve UI
├── hooks/
│   ├── useGenerationOrchestrator.ts  # Generation hook'larını birleştirir
│   ├── useContextSync.ts             # Context manager sync
│   └── useControlPanelModals.ts      # Modal state yönetimi
└── utils.ts                  # Mevcut utils
```

**Adımlar:**
- [ ] `ChatContainer.tsx` extract et (ChatPanel + ChatInput wrapper)
- [ ] `useGenerationOrchestrator.ts` hook'u oluştur
- [x] `useContextSync.ts` hook'u oluştur ✅
- [x] `useControlPanelModals.ts` hook'u oluştur ✅
- [x] `useChatState.ts` hook'u oluştur ✅
- [x] Ana index.tsx'i hook'larla güncelle (1,122 → 1,035 satır) ✅
- [x] `restoreHistory.ts` utility oluştur (~140 satır azaldı) ✅
- [x] `consultantMode.ts` utility oluştur (~60 satır azaldı) ✅
- [x] **Mevcut durum: 1,122 → 829 satır (%26 azalma)** ✅

---

### 1.2 PreviewPanel Refactoring

**Hedef:** 872 satır → ~400-500 satır

**Yeni Yapı:**
```
components/PreviewPanel/
├── index.tsx              # Tab registry + orchestrator
├── TabRegistry.tsx        # Tab config ve render logic
├── hooks/
│   ├── useInspectMode.ts      # Inspect mode logic
│   ├── useIframeMessaging.ts  # Iframe postMessage handling
│   └── useConsoleLogging.ts   # Console/network logging
└── tabs/
    ├── index.ts           # Tab exports
    └── types.ts           # Tab interfaces
```

**Adımlar:**
- [ ] `TabRegistry` pattern oluştur
- [x] `useInspectMode.ts` extract et ✅ (134 satır)
- [x] `useIframeMessaging.ts` extract et ✅ (186 satır - console + network + URL dahil)
- [ ] Tab render logic'i TabRegistry'ye taşı
- [x] **Mevcut durum: 872 → 741 satır (%15 azalma)** ✅

---

### 1.3 useCodeGeneration Refactoring

**Hedef:** 979 satır → ~300-400 satır

**Yeni Yapı:**
```
hooks/
├── useCodeGeneration.ts        # Orchestrator (300-400 satır)
├── generation/
│   ├── useGenerationStreaming.ts   # Streaming mechanics
│   ├── useGenerationParsing.ts     # Response parsing
│   └── useGenerationState.ts       # Generation state management
```

**Adımlar:**
- [ ] Streaming logic'i `useGenerationStreaming.ts`'e taşı
- [ ] Parsing logic'i `useGenerationParsing.ts`'e taşı
- [ ] State management'ı `useGenerationState.ts`'e taşı
- [ ] Ana hook'u orchestrator olarak düzenle

---

## Faz 2: Servis Katmanı Konsolidasyonu

### 2.1 Error Fix Servisleri Birleştirme

**Hedef:** 1,779 satır → ~800 satır

**Yeni Yapı:**
```
services/errorFix/
├── commonImports.ts      # Import dictionary (490 satır - data only)
├── index.ts              # Public API (planned)
├── analyzer.ts           # Error classification (mevcut: errorAnalyzer.ts)
├── strategies/
│   ├── localFixes.ts     # Pattern-based fixes (mevcut: localFixEngine.ts)
│   └── aiFixes.ts        # AI-powered fixes (mevcut: errorFixAgent.ts)
└── utils.ts              # Shared utilities (planned)
```

**Adımlar:**
- [x] `services/errorFix/` klasörü oluştur ✅
- [x] `commonImports.ts` - COMMON_IMPORTS data'sını ayır ✅
- [x] **localFixEngine.ts: 806 → 328 satır (%59 azalma)** ✅
- [ ] `analyzer.ts` - error classification logic'i birleştir
- [ ] `strategies/localFixes.ts` - pattern-based fix'leri taşı
- [ ] `strategies/aiFixes.ts` - AI fix logic'i taşı
- [ ] Strategy pattern ile birleştir

---

### 2.2 AI Provider Base Class

**Hedef:** 1,800+ satır → ~900 satır

**Yeni Yapı:**
```
services/ai/
├── index.ts
├── types.ts
├── BaseProvider.ts       # Abstract base class (YENİ)
├── providers/
│   ├── index.ts
│   ├── gemini.ts         # extends BaseProvider
│   ├── openai.ts         # extends BaseProvider
│   ├── anthropic.ts      # extends BaseProvider
│   ├── zai.ts            # extends BaseProvider
│   ├── ollama.ts         # extends BaseProvider
│   └── lmstudio.ts       # extends BaseProvider
└── utils/
    ├── httpClient.ts     # Shared fetch logic (YENİ)
    ├── streamParser.ts
    └── errorHandling.ts
```

**Adımlar:**
- [ ] `BaseProvider.ts` abstract class oluştur
  - `fetchWithRetry()` - shared fetch logic
  - `handleError()` - error handling
  - `parseResponse()` - common parsing
  - abstract `buildRequest()` - provider-specific
  - abstract `parseStream()` - provider-specific
- [ ] `httpClient.ts` utility oluştur
- [ ] Her provider'ı BaseProvider'dan extend et
- [ ] Duplicate kodu temizle

---

### 2.3 ConversationContext Modülerleştirme

**Hedef:** 373 satır → ~250 satır (4 dosya)

**Yeni Yapı:**
```
services/conversationContext/
├── index.ts              # Public API + ContextManager
├── storage.ts            # LocalStorage persistence
├── tokenEstimator.ts     # Token calculation
├── compactor.ts          # AI-based compaction
└── types.ts              # Interfaces
```

**Adımlar:**
- [ ] `storage.ts` - localStorage logic'i extract et
- [ ] `tokenEstimator.ts` - token hesaplama logic'i extract et
- [ ] `compactor.ts` - compaction logic'i extract et
- [ ] Ana class'ı orchestrator olarak düzenle

---

## Faz 3: Type ve Constant Organizasyonu

### 3.1 Type Tanımları Merkezi Hale Getirme

**Yeni Yapı:**
```
types/
├── index.ts          # Re-exports
├── common.ts         # FileSystem, TabType, etc.
├── components.ts     # Component prop types
├── ai.ts             # AI provider types
├── project.ts        # Project, Git types
├── generation.ts     # Generation types
└── errors.ts         # Error types
```

**Adımlar:**
- [ ] Component prop type'larını `components.ts`'e topla
- [ ] AI type'larını `ai.ts`'e taşı (services/ai/types.ts'den)
- [ ] Project type'larını `project.ts`'e taşı
- [ ] Generation type'larını `generation.ts`'e taşı
- [ ] Import'ları güncelle

---

### 3.2 Constants Organizasyonu

**Yeni Yapı:**
```
constants/
├── index.ts          # Re-exports
├── defaults.ts       # Default files, configs
├── limits.ts         # Size, token limits
├── timing.ts         # Timeouts, debounce values
├── ui.ts             # Colors, dimensions
├── api.ts            # Endpoints, headers
├── generation.ts     # Generation-specific
└── messages.ts       # Error messages, labels
```

**Adımlar:**
- [ ] Hardcoded değerleri tespit et (grep ile)
- [ ] Kategori bazlı constant dosyaları oluştur
- [ ] Hardcoded değerleri constant'larla değiştir

---

## Faz 4: Component Organizasyonu

### 4.1 ControlPanel Feature-Based Yapı

**Yeni Yapı:**
```
components/ControlPanel/
├── index.tsx
├── Chat/
│   ├── index.tsx         # ChatContainer
│   ├── ChatPanel.tsx
│   ├── ChatInput.tsx
│   └── types.ts
├── Generation/
│   ├── index.tsx
│   ├── GenerateButton.tsx
│   └── StreamingStatus.tsx
├── Prompts/
│   ├── index.tsx
│   ├── PromptInput.tsx
│   ├── PromptLibrary.tsx
│   └── PromptEngineerModal.tsx
├── Settings/
│   ├── index.tsx
│   ├── SettingsPanel.tsx
│   └── AIProviderSettings.tsx
├── Project/
│   ├── index.tsx
│   └── ProjectPanel.tsx
└── hooks/
    └── ... (from Faz 1)
```

**Adımlar:**
- [ ] Feature klasörleri oluştur
- [ ] İlgili component'ları taşı
- [ ] Her feature için index.tsx oluştur
- [ ] Import path'leri güncelle

---

## Faz 5: Hook İyileştirmeleri

### 5.1 Error Handling Standardizasyonu

**Yeni Hook:**
```typescript
// hooks/useAsyncOperation.ts
export function useAsyncOperation<T>() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const execute = useCallback(async (fn: () => Promise<T>) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fn();
      return result;
    } catch (e) {
      const error = e instanceof Error ? e : new Error(String(e));
      setError(error);
      debugLog.error('operation', error.message);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { execute, isLoading, error };
}
```

**Adımlar:**
- [ ] `useAsyncOperation.ts` hook'u oluştur
- [ ] Hook'lardaki error handling'i bu hook ile değiştir
- [ ] Test yaz

---

### 5.2 Common Hook Patterns

**Yeni Hook'lar:**
- [ ] `useProviderConfig()` - Provider manager initialization
- [ ] `useTechStackBuilder()` - System instruction generation
- [ ] `useOptimisticUpdate()` - Optimistic file updates
- [ ] `useToast()` - Centralized notifications

---

## Öncelik Sırası

| Öncelik | Faz | İş | Tahmini Süre | Etki |
|---------|-----|-----|--------------|------|
| 1 | 1.1 | ControlPanel refactoring | 8-10 saat | Yüksek |
| 2 | 1.3 | useCodeGeneration refactoring | 6-8 saat | Yüksek |
| 3 | 2.1 | Error fix servisleri birleştirme | 6-8 saat | Yüksek |
| 4 | 1.2 | PreviewPanel refactoring | 6-8 saat | Orta |
| 5 | 2.2 | AI Provider base class | 8-10 saat | Orta |
| 6 | 3.1 | Type organizasyonu | 4-6 saat | Orta |
| 7 | 2.3 | ConversationContext modülerleştirme | 3-4 saat | Düşük |
| 8 | 3.2 | Constants organizasyonu | 3-4 saat | Düşük |
| 9 | 4.1 | Component organizasyonu | 4-6 saat | Düşük |
| 10 | 5.x | Hook iyileştirmeleri | 4-6 saat | Düşük |

**Toplam Tahmini Süre:** 52-70 saat

---

## Başarı Kriterleri

- [ ] En büyük dosya 500 satırın altında
- [ ] Kod tekrarı %50 azaltılmış
- [ ] Her dosya tek bir sorumluluğa sahip
- [ ] Type'lar merkezi konumda
- [ ] Tüm testler geçiyor
- [ ] Lint hatasız

---

## Notlar

- Her faz sonunda `npm run type-check` ve `npm run lint` çalıştır
- Büyük değişikliklerden önce branch oluştur
- Her faz için ayrı commit at
- Breaking change varsa CHANGELOG'a ekle
