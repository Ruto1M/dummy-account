// src/components/Header.tsx
import React, { useState } from "react";
import { useAuth } from "../context/authHooks";

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <header className="flex justify-between items-center p-4 bg-gray-100 shadow">
      <h1 className="text-xl font-bold">My Store</h1>

      {user ? (
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Account
          </button>

          {open && (
            <div className="absolute right-0 mt-2 w-40 bg-white border rounded shadow-lg z-10">
              <p className="px-4 py-2 text-gray-700 border-b">{user.email}</p>
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-100"
                onClick={() => {
                  logout();
                  setOpen(false);
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      ) : (
        <a
          href="#auth"
          className="px-4 py-2 bg-[#3182CE] text-white rounded hover:bg-[#3182CE]"
        >
          Sign In
        </a>
      )}
    </header>
  );
};

export default Header;
