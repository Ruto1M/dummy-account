import React, { useState } from 'react';
import { useAuth } from './useAuth';
import ProductColumn from './ProductColumn';
import ShippingColumn from './ShippingColumn';

const App: React.FC = () => {
  const { isSignedIn, userName, signIn, signOut, register } = useAuth();

  const [mode, setMode] = useState<'signIn' | 'register'>('signIn');

  // Sign In form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register form state
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const success = signIn(email, password);
    if (!success) {
      alert('Invalid email or password');
    } else {
      setEmail('');
      setPassword('');
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();

    const success = register(registerEmail, registerPassword);
    if (!success) {
      alert('Email is already registered.');
    } else {
      alert(`Registered with email: ${registerEmail}. You can now log in.`);
      setRegisterEmail('');
      setRegisterPassword('');
      setMode('signIn');
    }
  };

  return (
  <div className="font-sans h-screen flex flex-col bg-gray-50">
    {/* Header */}
    <header className="flex items-center justify-between px-8 py-4 bg-white text-gray-800 shadow-md">
      {/* Logo */}
      <div className="text-2xl font-bold cursor-pointer">
        <img src="./src/assets/images/dummy.svg" alt="Logo" />
      </div>

      {/* Navigation */}
      <nav>
        <ul className="flex gap-8 font-medium text-base cursor-pointer">
          {['Home', 'Shop', 'Contacts', 'Help'].map((item) => (
            <li key={item} className="transition-colors hover:text-blue-400">
              {item}
            </li>
          ))}
        </ul>
      </nav>

      {/* Account and Cart */}
      <div className="flex items-center gap-8 text-base">
        {/* Account */}
        <div className="cursor-pointer">
          {isSignedIn ? (
            <>
              Hello, {userName}{' '}
              <button
                onClick={signOut}
                className="ml-4 text-sm text-red-500 underline"
              >
                Sign Out
              </button>
            </>
          ) : (
            'Sign In'
          )}
        </div>

        {/* Cart */}
        <div className="relative cursor-pointer">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="24"
            height="24"
          >
            <path d="M6 6h15l-1.5 9h-13z" />
            <circle cx="9" cy="21" r="1" />
            <circle cx="18" cy="21" r="1" />
          </svg>
        </div>
      </div>
    </header>

    {/* Body */}
    <main className="flex flex-1 p-8 gap-8 bg-white">
      {/* Sign-in/Register or Shipping Column */}
      {!isSignedIn ? (
        <section className="max-w-[778px] flex-1 bg-[#F7FAFC] p-8 rounded-lg">
          {/* Progress Bar */}
          <div className="flex items-center justify-center mb-8 text-sm font-medium text-gray-700">
            <span className="text-blue-600">Account</span>
            <div className="mx-2 text-green-600 font-bold">✓</div>
            <span className="text-blue-600">Shipping</span>
            <div className="mx-2 text-green-600 font-bold">✓</div>
            <span className="text-gray-400">Payment</span>
          </div>

          {/* Sign In / Register Form */}
          <h2 className="text-xl font-semibold mb-6">
            {mode === 'signIn' ? 'Sign In' : 'Register'}
          </h2>

          {mode === 'signIn' ? (
            <form onSubmit={handleLogin}>
              <div className="mb-4">
                <label htmlFor="email" className="block mb-2 font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-6">
                <label htmlFor="password" className="block mb-2 font-medium">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setMode('register')}
                  className="px-6 py-3 text-black bg-transparent font-semibold rounded hover:bg-gray-200 transition"
                >
                  Register for Account
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-[#3182CE] text-white font-semibold rounded hover:bg-blue-700 transition"
                >
                  Login
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister}>
              <div className="mb-4">
                <label htmlFor="regEmail" className="block mb-2 font-medium">
                  Email
                </label>
                <input
                  id="regEmail"
                  type="email"
                  placeholder="Email"
                  value={registerEmail}
                  onChange={e => setRegisterEmail(e.target.value)}
                  required
                  className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-6">
                <label htmlFor="regPassword" className="block mb-2 font-medium">
                  Password
                </label>
                <input
                  id="regPassword"
                  type="password"
                  placeholder="Password"
                  value={registerPassword}
                  onChange={e => setRegisterPassword(e.target.value)}
                  required
                  className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-4">
                <button
                  type="button"
                  onClick={() => setMode('signIn')}
                  className="px-6 py-3 text-black bg-transparent font-semibold rounded hover:bg-gray-200 transition"
                >
                  Back to Login
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-green-600 text-white font-semibold rounded hover:bg-green-700 transition"
                >
                  Register
                </button>
              </div>
            </form>
          )}
        </section>
      ) : (
        <ShippingColumn />
      )}

      {/* Product Column */}
      <ProductColumn />
    </main>
  </div>
);
}; 
export default App;
