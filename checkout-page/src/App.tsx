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
  // const userName = user?.name || user?.email || "";
  const steps = ["account", "shipping", "payment"] as const;

  // ✅ Keep authMode local
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  return (
    <div className="font-sans h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-[35px] border-b border-gray-300  bg-white text-gray-800 shadow-md">
        <div className="flex items-center gap-[202px]">
          <div className="text-2xl font-bold cursor-pointer">
          <img src="./src/assets/images/dummy.svg" alt="Logo" />
        </div>

        <nav>
          <ul className="flex gap-[75px] font-medium text-base cursor-pointer text-gray-700">
            {["Home", "Shop", "Contacts", "Help"].map((item) => (
              <li key={item} className="transition-colors hover:text-blue-400">
                {item}
              </li>
            ))}
          </ul>
        </nav>
        </div>
        

        <div className="flex items-center gap-4 text-base">
          {isSignedIn ? (
            <div className="group relative cursor-pointer">
              <button className="px-4 py-2 bg-white rounded hover:bg-gray-200">
                Account ▾
              </button>
              <div className="absolute right-0 mt-2 w-40 bg-white border rounded shadow-lg opacity-0 invisible group-hover:visible group-hover:opacity-100 transition-all">
                {/* <div className="px-4 py-2 text-gray-800">Hello, {userName}</div> */}
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

          {/* Cart Icon */}
          <div className="relative flex items-center gap-2 cursor-pointer">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clip-path="url(#clip0_302_69)">
            <path d="M7 8V6C7 4.67392 7.52678 3.40215 8.46447 2.46447C9.40215 1.52678 10.6739 1 12 1C13.3261 1 14.5979 1.52678 15.5355 2.46447C16.4732 3.40215 17 4.67392 17 6V8H20C20.2652 8 20.5196 8.10536 20.7071 8.29289C20.8946 8.48043 21 8.73478 21 9V21C21 21.2652 20.8946 21.5196 20.7071 21.7071C20.5196 21.8946 20.2652 22 20 22H4C3.73478 22 3.48043 21.8946 3.29289 21.7071C3.10536 21.5196 3 21.2652 3 21V9C3 8.73478 3.10536 8.48043 3.29289 8.29289C3.48043 8.10536 3.73478 8 4 8H7ZM7 10H5V20H19V10H17V12H15V10H9V12H7V10ZM9 8H15V6C15 5.20435 14.6839 4.44129 14.1213 3.87868C13.5587 3.31607 12.7956 3 12 3C11.2044 3 10.4413 3.31607 9.87868 3.87868C9.31607 4.44129 9 5.20435 9 6V8Z" fill="#1A202C"/>
            </g>
            <defs>
            <clipPath id="clip0_302_69">
            <rect width="24" height="24" fill="white"/>
            </clipPath>
            </defs>
            </svg>
            <span className="text-sm">3 items</span>
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
