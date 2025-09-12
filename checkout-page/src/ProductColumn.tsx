import React from 'react';

const ProductColumn: React.FC = () => {
  return (
    <section className="max-w-[513px] flex-1 bg-[#F7FAFC] p-8 rounded-lg ">
      <h2 className="text-xl font-semibold mb-6">Order Summary</h2>

      <div className="flex flex-col items-center gap-4 border-b border-gray-300 pb-6 mb-6 w-full">
        {/* Product Image */}
       <img src={"/public/headphones.jpg"} alt="Product" className="w-full h-auto rounded" />

        {/* Name + Counter Row */}
        <div className="flex justify-between items-center w-full">
          <span className="font-semibold text-lg">Sony wireless headphones</span>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">−</button>
            <span>1</span>
            <button className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">+</button>
          </div>
        </div>

        {/* Price */}
        <div className="w-full text-left font-bold text-lg">£320.45</div>
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
            className="flex-grow bg-gray-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#3182CE]"
          />
          <button
            type="button"
            className="px-4 py-2 border-2 border-[#3182CE] text-[#3182CE] font-light rounded hover:bg-[#1d7ed8] hover:text-white transition"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Totals */}
      <div className="mt-8 border-t border-gray-300 pt-6">
        <div className="flex justify-between mb-2">
          <span>Sub total</span>
          <span>£316.55</span>
        </div>
        <div className="flex justify-between mb-2">
          <span>Tax</span>
          <span>£3.45</span>
        </div>
        <div className="flex justify-between mb-2">
          <span>Shipping</span>
          <span className='text-green-300'>Free</span>
        </div>
        <div className="flex justify-between mt-4 text-xl">
          <span className='font-bold'>Total</span>
          <span>£320.45</span>
        </div>
      </div>
    </section>
  );
};

export default ProductColumn;
