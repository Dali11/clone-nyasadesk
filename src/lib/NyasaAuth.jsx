import { createContext, useContext, useState } from 'react';

const MOCK_OWNER = {
  id: 'user-owner',
  full_name: 'Alex Rivera',
  email: 'alex@nyasadesk.com',
  role: 'owner',
  avatar: null,
  workspace_id: 'ws-1',
  status: 'online',
};

const NyasaAuthContext = createContext(null);

export function NyasaAuthProvider({ children }) {
  const [user, setUser] = useState(MOCK_OWNER);
  const [onboardingComplete, setOnboardingComplete] = useState(true);

  return (
    <NyasaAuthContext.Provider value={{ user, setUser, onboardingComplete, setOnboardingComplete }}>
      {children}
    </NyasaAuthContext.Provider>
  );
}

export function useNyasaAuth() {
  return useContext(NyasaAuthContext);
}