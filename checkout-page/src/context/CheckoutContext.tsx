// src/context/CheckoutContext.tsx
import React, { createContext, useReducer, type ReactNode } from "react";
import { checkoutReducer, initialCheckoutState } from "./checkoutReducer";
import type { CheckoutState, CheckoutAction } from "./checkoutReducer";

export interface CheckoutContextType {
  state: CheckoutState;
  dispatch: React.Dispatch<CheckoutAction>;
}

export const CheckoutContext = createContext<CheckoutContextType | undefined>(undefined);

export const CheckoutProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckoutState);

  return (
    <CheckoutContext.Provider value={{ state, dispatch }}>
      {children}
    </CheckoutContext.Provider>
  );
};
