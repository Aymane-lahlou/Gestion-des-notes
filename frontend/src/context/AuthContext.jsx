import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, setAuthFailureHandler } from "../lib/api";
import { clearTokens, getAccessToken, getRefreshToken, setTokens } from "../lib/tokenStorage";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = async () => {
    try {
      const response = await api.get("/auth/me/");
      setUser(response.data);
    } catch (error) {
      clearTokens();
      setUser(null);
    }
  };

  useEffect(() => {
    setAuthFailureHandler(() => {
      setUser(null);
      setLoading(false);
    });

    const init = async () => {
      const access = getAccessToken();
      if (access) {
        await loadProfile();
      } else {
        clearTokens();
        setUser(null);
      }
      setLoading(false);
    };
    init();

    return () => {
      setAuthFailureHandler(null);
    };
  }, []);

  const login = async (email, password) => {
    const response = await api.post("/auth/login/", { email, password });
    const { access, refresh, user: userPayload } = response.data;
    setTokens(access, refresh);
    setUser(userPayload);
    return userPayload;
  };

  const logout = async () => {
    const refresh = getRefreshToken();
    try {
      if (refresh) {
        await api.post("/auth/logout/", { refresh });
      }
    } catch (error) {
      // Logout local must continue even if API logout fails.
    } finally {
      clearTokens();
      setUser(null);
    }
  };

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: Boolean(user),
      login,
      logout,
      refreshProfile: loadProfile,
    }),
    [user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
