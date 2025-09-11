import React, { useState } from "react";
import { useCheckout } from "./context/CheckoutContext";

interface PaymentColumnProps {
  onNext: () => void;
}

const PaymentColumn: React.FC<PaymentColumnProps> = ({ onNext }) => {
  const { dispatch } = useCheckout();

  const [method, setMethod] = useState<"credit" | "paypal" | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();

    const paymentData = {
      method,
      cardNumber: method === "credit" ? cardNumber : "",
      expiry: method === "credit" ? expiry : "",
    };

    dispatch({ type: "SET_PAYMENT", payload: paymentData });
    onNext(); // ✅ move to review step
  };

  return (
    <section className="max-w-[778px] flex-1 bg-[#F7FAFC] p-8 rounded-lg">
      <h2 className="text-xl font-semibold mb-6">Payment Information</h2>
      <form onSubmit={handleSavePayment}>
        <div className="mb-4">
          <label className="block mb-2 font-medium" htmlFor="paymentMethod">
            Payment Method:
          </label>
          <select
            id="paymentMethod"
            value={method ?? ""}
            onChange={(e) =>
              setMethod(
                e.target.value ? (e.target.value as "credit" | "paypal") : null
              )
            }
            className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select method</option>
            <option value="credit">Credit Card</option>
            <option value="paypal">PayPal</option>
          </select>
        </div>

        {method === "credit" && (
          <>
            <div className="mb-4">
              <label className="block mb-2 font-medium" htmlFor="cardNumber">
                Card Number:
              </label>
              <input
                id="cardNumber"
                type="text"
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="mb-6">
              <label className="block mb-2 font-medium" htmlFor="expiry">
                Expiry Date:
              </label>
              <input
                id="expiry"
                type="text"
                placeholder="MM/YY"
                value={expiry}
                onChange={(e) => setExpiry(e.target.value)}
                className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        <button
          type="submit"
          className="px-6 py-3 bg-[#3182CE] text-white font-semibold rounded hover:bg-blue-700 transition"
        >
          Save Payment Info
        </button>
      </form>
    </section>
  );
};

export default PaymentColumn;
