// src/PaymentColumn.tsx
import React, { useState } from "react";
import { useCheckout } from "./context/useCheckout";

interface PaymentColumnProps {
  onNext: () => void;
}

const PaymentColumn: React.FC<PaymentColumnProps> = ({ onNext }) => {
  const { dispatch } = useCheckout();

  const [method, setMethod] = useState<"credit" | "paypal" | null>(null);
  const [cardNumber, setCardNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvv, setCvv] = useState("");
  const [cardHolderName, setCardHolderName] = useState("");

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();

    const paymentData = {
      method,
      cardNumber: method === "credit" ? cardNumber : "",
      expiry: method === "credit" ? expiry : "",
      cvv: method === "credit" ? cvv : "",
      cardHolderName: method === "credit" ? cardHolderName : "",
    };

    dispatch({ type: "SET_PAYMENT", payload: paymentData });
    onNext(); // Move to review step
  };

  return (
    <section className="max-w-[778px] flex-1 bg-[#F7FAFC] p-8 rounded-lg">
      <h2 className="text-xl font-semibold mb-6">Payment Information</h2>
      <form onSubmit={handleSavePayment}>
        <div className="mb-4 flex items-center gap-[100px] mx-auto">
          <label className="mr-4 font-medium" htmlFor="paymentMethod">
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
            className="max-w-[278px] h-[59px] w-full bg-[#E2E8F0] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
          >
            <option value="">Select method</option>
            <option value="credit">Credit Card</option>
            <option value="paypal">PayPal</option>
          </select>
        </div>

        {/* Credit Card Fields */}
        {method === "credit" && (
          <>
           <div className="mb-6">
              <label className="block mb-2 font-medium" htmlFor="cardHolderName">
                Name on card
              </label>
              <input
                id="cardHolderName"
                type="text"
                placeholder="John Doe"
                value={cardHolderName}
                onChange={(e) => setCardHolderName(e.target.value)}
                className="max-w-[534px] h-[59px] w-full bg-[#E2E8F0] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
              />
            </div>
            <div className="mb-4">
              <label className="block mb-2 font-medium" htmlFor="cardNumber">
                Card number
              </label>
              <input
                id="cardNumber"
                type="text"
                placeholder="1234 5678 9012 3456"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="max-w-[534px] h-[59px] w-full bg-[#E2E8F0] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
              />
            </div>
            <div className="mb-4 flex space-x-8">
              <div className="mb-4 flex items-center space-x-2">
                {/* Month Input */}
                <div className="flex-1">
                  <label className="block mb-2 font-medium" htmlFor="expiryMonth">
                    Expiration
                  </label>
                  <input
                    id="expiryMonth"
                    type="text"
                    maxLength={2} // Limit input to 2 digits
                    placeholder="MM"
                    value={expiry.substring(0, 2)} // Get the first 2 characters for the month
                    onChange={(e) => setExpiry(e.target.value + expiry.substring(2))}
                    className="w-[100px] h-[59px] bg-[#E2E8F0] rounded px-3 py-2 text-center focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
                  />
                </div>

                {/* Slash Separator */}
                <div className="text-xl font-medium">
                  /
                </div>

                {/* Year Input */}
                <div className="flex-1">
                  <input
                    id="expiryYear"
                    type="text"
                    maxLength={2} // Limit input to 2 digits
                    placeholder="YY"
                    value={expiry.substring(2, 4)} // Get the last 2 characters for the year
                    onChange={(e) => setExpiry(expiry.substring(0, 2) + e.target.value)}
                    className="mt-8 w-[100px] h-[59px] bg-[#E2E8F0] rounded px-3 py-2 text-center focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
                  />
                </div>
              </div>


                    
              {/* CVV */}
              <div className="flex-1">
                <label className="block mb-2 font-medium" htmlFor="cvv">
                  CVC
                </label>
                <input
                  id="cvv"
                  type="text"
                  placeholder="123"
                  value={cvv}
                  onChange={(e) => setCvv(e.target.value)}
                  className="max-w-[278px] w-full h-[59px] bg-[#E2E8F0] rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
                />
              </div>
            </div>
                    
          </>
        )}

         <div className="relative w-full max-w-md mx-auto mt-[137.5px]">
        <hr className="w-[calc(694px+2rem)] mx-[-9rem] border-gray-300 my-4" />
       </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-4 mt-[35px]">
          <button
            type="button"
            onClick={() => { /* Handle Cancel action here */ }}
            className="px-7 py-3.5 text-black bg-transparent font-semibold rounded hover:bg-gray-200"
          >
            Cancel Order
          </button>
          <button
            type="submit"
            className="ml-3 px-[50px] py-3 bg-[#3182CE] text-white font-semibold rounded hover:bg-blue-700 transition"
          >
            Payment
          </button>
        </div>
      </form>
    </section>
  );
};

export default PaymentColumn;
