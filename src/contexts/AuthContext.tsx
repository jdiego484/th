import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../firebase";
import { handleFirestoreError, OperationType } from "../utils/firestoreErrors";

export type UserType = {
  id: string;
  name: string;
  email: string;
  role: "personal" | "client" | "superadmin";
  personalCode?: string;
  profileCompleted?: boolean;
  displayName?: string;
  photoUrl?: string;
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
        
        // Pequeno delay para garantir que o Firestore reconheça o token de autenticação
        // Isso evita o erro "Missing or insufficient permissions" no primeiro carregamento
        setTimeout(() => {
          const userDocRef = doc(db, "users", firebaseUser.uid);
          const unsubscribeDoc = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) {
              const userData = docSnap.data() as UserType;
              if (userData.blocked) {
                console.warn("AuthProvider: Usuário bloqueado.");
                signOut(auth);
                setUser(null);
                alert("Sua conta foi bloqueada. Entre em contato com o administrador.");
              } else {
                console.log("AuthProvider: Perfil encontrado no Firestore.");
                setUser({ ...userData, id: firebaseUser.uid });
                setAuthError(null);
              }
            } else {
              console.warn("AuthProvider: Perfil ainda não existe no Firestore.");
              setUser(null);
            }
            setLoading(false);
          }, (error) => {
            console.error("AuthProvider: Erro no onSnapshot do usuário:", error);
            handleFirestoreError(error, OperationType.GET, `users/${firebaseUser.uid}`);
          });

          // Armazenar o unsubscribe do documento para limpeza posterior se necessário
          // Nota: Como estamos dentro de um setTimeout, o retorno do useEffect original
          // não capturará este unsubscribeDoc facilmente sem uma ref.
        }, 200);
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
