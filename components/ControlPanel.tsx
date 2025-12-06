import React, { useRef, useState } from 'react';
import { Upload, Sparkles, FileImage, Layers, X, Settings, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Mic, MicOff, RotateCw, Briefcase, UserCheck, Trash2, GraduationCap, Palette, History, Undo2 } from 'lucide-react';
import { GoogleGenAI } from "@google/genai";
import { FileSystem, HistoryEntry } from '../App';

interface ControlPanelProps {
    files: FileSystem;
    setFiles: (files: FileSystem) => void;
    activeFile: string;
    setActiveFile: (file: string) => void;
    setSuggestions: (suggestions: string[] | null) => void;
    isGenerating: boolean;
    setIsGenerating: (isGenerating: boolean) => void;
    resetApp: () => void;
    history: HistoryEntry[];
    addToHistory: (label: string, files: FileSystem) => void;
    restoreHistory: (entry: HistoryEntry) => void;
    reviewChange: (label: string, newFiles: FileSystem) => void;
}

// Follow-up prompt suggestions
const FOLLOW_UP_PROMPTS = [
    "Add dark mode toggle",
    "Make it more responsive",
    "Add loading states",
    "Improve accessibility",
    "Add animations",
    "Add form validation"
];

export const ControlPanel: React.FC<ControlPanelProps> = ({ files, setSuggestions, isGenerating, setIsGenerating, resetApp, history, addToHistory, restoreHistory, reviewChange }) => {
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<string | null>(null);

    const [brandFile, setBrandFile] = useState<File | null>(null);
    const [brandPreview, setBrandPreview] = useState<string | null>(null);

    const [prompt, setPrompt] = useState('');
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isConsultantMode, setIsConsultantMode] = useState(false);
    const [isEducationMode, setIsEducationMode] = useState(false);

    // Generation summary state
    const [lastGenerationSummary, setLastGenerationSummary] = useState<string | null>(null);
    const [showHistory, setShowHistory] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const brandInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);

    const processFile = (selectedFile: File, isBrand: boolean = false) => {
        if (!selectedFile) return;

        if (isBrand) {
            setBrandFile(selectedFile);
            const reader = new FileReader();
            reader.onloadend = () => setBrandPreview(reader.result as string);
            reader.readAsDataURL(selectedFile);
        } else {
            setFile(selectedFile);
            const reader = new FileReader();
            reader.onloadend = () => setPreview(reader.result as string);
            reader.readAsDataURL(selectedFile);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, isBrand: boolean = false) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0], isBrand);
        }
    };

    const handleDrop = (e: React.DragEvent, isBrand: boolean = false) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0], isBrand);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const removeFile = (e: React.MouseEvent, isBrand: boolean = false) => {
        e.stopPropagation();
        if (isBrand) {
            setBrandFile(null);
            setBrandPreview(null);
            if (brandInputRef.current) brandInputRef.current.value = '';
        } else {
            setFile(null);
            setPreview(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    // Speech Recognition Logic
    const toggleListening = () => {
        if (isListening) {
            if (recognitionRef.current) {
                recognitionRef.current.stop();
            }
            setIsListening(false);
        } else {
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

            if (!SpeechRecognition) {
                alert("Your browser does not support voice recognition.");
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                setIsListening(true);
            };

            recognition.onresult = (event: any) => {
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalTranscript) {
                    setPrompt(prev => prev + (prev ? ' ' : '') + finalTranscript);
                }
            };

            recognition.onerror = (event: any) => {
                console.error('Speech recognition error', event.error);
                setIsListening(false);
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current = recognition;
            recognition.start();
        }
    };

    const handleGenerate = async () => {
        const existingApp = files['src/App.tsx'];

        // Basic validation - need either a sketch for initial generation or existing app + prompt for updates
        if (!existingApp && !file) return; // Initial generation requires sketch
        if (existingApp && !prompt.trim() && !file) return; // Updates require prompt or new sketch
        if (isConsultantMode && !file && !existingApp) return;

        setIsGenerating(true);
        setSuggestions(null); // Clear previous suggestions

        try {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

            const contents: { parts: any[] }[] = [];

            // --- CONSULTANT MODE LOGIC ---
            if (isConsultantMode) {
                const systemInstruction = "You are a Senior Product Manager and UX Expert. Analyze the provided wireframe/sketch deeply. Identify missing UX elements, accessibility gaps, logical inconsistencies, or edge cases (e.g., missing 'Forgot Password', empty states, error states). Output ONLY a raw JSON array of strings containing your specific suggestions. Do not include markdown formatting.";

                let parts: any[] = [];

                if (file && preview) {
                    const base64Data = preview.split(',')[1];
                    parts.push({ inlineData: { mimeType: file.type, data: base64Data } });
                }

                parts.push({
                    text: prompt ? `Analyze this design. Context: ${prompt}` : "Analyze this design for UX gaps."
                });

                contents.push({ parts });

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: contents[0],
                    config: {
                        systemInstruction: systemInstruction,
                        responseMimeType: "application/json"
                    }
                });

                const text = response.text || "[]";
                try {
                    const suggestionsData = JSON.parse(text);
                    setSuggestions(Array.isArray(suggestionsData) ? suggestionsData : ["Could not parse suggestions."]);
                } catch (parseError) {
                    console.error("Failed to parse consultant JSON", parseError);
                    setSuggestions(["Error parsing consultant suggestions."]);
                }

            }
            // --- GENERATE APP LOGIC ---
            else {
                let systemInstruction = `You are an expert React Developer.
Input: A wireframe/sketch (image) and user context.
Output: A complete, multi-file React project structure in JSON format.
Key Requirements:
1. **JSON Output**: The response must be a single JSON object where keys are file paths and values are the code content.
   Structure: { "src/App.tsx": "...", "src/components/Header.tsx": "...", "src/index.css": "..." }
2. **Components**: Break the UI into logical sub-components (e.g., Header, Sidebar, DashboardCard) placed in 'src/components/'.
3. **Entry Point**: You MUST provide 'src/App.tsx' which imports and assembles these components.
4. **Imports**: **IMPORTANT** Use ABSOLUTE paths matching the JSON keys for imports. 
   Example: \`import Header from 'src/components/Header.tsx';\` (NOT './components/Header').
5. **Styling**: Use Tailwind CSS. You can include a 'src/index.css' if needed for custom @apply or imports, but prefer utility classes in JSX.
6. **Icons**: Use 'lucide-react'.

Design Standards:
- Use a modern, clean aesthetic (Inter font, generous padding, rounded-xl).
- Use a refined color palette (Zinc/Slate/Blue/Indigo).
- If the sketch is messy, INTERPRET it as high-fidelity.
- Interactive elements should have hover states.

Content Realism:
- Analyze the app context (Medical, E-commerce, etc.).
- Create 'const mockData = [...]' with 5-8 REALISTIC entries in the relevant components.
- DO NOT use "Lorem Ipsum".

Technical:
- Return ONLY valid JSON. No markdown backticks.`;

                // --- BRANDING LOGIC ---
                if (brandFile && brandPreview) {
                    systemInstruction += `\n\nBRANDING INSTRUCTIONS:
- Extract the PRIMARY DOMINANT COLOR from 'MEDIA 2: BRAND LOGO'.
- Use this hex code (e.g. bg-[#FF5733]) for primary actions/accents using Tailwind arbitrary values.`;
                }

                // --- EDUCATION MODE LOGIC ---
                if (isEducationMode) {
                    systemInstruction += `\n\nEDUCATION MODE:
- Add detailed inline comments explaining complex Tailwind classes and React hooks.`;
                }

                let parts: any[] = [];

                // Add Sketch
                if (file && preview) {
                    const base64Data = preview.split(',')[1];
                    parts.push({ text: "MEDIA 1: UI SKETCH / WIREFRAME" });
                    parts.push({ inlineData: { mimeType: file.type, data: base64Data } });
                }

                // Add Brand Logo
                if (brandFile && brandPreview) {
                    const base64Data = brandPreview.split(',')[1];
                    parts.push({ text: "MEDIA 2: BRAND LOGO" });
                    parts.push({ inlineData: { mimeType: brandFile.type, data: base64Data } });
                }

                // Add Text Prompt
                if (existingApp) {
                    parts.push({ text: `Current Project Files (JSON): ${JSON.stringify(files)}` });
                    parts.push({ text: `User Update Request: ${prompt || "Refine the app based on the brand/sketch."}` });
                    systemInstruction += " Update the existing project files. Return the FULL JSON object with updated file contents.";
                } else {
                    parts.push({ text: `Task: Implement this design. ${prompt ? `Context: ${prompt}` : ""}` });
                }

                contents.push({ parts });

                const response = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: contents[0],
                    config: {
                        systemInstruction: systemInstruction,
                        responseMimeType: "application/json"
                    }
                });

                const text = response.text || "{}";

                try {
                    const newFiles = JSON.parse(text);
                    const mergedFiles = {
                        ...files,
                        ...newFiles
                    };

                    // INSTEAD of setting files directly, Request Review
                    reviewChange(existingApp ? "Updated App" : "Generated Initial App", mergedFiles);

                    // Generate summary of what was created/updated
                    const fileCount = Object.keys(newFiles).length;
                    const componentCount = Object.keys(newFiles).filter(f => f.includes('/components/')).length;
                    setLastGenerationSummary(
                        existingApp
                            ? `Updated ${fileCount} file${fileCount > 1 ? 's' : ''} based on your request.`
                            : `Created ${fileCount} file${fileCount > 1 ? 's' : ''}${componentCount > 0 ? ` including ${componentCount} component${componentCount > 1 ? 's' : ''}` : ''}.`
                    );

                } catch (parseError) {
                    console.error("Failed to parse project JSON", parseError);
                    alert("Error generating project structure. Please try again.");
                }
            }

        } catch (error) {
            console.error("Error generating content:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <aside className="w-full md:w-[30%] h-full flex flex-col gap-5 bg-slate-900/40 backdrop-blur-xl border border-white/5 rounded-2xl p-6 shadow-2xl overflow-hidden relative z-20 transition-all">
            {/* Header */}
            <div className="flex items-center justify-between pb-2 flex-none">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-xl border border-white/5 shadow-inner">
                        <Layers className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-100 to-slate-300">FluidFlow</h1>
                        <p className="text-xs text-slate-500 font-medium tracking-wide">SKETCH TO APP</p>
                    </div>
                </div>

                <button
                    onClick={resetApp}
                    className="p-2 hover:bg-red-500/10 rounded-lg text-slate-500 hover:text-red-400 transition-colors border border-transparent hover:border-red-500/20"
                    title="Clear All & Reset"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            <div className="h-px w-full bg-gradient-to-r from-transparent via-white/10 to-transparent flex-none" />

            <div className="flex-1 flex flex-col gap-4 overflow-y-auto custom-scrollbar relative">
                {/* Generation Summary & Follow-up Prompts */}
                {lastGenerationSummary && files['src/App.tsx'] && (
                    <div className="flex-none p-3 bg-gradient-to-r from-green-500/10 to-emerald-500/5 border border-green-500/20 rounded-xl animate-in fade-in slide-in-from-top-2">
                        <div className="flex items-start gap-2 mb-3">
                            <CheckCircle className="w-4 h-4 text-green-400 mt-0.5 flex-none" />
                            <p className="text-xs text-green-300">{lastGenerationSummary}</p>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {FOLLOW_UP_PROMPTS.slice(0, 4).map((suggestion, idx) => (
                                <button
                                    key={idx}
                                    onClick={() => setPrompt(suggestion)}
                                    className="px-2 py-1 text-[10px] bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-md border border-white/5 transition-all"
                                >
                                    {suggestion}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Upload Section */}
                        <div className="flex-none flex flex-col gap-3">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                    <FileImage className="w-4 h-4 text-slate-500" />
                                    Source Sketch
                                </label>
                                {file && (
                                    <span className="text-[10px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20 animate-in fade-in zoom-in duration-300">Uploaded</span>
                                )}
                            </div>

                            <div
                                onClick={() => !file && fileInputRef.current?.click()}
                                onDrop={(e) => handleDrop(e, false)}
                                onDragOver={handleDragOver}
                                className={`
                            group relative border-2 border-dashed rounded-xl h-32 flex flex-col items-center justify-center transition-all duration-300 overflow-hidden
                            ${file
                                        ? 'border-blue-500/30 bg-blue-500/5'
                                        : 'border-slate-700 hover:border-blue-500/50 hover:bg-slate-800/30 cursor-pointer hover:shadow-lg hover:shadow-blue-500/5'
                                    }
                        `}
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => handleFileChange(e, false)}
                                    accept="image/png, image/jpeg, image/webp"
                                />

                                {file ? (
                                    <div className="relative w-full h-full p-4 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300">
                                        {preview ? (
                                            <div className="relative w-full h-full rounded-lg overflow-hidden border border-white/10 bg-black/20 shadow-inner group-hover:scale-[1.02] transition-transform duration-300">
                                                <img src={preview} alt="Sketch preview" className="w-full h-full object-contain" />
                                            </div>
                                        ) : (
                                            <FileImage className="w-8 h-8 text-blue-400" />
                                        )}

                                        <button
                                            onClick={(e) => removeFile(e, false)}
                                            className="absolute top-2 right-2 p-1.5 rounded-full bg-slate-900/80 border border-white/10 text-slate-400 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-all z-20 shadow-lg"
                                            title="Remove Image"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="p-2 rounded-full bg-slate-800/50 group-hover:scale-110 group-hover:bg-slate-700/50 transition-all mb-2 border border-white/5 shadow-xl">
                                            <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-400" />
                                        </div>
                                        <p className="text-xs text-slate-400 font-medium group-hover:text-slate-200 transition-colors">Drag sketch here</p>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Brand Upload Section (Compact) */}
                        <div className="flex-none flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                    <Palette className="w-4 h-4 text-slate-500" />
                                    Brand Identity <span className="text-[10px] text-slate-600 font-normal uppercase ml-1 tracking-wider border border-white/5 px-1.5 rounded">Optional</span>
                                </label>
                                {brandFile && (
                                    <span className="text-[10px] text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20 animate-in fade-in zoom-in">Active</span>
                                )}
                            </div>

                            <div
                                onClick={() => !brandFile && brandInputRef.current?.click()}
                                onDrop={(e) => handleDrop(e, true)}
                                onDragOver={handleDragOver}
                                className={`
                                relative h-12 rounded-lg border border-dashed flex items-center transition-all cursor-pointer overflow-hidden
                                ${brandFile
                                        ? 'border-pink-500/30 bg-pink-500/5'
                                        : 'border-slate-700 hover:border-pink-500/40 hover:bg-slate-800/30'
                                    }
                            `}
                            >
                                <input
                                    ref={brandInputRef}
                                    type="file"
                                    className="hidden"
                                    onChange={(e) => handleFileChange(e, true)}
                                    accept="image/png, image/jpeg, image/webp"
                                />

                                {brandFile ? (
                                    <div className="w-full h-full flex items-center justify-between px-3 animate-in fade-in slide-in-from-right-4">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            {brandPreview ? (
                                                <div className="w-8 h-8 rounded bg-white/5 border border-white/10 flex-none overflow-hidden">
                                                    <img src={brandPreview} alt="Brand" className="w-full h-full object-cover" />
                                                </div>
                                            ) : (
                                                <div className="w-8 h-8 rounded bg-pink-500/20 flex items-center justify-center">
                                                    <Palette className="w-4 h-4 text-pink-400" />
                                                </div>
                                            )}
                                            <div className="flex flex-col min-w-0">
                                                <p className="text-xs font-medium text-slate-200 truncate">{brandFile.name}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => removeFile(e, true)}
                                            className="p-1.5 rounded-md hover:bg-red-500/10 hover:text-red-400 text-slate-500 transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="w-full flex items-center justify-center gap-2 text-slate-500 hover:text-pink-300 transition-colors">
                                        <Upload className="w-3.5 h-3.5" />
                                        <span className="text-xs font-medium">Upload Logo / Style Guide</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Context Section (Reduced Height) */}
                        <div className="flex-none flex flex-col gap-2">
                            <label className="text-sm font-semibold text-slate-300 flex items-center gap-2">
                                <Sparkles className="w-4 h-4 text-slate-500" />
                                {files['src/App.tsx'] && !isConsultantMode ? "Refine & Update" : "Prompt & Context"}
                            </label>
                            <div className="relative group h-24">
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    className="w-full h-full bg-slate-950/20 border border-slate-700/50 rounded-xl p-3 pr-10 text-xs text-slate-200 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 resize-none placeholder-slate-600 transition-all font-mono leading-relaxed"
                                    placeholder={isConsultantMode ? "Questions for consultant..." : "Describe app flow, colors..."}
                                />

                                {/* Microphone Button */}
                                <button
                                    onClick={toggleListening}
                                    className={`absolute top-2 right-2 p-1.5 rounded-lg transition-all duration-300 ${isListening ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse' : 'bg-slate-800/50 text-slate-400 hover:text-blue-400 hover:bg-slate-700/50'}`}
                                    title="Voice Input"
                                >
                                    {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                                </button>
                            </div>
                        </div>

                {/* History Section (Collapsible) */}
                {history.length > 1 && (
                    <div className="flex-none">
                        <button
                            onClick={() => setShowHistory(!showHistory)}
                            className="w-full flex items-center justify-between p-2 text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-white/5"
                        >
                            <div className="flex items-center gap-2 text-sm font-medium">
                                <History className="w-4 h-4" />
                                <span>History</span>
                                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded">{history.length}</span>
                            </div>
                            {showHistory ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>

                        {showHistory && (
                            <div className="mt-2 p-3 bg-slate-950/50 rounded-xl border border-white/5 animate-in fade-in slide-in-from-top-2 max-h-48 overflow-y-auto custom-scrollbar">
                                <div className="relative pl-4 border-l border-white/10 space-y-3">
                                    {history.slice(0, 10).map((entry, index) => (
                                        <div key={entry.id} className="relative group">
                                            <div className={`absolute -left-[13px] top-1.5 w-2 h-2 rounded-full ${index === 0 ? 'bg-blue-500 ring-2 ring-blue-500/30' : 'bg-slate-600'}`} />
                                            <div className="flex items-center justify-between">
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[11px] font-medium truncate ${index === 0 ? 'text-blue-300' : 'text-slate-400'}`}>
                                                        {entry.label}
                                                    </p>
                                                    <p className="text-[10px] text-slate-600">
                                                        {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </p>
                                                </div>
                                                {index !== 0 && (
                                                    <button
                                                        onClick={() => restoreHistory(entry)}
                                                        className="p-1 rounded hover:bg-white/10 text-slate-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                                                        title="Revert to this version"
                                                    >
                                                        <Undo2 className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Footer Actions */}
            <div className="flex-none pt-4 border-t border-white/5 flex flex-col gap-4">
                {/* Mode Toggle */}
                <div className="flex items-center justify-between p-2 rounded-xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-2">
                        <div className={`p-1.5 rounded-lg transition-colors ${isConsultantMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-blue-500/20 text-blue-300'}`}>
                            {isConsultantMode ? <Briefcase className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </div>
                        <div>
                            <p className="text-xs font-medium text-slate-200">{isConsultantMode ? "Consultant Mode" : "Engineer Mode"}</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsConsultantMode(!isConsultantMode)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 focus:ring-offset-1 focus:ring-offset-slate-900 ${isConsultantMode ? 'bg-indigo-600' : 'bg-slate-600'}`}
                    >
                        <span className={`${isConsultantMode ? 'translate-x-4' : 'translate-x-1'} inline-block h-3 w-3 transform rounded-full bg-white transition-transform`} />
                    </button>
                </div>

                {/* Action Button - Prominent and Glowing */}
                <button
                    onClick={handleGenerate}
                    disabled={isGenerating || (!file && !files['src/App.tsx']) || (files['src/App.tsx'] && !prompt.trim() && !file)}
                    className={`
                    group relative w-full py-3 font-bold rounded-xl shadow-[0_0_20px_rgba(37,99,235,0.3)] flex items-center justify-center gap-3 transition-all overflow-hidden
                    ${isGenerating || (!file && !files['src/App.tsx']) || (files['src/App.tsx'] && !prompt.trim() && !file)
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none'
                            : isConsultantMode
                                ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 bg-[length:200%_auto] animate-gradient text-white hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] active:scale-[0.98]'
                                : 'bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 bg-[length:200%_auto] animate-gradient text-white hover:shadow-[0_0_30px_rgba(37,99,235,0.5)] active:scale-[0.98]'
                        }
                `}
                >
                    {/* Shine Effect */}
                    {!isGenerating && (file || (files['src/App.tsx'] && prompt.trim())) && (
                        <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] z-0 pointer-events-none">
                            <div className="w-1/2 h-full bg-gradient-to-r from-transparent via-white/20 to-transparent skew-x-[-20deg]" />
                        </div>
                    )}

                    {isGenerating ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            <span className="text-sm tracking-wide">{isConsultantMode ? 'Analyzing...' : 'Building...'}</span>
                        </>
                    ) : (
                        <>
                            {isConsultantMode ? (
                                <Briefcase className="w-5 h-5 relative z-10 text-indigo-100" />
                            ) : (
                                files['src/App.tsx'] ? <RotateCw className="w-5 h-5 relative z-10 text-blue-100" /> : <Sparkles className="w-5 h-5 relative z-10 text-blue-100" />
                            )}
                            <span className="relative z-10 text-sm tracking-wide uppercase">
                                {isConsultantMode ? 'Identify Gaps' : (files['src/App.tsx'] ? 'Update App' : 'Generate App')}
                            </span>
                        </>
                    )}
                </button>
            </div>

            {/* Settings Section */}
            <div className="border-t border-white/5 pt-2 flex-none">
                <button
                    onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                    className="flex items-center justify-between w-full p-2 text-slate-400 hover:text-slate-200 transition-colors rounded-lg hover:bg-white/5"
                >
                    <div className="flex items-center gap-2 text-sm font-medium">
                        <Settings className="w-4 h-4" />
                        <span>Settings</span>
                    </div>
                    {isSettingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {isSettingsOpen && (
                    <div className="absolute bottom-16 left-6 right-6 p-4 bg-slate-950/90 backdrop-blur-xl rounded-xl border border-white/10 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200 shadow-2xl z-50">
                        <div className="space-y-2">
                            <label className="text-xs text-slate-500 font-medium uppercase tracking-wider block">API Connection</label>
                            <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-white/5">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${process.env.API_KEY ? 'bg-green-500' : 'bg-red-500'}`} />
                                    <span className="text-sm text-slate-300">Gemini API</span>
                                </div>
                                {process.env.API_KEY ? (
                                    <CheckCircle className="w-4 h-4 text-green-500/50" />
                                ) : (
                                    <AlertCircle className="w-4 h-4 text-red-500/50" />
                                )}
                            </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-white/5">
                            <div className="flex items-center justify-between">
                                <label className="text-xs text-slate-300 font-medium flex items-center gap-2">
                                    <GraduationCap className="w-3.5 h-3.5 text-yellow-400" />
                                    Education Mode
                                </label>
                                <button
                                    onClick={() => setIsEducationMode(!isEducationMode)}
                                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 ${isEducationMode ? 'bg-yellow-600' : 'bg-slate-700'}`}
                                >
                                    <span className={`${isEducationMode ? 'translate-x-4' : 'translate-x-1'} inline-block h-3 w-3 transform rounded-full bg-white transition-transform`} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* CSS Animation for Gradient Button */}
            <style dangerouslySetInnerHTML={{
                __html: `
          @keyframes gradient {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
          .animate-gradient {
            animation: gradient 3s ease infinite;
          }
          @keyframes shimmer {
            100% { transform: translateX(200%); }
          }
        `}} />
        </aside>
    );
}