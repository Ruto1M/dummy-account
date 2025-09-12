import React, { useState } from "react";
import { useAuth } from "./context/authHooks";
import { useCheckout } from "./context/useCheckout";
import ProductColumn from "./ProductColumn";
import ShippingColumn from "./ShippingColumn";
import PaymentColumn from "./PaymentColumn";
import AuthForm from "./AuthForm";

const App: React.FC = () => {
  const { user, logout } = useAuth();
  const { state, dispatch } = useCheckout();

  const isSignedIn = !!user;
  const userName = user?.name || user?.email || "";
  const steps = ["account", "shipping", "payment"] as const;

  // ✅ Keep authMode local
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  return (
    <div className="font-sans h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 bg-white text-gray-800 shadow-md">
        <div className="text-2xl font-bold cursor-pointer">
          <img src="./src/assets/images/dummy.svg" alt="Logo" />
        </div>

        <nav>
          <ul className="flex gap-8 font-medium text-base cursor-pointer">
            {["Home", "Shop", "Contacts", "Help"].map((item) => (
              <li key={item} className="transition-colors hover:text-blue-400">
                {item}
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-4 text-base">
          {isSignedIn ? (
            <div className="group relative cursor-pointer">
              <button className="px-4 py-2 bg-white rounded hover:bg-gray-200">
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
            <button
              onClick={() => dispatch({ type: "SET_STEP", payload: "account" })}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Sign In
            </button>
          )}

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
        <section className="max-w-[778px] flex-1 bg-[#F7FAFC] p-8 rounded-lg">
          {/* Progress */}
          <div className="flex items-center justify-center mb-8 text-sm font-medium text-gray-700">
            {steps.map((step, index) => {
              const currentStepIndex = steps.indexOf(state.step as typeof steps[number]);
              const isActiveOrComplete = index <= currentStepIndex;
            
              return (
                <React.Fragment key={step}>
                  <span className={isActiveOrComplete ? "text-[#3182CE]" : "text-gray-400"}>
                    {step.charAt(0).toUpperCase() + step.slice(1)}
                  </span>
                  {index < steps.length - 1 && (
                    <div className="mx-2">
                      <svg width="96" height="24" viewBox="0 0 96 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <line y1="12.5" x2="25" y2="12.5" stroke="#3182CE"/>
                      <line x1="71" y1="12.5" x2="96" y2="12.5" stroke="#3182CE"/>
                      <g clip-path="url(#clip0_1_355)">
                      <path d="M46 22C40.477 22 36 17.523 36 12C36 6.477 40.477 2 46 2C51.523 2 56 6.477 56 12C56 17.523 51.523 22 46 22ZM45.003 16L52.073 8.929L50.659 7.515L45.003 13.172L42.174 10.343L40.76 11.757L45.003 16Z" fill="black"/>
                      </g>
                      <defs>
                      <clipPath id="clip0_1_355">
                      <rect width="24" height="24" fill="white" transform="translate(34)"/>
                      </clipPath>
                      </defs>
                      </svg>
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
                  
          {/* Step Components */}
          {state.step === "account" && (
            <AuthForm mode={authMode} setMode={setAuthMode} />
          )}
          {state.step === "shipping" && (
            <ShippingColumn onNext={() => dispatch({ type: "SET_STEP", payload: "payment" })} />
          )}
          {state.step === "payment" && (
            <PaymentColumn
              onNext={() => {
                alert("Checkout complete!");
                dispatch({ type: "SET_STEP", payload: "account" });
                setAuthMode("login"); // ✅ reset auth mode locally
              }}
            />
          )}
        </section>

        <ProductColumn />
      </main>
    </div>
  );
};

export default App;
