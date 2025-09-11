// Shipping data structure
export interface ShippingInfo {
  address: string;
  city: string;
  postalCode: string;
  country: string;
  method?: "standard" | "express";
  cost?: number;
}

// Payment data structure
export interface PaymentInfo {
  method: "credit" | "paypal" | null;
  cardNumber?: string;
  expiry?: string;
}

// Checkout state
export interface CheckoutState {
  step: "account" | "shipping" | "payment"; // review removed
  authMode?: "login" | "register";          // optional for AuthForm
  shipping: ShippingInfo;
  payment: PaymentInfo;
}

// Initial state
export const initialCheckoutState: CheckoutState = {
  step: "account",
  authMode: "login",
  shipping: {
    address: "",
    city: "",
    postalCode: "",
    country: "",
    method: undefined,
    cost: undefined,
  },
  payment: {
    method: null,
    cardNumber: "",
  },
};

// Actions
export type CheckoutAction =
  | { type: "SET_STEP"; payload: CheckoutState["step"]; authMode?: "login" | "register" }
  | { type: "SET_SHIPPING"; payload: ShippingInfo }
  | { type: "SET_PAYMENT"; payload: PaymentInfo };

// Reducer
export function checkoutReducer(
  state: CheckoutState,
  action: CheckoutAction
): CheckoutState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, step: action.payload, authMode: action.authMode ?? state.authMode };
    case "SET_SHIPPING":
      return { ...state, shipping: action.payload };
    case "SET_PAYMENT":
      return { ...state, payment: action.payload };
    default:
      return state;
  }
}
