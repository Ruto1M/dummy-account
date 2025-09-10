import React from 'react';

const ProductColumn: React.FC = () => {
  return (
    <section className="max-w-[513px] flex-1 bg-[#F7FAFC] p-8 rounded-lg ">
      <h2 className="text-xl font-semibold mb-6">Your Products</h2>

      <div className="flex flex-col items-center gap-4 border-b border-gray-300 pb-6 mb-6 w-full">
        {/* Product Image */}
        <img
          src="./src/assets/images/headphones.jpg"
          alt="Product"
          className="w-[421px] h-[162px] object-cover rounded-lg"
        />

        {/* Name + Counter Row */}
        <div className="flex justify-between items-center w-full">
          <span className="font-semibold text-lg">Sony wireless headphones</span>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-200">−</button>
            <span>1</span>
            <button className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-200">+</button>
          </div>
        </div>

        {/* Price */}
        <div className="w-full text-left font-bold text-lg">$20.00</div>
      </div>

      {/* Gift Card Input */}
      <div className="mb-6">
        <label htmlFor="giftCard" className="block text-sm font-medium mb-2">
          Gift Card / Discount code
        </label>
        <div className="flex gap-x-2">
          <input
            type="text"
            id="giftCard"
            name="giftCard"
            placeholder=""
            className="flex-grow border bg-gray-300 border-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            className="px-4 py-2 border border-[#3182CE] text-[#3182CE] font-light rounded hover:bg-blue-700 transition"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="mt-8 border-t border-gray-300 pt-6">
        <div className="flex justify-between mb-2">
          <span>Subtotal</span>
          <span>$35.00</span>
        </div>
        <div className="flex justify-between mb-2">
          <span>Tax</span>
          <span>$3.50</span>
        </div>
        <div className="flex justify-between mb-2">
          <span>Shipping</span>
          <span>$5.00</span>
        </div>
        <div className="flex justify-between mt-4 font-bold text-xl">
          <span>Total</span>
          <span>$43.50</span>
        </div>
      </div>
    </section>
  );
};

export default ProductColumn;
