import React, { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { useCheckout } from "./context/CheckoutContext";
import ProductColumn from "./ProductColumn";
import ShippingColumn from "./ShippingColumn";
import PaymentColumn from "./PaymentColumn";
import AuthForm from "./AuthForm";

const App: React.FC = () => {
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  const { user, logout } = useAuth();
  const { state, dispatch } = useCheckout();

  const isSignedIn = !!user;
  const userName = user?.name || user?.email || "";

  return (
    <div className="font-sans h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 bg-white text-gray-800 shadow-md">
        <div className="text-2xl font-bold cursor-pointer">
          <img src="./src/assets/images/dummy.svg" alt="Logo" />
        </div>

        {/* Navigation */}
        <nav>
          <ul className="flex gap-8 font-medium text-base cursor-pointer">
            {["Home", "Shop", "Contacts", "Help"].map((item) => (
              <li key={item} className="transition-colors hover:text-blue-400">{item}</li>
            ))}
          </ul>
        </nav>

        {/* Account + Cart */}
        <div className="flex items-center gap-4 text-base">
          {isSignedIn ? (
            <div className="group relative cursor-pointer">
              <button className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200">
                Account ▾
              </button>
              <div className="absolute right-0 mt-2 w-40 bg-white border rounded shadow-lg opacity-0 invisible group-hover:visible group-hover:opacity-100 transition-all">
                <div className="px-4 py-2 text-gray-800">Hello, {userName}</div>
                <button
                  onClick={logout}
                  className="w-full text-left px-4 py-2 text-red-500 hover:bg-gray-100"
                >
                  Logout
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-4">
              <button
                onClick={() => setAuthMode("register")}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
              >
                Register
              </button>
              <button
                onClick={() => setAuthMode("login")}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Sign In
              </button>
            </div>
          )}

          {/* Cart Icon */}
          <div className="relative cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="24" height="24">
              <path d="M6 6h15l-1.5 9h-13z" />
              <circle cx="9" cy="21" r="1" />
              <circle cx="18" cy="21" r="1" />
            </svg>
          </div>
        </div>
      </header>

      {/* Body */}
      <main className="flex flex-1 p-8 gap-8 bg-white">
        {/* Left column */}
        <section className="max-w-[778px] flex-1 bg-[#F7FAFC] p-8 rounded-lg">
          {/* Progress */}
          <div className="flex items-center justify-center mb-8 text-sm font-medium text-gray-700">
            <span className={state.step === "account" ? "text-blue-600" : "text-gray-400"}>Account</span>
            <div className="mx-2">{state.step !== "account" && "✓"}</div>
            <span className={state.step === "shipping" ? "text-blue-600" : "text-gray-400"}>Shipping</span>
            <div className="mx-2">{state.step === "payment" && "✓"}</div>
            <span className={state.step === "payment" ? "text-blue-600" : "text-gray-400"}>Payment</span>
          </div>

          {/* Step Components */}
          {state.step === "account" && <AuthForm mode={authMode} setMode={setAuthMode} />}
          {state.step === "shipping" && (
            <ShippingColumn onNext={() => dispatch({ type: "SET_STEP", payload: "payment" })} />
          )}
          {state.step === "payment" && <PaymentColumn />}
        </section>

        {/* Right column */}
        <ProductColumn />
      </main>
    </div>
  );
};

export default App;
