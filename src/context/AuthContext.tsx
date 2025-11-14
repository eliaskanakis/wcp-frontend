"use client";

import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  onAuthStateChanged,
} from "firebase/auth";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { auth, db } from "@/lib/firebase";

type UserProfile = {
  uid: string;
  email: string | null;
  name: string;
  globalAdmin: boolean;
};

type AuthContextValue = {
  profile: UserProfile | null;
  loading: boolean;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  registerWithEmail: (
    name: string,
    email: string,
    password: string
  ) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setProfile(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const resolvedProfile = await ensureUserProfile(user);
        setProfile(resolvedProfile);
      } catch (error) {
        console.error("Failed to load user profile", error);
        setProfile(null);
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  }, []);

  const loginWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(auth, provider);
  }, []);

  const registerWithEmail = useCallback(
    async (name: string, email: string, password: string) => {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      if (auth.currentUser) {
        await updateProfile(auth.currentUser, { displayName: name });
      }

      const userRef = doc(db, "users", credential.user.uid);
      await setDoc(
        userRef,
        {
          name,
          email: credential.user.email ?? email,
          globalAdmin: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    },
    []
  );

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo(
    () => ({
      profile,
      loading,
      loginWithEmail,
      loginWithGoogle,
      registerWithEmail,
      logout,
    }),
    [
      profile,
      loading,
      loginWithEmail,
      loginWithGoogle,
      registerWithEmail,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

async function ensureUserProfile(user: User): Promise<UserProfile> {
  const fallbackName =
    user.displayName?.trim() ||
    user.email?.split("@")[0] ||
    "Warehouse User";

  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (!snapshot.exists()) {
    const payload = {
      name: fallbackName,
      email: user.email ?? "",
      globalAdmin: false,
      updatedAt: serverTimestamp(),
    };
    await setDoc(userRef, payload, { merge: true });
    return {
      uid: user.uid,
      email: user.email ?? null,
      name: fallbackName,
      globalAdmin: false,
    };
  }

  const data = snapshot.data() as Partial<UserProfile>;

  return {
    uid: user.uid,
    email: user.email ?? null,
    name: data.name ?? fallbackName,
    globalAdmin: Boolean(data.globalAdmin),
  };
}
