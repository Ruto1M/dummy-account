import React, { createContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';

interface AuthContextType {
  isSignedIn: boolean;
  userName: string;
  signIn: (email: string, password: string) => boolean;
  signOut: () => void;
  register: (email: string, password: string) => boolean;
}

interface User {
  email: string;
  password: string;
  name: string;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [userName, setUserName] = useState('');
  
  const [users, setUsers] = useState<User[]>([
    { email: 'jane@example.com', password: '1234', name: 'Jane Doe' }
  ]);

  const signIn = (email: string, password: string) => {
    const user = users.find(u => u.email === email && u.password === password);
    if (user) {
      setIsSignedIn(true);
      setUserName(user.name);
      return true;
    }
    return false;
  };

  const signOut = () => {
    setIsSignedIn(false);
    setUserName('');
  };

  const register = (email: string, password: string) => {
    if (users.some(u => u.email === email)) {
      return false;
    }
    const newUser: User = { email, password, name: email.split('@')[0] };
    setUsers(prev => [...prev, newUser]);
    return true;
  };

  // Add this useEffect to log users whenever they change
  useEffect(() => {
    console.log('Registered users:', users);
  }, [users]);

  return (
    <AuthContext.Provider value={{ isSignedIn, userName, signIn, signOut, register }}>
      {children}
    </AuthContext.Provider>
  );
};
