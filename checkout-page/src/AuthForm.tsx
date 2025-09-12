import React, { useState } from "react";

const AuthForm: React.FC<{ mode: "login" | "register"; setMode: (mode: "login" | "register") => void }> = ({ mode, setMode }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Check if email and password are entered
  const isEmailValid = email.length > 0;
  const isPasswordValid = password.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "register") {
      if (password !== confirmPassword) {
        alert("Passwords do not match");
        return;
      }
      // Call register function
    } else {
      // Call login function
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">{mode === "register" ? "Register" : "Sign In"}</h2>

      <p className="text-sm text-gray-600 mt-[31px]">Email address</p>
      <div className="relative">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full bg-[#E2E8F0] rounded px-3 py-[11px] pr-10" // Added padding-right for the checkmark
        />
        {/* Display the checkmark if email is entered */}
        {isEmailValid && (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute top-1/2 right-3 transform -translate-y-1/2"
          >
            <g clipPath="url(#clip0_1_59)">
              <path d="M12.0004 22C6.47737 22 2.00037 17.523 2.00037 12C2.00037 6.477 6.47737 2 12.0004 2C17.5234 2 22.0004 6.477 22.0004 12C22.0004 17.523 17.5234 22 12.0004 22ZM11.0034 16L18.0734 8.929L16.6594 7.515L11.0034 13.172L8.17437 10.343L6.76037 11.757L11.0034 16Z" fill="#1A202C"/>
            </g>
            <defs>
              <clipPath id="clip0_1_59">
                <rect width="24" height="24" fill="white" transform="translate(0.000366211)"/>
              </clipPath>
            </defs>
          </svg>
        )}
      </div>

      <p className="text-sm text-gray-600">Password</p>
      <div className="relative">
        <input
          type="password"
          placeholder="********"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full bg-[#E2E8F0] rounded px-3 py-[11px] pr-10" // pr-10 adds padding to the right for the checkmark
        />

        {/* Display the checkmark if password is entered */}
        {isPasswordValid && (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="absolute top-1/2 right-3 transform -translate-y-1/2"
          >
            <g clipPath="url(#clip0_1_59)">
              <path d="M12.0004 22C6.47737 22 2.00037 17.523 2.00037 12C2.00037 6.477 6.47737 2 12.0004 2C17.5234 2 22.0004 6.477 22.0004 12C22.0004 17.523 17.5234 22 12.0004 22ZM11.0034 16L18.0734 8.929L16.6594 7.515L11.0034 13.172L8.17437 10.343L6.76037 11.757L11.0034 16Z" fill="#1A202C"/>
            </g>
            <defs>
              <clipPath id="clip0_1_59">
                <rect width="24" height="24" fill="white" transform="translate(0.000366211)"/>
              </clipPath>
            </defs>
          </svg>
        )}
      </div>

      {mode === "register" && (
        <>
          <p className="text-sm text-gray-600">Confirm Password</p>
          <input
            type="password"
            placeholder="Confirm Password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            className="w-full bg-[#E2E8F0] rounded px-3 py-2"
          />
        </>
      )}

      <div className="flex justify-end gap-4 mt-[35px]">
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="px-7 py-3.5 text-black bg-transparent font-semibold rounded hover:bg-gray-200"
        >
          {mode === "login" ? "Register for Account" : "Back to Login"}
        </button>
        <button
          type="submit"
          className="px-6 py-3 bg-[#3182CE] text-white font-semibold rounded hover:bg-[#1269bb]"
        >
          {mode === "login" ? "Login" : "Register"}
        </button>
      </div>
    </form>
  );
};

export default AuthForm;
