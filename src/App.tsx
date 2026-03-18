import React, { useState, useEffect, useRef, FormEvent, ChangeEvent, ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { User, LogOut, Users, Dumbbell, Activity, Search, Plus, ArrowLeft, Clock, Play, Check, Trash2, ChevronLeft, ChevronRight, Calendar as CalendarIcon, AlertTriangle, Image as ImageIcon, Video, Upload, X, Copy, Edit2, MessageCircle, CheckCircle2, XCircle, Circle, GripVertical, Send, CreditCard, FileText, History, RefreshCw, Globe, UserCheck, AlertCircle, Bell } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { auth, db } from "./firebase";
import { EXERCISES } from "./data/exercises";
import { AssessmentView } from "./components/AssessmentView";
import ErrorBoundary from "./components/ErrorBoundary";
import { handleFirestoreError, OperationType } from "./utils/firestoreErrors";
import { AuthProvider, useAuth, UserType } from "./contexts/AuthContext";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  sendPasswordResetEmail,
  deleteUser
} from "firebase/auth";
import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc,
  updateDoc,
  onSnapshot,
  deleteDoc,
  orderBy,
  limit,
  serverTimestamp,
  writeBatch,
  collectionGroup,
  getDocFromServer
} from "firebase/firestore";

const openWhatsApp = (phone?: string) => {
  if (!phone) {
    alert("Número de WhatsApp não cadastrado para este usuário.");
    return;
  }
  const cleanPhone = phone.replace(/\D/g, "");
  const url = `https://wa.me/${cleanPhone}`;
  
  // Create a temporary link and click it for better iframe compatibility
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("55");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [role, setRole] = useState<"personal" | "student" | "superadmin">("student");
  const [personalCode, setPersonalCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  const handleForgotPassword = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (!email) {
      setError("Por favor, insira seu e-mail para recuperar a senha.");
      return;
    }
    setError("");
    setSuccess("");
    setIsSubmitting(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccess("E-mail de recuperação enviado! Verifique sua caixa de entrada.");
    } catch (err: any) {
      console.error("Reset password error:", err);
      setError("Erro ao enviar e-mail de recuperação. Verifique se o e-mail está correto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    const isFirebaseConfigured = true; // Firebase is hardcoded in firebase.ts

    if (!isFirebaseConfigured) {
      setError("Firebase is not configured. Please follow the setup instructions.");
      setIsSubmitting(false);
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError("As senhas não coincidem.");
      setIsSubmitting(false);
      return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
      } else {
        let foundPersonalId = null;
        
        if (role === "student" && personalCode.trim() !== "") {
          const q = query(collection(db, "users_public"), where("role", "==", "personal"), where("personalCode", "==", personalCode.trim().toUpperCase()));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) {
            setError("Código do personal inválido.");
            setIsSubmitting(false);
            return;
          }
          foundPersonalId = querySnapshot.docs[0].id;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        const uid = userCredential.user.uid;

        let newPersonalCode = "";
        if (role === "personal") {
          newPersonalCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        }

        const batch = writeBatch(db);

        // Public profile
        batch.set(doc(db, "users_public", uid), {
          name,
          photoUrl: "",
          city: "",
          role: role,
          personalCode: newPersonalCode || (personalCode.trim() ? personalCode.trim().toUpperCase() : ""),
          profileCompleted: false,
          gender: gender,
          crefNumber: "",
          createdAt: new Date().toISOString()
        });

        // Private data
        batch.set(doc(db, "users_private", uid), {
          email: email.trim().toLowerCase(),
          phone: phone.trim(),
          cpf: "",
          birthDate: "",
          cep: "",
          address: "",
          medicalHistory: "",
          medications: ""
        });

        // Email lookup
        batch.set(doc(db, "user_emails", email.trim().toLowerCase()), {
          uid
        });

        await batch.commit();

        if (foundPersonalId) {
          const connectionId = `${foundPersonalId}_${uid}`;
          await setDoc(doc(db, "connections", connectionId), {
            personalId: foundPersonalId,
            studentId: uid,
            status: "active",
            createdAt: new Date().toISOString()
          });
        }
      }
    } catch (err: any) {
      console.error("Auth error details:", err);
      let message = "Ocorreu um erro ao processar sua solicitação.";
      
      if (err.code === "auth/email-already-in-use") message = "Este e-mail já está em uso.";
      else if (err.code === "auth/invalid-credential") message = "E-mail ou senha incorretos.";
      else if (err.code === "auth/weak-password") message = "A senha deve ter pelo menos 6 caracteres.";
      else if (err.code === "permission-denied") message = "Erro de permissão no banco de dados. Verifique as regras do Firestore.";
      else if (err.message) message = `Erro: ${err.message}`;

      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-white">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="bg-neutral-900 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-white/10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-500/10 p-2 rounded-2xl">
              <img src="https://i.imgur.com/fxOHjtK.png" alt="Track & Health Logo" className="w-16 h-16 object-contain" referrerPolicy="no-referrer" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Track & Health</h1>
          <p className="text-sm text-neutral-400 mt-1 italic">Monitoramento em Saúde</p>
        </div>
        <h2 className="text-xl font-bold text-white text-center mb-6">
          {isForgotPassword ? "Recuperar Senha" : (isLogin ? "Bem-vindo de volta" : "Criar Conta")}
        </h2>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl mb-6 text-sm text-center">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3 rounded-xl mb-6 text-sm text-center">
            {success}
          </div>
        )}

        <form onSubmit={isForgotPassword ? handleForgotPassword : handleSubmit} className="space-y-4">
          {!isLogin && !isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Nome Completo</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent transition-all"
                placeholder="João Silva"
                required
              />
            </div>
          )}
          
          <div>
            <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Endereço de E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent transition-all"
              placeholder="joao@exemplo.com"
              required
            />
          </div>

          {!isLogin && !isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Telefone (com DDI 55)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent transition-all"
                placeholder="5511999999999"
                required
              />
            </div>
          )}

          {!isLogin && !isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">Gênero</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setGender("male")}
                  className={`py-2 px-3 rounded-xl border text-xs transition-all ${
                    gender === "male"
                      ? "bg-orange-600/20 border-orange-600 text-orange-500"
                      : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  Masculino
                </button>
                <button
                  type="button"
                  onClick={() => setGender("female")}
                  className={`py-2 px-3 rounded-xl border text-xs transition-all ${
                    gender === "female"
                      ? "bg-orange-600/20 border-orange-600 text-orange-500"
                      : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  Feminino
                </button>
                <button
                  type="button"
                  onClick={() => setGender("other")}
                  className={`py-2 px-3 rounded-xl border text-xs transition-all ${
                    gender === "other"
                      ? "bg-orange-600/20 border-orange-600 text-orange-500"
                      : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  Outro
                </button>
              </div>
            </div>
          )}

          {!isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Senha</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          )}

          {!isLogin && !isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Confirmar Senha</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent transition-all"
                placeholder="••••••••"
                required
              />
            </div>
          )}

          {!isLogin && !isForgotPassword && (
            <div>
              <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-2">Eu sou um...</label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setRole("student")}
                  className={`py-3 px-4 rounded-xl border transition-all ${
                    role === "student"
                      ? "bg-orange-600/20 border-orange-600 text-orange-500"
                      : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  Aluno
                </button>
                <button
                  type="button"
                  onClick={() => setRole("personal")}
                  className={`py-3 px-4 rounded-xl border transition-all ${
                    role === "personal"
                      ? "bg-orange-600/20 border-orange-600 text-orange-500"
                      : "bg-neutral-50 dark:bg-neutral-800 border-neutral-200 dark:border-white/10 text-neutral-500 dark:text-neutral-400 hover:border-neutral-300 dark:hover:border-neutral-700"
                  }`}
                >
                  Personal Trainer
                </button>
              </div>
            </div>
          )}

          {!isLogin && !isForgotPassword && role === "student" && (
            <div>
              <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Código do Personal (Opcional)</label>
              <input
                type="text"
                value={personalCode}
                onChange={(e) => setPersonalCode(e.target.value)}
                className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600 focus:border-transparent transition-all uppercase"
                placeholder="EX: A1B2C3"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all transform active:scale-95 shadow-lg shadow-orange-600/20 mt-6"
          >
            {isSubmitting ? "Por favor, aguarde..." : (isForgotPassword ? "Enviar E-mail de Recuperação" : (isLogin ? "Entrar" : "Criar Conta"))}
          </button>
        </form>

        {isLogin && !isForgotPassword && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(true);
                setError("");
                setSuccess("");
              }}
              className="text-neutral-500 hover:text-white transition-colors text-xs font-medium"
            >
              Esqueceu sua senha? Clique aqui para recuperar
            </button>
          </div>
        )}

        {isForgotPassword && (
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => {
                setIsForgotPassword(false);
                setError("");
                setSuccess("");
              }}
              className="text-neutral-500 hover:text-white transition-colors text-xs font-medium"
            >
              Voltar para o login
            </button>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setIsForgotPassword(false);
              setError("");
              setSuccess("");
            }}
            className="text-emerald-400 hover:text-emerald-300 transition-colors text-sm font-medium"
          >
            {isLogin ? "Não tem uma conta? Cadastre-se" : "Já tem uma conta? Entre"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CustomCalendar({ selectedDate, onSelectDate, workoutDates = [] }: { selectedDate: string, onSelectDate: (date: string) => void, workoutDates?: string[] }) {
  const [currentMonth, setCurrentMonth] = useState(new Date(selectedDate + "T12:00:00Z"));

  const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay();

  const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };

  const days = [];
  for (let i = 0; i < firstDayOfMonth; i++) {
    days.push(<div key={`empty-${i}`} className="h-10 w-10"></div>);
  }

  for (let i = 1; i <= daysInMonth; i++) {
    const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i);
    const dateString = date.toISOString().split('T')[0];
    const isSelected = dateString === selectedDate;
    const isToday = dateString === new Date().toISOString().split('T')[0];
    const hasWorkout = workoutDates.some(d => d.startsWith(dateString));

    days.push(
      <button
        key={i}
        onClick={() => onSelectDate(dateString)}
        className={`h-10 w-10 rounded-full flex flex-col items-center justify-center text-sm font-medium transition-colors relative
          ${isSelected ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30' : 
            isToday ? 'bg-white/10 text-emerald-400 border border-emerald-500/30' : 
            'text-neutral-400 hover:bg-white/10 hover:text-white'}`}
      >
        {i}
        {hasWorkout && !isSelected && (
          <div className="absolute bottom-1 w-1 h-1 bg-orange-500 rounded-full"></div>
        )}
      </button>
    );
  }

  return (
    <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-2xl">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-orange-500" />
          {monthNames[currentMonth.getMonth()]} {currentMonth.getFullYear()}
        </h3>
        <div className="flex gap-2">
          <button onClick={handlePrevMonth} className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors text-neutral-400 hover:text-white">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={handleNextMonth} className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors text-neutral-400 hover:text-white">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-7 gap-2 mb-2">
        {dayNames.map(day => (
          <div key={day} className="h-8 flex items-center justify-center text-xs font-medium text-neutral-500">
            {day}
          </div>
        ))}
      </div>
      
      <div className="grid grid-cols-7 gap-2">
        {days}
      </div>
    </div>
  );
}

function WorkoutBuilder({ client, onBack, existingWorkout, personalOverrideId }: { client: any, onBack: () => void, existingWorkout?: any, personalOverrideId?: string }) {
  const { user } = useAuth();
  const personalId = personalOverrideId || user?.id;
  const draftKey = `draft_workout_${user?.id}_${client.id}_${existingWorkout?.id || 'new'}`;

  const [exercises, setExercises] = useState<any[]>(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        return JSON.parse(saved).exercises || existingWorkout?.exercises || [];
      } catch (e) { return existingWorkout?.exercises || []; }
    }
    return existingWorkout?.exercises || [];
  });
  const [currentExercise, setCurrentExercise] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [rest, setRest] = useState("60"); // seconds
  const [prescription, setPrescription] = useState(""); // For cardio
  const [workoutDate, setWorkoutDate] = useState(() => {
    const saved = localStorage.getItem(draftKey);
    if (saved) {
      try {
        return JSON.parse(saved).workoutDate || (existingWorkout?.date 
          ? new Date(existingWorkout.date).toISOString().split('T')[0] 
          : new Date().toISOString().split('T')[0]);
      } catch (e) { }
    }
    return existingWorkout?.date 
      ? new Date(existingWorkout.date).toISOString().split('T')[0] 
      : new Date().toISOString().split('T')[0];
  });
  const [isSaving, setIsSaving] = useState(false);
  const [showExerciseList, setShowExerciseList] = useState(false);
  const [media, setMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pastWorkouts, setPastWorkouts] = useState<any[]>([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [error, setError] = useState("");

  // Persist draft to localStorage
  useEffect(() => {
    const draft = {
      exercises,
      workoutDate
    };
    localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [exercises, workoutDate, draftKey]);

  useEffect(() => {
    fetchPastWorkouts();
  }, [client.id]);

  const fetchPastWorkouts = async () => {
    if (!personalId) return;
    try {
      const q = query(
        collection(db, "workouts"),
        where("studentId", "==", client.id),
        where("personalId", "==", personalId)
      );
      const querySnapshot = await getDocs(q);
      const workoutsData = await Promise.all(querySnapshot.docs.map(async (workoutDoc) => {
        const data = workoutDoc.data();
        const exercisesQ = query(collection(db, "exercises"), where("workoutId", "==", workoutDoc.id), orderBy("order", "asc"));
        const exercisesSnapshot = await getDocs(exercisesQ);
        const exercises = exercisesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        return { id: workoutDoc.id, ...data, exercises };
      }));
      workoutsData.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setPastWorkouts(workoutsData);
    } catch (error) {
      console.error("Error fetching past workouts:", error);
    }
  };

  const copyWorkout = (workout: any) => {
    const copiedExercises = workout.exercises.map((ex: any) => ({
      ...ex,
      id: Math.random().toString(36).substring(2, 9) // New IDs for the new workout
    }));
    setExercises(copiedExercises);
    setShowCopyModal(false);
  };

  const DEFAULT_EXERCISE_MEDIA: Record<string, { url: string, type: 'image' | 'video' }> = {
    "Supino Reto com Barra": { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2I4YjI5YjI5YjI5YjI5YjI5YjI5YjI5YjI5YjI5YjI5YjI5JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKMGVp9ZfXvXvXy/giphy.gif", type: 'image' },
    "Agachamento Livre": { url: "https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExM2I4YjI5YjI5YjI5YjI5YjI5YjI5YjI5YjI5YjI5YjI5YjI5JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKMGVp9ZfXvXvXy/giphy.gif", type: 'image' },
    // Adicionar mais conforme necessário ou usar um placeholder
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type === 'image/gif') {
      setError("Imagens GIF não são permitidas devido ao limite de tamanho. Use JPG ou PNG.");
      setTimeout(() => setError(""), 5000);
      return;
    }

    setIsUploading(true);
    setError("");
    const reader = new FileReader();
    reader.onloadend = () => {
      setMedia({
        url: reader.result as string,
        type: file.type.startsWith('video') ? 'video' : 'image'
      });
      setIsUploading(false);
    };
    reader.readAsDataURL(file);
  };

  const CARDIO_EXERCISES = ["Esteira", "Eliptico", "Simulador de Escadas", "Bike"];
  const isCardio = CARDIO_EXERCISES.includes(currentExercise);

  const filteredExercises = EXERCISES.filter(ex => 
    ex.toLowerCase().includes(currentExercise.toLowerCase())
  );

  const addExercise = () => {
    if (!currentExercise.trim()) return;
    
    // User requested no default image if none uploaded
    const finalMedia = media;

    const newExercise = {
      id: Math.random().toString(36).substring(2, 9),
      name: currentExercise,
      isCardio,
      media: finalMedia,
      ...(isCardio ? { prescription } : { sets, reps, rest: parseInt(rest) || 60 })
    };

    setExercises([...exercises, newExercise]);
    setCurrentExercise("");
    setSets("3");
    setReps("10");
    setRest("60");
    setPrescription("");
    setMedia(null);
    setShowExerciseList(false);
  };

  const removeExercise = (id: string) => {
    setExercises(exercises.filter(ex => ex.id !== id));
  };

  const deleteWorkout = async (id: string) => {
    console.log("Attempting to delete workout:", id);
    if (!window.confirm("CONFIRMAR EXCLUSÃO: Tem certeza que deseja excluir este treino permanentemente?")) return;
    
    try {
      const batch = writeBatch(db);
      
      // Delete workout document
      batch.delete(doc(db, "workouts", id));
      
      // Delete associated exercises
      const q = query(collection(db, "exercises"), where("workoutId", "==", id));
      const exerciseSnapshot = await getDocs(q);
      exerciseSnapshot.docs.forEach(exDoc => {
        batch.delete(exDoc.ref);
      });
      
      await batch.commit();
      alert("Treino excluído com sucesso!");
      onBack();
    } catch (error: any) {
      console.error("Error deleting workout:", error);
      alert("Erro ao excluir treino: " + (error.message || "Verifique suas permissões."));
    }
  };

  const saveWorkout = async () => {
    if (exercises.length === 0 || !personalId) return;
    setIsSaving(true);
    try {
      const dateObj = new Date(`${workoutDate}T12:00:00Z`);
      
      const workoutData = {
        personalId: personalId,
        studentId: client.id,
        date: dateObj.toISOString(),
        status: existingWorkout?.status || "active",
        createdAt: existingWorkout?.createdAt || new Date().toISOString()
      };

      const batch = writeBatch(db);
      let workoutId = existingWorkout?.id;

      if (workoutId) {
        batch.update(doc(db, "workouts", workoutId), workoutData);
        
        // Delete old exercises to replace them
        const q = query(collection(db, "exercises"), where("workoutId", "==", workoutId));
        const oldExercises = await getDocs(q);
        oldExercises.docs.forEach(exDoc => batch.delete(exDoc.ref));
      } else {
        const newWorkoutRef = doc(collection(db, "workouts"));
        workoutId = newWorkoutRef.id;
        batch.set(newWorkoutRef, workoutData);
      }

      // Add new exercises
      exercises.forEach((ex, index) => {
        const exRef = doc(collection(db, "exercises"));
        batch.set(exRef, {
          ...ex,
          workoutId,
          order: index
        });
      });

      await batch.commit();
      alert(existingWorkout?.id ? "Treino atualizado com sucesso!" : "Treino salvo com sucesso!");
      localStorage.removeItem(draftKey);
      onBack();
    } catch (err) {
      console.error(err);
      alert("Erro ao salvar treino.");
    } finally {
      setIsSaving(false);
    }
  };

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(exercises);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);
    setExercises(items);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-white">
            {existingWorkout ? "Editar Treino" : "Montar Treino"}
          </h2>
          <p className="text-sm text-neutral-400">Aluno: <span className="text-orange-500 font-medium">{client.name}</span></p>
        </div>
        <div className="ml-auto">
          <button 
            onClick={() => setShowCopyModal(true)}
            className="flex items-center gap-2 bg-neutral-800 hover:bg-neutral-700 text-white px-4 py-2 rounded-xl border border-white/10 transition-colors text-sm font-medium"
          >
            <Copy className="w-4 h-4 text-orange-500" />
            Copiar de treino anterior
          </button>
        </div>
      </div>

      {showCopyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 w-full max-w-lg rounded-3xl border border-white/10 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Selecionar Treino Anterior</h3>
              <button onClick={() => setShowCopyModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                <X className="w-6 h-6 text-neutral-400" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {pastWorkouts.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
                  <p className="text-neutral-500">Nenhum treino anterior encontrado para este aluno.</p>
                </div>
              ) : (
                pastWorkouts.map((workout) => (
                  <button
                    key={workout.id}
                    onClick={() => copyWorkout(workout)}
                    className="w-full text-left bg-neutral-800 hover:bg-neutral-700 p-4 rounded-2xl border border-white/5 hover:border-orange-500/50 transition-all group"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-white font-medium">Treino de {new Date(workout.date).toLocaleDateString('pt-BR')}</p>
                        <p className="text-xs text-neutral-400 mt-1">{workout.exercises.length} exercícios</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-neutral-600 group-hover:text-orange-500 transition-colors" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {workout.exercises.slice(0, 3).map((ex: any, i: number) => (
                        <span key={i} className="text-[10px] bg-neutral-900 text-neutral-400 px-2 py-1 rounded-md border border-white/5">
                          {ex.name}
                        </span>
                      ))}
                      {workout.exercises.length > 3 && (
                        <span className="text-[10px] text-neutral-500">+{workout.exercises.length - 3}</span>
                      )}
                    </div>
                  </button>
                ))
              )}
            </div>
            <div className="p-6 border-t border-white/10 bg-neutral-900/50">
              <button
                onClick={() => setShowCopyModal(false)}
                className="w-full py-3 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl font-medium transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <CustomCalendar selectedDate={workoutDate} onSelectDate={setWorkoutDate} />
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-white">Adicionar Exercício</h3>
              <span className="text-sm text-emerald-400 font-medium bg-emerald-500/10 px-3 py-1 rounded-full">
                {new Date(workoutDate + "T12:00:00Z").toLocaleDateString('pt-BR')}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className={isCardio ? "md:col-span-5 relative" : "md:col-span-4 relative"}>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Exercício</label>
                <input
                  type="text"
                  value={currentExercise}
                  onChange={(e) => {
                    setCurrentExercise(e.target.value);
                    setShowExerciseList(true);
                  }}
                  onFocus={() => setShowExerciseList(true)}
                  onBlur={() => setTimeout(() => setShowExerciseList(false), 200)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (filteredExercises.length > 0 && showExerciseList) {
                        setCurrentExercise(filteredExercises[0]);
                        setShowExerciseList(false);
                      } else {
                        addExercise();
                      }
                    }
                  }}
                  className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600"
                  placeholder="Ex: Supino Reto"
                />
                {showExerciseList && currentExercise && (
                  <div className="absolute z-10 w-full mt-1 bg-neutral-800 border border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                    {filteredExercises.length > 0 ? (
                      filteredExercises.map((ex, i) => (
                        <div 
                          key={i} 
                          className="px-4 py-2 hover:bg-orange-600/20 cursor-pointer text-white text-sm"
                          onMouseDown={() => {
                            setCurrentExercise(ex);
                            setShowExerciseList(false);
                          }}
                        >
                          {ex}
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-neutral-500 text-sm">
                        Pressione Enter para usar "{currentExercise}"
                      </div>
                    )}
                  </div>
                )}
              </div>

              {isCardio ? (
                <div className="md:col-span-5">
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Prescrição</label>
                  <input
                    type="text"
                    value={prescription}
                    onChange={(e) => setPrescription(e.target.value)}
                    className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600"
                    placeholder="Ex: 20 min, moderado"
                  />
                </div>
              ) : (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Séries</label>
                    <input
                      type="text"
                      value={sets}
                      onChange={(e) => setSets(e.target.value)}
                      className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 text-center"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Reps</label>
                    <input
                      type="text"
                      value={reps}
                      onChange={(e) => setReps(e.target.value)}
                      className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 text-center"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-400 mb-1">Desc. (s)</label>
                    <input
                      type="number"
                      value={rest}
                      onChange={(e) => setRest(e.target.value)}
                      className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 text-center"
                    />
                  </div>
                </>
              )}

              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-neutral-400 mb-1 text-center">Mídia</label>
                <div className="relative group">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,video/*"
                    onChange={handleFileChange}
                    className="hidden"
                    id="media-upload"
                  />
                  <label
                    htmlFor="media-upload"
                    className={`w-full h-[50px] bg-neutral-800 border-2 border-dashed ${media ? 'border-orange-600' : 'border-white/10'} rounded-xl flex items-center justify-center cursor-pointer hover:bg-neutral-700 transition-all group overflow-hidden`}
                  >
                    {isUploading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-600"></div>
                    ) : media ? (
                      media.type === 'image' ? (
                        <img src={media.url} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Video className="w-5 h-5 text-orange-500" />
                      )
                    ) : (
                      <Upload className="w-5 h-5 text-neutral-500 group-hover:text-orange-500" />
                    )}
                  </label>
                  {media && (
                    <button 
                      onClick={() => setMedia(null)}
                      className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {error && (
                <div className="md:col-span-7 bg-red-500/10 border border-red-500/20 text-red-500 text-xs p-3 rounded-xl flex items-center gap-2 animate-pulse">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}
              
              <div className="md:col-span-1">
                <button
                  onClick={addExercise}
                  disabled={!currentExercise.trim() || isUploading}
                  className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white p-3 rounded-xl flex items-center justify-center transition-colors h-[50px] shadow-lg shadow-orange-600/20"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {exercises.length > 0 && (
            <div className="bg-neutral-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-white/10 flex justify-between items-center">
                <h3 className="text-lg font-medium text-white">Exercícios do Treino</h3>
                <span className="bg-neutral-800 text-emerald-400 px-3 py-1 rounded-full text-sm font-medium border border-white/10">
                  {exercises.length} exercícios
                </span>
              </div>
              
              <DragDropContext onDragEnd={onDragEnd}>
                <Droppable droppableId="exercises">
                  {(provided) => (
                    <div 
                      {...provided.droppableProps} 
                      ref={provided.innerRef}
                      className="divide-y divide-white/10"
                    >
                      {exercises.map((ex, index) => {
                        const DraggableComponent = Draggable as any;
                        return (
                          <DraggableComponent key={ex.id} draggableId={ex.id} index={index}>
                            {(provided: any, snapshot: any) => (
                              <div 
                                ref={provided.innerRef}
                                {...provided.draggableProps}
                                className={`p-4 flex items-center justify-between transition-colors ${snapshot.isDragging ? 'bg-neutral-800 shadow-2xl z-50' : 'hover:bg-white/5'}`}
                              >
                                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                                  <div 
                                    {...provided.dragHandleProps}
                                    className="text-neutral-600 hover:text-neutral-400 cursor-grab active:cursor-grabbing p-1 shrink-0"
                                  >
                                    <GripVertical className="w-5 h-5" />
                                  </div>
                                  <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-sm font-bold text-neutral-400 shrink-0 border border-white/10">
                                    {index + 1}
                                  </div>
                                  {ex.media && (
                                    <div className="w-12 h-12 bg-neutral-800 rounded-lg overflow-hidden border border-white/10 shrink-0">
                                      {ex.media.type === 'image' ? (
                                        <img src={ex.media.url} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-orange-600/10">
                                          <Video className="w-5 h-5 text-orange-500" />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <h4 className="font-medium text-white truncate">{ex.name}</h4>
                                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-neutral-400 mt-1 overflow-x-auto no-scrollbar">
                                      {ex.isCardio ? (
                                        <span className="text-orange-400 italic whitespace-nowrap">{ex.prescription || "Sem prescrição"}</span>
                                      ) : (
                                        <>
                                          <span className="whitespace-nowrap">{ex.sets} séries</span>
                                          <span className="w-1 h-1 bg-neutral-600 rounded-full shrink-0"></span>
                                          <span className="whitespace-nowrap">{ex.reps} reps</span>
                                          <span className="w-1 h-1 bg-neutral-600 rounded-full shrink-0"></span>
                                          <span className="flex items-center gap-1 text-blue-400 whitespace-nowrap"><Clock className="w-3 h-3" /> {ex.rest}s</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => removeExercise(ex.id)}
                                  className="p-2 text-neutral-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 ml-2"
                                >
                                  <Trash2 className="w-5 h-5 sm:w-4 sm:h-4" />
                                </button>
                              </div>
                            )}
                          </DraggableComponent>
                        );
                      })}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </DragDropContext>

              <div className="p-6 bg-neutral-900 border-t border-white/10 flex flex-col sm:flex-row gap-4">
                {existingWorkout && (
                  <button
                    type="button"
                    onClick={() => deleteWorkout(existingWorkout.id)}
                    className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-red-500/20 order-2 sm:order-1"
                  >
                    <Trash2 className="w-5 h-5" /> Excluir Treino
                  </button>
                )}
                <button
                  onClick={saveWorkout}
                  disabled={isSaving}
                  className="flex-[2] bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all transform active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20 order-1 sm:order-2"
                >
                  {isSaving ? "Salvando..." : <><Check className="w-5 h-5" /> Salvar e Enviar Treino</>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ClientStatistics({ clientId, onBack }: { clientId: string, onBack: () => void }) {
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"week" | "month" | "custom">("week");
  const [customStart, setCustomStart] = useState(new Date(new Date().setDate(new Date().getDate() - 30)).toISOString().split('T')[0]);
  const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    const fetchWorkouts = async () => {
      try {
        const q = query(
          collection(db, "workouts"),
          where("studentId", "==", clientId)
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setWorkouts(data);
      } catch (error) {
        console.error("Error fetching statistics:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchWorkouts();
  }, [clientId]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const getFilteredWorkouts = () => {
    const now = new Date();
    let start = new Date();
    let end = new Date();

    if (period === "week") {
      start.setDate(now.getDate() - now.getDay());
      start.setHours(0, 0, 0, 0);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else if (period === "month") {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    } else {
      start = new Date(customStart + "T00:00:00");
      end = new Date(customEnd + "T23:59:59");
    }

    return workouts.filter(w => {
      const wDate = new Date(w.date);
      return wDate >= start && wDate <= end;
    });
  };

  const filteredWorkouts = getFilteredWorkouts();
  const completedWorkouts = filteredWorkouts.filter(w => w.status === "completed");
  const pendingWorkouts = filteredWorkouts.filter(w => w.status !== "completed");
  
  const totalDuration = completedWorkouts.reduce((acc, w) => acc + (w.duration || 0), 0);
  const avgDuration = completedWorkouts.length > 0 ? Math.floor(totalDuration / completedWorkouts.length) : 0;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 p-4 rounded-2xl border border-white/10 shadow-xl flex flex-wrap items-center gap-4">
        <div className="flex bg-neutral-800 p-1 rounded-xl border border-white/5">
          <button 
            onClick={() => setPeriod("week")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${period === "week" ? "bg-orange-600 text-white shadow-lg" : "text-neutral-500 hover:text-white"}`}
          >
            Semana
          </button>
          <button 
            onClick={() => setPeriod("month")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${period === "month" ? "bg-orange-600 text-white shadow-lg" : "text-neutral-500 hover:text-white"}`}
          >
            Mês
          </button>
          <button 
            onClick={() => setPeriod("custom")}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${period === "custom" ? "bg-orange-600 text-white shadow-lg" : "text-neutral-500 hover:text-white"}`}
          >
            Personalizado
          </button>
        </div>

        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="bg-neutral-800 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-orange-500"
            />
            <span className="text-neutral-500 text-xs">até</span>
            <input 
              type="date" 
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="bg-neutral-800 border border-white/5 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:ring-1 focus:ring-orange-500"
            />
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-xl">
          <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest mb-1">Concluídos</p>
          <p className="text-3xl font-black text-emerald-500">{completedWorkouts.length}</p>
        </div>
        <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-xl">
          <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest mb-1">Não Concluídos</p>
          <p className="text-3xl font-black text-red-500">{pendingWorkouts.length}</p>
        </div>
        <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-xl">
          <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest mb-1">Tempo Total</p>
          <p className="text-3xl font-black text-orange-500">{formatDuration(totalDuration)}</p>
        </div>
        <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-xl">
          <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest mb-1">Média por Treino</p>
          <p className="text-3xl font-black text-white">{formatDuration(avgDuration)}</p>
        </div>
      </div>

      <div className="bg-neutral-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/5 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Consistência no Período</h3>
          <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
            {completedWorkouts.length} de {filteredWorkouts.length} treinos realizados
          </span>
        </div>
        <div className="p-6">
          {completedWorkouts.length === 0 ? (
            <p className="text-neutral-500 text-center py-8">Nenhum treino concluído neste período.</p>
          ) : (
            <div className="space-y-4">
              {completedWorkouts.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((w, i) => (
                <div key={w.id} className="flex items-center gap-4">
                  <div className="text-xs text-neutral-500 font-mono w-20">
                    {new Date(w.date + "T12:00:00").toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                  </div>
                  <div className="flex-1 h-3 bg-neutral-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-orange-600 rounded-full" 
                      style={{ width: `${Math.min(100, ((w.duration || 0) / (avgDuration * 1.5)) * 100)}%` }}
                    ></div>
                  </div>
                  <div className="text-xs font-bold text-white w-16 text-right">
                    {formatDuration(w.duration || 0)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WorkoutHistory({ client, onBack }: { client: any, onBack: () => void }) {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [editingWorkout, setEditingWorkout] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    fetchWorkouts();
  }, [client.id]);

  const fetchWorkouts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "workouts"), 
        where("studentId", "==", client.id),
        where("personalId", "==", user.id)
      );
      const querySnapshot = await getDocs(q);
      const workoutsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      workoutsData.sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setWorkouts(workoutsData);
    } catch (error) {
      console.error("Error fetching workouts:", error);
    } finally {
      setLoading(false);
    }
  };

  const deleteWorkout = async (id: string) => {
    console.log("WorkoutHistory: Deleting workout:", id);
    if (!window.confirm("CONFIRMAR EXCLUSÃO: Tem certeza que deseja excluir este treino permanentemente?")) {
      console.log("WorkoutHistory: Deletion cancelled by user");
      return;
    }
    
    try {
      console.log("WorkoutHistory: Calling deleteDoc for:", id);
      await deleteDoc(doc(db, "workouts", id));
      console.log("WorkoutHistory: deleteDoc successful");
      setWorkouts(prev => prev.filter(w => w.id !== id));
      alert("Treino excluído com sucesso!");
    } catch (error: any) {
      console.error("WorkoutHistory: Error deleting workout:", error);
      alert("Erro ao excluir treino: " + (error.message || "Verifique suas permissões."));
    }
  };

  const clearAllHistory = async () => {
    if (workouts.length === 0) return;
    if (!window.confirm(`ATENÇÃO: Você está prestes a excluir TODOS os ${workouts.length} treinos deste aluno. Esta ação não pode ser desfeita. Deseja continuar?`)) return;
    
    setLoading(true);
    try {
      const deletePromises = workouts.map(w => deleteDoc(doc(db, "workouts", w.id)));
      await Promise.all(deletePromises);
      setWorkouts([]);
      alert("Todo o histórico foi removido com sucesso!");
    } catch (error: any) {
      console.error("Error clearing history:", error);
      alert("Erro ao limpar histórico: " + (error.message || "Verifique suas permissões."));
    } finally {
      setLoading(false);
    }
  };

  if (editingWorkout) {
    return (
      <WorkoutBuilder 
        client={client} 
        onBack={() => {
          setEditingWorkout(null);
          fetchWorkouts();
        }} 
        existingWorkout={editingWorkout} 
      />
    );
  }

  if (selectedWorkout) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => {
              setSelectedWorkout(null);
              fetchWorkouts();
            }} 
            className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <h2 className="text-2xl font-bold text-white">Detalhes do Treino</h2>
        </div>
        <ClientWorkoutView 
          workout={selectedWorkout} 
          onBack={() => {
            setSelectedWorkout(null);
            fetchWorkouts();
          }} 
          isPersonal={true} 
        />
      </div>
    );
  }

  const selectedDateWorkout = workouts.find(w => w.date.startsWith(selectedDate));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-white" />
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 flex-1">
          <div>
            <h2 className="text-2xl font-bold text-white">Histórico de Treinos</h2>
            <p className="text-sm text-neutral-400">Aluno: <span className="text-orange-500 font-medium">{client.name}</span></p>
          </div>
          {workouts.length > 0 && (
            <button 
              onClick={clearAllHistory}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white border border-red-500/20 rounded-xl transition-all text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" /> Limpar Todo o Histórico
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Calendar for history */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-orange-500" />
              Explorar Histórico por Calendário
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CustomCalendar 
                selectedDate={selectedDate} 
                onSelectDate={setSelectedDate} 
                workoutDates={workouts.map(w => w.date)}
              />
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
                  {`Data: ${new Date(selectedDate + "T12:00:00Z").toLocaleDateString('pt-BR')}`}
                </h4>
                {selectedDateWorkout ? (
                  <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-2xl flex items-center justify-between hover:border-orange-600/50 transition-colors group">
                    <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => setSelectedWorkout(selectedDateWorkout)}>
                      <div className="w-12 h-12 bg-orange-600/10 rounded-full flex items-center justify-center">
                        <CalendarIcon className="w-6 h-6 text-orange-500" />
                      </div>
                      <div>
                        <h3 className="text-lg font-medium text-white">
                          Treino de {new Date(selectedDateWorkout.date).toLocaleDateString('pt-BR')}
                        </h3>
                        <p className="text-sm text-neutral-400">
                          {selectedDateWorkout.exercises.length} exercícios • Status: {selectedDateWorkout.status === 'active' ? (
                            <span className="text-blue-400">Ativo</span>
                          ) : (
                            <span className="text-emerald-400 flex items-center gap-1 inline-flex">
                              <CheckCircle2 className="w-3 h-3" /> Concluído
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 relative z-[100] shrink-0">
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedWorkout(selectedDateWorkout);
                        }}
                        className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer relative z-[101]"
                        title="Ver Detalhes"
                      >
                        <Play className="w-5 h-5" />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingWorkout(selectedDateWorkout);
                        }}
                        className="p-2 text-neutral-400 hover:text-orange-500 hover:bg-orange-500/10 rounded-lg transition-colors cursor-pointer relative z-[101]"
                        title="Editar Treino"
                      >
                        <Edit2 className="w-5 h-5" />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteWorkout(selectedDateWorkout.id);
                        }}
                        className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer relative z-[101]"
                        title="Excluir Treino"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-neutral-900/50 p-12 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center h-full min-h-[200px]">
                    <Activity className="w-10 h-10 text-neutral-800 mb-3" />
                    <p className="text-neutral-600 text-sm">Nenhum treino encontrado nesta data.</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* List of recent history */}
          <section className="space-y-4">
            <h3 className="text-lg font-bold text-white">Treinos Recentes</h3>
            <div className="grid gap-4">
              {workouts.slice(0, 10).map((workout) => (
                <div 
                  key={workout.id}
                  className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-2xl flex items-center justify-between hover:border-orange-600/50 transition-colors group"
                >
                  <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => setSelectedWorkout(workout)}>
                    <div className="w-12 h-12 bg-orange-600/10 rounded-full flex items-center justify-center">
                      <CalendarIcon className="w-6 h-6 text-orange-500" />
                    </div>
                    <div>
                      <h3 className="text-lg font-medium text-white">
                        Treino de {new Date(workout.date).toLocaleDateString('pt-BR')}
                      </h3>
                      <p className="text-sm text-neutral-400">
                        Status: {workout.status === 'active' ? (
                          <span className="text-blue-400">Ativo</span>
                        ) : (
                          <span className="text-emerald-400 flex items-center gap-1 inline-flex">
                            <CheckCircle2 className="w-3 h-3" /> Concluído
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 relative z-[100] shrink-0">
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedWorkout(workout);
                      }}
                      className="p-2 text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer relative z-[101]"
                      title="Ver Detalhes"
                    >
                      <Play className="w-5 h-5" />
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingWorkout(workout);
                      }}
                      className="p-2 text-neutral-400 hover:text-orange-500 hover:bg-orange-500/10 rounded-lg transition-colors cursor-pointer relative z-[101]"
                      title="Editar Treino"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button 
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteWorkout(workout.id);
                      }}
                      className="p-2 text-neutral-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer relative z-[101]"
                      title="Excluir Treino"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function PersonalDashboard() {
  const { user } = useAuth();
  const [clients, setClients] = useState<any[]>([]);
  const [allClients, setAllClients] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [sortBy, setSortBy] = useState<"name" | "date">("name");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [addMethod, setAddMethod] = useState<'existing' | 'invite'>('existing');
  const [isInviting, setIsInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [clientTab, setClientTab] = useState<"workouts" | "history" | "assessments" | "statistics">("workouts");
  const [showClassificationModal, setShowClassificationModal] = useState(false);

  const generatePersonalCode = async () => {
    if (!user || user.role !== 'personal' || user.personalCode) return;
    
    const newCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
      await updateDoc(doc(db, "users_public", user.id), {
        personalCode: newCode
      });
    } catch (err) {
      console.error("Erro ao gerar código personal:", err);
    }
  };

  useEffect(() => {
    if (user && user.role === 'personal' && !user.personalCode) {
      generatePersonalCode();
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchClients();
      fetchAllClients();
    }
  }, [user]);

  useEffect(() => {
    if (selectedClient && !selectedClient.clientType) {
      setShowClassificationModal(true);
    }
  }, [selectedClient]);

  const handleSelectClient = async (client: any) => {
    try {
      const privateDoc = await getDoc(doc(db, "users_private", client.id));
      if (privateDoc.exists()) {
        setSelectedClient({ ...client, ...privateDoc.data() });
      } else {
        setSelectedClient(client);
      }
    } catch (err) {
      console.error("Error fetching private data:", err);
      setSelectedClient(client);
    }
  };

  const fetchClients = async () => {
    if (!user) return;
    const q = query(collection(db, "connections"), where("personalId", "==", user.id));
    const querySnapshot = await getDocs(q);
    
    const clientPromises = querySnapshot.docs.map(async (connectionDoc) => {
      const data = connectionDoc.data();
      try {
        const clientDoc = await getDoc(doc(db, "users_public", data.studentId));
        let privateData = {};
        try {
          const privateDoc = await getDoc(doc(db, "users_private", data.studentId));
          if (privateDoc.exists()) {
            privateData = privateDoc.data();
          }
        } catch (e) {
          console.warn(`Could not fetch private data for student ${data.studentId}:`, e);
        }

        return { 
          id: clientDoc.id, 
          ...clientDoc.data(), 
          ...privateData,
          status: data.status,
          connectionId: connectionDoc.id,
          clientType: data.type || null,
          connectionDate: data.createdAt || ""
        };
      } catch (e) {
        console.error(`Error fetching data for student ${data.studentId}:`, e);
        return null;
      }
    });
    
    const clientsData = (await Promise.all(clientPromises)).filter(c => c !== null);
    setClients(clientsData);
  };

  const fetchAllClients = async () => {
    try {
      const q = query(collection(db, "users_public"), where("role", "==", "student"));
      const querySnapshot = await getDocs(q).catch(err => {
        console.error("Erro ao buscar todos os alunos:", err);
        handleFirestoreError(err, OperationType.LIST, "users_public");
      });
      if (querySnapshot) {
        const clientsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAllClients(clientsData);
      }
    } catch (err) {
      console.error("Erro no fetchAllClients:", err);
    }
  };

  const addClient = async (clientId: string) => {
    try {
      // Check if connection already exists
      const q = query(
        collection(db, "connections"), 
        where("personalId", "==", user?.id),
        where("studentId", "==", clientId)
      );
      const snapshot = await getDocs(q).catch(err => handleFirestoreError(err, OperationType.LIST, "connections"));
      
      if (snapshot && snapshot.empty) {
        const connectionId = `${user?.id}_${clientId}`;
        await setDoc(doc(db, "connections", connectionId), {
          personalId: user?.id,
          studentId: clientId,
          status: "active",
          createdAt: new Date().toISOString()
        }).catch(err => handleFirestoreError(err, OperationType.CREATE, "connections"));
        fetchClients();
        setShowAdd(false);
      }
    } catch (err) {
      console.error("Erro no addClient:", err);
      throw err;
    }
  };

  const updateClientType = async (connectionId: string, type: "online" | "presencial") => {
    try {
      await updateDoc(doc(db, "connections", connectionId), { type });
      setShowClassificationModal(false);
      fetchClients();
      if (selectedClient && selectedClient.connectionId === connectionId) {
        setSelectedClient({ ...selectedClient, clientType: type });
      }
    } catch (err) {
      console.error("Erro ao atualizar tipo do aluno:", err);
    }
  };
  const toggleClientStatus = async (clientId: string, currentStatus: string) => {
    try {
      const connectionId = `${user?.id}_${clientId}`;
      const newStatus = currentStatus === "active" ? "blocked" : "active";
      await updateDoc(doc(db, "connections", connectionId), {
        status: newStatus
      });
      fetchClients();
    } catch (err) {
      console.error(err);
    }
  };

  const sendInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !user) return;

    setIsInviting(true);
    setInviteStatus(null);

    try {
      console.log("Enviando convite - Início:", { addMethod, inviteEmail, userId: user.id });
      if (addMethod === 'existing') {
        // 1. Check if user already exists via email lookup
        console.log("Buscando usuário existente com email:", inviteEmail.trim().toLowerCase());
        const emailDoc = await getDoc(doc(db, "user_emails", inviteEmail.trim().toLowerCase())).catch(err => {
          console.error("Erro ao buscar email no Firestore:", err);
          handleFirestoreError(err, OperationType.GET, "user_emails");
        });

        if (emailDoc && emailDoc.exists()) {
          const studentId = emailDoc.data().uid;
          console.log("Usuário encontrado via lookup:", studentId);
          
          const studentPublic = await getDoc(doc(db, "users_public", studentId));
          if (studentPublic.exists() && studentPublic.data().role === 'student') {
            console.log("Chamando addClient para:", studentId);
            await addClient(studentId);
            setInviteStatus({ type: 'success', message: "Aluno encontrado e conectado com sucesso!" });
          } else {
            setInviteStatus({ type: 'error', message: "Este email pertence a um Personal Trainer." });
          }
        } else {
          console.log("Usuário não encontrado no Firestore para o email:", inviteEmail.trim().toLowerCase());
          setInviteStatus({ type: 'error', message: "Aluno não encontrado com este email. Use a opção 'Convidar Novo Aluno'." });
        }
      } else {
        // 2. Create a pending invitation
        console.log("Criando novo convite pendente para:", inviteEmail.trim().toLowerCase());
        await addDoc(collection(db, "invitations"), {
          personalId: user.id,
          personalName: user.displayName || user.name || "Personal",
          studentEmail: inviteEmail.trim().toLowerCase(),
          status: "pending",
          createdAt: new Date().toISOString()
        }).catch(err => {
          console.error("Erro ao criar convite no Firestore:", err);
          handleFirestoreError(err, OperationType.CREATE, "invitations");
        });
        setInviteStatus({ type: 'success', message: "Convite enviado para o email informado!" });
      }
      setInviteEmail("");
    } catch (err: any) {
      console.error("Erro capturado no catch do sendInvite:", err);
      const errorMessage = err.message || "Erro desconhecido";
      setInviteStatus({ type: 'error', message: `Erro ao enviar convite: ${errorMessage}. Verifique as permissões.` });
    } finally {
      setIsInviting(false);
      setTimeout(() => setInviteStatus(null), 5000);
    }
  };

  const sortedClients = [...clients].sort((a, b) => {
    if (sortBy === "name") {
      return (a.name || "").localeCompare(b.name || "");
    } else {
      const dateA = a.connectionDate || a.createdAt || "";
      const dateB = b.connectionDate || b.createdAt || "";
      return dateB.localeCompare(dateA); // Newest first
    }
  });

  if (selectedClient) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 bg-neutral-900 p-4 rounded-2xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelectedClient(null)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">{selectedClient.displayName || selectedClient.name}</h2>
            <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Perfil do Aluno</p>
          </div>
        </div>
        <button
          onClick={() => openWhatsApp(selectedClient.phone)}
          className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl transition-all shadow-lg shadow-emerald-600/20 font-bold text-sm"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </button>
      </div>

      <div className="flex bg-neutral-900 p-1 rounded-xl border border-white/10 shadow-2xl w-full max-w-lg mx-auto mb-6">
        <button
          onClick={() => setClientTab("workouts")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${clientTab === "workouts" ? "bg-orange-600 text-white shadow-md" : "text-neutral-400 hover:text-white"}`}
        >
          Novo Treino
        </button>
        <button
          onClick={() => setClientTab("history")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${clientTab === "history" ? "bg-orange-600 text-white shadow-md" : "text-neutral-400 hover:text-white"}`}
        >
          Histórico
        </button>
        <button
          onClick={() => setClientTab("assessments")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${clientTab === "assessments" ? "bg-orange-600 text-white shadow-md" : "text-neutral-400 hover:text-white"}`}
        >
          Avaliações
        </button>
        <button
          onClick={() => setClientTab("statistics")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${clientTab === "statistics" ? "bg-orange-600 text-white shadow-md" : "text-neutral-400 hover:text-white"}`}
        >
          Estatísticas
        </button>
      </div>
        
        {clientTab === "workouts" ? (
          <WorkoutBuilder client={selectedClient} onBack={() => setSelectedClient(null)} />
        ) : clientTab === "history" ? (
          <WorkoutHistory client={selectedClient} onBack={() => setSelectedClient(null)} />
        ) : clientTab === "assessments" ? (
          <AssessmentView 
            clientId={selectedClient.id} 
            clientName={selectedClient.name} 
            onBack={() => setSelectedClient(null)} 
            isPersonal={true} 
          />
        ) : (
          <ClientStatistics clientId={selectedClient.id} onBack={() => setSelectedClient(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 p-6 rounded-3xl border border-white/10 shadow-2xl text-center mb-8 bg-gradient-to-br from-neutral-900 to-neutral-950">
        <h3 className="text-neutral-400 text-xs font-medium mb-2 uppercase tracking-widest">Seu Código de Convite</h3>
        <div className="flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="text-3xl font-black text-orange-500 font-mono tracking-tighter bg-orange-600/10 px-6 py-4 rounded-2xl border border-orange-500/20 shadow-[0_0_20px_rgba(249,115,22,0.1)]">
              {user?.personalCode || '------'}
            </div>
            {user?.personalCode && (
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(user.personalCode);
                  alert("Código copiado!");
                }}
                className="p-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-white rounded-xl transition-all border border-white/5"
                title="Copiar Código"
              >
                <Copy className="w-5 h-5" />
              </button>
            )}
          </div>
          <p className="text-neutral-500 text-[10px] max-w-[180px] leading-relaxed">
            Compartilhe este código com seus alunos para que eles se conectem ao seu perfil.
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Meus Alunos</h2>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-colors shadow-lg shadow-orange-600/20"
        >
          <Plus className="w-4 h-4" />
          Adicionar Aluno
        </button>
      </div>

      <div className="flex justify-end mb-4">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as "name" | "date")}
          className="bg-neutral-900 border border-white/10 text-white text-sm rounded-lg focus:ring-orange-600 focus:border-orange-600 block p-2.5"
        >
          <option value="name">Ordem Alfabética</option>
          <option value="date">Data de Cadastro</option>
        </select>
      </div>

      {showAdd && (
        <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-2xl space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-white">Adicionar Aluno</h3>
            
            <div className="flex bg-neutral-800 p-1 rounded-xl border border-white/5">
              <button
                onClick={() => setAddMethod('existing')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${addMethod === 'existing' ? 'bg-orange-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
              >
                Email Cadastrado
              </button>
              <button
                onClick={() => setAddMethod('invite')}
                className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${addMethod === 'invite' ? 'bg-orange-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white'}`}
              >
                Convidar Novo Aluno
              </button>
            </div>

            <form onSubmit={sendInvite} className="flex gap-2">
              <input
                type="email"
                placeholder={addMethod === 'existing' ? "Email do aluno já cadastrado" : "Email para convite"}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 bg-neutral-800 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
              <button
                type="submit"
                disabled={isInviting}
                className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isInviting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <Send className="w-4 h-4" />}
                {addMethod === 'existing' ? 'Adicionar' : 'Convidar'}
              </button>
            </form>
            {inviteStatus && (
              <p className={`mt-2 text-sm ${inviteStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {inviteStatus.message}
              </p>
            )}
          </div>

          <div className="border-t border-white/5 pt-6">
            <h3 className="text-lg font-medium text-white mb-4">Alunos Disponíveis</h3>
            <div className="grid gap-4">
              {allClients.filter(c => !clients.find(myClient => myClient.id === c.id)).map(client => (
                <div key={client.id} className="flex items-center justify-between bg-neutral-800 p-4 rounded-xl border border-white/10">
                  <div>
                    <div className="font-medium text-white">{client.name}</div>
                    <div className="text-sm text-neutral-400">{client.email}</div>
                  </div>
                  <button
                    onClick={() => addClient(client.id)}
                    className="text-orange-500 hover:text-orange-400 bg-orange-600/10 hover:bg-orange-600/20 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
                  >
                    Conectar
                  </button>
                </div>
              ))}
              {allClients.filter(c => !clients.find(myClient => myClient.id === c.id)).length === 0 && (
                <div className="text-neutral-500 text-center py-4">Nenhum novo aluno disponível.</div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-neutral-900 rounded-lg border border-white/10 shadow-2xl overflow-hidden">
        {sortedClients.length === 0 ? (
          <div className="p-12 text-center">
            <img src="https://i.imgur.com/fxOHjtK.png" alt="Track & Health Logo" className="w-16 h-16 object-contain mx-auto mb-4 opacity-50 grayscale" referrerPolicy="no-referrer" />
            <h3 className="text-xl font-medium text-white mb-2">Nenhum aluno ainda</h3>
            <p className="text-neutral-500">Clique no botão Adicionar Aluno para começar a montar sua lista.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-400">
              <thead className="bg-neutral-800 text-xs uppercase text-neutral-500 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 font-medium">Aluno</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3 font-medium">Data de Cadastro</th>
                  <th className="px-4 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {sortedClients.map(client => {
                  const dateStr = client.connectionDate || client.createdAt;
                  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('pt-BR') : '--/--/----';
                  return (
                    <tr 
                      key={client.id} 
                      className="hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => handleSelectClient(client)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3">
                            {client.photoUrl ? (
                              <img src={client.photoUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-blue-500 shrink-0" />
                            ) : (
                              <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold text-neutral-400 shrink-0">
                                {(client.displayName || client.name)?.charAt(0).toUpperCase() || '?'}
                              </div>
                            )}
                            <span className="font-medium text-white whitespace-nowrap">{client.displayName || client.name}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openWhatsApp(client.phone);
                            }}
                            className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors sm:hidden"
                            title="Abrir WhatsApp"
                          >
                            <MessageCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">{client.email}</td>
                      <td className="px-4 py-3 whitespace-nowrap">{formattedDate}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openWhatsApp(client.phone);
                            }}
                            className="p-2 text-emerald-500 hover:bg-emerald-500/10 rounded-lg transition-colors hidden sm:block"
                            title="Abrir WhatsApp"
                          >
                            <MessageCircle className="w-5 h-5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleClientStatus(client.id, client.status || "active");
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all border ${
                              client.status === "blocked" 
                                ? "bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20" 
                                : "bg-green-500/10 text-green-500 border-green-500/20 hover:bg-green-500/20"
                            }`}
                          >
                            {client.status === "blocked" ? "Desbloquear" : "Bloquear"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showClassificationModal && selectedClient && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 w-full max-w-md p-8 rounded-3xl border border-white/10 shadow-2xl text-center">
            <div className="w-16 h-16 bg-orange-600/20 rounded-full flex items-center justify-center text-orange-500 mx-auto mb-6">
              <UserCheck className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Classificar Aluno</h3>
            <p className="text-neutral-400 text-sm mb-8">
              Como o aluno <span className="text-white font-bold">{selectedClient.displayName || selectedClient.name}</span> se enquadra?
            </p>
            <div className="grid grid-cols-2 gap-4">
              <button 
                onClick={() => updateClientType(selectedClient.connectionId, "online")}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-neutral-800 border border-white/5 hover:border-orange-500/50 hover:bg-orange-600/5 transition-all group"
              >
                <div className="w-12 h-12 bg-blue-500/10 rounded-xl flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                  <Globe className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-white">Online</span>
              </button>
              <button 
                onClick={() => updateClientType(selectedClient.connectionId, "presencial")}
                className="flex flex-col items-center gap-3 p-6 rounded-2xl bg-neutral-800 border border-white/5 hover:border-orange-500/50 hover:bg-orange-600/5 transition-all group"
              >
                <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-500 group-hover:scale-110 transition-transform">
                  <User className="w-6 h-6" />
                </div>
                <span className="text-sm font-bold text-white">Presencial</span>
              </button>
            </div>
            <button 
              onClick={() => setShowClassificationModal(false)}
              className="mt-8 text-neutral-500 hover:text-white text-xs font-medium transition-colors"
            >
              Decidir depois
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ClientWorkoutView({ workout, onBack, isPersonal: isPersonalProp }: { workout: any, onBack: () => void, isPersonal?: boolean }) {
  const { user } = useAuth();
  const storageKey = `active_workout_${user?.id}_${workout.id}`;

  const [activeTimer, setActiveTimer] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [exercises, setExercises] = useState<any[]>(workout.exercises || []);
  const [loadingExercises, setLoadingExercises] = useState(!workout.exercises);

  useEffect(() => {
    if (!workout.exercises) {
      const fetchExercises = async () => {
        try {
          const q = query(collection(db, "exercises"), where("workoutId", "==", workout.id));
          const snapshot = await getDocs(q);
          const exData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Sort manually if order field exists
          exData.sort((a: any, b: any) => (a.order || 0) - (b.order || 0));
          setExercises(exData);
        } catch (err) {
          console.error("Error fetching exercises:", err);
        } finally {
          setLoadingExercises(false);
        }
      };
      fetchExercises();
    }
  }, [workout.id]);
  const [completedExercises, setCompletedExercises] = useState<string[]>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && workout.status !== 'completed') {
      try {
        const parsed = JSON.parse(saved);
        return parsed.completedExercises || workout.completedExercises || [];
      } catch (e) { return workout.completedExercises || []; }
    }
    return workout.completedExercises || [];
  });

  const [exerciseFeedback, setExerciseFeedback] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && workout.status !== 'completed') {
      try {
        const parsed = JSON.parse(saved);
        return parsed.exerciseFeedback || workout.exerciseFeedback || {};
      } catch (e) { return workout.exerciseFeedback || {}; }
    }
    return workout.exerciseFeedback || {};
  });

  const [exerciseLoads, setExerciseLoads] = useState<Record<string, string>>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && workout.status !== 'completed') {
      try {
        const parsed = JSON.parse(saved);
        return parsed.exerciseLoads || workout.exerciseLoads || {};
      } catch (e) { return workout.exerciseLoads || {}; }
    }
    return workout.exerciseLoads || {};
  });

  const [overallFeedback, setOverallFeedback] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && workout.status !== 'completed') {
      try {
        const parsed = JSON.parse(saved);
        return parsed.overallFeedback || workout.overallFeedback || "";
      } catch (e) { return workout.overallFeedback || ""; }
    }
    return workout.overallFeedback || "";
  });

  const [isFinishing, setIsFinishing] = useState(false);
  const [recipientName, setRecipientName] = useState("Carregando...");
  const [isEditing, setIsEditing] = useState(false);
  
  const [startTime, setStartTime] = useState<number | null>(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved && workout.status !== 'completed') {
      try {
        const parsed = JSON.parse(saved);
        return parsed.startTime || workout.startTime || null;
      } catch (e) { return workout.startTime || null; }
    }
    return workout.startTime || null;
  });
  const [elapsedTime, setElapsedTime] = useState(0);

  const isPersonal = isPersonalProp !== undefined ? isPersonalProp : user?.role === "personal";
  const isSuperAdmin = user?.role === "superadmin";
  const isCompleted = workout.status === "completed";

  // Persist state to localStorage
  useEffect(() => {
    if (!isPersonal && !isCompleted) {
      const stateToSave = {
        completedExercises,
        exerciseFeedback,
        exerciseLoads,
        overallFeedback,
        startTime
      };
      localStorage.setItem(storageKey, JSON.stringify(stateToSave));
    }
  }, [completedExercises, exerciseFeedback, exerciseLoads, overallFeedback, startTime, isPersonal, isCompleted, storageKey]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (startTime && !isCompleted) {
      interval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTime) / 1000));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [startTime, isCompleted]);

  const startWorkout = async () => {
    const now = Date.now();
    setStartTime(now);
    try {
      await updateDoc(doc(db, "workouts", workout.id), {
        startTime: now,
        status: "in_progress"
      });
    } catch (error) {
      console.error("Error starting workout:", error);
    }
  };

  if (isEditing) {
    return (
      <WorkoutBuilder 
        client={{ id: workout.studentId, name: "Aluno" }} 
        onBack={() => setIsEditing(false)} 
        existingWorkout={workout}
        personalOverrideId={isSuperAdmin ? workout.personalId : undefined}
      />
    );
  }

  useEffect(() => {
    const fetchRecipient = async () => {
      const recipientId = isPersonal ? workout.studentId : workout.personalId;
      const docRef = doc(db, "users_public", recipientId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRecipientName(data.displayName || data.name || "Usuário");
      }
    };
    fetchRecipient();
  }, [isPersonal, workout.studentId, workout.personalId]);

  const deleteWorkout = async () => {
    console.log("ClientWorkoutView: Deleting workout:", workout.id);
    if (!window.confirm("CONFIRMAR EXCLUSÃO: Tem certeza que deseja excluir este treino permanentemente?")) {
      console.log("ClientWorkoutView: Deletion cancelled by user");
      return;
    }
    
    try {
      console.log("ClientWorkoutView: Calling deleteDoc for:", workout.id);
      await deleteDoc(doc(db, "workouts", workout.id));
      localStorage.removeItem(storageKey);
      console.log("ClientWorkoutView: deleteDoc successful");
      alert("Treino excluído com sucesso!");
      onBack();
    } catch (error: any) {
      console.error("ClientWorkoutView: Error deleting workout:", error);
      alert("Erro ao excluir treino: " + (error.message || "Verifique suas permissões."));
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (activeTimer && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => prev - 1);
      }, 1000);
    } else if (activeTimer && timeLeft === 0) {
      // Play sound when timer finishes
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(e => console.log("Audio play failed:", e));
      setActiveTimer(null);
    }
    return () => clearInterval(interval);
  }, [activeTimer, timeLeft]);

  const startTimer = (exerciseId: string, seconds: number) => {
    setActiveTimer(exerciseId);
    setTimeLeft(seconds);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const toggleExerciseCompletion = (exerciseId: string) => {
    if (isCompleted || isPersonal) return;
    setCompletedExercises(prev => 
      prev.includes(exerciseId) 
        ? prev.filter(id => id !== exerciseId) 
        : [...prev, exerciseId]
    );
  };

  const handleExerciseFeedback = (exerciseId: string, feedback: string) => {
    if (isCompleted || isPersonal) return;
    setExerciseFeedback(prev => ({ ...prev, [exerciseId]: feedback }));
  };

  const finishWorkout = async () => {
    console.log("ClientWorkoutView: finishWorkout called", { 
      workoutId: workout.id, 
      isPersonal, 
      isCompleted,
      completedExercisesCount: completedExercises.length 
    });

    if (isPersonal || isCompleted) {
      console.log("ClientWorkoutView: finishWorkout early return", { isPersonal, isCompleted });
      return;
    }

    if (completedExercises.length === 0) {
      if (!window.confirm("Você não marcou nenhum exercício como concluído. Deseja finalizar assim mesmo?")) {
        console.log("ClientWorkoutView: finishWorkout cancelled by user (no exercises completed)");
        return;
      }
    }

    setIsFinishing(true);
    try {
      const endTime = Date.now();
      const duration = startTime ? Math.floor((endTime - startTime) / 1000) : 0;

      console.log("ClientWorkoutView: Updating workout doc...");
      await updateDoc(doc(db, "workouts", workout.id), {
        status: "completed",
        completedExercises,
        exerciseFeedback,
        exerciseLoads,
        overallFeedback,
        completedAt: new Date().toISOString(),
        duration: duration // duration in seconds
      });
      console.log("ClientWorkoutView: Workout update successful");
      localStorage.removeItem(storageKey);
      alert("Treino finalizado com sucesso! Bom trabalho!");
      onBack();
    } catch (error: any) {
      console.error("ClientWorkoutView: Error finishing workout:", error);
      alert("Erro ao finalizar treino: " + (error.message || "Erro desconhecido"));
    } finally {
      setIsFinishing(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between bg-neutral-900 p-4 rounded-2xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-white" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-white leading-tight">
              {isCompleted ? "Treino Concluído" : "Treino de Hoje"}
            </h2>
            <p className="text-xs text-neutral-400">
              {new Date(workout.date).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {(isPersonal || isSuperAdmin) && (
            <>
              <button 
                onClick={() => setIsEditing(true)}
                className="p-2 bg-neutral-800 hover:bg-orange-600/20 text-orange-500 rounded-xl transition-colors border border-white/5"
                title="Editar Treino"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button 
                onClick={deleteWorkout}
                className="p-2 bg-neutral-800 hover:bg-red-600/20 text-red-500 rounded-xl transition-colors border border-white/5"
                title="Excluir Treino"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
          <button
            onClick={() => openWhatsApp(workout.personalPhone)}
            className="flex items-center gap-2 bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white px-3 py-2 rounded-xl border border-emerald-500/20 transition-all font-bold text-xs"
          >
            <MessageCircle className="w-4 h-4" />
            WhatsApp
          </button>
        </div>
      </div>

      {/* Workout Timer / Status Bar */}
      {!isPersonal && !isCompleted && (
        <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-6">
          {!startTime ? (
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg font-bold text-white">Pronto para começar?</h3>
              <p className="text-neutral-500 text-sm">Inicie o cronômetro para registrar seu tempo de treino.</p>
            </div>
          ) : (
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg font-bold text-white flex items-center justify-center sm:justify-start gap-2">
                <Clock className="w-5 h-5 text-orange-500 animate-pulse" />
                Treino em Andamento
              </h3>
              <div className="text-3xl font-black text-orange-500 font-mono mt-1">
                {formatTime(elapsedTime)}
              </div>
            </div>
          )}
          
          {!startTime ? (
            <button 
              onClick={startWorkout}
              className="w-full sm:w-auto bg-orange-600 hover:bg-orange-500 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-orange-600/20 transition-all transform active:scale-95 flex items-center justify-center gap-2"
            >
              <Play className="w-6 h-6 fill-current" />
              INICIAR TREINO
            </button>
          ) : (
            <button 
              onClick={finishWorkout}
              disabled={isFinishing}
              className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white px-8 py-4 rounded-2xl font-black text-lg shadow-xl shadow-emerald-600/20 transition-all transform active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isFinishing ? "FINALIZANDO..." : <><CheckCircle2 className="w-6 h-6" /> FINALIZAR TREINO</>}
            </button>
          )}
        </div>
      )}

      {isCompleted && workout.duration && (
        <div className="bg-neutral-900 p-6 rounded-2xl border border-emerald-500/20 shadow-2xl flex items-center justify-between">
          <div>
            <h3 className="text-neutral-500 text-xs font-bold uppercase tracking-widest">Tempo Total de Treino</h3>
            <div className="text-2xl font-black text-emerald-400 font-mono">
              {formatTime(workout.duration)}
            </div>
          </div>
          <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center">
            <Clock className="w-6 h-6 text-emerald-500" />
          </div>
        </div>
      )}

      <div className="grid gap-6">
        {loadingExercises ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-2 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-neutral-500 text-sm">Carregando exercícios...</p>
          </div>
        ) : exercises.length === 0 ? (
          <div className="text-center py-12 bg-neutral-900 rounded-2xl border border-white/10">
            <p className="text-neutral-500">Nenhum exercício encontrado para este treino.</p>
          </div>
        ) : (
          exercises.map((ex: any, index: number) => {
          const isExCompleted = completedExercises.includes(ex.id);
          return (
            <div 
              key={ex.id} 
              className={`bg-neutral-900 rounded-2xl border transition-all overflow-hidden ${isExCompleted ? 'border-emerald-500/30' : 'border-white/10 shadow-2xl'}`}
            >
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-4 flex-1">
                    <button 
                      onClick={() => toggleExerciseCompletion(ex.id)}
                      disabled={isPersonal || isCompleted}
                      className={`w-12 h-12 rounded-2xl flex items-center justify-center text-xl font-black transition-all shrink-0 ${
                        isExCompleted 
                          ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                          : 'bg-orange-600 text-white shadow-lg shadow-orange-600/20 border border-orange-500/50'
                      }`}
                    >
                      {isExCompleted ? <Check className="w-6 h-6" /> : index + 1}
                    </button>
                    <div>
                      <h3 className={`text-xl font-bold transition-colors ${isExCompleted ? 'text-emerald-400' : 'text-white'}`}>
                        {ex.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {ex.isCardio ? (
                          <span className="bg-orange-600/10 text-orange-400 px-3 py-1 rounded-lg border border-orange-500/20 font-medium italic text-sm">
                            {ex.prescription || "Sem prescrição"}
                          </span>
                        ) : (
                          <>
                            <div className="flex items-center bg-indigo-500/10 text-indigo-400 px-3 py-1 rounded-lg border border-indigo-500/20">
                              <span className="text-[10px] uppercase font-bold mr-1.5 opacity-70">Séries:</span>
                              <span className="font-bold">{ex.sets}</span>
                            </div>
                            <div className="flex items-center bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-lg border border-emerald-500/20">
                              <span className="text-[10px] uppercase font-bold mr-1.5 opacity-70">Reps:</span>
                              <span className="font-bold">{ex.reps}</span>
                            </div>
                            <div className="flex items-center bg-amber-500/10 text-amber-400 px-3 py-1 rounded-lg border border-amber-500/20">
                              <span className="text-[10px] uppercase font-bold mr-1.5 opacity-70">Carga:</span>
                              {isCompleted || isPersonal ? (
                                <span className="font-bold">{exerciseLoads[ex.id] || "--"}</span>
                              ) : (
                                <input
                                  type="text"
                                  value={exerciseLoads[ex.id] || ""}
                                  onChange={(e) => setExerciseLoads(prev => ({ ...prev, [ex.id]: e.target.value }))}
                                  placeholder="0"
                                  className="w-10 bg-transparent border-none text-amber-400 font-bold text-center p-0 focus:outline-none focus:ring-0"
                                />
                              )}
                              <span className="text-[10px] ml-1 opacity-70">kg</span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {!isCompleted && (
                    <button
                      onClick={() => toggleExerciseCompletion(ex.id)}
                      disabled={isPersonal}
                      className={`px-4 py-2 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 self-start mt-1 ${
                        isExCompleted 
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10' 
                          : isPersonal 
                            ? 'bg-neutral-800/50 text-neutral-500 border border-white/5 cursor-not-allowed'
                            : 'bg-neutral-800 text-neutral-400 border border-white/5 hover:bg-neutral-700 hover:text-white'
                      }`}
                    >
                      {isExCompleted ? (
                        <><CheckCircle2 className="w-5 h-5" /> Concluído</>
                      ) : (
                        <><Circle className="w-5 h-5" /> Concluir</>
                      )}
                    </button>
                  )}
                </div>

                {ex.media && (
                  <div className="mt-4 rounded-xl overflow-hidden border border-white/5 bg-black/20">
                    {ex.media.type === 'image' ? (
                      <img 
                        src={ex.media.url} 
                        alt={ex.name} 
                        className="w-full max-h-[300px] object-contain mx-auto"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <video 
                        src={ex.media.url} 
                        controls 
                        className="w-full max-h-[300px] mx-auto"
                      />
                    )}
                  </div>
                )}

                <div className="mt-6 space-y-4">
                  {!ex.isCardio && !isCompleted && !isPersonal && (
                    <div className="pt-4 border-t border-white/10">
                      {activeTimer === ex.id ? (
                        <div className="bg-neutral-800 rounded-xl p-6 flex flex-col items-center justify-center border border-orange-600/30">
                          <div className="text-4xl font-mono font-bold text-orange-500 mb-2">
                            {formatTime(timeLeft)}
                          </div>
                          <p className="text-sm text-neutral-400">Descansando...</p>
                          <button 
                            onClick={() => setActiveTimer(null)}
                            className="mt-4 text-sm text-neutral-500 hover:text-white transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startTimer(ex.id, ex.rest)}
                          className="w-full bg-neutral-800 hover:bg-neutral-700 border border-white/10 text-white font-medium py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                          <Clock className="w-5 h-5 text-orange-500" />
                          Iniciar Descanso ({ex.rest}s)
                        </button>
                      )}
                    </div>
                  )}

                  {(isPersonal || isCompleted || !isPersonal) && (
                    <div className="pt-4 border-t border-white/10">
                      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-neutral-400">
                        <MessageCircle className="w-4 h-4 text-emerald-500" />
                        Feedback do Exercício
                      </div>
                      {isPersonal || isCompleted ? (
                        <p className="text-sm text-neutral-300 bg-neutral-800/50 p-3 rounded-xl border border-white/5 italic">
                          {exerciseFeedback[ex.id] || "Nenhum feedback fornecido."}
                        </p>
                      ) : (
                        <textarea
                          value={exerciseFeedback[ex.id] || ""}
                          onChange={(e) => handleExerciseFeedback(ex.id, e.target.value)}
                          placeholder="Como foi este exercício? (Ex: Peso leve, dor no ombro...)"
                          className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all min-h-[80px]"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        }))}
      </div>

      <div className="bg-neutral-900 rounded-2xl border border-white/10 shadow-2xl p-6 mt-8">
        <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <MessageCircle className="w-6 h-6 text-emerald-500" />
          Feedback Geral do Treino
        </h3>
        {isPersonal || isCompleted ? (
          <p className="text-neutral-300 bg-neutral-800/50 p-4 rounded-xl border border-white/5 italic">
            {overallFeedback || "Nenhum feedback geral fornecido."}
          </p>
        ) : (
          <textarea
            value={overallFeedback}
            onChange={(e) => setOverallFeedback(e.target.value)}
            placeholder="Conte ao seu personal como foi o treino de hoje no geral..."
            className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all min-h-[120px]"
          />
        )}

        {!isPersonal && !isCompleted && (
          <button
            onClick={finishWorkout}
            disabled={isFinishing}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all transform active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 mt-8"
          >
            {isFinishing ? "Finalizando..." : <><CheckCircle2 className="w-6 h-6" /> Finalizar Treino</>}
          </button>
        )}
      </div>
    </div>
  );
}

function ClientWorkoutsList({ workouts, onSelectWorkout }: { workouts: any[], onSelectWorkout: (workout: any) => void }) {
  const isToday = (dateString: string) => {
    const today = new Date();
    const date = new Date(dateString);
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  };

  return (
    <div className="space-y-3">
      {workouts.length === 0 ? (
        <div className="bg-neutral-900 p-12 rounded-2xl border border-white/10 text-center">
          <Activity className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-white mb-2">Nenhum treino encontrado</h3>
          <p className="text-neutral-500">Seu treinador ainda não atribuiu um treino para você.</p>
        </div>
      ) : (
        workouts.map(workout => {
          const today = isToday(workout.date);
          return (
            <div 
              key={workout.id}
              onClick={() => onSelectWorkout(workout)}
              className={`bg-neutral-900 p-6 rounded-2xl border ${today ? 'border-orange-500 ring-1 ring-orange-500/50' : 'border-white/10'} hover:border-orange-600 cursor-pointer transition-all shadow-xl hover:shadow-orange-600/5 flex items-center justify-between group relative overflow-hidden`}
            >
              {today && (
                <div className="absolute top-0 right-0">
                  <div className="bg-orange-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded-bl-xl tracking-tighter shadow-lg">
                    Treino de Hoje
                  </div>
                </div>
              )}
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                  workout.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-orange-600/10 text-orange-500'
                }`}>
                  <CalendarIcon className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="font-bold text-white text-lg">Treino</h4>
                  <p className="text-sm text-neutral-500">{new Date(workout.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1">Status</p>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                    workout.status === 'completed' 
                      ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                      : 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                  }`}>
                    {workout.status === 'completed' ? 'Concluído' : 'Disponível'}
                  </span>
                </div>
                <div className="w-10 h-10 rounded-xl bg-neutral-800 flex items-center justify-center group-hover:bg-orange-600 transition-colors">
                  <Play className="w-5 h-5 text-white group-hover:text-white" />
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function ClientDashboard({ onViewAllWorkouts, onViewSubscriptions }: { onViewAllWorkouts: () => void; onViewSubscriptions: () => void }) {
  const { user } = useAuth();
  const [personals, setPersonals] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [personalCode, setPersonalCode] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectStatus, setConnectStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [showAddPersonal, setShowAddPersonal] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState<any[]>([]);

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const todayWorkout = workouts.find(w => w.date.startsWith(todayStr));
  const tomorrowWorkout = workouts.find(w => w.date.startsWith(tomorrowStr));
  const selectedDateWorkout = workouts.find(w => w.date.startsWith(selectedDate));

  useEffect(() => {
    if (user) {
      fetchPersonals();
      fetchWorkouts();
      fetchInvitations();
    }
  }, [user]);

  const fetchInvitations = async () => {
    if (!user?.email) return;
    const q = query(
      collection(db, "invitations"),
      where("studentEmail", "==", user.email.toLowerCase()),
      where("status", "==", "pending")
    );
    const snapshot = await getDocs(q);
    setPendingInvitations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
  };

  const acceptInvitation = async (invitation: any) => {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      
      // Update invitation status
      batch.update(doc(db, "invitations", invitation.id), { status: "accepted" });
      
      // Create connection
      const connectionId = `${invitation.personalId}_${user.id}`;
      batch.set(doc(db, "connections", connectionId), {
        personalId: invitation.personalId,
        studentId: user.id,
        status: "active",
        createdAt: new Date().toISOString()
      });
      
      await batch.commit();
      setPendingInvitations(prev => prev.filter(i => i.id !== invitation.id));
      fetchPersonals();
    } catch (err) {
      console.error("Error accepting invitation:", err);
    }
  };

  const rejectInvitation = async (invitationId: string) => {
    try {
      await updateDoc(doc(db, "invitations", invitationId), { status: "rejected" });
      setPendingInvitations(prev => prev.filter(i => i.id !== invitationId));
    } catch (err) {
      console.error("Error rejecting invitation:", err);
    }
  };

  const fetchWorkouts = async () => {
    if (!user) return;
    const q = query(collection(db, "workouts"), where("studentId", "==", user.id));
    const querySnapshot = await getDocs(q);
    let workoutsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    
    // Filter out workouts from personals who blocked the client
    const connectionsQ = query(collection(db, "connections"), where("studentId", "==", user.id), where("status", "==", "blocked"));
    const connectionsSnapshot = await getDocs(connectionsQ);
    const blockedPersonalIds = connectionsSnapshot.docs.map(doc => doc.data().personalId);
    
    workoutsData = workoutsData.filter(w => !blockedPersonalIds.includes(w.personalId));

    // Sort by date descending
    workoutsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setWorkouts(workoutsData);
  };

  const fetchPersonals = async () => {
    if (!user) return;
    const q = query(collection(db, "connections"), where("studentId", "==", user.id));
    const querySnapshot = await getDocs(q);
    
    const personalPromises = querySnapshot.docs.map(async (connectionDoc) => {
      const data = connectionDoc.data();
      try {
        const personalDoc = await getDoc(doc(db, "users_public", data.personalId));
        let privateData = {};
        try {
          const privateDoc = await getDoc(doc(db, "users_private", data.personalId));
          if (privateDoc.exists()) {
            privateData = privateDoc.data();
          }
        } catch (e) {
          console.warn(`Could not fetch private data for personal ${data.personalId}:`, e);
        }

        return { 
          id: personalDoc.id, 
          ...personalDoc.data(), 
          ...privateData,
          status: data.status 
        };
      } catch (e) {
        console.error(`Error fetching data for personal ${data.personalId}:`, e);
        return null;
      }
    });
    
    const personalsData = (await Promise.all(personalPromises)).filter(p => p !== null);
    setPersonals(personalsData);
  };

  const isBlocked = personals.some(p => p.status === "blocked");

  const connectWithPersonal = async (e: FormEvent) => {
    e.preventDefault();
    if (!personalCode.trim() || !user) return;

    setIsConnecting(true);
    setConnectStatus(null);

    try {
      const q = query(
        collection(db, "users_public"), 
        where("role", "==", "personal"), 
        where("personalCode", "==", personalCode.trim().toUpperCase())
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setConnectStatus({ type: 'error', message: "Código do personal inválido." });
        setIsConnecting(false);
        return;
      }

      const personalDoc = querySnapshot.docs[0];
      const personalId = personalDoc.id;

      // Check if already connected
      const connQ = query(
        collection(db, "connections"),
        where("personalId", "==", personalId),
        where("studentId", "==", user.id)
      );
      const connSnapshot = await getDocs(connQ);

      if (!connSnapshot.empty) {
        setConnectStatus({ type: 'error', message: "Você já está conectado a este personal." });
        setIsConnecting(false);
        return;
      }

      const connectionId = `${personalId}_${user.id}`;
      await setDoc(doc(db, "connections", connectionId), {
        personalId: personalId,
        studentId: user.id,
        status: "active",
        createdAt: new Date().toISOString()
      });

      setConnectStatus({ type: 'success', message: "Conectado com sucesso!" });
      setPersonalCode("");
      fetchPersonals();
    } catch (err) {
      console.error(err);
      setConnectStatus({ type: 'error', message: "Erro ao conectar. Tente novamente." });
    } finally {
      setIsConnecting(false);
      setTimeout(() => setConnectStatus(null), 5000);
    }
  };

  if (selectedWorkout) {
    return (
      <ClientWorkoutView 
        workout={selectedWorkout} 
        onBack={() => {
          setSelectedWorkout(null);
          fetchWorkouts();
        }} 
        isPersonal={false} 
      />
    );
  }

  return (
    <div className="space-y-6">
      {isBlocked && (
        <button 
          onClick={onViewSubscriptions}
          className="w-full text-left bg-gradient-to-r from-orange-600 to-orange-500 p-6 rounded-2xl shadow-2xl shadow-orange-600/20 flex items-center justify-between overflow-hidden relative group transition-transform hover:scale-[1.01] active:scale-[0.99]"
        >
          <div className="relative z-10">
            <h2 className="text-xl font-black text-white uppercase tracking-tighter">Verificar pendências</h2>
            <p className="text-orange-100 text-sm font-medium opacity-90">Não pare agora! Clique aqui e atualize as formas de pagamento.</p>
          </div>
          <div className="bg-white/20 p-3 rounded-xl backdrop-blur-md relative z-10">
            <CreditCard className="w-6 h-6 text-white animate-pulse" />
          </div>
          <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
        </button>
      )}

      {pendingInvitations.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-orange-500" />
            Convites Pendentes
          </h3>
          <div className="grid gap-4">
            {pendingInvitations.map(inv => (
              <div key={inv.id} className="bg-neutral-900 p-6 rounded-2xl border border-orange-500/20 shadow-xl flex items-center justify-between animate-pulse">
                <div>
                  <h4 className="font-bold text-white">{inv.personalName}</h4>
                  <p className="text-sm text-neutral-400">Deseja ser seu personal trainer</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptInvitation(inv)}
                    className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all"
                  >
                    Aceitar
                  </button>
                  <button
                    onClick={() => rejectInvitation(inv.id)}
                    className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                  >
                    Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Meus Treinadores</h2>
        {personals.length > 0 && (
          <button 
            onClick={() => setShowAddPersonal(!showAddPersonal)}
            className="flex items-center gap-2 text-sm font-medium text-orange-500 hover:text-orange-400 transition-colors"
          >
            {showAddPersonal ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            {showAddPersonal ? "Cancelar" : "Novo Treinador"}
          </button>
        )}
      </div>
      
      <div className="grid gap-4">
        {(personals.length === 0 || showAddPersonal) && (
          <div className="bg-neutral-900 p-8 rounded-2xl border border-white/10 shadow-2xl text-center space-y-6">
            <div>
              <img src="https://i.imgur.com/fxOHjtK.png" alt="Track & Health Logo" className="w-16 h-16 object-contain mx-auto mb-4 opacity-50 grayscale" referrerPolicy="no-referrer" />
              <h3 className="text-xl font-medium text-white mb-2">
                {personals.length === 0 ? "Nenhum treinador conectado" : "Conectar com novo treinador"}
              </h3>
              <p className="text-neutral-500 text-sm">
                {personals.length === 0 
                  ? "Você pode aguardar seu personal te adicionar ou inserir o código dele abaixo."
                  : "Insira o código do novo personal trainer para se conectar."}
              </p>
            </div>

            <form onSubmit={connectWithPersonal} className="max-w-xs mx-auto space-y-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Código do Personal"
                  value={personalCode}
                  onChange={(e) => setPersonalCode(e.target.value.toUpperCase())}
                  className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white text-center font-mono font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={isConnecting || !personalCode.trim()}
                className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-orange-600/20"
              >
                {isConnecting ? "Conectando..." : "Conectar"}
              </button>
              {connectStatus && (
                <p className={`text-xs font-medium ${connectStatus.type === 'success' ? 'text-emerald-500' : 'text-red-500'}`}>
                  {connectStatus.message}
                </p>
              )}
            </form>
          </div>
        )}

        {personals.length > 0 && (
          personals.map(personal => (
            <div key={personal.id} className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-2xl flex items-center justify-between">
              <div className="flex items-center gap-4">
                {personal.photoUrl ? (
                  <img src={personal.photoUrl} alt="Profile" className="w-12 h-12 rounded-full object-cover border border-blue-500" />
                ) : (
                  <div className="w-12 h-12 bg-orange-600/20 rounded-full flex items-center justify-center text-xl font-bold text-orange-500">
                    {(personal.displayName || personal.name)?.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-medium text-white">{personal.displayName || personal.name}</h3>
                  <p className="text-sm text-neutral-400">{personal.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => openWhatsApp(personal.phone)}
                  disabled={personal.status === "blocked"}
                  className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${
                    personal.status === "blocked" 
                      ? "text-neutral-600 cursor-not-allowed" 
                      : "text-emerald-500 hover:bg-emerald-500/10"
                  }`}
                >
                  <MessageCircle className="w-5 h-5" />
                  <span className="text-xs font-bold hidden sm:inline">WhatsApp</span>
                </button>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  personal.status === "blocked"
                    ? "bg-red-500/10 text-red-400 border-red-500/20"
                    : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                }`}>
                  {personal.status === "blocked" ? "Bloqueado" : "Conectado"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-8 mt-8">
        {/* Today's Workout */}
        <section>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-orange-500 rounded-full"></div>
            Treino de Hoje
          </h3>
          {todayWorkout ? (
            <ClientWorkoutsList workouts={[todayWorkout]} onSelectWorkout={setSelectedWorkout} />
          ) : (
            <div className="bg-neutral-900/50 p-8 rounded-2xl border border-dashed border-white/10 text-center">
              <p className="text-neutral-500 text-sm">Nenhum treino agendado para hoje.</p>
            </div>
          )}
        </section>

        {/* Tomorrow's Workout */}
        <section>
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <div className="w-1 h-6 bg-neutral-700 rounded-full"></div>
            Treino de Amanhã
          </h3>
          {tomorrowWorkout ? (
            <ClientWorkoutsList workouts={[tomorrowWorkout]} onSelectWorkout={setSelectedWorkout} />
          ) : (
            <div className="bg-neutral-900/50 p-8 rounded-2xl border border-dashed border-white/10 text-center">
              <p className="text-neutral-500 text-sm">Nenhum treino agendado para amanhã.</p>
            </div>
          )}
        </section>

        {/* Calendar and Selection */}
        <section className="space-y-6">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-orange-500" />
            Explorar Calendário
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CustomCalendar 
              selectedDate={selectedDate} 
              onSelectDate={setSelectedDate} 
              workoutDates={workouts.map(w => w.date)}
            />
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
                {selectedDate === todayStr ? "Selecionado: Hoje" : 
                 selectedDate === tomorrowStr ? "Selecionado: Amanhã" : 
                 `Selecionado: ${new Date(selectedDate + "T12:00:00Z").toLocaleDateString('pt-BR')}`}
              </h4>
              {selectedDateWorkout ? (
                <ClientWorkoutsList workouts={[selectedDateWorkout]} onSelectWorkout={setSelectedWorkout} />
              ) : (
                <div className="bg-neutral-900/50 p-12 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center h-full min-h-[200px]">
                  <Activity className="w-10 h-10 text-neutral-800 mb-3" />
                  <p className="text-neutral-600 text-sm">Nenhum treino para esta data.</p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-orange-500" />
              <h3 className="text-lg font-medium text-white">Meus Treinos</h3>
            </div>
          </div>
          
          <ClientWorkoutsList workouts={workouts.slice(0, 3)} onSelectWorkout={setSelectedWorkout} />
          
          {workouts.length > 3 && (
            <button 
              onClick={onViewAllWorkouts}
              className="w-full mt-4 py-2 text-orange-500 hover:text-orange-400 text-xs font-bold uppercase tracking-widest border border-orange-500/20 rounded-xl hover:bg-orange-500/5 transition-all"
            >
              Ver Todos os Treinos
            </button>
          )}
        </div>
        <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <User className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-medium text-white">Progresso</h3>
          </div>
          <p className="text-neutral-500 text-sm">Continue treinando para ver seus gráficos de progresso aqui.</p>
        </div>
      </div>
    </div>
  );
}

function CompleteProfile({ isEditing = false, userOverride = null, onComplete = null }: { isEditing?: boolean, userOverride?: UserType | null, onComplete?: () => void | null }) {
  const { user: authUser, updateUser } = useAuth();
  const user = userOverride || authUser;
  const [phone, setPhone] = useState(user?.phone || "55");
  const [cpf, setCpf] = useState(user?.cpf || "");
  const [cep, setCep] = useState(user?.cep || "");
  const [address, setAddress] = useState(user?.address || "");
  const [city, setCity] = useState(user?.city || "");
  const [birthDate, setBirthDate] = useState(user?.birthDate || "");
  const [cref, setCref] = useState(user?.cref || "");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">(user?.gender || "");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [photoUrl, setPhotoUrl] = useState(user?.photoUrl || "");
  const [anamnesis, setAnamnesis] = useState(user?.anamnesis || {
    objective: "",
    experience: "",
    medicalHistory: "",
    injuries: "",
    surgeries: "",
    medications: "",
    habits: "",
    availability: ""
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  if (!user) return null;

  const handleAnamnesisChange = (field: string, value: string) => {
    setAnamnesis(prev => ({ ...prev, [field]: value }));
  };

  const handlePhotoUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type === 'image/gif') {
        setError("Imagens GIF não são permitidas para a foto de perfil. Use JPG ou PNG.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoUrl(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const publicData = {
        name: displayName || user.name,
        photoUrl,
        city,
        gender,
        profileCompleted: true,
        ...(user.role === "personal" ? { crefNumber: cref } : {})
      };

      const privateData = {
        cpf,
        phone,
        cep,
        address,
        birthDate,
        ...(user.role === "student" ? { anamnesis } : {}),
        medicalHistory: anamnesis.medicalHistory || "",
        medications: anamnesis.medications || ""
      };

      const batch = writeBatch(db);
      batch.update(doc(db, "users_public", user.id), publicData);
      batch.update(doc(db, "users_private", user.id), privateData);
      await batch.commit();
      
      if (!userOverride) {
        updateUser({ ...publicData, ...privateData });
      }
      
      if (onComplete) {
        onComplete();
      } else if (isEditing) {
        alert("Perfil atualizado com sucesso!");
      } else {
        // Redirecionar para a tela inicial após concluir o cadastro inicial
        window.location.href = "/";
      }
    } catch (err: any) {
      console.error("Profile update error details:", err);
      let message = "Ocorreu um erro ao salvar seu perfil.";
      
      if (err.code === "permission-denied") message = "Erro de permissão no banco de dados. Verifique as regras do Firestore.";
      else if (err.message) message = `Erro: ${err.message}`;

      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formContent = (
    <>
      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl mb-6 text-sm text-center">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-24 h-24 mb-4">
              {photoUrl ? (
                <img src={photoUrl} alt="Profile" className="w-full h-full rounded-full object-cover border-2 border-orange-500" />
              ) : (
                <div className="w-full h-full rounded-full bg-neutral-800 flex items-center justify-center border-2 border-neutral-700">
                  <User className="w-8 h-8 text-neutral-500" />
                </div>
              )}
              <label className="absolute bottom-0 right-0 bg-orange-600 p-2 rounded-full cursor-pointer hover:bg-orange-500 transition-colors shadow-lg">
                <Plus className="w-4 h-4 text-white" />
                <input type="file" accept="image/jpeg,image/png" className="hidden" onChange={handlePhotoUpload} />
              </label>
            </div>
            <p className="text-sm text-neutral-400">Foto de Perfil</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-neutral-400 mb-1">Nome de Exibição</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
                placeholder={user.name}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">CPF</label>
              <input
                type="text"
                value={cpf}
                onChange={(e) => setCpf(e.target.value)}
                className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
                placeholder="000.000.000-00"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Telefone (DDI 55)</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
                placeholder="5511999999999"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Data de Nascimento</label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">CEP</label>
              <input
                type="text"
                value={cep}
                onChange={(e) => setCep(e.target.value)}
                className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
                placeholder="00000-000"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Cidade</label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
                placeholder="Sua Cidade"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-2">Gênero</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setGender("male")}
                  className={`py-2 px-3 rounded-xl border text-xs transition-all ${
                    gender === "male"
                      ? "bg-orange-600/20 border-orange-600 text-orange-500"
                      : "bg-neutral-800 border-white/10 text-neutral-400 hover:border-neutral-700"
                  }`}
                >
                  Masculino
                </button>
                <button
                  type="button"
                  onClick={() => setGender("female")}
                  className={`py-2 px-3 rounded-xl border text-xs transition-all ${
                    gender === "female"
                      ? "bg-orange-600/20 border-orange-600 text-orange-500"
                      : "bg-neutral-800 border-white/10 text-neutral-400 hover:border-neutral-700"
                  }`}
                >
                  Feminino
                </button>
                <button
                  type="button"
                  onClick={() => setGender("other")}
                  className={`py-2 px-3 rounded-xl border text-xs transition-all ${
                    gender === "other"
                      ? "bg-orange-600/20 border-orange-600 text-orange-500"
                      : "bg-neutral-800 border-white/10 text-neutral-400 hover:border-neutral-700"
                  }`}
                >
                  Outro
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-400 mb-1">Endereço Completo</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
              placeholder="Rua, Número, Bairro"
              required
            />
          </div>

          {user.role === "personal" ? (
            <div>
              <label className="block text-sm font-medium text-neutral-400 mb-1">Número de Registro no CREF</label>
              <input
                type="text"
                value={cref}
                onChange={(e) => setCref(e.target.value)}
                className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
                placeholder="000000-G/UF"
                required
              />
            </div>
          ) : (
            <div className="space-y-4 mt-6 pt-6 border-t border-white/10">
              <h3 className="text-xl font-bold text-white mb-4">Ficha de Anamnese</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Qual seu objetivo principal?</label>
                  <select
                    value={anamnesis.objective}
                    onChange={(e) => handleAnamnesisChange("objective", e.target.value)}
                    className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
                    required
                  >
                    <option value="">Selecione...</option>
                    <option value="Hipertrofia">Hipertrofia (Ganho de Massa)</option>
                    <option value="Emagrecimento">Emagrecimento</option>
                    <option value="Condicionamento">Condicionamento Físico</option>
                    <option value="Saude">Saúde e Qualidade de Vida</option>
                    <option value="Reabilitacao">Reabilitação</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-400 mb-1">Nível de Experiência</label>
                  <select
                    value={anamnesis.experience}
                    onChange={(e) => handleAnamnesisChange("experience", e.target.value)}
                    className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
                    required
                  >
                    <option value="">Selecione...</option>
                    <option value="Sedentario">Sedentário (Não pratico exercícios)</option>
                    <option value="Iniciante">Iniciante (Menos de 6 meses)</option>
                    <option value="Intermediario">Intermediário (6 meses a 2 anos)</option>
                    <option value="Avancado">Avançado (Mais de 2 anos)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Histórico Médico (Doenças crônicas, problemas cardíacos, diabetes, asma, etc.)</label>
                <textarea
                  value={anamnesis.medicalHistory}
                  onChange={(e) => handleAnamnesisChange("medicalHistory", e.target.value)}
                  className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all min-h-[80px]"
                  placeholder="Se não houver, digite 'Nenhum'."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Lesões ou Dores Articulares (Joelho, coluna, ombro, etc.)</label>
                <textarea
                  value={anamnesis.injuries}
                  onChange={(e) => handleAnamnesisChange("injuries", e.target.value)}
                  className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all min-h-[80px]"
                  placeholder="Descreva o local e a intensidade da dor. Se não houver, digite 'Nenhuma'."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Cirurgias Recentes ou Antigas Relevantes</label>
                <textarea
                  value={anamnesis.surgeries}
                  onChange={(e) => handleAnamnesisChange("surgeries", e.target.value)}
                  className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all min-h-[80px]"
                  placeholder="Se não houver, digite 'Nenhuma'."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Uso de Medicamentos Contínuos</label>
                <textarea
                  value={anamnesis.medications}
                  onChange={(e) => handleAnamnesisChange("medications", e.target.value)}
                  className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all min-h-[80px]"
                  placeholder="Quais medicamentos você toma regularmente? Se não houver, digite 'Nenhum'."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Hábitos de Vida (Qualidade do sono, fumo, consumo de álcool, alimentação)</label>
                <textarea
                  value={anamnesis.habits}
                  onChange={(e) => handleAnamnesisChange("habits", e.target.value)}
                  className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all min-h-[80px]"
                  placeholder="Ex: Durmo 6h por noite, não fumo, bebo aos finais de semana..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-1">Disponibilidade de Tempo para Treinar</label>
                <input
                  type="text"
                  value={anamnesis.availability}
                  onChange={(e) => handleAnamnesisChange("availability", e.target.value)}
                  className="w-full bg-neutral-800 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all"
                  placeholder="Ex: 3 vezes na semana, 1 hora por dia"
                  required
                />
              </div>
            </div>
          )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-orange-600/20 mt-6"
        >
          {isSubmitting ? "Salvando..." : (isEditing ? "Confirmar Alterações" : "Concluir Cadastro")}
        </button>
      </form>
    </>
  );

  if (isEditing) {
    return formContent;
  }

  return (
    <div className="min-h-screen bg-neutral-950 flex items-center justify-center p-4 py-12">
      <div className="bg-neutral-900 p-8 rounded-2xl shadow-2xl w-full max-w-2xl border border-white/10">
        <h2 className="text-3xl font-bold text-white text-center mb-2">Complete seu Cadastro</h2>
        <p className="text-neutral-400 text-center mb-8">Precisamos de mais algumas informações para continuar.</p>
        {formContent}
      </div>
    </div>
  );
}

function ClientWorkoutsTab({ userOverride = null }: { userOverride?: UserType | null }) {
  const { user: authUser } = useAuth();
  const user = userOverride || authUser;
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isBlocked, setIsBlocked] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (user) {
      fetchWorkouts();
      checkBlockedStatus();
    }
  }, [user]);

  const checkBlockedStatus = async () => {
    if (!user) return;
    const q = query(collection(db, "connections"), where("studentId", "==", user.id), where("status", "==", "blocked"));
    const snapshot = await getDocs(q);
    setIsBlocked(!snapshot.empty);
  };

  const fetchWorkouts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, "workouts"), where("studentId", "==", user.id));
      const querySnapshot = await getDocs(q);
      let workoutsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      
      const connectionsQ = query(collection(db, "connections"), where("studentId", "==", user.id), where("status", "==", "blocked"));
      const connectionsSnapshot = await getDocs(connectionsQ);
      const blockedPersonalIds = connectionsSnapshot.docs.map(doc => doc.data().personalId);
      
      workoutsData = workoutsData.filter(w => !blockedPersonalIds.includes(w.personalId));
      workoutsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setWorkouts(workoutsData);
    } catch (error) {
      console.error("Error fetching workouts:", error);
    } finally {
      setLoading(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const todayWorkout = workouts.find(w => w.date.startsWith(todayStr));
  const tomorrowWorkout = workouts.find(w => w.date.startsWith(tomorrowStr));
  const selectedDateWorkout = workouts.find(w => w.date.startsWith(selectedDate));

  if (selectedWorkout) {
    return (
      <ClientWorkoutView 
        workout={selectedWorkout} 
        onBack={() => {
          setSelectedWorkout(null);
          fetchWorkouts();
        }} 
        isPersonal={false} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Meus Treinos</h2>
          <p className="text-neutral-500 text-sm">Acompanhe sua jornada e execute seus treinos.</p>
        </div>
      </div>

      {isBlocked && (
        <div className="bg-neutral-900/50 p-4 rounded-xl border border-white/5 flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-600/20 rounded-full flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5 text-orange-500" />
          </div>
          <div>
            <p className="text-white font-bold text-sm">Verificar pendências</p>
            <p className="text-neutral-500 text-xs">Não pare agora! Mantenha seus pagamentos em dia para continuar treinando.</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-4"></div>
          <p className="text-neutral-500 text-sm animate-pulse">Buscando seus treinos...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Today's Workout */}
          <section>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-orange-500 rounded-full"></div>
              Treino de Hoje
            </h3>
            {todayWorkout ? (
              <ClientWorkoutsList workouts={[todayWorkout]} onSelectWorkout={setSelectedWorkout} />
            ) : (
              <div className="bg-neutral-900/50 p-8 rounded-2xl border border-dashed border-white/10 text-center">
                <p className="text-neutral-500 text-sm">Nenhum treino agendado para hoje.</p>
              </div>
            )}
          </section>

          {/* Tomorrow's Workout */}
          <section>
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <div className="w-1 h-6 bg-neutral-700 rounded-full"></div>
              Treino de Amanhã
            </h3>
            {tomorrowWorkout ? (
              <ClientWorkoutsList workouts={[tomorrowWorkout]} onSelectWorkout={setSelectedWorkout} />
            ) : (
              <div className="bg-neutral-900/50 p-8 rounded-2xl border border-dashed border-white/10 text-center">
                <p className="text-neutral-500 text-sm">Nenhum treino agendado para amanhã.</p>
              </div>
            )}
          </section>

          {/* Calendar and Selection */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-orange-500" />
              Explorar Calendário
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CustomCalendar 
                selectedDate={selectedDate} 
                onSelectDate={setSelectedDate} 
                workoutDates={workouts.map(w => w.date)}
              />
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
                  {selectedDate === todayStr ? "Selecionado: Hoje" : 
                   selectedDate === tomorrowStr ? "Selecionado: Amanhã" : 
                   `Selecionado: ${new Date(selectedDate + "T12:00:00Z").toLocaleDateString('pt-BR')}`}
                </h4>
                {selectedDateWorkout ? (
                  <ClientWorkoutsList workouts={[selectedDateWorkout]} onSelectWorkout={setSelectedWorkout} />
                ) : (
                  <div className="bg-neutral-900/50 p-12 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center h-full min-h-[200px]">
                    <Activity className="w-10 h-10 text-neutral-800 mb-3" />
                    <p className="text-neutral-600 text-sm">Nenhum treino para esta data.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function ClientHistoryTab() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (user) {
      fetchWorkouts();
    }
  }, [user]);

  const fetchWorkouts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, "workouts"), where("studentId", "==", user.id));
      const querySnapshot = await getDocs(q);
      let workoutsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      
      // Filter out workouts from personals who blocked the client
      const connectionsQ = query(collection(db, "connections"), where("studentId", "==", user.id), where("status", "==", "blocked"));
      const connectionsSnapshot = await getDocs(connectionsQ);
      const blockedPersonalIds = connectionsSnapshot.docs.map(doc => doc.data().personalId);
      
      workoutsData = workoutsData.filter(w => !blockedPersonalIds.includes(w.personalId));
      workoutsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setWorkouts(workoutsData);
    } catch (error) {
      console.error("Error fetching workouts:", error);
    } finally {
      setLoading(false);
    }
  };

  const todayStr = new Date().toISOString().split('T')[0];
  const historyWorkouts = workouts.filter(w => w.date <= todayStr);
  const last5Workouts = historyWorkouts.slice(0, 5);
  const selectedDateWorkout = workouts.find(w => w.date.startsWith(selectedDate));

  if (selectedWorkout) {
    return (
      <ClientWorkoutView 
        workout={selectedWorkout} 
        onBack={() => {
          setSelectedWorkout(null);
          fetchWorkouts();
        }} 
        isPersonal={false} 
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Histórico de Treinos</h2>
          <p className="text-neutral-500 text-sm">Reveja seus treinos passados e acompanhe sua evolução.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-4"></div>
          <p className="text-neutral-500 text-sm animate-pulse">Buscando histórico...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Calendar for history */}
          <section className="space-y-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-orange-500" />
              Buscar no Calendário
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <CustomCalendar 
                selectedDate={selectedDate} 
                onSelectDate={setSelectedDate} 
                workoutDates={workouts.map(w => w.date)}
              />
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-neutral-500 uppercase tracking-wider">
                  {`Data: ${new Date(selectedDate + "T12:00:00Z").toLocaleDateString('pt-BR')}`}
                </h4>
                {selectedDateWorkout ? (
                  <ClientWorkoutsList workouts={[selectedDateWorkout]} onSelectWorkout={setSelectedWorkout} />
                ) : (
                  <div className="bg-neutral-900/50 p-12 rounded-2xl border border-white/5 text-center flex flex-col items-center justify-center h-full min-h-[200px]">
                    <Activity className="w-10 h-10 text-neutral-800 mb-3" />
                    <p className="text-neutral-600 text-sm">Nenhum treino encontrado nesta data.</p>
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}


function SuperAdminDashboard() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState<"all" | "personal" | "student" | "superadmin">("all");
  const [globalMessage, setGlobalMessage] = useState("");
  const [maxViews, setMaxViews] = useState(1);
  const [messageTarget, setMessageTarget] = useState<"all" | "personal" | "student">("all");
  const [systemMessages, setSystemMessages] = useState<any[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [impersonatedUser, setImpersonatedUser] = useState<UserType | null>(null);
  const [activeTab, setActiveTab] = useState<"users" | "hierarchy" | "messages">("users");
  const [connections, setConnections] = useState<any[]>([]);

  const { user } = useAuth();

  useEffect(() => {
    if (user?.role === "superadmin") {
      fetchUsers();
      fetchSystemMessages();
      fetchConnections();
    }
  }, [user]);

  const refreshData = () => {
    if (user?.role === "superadmin") {
      fetchUsers();
      fetchConnections();
      fetchSystemMessages();
    }
  };

  const fetchConnections = async () => {
    try {
      const q = query(collection(db, "connections"));
      const snapshot = await getDocs(q);
      const connectionsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setConnections(connectionsData);
    } catch (error) {
      console.error("Error fetching connections:", error);
    }
  };

  const disconnectClient = async (personalId: string, clientId: string) => {
    if (!window.confirm("Deseja realmente desvincular este aluno deste personal?")) return;
    try {
      const q = query(collection(db, "connections"), where("personalId", "==", personalId), where("studentId", "==", clientId));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      alert("Aluno desvinculado com sucesso!");
      fetchConnections();
    } catch (error) {
      console.error("Error disconnecting client:", error);
      alert("Erro ao desvincular aluno.");
    }
  };

  const fetchSystemMessages = async () => {
    const q = query(collection(db, "system_messages"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSystemMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "system_messages");
    });
    return unsubscribe;
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "users_public"));
      const snapshot = await getDocs(q);
      const usersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UserType));
      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateUserRole = async (userId: string, newRole: "personal" | "student") => {
    try {
      await updateDoc(doc(db, "users_public", userId), { role: newRole });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
      alert("Role atualizada com sucesso!");
    } catch (error) {
      console.error("Error updating role:", error);
      alert("Erro ao atualizar role.");
    }
  };

  const toggleBlockUser = async (userId: string, currentStatus: boolean) => {
    try {
      await updateDoc(doc(db, "users_public", userId), { blocked: !currentStatus });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, blocked: !currentStatus } : u));
      alert(currentStatus ? "Usuário desbloqueado!" : "Usuário bloqueado!");
    } catch (error) {
      console.error("Error toggling block:", error);
      alert("Erro ao alterar status do usuário.");
    }
  };

  const sendSystemMessage = async (target: string, text: string) => {
    if (!text.trim()) return;
    setIsSending(true);
    try {
      await addDoc(collection(db, "system_messages"), {
        text,
        target,
        active: true,
        maxViews: Number(maxViews) || 1,
        createdAt: serverTimestamp()
      });
      alert("Mensagem enviada com sucesso!");
      setGlobalMessage("");
      setMaxViews(1);
    } catch (error) {
      console.error("Error sending message:", error);
      alert("Erro ao enviar mensagem.");
    } finally {
      setIsSending(false);
    }
  };

  const deleteSystemMessage = async (messageId: string) => {
    if (!window.confirm("Deseja realmente excluir esta mensagem?")) return;
    try {
      await deleteDoc(doc(db, "system_messages", messageId));
      alert("Mensagem excluída!");
    } catch (error) {
      console.error("Error deleting message:", error);
      alert("Erro ao excluir mensagem.");
    }
  };

  const clearAllSystemMessages = async () => {
    if (!window.confirm("Deseja realmente excluir TODAS as mensagens do sistema? Esta ação não pode ser desfeita.")) return;
    setIsSending(true);
    try {
      const q = query(collection(db, "system_messages"));
      const snapshot = await getDocs(q);
      const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);
      alert("Todas as mensagens foram removidas!");
    } catch (error) {
      console.error("Error clearing messages:", error);
      alert("Erro ao remover mensagens.");
    } finally {
      setIsSending(false);
    }
  };

  const deleteUserAccount = async (userId: string) => {
    try {
      const userToDelete = users.find(u => u.id === userId);
      if (!userToDelete) return;

      const batch = writeBatch(db);
      batch.delete(doc(db, "users_public", userId));
      batch.delete(doc(db, "users_private", userId));
      if (userToDelete.email) {
        batch.delete(doc(db, "user_emails", userToDelete.email.toLowerCase()));
      }
      
      // Also delete connections
      const userConnections = connections.filter(c => c.personalId === userId || c.studentId === userId);
      userConnections.forEach(c => {
        batch.delete(doc(db, "connections", c.id));
      });

      await batch.commit();
      setUsers(prev => prev.filter(u => u.id !== userId));
    } catch (error) {
      console.error("Error deleting user account:", error);
      throw error;
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         u.email?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === "all" || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const personals = filteredUsers.filter(u => u.role === "personal");
  const clients = filteredUsers.filter(u => u.role === "student");
  const admins = filteredUsers.filter(u => u.role === "superadmin");

  const onlineClientsCount = connections.filter(c => c.type === "online").length;
  const presencialClientsCount = connections.filter(c => c.type === "presencial").length;
  const unclassifiedClientsCount = connections.filter(c => !c.type).length;

  if (impersonatedUser) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-orange-600/10 p-4 rounded-2xl border border-orange-500/20">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            <p className="text-orange-500 font-bold text-sm">Modo de Edição: {impersonatedUser.name}</p>
          </div>
          <button 
            onClick={() => setImpersonatedUser(null)}
            className="bg-orange-600 text-white px-4 py-2 rounded-xl text-xs font-bold"
          >
            Sair da Edição
          </button>
        </div>
        {impersonatedUser.role === "personal" ? (
          <PersonalDashboardViewOverride userOverride={impersonatedUser} />
        ) : (
          <ClientDashboardViewOverride userOverride={impersonatedUser} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Painel SuperAdmin</h2>
          <p className="text-neutral-500 text-sm">Gerencie todos os usuários e permissões do sistema.</p>
        </div>
        <button 
          onClick={refreshData}
          className="p-2 bg-neutral-900 hover:bg-neutral-800 rounded-xl border border-white/5 transition-colors"
        >
          <RefreshCw className={`w-5 h-5 text-orange-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="flex bg-neutral-900 p-1 rounded-xl border border-white/5 w-fit">
        <button 
          onClick={() => setActiveTab("users")}
          className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "users" ? "bg-orange-600 text-white shadow-lg" : "text-neutral-500 hover:text-white"}`}
        >
          Usuários
        </button>
        <button 
          onClick={() => setActiveTab("hierarchy")}
          className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "hierarchy" ? "bg-orange-600 text-white shadow-lg" : "text-neutral-500 hover:text-white"}`}
        >
          Hierarquia
        </button>
        <button 
          onClick={() => setActiveTab("messages")}
          className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "messages" ? "bg-orange-600 text-white shadow-lg" : "text-neutral-500 hover:text-white"}`}
        >
          Mensagens
        </button>
      </div>

      {(activeTab === "users" || activeTab === "hierarchy") && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <Globe className="w-5 h-5 text-blue-500" />
              <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Alunos Online</p>
            </div>
            <p className="text-3xl font-black text-white">{onlineClientsCount}</p>
          </div>
          <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <User className="w-5 h-5 text-emerald-500" />
              <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Alunos Presenciais</p>
            </div>
            <p className="text-3xl font-black text-white">{presencialClientsCount}</p>
          </div>
          <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-xl">
            <div className="flex items-center gap-3 mb-2">
              <AlertCircle className="w-5 h-5 text-orange-500" />
              <p className="text-neutral-500 text-[10px] font-bold uppercase tracking-widest">Não Classificados</p>
            </div>
            <p className="text-3xl font-black text-white">{unclassifiedClientsCount}</p>
          </div>
        </div>
      )}

      {activeTab === "messages" && (
        <div className="space-y-6">
          {/* Global Messaging */}
          <div className="bg-neutral-900 p-6 rounded-2xl border border-white/10 shadow-2xl space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <Send className="w-5 h-5 text-orange-500" />
                <h3 className="text-lg font-bold text-white">Enviar Mensagem Global</h3>
              </div>
              <button 
                onClick={clearAllSystemMessages}
                disabled={isSending || systemMessages.length === 0}
                className="text-xs text-red-500 hover:text-red-400 font-bold flex items-center gap-1 transition-colors"
              >
                <Trash2 className="w-3 h-3" />
                Limpar Todas
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <select 
                value={messageTarget}
                onChange={(e) => setMessageTarget(e.target.value as any)}
                className="bg-neutral-800 border border-white/5 text-white text-sm rounded-xl px-4 py-3 focus:ring-orange-500 outline-none"
              >
                <option value="all">Todos os Usuários</option>
                <option value="personal">Apenas Personals</option>
                <option value="student">Apenas Alunos</option>
              </select>
              <input 
                type="text"
                placeholder="Digite o aviso..."
                value={globalMessage}
                onChange={(e) => setGlobalMessage(e.target.value)}
                className="md:col-span-2 bg-neutral-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:ring-orange-500 outline-none"
              />
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input 
                    type="number"
                    min="1"
                    max="99"
                    value={maxViews}
                    onChange={(e) => setMaxViews(parseInt(e.target.value) || 1)}
                    className="w-full bg-neutral-800 border border-white/5 rounded-xl px-4 py-3 text-white focus:ring-orange-500 outline-none text-center"
                    title="Número de vezes que a mensagem aparecerá para cada usuário"
                  />
                  <span className="absolute -top-2 left-3 bg-neutral-900 px-1 text-[10px] text-neutral-500 font-bold uppercase">Exibições</span>
                </div>
                <button 
                  onClick={() => sendSystemMessage(messageTarget, globalMessage)}
                  disabled={isSending || !globalMessage.trim()}
                  className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-3 rounded-xl font-bold transition-all disabled:opacity-50 flex-1"
                >
                  Enviar
                </button>
              </div>
            </div>
          </div>

          {/* Active System Messages */}
          <div className="bg-neutral-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-orange-500" />
                <h3 className="text-lg font-bold text-white">Mensagens do Sistema Ativas</h3>
              </div>
              <span className="bg-orange-600/20 text-orange-500 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-widest">
                {systemMessages.filter(m => m.active).length} Ativas
              </span>
            </div>
            <div className="divide-y divide-white/5">
              {systemMessages.length === 0 ? (
                <div className="p-12 text-center text-neutral-500">
                  Nenhuma mensagem enviada.
                </div>
              ) : (
                systemMessages.map((msg) => (
                  <div key={msg.id} className="p-4 flex items-center justify-between hover:bg-white/5 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                          msg.target === 'all' ? 'bg-blue-500/20 text-blue-400' :
                          msg.target === 'personal' ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-purple-500/20 text-purple-400'
                        }`}>
                          {msg.target === 'all' ? 'Todos' : msg.target === 'personal' ? 'Personals' : 'Alunos'}
                        </span>
                        <span className="text-[10px] text-neutral-500">
                          {msg.createdAt?.toDate ? msg.createdAt.toDate().toLocaleString('pt-BR') : 'Recentemente'}
                        </span>
                        {msg.maxViews && (
                          <span className="text-[10px] text-orange-500/70 font-bold">
                            • {msg.maxViews} {msg.maxViews === 1 ? 'exibição' : 'exibições'}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-white">{msg.text}</p>
                    </div>
                    <button 
                      onClick={() => deleteSystemMessage(msg.id)}
                      className="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "users" && (
        <div className="space-y-6">
          {editingUser ? (
            <AdminUserEditView 
              user={editingUser}
              onClose={() => setEditingUser(null)}
              onUpdateRole={updateUserRole}
              onToggleBlock={toggleBlockUser}
              onSendMessage={(id) => {
                const text = prompt("Digite a mensagem para este usuário:");
                if (text) sendSystemMessage(id, text);
              }}
              onImpersonate={setImpersonatedUser}
              onDeleteUser={deleteUserAccount}
              connections={connections}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-neutral-900 p-4 rounded-2xl border border-white/10">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full bg-neutral-800 border border-white/5 rounded-xl pl-10 pr-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-orange-500 transition-all"
                    />
                  </div>
                </div>
                <div className="bg-neutral-900 p-4 rounded-2xl border border-white/10 flex items-center gap-3">
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-widest whitespace-nowrap">Filtrar:</span>
                  <div className="flex bg-neutral-800 p-1 rounded-lg border border-white/5 w-full">
                    {(["all", "personal", "student", "superadmin"] as const).map((r) => (
                      <button
                        key={r}
                        onClick={() => setFilterRole(r)}
                        className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${
                          filterRole === r ? "bg-orange-600 text-white shadow-lg" : "text-neutral-500 hover:text-white"
                        }`}
                      >
                        {r === "all" ? "Todos" : r === "student" ? "Alunos" : r}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-4"></div>
                  <p className="text-neutral-500 text-sm animate-pulse">Carregando usuários...</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {/* Personals Section */}
                  {(filterRole === "all" || filterRole === "personal") && personals.length > 0 && (
                    <UserTable 
                      title="Personals" 
                      users={personals} 
                      onEdit={setEditingUser}
                      icon={<Users className="w-5 h-5 text-blue-400" />}
                    />
                  )}

                  {/* Clients Section */}
                  {(filterRole === "all" || filterRole === "student") && clients.length > 0 && (
                    <UserTable 
                      title="Alunos" 
                      users={clients} 
                      onEdit={setEditingUser}
                      icon={<Dumbbell className="w-5 h-5 text-emerald-400" />}
                    />
                  )}

                  {/* Admins Section */}
                  {(filterRole === "all" || filterRole === "superadmin") && admins.length > 0 && (
                    <UserTable 
                      title="Administradores" 
                      users={admins} 
                      onEdit={setEditingUser}
                      icon={<Activity className="w-5 h-5 text-purple-400" />}
                    />
                  )}

                  {filteredUsers.length === 0 && (
                    <div className="bg-neutral-900 p-12 rounded-2xl border border-white/10 text-center">
                      <Search className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
                      <p className="text-neutral-500">Nenhum usuário encontrado com os filtros atuais.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {activeTab === "hierarchy" && (
        <div className="space-y-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-4"></div>
              <p className="text-neutral-500 text-sm animate-pulse">Carregando hierarquia...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {users.filter(u => u.role === "personal").map(personal => {
                const personalConnections = connections.filter(c => c.personalId === personal.id);
                const associatedClients = users.filter(u => u.role === "student" && personalConnections.some(c => c.studentId === u.id));
                return (
                  <div key={personal.id} className="bg-neutral-900 rounded-2xl border border-white/10 overflow-hidden shadow-xl">
                    <div className="p-6 bg-neutral-800/50 border-b border-white/5 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {personal.photoUrl ? (
                          <img src={personal.photoUrl} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-blue-500/50" />
                        ) : (
                          <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500 font-bold text-lg border-2 border-blue-500/20">
                            {personal.name?.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <h3 className="text-xl font-bold text-white">{personal.name}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-neutral-500">{personal.email}</span>
                            <span className="bg-blue-500/10 text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-500/20">
                              Código: {personal.personalCode}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-white">{associatedClients.length}</div>
                        <div className="text-[10px] text-neutral-500 uppercase font-bold tracking-widest">Alunos</div>
                      </div>
                    </div>
                    <div className="p-4">
                      {associatedClients.length === 0 ? (
                        <div className="py-8 text-center text-neutral-600 italic text-sm">
                          Nenhum aluno associado a este personal.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {associatedClients.map(client => (
                            <div key={client.id} className="bg-neutral-800/30 p-3 rounded-xl border border-white/5 flex items-center gap-3 hover:bg-neutral-800/50 transition-colors">
                              {client.photoUrl ? (
                                <img src={client.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                              ) : (
                                <div className="w-8 h-8 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500 font-bold text-xs">
                                  {client.name?.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-white truncate">{client.name}</div>
                                <div className="text-[10px] text-neutral-500 truncate">{client.email}</div>
                              </div>
                              <button
                                onClick={() => disconnectClient(personal.id, client.id)}
                                className="p-2 text-neutral-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                                title="Desvincular Aluno"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {users.filter(u => u.role === "personal").length === 0 && (
                <div className="bg-neutral-900 p-12 rounded-2xl border border-white/10 text-center">
                  <Users className="w-12 h-12 text-neutral-700 mx-auto mb-4" />
                  <p className="text-neutral-500">Nenhum personal cadastrado no sistema.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function UserTable({ title, users, onEdit, icon }: { 
  title: string, 
  users: UserType[], 
  onEdit: (user: UserType) => void,
  icon: ReactNode 
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 px-2">
        {icon}
        <h3 className="text-lg font-bold text-white">{title}</h3>
        <span className="bg-white/5 text-neutral-500 text-[10px] px-2 py-0.5 rounded-full border border-white/5">
          {users.length}
        </span>
      </div>
      <div className="bg-neutral-900 rounded-2xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-neutral-800 text-neutral-400 uppercase text-[10px] font-bold tracking-widest border-b border-white/5">
              <tr>
                <th className="px-6 py-4">Usuário</th>
                <th className="px-6 py-4">Role Atual</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {user.photoUrl ? (
                        <img src={user.photoUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 bg-orange-500/10 rounded-full flex items-center justify-center text-orange-500 font-bold text-xs">
                          {user.name?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-bold text-white">{user.name}</div>
                        <div className="text-neutral-500 text-xs">{user.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      user.role === 'superadmin' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                      user.role === 'personal' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                      'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {user.role === 'student' ? 'Aluno' : user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      user.blocked ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}>
                      {user.blocked ? 'Bloqueado' : 'Ativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button 
                      onClick={() => onEdit(user)}
                      className="p-2 text-neutral-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                      title="Editar / Ações"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function AdminUserEditView({ 
  user, 
  onClose, 
  onUpdateRole, 
  onToggleBlock, 
  onSendMessage, 
  onImpersonate,
  onDeleteUser,
  connections
}: { 
  user: UserType, 
  onClose: () => void,
  onUpdateRole: (id: string, role: "personal" | "student") => void,
  onToggleBlock: (id: string, current: boolean) => void,
  onSendMessage: (id: string) => void,
  onImpersonate: (user: UserType) => void,
  onDeleteUser: (id: string) => void,
  connections: any[]
}) {
  const userConnection = connections.find(c => c.client_id === user.id);

  const [activeTab, setActiveTab] = useState<"workouts" | "profile">(user.role === 'student' ? "workouts" : "profile");
  const [localRole, setLocalRole] = useState(user.role);
  const [localBlocked, setLocalBlocked] = useState(!!user.blocked);
  const [isSaving, setIsSaving] = useState(false);

  const handleConfirmChanges = async () => {
    setIsSaving(true);
    try {
      if (localRole !== user.role) {
        await onUpdateRole(user.id, localRole as any);
      }
      if (localBlocked !== !!user.blocked) {
        await onToggleBlock(user.id, !localBlocked);
      }
      alert("Alterações de status e cargo salvas com sucesso!");
    } catch (error) {
      console.error("Error saving admin changes:", error);
      alert("Erro ao salvar alterações.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = async () => {
    if (window.confirm(`TEM CERTEZA que deseja excluir permanentemente a conta de ${user.name}? Esta ação não pode ser desfeita e removerá todos os dados do usuário.`)) {
      try {
        await onDeleteUser(user.id);
        alert("Usuário excluído com sucesso.");
        onClose();
      } catch (error) {
        console.error("Error deleting user:", error);
        alert("Erro ao excluir usuário.");
      }
    }
  };

  const updateType = async (type: "online" | "presencial") => {
    if (!userConnection) return;
    try {
      await updateDoc(doc(db, "connections", userConnection.id), { type });
      alert("Tipo de aluno atualizado!");
    } catch (error) {
      console.error("Error updating type:", error);
    }
  };
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center justify-between">
        <button 
          onClick={onClose}
          className="flex items-center gap-2 text-neutral-500 hover:text-white transition-colors group"
        >
          <div className="p-2 rounded-xl bg-neutral-900 border border-white/5 group-hover:border-white/10">
            <ArrowLeft className="w-4 h-4" />
          </div>
          <span className="text-sm font-bold uppercase tracking-widest">Voltar para Lista</span>
        </button>
        <div className="flex items-center gap-3">
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border ${
            user.blocked ? 'bg-red-500/10 text-red-400 border-red-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          }`}>
            {user.blocked ? 'Bloqueado' : 'Ativo'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Info & Quick Actions */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-neutral-900 p-6 rounded-3xl border border-white/10 shadow-2xl space-y-6">
            <div className="flex flex-col items-center text-center space-y-4">
              {user.photoUrl ? (
                <img src={user.photoUrl} alt="" className="w-24 h-24 rounded-full object-cover border-4 border-orange-500/20 shadow-xl shadow-orange-500/10" />
              ) : (
                <div className="w-24 h-24 bg-orange-500/10 rounded-full flex items-center justify-center text-orange-500 font-bold text-3xl border-4 border-orange-500/20 shadow-xl shadow-orange-500/10">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <h3 className="text-xl font-black text-white">{user.name}</h3>
                <p className="text-neutral-500 text-sm">{user.email}</p>
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-white/5">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Alterar Role</label>
                <select 
                  value={localRole}
                  onChange={(e) => setLocalRole(e.target.value as any)}
                  className="w-full bg-neutral-800 border border-white/5 text-white text-sm rounded-xl px-4 py-3 focus:ring-orange-500 outline-none transition-all"
                >
                  <option value="student">Aluno</option>
                  <option value="personal">Personal</option>
                  <option value="superadmin">Superadmin</option>
                </select>
              </div>

              {user.role === "student" && userConnection && (
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">Classificação</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={() => updateType("online")}
                      className={`py-2 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                        userConnection.type === "online" 
                          ? "bg-blue-500/20 border-blue-500 text-blue-400" 
                          : "bg-neutral-800 border-white/5 text-neutral-500 hover:border-white/10"
                      }`}
                    >
                      Online
                    </button>
                    <button 
                      onClick={() => updateType("presencial")}
                      className={`py-2 px-3 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all ${
                        userConnection.type === "presencial" 
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" 
                          : "bg-neutral-800 border-white/5 text-neutral-500 hover:border-white/10"
                      }`}
                    >
                      Presencial
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => setLocalBlocked(!localBlocked)}
                  className={`flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-xs transition-all ${
                    localBlocked 
                    ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 hover:bg-emerald-500/20' 
                    : 'bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20'
                  }`}
                >
                  {localBlocked ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                  {localBlocked ? 'Desbloquear' : 'Bloquear'}
                </button>
                <button 
                  onClick={() => openWhatsApp(user.phone)}
                  className="flex items-center justify-center gap-2 py-3 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl font-bold text-xs hover:bg-emerald-500/20 transition-all"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </button>
              </div>

              <button 
                onClick={handleConfirmChanges}
                disabled={isSaving || (localRole === user.role && localBlocked === !!user.blocked)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all disabled:opacity-50 disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSaving ? "Salvando..." : "Confirmar Alterações de Status"}
              </button>

              <button 
                onClick={() => onSendMessage(user.id)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-orange-500/10 text-orange-500 border border-orange-500/20 rounded-xl font-bold text-xs hover:bg-orange-500/20 transition-all"
              >
                <Bell className="w-4 h-4" />
                Notificar Usuário
              </button>

              <button 
                onClick={() => onImpersonate(user)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-blue-500/10 text-blue-500 border border-blue-500/20 rounded-xl font-bold text-xs hover:bg-blue-500/20 transition-all"
              >
                <User className="w-4 h-4" />
                Ver como Usuário
              </button>

              <button 
                onClick={handleDeleteClick}
                className="w-full flex items-center justify-center gap-2 py-3 bg-red-500/10 text-red-500 border border-red-500/20 rounded-xl font-bold text-xs hover:bg-red-500 hover:text-white transition-all"
              >
                <Trash2 className="w-4 h-4" />
                Excluir Conta do Usuário
              </button>
            </div>
          </div>

          {/* Additional Info */}
          <div className="bg-neutral-900 p-6 rounded-3xl border border-white/10 shadow-2xl">
            <h4 className="text-xs font-bold text-neutral-500 uppercase tracking-widest mb-4">Informações Adicionais</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-500">ID do Usuário</span>
                <span className="text-xs font-mono text-white bg-white/5 px-2 py-1 rounded">{user.id.substring(0, 8)}...</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-neutral-500">Criado em</span>
                <span className="text-xs text-white">{user.createdAt ? new Date(user.createdAt).toLocaleDateString('pt-BR') : 'N/A'}</span>
              </div>
              {user.role === 'personal' && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-neutral-500">Código Personal</span>
                  <span className="text-xs font-bold text-orange-500">{user.personalCode || 'N/A'}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Section (Workouts or Profile) */}
        <div className="lg:col-span-2 space-y-6">
          {user.role === 'student' && (
            <div className="flex bg-neutral-900 p-1 rounded-xl border border-white/5 w-fit">
              <button 
                onClick={() => setActiveTab("workouts")}
                className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "workouts" ? "bg-orange-600 text-white shadow-lg" : "text-neutral-500 hover:text-white"}`}
              >
                Treinos
              </button>
              <button 
                onClick={() => setActiveTab("profile")}
                className={`px-6 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === "profile" ? "bg-orange-600 text-white shadow-lg" : "text-neutral-500 hover:text-white"}`}
              >
                Perfil
              </button>
            </div>
          )}

          {activeTab === 'workouts' && user.role === 'student' ? (
            <div className="bg-neutral-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center gap-3">
                <Dumbbell className="w-5 h-5 text-orange-500" />
                <h3 className="text-lg font-bold text-white">Treinos do Aluno</h3>
              </div>
              <div className="p-6">
                <ClientWorkoutsTab userOverride={user} />
              </div>
            </div>
          ) : (
            <div className="bg-neutral-900 rounded-3xl border border-white/10 shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-white/5 flex items-center gap-3">
                <User className="w-5 h-5 text-orange-500" />
                <h3 className="text-lg font-bold text-white">
                  {user.role === 'personal' ? 'Perfil do Personal' : 'Perfil do Aluno'}
                </h3>
              </div>
              <div className="p-6">
                <CompleteProfile isEditing={true} userOverride={user} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PersonalDashboardViewOverride({ userOverride }: { userOverride: UserType }) {
  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 p-8 rounded-2xl border border-white/10">
        <h3 className="text-xl font-bold text-white mb-6">Editar Perfil do Personal</h3>
        <CompleteProfile isEditing={true} userOverride={userOverride} />
      </div>
    </div>
  );
}

function ClientDashboardViewOverride({ userOverride }: { userOverride: UserType }) {
  return (
    <div className="space-y-6">
      <div className="bg-neutral-900 p-8 rounded-2xl border border-white/10">
        <h3 className="text-xl font-bold text-white mb-6">Editar Perfil do Aluno</h3>
        <CompleteProfile isEditing={true} userOverride={userOverride} />
      </div>
      <div className="bg-neutral-900 p-8 rounded-2xl border border-white/10">
        <h3 className="text-xl font-bold text-white mb-6">Treinos do Aluno</h3>
        <ClientWorkoutsTab userOverride={userOverride} />
      </div>
    </div>
  );
}

function SystemBanner() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "system_messages"), where("active", "==", true));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const storageKey = `system_msg_views_${user.id}`;
      const viewStats = JSON.parse(localStorage.getItem(storageKey) || "{}");
      const msgs = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(msg => (viewStats[msg.id] || 0) < 3);
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, "system_messages");
    });
    return () => unsubscribe();
  }, [user]);

  const dismissMessage = (msgId: string) => {
    if (!user) return;
    const storageKey = `system_msg_views_${user.id}`;
    const viewStats = JSON.parse(localStorage.getItem(storageKey) || "{}");
    viewStats[msgId] = (viewStats[msgId] || 0) + 1;
    localStorage.setItem(storageKey, JSON.stringify(viewStats));
    setMessages(prev => prev.filter(m => m.id !== msgId));
  };

  if (messages.length === 0) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[1000] flex flex-col gap-1">
      {messages.map((msg) => (
        <div key={msg.id} className="bg-orange-600 text-white px-4 py-2 text-center text-xs font-bold shadow-lg flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          {msg.text}
          <button 
            onClick={() => dismissMessage(msg.id)}
            className="ml-4 hover:bg-white/20 p-1 rounded"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      ))}
    </div>
  );
}

function Dashboard() {
  const { user, loading, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("home");
  const [showDeleteAccountModal, setShowDeleteAccountModal] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      const userAuth = auth.currentUser;
      if (userAuth) {
        const uid = userAuth.uid;
        const email = userAuth.email?.trim().toLowerCase();

        console.log("Starting account deletion for UID:", uid, "Email:", email);

        // 1. Fetch all related documents to delete
        // We delete connections, workouts, assessments, and invitations to ensure no orphans
        const [connSnap, connSnap2, workSnap, workSnap2, asseSnap, asseSnap2, invSnap, invSnap2, invSnap3] = await Promise.all([
          getDocs(query(collection(db, "connections"), where("studentId", "==", uid))),
          getDocs(query(collection(db, "connections"), where("personalId", "==", uid))),
          getDocs(query(collection(db, "workouts"), where("studentId", "==", uid))),
          getDocs(query(collection(db, "workouts"), where("personalId", "==", uid))),
          getDocs(query(collection(db, "assessments"), where("studentId", "==", uid))),
          getDocs(query(collection(db, "assessments"), where("personalId", "==", uid))),
          getDocs(query(collection(db, "invitations"), where("studentId", "==", uid))),
          getDocs(query(collection(db, "invitations"), where("personalId", "==", uid))),
          getDocs(query(collection(db, "invitations"), where("studentEmail", "==", email || "")))
        ]);

        console.log(`Found documents to delete: 
          Connections: ${connSnap.size + connSnap2.size}, 
          Workouts: ${workSnap.size + workSnap2.size}, 
          Assessments: ${asseSnap.size + asseSnap2.size}, 
          Invitations: ${invSnap.size + invSnap2.size + invSnap3.size}`);

        // 2. Prepare batch deletion
        const batch = writeBatch(db);
        
        // Delete profile documents
        batch.delete(doc(db, "users_public", uid));
        batch.delete(doc(db, "users_private", uid));
        
        if (email) {
          batch.delete(doc(db, "user_emails", email));
        }

        // Add all fetched documents to batch
        const allSnaps = [connSnap, connSnap2, workSnap, workSnap2, asseSnap, asseSnap2, invSnap, invSnap2, invSnap3];
        allSnaps.forEach(snap => {
          snap.docs.forEach(d => batch.delete(d.ref));
        });

        // 3. Commit Firestore changes
        await batch.commit().catch(err => {
          console.error("Firestore batch commit failed:", err);
          handleFirestoreError(err, OperationType.WRITE, "account_cleanup");
        });
        
        console.log("Firestore data deleted successfully");

        // 4. Delete from Auth
        await deleteUser(userAuth);
        console.log("Auth user deleted successfully");
        
        setShowDeleteAccountModal(false);
        window.location.href = "/login";
      }
    } catch (err: any) {
      console.error("Delete account error:", err);
      if (err.code === "auth/requires-recent-login") {
        alert("Para sua segurança, você precisa ter feito login recentemente para excluir sua conta. Por favor, saia e entre novamente antes de tentar excluir.");
      } else {
        let errorMessage = "Ocorreu um erro ao excluir sua conta. Tente novamente mais tarde.";
        try {
          // If it's a JSON string from our error handler, try to parse it
          const parsed = JSON.parse(err.message);
          if (parsed.error?.includes("permissions")) {
            errorMessage = "Erro de permissão ao excluir conta. Por favor, tente sair e entrar novamente.";
          }
        } catch {
          if (err.message?.includes("permissions")) {
            errorMessage = "Erro de permissão ao excluir conta. Por favor, tente sair e entrar novamente.";
          }
        }
        alert(errorMessage);
      }
    } finally {
      setIsDeletingAccount(false);
    }
  };

  useEffect(() => {
    if (!user || user.role === 'superadmin') return;
  }, [user]);

  // Migration logic for legacy connections
  useEffect(() => {
    if (!user || user.role !== 'student' || !user.personalId) return;

    const migrateLegacyConnection = async () => {
      const connectionId = `${user.personalId}_${user.id}`;
      const connRef = doc(db, "connections", connectionId);
      
      try {
        const connSnap = await getDoc(connRef);
        if (!connSnap.exists()) {
          console.log("Migrating legacy connection for user:", user.id);
          await setDoc(connRef, {
            personalId: user.personalId,
            studentId: user.id,
            status: "active",
            createdAt: new Date().toISOString(),
            migrated: true
          });
        }
      } catch (error) {
        console.error("Error migrating legacy connection:", error);
      }
    };

    migrateLegacyConnection();
  }, [user]);

  // Se estiver carregando OU se estiver logado no Firebase mas o perfil ainda não chegou do Firestore
  if (loading || (auth.currentUser && !user)) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-neutral-200">
        <div className="w-12 h-12 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium animate-pulse">Sincronizando seu perfil...</p>
      </div>
    );
  }

  if (!user && !auth.currentUser) {
    return <Navigate to="/login" />;
  }

  if (!user.profileCompleted) {
    return <CompleteProfile />;
  }

  return (
    <div className="min-h-screen bg-neutral-950 font-sans text-neutral-200 pb-20 sm:pb-0">
      <SystemBanner />
      <nav className="bg-neutral-900 border-b border-white/10 sticky top-0 z-10 hidden sm:block">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-8">
              <button onClick={() => setActiveTab("home")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <img src="https://i.imgur.com/fxOHjtK.png" alt="Track & Health Logo" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
                <span className="font-bold text-xl tracking-tight text-white">Track & Health</span>
              </button>
              
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setActiveTab("home")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "home" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
                >
                  Rede
                </button>
                <button 
                  onClick={() => setActiveTab("workouts")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "workouts" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
                >
                  Treinos
                </button>
                {user.role === "student" && (
                  <>
                    <button 
                      onClick={() => setActiveTab("history")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "history" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
                    >
                      Histórico
                    </button>
                    <button 
                      onClick={() => setActiveTab("assessments")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "assessments" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
                    >
                      Avaliações
                    </button>
                    <button 
                      onClick={() => setActiveTab("subscriptions")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "subscriptions" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
                    >
                      Assinaturas
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={() => setActiveTab("profile")}
                className="flex items-center gap-3 hover:bg-white/5 p-1 pr-3 rounded-full transition-colors"
              >
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-orange-500/50" />
                ) : (
                  <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-sm font-bold text-orange-500">
                    {(user.displayName || user.name)?.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="text-sm text-left hidden md:block">
                  <div className="font-medium text-white">{user.displayName || user.name}</div>
                  <div className="text-neutral-500 capitalize text-xs">{user.role}</div>
                </div>
              </button>
              <button
                onClick={logout}
                className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-full transition-colors ml-2"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="sm:hidden bg-neutral-900 border-b border-white/10 sticky top-0 z-10 px-4 h-16 flex items-center justify-between">
        <button onClick={() => setActiveTab("home")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img src="https://i.imgur.com/fxOHjtK.png" alt="Track & Health Logo" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
          <span className="font-bold text-xl tracking-tight text-white">Track & Health</span>
        </button>
        <div className="flex items-center gap-3">
          {user.photoUrl ? (
            <img src={user.photoUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-orange-500/50" />
          ) : (
            <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-sm font-bold text-orange-500">
              {(user.displayName || user.name)?.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          <button
            onClick={logout}
            className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === "home" && (
          user.role === "superadmin" ? <SuperAdminDashboard /> :
          user.role === "personal" ? <PersonalDashboard /> : 
          <ClientDashboard onViewAllWorkouts={() => setActiveTab("workouts")} onViewSubscriptions={() => setActiveTab("subscriptions")} />
        )}
        {activeTab === "workouts" && (user.role === "student" ? (
          <ClientWorkoutsTab />
        ) : (
          <div className="bg-neutral-900 p-12 rounded-2xl border border-white/10 text-center">
            <Activity className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">Treinos</h3>
            <p className="text-neutral-500">
              {user.role === "superadmin" ? "Acesse o painel de administração para gerenciar treinos." : "Selecione um aluno na tela inicial para montar treinos."}
            </p>
          </div>
        ))}
        {activeTab === "history" && user.role === "student" && (
          <ClientHistoryTab />
        )}
        {activeTab === "assessments" && user.role === "student" && (
          <AssessmentView 
            clientId={user.id} 
            clientName={user.name} 
            onBack={() => setActiveTab("home")} 
            isPersonal={false} 
          />
        )}
        {activeTab === "subscriptions" && user.role === "student" && (
          <SubscriptionsView onBack={() => setActiveTab("home")} />
        )}
        {activeTab === "profile" && (
          <div className="bg-neutral-900 p-8 rounded-2xl border border-white/10 max-w-2xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              {user.photoUrl ? (
                <img src={user.photoUrl} alt="Profile" className="w-20 h-20 rounded-full object-cover border-2 border-orange-500" />
              ) : (
                <div className="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center text-3xl font-bold text-orange-500">
                  {(user.displayName || user.name)?.charAt(0).toUpperCase() || '?'}
                </div>
              )}
              <div>
                <h3 className="text-2xl font-bold text-white">{user.displayName || user.name}</h3>
                <p className="text-neutral-400">{user.email}</p>
                <div className="flex gap-2 mt-2">
                  <span className="px-3 py-1 bg-neutral-800 text-neutral-300 rounded-full text-xs font-medium capitalize">
                    {user.role}
                  </span>
                  {user.role === "personal" && user.personalCode && (
                    <span className="px-3 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full text-xs font-medium">
                      Código: {user.personalCode}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="border-t border-white/10 pt-8">
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-lg font-medium text-white">Status do Sistema</h4>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  <span className="text-xs text-neutral-400">Banco Conectado</span>
                </div>
              </div>
              
              <h4 className="text-lg font-medium text-white mb-6">Atualizar Cadastro</h4>
              <CompleteProfile isEditing={true} />

              <div className="mt-12 pt-8 border-t border-red-500/20">
                <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <h4 className="text-lg font-medium text-red-500">Zona de Perigo</h4>
                  </div>
                  <p className="text-sm text-neutral-400 mb-6">
                    Ao excluir sua conta, todos os seus dados, treinos e conexões serão removidos permanentemente. Esta ação não pode ser desfeita.
                  </p>
                  <button
                    onClick={() => setShowDeleteAccountModal(true)}
                    className="w-full bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-500/50 font-bold py-3 rounded-xl transition-all"
                  >
                    Excluir Minha Conta
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Bottom Navigation */}
      <div className="sm:hidden fixed bottom-0 left-0 right-0 bg-neutral-900 border-t border-white/10 pb-safe">
        <div className="flex justify-around items-center h-16 px-2">
          <button 
            onClick={() => {
              setActiveTab("home");
            }}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === "home" ? "text-orange-500" : "text-neutral-500"}`}
          >
            <div className="relative">
              <Users className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-medium">Rede</span>
          </button>
          <button 
            onClick={() => setActiveTab("workouts")}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === "workouts" ? "text-orange-500" : "text-neutral-500"}`}
          >
            <Activity className="w-5 h-5" />
            <span className="text-[10px] font-medium">Treinos</span>
          </button>
          {user.role === "student" && (
            <button 
              onClick={() => setActiveTab("history")}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === "history" ? "text-orange-500" : "text-neutral-500"}`}
            >
              <History className="w-5 h-5" />
              <span className="text-[10px] font-medium">Histórico</span>
            </button>
          )}
          {user.role === "student" && (
            <button 
              onClick={() => setActiveTab("assessments")}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === "assessments" ? "text-orange-500" : "text-neutral-500"}`}
            >
              <Activity className="w-5 h-5" />
              <span className="text-[10px] font-medium">Avaliações</span>
            </button>
          )}
          <button 
            onClick={() => setActiveTab("profile")}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === "profile" ? "text-orange-500" : "text-neutral-500"}`}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-medium">Perfil</span>
          </button>
        </div>
      </div>

      {/* Delete Account Confirmation Modal */}
      {showDeleteAccountModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-neutral-900 border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Confirmar Exclusão</h3>
              <p className="text-neutral-400 mb-8 leading-relaxed">
                Tem certeza que deseja excluir sua conta permanentemente? Esta ação não pode ser desfeita e todos os seus dados serão removidos.
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount}
                  className="w-full py-4 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-red-600/20"
                >
                  {isDeletingAccount ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                      Excluindo...
                    </>
                  ) : (
                    "Sim, Excluir Permanentemente"
                  )}
                </button>
                <button
                  onClick={() => setShowDeleteAccountModal(false)}
                  disabled={isDeletingAccount}
                  className="w-full py-4 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white rounded-2xl font-bold transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubscriptionsView({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 text-neutral-400 hover:text-white hover:bg-white/5 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-3xl font-black text-white tracking-tight">Assinaturas e Pagamentos</h2>
          <p className="text-neutral-500 text-sm">Gerencie seu plano e formas de pagamento.</p>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="bg-neutral-900 p-8 rounded-2xl border border-white/10 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-white">Plano Premium</h3>
              <p className="text-neutral-500 text-sm">Acesso total a treinos e avaliações.</p>
            </div>
            <span className="bg-emerald-500/10 text-emerald-400 px-4 py-1 rounded-full text-xs font-bold border border-emerald-500/20">
              Ativo
            </span>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-white/5">
              <span className="text-neutral-400">Próximo pagamento</span>
              <span className="text-white font-medium">15 de Abril, 2026</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-white/5">
              <span className="text-neutral-400">Valor</span>
              <span className="text-white font-medium">R$ 89,90/mês</span>
            </div>
          </div>

          <button className="w-full mt-8 bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-orange-600/20">
            Alterar Plano
          </button>
        </div>

        <div className="bg-neutral-900 p-8 rounded-2xl border border-white/10 shadow-2xl">
          <h3 className="text-xl font-bold text-white mb-6">Formas de Pagamento</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-neutral-800 rounded flex items-center justify-center border border-white/10">
                  <span className="text-[10px] font-bold text-white">VISA</span>
                </div>
                <div>
                  <p className="text-white font-medium">•••• •••• •••• 4242</p>
                  <p className="text-neutral-500 text-xs">Expira em 12/28</p>
                </div>
              </div>
              <span className="text-xs font-bold text-orange-500">Principal</span>
            </div>

            <button className="w-full flex items-center justify-center gap-2 p-4 border border-dashed border-white/20 rounded-xl text-neutral-400 hover:text-white hover:border-white/40 transition-all">
              <Plus className="w-5 h-5" />
              <span className="font-bold text-sm">Adicionar Cartão</span>
            </button>
          </div>
        </div>

        <div className="bg-neutral-900 p-8 rounded-2xl border border-white/10 shadow-2xl">
          <h3 className="text-xl font-bold text-white mb-6">Histórico de Faturas</h3>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-4 hover:bg-white/5 rounded-xl transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-neutral-800 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-neutral-500 group-hover:text-orange-500 transition-colors" />
                  </div>
                  <div>
                    <p className="text-white font-medium">Fatura #00{i}</p>
                    <p className="text-neutral-500 text-xs">Pago em 15/{i+1}/2026</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white font-bold">R$ 89,90</p>
                  <button className="text-orange-500 text-xs font-bold hover:underline">Download PDF</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<Navigate to="/" replace />} />
            <Route path="/" element={<Dashboard />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
