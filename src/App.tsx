import { useState, useEffect, useRef, createContext, useContext, ReactNode, FormEvent, ChangeEvent } from "react";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { User, LogOut, Users, Dumbbell, Activity, Search, Plus, ArrowLeft, Clock, Play, Check, Trash2, ChevronLeft, ChevronRight, Calendar as CalendarIcon, AlertTriangle, Image as ImageIcon, Video, Upload, X, Copy, Edit2, MessageSquare, CheckCircle2, Circle, GripVertical, Send, CreditCard, FileText, Sun, Moon } from "lucide-react";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { auth, db } from "./firebase";
import { EXERCISES } from "./data/exercises";
import { AssessmentView } from "./components/AssessmentView";
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
  writeBatch
} from "firebase/firestore";

type UserType = {
  id: string;
  name: string;
  email: string;
  role: "personal" | "client";
  personalCode?: string;
  profileCompleted?: boolean;
  displayName?: string;
  photoUrl?: string;
  [key: string]: any; // Allow other properties like anamnesis, cpf, etc.
};

const AuthContext = createContext<{
  user: UserType | null;
  loading: boolean;
  logout: () => void;
  updateUser: (data: Partial<UserType>) => void;
}>({
  user: null,
  loading: true,
  logout: () => {},
  updateUser: () => {},
});

const ThemeContext = createContext<{
  theme: "light" | "dark";
  toggleTheme: () => void;
}>({
  theme: "dark",
  toggleTheme: () => {},
});

function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    const saved = localStorage.getItem("theme");
    return (saved as "light" | "dark") || "dark";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme() {
  return useContext(ThemeContext);
}

function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    console.log("AuthProvider: Iniciando monitoramento...");
    
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        console.log("AuthProvider: Autenticado no Firebase Auth:", firebaseUser.uid);
        
        const userDocRef = doc(db, "users", firebaseUser.uid);
        const unsubscribeDoc = onSnapshot(userDocRef, (docSnap) => {
          if (docSnap.exists()) {
            console.log("AuthProvider: Perfil encontrado no Firestore.");
            setUser({ id: firebaseUser.uid, ...docSnap.data() } as UserType);
            setAuthError(null);
          } else {
            console.warn("AuthProvider: Perfil ainda não existe no Firestore.");
            setUser(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("AuthProvider: Erro no Firestore Snapshot:", error);
          setAuthError(`Erro de Banco de Dados: ${error.message}`);
          setLoading(false);
        });

        return () => unsubscribeDoc();
      } else {
        console.log("AuthProvider: Nenhum usuário logado.");
        setUser(null);
        setLoading(false);
      }
    }, (error) => {
      console.error("AuthProvider: Erro no Auth State:", error);
      setAuthError(`Erro de Autenticação: ${error.message}`);
      setLoading(false);
    });

    return () => unsubscribeAuth();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error("Erro ao deslogar:", error);
    }
  };

  const updateUser = (data: Partial<UserType>) => {
    if (user) {
      setUser({ ...user, ...data });
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, updateUser }}>
      {authError && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white p-2 text-center text-xs z-[9999]">
          {authError} - Tente atualizar a página.
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

function useAuth() {
  return useContext(AuthContext);
}

function Login() {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<"personal" | "client">("client");
  const [personalCode, setPersonalCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user, loading } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
        
        if (role === "client" && personalCode.trim() !== "") {
          const q = query(collection(db, "users"), where("role", "==", "personal"), where("personalCode", "==", personalCode.trim().toUpperCase()));
          const querySnapshot = await getDocs(q);
          if (querySnapshot.empty) {
            setError("Código do personal inválido.");
            setIsSubmitting(false);
            return;
          }
          foundPersonalId = querySnapshot.docs[0].id;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const uid = userCredential.user.uid;

        let newPersonalCode = "";
        if (role === "personal") {
          newPersonalCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        }

        await setDoc(doc(db, "users", uid), {
          name,
          email,
          role,
          profileCompleted: false,
          createdAt: new Date().toISOString(),
          ...(role === "personal" && { personalCode: newPersonalCode })
        });

        if (foundPersonalId) {
          await addDoc(collection(db, "connections"), {
            personal_id: foundPersonalId,
            client_id: uid,
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
    return <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex items-center justify-center text-neutral-900 dark:text-white">Carregando...</div>;
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center p-4 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <div className="absolute top-4 right-4">
        <button
          onClick={toggleTheme}
          className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
          title={theme === "dark" ? "Modo Claro" : "Modo Escuro"}
        >
          {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
      </div>
      <div className="bg-white dark:bg-neutral-900 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-neutral-200 dark:border-white/10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="bg-blue-500/10 p-2 rounded-2xl">
              <img src="https://i.imgur.com/fxOHjtK.png" alt="Track & Health Logo" className="w-16 h-16 object-contain" referrerPolicy="no-referrer" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-neutral-900 dark:text-white tracking-tight">Track & Health</h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400 mt-1 italic">Monitoramento em Saúde</p>
        </div>
        <h2 className="text-xl font-bold text-neutral-900 dark:text-white text-center mb-6">
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
              <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Nome Completo</label>
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
                  onClick={() => setRole("client")}
                  className={`py-3 px-4 rounded-xl border transition-all ${
                    role === "client"
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

          {!isLogin && !isForgotPassword && role === "client" && (
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

function CustomCalendar({ selectedDate, onSelectDate }: { selectedDate: string, onSelectDate: (date: string) => void }) {
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

    days.push(
      <button
        key={i}
        onClick={() => onSelectDate(dateString)}
        className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors
          ${isSelected ? 'bg-orange-600 text-white shadow-lg shadow-orange-600/30' : 
            isToday ? 'bg-white/10 text-emerald-400 border border-emerald-500/30' : 
            'text-neutral-400 hover:bg-white/10 hover:text-white'}`}
      >
        {i}
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

function WorkoutBuilder({ client, onBack, existingWorkout }: { client: any, onBack: () => void, existingWorkout?: any }) {
  const { user } = useAuth();
  const [exercises, setExercises] = useState<any[]>(existingWorkout?.exercises || []);
  const [currentExercise, setCurrentExercise] = useState("");
  const [sets, setSets] = useState("3");
  const [reps, setReps] = useState("10");
  const [rest, setRest] = useState("60"); // seconds
  const [prescription, setPrescription] = useState(""); // For cardio
  const [workoutDate, setWorkoutDate] = useState(
    existingWorkout?.date 
      ? new Date(existingWorkout.date).toISOString().split('T')[0] 
      : new Date().toISOString().split('T')[0]
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showExerciseList, setShowExerciseList] = useState(false);
  const [media, setMedia] = useState<{ url: string, type: 'image' | 'video' } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pastWorkouts, setPastWorkouts] = useState<any[]>([]);
  const [showCopyModal, setShowCopyModal] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchPastWorkouts();
  }, [client.id]);

  const fetchPastWorkouts = async () => {
    if (!user) return;
    try {
      const q = query(
        collection(db, "workouts"),
        where("client_id", "==", client.id),
        where("personal_id", "==", user.id)
      );
      const querySnapshot = await getDocs(q);
      const workoutsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
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
      await deleteDoc(doc(db, "workouts", id));
      alert("Treino excluído com sucesso!");
      onBack();
    } catch (error: any) {
      console.error("Error deleting workout:", error);
      alert("Erro ao excluir treino: " + (error.message || "Verifique suas permissões."));
    }
  };

  const saveWorkout = async () => {
    if (exercises.length === 0 || !user) return;
    setIsSaving(true);
    try {
      // Create a date object from the selected date string, setting time to noon to avoid timezone issues
      const dateObj = new Date(`${workoutDate}T12:00:00Z`);
      
      const workoutData = {
        personal_id: user.id,
        client_id: client.id,
        date: dateObj.toISOString(),
        exercises,
        status: existingWorkout?.status || "active"
      };

      if (existingWorkout?.id) {
        await updateDoc(doc(db, "workouts", existingWorkout.id), workoutData);
        alert("Treino atualizado com sucesso!");
      } else {
        await addDoc(collection(db, "workouts"), workoutData);
        alert("Treino salvo com sucesso!");
      }
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
        <button onClick={onBack} className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-neutral-900 dark:text-white" />
        </button>
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">
            {existingWorkout ? "Editar Treino" : "Montar Treino"}
          </h2>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">Aluno: <span className="text-orange-600 dark:text-orange-500 font-medium">{client.name}</span></p>
        </div>
        <div className="ml-auto">
          <button 
            onClick={() => setShowCopyModal(true)}
            className="flex items-center gap-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white px-4 py-2 rounded-xl border border-neutral-200 dark:border-white/10 transition-colors text-sm font-medium"
          >
            <Copy className="w-4 h-4 text-orange-600 dark:text-orange-500" />
            Copiar de treino anterior
          </button>
        </div>
      </div>

      {showCopyModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-neutral-900 w-full max-w-lg rounded-3xl border border-neutral-200 dark:border-white/10 shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
            <div className="p-6 border-b border-neutral-100 dark:border-white/10 flex justify-between items-center">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Selecionar Treino Anterior</h3>
              <button onClick={() => setShowCopyModal(false)} className="p-2 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors">
                <X className="w-6 h-6 text-neutral-500 dark:text-neutral-400" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 space-y-3">
              {pastWorkouts.length === 0 ? (
                <div className="text-center py-12">
                  <Activity className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
                  <p className="text-neutral-500">Nenhum treino anterior encontrado para este aluno.</p>
                </div>
              ) : (
                pastWorkouts.map((workout) => (
                  <button
                    key={workout.id}
                    onClick={() => copyWorkout(workout)}
                    className="w-full text-left bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 p-4 rounded-2xl border border-neutral-200 dark:border-white/5 hover:border-orange-500/50 transition-all group"
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-neutral-900 dark:text-white font-medium">Treino de {new Date(workout.date).toLocaleDateString('pt-BR')}</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">{workout.exercises.length} exercícios</p>
                      </div>
                      <ChevronRight className="w-5 h-5 text-neutral-400 dark:text-neutral-600 group-hover:text-orange-600 dark:group-hover:text-orange-500 transition-colors" />
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {workout.exercises.slice(0, 3).map((ex: any, i: number) => (
                        <span key={i} className="text-[10px] bg-white dark:bg-neutral-900 text-neutral-500 dark:text-neutral-400 px-2 py-1 rounded-md border border-neutral-200 dark:border-white/5">
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
            <div className="p-6 border-t border-neutral-100 dark:border-white/10 bg-neutral-50 dark:bg-neutral-900/50">
              <button
                onClick={() => setShowCopyModal(false)}
                className="w-full py-3 bg-neutral-200 dark:bg-neutral-800 hover:bg-neutral-300 dark:hover:bg-neutral-700 text-neutral-900 dark:text-white rounded-xl font-medium transition-colors"
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
          <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-neutral-900 dark:text-white">Adicionar Exercício</h3>
              <span className="text-sm text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 px-3 py-1 rounded-full">
                {new Date(workoutDate + "T12:00:00Z").toLocaleDateString('pt-BR')}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
              <div className={isCardio ? "md:col-span-5 relative" : "md:col-span-4 relative"}>
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Exercício</label>
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
                  className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600"
                  placeholder="Ex: Supino Reto"
                />
                {showExerciseList && currentExercise && (
                  <div className="absolute z-10 w-full mt-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
                    {filteredExercises.length > 0 ? (
                      filteredExercises.map((ex, i) => (
                        <div 
                          key={i} 
                          className="px-4 py-2 hover:bg-orange-600/20 cursor-pointer text-neutral-900 dark:text-white text-sm"
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
                  <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Prescrição</label>
                  <input
                    type="text"
                    value={prescription}
                    onChange={(e) => setPrescription(e.target.value)}
                    className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600"
                    placeholder="Ex: 20 min, moderado"
                  />
                </div>
              ) : (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Séries</label>
                    <input
                      type="text"
                      value={sets}
                      onChange={(e) => setSets(e.target.value)}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600 text-center"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Reps</label>
                    <input
                      type="text"
                      value={reps}
                      onChange={(e) => setReps(e.target.value)}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600 text-center"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1">Desc. (s)</label>
                    <input
                      type="number"
                      value={rest}
                      onChange={(e) => setRest(e.target.value)}
                      className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600 text-center"
                    />
                  </div>
                </>
              )}

              <div className="md:col-span-1">
                <label className="block text-sm font-medium text-neutral-500 dark:text-neutral-400 mb-1 text-center">Mídia</label>
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
                    className={`w-full h-[50px] bg-neutral-50 dark:bg-neutral-800 border-2 border-dashed ${media ? 'border-orange-600' : 'border-neutral-200 dark:border-white/10'} rounded-xl flex items-center justify-center cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-all group overflow-hidden`}
                  >
                    {isUploading ? (
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-600"></div>
                    ) : media ? (
                      media.type === 'image' ? (
                        <img src={media.url} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <Video className="w-5 h-5 text-orange-600 dark:text-orange-500" />
                      )
                    ) : (
                      <Upload className="w-5 h-5 text-neutral-400 dark:text-neutral-500 group-hover:text-orange-600 dark:group-hover:text-orange-500" />
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
                <div className="md:col-span-7 bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-500 text-xs p-3 rounded-xl flex items-center gap-2 animate-pulse">
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
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-neutral-100 dark:border-white/10 flex justify-between items-center">
                <h3 className="text-lg font-medium text-neutral-900 dark:text-white">Exercícios do Treino</h3>
                <span className="bg-neutral-50 dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-full text-sm font-medium border border-neutral-200 dark:border-white/10">
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
                                className={`p-4 flex items-center justify-between transition-colors ${snapshot.isDragging ? 'bg-neutral-50 dark:bg-neutral-800 shadow-2xl z-50' : 'hover:bg-neutral-50 dark:hover:bg-white/5'}`}
                              >
                                <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                                  <div 
                                    {...provided.dragHandleProps}
                                    className="text-neutral-400 dark:text-neutral-600 hover:text-neutral-600 dark:hover:text-neutral-400 cursor-grab active:cursor-grabbing p-1 shrink-0"
                                  >
                                    <GripVertical className="w-5 h-5" />
                                  </div>
                                  <div className="w-8 h-8 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center text-sm font-bold text-neutral-500 dark:text-neutral-400 shrink-0 border border-neutral-200 dark:border-white/10">
                                    {index + 1}
                                  </div>
                                  {ex.media && (
                                    <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-800 rounded-lg overflow-hidden border border-neutral-200 dark:border-white/10 shrink-0">
                                      {ex.media.type === 'image' ? (
                                        <img src={ex.media.url} alt="" className="w-full h-full object-cover" />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-orange-600/10">
                                          <Video className="w-5 h-5 text-orange-600 dark:text-orange-500" />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <h4 className="font-medium text-neutral-900 dark:text-white truncate">{ex.name}</h4>
                                    <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-neutral-500 dark:text-neutral-400 mt-1 overflow-x-auto no-scrollbar">
                                      {ex.isCardio ? (
                                        <span className="text-orange-600 dark:text-orange-400 italic whitespace-nowrap">{ex.prescription || "Sem prescrição"}</span>
                                      ) : (
                                        <>
                                          <span className="whitespace-nowrap">{ex.sets} séries</span>
                                          <span className="w-1 h-1 bg-neutral-300 dark:bg-neutral-600 rounded-full shrink-0"></span>
                                          <span className="whitespace-nowrap">{ex.reps} reps</span>
                                          <span className="w-1 h-1 bg-neutral-300 dark:bg-neutral-600 rounded-full shrink-0"></span>
                                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 whitespace-nowrap"><Clock className="w-3 h-3" /> {ex.rest}s</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                                <button 
                                  onClick={() => removeExercise(ex.id)}
                                  className="p-2 text-neutral-400 dark:text-neutral-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 ml-2"
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

              <div className="p-6 bg-white dark:bg-neutral-900 border-t border-neutral-100 dark:border-white/10 flex flex-col sm:flex-row gap-4">
                {existingWorkout && (
                  <button
                    type="button"
                    onClick={() => deleteWorkout(existingWorkout.id)}
                    className="flex-1 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-500 font-bold py-4 rounded-xl transition-all flex items-center justify-center gap-2 border border-red-500/20 order-2 sm:order-1"
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

function WorkoutHistory({ client, onBack }: { client: any, onBack: () => void }) {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [editingWorkout, setEditingWorkout] = useState<any>(null);

  useEffect(() => {
    fetchWorkouts();
  }, [client.id]);

  const fetchWorkouts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, "workouts"), 
        where("client_id", "==", client.id),
        where("personal_id", "==", user.id)
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
            className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-neutral-900 dark:text-white" />
          </button>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Detalhes do Treino</h2>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl transition-colors">
          <ArrowLeft className="w-5 h-5 text-neutral-900 dark:text-white" />
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Histórico de Treinos</h2>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Aluno: <span className="text-orange-600 dark:text-orange-500 font-medium">{client.name}</span></p>
          </div>
          {workouts.length > 0 && (
            <button 
              onClick={clearAllHistory}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-600 dark:text-red-500 hover:text-white border border-red-500/20 rounded-xl transition-all text-sm font-medium"
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
      ) : workouts.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 p-12 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl text-center">
          <Activity className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-neutral-900 dark:text-white mb-2">Nenhum treino encontrado</h3>
          <p className="text-neutral-500">Este aluno ainda não possui treinos registrados.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {workouts.map((workout) => (
            <div 
              key={workout.id}
              className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl flex items-center justify-between hover:border-orange-600/50 transition-colors group"
            >
              <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => setSelectedWorkout(workout)}>
                <div className="w-12 h-12 bg-orange-600/10 rounded-full flex items-center justify-center">
                  <CalendarIcon className="w-6 h-6 text-orange-600 dark:text-orange-500" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-neutral-900 dark:text-white">
                    Treino de {new Date(workout.date).toLocaleDateString('pt-BR')}
                  </h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    {workout.exercises.length} exercícios • Status: {workout.status === 'active' ? (
                      <span className="text-blue-600 dark:text-blue-400">Ativo</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 inline-flex">
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
      )}
    </div>
  );
}

interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  createdAt: any;
}

function ChatModal({ 
  roomId, 
  recipientName, 
  onClose 
}: { 
  roomId: string; 
  recipientName: string; 
  onClose: () => void; 
}) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [newMessageReceived, setNewMessageReceived] = useState(false);
  const isInitialLoad = useRef(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const q = query(
      collection(db, "chats", roomId, "messages"),
      orderBy("createdAt", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ChatMessage[];
      
      // Use docChanges to detect NEW messages specifically
      if (!isInitialLoad.current) {
        const hasNewIncoming = snapshot.docChanges().some(change => 
          change.type === "added" && (change.doc.data() as any).senderId !== user?.id
        );

        if (hasNewIncoming) {
          // Sound signal
          const audio = new Audio('https://cdn.pixabay.com/audio/2022/03/10/audio_c35078174a.mp3');
          audio.volume = 0.5;
          audio.play().catch(e => console.log("Audio play blocked by browser policy", e));
          
          // Visual signal
          setNewMessageReceived(true);
          setTimeout(() => setNewMessageReceived(false), 2000);
        }
      }
      
      setMessages(msgs);
      setLoading(false);
      isInitialLoad.current = false;
    });

    return () => unsubscribe();
  }, [roomId, user?.id]);

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !user) return;

    try {
      await addDoc(collection(db, "chats", roomId, "messages"), {
        text: newMessage,
        senderId: user.id,
        createdAt: serverTimestamp()
      });
      setNewMessage("");
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
    }
  };

  const endChat = async () => {
    if (!window.confirm("Ao fechar ou encerrar, todo o histórico deste chat será APAGADO permanentemente. Deseja continuar?")) return;
    
    try {
      const q = query(collection(db, "chats", roomId, "messages"));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
      });
      
      await batch.commit();
      onClose();
    } catch (err) {
      console.error("Erro ao encerrar chat:", err);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-neutral-900 w-full max-w-lg h-[600px] max-h-[90vh] rounded-3xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className={`p-4 border-b border-white/10 flex items-center justify-between bg-neutral-950 transition-all duration-500 ${newMessageReceived ? 'bg-orange-600/30' : ''}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 bg-orange-600/20 rounded-full flex items-center justify-center text-orange-500 font-bold transition-transform duration-300 ${newMessageReceived ? 'scale-110' : ''}`}>
              {recipientName.charAt(0).toUpperCase()}
            </div>
            <div>
              <h3 className="text-white font-bold">{recipientName}</h3>
              <p className="text-[10px] text-emerald-500 flex items-center gap-1">
                <span className={`w-1.5 h-1.5 bg-emerald-500 rounded-full ${newMessageReceived ? 'animate-ping' : 'animate-pulse'}`}></span>
                {newMessageReceived ? 'Nova mensagem!' : 'Chat Temporário Ativo'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={endChat}
              className="flex items-center gap-2 text-xs bg-red-500/10 text-red-500 px-3 py-1.5 rounded-lg border border-red-500/20 hover:bg-red-500 hover:text-white transition-all font-bold"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Encerrar e Apagar
            </button>
            <button onClick={endChat} className="p-2 text-neutral-400 hover:text-white" title="Fechar e Apagar">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-900/50 scroll-smooth">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-orange-500"></div>
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-neutral-500 text-center space-y-2">
              <MessageSquare className="w-12 h-12 opacity-20" />
              <p className="text-sm">Inicie uma conversa segura.<br/>O histórico será apagado ao encerrar.</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div 
                key={msg.id} 
                className={`flex ${msg.senderId === user?.id ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${
                  msg.senderId === user?.id 
                    ? 'bg-orange-600 text-white rounded-tr-none' 
                    : 'bg-neutral-800 text-neutral-200 rounded-tl-none border border-white/5'
                }`}>
                  {msg.text}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Input */}
        <form onSubmit={sendMessage} className="p-4 bg-neutral-950 border-t border-white/10 flex gap-2">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Digite sua mensagem..."
            className="flex-1 bg-neutral-900 border border-white/5 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
          />
          <button 
            type="submit"
            disabled={!newMessage.trim()}
            className="bg-orange-600 text-white p-2 rounded-xl hover:bg-orange-500 disabled:opacity-50 transition-all"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
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
  const [clientTab, setClientTab] = useState<"workouts" | "history" | "assessments">("workouts");
  const [chatRoom, setChatRoom] = useState<{ id: string; name: string } | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [inviteStatus, setInviteStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

  useEffect(() => {
    if (user) {
      fetchClients();
      fetchAllClients();
    }
  }, [user]);

  const fetchClients = async () => {
    if (!user) return;
    const q = query(collection(db, "connections"), where("personal_id", "==", user.id));
    const querySnapshot = await getDocs(q);
    
    const clientPromises = querySnapshot.docs.map(async (connectionDoc) => {
      const data = connectionDoc.data();
      const clientDoc = await getDoc(doc(db, "users", data.client_id));
      return { 
        id: clientDoc.id, 
        ...clientDoc.data(), 
        status: data.status,
        connectionDate: data.createdAt || ""
      };
    });
    
    const clientsData = await Promise.all(clientPromises);
    setClients(clientsData);
  };

  const fetchAllClients = async () => {
    const q = query(collection(db, "users"), where("role", "==", "client"));
    const querySnapshot = await getDocs(q);
    const clientsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setAllClients(clientsData);
  };

  const addClient = async (clientId: string) => {
    try {
      // Check if connection already exists
      const q = query(
        collection(db, "connections"), 
        where("personal_id", "==", user?.id),
        where("client_id", "==", clientId)
      );
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        await addDoc(collection(db, "connections"), {
          personal_id: user?.id,
          client_id: clientId,
          status: "active",
          createdAt: new Date().toISOString()
        });
        fetchClients();
        setShowAdd(false);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleClientStatus = async (clientId: string, currentStatus: string) => {
    try {
      const q = query(
        collection(db, "connections"), 
        where("personal_id", "==", user?.id),
        where("client_id", "==", clientId)
      );
      const snapshot = await getDocs(q);
      
      if (!snapshot.empty) {
        const connectionDoc = snapshot.docs[0];
        const newStatus = currentStatus === "active" ? "blocked" : "active";
        await updateDoc(doc(db, "connections", connectionDoc.id), {
          status: newStatus
        });
        fetchClients();
      }
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
      // 1. Check if user already exists
      const q = query(collection(db, "users"), where("email", "==", inviteEmail.trim().toLowerCase()));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const clientUser = snapshot.docs[0];
        if (clientUser.data().role !== 'client') {
          setInviteStatus({ type: 'error', message: "Este email pertence a um Personal Trainer." });
          setIsInviting(false);
          return;
        }
        await addClient(clientUser.id);
        setInviteStatus({ type: 'success', message: "Aluno encontrado e conectado com sucesso!" });
      } else {
        // 2. Create a pending invitation
        await addDoc(collection(db, "invitations"), {
          personal_id: user.id,
          personal_name: user.displayName || user.name,
          email: inviteEmail.trim().toLowerCase(),
          status: "pending",
          createdAt: new Date().toISOString()
        });
        setInviteStatus({ type: 'success', message: "Convite enviado para o email informado!" });
      }
      setInviteEmail("");
    } catch (err) {
      console.error(err);
      setInviteStatus({ type: 'error', message: "Erro ao enviar convite. Tente novamente." });
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
        <div className="flex items-center justify-between gap-4 bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-xl">
          <div className="flex items-center gap-3">
            <button onClick={() => setSelectedClient(null)} className="p-2 hover:bg-neutral-100 dark:hover:bg-white/5 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5 text-neutral-900 dark:text-white" />
            </button>
            <div>
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white leading-tight">{selectedClient.displayName || selectedClient.name}</h2>
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider">Perfil do Aluno</p>
            </div>
          </div>
          <button
            onClick={() => setChatRoom({ id: `chat_${user?.id}_${selectedClient.id}`, name: selectedClient.displayName || selectedClient.name })}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl transition-all shadow-lg shadow-orange-600/20 font-bold text-sm"
          >
            <MessageSquare className="w-4 h-4" />
            Chat
          </button>
        </div>

        <div className="flex bg-white dark:bg-neutral-900 p-1 rounded-xl border border-neutral-200 dark:border-white/10 shadow-2xl w-full max-w-lg mx-auto mb-6">
          <button
            onClick={() => setClientTab("workouts")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${clientTab === "workouts" ? "bg-orange-600 text-white shadow-md" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"}`}
          >
            Novo Treino
          </button>
          <button
            onClick={() => setClientTab("history")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${clientTab === "history" ? "bg-orange-600 text-white shadow-md" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"}`}
          >
            Histórico
          </button>
          <button
            onClick={() => setClientTab("assessments")}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${clientTab === "assessments" ? "bg-orange-600 text-white shadow-md" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"}`}
          >
            Avaliações
          </button>
        </div>
        
        {clientTab === "workouts" ? (
          <WorkoutBuilder client={selectedClient} onBack={() => setSelectedClient(null)} />
        ) : clientTab === "history" ? (
          <WorkoutHistory client={selectedClient} onBack={() => setSelectedClient(null)} />
        ) : (
          <AssessmentView 
            clientId={selectedClient.id} 
            clientName={selectedClient.name} 
            onBack={() => setSelectedClient(null)} 
            isPersonal={true} 
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-neutral-900 p-6 rounded-3xl border border-neutral-200 dark:border-white/10 shadow-2xl text-center mb-8 bg-gradient-to-br from-white dark:from-neutral-900 to-neutral-50 dark:to-neutral-950">
        <h3 className="text-neutral-500 dark:text-neutral-400 text-xs font-medium mb-2 uppercase tracking-widest">Seu Código de Convite</h3>
        <div className="flex flex-col items-center gap-3">
          <div className="text-3xl font-black text-orange-500 font-mono tracking-tighter bg-orange-600/10 px-6 py-4 rounded-2xl border border-orange-500/20 shadow-[0_0_20px_rgba(249,115,22,0.1)]">
            {user?.personalCode}
          </div>
          <p className="text-neutral-500 dark:text-neutral-500 text-[10px] max-w-[180px] leading-relaxed">
            Compartilhe este código com seus alunos para que eles se conectem ao seu perfil.
          </p>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Meus Alunos</h2>
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
          className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white text-sm rounded-lg focus:ring-orange-600 focus:border-orange-600 block p-2.5"
        >
          <option value="name">Ordem Alfabética</option>
          <option value="date">Data de Cadastro</option>
        </select>
      </div>

      {showAdd && (
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl space-y-6">
          <div>
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-4">Convidar por Email</h3>
            <form onSubmit={sendInvite} className="flex gap-2">
              <input
                type="email"
                placeholder="email@aluno.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-2 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                required
              />
              <button
                type="submit"
                disabled={isInviting}
                className="bg-orange-600 hover:bg-orange-500 text-white px-6 py-2 rounded-xl font-bold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                {isInviting ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <Send className="w-4 h-4" />}
                Enviar
              </button>
            </form>
            {inviteStatus && (
              <p className={`mt-2 text-sm ${inviteStatus.type === 'success' ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                {inviteStatus.message}
              </p>
            )}
          </div>

          <div className="border-t border-neutral-100 dark:border-white/5 pt-6">
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white mb-4">Alunos Disponíveis</h3>
            <div className="grid gap-4">
              {allClients.filter(c => !clients.find(myClient => myClient.id === c.id)).map(client => (
                <div key={client.id} className="flex items-center justify-between bg-neutral-50 dark:bg-neutral-800 p-4 rounded-xl border border-neutral-200 dark:border-white/10">
                  <div>
                    <div className="font-medium text-neutral-900 dark:text-white">{client.name}</div>
                    <div className="text-sm text-neutral-500 dark:text-neutral-400">{client.email}</div>
                  </div>
                  <button
                    onClick={() => addClient(client.id)}
                    className="text-orange-600 dark:text-orange-500 hover:text-orange-500 dark:hover:text-orange-400 bg-orange-600/10 hover:bg-orange-600/20 px-4 py-2 rounded-lg transition-colors text-sm font-medium"
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

      <div className="bg-white dark:bg-neutral-900 rounded-lg border border-neutral-200 dark:border-white/10 shadow-2xl overflow-hidden">
        {sortedClients.length === 0 ? (
          <div className="p-12 text-center">
            <img src="https://i.imgur.com/fxOHjtK.png" alt="Track & Health Logo" className="w-16 h-16 object-contain mx-auto mb-4 opacity-50 grayscale" referrerPolicy="no-referrer" />
            <h3 className="text-xl font-medium text-neutral-900 dark:text-white mb-2">Nenhum aluno ainda</h3>
            <p className="text-neutral-500">Clique no botão Adicionar Aluno para começar a montar sua lista.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-neutral-500 dark:text-neutral-400">
              <thead className="bg-neutral-50 dark:bg-neutral-800 text-xs uppercase text-neutral-500 border-b border-neutral-200 dark:border-white/10">
                <tr>
                  <th className="px-4 py-3 font-medium">Aluno</th>
                  <th className="px-4 py-3 font-medium hidden sm:table-cell">Email</th>
                  <th className="px-4 py-3 font-medium">Data de Cadastro</th>
                  <th className="px-4 py-3 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 dark:divide-white/10">
                {sortedClients.map(client => {
                  const dateStr = client.connectionDate || client.createdAt;
                  const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString('pt-BR') : '--/--/----';
                  return (
                    <tr 
                      key={client.id} 
                      className="hover:bg-white/5 transition-colors cursor-pointer"
                      onClick={() => setSelectedClient(client)}
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
                              setChatRoom({ id: `chat_${user?.id}_${client.id}`, name: client.displayName || client.name });
                            }}
                            className="p-2 text-orange-500 hover:bg-orange-500/10 rounded-lg transition-colors sm:hidden"
                            title="Abrir Chat"
                          >
                            <MessageSquare className="w-5 h-5" />
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
                              setChatRoom({ id: `chat_${user?.id}_${client.id}`, name: client.displayName || client.name });
                            }}
                            className="p-2 text-orange-500 hover:bg-orange-500/10 rounded-lg transition-colors hidden sm:block"
                            title="Abrir Chat"
                          >
                            <MessageSquare className="w-5 h-5" />
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

      {chatRoom && (
        <ChatModal 
          roomId={chatRoom.id} 
          recipientName={chatRoom.name} 
          onClose={() => setChatRoom(null)} 
        />
      )}
    </div>
  );
}

function ClientWorkoutView({ workout, onBack, isPersonal: isPersonalProp }: { workout: any, onBack: () => void, isPersonal?: boolean }) {
  const { user } = useAuth();
  const [activeTimer, setActiveTimer] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [completedExercises, setCompletedExercises] = useState<string[]>(workout.completedExercises || []);
  const [exerciseFeedback, setExerciseFeedback] = useState<Record<string, string>>(workout.exerciseFeedback || {});
  const [exerciseLoads, setExerciseLoads] = useState<Record<string, string>>(workout.exerciseLoads || {});
  const [overallFeedback, setOverallFeedback] = useState(workout.overallFeedback || "");
  const [isFinishing, setIsFinishing] = useState(false);
  const [chatRoom, setChatRoom] = useState<{ id: string; name: string } | null>(null);
  const [recipientName, setRecipientName] = useState("Carregando...");

  const isPersonal = isPersonalProp !== undefined ? isPersonalProp : user?.role === "personal";
  const isCompleted = workout.status === "completed";

  useEffect(() => {
    const fetchRecipient = async () => {
      const recipientId = isPersonal ? workout.client_id : workout.personal_id;
      const docRef = doc(db, "users", recipientId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRecipientName(data.displayName || data.name || "Usuário");
      }
    };
    fetchRecipient();
  }, [isPersonal, workout.client_id, workout.personal_id]);

  const deleteWorkout = async () => {
    console.log("ClientWorkoutView: Deleting workout:", workout.id);
    if (!window.confirm("CONFIRMAR EXCLUSÃO: Tem certeza que deseja excluir este treino permanentemente?")) {
      console.log("ClientWorkoutView: Deletion cancelled by user");
      return;
    }
    
    try {
      console.log("ClientWorkoutView: Calling deleteDoc for:", workout.id);
      await deleteDoc(doc(db, "workouts", workout.id));
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
      console.log("ClientWorkoutView: Updating workout doc...");
      await updateDoc(doc(db, "workouts", workout.id), {
        status: "completed",
        completedExercises,
        exerciseFeedback,
        exerciseLoads,
        overallFeedback,
        completedAt: new Date().toISOString()
      });
      console.log("ClientWorkoutView: Workout update successful");
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
      <div className="flex items-center justify-between bg-white dark:bg-neutral-900 p-4 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-xl">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-xl transition-colors">
            <ArrowLeft className="w-5 h-5 text-neutral-900 dark:text-white" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-neutral-900 dark:text-white leading-tight">
              {isCompleted ? "Treino Concluído" : "Treino de Hoje"}
            </h2>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {new Date(workout.date).toLocaleDateString('pt-BR')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setChatRoom({ 
              id: isPersonal ? `chat_${user?.id}_${workout.client_id}` : `chat_${workout.personal_id}_${user?.id}`, 
              name: recipientName 
            })}
            className="flex items-center gap-2 bg-orange-600/10 hover:bg-orange-600 text-orange-600 dark:text-orange-500 hover:text-white px-3 py-2 rounded-xl border border-orange-500/20 transition-all font-bold text-xs"
          >
            <MessageSquare className="w-4 h-4" />
            Chat
          </button>
          {isCompleted && (
            <div className="hidden sm:flex bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-4 py-2 rounded-full border border-emerald-500/20 items-center gap-2 font-medium">
              <CheckCircle2 className="w-5 h-5" />
              Concluído
            </div>
          )}
          {isPersonal && (
            <button 
              onClick={deleteWorkout}
              className="p-2 text-red-600 dark:text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
              title="Excluir Treino"
            >
              <Trash2 className="w-6 h-6" />
            </button>
          )}
        </div>
      </div>

      {chatRoom && (
        <ChatModal 
          roomId={chatRoom.id} 
          recipientName={chatRoom.name} 
          onClose={() => setChatRoom(null)} 
        />
      )}

      <div className="grid gap-6">
        {workout.exercises.map((ex: any, index: number) => {
          const isExCompleted = completedExercises.includes(ex.id);
          return (
            <div 
              key={ex.id} 
              className={`bg-white dark:bg-neutral-900 rounded-2xl border transition-all overflow-hidden ${isExCompleted ? 'border-emerald-500/30' : 'border-neutral-200 dark:border-white/10 shadow-2xl'}`}
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
                      <h3 className={`text-xl font-bold transition-colors ${isExCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-900 dark:text-white'}`}>
                        {ex.name}
                      </h3>
                      <div className="flex flex-wrap items-center gap-2 mt-3">
                        {ex.isCardio ? (
                          <span className="bg-orange-600/10 text-orange-600 dark:text-orange-400 px-3 py-1 rounded-lg border border-orange-500/20 font-medium italic text-sm">
                            {ex.prescription || "Sem prescrição"}
                          </span>
                        ) : (
                          <>
                            <div className="flex items-center bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-lg border border-indigo-500/20">
                              <span className="text-[10px] uppercase font-bold mr-1.5 opacity-70">Séries:</span>
                              <span className="font-bold">{ex.sets}</span>
                            </div>
                            <div className="flex items-center bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-3 py-1 rounded-lg border border-emerald-500/20">
                              <span className="text-[10px] uppercase font-bold mr-1.5 opacity-70">Reps:</span>
                              <span className="font-bold">{ex.reps}</span>
                            </div>
                            <div className="flex items-center bg-amber-500/10 text-amber-600 dark:text-amber-400 px-3 py-1 rounded-lg border border-amber-500/20">
                              <span className="text-[10px] uppercase font-bold mr-1.5 opacity-70">Carga:</span>
                              {isCompleted || isPersonal ? (
                                <span className="font-bold">{exerciseLoads[ex.id] || "--"}</span>
                              ) : (
                                <input
                                  type="text"
                                  value={exerciseLoads[ex.id] || ""}
                                  onChange={(e) => setExerciseLoads(prev => ({ ...prev, [ex.id]: e.target.value }))}
                                  placeholder="0"
                                  className="w-10 bg-transparent border-none text-amber-600 dark:text-amber-400 font-bold text-center p-0 focus:outline-none focus:ring-0"
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
                          ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-500/10' 
                          : isPersonal 
                            ? 'bg-neutral-100 dark:bg-neutral-800/50 text-neutral-400 dark:text-neutral-500 border border-neutral-200 dark:border-white/5 cursor-not-allowed'
                            : 'bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-white/5 hover:bg-neutral-200 dark:hover:bg-neutral-700 hover:text-neutral-900 dark:hover:text-white'
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
                  <div className="mt-4 rounded-xl overflow-hidden border border-neutral-200 dark:border-white/5 bg-neutral-50 dark:bg-black/20">
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
                    <div className="pt-4 border-t border-neutral-100 dark:border-white/10">
                      {activeTimer === ex.id ? (
                        <div className="bg-neutral-50 dark:bg-neutral-800 rounded-xl p-6 flex flex-col items-center justify-center border border-orange-600/30">
                          <div className="text-4xl font-mono font-bold text-orange-600 dark:text-orange-500 mb-2">
                            {formatTime(timeLeft)}
                          </div>
                          <p className="text-sm text-neutral-500 dark:text-neutral-400">Descansando...</p>
                          <button 
                            onClick={() => setActiveTimer(null)}
                            className="mt-4 text-sm text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startTimer(ex.id, ex.rest)}
                          className="w-full bg-neutral-50 dark:bg-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-white/10 text-neutral-900 dark:text-white font-medium py-4 rounded-xl transition-colors flex items-center justify-center gap-2"
                        >
                          <Clock className="w-5 h-5 text-orange-600 dark:text-orange-500" />
                          Iniciar Descanso ({ex.rest}s)
                        </button>
                      )}
                    </div>
                  )}

                  {(isPersonal || isCompleted || !isPersonal) && (
                    <div className="pt-4 border-t border-neutral-100 dark:border-white/10">
                      <div className="flex items-center gap-2 mb-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                        <MessageSquare className="w-4 h-4 text-orange-600 dark:text-orange-500" />
                        Feedback do Exercício
                      </div>
                      {isPersonal || isCompleted ? (
                        <p className="text-sm text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/50 p-3 rounded-xl border border-neutral-200 dark:border-white/5 italic">
                          {exerciseFeedback[ex.id] || "Nenhum feedback fornecido."}
                        </p>
                      ) : (
                        <textarea
                          value={exerciseFeedback[ex.id] || ""}
                          onChange={(e) => handleExerciseFeedback(ex.id, e.target.value)}
                          placeholder="Como foi este exercício? (Ex: Peso leve, dor no ombro...)"
                          className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all min-h-[80px]"
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl p-6 mt-8">
        <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-4 flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-orange-600 dark:text-orange-500" />
          Feedback Geral do Treino
        </h3>
        {isPersonal || isCompleted ? (
          <p className="text-neutral-600 dark:text-neutral-300 bg-neutral-50 dark:bg-neutral-800/50 p-4 rounded-xl border border-neutral-200 dark:border-white/5 italic">
            {overallFeedback || "Nenhum feedback geral fornecido."}
          </p>
        ) : (
          <textarea
            value={overallFeedback}
            onChange={(e) => setOverallFeedback(e.target.value)}
            placeholder="Conte ao seu personal como foi o treino de hoje no geral..."
            className="w-full bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 rounded-xl px-4 py-3 text-neutral-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-600 transition-all min-h-[120px]"
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
  return (
    <div className="space-y-3">
      {workouts.length === 0 ? (
        <div className="bg-white dark:bg-neutral-900 p-12 rounded-2xl border border-neutral-200 dark:border-white/10 text-center">
          <Activity className="w-12 h-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-4" />
          <h3 className="text-xl font-medium text-neutral-900 dark:text-white mb-2">Nenhum treino encontrado</h3>
          <p className="text-neutral-500">Seu treinador ainda não atribuiu um treino para você.</p>
        </div>
      ) : (
        workouts.map(workout => (
          <div 
            key={workout.id}
            onClick={() => onSelectWorkout(workout)}
            className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-white/10 hover:border-orange-600 cursor-pointer transition-all shadow-xl hover:shadow-orange-600/5 flex items-center justify-between group"
          >
            <div className="flex items-center gap-4">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${
                workout.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-500' : 'bg-orange-600/10 text-orange-600 dark:text-orange-500'
              }`}>
                <CalendarIcon className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-neutral-900 dark:text-white text-lg">Treino</h4>
                <p className="text-sm text-neutral-500">{new Date(workout.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-400 dark:text-neutral-600 mb-1">Status</p>
                <span className={`text-xs font-bold px-3 py-1 rounded-full border ${
                  workout.status === 'completed' 
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20' 
                    : 'text-blue-600 dark:text-blue-400 bg-blue-500/10 border-blue-500/20'
                }`}>
                  {workout.status === 'completed' ? 'Concluído' : 'Disponível'}
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center group-hover:bg-orange-600 transition-colors">
                <Play className="w-5 h-5 text-neutral-600 dark:text-white group-hover:text-white" />
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function ClientDashboard({ onViewAllWorkouts, onViewSubscriptions }: { onViewAllWorkouts: () => void; onViewSubscriptions: () => void }) {
  const { user } = useAuth();
  const [personals, setPersonals] = useState<any[]>([]);
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [chatRoom, setChatRoom] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (user) {
      fetchPersonals();
      fetchWorkouts();
    }
  }, [user]);

  const fetchWorkouts = async () => {
    if (!user) return;
    const q = query(collection(db, "workouts"), where("client_id", "==", user.id));
    const querySnapshot = await getDocs(q);
    let workoutsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
    
    // Filter out workouts from personals who blocked the client
    const connectionsQ = query(collection(db, "connections"), where("client_id", "==", user.id), where("status", "==", "blocked"));
    const connectionsSnapshot = await getDocs(connectionsQ);
    const blockedPersonalIds = connectionsSnapshot.docs.map(doc => doc.data().personal_id);
    
    workoutsData = workoutsData.filter(w => !blockedPersonalIds.includes(w.personal_id));

    // Sort by date descending
    workoutsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setWorkouts(workoutsData);
  };

  const fetchPersonals = async () => {
    if (!user) return;
    const q = query(collection(db, "connections"), where("client_id", "==", user.id));
    const querySnapshot = await getDocs(q);
    
    const personalPromises = querySnapshot.docs.map(async (connectionDoc) => {
      const data = connectionDoc.data();
      const personalDoc = await getDoc(doc(db, "users", data.personal_id));
      return { id: personalDoc.id, ...personalDoc.data(), status: data.status };
    });
    
    const personalsData = await Promise.all(personalPromises);
    setPersonals(personalsData);
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
      <button 
        onClick={onViewSubscriptions}
        className="w-full text-left bg-gradient-to-r from-orange-600 to-orange-500 p-6 rounded-2xl shadow-2xl shadow-orange-600/20 flex items-center justify-between overflow-hidden relative group transition-transform hover:scale-[1.01] active:scale-[0.99]"
      >
        <div className="relative z-10">
          <h2 className="text-xl font-black text-white uppercase tracking-tighter">verificar pendencias</h2>
          <p className="text-orange-100 text-sm font-medium opacity-90">nao pare agora! Clique aqui e atualize a formas de pagamento.</p>
        </div>
        <div className="bg-white/20 p-3 rounded-xl backdrop-blur-md relative z-10">
          <CreditCard className="w-6 h-6 text-white animate-pulse" />
        </div>
        <div className="absolute -right-4 -bottom-4 w-32 h-32 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
      </button>

      <h2 className="text-2xl font-bold text-neutral-900 dark:text-white">Meus Treinadores</h2>
      
      <div className="grid gap-4">
        {personals.length === 0 ? (
          <div className="bg-white dark:bg-neutral-900 p-12 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl text-center">
            <img src="https://i.imgur.com/fxOHjtK.png" alt="Track & Health Logo" className="w-16 h-16 object-contain mx-auto mb-4 opacity-50 grayscale" referrerPolicy="no-referrer" />
            <h3 className="text-xl font-medium text-neutral-900 dark:text-white mb-2">Nenhum treinador conectado</h3>
            <p className="text-neutral-500">Um personal trainer adicionará você à lista dele.</p>
          </div>
        ) : (
          personals.map(personal => (
            <div key={personal.id} className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl flex items-center justify-between">
              <div className="flex items-center gap-4">
                {personal.photoUrl ? (
                  <img src={personal.photoUrl} alt="Profile" className="w-12 h-12 rounded-full object-cover border border-blue-500" />
                ) : (
                  <div className="w-12 h-12 bg-orange-600/20 rounded-full flex items-center justify-center text-xl font-bold text-orange-500">
                    {(personal.displayName || personal.name)?.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-medium text-neutral-900 dark:text-white">{personal.displayName || personal.name}</h3>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">{personal.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setChatRoom({ id: `chat_${personal.id}_${user?.id}`, name: personal.displayName || personal.name })}
                  disabled={personal.status === "blocked"}
                  className={`p-2 rounded-lg transition-colors flex items-center gap-2 ${
                    personal.status === "blocked" 
                      ? "text-neutral-300 dark:text-neutral-600 cursor-not-allowed" 
                      : "text-orange-600 dark:text-orange-500 hover:bg-orange-500/10"
                  }`}
                >
                  <MessageSquare className="w-5 h-5" />
                  <span className="text-xs font-bold hidden sm:inline">Chat</span>
                </button>
                <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  personal.status === "blocked"
                    ? "bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20"
                    : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                }`}>
                  {personal.status === "blocked" ? "Bloqueado" : "Conectado"}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {chatRoom && (
        <ChatModal 
          roomId={chatRoom.id} 
          recipientName={chatRoom.name} 
          onClose={() => setChatRoom(null)} 
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-orange-500" />
              <h3 className="text-lg font-medium text-neutral-900 dark:text-white">Meus Treinos</h3>
            </div>
          </div>
          
          <ClientWorkoutsList workouts={workouts.slice(0, 3)} onSelectWorkout={setSelectedWorkout} />
          
          {workouts.length > 3 && (
            <button 
              onClick={onViewAllWorkouts}
              className="w-full mt-4 py-2 text-orange-600 dark:text-orange-500 hover:text-orange-500 dark:hover:text-orange-400 text-xs font-bold uppercase tracking-widest border border-orange-500/20 rounded-xl hover:bg-orange-500/5 transition-all"
            >
              Ver Todos os Treinos
            </button>
          )}
        </div>
        <div className="bg-white dark:bg-neutral-900 p-6 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl">
          <div className="flex items-center gap-3 mb-4">
            <User className="w-5 h-5 text-orange-500" />
            <h3 className="text-lg font-medium text-neutral-900 dark:text-white">Progresso</h3>
          </div>
          <p className="text-neutral-500 text-sm">Continue treinando para ver seus gráficos de progresso aqui.</p>
        </div>
      </div>
    </div>
  );
}

function CompleteProfile({ isEditing = false }: { isEditing?: boolean }) {
  const { user, updateUser } = useAuth();
  const [cpf, setCpf] = useState(user?.cpf || "");
  const [cep, setCep] = useState(user?.cep || "");
  const [address, setAddress] = useState(user?.address || "");
  const [city, setCity] = useState(user?.city || "");
  const [birthDate, setBirthDate] = useState(user?.birthDate || "");
  const [cref, setCref] = useState(user?.cref || "");
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
      const dataToUpdate = {
        cpf,
        cep,
        address,
        city,
        birthDate,
        displayName: displayName || user.name,
        photoUrl,
        profileCompleted: true,
        ...(user.role === "personal" ? { cref } : { anamnesis })
      };

      await updateDoc(doc(db, "users", user.id), dataToUpdate);
      updateUser(dataToUpdate);
      
      if (isEditing) {
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
          {isSubmitting ? "Salvando..." : (isEditing ? "Salvar Alterações" : "Concluir Cadastro")}
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

function ClientWorkoutsTab() {
  const { user } = useAuth();
  const [workouts, setWorkouts] = useState<any[]>([]);
  const [selectedWorkout, setSelectedWorkout] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchWorkouts();
    }
  }, [user]);

  const fetchWorkouts = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, "workouts"), where("client_id", "==", user.id));
      const querySnapshot = await getDocs(q);
      let workoutsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      
      // Filter out workouts from personals who blocked the client
      const connectionsQ = query(collection(db, "connections"), where("client_id", "==", user.id), where("status", "==", "blocked"));
      const connectionsSnapshot = await getDocs(connectionsQ);
      const blockedPersonalIds = connectionsSnapshot.docs.map(doc => doc.data().personal_id);
      
      workoutsData = workoutsData.filter(w => !blockedPersonalIds.includes(w.personal_id));

      workoutsData.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setWorkouts(workoutsData);
    } catch (error) {
      console.error("Error fetching workouts:", error);
    } finally {
      setLoading(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-neutral-900 dark:text-white tracking-tight">Meus Treinos</h2>
          <p className="text-neutral-500 text-sm">Acompanhe sua jornada e execute seus treinos.</p>
        </div>
        <div className="bg-orange-600/10 px-4 py-2 rounded-xl border border-orange-500/20">
          <span className="text-orange-600 dark:text-orange-500 font-bold text-sm">{workouts.length} Treinos</span>
        </div>
      </div>

      <div className="bg-neutral-100 dark:bg-neutral-900/50 p-4 rounded-xl border border-neutral-200 dark:border-white/5 flex items-center gap-3">
        <div className="w-10 h-10 bg-orange-600/20 rounded-full flex items-center justify-center shrink-0">
          <Activity className="w-5 h-5 text-orange-600 dark:text-orange-500" />
        </div>
        <div>
          <p className="text-neutral-900 dark:text-white font-bold text-sm">verificar pendencias</p>
          <p className="text-neutral-500 text-xs">nao pare agora! Mantenha seus pagamentos em dia para continuar treinando.</p>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-orange-500/20 border-t-orange-500 rounded-full animate-spin mb-4"></div>
          <p className="text-neutral-500 text-sm animate-pulse">Buscando seus treinos...</p>
        </div>
      ) : (
        <ClientWorkoutsList workouts={workouts} onSelectWorkout={setSelectedWorkout} />
      )}
    </div>
  );
}

function Dashboard() {
  const { user, loading, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("home");

  // Se estiver carregando OU se estiver logado no Firebase mas o perfil ainda não chegou do Firestore
  if (loading || (auth.currentUser && !user)) {
    return (
      <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 flex flex-col items-center justify-center text-neutral-700 dark:text-neutral-200">
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
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 font-sans text-neutral-700 dark:text-neutral-200 pb-20 sm:pb-0">
      <nav className="bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-white/10 sticky top-0 z-10 hidden sm:block">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <div className="flex items-center gap-8">
              <button onClick={() => setActiveTab("home")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <img src="https://i.imgur.com/fxOHjtK.png" alt="Track & Health Logo" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
                <span className="font-bold text-xl tracking-tight text-neutral-900 dark:text-white">Track & Health</span>
              </button>
              
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setActiveTab("home")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "home" ? "bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5"}`}
                >
                  Rede
                </button>
                <button 
                  onClick={() => setActiveTab("workouts")}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "workouts" ? "bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5"}`}
                >
                  Treinos
                </button>
                {user.role === "client" && (
                  <>
                    <button 
                      onClick={() => setActiveTab("assessments")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "assessments" ? "bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5"}`}
                    >
                      Avaliações
                    </button>
                    <button 
                      onClick={() => setActiveTab("subscriptions")}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "subscriptions" ? "bg-neutral-100 dark:bg-white/10 text-neutral-900 dark:text-white" : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5"}`}
                    >
                      Assinaturas
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-4">
              <button
                onClick={toggleTheme}
                className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
                title={theme === "dark" ? "Modo Claro" : "Modo Escuro"}
              >
                {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button 
                onClick={() => setActiveTab("profile")}
                className="flex items-center gap-3 hover:bg-neutral-100 dark:hover:bg-white/5 p-1 pr-3 rounded-full transition-colors"
              >
                {user.photoUrl ? (
                  <img src={user.photoUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-orange-500/50" />
                ) : (
                  <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-sm font-bold text-orange-500">
                    {(user.displayName || user.name)?.charAt(0).toUpperCase() || '?'}
                  </div>
                )}
                <div className="text-sm text-left hidden md:block">
                  <div className="font-medium text-neutral-900 dark:text-white">{user.displayName || user.name}</div>
                  <div className="text-neutral-500 capitalize text-xs">{user.role}</div>
                </div>
              </button>
              <button
                onClick={logout}
                className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors ml-2"
                title="Sair"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <div className="sm:hidden bg-white dark:bg-neutral-900 border-b border-neutral-200 dark:border-white/10 sticky top-0 z-10 px-4 h-16 flex items-center justify-between">
        <button onClick={() => setActiveTab("home")} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <img src="https://i.imgur.com/fxOHjtK.png" alt="Track & Health Logo" className="w-8 h-8 object-contain" referrerPolicy="no-referrer" />
          <span className="font-bold text-xl tracking-tight text-neutral-900 dark:text-white">Track & Health</span>
        </button>
        <div className="flex items-center gap-3">
          <button
            onClick={toggleTheme}
            className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
          >
            {theme === "dark" ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          {user.photoUrl ? (
            <img src={user.photoUrl} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-orange-500/50" />
          ) : (
            <div className="w-8 h-8 bg-orange-500/20 rounded-full flex items-center justify-center text-sm font-bold text-orange-500">
              {(user.displayName || user.name)?.charAt(0).toUpperCase() || '?'}
            </div>
          )}
          <button
            onClick={logout}
            className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {activeTab === "home" && (user.role === "personal" ? <PersonalDashboard /> : <ClientDashboard onViewAllWorkouts={() => setActiveTab("workouts")} onViewSubscriptions={() => setActiveTab("subscriptions")} />)}
        {activeTab === "workouts" && (user.role === "client" ? (
          <ClientWorkoutsTab />
        ) : (
          <div className="bg-neutral-900 p-12 rounded-2xl border border-white/10 text-center">
            <Activity className="w-12 h-12 text-neutral-600 mx-auto mb-4" />
            <h3 className="text-xl font-medium text-white mb-2">Treinos</h3>
            <p className="text-neutral-500">Selecione um aluno na tela inicial para montar treinos.</p>
          </div>
        ))}
        {activeTab === "assessments" && user.role === "client" && (
          <AssessmentView 
            clientId={user.id} 
            clientName={user.name} 
            onBack={() => setActiveTab("home")} 
            isPersonal={false} 
          />
        )}
        {activeTab === "subscriptions" && user.role === "client" && (
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
                    onClick={async () => {
                      if (window.confirm("Tem certeza que deseja excluir sua conta permanentemente? Esta ação não pode ser desfeita.")) {
                        try {
                          const userAuth = auth.currentUser;
                          if (userAuth) {
                            // Delete from Firestore first
                            await deleteDoc(doc(db, "users", userAuth.uid));
                            // Delete from Auth
                            await deleteUser(userAuth);
                            alert("Sua conta foi excluída com sucesso.");
                            window.location.href = "/login";
                          }
                        } catch (err: any) {
                          console.error("Delete account error:", err);
                          if (err.code === "auth/requires-recent-login") {
                            alert("Para sua segurança, você precisa ter feito login recentemente para excluir sua conta. Por favor, saia e entre novamente antes de tentar excluir.");
                          } else {
                            alert("Ocorreu um erro ao excluir sua conta. Tente novamente mais tarde.");
                          }
                        }
                      }
                    }}
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
            onClick={() => setActiveTab("home")}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === "home" ? "text-orange-500" : "text-neutral-500"}`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-medium">Rede</span>
          </button>
          <button 
            onClick={() => setActiveTab("workouts")}
            className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${activeTab === "workouts" ? "text-orange-500" : "text-neutral-500"}`}
          >
            <Activity className="w-5 h-5" />
            <span className="text-[10px] font-medium">Treinos</span>
          </button>
          {user.role === "client" && (
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
    </div>
  );
}

function SubscriptionsView({ onBack }: { onBack: () => void }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={onBack}
          className="p-2 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:bg-neutral-100 dark:hover:bg-white/5 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div>
          <h2 className="text-3xl font-black text-neutral-900 dark:text-white tracking-tight">Assinaturas e Pagamentos</h2>
          <p className="text-neutral-500 text-sm">Gerencie seu plano e formas de pagamento.</p>
        </div>
      </div>

      <div className="grid gap-6">
        <div className="bg-white dark:bg-neutral-900 p-8 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white">Plano Premium</h3>
              <p className="text-neutral-500 text-sm">Acesso total a treinos e avaliações.</p>
            </div>
            <span className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-4 py-1 rounded-full text-xs font-bold border border-emerald-500/20">
              Ativo
            </span>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-neutral-100 dark:border-white/5">
              <span className="text-neutral-500 dark:text-neutral-400">Próximo pagamento</span>
              <span className="text-neutral-900 dark:text-white font-medium">15 de Abril, 2026</span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-neutral-100 dark:border-white/5">
              <span className="text-neutral-500 dark:text-neutral-400">Valor</span>
              <span className="text-neutral-900 dark:text-white font-medium">R$ 89,90/mês</span>
            </div>
          </div>

          <button className="w-full mt-8 bg-orange-600 hover:bg-orange-700 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-orange-600/20">
            Alterar Plano
          </button>
        </div>

        <div className="bg-white dark:bg-neutral-900 p-8 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl">
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-6">Formas de Pagamento</h3>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-white/5 rounded-xl border border-neutral-200 dark:border-white/10">
              <div className="flex items-center gap-4">
                <div className="w-12 h-8 bg-neutral-200 dark:bg-neutral-800 rounded flex items-center justify-center border border-neutral-300 dark:border-white/10">
                  <span className="text-[10px] font-bold text-neutral-700 dark:text-white">VISA</span>
                </div>
                <div>
                  <p className="text-neutral-900 dark:text-white font-medium">•••• •••• •••• 4242</p>
                  <p className="text-neutral-500 text-xs">Expira em 12/28</p>
                </div>
              </div>
              <span className="text-xs font-bold text-orange-600 dark:text-orange-500">Principal</span>
            </div>

            <button className="w-full flex items-center justify-center gap-2 p-4 border border-dashed border-neutral-300 dark:border-white/20 rounded-xl text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white hover:border-neutral-400 dark:hover:border-white/40 transition-all">
              <Plus className="w-5 h-5" />
              <span className="font-bold text-sm">Adicionar Cartão</span>
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-neutral-900 p-8 rounded-2xl border border-neutral-200 dark:border-white/10 shadow-2xl">
          <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-6">Histórico de Faturas</h3>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between p-4 hover:bg-neutral-50 dark:hover:bg-white/5 rounded-xl transition-colors group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-neutral-500 group-hover:text-orange-600 dark:group-hover:text-orange-500 transition-colors" />
                  </div>
                  <div>
                    <p className="text-neutral-900 dark:text-white font-medium">Fatura #00{i}</p>
                    <p className="text-neutral-500 text-xs">Pago em 15/{i+1}/2026</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-neutral-900 dark:text-white font-bold">R$ 89,90</p>
                  <button className="text-orange-600 dark:text-orange-500 text-xs font-bold hover:underline">Download PDF</button>
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
    <ThemeProvider>
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
    </ThemeProvider>
  );
}
