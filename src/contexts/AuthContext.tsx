import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { onAuthStateChanged, signOut, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { doc, onSnapshot, setDoc, getDocFromServer } from "firebase/firestore";
import { auth, db } from "../firebase";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrors";

export type UserType = {
  id: string;
  name: string;
  email: string;
  role: "personal" | "student" | "superadmin";
  photoUrl?: string;
  phone?: string;
  city?: string;
  cpf?: string;
  medicalHistory?: string;
  medications?: string;
  profileCompleted?: boolean;
  blocked?: boolean;
  isPendingProfile?: boolean;
  [key: string]: any;
};

interface AuthContextType {
  user: UserType | null;
  loading: boolean;
  logout: () => void;
  updateUser: (data: Partial<UserType>) => void;
  loginWithGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  updateUser: () => {},
  loginWithGoogle: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    console.log("AuthProvider: Iniciando monitoramento...");

    // Test Firestore connection on startup
    const testConnection = async () => {
      try {
        // Use getDocFromServer to bypass cache and test real connection
        await getDocFromServer(doc(db, 'system_messages', 'connection_test')).catch(e => {
          // Ignore if document doesn't exist, we just want to test connection
          if (e.code !== 'not-found' && e.message.includes('the client is offline')) {
            console.error("Firestore connection test failed: client is offline. Check your Firebase configuration.");
            setAuthError("Erro de conexão com o banco de dados. Verifique sua internet ou configuração.");
          }
        });
      } catch (error) {
        // Skip logging for most errors, as this is simply a connection test.
      }
    };
    testConnection();
    
    let unsubPublic: (() => void) | null = null;
    let unsubPrivate: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Limpar listeners anteriores se existirem
      if (unsubPublic) unsubPublic();
      if (unsubPrivate) unsubPrivate();

      if (firebaseUser) {
        console.log("AuthProvider: Autenticado no Firebase Auth:", firebaseUser.uid, "Email:", firebaseUser.email);
        
        const publicDocRef = doc(db, "users_public", firebaseUser.uid);
        const privateDocRef = doc(db, "users_private", firebaseUser.uid);

        let publicData: any = null;
        let privateData: any = null;

        const updateCombinedUser = () => {
          if (publicData) {
            if (publicData.blocked) {
              console.warn("AuthProvider: Usuário bloqueado.");
              signOut(auth);
              setUser(null);
              alert("Sua conta foi bloqueada. Entre em contato com o administrador.");
              setLoading(false);
              return;
            }

            const rawRole = (publicData.role || "").toString().toLowerCase().trim();
            const userEmail = (firebaseUser.email || "").trim().toLowerCase();
            const isHardcodedAdmin = userEmail === "jdiego484@gmail.com";
            const isForcedPersonal = userEmail === "jdiego484@hotmail.com";
            const savedRole = localStorage.getItem('pending_role') as "personal" | "student" | "superadmin" | null;
            
            console.log("AuthProvider: Syncing profile for", userEmail);
            console.log("AuthProvider: Data from Firestore:", publicData);
            console.log("AuthProvider: Pending role in localStorage:", savedRole);

            let finalRole: "personal" | "student" | "superadmin" = "student";
            
            // Ordem de prioridade estrita
            if (isForcedPersonal) {
              finalRole = "personal";
            } else if (isHardcodedAdmin || rawRole === "superadmin") {
              finalRole = "superadmin";
            } else if (rawRole === "personal") {
              finalRole = "personal";
            } else if (savedRole) {
              // Se o DB não tem o role ainda, mas temos no localStorage, usamos o localStorage
              finalRole = savedRole;
              console.log("AuthProvider: DB missing role, using localStorage fallback:", savedRole);
            } else {
              finalRole = "student";
            }

            console.log("AuthProvider: Final role decided:", finalRole);

            const combinedUser: UserType = {
              ...publicData,
              ...(privateData || {}),
              id: firebaseUser.uid,
              email: firebaseUser.email || (privateData?.email) || "",
              role: finalRole
            };

            console.log("AuthProvider: Combined User Object:", combinedUser);

            // Sync phone to public profile if missing there but present in private
            if (privateData?.phone && !publicData?.phone) {
              console.log("AuthProvider: Sincronizando telefone para perfil público...");
              setDoc(publicDocRef, { phone: privateData.phone }, { merge: true }).catch(e => {
                console.error("Erro ao sincronizar telefone:", e);
              });
            }

            setUser(combinedUser);
            if (combinedUser.profileCompleted && rawRole) {
              localStorage.removeItem('pending_role');
            }
            setAuthError(null);
            setLoading(false);
          }
        };

        unsubPublic = onSnapshot(publicDocRef, (docSnap) => {
          if (docSnap.exists()) {
            publicData = docSnap.data();
            updateCombinedUser();
          } else {
            console.info("AuthProvider: Perfil público ainda não criado. Definindo usuário mínimo.");
            const userEmail = (firebaseUser.email || "").trim().toLowerCase();
            const isHardcodedAdmin = userEmail === "jdiego484@gmail.com";
            const isForcedPersonal = userEmail === "jdiego484@hotmail.com";
            
            // Lógica de 'Usuário Mínimo': UID e Email disponíveis mesmo sem perfil
            // Tenta recuperar o role do localStorage se disponível (setado no Login.tsx) ou assume student
            const savedRole = localStorage.getItem('pending_role') as "personal" | "student" | "superadmin" | null;
            
            setUser({ 
              id: firebaseUser.uid, 
              email: firebaseUser.email || "", 
              name: firebaseUser.displayName || "Usuário",
              role: isHardcodedAdmin ? "superadmin" : (isForcedPersonal ? "personal" : (savedRole || "student")), 
              profileCompleted: false,
              isPendingProfile: true 
            } as UserType);
            setLoading(false);
          }
        }, (error) => {
          console.error("Error fetching public profile:", error);
          // Mesmo com erro de permissão (ex: regras bloqueando), tentamos manter o usuário mínimo
          setUser({ 
            id: firebaseUser.uid, 
            email: firebaseUser.email || "", 
            isPendingProfile: true 
          } as any);
          setLoading(false);
        });

        unsubPrivate = onSnapshot(privateDocRef, (docSnap) => {
          if (docSnap.exists()) {
            privateData = docSnap.data();
            updateCombinedUser();
          } else {
            console.info("AuthProvider: Perfil privado não encontrado.");
            privateData = {}; 
            updateCombinedUser();
          }
        }, (error) => {
          console.warn("AuthProvider: Erro ao ler perfil privado (esperado se não existir):", error.message);
          privateData = {};
          updateCombinedUser();
        });
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

    return () => {
      unsubscribeAuth();
      if (unsubPublic) unsubPublic();
      if (unsubPrivate) unsubPrivate();
    };
  }, []);

  const logout = async () => {
    try {
      console.log("AuthContext: Iniciando logout...");
      // Limpar estado local primeiro para feedback imediato
      localStorage.removeItem('pending_role');
      setUser(null);
      setLoading(true); // Mostrar loading durante o processo
      
      await signOut(auth);
      
      console.log("AuthContext: Logout concluído, redirecionando...");
      // Usar replace para evitar que o usuário volte para o dashboard com o botão voltar
      window.location.replace("/login");
    } catch (error) {
      console.error("Erro ao deslogar:", error);
      // Mesmo em caso de erro, forçamos a limpeza e o redirecionamento
      setUser(null);
      window.location.replace("/login");
    }
  };

  const updateUser = (data: Partial<UserType>) => {
    if (user) {
      setUser({ ...user, ...data });
    }
  };

  const loginWithGoogle = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Erro ao fazer login com Google:", error);
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout, updateUser, loginWithGoogle }}>
      {authError && (
        <div className="fixed top-0 left-0 right-0 bg-red-600 text-white p-2 text-center text-xs z-[9999]">
          {authError} - Tente atualizar a página.
        </div>
      )}
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
