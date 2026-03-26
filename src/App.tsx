/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronRight, 
  ChevronDown,
  ChevronUp,
  Calendar, 
  User, 
  Activity, 
  ShoppingBag, 
  Utensils, 
  Weight, 
  ArrowRight,
  CheckCircle2,
  Clock,
  Info,
  Target,
  Scale,
  Ruler,
  Droplets,
  Flame,
  Plus,
  Minus,
  Printer,
  Lightbulb,
  Download,
  Loader2,
  MessageSquare,
  Send,
  Sparkles
} from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import Markdown from 'react-markdown';
import { GoogleGenAI } from "@google/genai";
import { AppState, UserProfile, WeeklyCheckIn, DailyLog, ActivityLevel, Phase } from './types';
import { calculateBMR, calculateTDEE, calculateTargetCalories, getPhase, getWeekNumber, getDayOfProgram } from './lib/calculations';

const STORAGE_KEY = 'santuy_coach_data';

const DAILY_TIPS = [
  "Tidur 7-8 jam membantu proses pembakaran lemak dan pemulihan otot.",
  "Minum segelas air putih segera setelah bangun tidur untuk mengaktifkan metabolisme.",
  "Kunyah makanan pelan-pelan (20-30 kali) agar otak sempat menerima sinyal kenyang.",
  "Gunakan piring yang lebih kecil untuk membantu mengontrol porsi makan secara psikologis.",
  "Jangan lewatkan sarapan, ini adalah bahan bakar utama untuk memulai hari.",
  "Kurangi konsumsi gula tambahan, ganti dengan buah segar jika ingin yang manis.",
  "Berjalan kaki 10-15 menit setelah makan membantu menurunkan kadar gula darah.",
  "Siapkan camilan sehat (seperti kacang atau buah) agar tidak jajan sembarangan.",
  "Konsistensi lebih penting daripada intensitas. Tetaplah bergerak setiap hari.",
  "Kelola stres dengan meditasi atau hobi, karena stres tinggi bisa memicu lapar palsu."
];

const MOTIVATIONS = [
  "Konsistensi lebih penting daripada kesempurnaan. Tetap santuy tapi pasti menuju goals-mu!",
  "Satu langkah kecil setiap hari lebih baik daripada langkah besar tapi cuma sesekali.",
  "Jangan bandingkan prosesmu dengan orang lain. Kamu punya waktumu sendiri.",
  "Air putih adalah sahabat terbaikmu hari ini. Jangan lupa minum!",
  "Capek itu wajar, istirahatlah. Tapi jangan pernah menyerah.",
  "Fokus pada seberapa jauh kamu sudah melangkah, bukan seberapa jauh lagi yang harus ditempuh.",
  "Diet santuy bukan berarti malas, tapi pintar mengatur strategi.",
  "Setiap tetes keringat dan setiap gelas air putih membawa kamu lebih dekat ke target.",
  "Jadikan makanan sehat sebagai bahan bakar, bukan hukuman.",
  "Hari ini adalah kesempatan baru untuk menjadi versi dirimu yang lebih baik."
];

export default function App() {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse saved data", e);
      }
    }
    return {
      profile: null,
      weeklyCheckIns: [],
      dailyLogs: {},
      startDate: null,
    };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const todayStr = new Date().toISOString().split('T')[0];
  const todayLog = state.dailyLogs[todayStr];

  const currentWeek = useMemo(() => {
    if (!state.startDate) return 1;
    return getWeekNumber(new Date(state.startDate), new Date());
  }, [state.startDate]);

  const currentDayOfProgram = useMemo(() => {
    if (!state.startDate) return 1;
    return getDayOfProgram(new Date(state.startDate), new Date());
  }, [state.startDate]);

  const currentPhase = useMemo(() => getPhase(currentWeek), [currentWeek]);

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const downloadAsPDF = async (elementId: string, fileName: string) => {
    const element = document.getElementById(elementId);
    if (!element) return;

    setIsGeneratingPDF(true);
    try {
      // Temporarily remove print:hidden classes or ensure they are visible for the canvas
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById(elementId);
          if (clonedElement) {
            // Ensure all hidden elements for print are visible in the PDF
            const hiddenElements = clonedElement.querySelectorAll('.print-show-all');
            hiddenElements.forEach(el => {
              (el as HTMLElement).style.display = 'block';
              (el as HTMLElement).style.height = 'auto';
              (el as HTMLElement).style.opacity = '1';
            });
          }
        }
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      });

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
      pdf.save(`${fileName}.pdf`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      alert('Gagal membuat PDF. Jika masalah berlanjut, silakan gunakan fitur Print browser (Ctrl+P) atau screenshot.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const needsWeeklyCheckIn = useMemo(() => {
    if (!state.profile) return false;
    if (state.weeklyCheckIns.length === 0) return true;
    
    // Check if today is the start of a new week relative to start date
    if (!state.startDate) return false;
    const dayOfProg = getDayOfProgram(new Date(state.startDate), new Date());
    const expectedCheckIns = Math.ceil(dayOfProg / 7);
    return state.weeklyCheckIns.length < expectedCheckIns;
  }, [state.profile, state.weeklyCheckIns, state.startDate]);

  useEffect(() => {
    if (!state.profile || !state.startDate) return;

    const checkAndNotify = async () => {
      if (!('Notification' in window)) return;
      
      if (Notification.permission === 'default') {
        try {
          await Notification.requestPermission();
        } catch (e) {
          console.error("Notification permission request failed", e);
        }
      }

      if (Notification.permission === 'granted') {
        const today = new Date().toISOString().split('T')[0];
        const lastNotified = localStorage.getItem('santuy_last_notified');
        
        if (lastNotified !== today) {
          const needsDailyLog = !state.dailyLogs[today];

          // We use currentWeek and needsWeeklyCheckIn from the outer scope
          if (needsWeeklyCheckIn) {
            new Notification('Waktunya Check-in Mingguan! ⚖️', {
              body: `Minggu ke-${currentWeek} telah selesai. Yuk catat berat badan dan lingkar tubuhmu!`,
            });
            localStorage.setItem('santuy_last_notified', today);
          } else if (needsDailyLog) {
            new Notification('Update Aktivitas Hari Ini 🏃‍♂️', {
              body: 'Apakah hari ini Rest Day atau Active Day? Yuk catat di aplikasi!',
            });
            localStorage.setItem('santuy_last_notified', today);
          }
        }
      }
    };

    // Small delay to not annoy the user immediately on load
    const timer = setTimeout(checkAndNotify, 3000);
    return () => clearTimeout(timer);
  }, [state.profile, state.startDate, state.dailyLogs, needsWeeklyCheckIn, currentWeek]);

  const handleProfileSubmit = (profile: UserProfile) => {
    const startDate = new Date().toISOString().split('T')[0];
    const bmr = calculateBMR(profile.initialWeight, profile.height, profile.age, profile.gender);
    const tdee = calculateTDEE(bmr, profile.baseActivityLevel);
    const targetCalories = calculateTargetCalories(tdee, profile.gender);

    const initialCheckIn: WeeklyCheckIn = {
      weekNumber: 1,
      date: startDate,
      weight: profile.initialWeight,
      ...profile.initialMeasurements,
      targetCalories,
    };

    setState(prev => ({
      ...prev,
      profile,
      startDate,
      weeklyCheckIns: [initialCheckIn],
    }));
  };

  const handleWeeklyCheckIn = (weight: number, measurements: { belly?: number; waist?: number; hip?: number; neck?: number; arm?: number; thigh?: number }) => {
    if (!state.profile) return;
    
    const bmr = calculateBMR(weight, state.profile.height, state.profile.age, state.profile.gender);
    const tdee = calculateTDEE(bmr, state.profile.baseActivityLevel);
    const targetCalories = calculateTargetCalories(tdee, state.profile.gender);

    const newCheckIn: WeeklyCheckIn = {
      weekNumber: state.weeklyCheckIns.length + 1,
      date: todayStr,
      weight,
      ...measurements,
      targetCalories,
    };

    setState(prev => ({
      ...prev,
      weeklyCheckIns: [...prev.weeklyCheckIns, newCheckIn],
    }));
  };

  const handleDailyActivity = (activity: ActivityLevel) => {
    setState(prev => ({
      ...prev,
      dailyLogs: {
        ...prev.dailyLogs,
        [todayStr]: { date: todayStr, activity }
      }
    }));
  };

  const handleUpdateDailyLog = (updates: Partial<DailyLog>) => {
    setState(prev => ({
      ...prev,
      dailyLogs: {
        ...prev.dailyLogs,
        [todayStr]: { ...prev.dailyLogs[todayStr], ...updates }
      }
    }));
  };

  const [view, setView] = useState<'diet' | 'progress' | 'profile' | 'chat'>('diet');

  if (!state.profile) {
    return <ProfileSetup onSubmit={handleProfileSubmit} />;
  }

  const handleResetProfile = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState({
      profile: null,
      weeklyCheckIns: [],
      dailyLogs: {},
      startDate: null,
    });
    setView('diet');
  };

  const handleSimulateDay = (daysToAdd: number) => {
    if (!state.startDate) return;
    
    // If daysToAdd is 0, reset to today
    if (daysToAdd === 0) {
      setState({ ...state, startDate: new Date().toISOString().split('T')[0] });
      alert('Waktu telah direset ke Hari 1. Silakan cek tab "Diet" untuk melihat perubahannya.');
      return;
    }

    // Otherwise, push the start date back to simulate time passing
    const currentStartDate = new Date();
    currentStartDate.setDate(currentStartDate.getDate() - daysToAdd);
    setState({ ...state, startDate: currentStartDate.toISOString().split('T')[0] });
    
    if (daysToAdd >= 7) {
      alert(`Waktu dimajukan ${daysToAdd} hari. Anda akan diarahkan ke halaman Check-in Mingguan.`);
    } else {
      alert(`Waktu dimajukan ${daysToAdd} hari. Silakan cek tab "Diet" untuk melihat perubahan hari dan menu.`);
    }
  };

  if (needsWeeklyCheckIn) {
    return <WeeklyCheckInView 
      weekNumber={Math.ceil(currentDayOfProgram / 7)} 
      onSubmit={handleWeeklyCheckIn} 
    />;
  }

  return (
    <div className="max-w-md mx-auto min-h-screen pb-24 px-4 pt-8 print:max-w-none print:p-0 print:m-0">
      <Header 
        week={currentWeek} 
        day={((currentDayOfProgram - 1) % 7) + 1} 
        phase={currentPhase} 
        className="print:hidden"
      />

      {view === 'diet' ? (
        !todayLog ? (
          <DailyActivityPrompt onSelect={handleDailyActivity} />
        ) : (
          <div className="space-y-6">
            {((currentDayOfProgram - 1) % 7 === 0) && (
              <ShoppingList 
                phase={currentPhase} 
                onDownloadPDF={() => downloadAsPDF('shopping-list-print', `Daftar-Belanja-Santuy-Minggu-${currentWeek}`)}
                isGenerating={isGeneratingPDF}
                className="print:hidden" 
              />
            )}
            
            <MealPlan 
              phase={currentPhase} 
              activity={todayLog.activity} 
              targetCalories={state.weeklyCheckIns[state.weeklyCheckIns.length - 1].targetCalories}
              exerciseCalories={todayLog.exercise?.caloriesBurned || 0}
              dayOfProgram={currentDayOfProgram}
              onDownloadPDF={() => downloadAsPDF(`meal-plan-day-${currentDayOfProgram}`, `Resep-Santuy-Hari-${currentDayOfProgram}`)}
              isGenerating={isGeneratingPDF}
              className="print:hidden"
            />

            <WeeklySchedule 
              currentWeek={currentWeek} 
              onDownloadPDF={() => downloadAsPDF('weekly-schedule-print', `Jadwal-Santuy-Minggu-${currentWeek}`)}
              isGenerating={isGeneratingPDF}
            />
            
            <DailyTracker 
              log={todayLog} 
              onUpdate={handleUpdateDailyLog} 
              weight={state.weeklyCheckIns[state.weeklyCheckIns.length - 1].weight} 
              onDownloadPDF={() => downloadAsPDF('daily-tracker-print', `Tracker-Santuy-Hari-${currentDayOfProgram}`)}
              isGenerating={isGeneratingPDF}
              className="print:hidden"
            />

            <div className="card bg-brand-accent/10 border border-brand-accent/20 print:hidden">
              <div className="flex items-center gap-2 mb-2">
                <Lightbulb size={18} className="text-brand-accent" />
                <h3 className="font-serif font-bold text-brand-primary">Tips Harian Santuy</h3>
              </div>
              <p className="text-sm text-brand-primary italic">
                "{DAILY_TIPS[(currentDayOfProgram - 1) % DAILY_TIPS.length]}"
              </p>
            </div>

            <div className="card bg-brand-primary text-white print:hidden">
              <h3 className="font-serif italic text-lg mb-2">Motivasi Santuy Coach</h3>
              <p className="text-sm opacity-90 italic">
                "{MOTIVATIONS[(currentDayOfProgram - 1) % MOTIVATIONS.length]}"
              </p>
            </div>
          </div>
        )
      ) : view === 'progress' ? (
        <ProgressView 
          checkIns={state.weeklyCheckIns} 
          initialWeight={state.profile.initialWeight} 
          onDownloadPDF={() => downloadAsPDF('progress-view-print', `Progres-Santuy-${state.profile?.name}`)}
          isGenerating={isGeneratingPDF}
        />
      ) : view === 'chat' ? (
        <ChatView 
          profile={state.profile}
          currentWeek={currentWeek}
          currentPhase={currentPhase}
          todayLog={todayLog}
          weeklyCheckIns={state.weeklyCheckIns}
        />
      ) : (
        <ProfileView 
          profile={state.profile} 
          onReset={handleResetProfile} 
          onSimulateDay={handleSimulateDay}
          onDownloadPDF={() => downloadAsPDF('profile-view-print', `Profil-Santuy-${state.profile?.name}`)}
          isGenerating={isGeneratingPDF}
        />
      )}

      <BottomNav currentView={view} setView={setView} className="print:hidden" />
    </div>
  );
}

function WeeklySchedule({ currentWeek, onDownloadPDF, isGenerating }: { currentWeek: number, onDownloadPDF?: () => void, isGenerating?: boolean }) {
  const days = [1, 2, 3, 4, 5, 6, 7];
  const cycleIndex = Math.floor((currentWeek - 1) / 2);
  
  const cookingMethods = ['Panggang', 'Kukus', 'Pepes', 'Rebus', 'Sup Kuah Bening'];
  const vegetables = [
    'Selada Keriting (Lalap Mentah)', 
    'Selada Romaine (Tumis Bawang Putih)', 
    'Selada Air (Kuah Bening)', 
    'Selada Bokor / Iceberg (Rebus Sebentar)', 
    'Siomak / Selada Wangi (Tumis)', 
    'Selada Merah (Salad Segar)', 
    'Selada Romaine (Panggang)'
  ];

  // Variasi Snack berdasarkan cycle
  const snack1Options = ['Pepaya / Semangka / Melon', 'Pir / Jeruk / Belimbing', 'Nanas / Naga / Jambu'];
  const snack2Options = ['1 Apel', '1 Pisang', '1 Pir'];
  const snack3Options = ['1 Jagung Rebus', '1 Ubi Rebus', '1 Kentang Rebus'];
  
  const currentSnack1 = snack1Options[cycleIndex % snack1Options.length];
  const currentSnack2 = snack2Options[cycleIndex % snack2Options.length];
  const currentSnack3 = snack3Options[cycleIndex % snack3Options.length];

  // Pergeseran waktu makan setiap 2 minggu (Cycle)
  const timeOffsets = [0, 30, -30, 60, -60];
  const offset = timeOffsets[cycleIndex % timeOffsets.length];
  
  const shiftTime = (baseTime: string, offsetMinutes: number) => {
    const [h, m] = baseTime.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + offsetMinutes, 0);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const [expandedDay, setExpandedDay] = useState<number | null>(null);

  return (
    <div id="weekly-schedule-print" className="card space-y-4 print:shadow-none print:border-none">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Calendar size={18} className="text-brand-accent print:hidden" />
          <h3 className="text-xl font-serif font-bold">Menu Lengkap Minggu {currentWeek}</h3>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              window.focus();
              window.print();
            }}
            className="p-2 rounded-full bg-brand-primary/5 text-brand-primary hover:bg-brand-primary/10 transition-colors print:hidden"
            title="Print Menu"
          >
            <Printer size={18} />
          </button>
          <button 
            onClick={onDownloadPDF}
            disabled={isGenerating}
            className="p-2 rounded-full bg-brand-accent/5 text-brand-accent hover:bg-brand-accent/10 transition-colors print:hidden disabled:opacity-50"
            title="Download PDF"
          >
            {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {days.map(d => {
          const dayOfProgram = (currentWeek - 1) * 7 + d;
          const isChicken = (dayOfProgram + cycleIndex) % 2 !== 0;
          const mainProtein = isChicken ? 'Ayam' : 'Ikan';
          const method = cookingMethods[(dayOfProgram - 1 + cycleIndex) % cookingMethods.length];
          const veggie = vegetables[(dayOfProgram - 1 + cycleIndex) % vegetables.length];
          const isExpanded = expandedDay === d;

          return (
            <div key={d} className="border border-brand-primary/10 rounded-xl overflow-hidden print-no-break">
              <button 
                onClick={() => setExpandedDay(isExpanded ? null : d)}
                className="w-full flex justify-between items-center p-3 bg-brand-bg/50 hover:bg-brand-bg transition-colors print:bg-white"
              >
                <div className="flex items-center gap-3">
                  <span className="font-bold text-brand-secondary">Hari {d}</span>
                  <span className={`px-2 py-0.5 rounded-[4px] text-[10px] font-bold uppercase ${isChicken ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                    {mainProtein} {method}
                  </span>
                </div>
                <div className="print:hidden">
                  {isExpanded ? <ChevronUp size={16} className="text-brand-primary" /> : <ChevronDown size={16} className="text-brand-secondary" />}
                </div>
              </button>
              
              <div className={`bg-white border-t border-brand-primary/5 print:block ${isExpanded ? 'block' : 'hidden'}`}>
                <div className="p-3 space-y-2 text-xs">
                  <div className="flex justify-between border-b border-brand-primary/5 pb-1">
                    <span className="font-semibold opacity-70">{shiftTime('06:30', offset)} - Sarapan</span>
                    <span>2 Telur Rebus</span>
                  </div>
                  <div className="flex justify-between border-b border-brand-primary/5 pb-1">
                    <span className="font-semibold opacity-70">{shiftTime('08:00', offset)} - Snack 1</span>
                    <span>{currentSnack1} (250g)</span>
                  </div>
                  <div className="flex justify-between border-b border-brand-primary/5 pb-1">
                    <span className="font-semibold opacity-70">{shiftTime('11:00', offset)} - Makan Siang</span>
                    <span className="text-right font-medium text-brand-primary">Nasi + {mainProtein} {method} + {veggie}</span>
                  </div>
                  <div className="flex justify-between border-b border-brand-primary/5 pb-1">
                    <span className="font-semibold opacity-70">{shiftTime('14:00', offset)} - Snack 2</span>
                    <span>{currentSnack2}</span>
                  </div>
                  <div className="flex justify-between border-b border-brand-primary/5 pb-1">
                    <span className="font-semibold opacity-70">{shiftTime('17:00', offset)} - Makan Malam</span>
                    {d === 7 ? (
                      <span className="text-right font-bold text-orange-500">Makan Bebas (Cheat Meal)</span>
                    ) : (
                      <span className="text-right font-medium text-brand-primary">Nasi + {mainProtein} {method} + {veggie}</span>
                    )}
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold opacity-70">{shiftTime('20:00', offset)} - Snack 3</span>
                    <span>{currentSnack3}</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProfileView({ profile, onReset, onSimulateDay, onDownloadPDF, isGenerating }: { profile: UserProfile, onReset: () => void, onSimulateDay: (days: number) => void, onDownloadPDF?: () => void, isGenerating?: boolean }) {
  const [showConfirm, setShowConfirm] = useState(false);

  const bmr = Math.round(calculateBMR(profile.initialWeight, profile.height, profile.age, profile.gender));
  const tdee = Math.round(calculateTDEE(bmr, profile.baseActivityLevel));
  const targetCalories = Math.round(calculateTargetCalories(tdee, profile.gender));
  const calorieDeficit = tdee - targetCalories;
  const waterIntake = Math.round((profile.initialWeight * 35) / 100) / 10; // 35ml per kg body weight
  
  // Realistic weight loss is 0.5% to 1% of body weight per week
  const minLoss = (profile.initialWeight * 0.005).toFixed(1);
  const maxLoss = (profile.initialWeight * 0.01).toFixed(1);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      id="profile-view-print"
      className="space-y-6"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-serif font-bold">Profil Saya</h3>
        <button 
          onClick={onDownloadPDF}
          disabled={isGenerating}
          className="p-2 rounded-full bg-brand-accent/5 text-brand-accent hover:bg-brand-accent/10 transition-colors disabled:opacity-50"
          title="Download Profil PDF"
        >
          {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        </button>
      </div>
      
      <div className="card space-y-4">
        <div className="flex justify-between border-b border-brand-primary/5 pb-2">
          <span className="text-brand-secondary text-sm">Nama</span>
          <span className="font-bold">{profile.name}</span>
        </div>
        <div className="flex justify-between border-b border-brand-primary/5 pb-2">
          <span className="text-brand-secondary text-sm">Umur</span>
          <span className="font-bold">{profile.age} Tahun</span>
        </div>
        <div className="flex justify-between border-b border-brand-primary/5 pb-2">
          <span className="text-brand-secondary text-sm">Tinggi</span>
          <span className="font-bold">{profile.height} cm</span>
        </div>
        <div className="flex justify-between border-b border-brand-primary/5 pb-2">
          <span className="text-brand-secondary text-sm">Gender</span>
          <span className="font-bold">{profile.gender === 'M' ? 'Pria' : 'Wanita'}</span>
        </div>
        <div className="flex justify-between border-b border-brand-primary/5 pb-2">
          <span className="text-brand-secondary text-sm">Berat Awal</span>
          <span className="font-bold">{profile.initialWeight.toFixed(2)} kg</span>
        </div>
        {profile.initialMeasurements && (
          <div className="pt-2 space-y-2">
            <span className="text-[10px] font-bold uppercase opacity-50 block">Lingkar Tubuh Awal</span>
            <div className="grid grid-cols-2 gap-2">
              <div className="text-xs bg-brand-bg p-2 rounded">Perut: <b>{profile.initialMeasurements.belly} cm</b></div>
              <div className="text-xs bg-brand-bg p-2 rounded">Pinggang: <b>{profile.initialMeasurements.waist} cm</b></div>
              <div className="text-xs bg-brand-bg p-2 rounded">Pinggul: <b>{profile.initialMeasurements.hip} cm</b></div>
              <div className="text-xs bg-brand-bg p-2 rounded">Leher: <b>{profile.initialMeasurements.neck} cm</b></div>
              <div className="text-xs bg-brand-bg p-2 rounded">Lengan: <b>{profile.initialMeasurements.arm} cm</b></div>
              <div className="text-xs bg-brand-bg p-2 rounded">Paha: <b>{profile.initialMeasurements.thigh} cm</b></div>
            </div>
          </div>
        )}
      </div>

      <h3 className="text-xl font-serif font-bold pt-2">Target & Kebutuhan Harian</h3>
      <div className="card space-y-4 bg-brand-primary/5 border-brand-primary/10">
        <div className="flex justify-between border-b border-brand-primary/10 pb-2">
          <span className="text-brand-secondary text-sm">BMR (Metabolisme Dasar)</span>
          <span className="font-bold">{bmr} kcal</span>
        </div>
        <div className="flex justify-between border-b border-brand-primary/10 pb-2">
          <span className="text-brand-secondary text-sm">TDEE (Kebutuhan Total)</span>
          <span className="font-bold">{tdee} kcal</span>
        </div>
        <div className="flex justify-between border-b border-brand-primary/10 pb-2">
          <span className="text-brand-secondary text-sm">Target Kalori Diet</span>
          <span className="font-bold text-brand-primary">{targetCalories} kcal</span>
        </div>
        <div className="flex justify-between border-b border-brand-primary/10 pb-2">
          <span className="text-brand-secondary text-sm">Defisit Kalori</span>
          <span className="font-bold text-red-500">-{calorieDeficit} kcal</span>
        </div>
        <div className="flex justify-between border-b border-brand-primary/10 pb-2">
          <span className="text-brand-secondary text-sm">Kebutuhan Air Minum</span>
          <span className="font-bold text-blue-500">{waterIntake} Liter</span>
        </div>
        <div className="flex justify-between pt-1">
          <span className="text-brand-secondary text-sm">Kebutuhan Olahraga</span>
          <span className="font-bold text-right text-xs max-w-[150px]">3-5x seminggu<br/>(30-45 mnt Kardio/Beban)</span>
        </div>
      </div>

      <div className="text-xs text-brand-secondary bg-brand-bg p-3 rounded-xl border border-brand-primary/5 space-y-2">
        <p><span className="font-bold">BMR:</span> Kalori yang dibakar tubuh saat istirahat total.</p>
        <p><span className="font-bold">TDEE:</span> Total kalori yang dibakar tubuh berdasarkan aktivitas harian.</p>
        <p><span className="font-bold">Defisit Kalori:</span> Pengurangan kalori dari TDEE untuk menurunkan berat badan dengan aman (maksimal -500 kcal).</p>
      </div>

      <div className="card space-y-3 bg-green-50 border-green-100">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle2 size={16} />
          <h4 className="font-bold text-sm">Mengapa Diet Ini Aman?</h4>
        </div>
        <ul className="text-xs text-green-800 space-y-2 list-disc pl-4">
          <li><span className="font-bold">Defisit Moderat:</span> Pemotongan kalori maksimal 500 kcal/hari (tidak ekstrem) untuk mencegah metabolisme melambat.</li>
          <li><span className="font-bold">Nutrisi Seimbang:</span> Tetap makan nasi (karbo) untuk energi, dan tinggi protein (ayam/ikan) untuk menjaga massa otot.</li>
          <li><span className="font-bold">Fase Santuy:</span> Adanya diet break/fase santuy mencegah stres psikologis dan adaptasi metabolik.</li>
          <li><span className="font-bold">Hidrasi Cukup:</span> Target minum air disesuaikan spesifik dengan berat badan Anda.</li>
        </ul>
      </div>

      <div className="card space-y-3 bg-blue-50 border-blue-100">
        <div className="flex items-center gap-2 text-blue-700">
          <Target size={16} />
          <h4 className="font-bold text-sm">Target & Ekspektasi Personal</h4>
        </div>
        <ul className="text-xs text-blue-800 space-y-3 list-disc pl-4">
          <li>
            <span className="font-bold">Target Penurunan Realistis:</span> Berdasarkan berat badan awalmu ({profile.initialWeight} kg), target penurunan yang sehat dan aman untuk tubuhmu adalah <span className="font-bold">{minLoss} - {maxLoss} kg per minggu</span>. 
            <p className="mt-1 opacity-80">Penurunan drastis lebih dari angka ini berisiko menghilangkan massa otot dan air, bukan lemak.</p>
          </li>
          <li>
            <span className="font-bold">Integrasi Olahraga (Wajib untuk Hasil Optimal):</span> Diet (defisit kalori) bertugas memangkas lemak, tetapi <span className="font-bold">olahraga bertugas membentuk tubuh dan mempercepat metabolisme</span>. Tanpa olahraga, tubuh bisa menjadi "skinny fat" (kurus tapi menggelambir). Sangat disarankan untuk:
            <ul className="list-disc list-inside pl-2 mt-2 space-y-1 opacity-90">
              <li><span className="font-bold">Latihan Beban (2-3x seminggu):</span> Mempertahankan massa otot agar metabolisme tidak turun saat diet.</li>
              <li><span className="font-bold">Kardio Santai (1-2x seminggu):</span> Jalan cepat, bersepeda, atau berenang untuk kesehatan jantung dan ekstra pembakaran kalori.</li>
            </ul>
          </li>
        </ul>
      </div>

      <div className="card space-y-3 bg-orange-50 border-orange-100">
        <div className="flex items-center gap-2 text-orange-700">
          <ShoppingBag size={16} />
          <h4 className="font-bold text-sm">Peralatan Wajib Diet</h4>
        </div>
        <ul className="text-xs text-orange-800 space-y-3 list-disc pl-4">
          <li>
            <div className="flex items-center gap-1.5 font-bold mb-0.5"><Scale size={12} /> Timbangan Makanan Digital</div>
            Kunci sukses defisit kalori. Menimbang makanan mentah/matang jauh lebih akurat daripada takaran sendok atau mangkok.
          </li>
          <li>
            <div className="flex items-center gap-1.5 font-bold mb-0.5"><Weight size={12} /> Timbangan Badan Digital</div>
            Untuk memantau berat badan dengan akurat. Hindari timbangan jarum karena kurang presisi. Timbanglah di pagi hari setelah BAB dan sebelum makan/minum.
          </li>
          <li>
            <div className="flex items-center gap-1.5 font-bold mb-0.5"><Ruler size={12} /> Pita Meteran (Measuring Tape)</div>
            Untuk mengukur lingkar tubuh (perut, paha, lengan). Kadang berat badan tidak turun (karena massa otot bertambah), tapi lingkar tubuh menyusut (fat loss).
          </li>
        </ul>
      </div>

      <div className="card space-y-3 bg-purple-50 border-purple-100">
        <div className="flex items-center gap-2 text-purple-700">
          <Clock size={16} />
          <h4 className="font-bold text-sm">Simulasi Waktu (Dev Tools)</h4>
        </div>
        <p className="text-xs text-purple-800">
          Gunakan tombol di bawah untuk mensimulasikan perjalanan waktu agar Anda bisa melihat tampilan Hari ke-2 hingga ke-14, serta notifikasi Check-in Mingguan.
        </p>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button 
            onClick={() => onSimulateDay(1)}
            className="p-2 bg-white border border-purple-200 rounded-lg text-xs font-bold text-purple-700 hover:bg-purple-100"
          >
            +1 Hari (Besok)
          </button>
          <button 
            onClick={() => onSimulateDay(7)}
            className="p-2 bg-white border border-purple-200 rounded-lg text-xs font-bold text-purple-700 hover:bg-purple-100"
          >
            +7 Hari (Minggu 2)
          </button>
          <button 
            onClick={() => onSimulateDay(14)}
            className="p-2 bg-white border border-purple-200 rounded-lg text-xs font-bold text-purple-700 hover:bg-purple-100"
          >
            +14 Hari (Minggu 3)
          </button>
          <button 
            onClick={() => onSimulateDay(0)}
            className="p-2 bg-white border border-purple-200 rounded-lg text-xs font-bold text-purple-700 hover:bg-purple-100"
          >
            Reset ke Hari 1
          </button>
        </div>
      </div>

      {!showConfirm ? (
        <button 
          onClick={() => setShowConfirm(true)}
          className="w-full p-4 rounded-2xl border-2 border-red-500 text-red-500 font-bold hover:bg-red-500 hover:text-white transition-all"
        >
          Reset Profil & Data
        </button>
      ) : (
        <div className="card border-red-500 bg-red-50 space-y-4">
          <p className="text-sm text-red-700 font-bold text-center">
            Apakah Anda yakin ingin menghapus semua data? Tindakan ini tidak bisa dibatalkan.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={() => setShowConfirm(false)}
              className="flex-1 p-3 rounded-xl bg-white border border-brand-primary/10 text-sm font-bold"
            >
              Batal
            </button>
            <button 
              onClick={onReset}
              className="flex-1 p-3 rounded-xl bg-red-500 text-white text-sm font-bold"
            >
              Ya, Reset
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ProgressView({ checkIns, initialWeight, onDownloadPDF, isGenerating }: { checkIns: WeeklyCheckIn[], initialWeight: number, onDownloadPDF?: () => void, isGenerating?: boolean }) {
  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      id="progress-view-print"
      className="space-y-6"
    >
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-serif font-bold">Progres Dietmu</h3>
        <button 
          onClick={onDownloadPDF}
          disabled={isGenerating}
          className="p-2 rounded-full bg-brand-accent/5 text-brand-accent hover:bg-brand-accent/10 transition-colors disabled:opacity-50"
          title="Download Progres PDF"
        >
          {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        </button>
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="card text-center">
          <span className="block text-[10px] font-bold uppercase opacity-50 mb-1">Berat Awal</span>
          <span className="text-2xl font-bold">{initialWeight.toFixed(2)} kg</span>
        </div>
        <div className="card text-center">
          <span className="block text-[10px] font-bold uppercase opacity-50 mb-1">Berat Sekarang</span>
          <span className="text-2xl font-bold">{checkIns[checkIns.length - 1].weight.toFixed(2)} kg</span>
        </div>
      </div>

      <div className="card">
        <h4 className="font-bold text-sm mb-4">Riwayat Mingguan</h4>
        <div className="space-y-4">
          {checkIns.map((c, i) => (
            <div key={i} className="flex justify-between items-center border-b border-brand-primary/5 pb-2">
              <div>
                <span className="block font-bold">Minggu {c.weekNumber}</span>
                <span className="text-[10px] text-brand-secondary">{new Date(c.date).toLocaleDateString('id-ID')}</span>
              </div>
              <div className="text-right">
                <span className="block font-bold">{c.weight.toFixed(2)} kg</span>
                {i > 0 && (
                  <span className={`text-[10px] font-bold ${c.weight < checkIns[i-1].weight ? 'text-green-500' : 'text-red-500'}`}>
                    {c.weight < checkIns[i-1].weight ? '↓' : '↑'} {Math.abs(c.weight - checkIns[i-1].weight).toFixed(2)} kg
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

const BodyMeasurementGuide = () => (
  <div className="relative w-full max-w-[220px] mx-auto aspect-[1/2] bg-brand-primary/5 rounded-xl flex items-center justify-center overflow-hidden border border-brand-primary/10 my-4">
    {/* Human silhouette SVG */}
    <svg viewBox="0 0 100 200" className="w-full h-full text-brand-primary/20" fill="currentColor">
      {/* Head */}
      <circle cx="50" cy="20" r="13" />
      {/* Neck */}
      <rect x="45" y="30" width="10" height="15" rx="2" />
      {/* Torso */}
      <path d="M28 45 Q50 40 72 45 L65 90 Q50 95 35 90 Z" />
      {/* Pelvis/Hips */}
      <path d="M35 89 Q50 95 65 89 L68 110 Q50 120 32 110 Z" />
      {/* Arms */}
      <path d="M28 45 Q15 75 20 110" stroke="currentColor" strokeWidth="11" strokeLinecap="round" fill="none" />
      <path d="M72 45 Q85 75 80 110" stroke="currentColor" strokeWidth="11" strokeLinecap="round" fill="none" />
      {/* Legs */}
      <path d="M38 105 L35 180" stroke="currentColor" strokeWidth="15" strokeLinecap="round" fill="none" />
      <path d="M62 105 L65 180" stroke="currentColor" strokeWidth="15" strokeLinecap="round" fill="none" />
    </svg>

    {/* Measurement Lines */}
    {/* Leher */}
    <div className="absolute top-[17%] left-0 w-full flex items-center px-4">
      <div className="flex-1 border-t border-dashed border-brand-primary"></div>
      <span className="text-[9px] font-bold text-brand-primary bg-white px-1.5 py-0.5 rounded shadow-sm mx-2">Leher</span>
      <div className="flex-1 border-t border-dashed border-brand-primary"></div>
    </div>
    
    {/* Lengan */}
    <div className="absolute top-[37%] left-0 w-full flex items-center px-4">
      <span className="text-[9px] font-bold text-brand-primary bg-white px-1.5 py-0.5 rounded shadow-sm mr-2">Lengan</span>
      <div className="flex-1 border-t border-dashed border-brand-primary"></div>
    </div>

    {/* Pinggang */}
    <div className="absolute top-[43%] left-0 w-full flex items-center px-4">
      <div className="flex-1 border-t border-dashed border-brand-primary"></div>
      <span className="text-[9px] font-bold text-brand-primary bg-white px-1.5 py-0.5 rounded shadow-sm ml-2">Pinggang</span>
    </div>

    {/* Perut */}
    <div className="absolute top-[49%] left-0 w-full flex items-center px-4">
      <span className="text-[9px] font-bold text-brand-primary bg-white px-1.5 py-0.5 rounded shadow-sm mr-2">Perut</span>
      <div className="flex-1 border-t border-dashed border-brand-primary"></div>
    </div>

    {/* Pinggul */}
    <div className="absolute top-[56%] left-0 w-full flex items-center px-4">
      <div className="flex-1 border-t border-dashed border-brand-primary"></div>
      <span className="text-[9px] font-bold text-brand-primary bg-white px-1.5 py-0.5 rounded shadow-sm ml-2">Pinggul</span>
    </div>

    {/* Paha */}
    <div className="absolute top-[68%] left-0 w-full flex items-center px-4">
      <div className="flex-1 border-t border-dashed border-brand-primary"></div>
      <span className="text-[9px] font-bold text-brand-primary bg-white px-1.5 py-0.5 rounded shadow-sm mx-2">Paha</span>
      <div className="flex-1 border-t border-dashed border-brand-primary"></div>
    </div>
  </div>
);

function ProfileSetup({ onSubmit }: { onSubmit: (p: UserProfile) => void }) {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    gender: 'F',
    baseActivityLevel: 1.2,
    initialMeasurements: {
      belly: 0,
      waist: 0,
      hip: 0,
      neck: 0,
      arm: 0,
      thigh: 0
    }
  });

  const next = () => setStep(s => s + 1);

  const updateMeasurement = (key: string, val: number) => {
    setFormData(prev => ({
      ...prev,
      initialMeasurements: {
        ...prev.initialMeasurements!,
        [key]: val
      }
    }));
  };

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-center px-8 py-12">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="space-y-2">
          <h1 className="text-4xl font-serif font-bold tracking-tight">Santuy Coach</h1>
          <p className="text-brand-secondary">Mari mulai perjalanan dietmu dengan santuy.</p>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="block text-sm font-semibold uppercase tracking-wider opacity-60">Siapa Namamu?</label>
              <input 
                type="text" 
                className="w-full bg-transparent border-b-2 border-brand-primary py-2 text-2xl focus:outline-none"
                placeholder="Nama Anda"
                onChange={e => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <button 
              disabled={!formData.name}
              onClick={next} 
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              Lanjut <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => setFormData({ ...formData, gender: 'M' })}
                className={`p-6 rounded-3xl border-2 transition-all ${formData.gender === 'M' ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-primary/10'}`}
              >
                <User className="mx-auto mb-2" />
                <span className="font-bold">Pria</span>
              </button>
              <button 
                onClick={() => setFormData({ ...formData, gender: 'F' })}
                className={`p-6 rounded-3xl border-2 transition-all ${formData.gender === 'F' ? 'border-brand-primary bg-brand-primary text-white' : 'border-brand-primary/10'}`}
              >
                <User className="mx-auto mb-2" />
                <span className="font-bold">Wanita</span>
              </button>
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-semibold uppercase tracking-wider opacity-60">Umur</label>
              <input 
                type="number" 
                className="w-full bg-transparent border-b-2 border-brand-primary py-2 text-2xl focus:outline-none"
                placeholder="25"
                onChange={e => setFormData({ ...formData, age: Number(e.target.value) })}
              />
            </div>
            <button 
              disabled={!formData.age}
              onClick={next} 
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              Lanjut <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <label className="block text-sm font-semibold uppercase tracking-wider opacity-60">Tinggi Badan (cm)</label>
              <input 
                type="number" 
                className="w-full bg-transparent border-b-2 border-brand-primary py-2 text-2xl focus:outline-none"
                placeholder="170"
                onChange={e => setFormData({ ...formData, height: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-4">
              <label className="block text-sm font-semibold uppercase tracking-wider opacity-60">Berat Badan Saat Ini (kg)</label>
              <input 
                type="number" 
                step="0.01"
                className="w-full bg-transparent border-b-2 border-brand-primary py-2 text-2xl focus:outline-none"
                placeholder="70"
                onChange={e => setFormData({ ...formData, initialWeight: Number(e.target.value) })}
              />
            </div>
            <button 
              disabled={!formData.height || !formData.initialWeight}
              onClick={next} 
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              Lanjut <ArrowRight size={18} />
            </button>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-6">
            <h3 className="text-xl font-serif font-bold">Lingkar Tubuh Awal</h3>
            <BodyMeasurementGuide />
            <div className="text-xs text-brand-secondary space-y-2 bg-brand-primary/5 p-3 rounded-xl border border-brand-primary/10">
              <p className="font-bold text-brand-primary">Panduan Pengukuran:</p>
              <ul className="list-disc list-inside space-y-1">
                <li><span className="font-bold">Perut:</span> Sejajar pusar (Batas aman: Wanita &lt; 80cm, Pria &lt; 90cm)</li>
                <li><span className="font-bold">Pinggang:</span> Antara tulang rusuk terbawah & tulang pinggang</li>
                <li><span className="font-bold">Pinggul:</span> Bagian terlebar pantat</li>
                <li><span className="font-bold">Leher:</span> Di bawah jakun (pria) / tengah leher (wanita)</li>
                <li><span className="font-bold">Lengan:</span> Bagian tengah lengan atas</li>
                <li><span className="font-bold">Paha:</span> Bagian tengah paha atas</li>
              </ul>
              <p className="mt-2 italic opacity-80">Berdiri tegak, jangan menahan napas, dan pastikan pita pengukur tidak terlalu kencang/longgar.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase opacity-60">Perut (cm)</label>
                <input 
                  type="number" 
                  className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                  placeholder="0"
                  onChange={e => updateMeasurement('belly', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase opacity-60">Pinggang (cm)</label>
                <input 
                  type="number" 
                  className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                  placeholder="0"
                  onChange={e => updateMeasurement('waist', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase opacity-60">Pinggul (cm)</label>
                <input 
                  type="number" 
                  className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                  placeholder="0"
                  onChange={e => updateMeasurement('hip', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase opacity-60">Leher (cm)</label>
                <input 
                  type="number" 
                  className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                  placeholder="0"
                  onChange={e => updateMeasurement('neck', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase opacity-60">Lengan (cm)</label>
                <input 
                  type="number" 
                  className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                  placeholder="0"
                  onChange={e => updateMeasurement('arm', Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <label className="block text-[10px] font-bold uppercase opacity-60">Paha (cm)</label>
                <input 
                  type="number" 
                  className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                  placeholder="0"
                  onChange={e => updateMeasurement('thigh', Number(e.target.value))}
                />
              </div>
            </div>

            <button 
              onClick={() => onSubmit(formData as UserProfile)} 
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              Mulai Program <CheckCircle2 size={18} />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function WeeklyCheckInView({ weekNumber, onSubmit }: { weekNumber: number, onSubmit: (w: number, m: any) => void }) {
  const [weight, setWeight] = useState<number | ''>('');
  const [measurements, setMeasurements] = useState({ belly: '', waist: '', hip: '', neck: '', arm: '', thigh: '' });

  return (
    <div className="max-w-md mx-auto min-h-screen flex flex-col justify-center px-8 py-12">
      <div className="space-y-8">
        <div className="space-y-2">
          <span className="text-brand-accent font-bold uppercase tracking-widest text-xs">Check-in Mingguan</span>
          <h1 className="text-4xl font-serif font-bold tracking-tight">Minggu ke-{weekNumber}</h1>
          <p className="text-brand-secondary">Waktunya evaluasi progresmu minggu ini.</p>
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <label className="block text-sm font-semibold uppercase tracking-wider opacity-60">Berat Badan (kg)</label>
            <input 
              type="number" 
              step="0.01"
              className="w-full bg-transparent border-b-2 border-brand-primary py-2 text-2xl focus:outline-none"
              placeholder="0.00"
              value={weight}
              onChange={e => setWeight(Number(e.target.value))}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase opacity-50">Perut (cm)</label>
              <input 
                type="number" 
                className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                placeholder="0"
                value={measurements.belly}
                onChange={e => setMeasurements({ ...measurements, belly: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase opacity-50">Pinggang (cm)</label>
              <input 
                type="number" 
                className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                placeholder="0"
                value={measurements.waist}
                onChange={e => setMeasurements({ ...measurements, waist: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase opacity-50">Pinggul (cm)</label>
              <input 
                type="number" 
                className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                placeholder="0"
                value={measurements.hip}
                onChange={e => setMeasurements({ ...measurements, hip: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase opacity-50">Leher (cm)</label>
              <input 
                type="number" 
                className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                placeholder="0"
                value={measurements.neck}
                onChange={e => setMeasurements({ ...measurements, neck: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase opacity-50">Lengan (cm)</label>
              <input 
                type="number" 
                className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                placeholder="0"
                value={measurements.arm}
                onChange={e => setMeasurements({ ...measurements, arm: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-[10px] font-bold uppercase opacity-50">Paha (cm)</label>
              <input 
                type="number" 
                className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none"
                placeholder="0"
                value={measurements.thigh}
                onChange={e => setMeasurements({ ...measurements, thigh: e.target.value })}
              />
            </div>
          </div>

          <button 
            disabled={!weight}
            onClick={() => onSubmit(Number(weight), {
              belly: measurements.belly ? Number(measurements.belly) : undefined,
              waist: measurements.waist ? Number(measurements.waist) : undefined,
              hip: measurements.hip ? Number(measurements.hip) : undefined,
              neck: measurements.neck ? Number(measurements.neck) : undefined,
              arm: measurements.arm ? Number(measurements.arm) : undefined,
              thigh: measurements.thigh ? Number(measurements.thigh) : undefined,
            })} 
            className="btn-primary w-full"
          >
            Simpan Data & Lanjut
          </button>
        </div>
      </div>
    </div>
  );
}

function Header({ week, day, phase, className = "" }: { week: number, day: number, phase: Phase, className?: string }) {
  return (
    <div className={`flex justify-between items-end mb-8 ${className}`}>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${phase === 'Strict' ? 'bg-brand-primary text-white' : 'bg-brand-accent text-white'}`}>
            {phase} Phase
          </span>
          <span className="text-brand-secondary text-[10px] font-bold uppercase tracking-wider">
            Minggu {week}, Hari {day}
          </span>
        </div>
        <h2 className="text-3xl font-serif font-bold">Halo, Santuyers!</h2>
      </div>
      <div className="w-12 h-12 rounded-full bg-brand-primary/5 flex items-center justify-center">
        <User size={20} />
      </div>
    </div>
  );
}

const EXERCISE_METS: Record<string, number> = {
  'Jalan Kaki (Santai)': 3.0,
  'Jalan Kaki (Cepat)': 4.3,
  'Lari': 8.0,
  'Bersepeda': 6.0,
  'Senam/Zumba': 6.5,
  'Angkat Beban': 3.5,
  'Renang': 6.0,
};

function DailyTracker({ log, onUpdate, weight, onDownloadPDF, isGenerating, className = "" }: { log: DailyLog, onUpdate: (updates: Partial<DailyLog>) => void, weight: number, onDownloadPDF?: () => void, isGenerating?: boolean, className?: string }) {
  const [exerciseType, setExerciseType] = useState<string>('Jalan Kaki (Santai)');
  const [exerciseMinutes, setExerciseMinutes] = useState<number>(30);

  const handleAddExercise = () => {
    const met = EXERCISE_METS[exerciseType] || 3.0;
    const hours = exerciseMinutes / 60;
    const caloriesBurned = Math.round(met * weight * hours);
    
    onUpdate({
      exercise: {
        type: exerciseType,
        minutes: exerciseMinutes,
        caloriesBurned
      }
    });
  };

  const handleClearExercise = () => {
    onUpdate({ exercise: undefined });
  };

  const waterIntake = log.waterIntake || 0;
  const WATER_TARGET = 2000; // 2 Liters

  const handleAddWater = (amount: number) => {
    onUpdate({ waterIntake: Math.max(0, waterIntake + amount) });
  };

  return (
    <div id="daily-tracker-print" className={`space-y-4 ${className}`}>
      <div className="flex justify-between items-center">
        <h3 className="text-2xl font-serif font-bold">Tracker Hari Ini</h3>
        <button 
          onClick={onDownloadPDF}
          disabled={isGenerating}
          className="p-2 rounded-full bg-brand-accent/5 text-brand-accent hover:bg-brand-accent/10 transition-colors print:hidden disabled:opacity-50"
          title="Download Tracker PDF"
        >
          {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        </button>
      </div>
      {/* Exercise Tracker */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Flame size={18} className="text-brand-accent" />
          <h3 className="text-xl font-serif font-bold">Aktivitas Olahraga</h3>
        </div>
        
        {log.exercise ? (
          <div className="bg-brand-primary/5 p-4 rounded-xl border border-brand-primary/10 flex justify-between items-center">
            <div>
              <p className="font-bold text-brand-primary">{log.exercise.type}</p>
              <p className="text-xs text-brand-secondary">{log.exercise.minutes} menit</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-brand-accent">{log.exercise.caloriesBurned} kcal</p>
              <button 
                onClick={handleClearExercise}
                className="text-[10px] text-brand-secondary underline mt-1"
              >
                Hapus
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase opacity-60">Jenis Olahraga</label>
                <select 
                  className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none text-sm"
                  value={exerciseType}
                  onChange={(e) => setExerciseType(e.target.value)}
                >
                  {Object.keys(EXERCISE_METS).map(type => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase opacity-60">Durasi (Menit)</label>
                <input 
                  type="number" 
                  className="w-full bg-transparent border-b border-brand-primary py-1 focus:outline-none text-sm"
                  value={exerciseMinutes}
                  onChange={(e) => setExerciseMinutes(Number(e.target.value))}
                  min="1"
                />
              </div>
            </div>
            <button 
              onClick={handleAddExercise}
              className="btn-outline w-full py-2 text-sm"
            >
              Catat Olahraga
            </button>
          </div>
        )}
      </div>

      {/* Water Tracker */}
      <div className="card space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Droplets size={18} className="text-blue-500" />
          <h3 className="text-xl font-serif font-bold">Target Minum Harian</h3>
        </div>
        
        <div className="space-y-3">
          <div className="flex justify-between items-end">
            <div>
              <span className="text-2xl font-bold text-blue-600">{waterIntake}</span>
              <span className="text-sm text-brand-secondary"> / {WATER_TARGET} ml</span>
            </div>
            <span className="text-xs font-bold text-brand-secondary bg-brand-primary/5 px-2 py-1 rounded">
              {Math.round((waterIntake / WATER_TARGET) * 100)}%
            </span>
          </div>
          
          <div className="w-full h-3 bg-brand-primary/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-500"
              style={{ width: `${Math.min(100, (waterIntake / WATER_TARGET) * 100)}%` }}
            />
          </div>
          
          <div className="flex items-center justify-between pt-2">
            <button 
              onClick={() => handleAddWater(-250)}
              className="w-10 h-10 rounded-full bg-brand-primary/5 flex items-center justify-center text-brand-primary hover:bg-brand-primary/10 transition-colors"
              disabled={waterIntake <= 0}
            >
              <Minus size={16} />
            </button>
            <div className="text-center">
              <p className="text-xs font-bold text-brand-primary">+250 ml</p>
              <p className="text-[10px] text-brand-secondary">(1 Gelas)</p>
            </div>
            <button 
              onClick={() => handleAddWater(250)}
              className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 hover:bg-blue-100 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          
          <AnimatePresence>
            {waterIntake >= WATER_TARGET && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-green-50 text-green-700 text-xs p-3 rounded-lg text-center font-bold mt-2 border border-green-200"
              >
                🎉 Mantap! Target cairan hari ini sudah tercapai. Tubuhmu berterima kasih!
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-[10px] text-brand-secondary text-center italic opacity-80 pt-2">
            *Termasuk kuah makanan, teh tanpa gula, kopi hitam, dll.
          </p>
        </div>
      </div>
    </div>
  );
}

function DailyActivityPrompt({ onSelect }: { onSelect: (a: ActivityLevel) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="card space-y-6"
    >
      <div className="flex items-center gap-3">
        <Activity className="text-brand-accent" />
        <h3 className="text-xl font-serif font-bold">Aktivitas Hari Ini?</h3>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={() => onSelect('Rest Day')}
          className="p-4 rounded-2xl border border-brand-primary/10 hover:bg-brand-primary hover:text-white transition-all text-center"
        >
          <span className="block font-bold">Rest Day</span>
          <span className="text-[10px] opacity-60">Santai sejenak</span>
        </button>
        <button 
          onClick={() => onSelect('Active Day')}
          className="p-4 rounded-2xl border border-brand-primary/10 hover:bg-brand-primary hover:text-white transition-all text-center"
        >
          <span className="block font-bold">Active Day</span>
          <span className="text-[10px] opacity-60">Olahraga/Aktif</span>
        </button>
      </div>
    </motion.div>
  );
}

function ShoppingList({ phase, onDownloadPDF, isGenerating, className = "" }: { phase: Phase, onDownloadPDF?: () => void, isGenerating?: boolean, className?: string }) {
  return (
    <div id="shopping-list-print" className={`card border-brand-accent/20 bg-brand-accent/5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShoppingBag size={18} className="text-brand-accent" />
          <h3 className="font-serif font-bold text-lg">Daftar Belanja Mingguan</h3>
        </div>
        <button 
          onClick={onDownloadPDF}
          disabled={isGenerating}
          className="p-2 rounded-full bg-brand-accent/10 text-brand-accent hover:bg-brand-accent/20 transition-colors print:hidden disabled:opacity-50"
          title="Download PDF"
        >
          {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
        </button>
      </div>
      <div className="space-y-3">
        <div className="flex justify-between text-sm border-b border-brand-accent/10 pb-2">
          <span className="font-medium">Protein</span>
          <span className="text-brand-secondary">14 Telur, 1.5kg Ayam/Ikan</span>
        </div>
        <div className="flex justify-between text-sm border-b border-brand-accent/10 pb-2">
          <span className="font-medium">Karbohidrat</span>
          <span className="text-brand-secondary">1kg Beras, 7 Jagung Rebus</span>
        </div>
        <div className="flex justify-between text-sm border-b border-brand-accent/10 pb-2">
          <span className="font-medium">Buah & Sayur</span>
          <span className="text-brand-secondary">2kg Pepaya/Melon, 7 Apel, Selada</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="font-medium">Bumbu Dasar</span>
          <span className="text-brand-secondary">Garam, Lada, Rempah</span>
        </div>
      </div>
    </div>
  );
}

function MealPlan({ phase, activity, targetCalories, dayOfProgram, exerciseCalories = 0, onDownloadPDF, isGenerating, className = "" }: { phase: Phase, activity: ActivityLevel, targetCalories: number, dayOfProgram: number, exerciseCalories?: number, onDownloadPDF?: () => void, isGenerating?: boolean, className?: string }) {
  const currentWeek = Math.ceil(dayOfProgram / 7);
  const cycleIndex = Math.floor((currentWeek - 1) / 2);
  
  const isChickenDay = (dayOfProgram + cycleIndex) % 2 !== 0;
  const mainProtein = isChickenDay ? 'Ayam' : 'Ikan';
  
  const totalTarget = Math.round(targetCalories + exerciseCalories);
  
  // Variasi metode masak: Panggang, Kukus, Pepes, Rebus, Sup Kuah Bening
  const cookingMethods = ['Panggang', 'Kukus', 'Pepes', 'Rebus', 'Sup Kuah Bening'];
  const methodIndex = (dayOfProgram - 1 + cycleIndex) % cookingMethods.length;
  const currentMethod = cookingMethods[methodIndex];

  // Variasi sayuran (Keluarga Lettuce / Selada di Indonesia)
  const vegetables = [
    'Selada Keriting (Lalap Mentah)', 
    'Selada Romaine (Tumis Bawang Putih)', 
    'Selada Air (Kuah Bening)', 
    'Selada Bokor / Iceberg (Rebus Sebentar)', 
    'Siomak / Selada Wangi (Tumis)', 
    'Selada Merah (Salad Segar)', 
    'Selada Romaine (Panggang)'
  ];
  const currentVeggie = vegetables[(dayOfProgram - 1 + cycleIndex) % vegetables.length];

  // Variasi Snack berdasarkan cycle
  const snack1Options = ['Pepaya / Semangka / Melon', 'Pir / Jeruk / Belimbing', 'Nanas / Naga / Jambu'];
  const snack2Options = ['1 Apel', '1 Pisang', '1 Pir'];
  const snack3Options = ['1 Jagung Rebus', '1 Ubi Rebus', '1 Kentang Rebus'];
  
  const currentSnack1 = snack1Options[cycleIndex % snack1Options.length];
  const currentSnack2 = snack2Options[cycleIndex % snack2Options.length];
  const currentSnack3 = snack3Options[cycleIndex % snack3Options.length];

  // Pergeseran waktu makan setiap 2 minggu (Cycle)
  // Cycle 0: 06:30, Cycle 1: 07:00, Cycle 2: 06:00, Cycle 3: 07:30...
  const timeOffsets = [0, 30, -30, 60, -60];
  const offset = timeOffsets[cycleIndex % timeOffsets.length];
  
  const shiftTime = (baseTime: string, offsetMinutes: number) => {
    const [h, m] = baseTime.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + offsetMinutes, 0);
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  const nasiWeight = activity === 'Active Day' ? '100g' : '50g';
  const proteinWeight = '150g';
  const veggieWeight = '100g';
  const isCheatMeal = dayOfProgram % 7 === 0;

  const meals = [
    { time: shiftTime('06:30', offset), name: 'Sarapan', menu: '2 Telur Rebus', weight: '100g' },
    { time: shiftTime('08:00', offset), name: 'Snack 1', menu: currentSnack1, weight: '250g' },
    { 
      time: shiftTime('11:00', offset), 
      name: 'Makan Siang', 
      menu: `Nasi + ${mainProtein} (${currentMethod}) + ${currentVeggie}`, 
      details: [
        { item: 'Nasi', w: nasiWeight },
        { item: mainProtein, w: proteinWeight },
        { item: currentVeggie, w: veggieWeight }
      ]
    },
    { time: shiftTime('14:00', offset), name: 'Snack 2', menu: currentSnack2, weight: '150g' },
    { 
      time: shiftTime('17:00', offset), 
      name: 'Makan Malam', 
      menu: isCheatMeal ? 'Makan Bebas (Cheat Meal) - Max 600 kcal' : `Nasi + ${mainProtein} (${currentMethod}) + ${currentVeggie}`, 
      details: isCheatMeal ? [
        { item: 'Porsi', w: 'Wajar' },
        { item: 'Minuman', w: 'Rendah Gula' }
      ] : [
        { item: 'Nasi', w: nasiWeight },
        { item: mainProtein, w: proteinWeight },
        { item: currentVeggie, w: veggieWeight }
      ]
    },
    { time: shiftTime('20:00', offset), name: 'Snack 3', menu: currentSnack3, weight: '120g' },
  ];

  const getRecipeSteps = (method: string, protein: string, veggie: string) => {
    switch (method) {
      case 'Panggang':
        return [
          `Marinasi ${protein} dengan garam, lada, dan perasan jeruk nipis.`,
          `Panaskan teflon anti lengket, panggang hingga matang merata di kedua sisi.`,
          `Siapkan sayur pendamping: ${veggie}.`,
          `Sajikan dengan nasi hangat.`
        ];
      case 'Kukus':
        return [
          `Bumbui ${protein} dengan irisan bawang putih, jahe, dan sedikit garam.`,
          `Kukus selama 15-20 menit hingga daging empuk dan matang.`,
          `Siapkan sayur pendamping: ${veggie}.`,
          `Sajikan hangat dengan nasi.`
        ];
      case 'Pepes':
        return [
          `Haluskan bumbu (kunyit, kemiri, bawang), campur dengan ${protein}.`,
          `Bungkus dengan daun pisang (opsional) atau wadah tahan panas.`,
          `Kukus atau panggang sebentar hingga aroma bumbu meresap.`,
          `Sajikan dengan nasi dan sayur pendamping: ${veggie}.`
        ];
      case 'Rebus':
        return [
          `Didihkan air dengan jahe, serai, dan daun salam.`,
          `Masukkan ${protein}, rebus hingga matang dan kaldu bening keluar.`,
          `Bumbui dengan sedikit garam dan lada.`,
          `Sajikan dengan nasi dan sayur pendamping: ${veggie}.`
        ];
      case 'Sup Kuah Bening':
        return [
          `Didihkan air, masukkan irisan bawang putih, bawang merah, dan seledri.`,
          `Masukkan potongan ${protein}, rebus hingga matang.`,
          `Bumbui dengan garam, lada, dan sedikit kaldu jamur.`,
          `Sajikan hangat dengan sayur pendamping: ${veggie}.`
        ];
      default:
        return [];
    }
  };

  return (
    <div id={`meal-plan-day-${dayOfProgram}`} className={`space-y-6 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Utensils size={18} className="text-brand-accent print:hidden" />
          <h3 className="text-xl font-serif font-bold">Menu 6x Makan</h3>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <div className="text-[10px] font-bold uppercase bg-brand-primary/5 px-2 py-1 rounded">
              Target: {Math.round(targetCalories)} kcal
            </div>
            {exerciseCalories > 0 && (
              <div className="text-[9px] font-bold text-brand-accent mt-1">
                + Olahraga: {exerciseCalories} kcal
              </div>
            )}
            <div className="text-[11px] font-bold text-brand-primary mt-1 border-t border-brand-primary/10 pt-1">
              Total: {totalTarget} kcal
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => {
                window.focus();
                window.print();
              }}
              className="p-2 rounded-full bg-brand-primary/5 text-brand-primary hover:bg-brand-primary/10 transition-colors print:hidden"
              title="Print Resep"
            >
              <Printer size={18} />
            </button>
            <button 
              onClick={onDownloadPDF}
              disabled={isGenerating}
              className="p-2 rounded-full bg-brand-accent/5 text-brand-accent hover:bg-brand-accent/10 transition-colors print:hidden disabled:opacity-50"
              title="Download PDF"
            >
              {isGenerating ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
            </button>
          </div>
        </div>
      </div>
      
      <div className="space-y-4">
        {meals.map((meal, i) => (
          <div key={i} className="flex gap-4 items-start">
            <div className="w-12 text-[10px] font-bold text-brand-secondary pt-1">
              {meal.time}
            </div>
            <div className="flex-1 card p-4 flex justify-between items-center">
              <div className="flex-1">
                <span className="block text-[10px] font-bold uppercase opacity-50 mb-0.5">{meal.name}</span>
                <span className="font-medium text-sm block mb-1">{meal.menu}</span>
                {'details' in meal && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {meal.details?.map((d, idx) => (
                      <div key={idx} className="text-[9px] bg-brand-bg px-2 py-0.5 rounded border border-brand-primary/5">
                        <span className="opacity-60">{d.item}:</span> <span className="font-bold">{d.w}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {'weight' in meal && (
                <div className="text-[10px] font-mono bg-brand-bg px-2 py-1 rounded">
                  {meal.weight}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-serif font-bold">Resep Menu Utama</h3>
        <div className="card space-y-4">
          <div>
            <h4 className="font-bold text-sm flex items-center gap-2 mb-2">
              <Utensils size={14} className="text-brand-accent" />
              {mainProtein} {currentMethod} Santuy
            </h4>
            <div className="text-xs space-y-2 text-brand-secondary">
              <p className="font-bold text-brand-primary">Bahan-bahan:</p>
              <ul className="list-disc list-inside">
                <li>{proteinWeight} {mainProtein} <span className="opacity-70">(Bagian bebas, timbang tanpa tulang)</span></li>
                <li>{nasiWeight} Nasi Putih</li>
                <li>{veggieWeight} {currentVeggie}</li>
                <li>Bumbu sesuai metode {currentMethod}</li>
              </ul>
              <p className="font-bold text-brand-primary mt-2">Cara Memasak:</p>
              <ol className="list-decimal list-inside">
                {getRecipeSteps(currentMethod, isChickenDay ? 'ayam' : 'ikan', currentVeggie).map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BottomNav({ currentView, setView, className = "" }: { currentView: string, setView: (v: 'diet' | 'progress' | 'profile' | 'chat') => void, className?: string }) {
  return (
    <div className={`fixed bottom-0 left-0 right-0 bg-white border-t border-brand-primary/5 px-4 py-4 flex justify-around items-center z-50 ${className}`}>
      <button 
        onClick={() => setView('diet')}
        className={`flex flex-col items-center gap-1 transition-colors ${currentView === 'diet' ? 'text-brand-primary' : 'text-brand-secondary'}`}
      >
        <Calendar size={20} />
        <span className="text-[10px] font-bold uppercase">Diet</span>
      </button>
      <button 
        onClick={() => setView('chat')}
        className={`flex flex-col items-center gap-1 transition-colors ${currentView === 'chat' ? 'text-brand-accent' : 'text-brand-secondary'}`}
      >
        <MessageSquare size={20} />
        <span className="text-[10px] font-bold uppercase">Coach</span>
      </button>
      <button 
        onClick={() => setView('progress')}
        className={`flex flex-col items-center gap-1 transition-colors ${currentView === 'progress' ? 'text-brand-primary' : 'text-brand-secondary'}`}
      >
        <Weight size={20} />
        <span className="text-[10px] font-bold uppercase">Progres</span>
      </button>
      <button 
        onClick={() => setView('profile')}
        className={`flex flex-col items-center gap-1 transition-colors ${currentView === 'profile' ? 'text-brand-primary' : 'text-brand-secondary'}`}
      >
        <User size={20} />
        <span className="text-[10px] font-bold uppercase">Profil</span>
      </button>
    </div>
  );
}

interface Message {
  role: 'user' | 'model';
  text: string;
}

function ChatView({ profile, currentWeek, currentPhase, todayLog, weeklyCheckIns }: { 
  profile: UserProfile, 
  currentWeek: number, 
  currentPhase: Phase, 
  todayLog?: DailyLog,
  weeklyCheckIns: WeeklyCheckIn[]
}) {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'model', text: `Halo ${profile.name}! Saya Santuy Coach. Ada yang bisa saya bantu tentang dietmu hari ini? Kita sedang di Minggu ${currentWeek} (${currentPhase} Phase).` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const model = "gemini-3-flash-preview";
      
      const lastCheckIn = weeklyCheckIns[weeklyCheckIns.length - 1];
      const context = `
        User Profile: ${JSON.stringify(profile)}
        Current Week: ${currentWeek}
        Current Phase: ${currentPhase}
        Today's Activity: ${todayLog?.activity || 'Belum dicatat'}
        Last Weight: ${lastCheckIn.weight} kg
        Target Calories: ${lastCheckIn.targetCalories} kcal
      `;

      const systemInstruction = `
        Anda adalah "Santuy Coach", asisten diet profesional yang ramah, santai namun tetap informatif dan berbasis sains.
        Fokus utama Anda adalah membantu user menjalankan diet dengan rotasi 2 minggu (Strict vs Santuy).
        Gunakan bahasa Indonesia yang santai (tapi sopan) dan memotivasi.
        Berikan saran praktis tentang nutrisi, olahraga, dan gaya hidup sehat.
        Selalu pertimbangkan konteks user berikut: ${context}
        Jika user bertanya tentang menu, berikan saran yang sesuai dengan fase saat ini (${currentPhase}).
        Jangan memberikan saran medis yang berbahaya. Selalu ingatkan untuk konsultasi dokter jika perlu.
      `;

      const chat = ai.chats.create({
        model,
        config: {
          systemInstruction,
        },
        history: messages.map(m => ({
          role: m.role,
          parts: [{ text: m.text }]
        }))
      });

      const result = await chat.sendMessage({ message: userMessage });
      const responseText = result.text || "Maaf, saya sedang tidak bisa berpikir jernih. Coba lagi nanti ya!";
      
      setMessages(prev => [...prev, { role: 'model', text: responseText }]);
    } catch (error) {
      console.error("Chat Error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "Aduh, koneksi saya agak santuy banget nih (error). Coba lagi ya!" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col h-[calc(100vh-180px)]"
    >
      <div className="flex items-center gap-2 mb-4 px-2">
        <Sparkles className="text-brand-accent" size={20} />
        <h3 className="text-2xl font-serif font-bold">AI Coach</h3>
      </div>

      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-hide"
      >
        {messages.map((m, i) => (
          <div 
            key={i} 
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div 
              className={`max-w-[85%] p-4 rounded-2xl text-sm ${
                m.role === 'user' 
                  ? 'bg-brand-primary text-white rounded-tr-none' 
                  : 'bg-white border border-brand-primary/5 text-brand-primary rounded-tl-none shadow-sm'
              }`}
            >
              <div className="markdown-body prose prose-sm max-w-none">
                <Markdown>{m.text}</Markdown>
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-white border border-brand-primary/5 p-4 rounded-2xl rounded-tl-none shadow-sm">
              <Loader2 size={16} className="animate-spin text-brand-secondary" />
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input 
          type="text" 
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Tanya Coach apa saja..."
          className="flex-1 bg-white border border-brand-primary/10 rounded-full px-6 py-3 text-sm focus:outline-none focus:border-brand-accent transition-colors"
        />
        <button 
          onClick={handleSend}
          disabled={isLoading || !input.trim()}
          className="w-12 h-12 rounded-full bg-brand-primary text-white flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
        >
          <Send size={18} />
        </button>
      </div>
    </motion.div>
  );
}
