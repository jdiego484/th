import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrors";

export type UserType = {
  id: string;
  name: string;
  email: string;
  role: "personal" | "student" | "superadmin";
  photoUrl?: string;
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
    
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        console.log("AuthProvider: Autenticado no Firebase Auth:", firebaseUser.uid);
        
        // Listen to public profile
        const publicDocRef = doc(db, "users_public", firebaseUser.uid);
        const privateDocRef = doc(db, "users_private", firebaseUser.uid);

        let publicData: any = null;
        let privateData: any = null;

        const updateCombinedUser = () => {
          if (publicData && privateData) {
            if (publicData.blocked) {
              console.warn("AuthProvider: Usuário bloqueado.");
              signOut(auth);
              setUser(null);
              alert("Sua conta foi bloqueada. Entre em contato com o administrador.");
            } else {
              setUser({
                ...publicData,
                ...privateData,
                id: firebaseUser.uid,
                role: publicData.role === "client" ? "student" : publicData.role // Map client to student if needed
              });
              setAuthError(null);
            }
            setLoading(false);
          }
        };

        const unsubPublic = onSnapshot(publicDocRef, (docSnap) => {
          if (docSnap.exists()) {
            publicData = docSnap.data();
            updateCombinedUser();
          } else {
            // Fallback for migration or new users
            console.warn("AuthProvider: Perfil público não encontrado.");
            setLoading(false);
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users_public/${firebaseUser.uid}`);
        });

        const unsubPrivate = onSnapshot(privateDocRef, (docSnap) => {
          if (docSnap.exists()) {
            privateData = docSnap.data();
            updateCombinedUser();
          } else {
            console.warn("AuthProvider: Perfil privado não encontrado.");
            // If private doesn't exist yet, we might still be in registration
            privateData = {}; 
            updateCombinedUser();
          }
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, `users_private/${firebaseUser.uid}`);
        });

        return () => {
          unsubPublic();
          unsubPrivate();
        };
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

export const useAuth = () => useContext(AuthContext);
