import type { User } from "../context/AuthContext";
import type { Dispatch } from "react";
import type { CheckoutAction } from "../context/checkoutReducer";

// Register user
export const registerUser = async (
  email: string,
  password: string,
  dispatch: Dispatch<CheckoutAction>,
  setUser: (user: User) => void
) => {
  // Load accounts from localStorage
  const accounts: User[] = JSON.parse(localStorage.getItem("accounts") || "[]");

  // Check if email already exists
  if (accounts.some((a) => a.email === email)) {
    alert("Email already registered");
    return;
  }

  const newUser: User = { name: email.split("@")[0], email };
  accounts.push(newUser);
  localStorage.setItem("accounts", JSON.stringify(accounts));

  // Set current user
  setUser(newUser);
  dispatch({ type: "SET_STEP", payload: "shipping" });
};

// Login user
export const loginUser = async (
  email: string,
  password: string,
  dispatch: Dispatch<CheckoutAction>,
  setUser: (user: User) => void
) => {
  const accounts: User[] = JSON.parse(localStorage.getItem("accounts") || "[]");

  const account = accounts.find((a) => a.email === email);

  if (!account) {
    alert("Account not found. Please register first.");
    return;
  }

  setUser(account);
  dispatch({ type: "SET_STEP", payload: "shipping" });
};
