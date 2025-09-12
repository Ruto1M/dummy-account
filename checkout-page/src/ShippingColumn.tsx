// src/ShippingColumn.tsx
import React, { useState } from "react";
import { useCheckout } from "./context/useCheckout";

interface ShippingColumnProps {
  onNext: () => void;
}

const ShippingColumn: React.FC<ShippingColumnProps> = ({ onNext }) => {
  const { dispatch } = useCheckout();
  const [address, setAddress] = useState("");
  // const [city, setCity] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [country, setCountry] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // ✅ Save shipping info to global state
    dispatch({
      type: "SET_SHIPPING",
      payload: { address, postalCode, country },
    });

    // ✅ Move to Payment step
    onNext();
  };

  return (
    <section className="max-w-[778px] flex-1 bg-[#F7FAFC] p-8 rounded-lg">
      <h2 className="text-xl font-semibold mb-6">Shipping details</h2>
      <form onSubmit={handleSubmit}>
        <div className="mb-4 flex items-center gap-[100px]">
          <label className="mr-4 font-medium" htmlFor="address">Use saved address</label>
          <input
            id="address"
            type="text"
            placeholder="123 , Electric avenue"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="max-w-[278px] w-full bg-[#E2E8F0]  rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
          />
        </div>
          
        <div className="mb-4">
          <label className="block mb-2 font-medium" htmlFor="city">First line of address</label>
          <input
            id="address"
            type="text"
            placeholder="123"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="max-w-[534px] w-full bg-[#E2E8F0]  rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
          />
        </div>

        <div className="mb-4">
          <label className="block mb-2 font-medium" htmlFor="postalCode">Street name</label> 
        <input
            id="country"
            type="text"
            placeholder="Electric avenue"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="max-w-[534px] w-full bg-[#E2E8F0]  rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
          />
        </div>

      <div className="flex space-x-8 mb-4">
        {/* First Column */}
        <div className="flex-1">
          <label className="block mb-2 font-medium" htmlFor="postalCode">Postal Code</label>
          <input
            id="postalCode"
            type="text"
            placeholder="Enter postal code"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            className="w-full bg-[#E2E8F0]  rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
          />
        </div>   

        {/* Second Column */}   
        <div className="flex-1">
          <label className="block mb-2 font-medium" htmlFor="shipping">Select Shipping</label>
          <select
            id="shipping"
            className="w-full bg-[#E2E8F0]  rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
          >
            <option value="" disabled>Select shipping</option>
            <option value="standard">Free delivery</option>
            <option value="express">Express Shipping</option>
            <option value="overnight">Overnight Shipping</option>
          </select>
        </div>
      </div>


       <div className="relative w-full max-w-md mx-auto mt-[137.5px]">
        <hr className="w-[calc(694px+2rem)] mx-[-9rem] border-gray-300 my-4" />
       </div>
        <div className="flex justify-end gap-4 mt-[35px]">
          <button
          type="submit"
          className="px-7 py-3.5 text-black bg-transparent font-semibold rounded hover:bg-gray-200"
        >
          Cancel order
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

export default ShippingColumn;
