import React, { useState } from "react";
import { useCheckout } from "./context/CheckoutContext";

interface AuthFormProps {
  mode: "login" | "register";
  setMode?: (mode: "login" | "register") => void; // optional, to allow switching
}

const AuthForm: React.FC<AuthFormProps> = ({ mode, setMode }) => {
  const { dispatch } = useCheckout();
  const isRegister = mode === "register";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (isRegister) {
      if (password !== confirmPassword) {
        alert("Passwords do not match");
        return;
      }
      localStorage.setItem("user", JSON.stringify({ email, password, name: email.split("@")[0] }));
      alert("Account created successfully!");
    } else {
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        const user = JSON.parse(storedUser);
        if (user.email !== email || user.password !== password) {
          alert("Invalid credentials");
          return;
        }
      } else {
        alert("No account found, please register");
        return;
      }
      alert("Login successful!");
    }

    dispatch({ type: "SET_STEP", payload: "shipping" });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-md mx-auto">
      <h2 className="text-xl font-semibold mb-4">{isRegister ? "Register" : "Sign In"}</h2>

      <div>
        <label className="block mb-2 font-medium">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full border rounded px-3 py-2"
          required
        />
      </div>

      <div>
        <label className="block mb-2 font-medium">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full border rounded px-3 py-2"
          required
        />
      </div>

      {isRegister && (
        <div>
          <label className="block mb-2 font-medium">Confirm Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full border rounded px-3 py-2"
            required
          />
        </div>
      )}

      {/* ✅ Two buttons side by side */}
      {!isRegister && setMode && (
        <div className="flex justify-end gap-4 mt-4">
          <button
            type="button"
            onClick={() => setMode("register")}
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
      )}

      {/* Registration submit button */}
      {isRegister && (
        <button
          type="submit"
          className="px-6 py-3 bg-green-600 text-white rounded hover:bg-green-700 w-full mt-4"
        >
          Register
        </button>
      )}
    </form>
  );
};

export default AuthForm;
