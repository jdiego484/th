import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot, updateDoc } from "firebase/firestore";
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
  [key: string]: any;
};

interface AuthContextType {
  user: UserType | null;
  loading: boolean;
  logout: () => void;
  updateUser: (data: Partial<UserType>) => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  logout: () => {},
  updateUser: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    console.log("AuthProvider: Iniciando monitoramento...");
    
    let unsubPublic: (() => void) | null = null;
    let unsubPrivate: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      // Limpar listeners anteriores se existirem
      if (unsubPublic) unsubPublic();
      if (unsubPrivate) unsubPrivate();

      if (firebaseUser) {
        console.log("AuthProvider: Autenticado no Firebase Auth:", firebaseUser.uid);
        
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

            const combinedUser: UserType = {
              ...publicData,
              ...(privateData || {}),
              id: firebaseUser.uid,
              role: publicData.role === "client" ? "student" : publicData.role
            };

            // Sync phone to public profile if missing there but present in private
            if (privateData?.phone && !publicData?.phone) {
              console.log("AuthProvider: Sincronizando telefone para perfil público...");
              updateDoc(publicDocRef, { phone: privateData.phone }).catch(e => {
                console.error("Erro ao sincronizar telefone:", e);
              });
            }

            setUser(combinedUser);
            setAuthError(null);
            setLoading(false);
          }
        };

        unsubPublic = onSnapshot(publicDocRef, (docSnap) => {
          if (docSnap.exists()) {
            publicData = docSnap.data();
            updateCombinedUser();
          } else {
            console.warn("AuthProvider: Perfil público não encontrado.");
            setLoading(false);
          }
        }, (error) => {
          console.error("Error fetching public profile:", error);
          handleFirestoreError(error, OperationType.GET, `users_public/${firebaseUser.uid}`);
          setLoading(false);
        });

        unsubPrivate = onSnapshot(privateDocRef, (docSnap) => {
          if (docSnap.exists()) {
            privateData = docSnap.data();
            updateCombinedUser();
          } else {
            console.warn("AuthProvider: Perfil privado não encontrado.");
            privateData = {}; 
            updateCombinedUser();
          }
        }, (error) => {
          console.error("Error fetching private profile:", error);
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

export const useAuth = () => useContext(AuthContext);
