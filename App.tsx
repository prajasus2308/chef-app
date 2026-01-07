
import React, { useState, useEffect, useRef } from 'react';
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { 
  ChefHat, 
  Book, 
  Plus, 
  Search, 
  Heart, 
  Flame, 
  Clock, 
  Utensils, 
  Trash2, 
  Image as ImageIcon, 
  ArrowLeft,
  X,
  Camera,
  Play,
  Volume2,
  ShoppingCart,
  Zap,
  ChevronRight,
  ChevronLeft,
  CheckCircle2
} from 'lucide-react';

// --- Types ---
interface Nutrition {
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
}

interface Recipe {
  id: string;
  title: string;
  description: string;
  ingredients: string[];
  instructions: string[];
  prepTime: string;
  servings: string;
  nutrition: Nutrition;
  imageUrl?: string;
  createdAt: number;
}

// --- Helper Functions ---
const decodeBase64 = (base64: string) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

async function decodeAudioData(data: Uint8Array, ctx: AudioContext): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const buffer = ctx.createBuffer(1, dataInt16.length, 24000);
  const channelData = buffer.getChannelData(0);
  for (let i = 0; i < dataInt16.length; i++) {
    channelData[i] = dataInt16[i] / 32768.0;
  }
  return buffer;
}

// --- App Component ---
export default function App() {
  const [view, setView] = useState<'kitchen' | 'pantry' | 'shopping'>('kitchen');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVisualizing, setIsVisualizing] = useState(false);
  const [currentRecipe, setCurrentRecipe] = useState<Recipe | null>(null);
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);
  const [manualShoppingItems, setManualShoppingItems] = useState<string[]>([]);
  const [newItemText, setNewItemText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [showAddDishModal, setShowAddDishModal] = useState(false);
  const [customDish, setCustomDish] = useState({ title: '', desc: '', ingredients: '' });

  // Camera State
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Cooking Mode State
  const [cookingMode, setCookingMode] = useState<Recipe | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // --- Persistence ---
  useEffect(() => {
    const storedRecipes = localStorage.getItem('chefgenius_recipes_v3');
    const storedItems = localStorage.getItem('chefgenius_shopping_v3');
    if (storedRecipes) try { setSavedRecipes(JSON.parse(storedRecipes)); } catch (e) {}
    if (storedItems) try { setManualShoppingItems(JSON.parse(storedItems)); } catch (e) {}
  }, []);

  useEffect(() => {
    localStorage.setItem('chefgenius_recipes_v3', JSON.stringify(savedRecipes));
  }, [savedRecipes]);

  useEffect(() => {
    localStorage.setItem('chefgenius_shopping_v3', JSON.stringify(manualShoppingItems));
  }, [manualShoppingItems]);

  // --- Functions ---
  const startCamera = async () => {
    setIsCameraOpen(true);
    setCapturedImage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      alert("Could not access camera.");
      setIsCameraOpen(false);
    }
  };

  const capturePhoto = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d')?.drawImage(video, 0, 0);
    setCapturedImage(canvas.toDataURL('image/jpeg'));
    (video.srcObject as MediaStream).getTracks().forEach(t => t.stop());
  };

  const generateRecipe = async (imageB64?: string) => {
    setIsGenerating(true);
    setCurrentRecipe(null);
    setIsCameraOpen(false);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const parts: any[] = imageB64 
        ? [{ inlineData: { mimeType: 'image/jpeg', data: imageB64.split(',')[1] } }, { text: `Gourmet recipe for items in image. ${prompt}. IMPORTANT: Always end the recipe description with the phrase 'Crafted by praj'.` }]
        : [{ text: `Gourmet recipe for: ${prompt}. IMPORTANT: Always end the recipe description with the phrase 'Crafted by praj'.` }];

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              prepTime: { type: Type.STRING },
              servings: { type: Type.STRING },
              nutrition: { type: Type.OBJECT, properties: { calories: { type: Type.STRING }, protein: { type: Type.STRING }, carbs: { type: Type.STRING }, fat: { type: Type.STRING } } },
              ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
              instructions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ['title', 'description', 'ingredients', 'instructions', 'prepTime', 'servings', 'nutrition'],
          }
        }
      });
      const data = JSON.parse(response.text || '{}');
      const finalTitle = data.title.includes('by praj') ? data.title : `${data.title} (by praj)`;
      setCurrentRecipe({ ...data, title: finalTitle, id: crypto.randomUUID(), createdAt: Date.now() });
      setCapturedImage(null);
    } catch (error) {
      alert("Error generating recipe.");
    } finally {
      setIsGenerating(false);
    }
  };

  const addManualDish = () => {
    if (!customDish.title) return;
    const newRecipe: Recipe = {
      id: crypto.randomUUID(),
      title: `${customDish.title} (by praj)`,
      description: (customDish.desc || "A classic homemade dish.") + " - Crafted by praj.",
      ingredients: customDish.ingredients.split('\n').filter(i => i.trim()),
      instructions: ["Step-by-step instructions not provided for manual entry."],
      prepTime: "Manual",
      servings: "N/A",
      nutrition: { calories: "-", protein: "-", carbs: "-", fat: "-" },
      createdAt: Date.now()
    };
    setSavedRecipes([newRecipe, ...savedRecipes]);
    setCustomDish({ title: '', desc: '', ingredients: '' });
    setShowAddDishModal(false);
  };

  const addShoppingItem = () => {
    if (!newItemText.trim()) return;
    setManualShoppingItems([...manualShoppingItems, newItemText.trim()]);
    setNewItemText('');
  };

  const speakStep = async (text: string) => {
    if (isSpeaking) return;
    setIsSpeaking(true);
    try {
      if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: { responseModalities: [Modality.AUDIO], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } } }
      });
      const b64 = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (b64) {
        const source = audioContextRef.current.createBufferSource();
        source.buffer = await decodeAudioData(decodeBase64(b64), audioContextRef.current);
        source.connect(audioContextRef.current.destination);
        source.onended = () => setIsSpeaking(false);
        source.start();
      } else setIsSpeaking(false);
    } catch (e) { setIsSpeaking(false); }
  };

  const visualizeRecipe = async () => {
    if (!currentRecipe) return;
    setIsVisualizing(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [{ text: `Gourmet food photograph of ${currentRecipe.title}. Plated beautifully.` }] },
        config: { imageConfig: { aspectRatio: "1:1" } }
      });
      const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
      if (part) setCurrentRecipe(prev => prev ? { ...prev, imageUrl: `data:${part.inlineData!.mimeType};base64,${part.inlineData!.data}` } : null);
    } finally { setIsVisualizing(false); }
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 font-sans">
      {/* Sidebar */}
      <nav className="w-full md:w-20 lg:w-64 bg-white border-r border-slate-200 p-4 flex md:flex-col gap-2 z-10 sticky top-0 md:h-screen shadow-sm">
        <div className="hidden md:flex flex-col gap-1 px-4 py-6 mb-4">
          <div className="flex items-center gap-3">
            <div className="bg-orange-600 p-2 rounded-xl text-white shadow-lg"><ChefHat size={24} /></div>
            <span className="font-bold text-xl lg:block hidden tracking-tight leading-none">ChefGenius</span>
          </div>
          <span className="lg:block hidden text-[10px] font-black uppercase text-orange-600 tracking-[0.2em] mt-1 ml-11">by praj</span>
        </div>
        
        <button onClick={() => setView('kitchen')} className={`flex-1 md:flex-none flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${view === 'kitchen' ? 'bg-orange-50 text-orange-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Plus size={20} /> <span className="lg:block hidden">Kitchen</span>
        </button>
        <button onClick={() => setView('pantry')} className={`flex-1 md:flex-none flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${view === 'pantry' ? 'bg-orange-50 text-orange-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}>
          <Book size={20} /> <span className="lg:block hidden">Pantry</span>
        </button>
        <button onClick={() => setView('shopping')} className={`flex-1 md:flex-none flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${view === 'shopping' ? 'bg-orange-50 text-orange-600 font-semibold' : 'text-slate-500 hover:bg-slate-50'}`}>
          <ShoppingCart size={20} /> <span className="lg:block hidden">List</span>
        </button>

        {/* Desktop Sidebar Footer */}
        <div className="hidden lg:block mt-auto p-4 border-t border-slate-100 text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center">
          by praj
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-12 lg:p-16 max-w-7xl mx-auto w-full flex flex-col">
        <div className="flex-1">
          {view === 'kitchen' && (
            <div className="animate-fade-in space-y-10">
              <header className="space-y-2">
                <h1 className="text-4xl font-extrabold text-slate-900">What's Cooking?</h1>
                <p className="text-slate-500">Prompt your craving or scan your ingredients. <span className="text-orange-600 font-medium italic">by praj</span></p>
              </header>
              <div className="flex flex-col md:flex-row gap-4 items-stretch">
                <div className="bg-white flex-1 p-1 rounded-2xl shadow-xl border border-slate-100 flex items-center gap-3 px-4 py-2 focus-within:ring-2 focus-within:ring-orange-500/20 transition-all">
                  <Search className="text-slate-400" size={24} />
                  <input 
                    type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Ask for anything..." className="flex-1 bg-transparent border-none focus:ring-0 text-lg py-4"
                  />
                </div>
                <button onClick={startCamera} className="bg-white border-2 border-slate-200 text-slate-600 p-4 rounded-2xl hover:border-orange-500 hover:text-orange-600 transition-all flex items-center justify-center gap-2 font-semibold">
                  <Camera size={24} /> <span className="hidden lg:inline">Scan Ingredients</span>
                </button>
                <button onClick={() => generateRecipe()} disabled={isGenerating || !prompt} className="bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white px-8 py-4 rounded-2xl font-bold shadow-lg shadow-orange-100 flex items-center justify-center gap-2">
                  {isGenerating ? 'Cooking...' : 'Generate'} {!isGenerating && <Zap size={18} fill="currentColor" />}
                </button>
              </div>
              {currentRecipe && (
                <div className="bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100 animate-fade-in">
                  <div className="flex flex-col lg:flex-row">
                    <div className="w-full lg:w-1/2 aspect-square relative bg-slate-50">
                      {currentRecipe.imageUrl ? <img src={currentRecipe.imageUrl} className="w-full h-full object-cover" /> : <div className="w-full h-full flex flex-col items-center justify-center p-12 text-slate-400 text-center"><ImageIcon size={48} className="opacity-20 mb-4" /><button onClick={visualizeRecipe} disabled={isVisualizing} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-semibold">{isVisualizing ? 'Painting...' : 'Visualize Dish'}</button></div>}
                    </div>
                    <div className="w-full lg:w-1/2 p-8 md:p-12">
                      <div className="flex justify-between items-start mb-6">
                        <div className="space-y-2">
                          <div className="flex gap-4 text-[10px] font-black uppercase text-orange-600"><span className="flex items-center gap-1"><Clock size={12} /> {currentRecipe.prepTime}</span><span className="flex items-center gap-1"><Utensils size={12} /> {currentRecipe.servings} Servings</span></div>
                          <h2 className="text-3xl font-black text-slate-900">{currentRecipe.title}</h2>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setCookingMode(currentRecipe)} className="bg-orange-600 text-white p-3 rounded-full shadow-lg"><Play size={20} fill="currentColor" /></button>
                          <button onClick={() => { if (!savedRecipes.find(r => r.title === currentRecipe.title)) setSavedRecipes([currentRecipe, ...savedRecipes]); }} className="bg-orange-50 text-orange-600 p-3 rounded-full hover:bg-orange-100"><Heart size={20} /></button>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                         {Object.entries(currentRecipe.nutrition).map(([k, v]) => <div key={k} className="bg-slate-50 p-3 rounded-xl border border-slate-100"><span className="block text-[8px] uppercase font-bold text-slate-400">{k}</span><span className="block text-sm font-bold text-slate-700">{v}</span></div>)}
                      </div>
                      <p className="text-slate-600 italic border-l-4 border-orange-100 pl-4 mb-8 leading-relaxed">
                        {currentRecipe.description}
                      </p>
                      <h3 className="font-bold text-slate-900 mb-2">Ingredients</h3>
                      <ul className="space-y-1 mb-8">
                        {currentRecipe.ingredients.map((ing, i) => <li key={i} className="text-sm text-slate-600 flex items-start gap-2"><span className="w-1.5 h-1.5 bg-orange-300 rounded-full mt-1.5" /> {ing}</li>)}
                      </ul>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {view === 'pantry' && (
            <div className="animate-fade-in space-y-10">
              <header className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-6">
                <div className="space-y-2">
                  <h1 className="text-4xl font-extrabold text-slate-900">Your Pantry <span className="text-orange-600 opacity-50 text-sm font-black italic">by praj</span></h1>
                  <p className="text-slate-500">Saved and custom dishes.</p>
                </div>
                <div className="flex gap-3 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input type="text" placeholder="Filter..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl pl-10 py-2.5 text-sm" />
                  </div>
                  <button onClick={() => setShowAddDishModal(true)} className="bg-orange-600 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 hover:bg-orange-700 shadow-md">
                    <Plus size={20} /> <span className="hidden sm:inline">Add Dish</span>
                  </button>
                </div>
              </header>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {savedRecipes.filter(r => r.title.toLowerCase().includes(searchQuery.toLowerCase())).map(recipe => (
                  <div key={recipe.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-xl transition-all overflow-hidden cursor-pointer flex flex-col" onClick={() => { setCurrentRecipe(recipe); setView('kitchen'); }}>
                    <div className="aspect-[4/3] bg-slate-100 relative">
                      {recipe.imageUrl ? <img src={recipe.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-all duration-700" /> : <div className="w-full h-full flex items-center justify-center opacity-20"><Utensils size={48} /></div>}
                      <button onClick={(e) => { e.stopPropagation(); setSavedRecipes(s => s.filter(r => r.id !== recipe.id)); }} className="absolute top-4 right-4 bg-white/90 p-2 rounded-full opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 shadow-sm"><Trash2 size={16} /></button>
                    </div>
                    <div className="p-6">
                      <div className="text-[10px] font-bold text-orange-600 uppercase mb-1">{recipe.prepTime} • {recipe.servings}</div>
                      <h3 className="text-lg font-bold text-slate-900 group-hover:text-orange-600 transition-colors line-clamp-1">{recipe.title}</h3>
                    </div>
                  </div>
                ))}
                {savedRecipes.length === 0 && <div className="col-span-full py-20 text-center text-slate-400 border-2 border-dashed border-slate-200 rounded-[2rem]">Your pantry is empty. Generate or add a dish manually!</div>}
              </div>
            </div>
          )}

          {view === 'shopping' && (
            <div className="animate-fade-in space-y-10 max-w-2xl mx-auto">
              <header className="space-y-2">
                <h1 className="text-4xl font-extrabold text-slate-900">Shopping List</h1>
                <p className="text-slate-500">Groceries and recipe essentials <span className="text-orange-600 font-black italic">by praj</span>.</p>
              </header>
              <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
                <div className="p-6 border-b border-slate-50 bg-slate-50/50 flex gap-3">
                  <input 
                    type="text" value={newItemText} onChange={(e) => setNewItemText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && addShoppingItem()}
                    placeholder="Add custom item (e.g., Milk, Eggs...)"
                    className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all shadow-sm"
                  />
                  <button onClick={addShoppingItem} className="bg-orange-600 text-white p-3 rounded-xl hover:bg-orange-700 shadow-md">
                    <Plus size={24} />
                  </button>
                </div>
                <div className="p-4 space-y-1">
                  {/* Manual Items */}
                  {manualShoppingItems.map((item, i) => (
                    <div key={`m-${i}`} className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors group">
                      <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500" />
                      <span className="flex-1 text-slate-700 font-medium group-has-[:checked]:text-slate-300 group-has-[:checked]:line-through">{item}</span>
                      <button onClick={() => setManualShoppingItems(manualShoppingItems.filter((_, idx) => idx !== i))} className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={16} /></button>
                    </div>
                  ))}
                  {/* Recipe Items */}
                  {savedRecipes.flatMap(r => r.ingredients).map((item, i) => (
                    <div key={`r-${i}`} className="flex items-center gap-4 p-4 rounded-xl hover:bg-slate-50 transition-colors group">
                      <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-orange-600 focus:ring-orange-500" />
                      <span className="flex-1 text-slate-500 text-sm group-has-[:checked]:text-slate-300 group-has-[:checked]:line-through">{item}</span>
                      <div className="text-[10px] text-slate-300 uppercase font-black tracking-widest">Recipe</div>
                    </div>
                  ))}
                  {manualShoppingItems.length === 0 && savedRecipes.length === 0 && <div className="py-12 text-center text-slate-300">Your shopping list is empty.</div>}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Global Page Footer */}
        <footer className="mt-20 py-12 border-t border-slate-200 text-center animate-fade-in">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3 opacity-50">
              <div className="bg-slate-900 p-1.5 rounded-lg text-white">
                <ChefHat size={18} />
              </div>
              <span className="font-bold text-lg tracking-tight">ChefGenius AI</span>
            </div>
            <p className="text-slate-400 text-sm font-medium">
              Created by <span className="text-slate-900 font-extrabold">Pratyush Raj</span> 
              <span className="mx-3 text-slate-200">|</span> 
              <span className="text-orange-600 italic font-black uppercase tracking-widest text-[10px]">by praj</span>
            </p>
            <div className="text-[10px] text-slate-300 font-bold uppercase tracking-[0.3em] mt-2">
              © 2025 All Rights Reserved
            </div>
          </div>
        </footer>
      </main>

      {/* Manual Dish Modal */}
      {showAddDishModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden flex flex-col border border-white">
            <header className="p-8 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-2xl font-black text-slate-900">Add Custom Dish</h3>
              <button onClick={() => setShowAddDishModal(false)} className="text-slate-400 hover:text-slate-900 p-2"><X size={24} /></button>
            </header>
            <div className="p-8 space-y-6">
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Dish Name</label>
                <input value={customDish.title} onChange={e => setCustomDish({...customDish, title: e.target.value})} type="text" placeholder="e.g. Grandma's Famous Lasagna" className="w-full bg-slate-50 border-slate-100 rounded-xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Brief Description</label>
                <input value={customDish.desc} onChange={e => setCustomDish({...customDish, desc: e.target.value})} type="text" placeholder="A family favorite recipe..." className="w-full bg-slate-50 border-slate-100 rounded-xl px-4 py-3 focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase text-slate-400 tracking-wider">Ingredients (one per line)</label>
                <textarea value={customDish.ingredients} onChange={e => setCustomDish({...customDish, ingredients: e.target.value})} placeholder="3 Eggs&#10;1 cup Flour..." className="w-full bg-slate-50 border-slate-100 rounded-xl px-4 py-3 h-32 resize-none focus:bg-white focus:ring-2 focus:ring-orange-500/10 transition-all" />
              </div>
              <button onClick={addManualDish} disabled={!customDish.title} className="w-full bg-slate-900 text-white py-4 rounded-xl font-bold shadow-xl hover:bg-slate-800 transition-all disabled:opacity-30">Save to Pantry (by praj)</button>
            </div>
          </div>
        </div>
      )}

      {/* Camera/Cooking overlays */}
      {isCameraOpen && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-6">
          <button onClick={() => setIsCameraOpen(false)} className="absolute top-8 right-8 text-white p-2 bg-white/10 rounded-full hover:bg-white/20"><X size={32} /></button>
          <div className="relative w-full max-w-2xl aspect-square md:aspect-video rounded-3xl overflow-hidden bg-slate-900 shadow-2xl">
            {capturedImage ? <img src={capturedImage} className="w-full h-full object-cover" /> : <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />}
          </div>
          <div className="mt-12 flex gap-6">
            {!capturedImage ? <button onClick={capturePhoto} className="w-20 h-20 bg-white rounded-full border-4 border-slate-400" /> : <>
              <button onClick={() => setCapturedImage(null)} className="bg-white/10 text-white px-8 py-4 rounded-2xl font-bold border border-white/20">Retake</button>
              <button onClick={() => generateRecipe(capturedImage!)} className="bg-orange-600 text-white px-8 py-4 rounded-2xl font-bold">Analyze Photo (by praj)</button>
            </>}
          </div>
        </div>
      )}

      {cookingMode && (
        <div className="fixed inset-0 z-[110] bg-white flex flex-col animate-fade-in overflow-y-auto">
          <header className="p-6 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white/80 backdrop-blur">
            <button onClick={() => setCookingMode(null)} className="text-slate-400 hover:text-slate-900 transition-colors flex items-center gap-2 font-semibold"><ArrowLeft size={20} /> Exit</button>
            <div className="text-center">
              <h2 className="font-bold text-slate-900">{cookingMode.title}</h2>
              <p className="text-xs text-orange-600 font-black tracking-tighter uppercase italic">by praj</p>
            </div>
            <div className="w-16" />
          </header>
          <div className="flex-1 flex flex-col items-center justify-center max-w-2xl mx-auto w-full p-6 text-center space-y-12">
            <h3 className="text-2xl md:text-3xl font-bold text-slate-900">{cookingMode.instructions[currentStep]}</h3>
            <div className="flex items-center gap-8">
              <button disabled={currentStep === 0} onClick={() => { setCurrentStep(s => s - 1); setIsSpeaking(false); }} className="p-4 rounded-2xl bg-slate-100 disabled:opacity-30"><ChevronLeft size={32} /></button>
              <button onClick={() => speakStep(cookingMode.instructions[currentStep])} disabled={isSpeaking} className={`w-24 h-24 rounded-full flex items-center justify-center ${isSpeaking ? 'bg-orange-100 text-orange-600 animate-pulse' : 'bg-orange-600 text-white shadow-xl'}`}><Volume2 size={40} /></button>
              <button disabled={currentStep === cookingMode.instructions.length - 1} onClick={() => { setCurrentStep(s => s + 1); setIsSpeaking(false); }} className="p-4 rounded-2xl bg-slate-100 disabled:opacity-30"><ChevronRight size={32} /></button>
            </div>
          </div>
          <div className="mt-auto py-8 text-center text-slate-300 text-[10px] font-bold uppercase tracking-widest">
            Created by Pratyush Raj | by praj
          </div>
        </div>
      )}
    </div>
  );
}
