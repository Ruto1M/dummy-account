import React, { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { useCheckout } from "./context/useCheckout";
import { loginUser, registerUser } from "./api/authApi";

interface AuthFormProps {
  mode: "login" | "register";
  setMode: (mode: "login" | "register") => void;
}

const AuthForm: React.FC<AuthFormProps> = ({ mode, setMode }) => {
  const { setUser } = useAuth();
  const { dispatch } = useCheckout();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (mode === "register") {
      if (password !== confirmPassword) {
        alert("Passwords do not match");
        return;
      }
      await registerUser(email, password, dispatch, setUser);
    } else {
      await loginUser(email, password, dispatch, setUser);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">
        {mode === "register" ? "Register" : "Sign In"}
      </h2>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        className="w-full border rounded px-3 py-2"
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="w-full border rounded px-3 py-2"
      />
      {mode === "register" && (
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="w-full border rounded px-3 py-2"
        />
      )}

      <div className="flex justify-end gap-4">
        <button
          type="button"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
          className="px-6 py-3 text-black bg-transparent font-semibold rounded hover:bg-gray-200"
        >
          {mode === "login" ? "Register for Account" : "Back to Login"}
        </button>
        <button
          type="submit"
          className="px-6 py-3 bg-[#3182CE] text-white font-semibold rounded hover:bg-blue-700"
        >
          {mode === "login" ? "Login" : "Register"}
        </button>
      </div>
    </form>
  );
};

export default AuthForm;
