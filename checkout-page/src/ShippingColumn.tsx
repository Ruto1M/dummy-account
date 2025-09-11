// src/ShippingColumn.tsx
import React, { useState } from "react";
import { useCheckout } from "./context/CheckoutContext";

interface ShippingColumnProps {
  onNext: () => void;
}

const ShippingColumn: React.FC<ShippingColumnProps> = ({ onNext }) => {
  const { dispatch } = useCheckout();
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ Save shipping info to global state
    dispatch({
      type: "SET_SHIPPING",
      payload: { address, city, postalCode, country },
    });

    // ✅ Move to Payment step
    onNext();
  };

  return (
    <section className="max-w-[778px] flex-1 bg-[#F7FAFC] p-8 rounded-lg">
      <h2 className="text-xl font-semibold mb-6">Shipping Information</h2>
      <form onSubmit={handleSubmit}>
        <div className="mb-4">
          <label className="block mb-2 font-medium" htmlFor="address">Address:</label>
          <input
            id="address"
            type="text"
            placeholder="Enter your address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label className="block mb-2 font-medium" htmlFor="city">City:</label>
          <input
            id="city"
            type="text"
            placeholder="Enter your city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-4">
          <label className="block mb-2 font-medium" htmlFor="postalCode">Postal Code:</label>
          <input
            id="postalCode"
            type="text"
            placeholder="Enter postal code"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="mb-6">
          <label className="block mb-2 font-medium" htmlFor="country">Country:</label>
          <input
            id="country"
            type="text"
            placeholder="Enter your country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="max-w-[534px] w-full border border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          className="px-6 py-3 bg-[#3182CE] text-white font-semibold rounded hover:bg-blue-700 transition"
        >
          Save Shipping Info
        </button>
      </form>
    </section>
  );
};

export default ShippingColumn;
