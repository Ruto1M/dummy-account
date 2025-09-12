import React from "react";
import { useCheckout } from "./context/useCheckout";

const OrderSummary: React.FC = () => {
  const { state } = useCheckout();

  return (
    <section className="max-w-[350px] w-full bg-gray-50 p-6 rounded-lg shadow">
      <h2 className="text-lg font-semibold mb-4">Order Summary</h2>
      <div className="space-y-2 text-sm text-gray-700">
        <div className="flex justify-between">
          <span>Shipping method:</span>
          <span>
            {state.shipping?.method
              ? `${state.shipping.method} ($${state.shipping.cost ?? 0})`
              : "Not selected"}
          </span>
        </div>
        <div className="flex justify-between">
          <span>Payment:</span>
          <span>
            {state.payment?.method
              ? state.payment.method === "credit"
                ? state.payment.cardNumber
                  ? `Credit Card ending in ${state.payment.cardNumber.slice(-4)}`
                  : "Credit Card (number not provided)"
                : "PayPal"
              : "Not selected"}
          </span>
        </div>
        <div className="border-t pt-2 mt-2 flex justify-between font-semibold">
          <span>Total:</span>
          <span>$99.99</span>
        </div>
      </div>
    </section>
  );
};

export default OrderSummary;
