import React from "react";
import { useWeb3 } from "../../context/Web3Context";

const ROLE_COLORS = {
  MANUFACTURER: "bg-purple-100 text-purple-800 border-purple-300",
  DISTRIBUTOR: "bg-blue-100 text-blue-800 border-blue-300",
  PHARMACY: "bg-emerald-100 text-emerald-800 border-emerald-300",
  ADMIN: "bg-rose-100 text-rose-800 border-rose-300",
  CONSUMER: "bg-amber-100 text-amber-800 border-amber-300",
  GUEST: "bg-gray-100 text-gray-700 border-gray-300",
};

export const Navbar = ({ activeTab, setActiveTab }) => {
  const { account, role, isCorrectNetwork, connectWallet, switchNetwork, loading } = useWeb3();

  const truncateAddress = (addr) => {
    if (!addr) return "";
    return `${addr.substring(0, 6)}...${addr.substring(addr.length - 4)}`;
  };

  const navItems = [
    { id: "manufacturer", label: "Manufacturer" },
    { id: "distributor", label: "Distributor" },
    { id: "pharmacy", label: "Pharmacy" },
    { id: "consumer", label: "Consumer Verify" },
    { id: "explorer", label: "Explorer & Audit" },
    { id: "admin", label: "Admin Panel" },
  ];

  return (
    <header className="bg-white border-b border-gray-200 shadow-2xs sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-6">
        <div className="flex justify-between items-center h-14 gap-2">
          
          {/* Logo & Brand */}
          <div
            className="flex items-center space-x-2 cursor-pointer shrink-0"
            onClick={() => setActiveTab("consumer")}
          >
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black text-sm shadow-xs">
              TP
            </div>
            <div className="flex items-center">
              <span className="text-base font-extrabold text-gray-900 tracking-tight whitespace-nowrap">
                TrustPharma
              </span>
              <span className="hidden xl:inline-block ml-2 text-[10px] bg-indigo-50 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-md font-semibold whitespace-nowrap">
                Anti-Counterfeit
              </span>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="flex items-center space-x-1 shrink-0 overflow-x-auto py-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const isAdmin = item.id === "admin";

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? isAdmin
                        ? "bg-rose-600 text-white shadow-2xs"
                        : "bg-indigo-600 text-white shadow-2xs"
                      : isAdmin
                      ? "text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                >
                  {isAdmin && <span className="mr-1 text-[11px]">🛡️</span>}
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Wallet Actions & Status */}
          <div className="flex items-center space-x-2 shrink-0">
            {account && !isCorrectNetwork && (
              <button
                onClick={switchNetwork}
                className="text-[11px] bg-amber-500 hover:bg-amber-600 text-white font-semibold px-2 py-1 rounded-md shadow-2xs whitespace-nowrap transition-all"
              >
                Switch Network
              </button>
            )}

            {account && (
              <span
                className={`text-[10px] px-2 py-0.5 rounded-md border font-bold tracking-wider uppercase whitespace-nowrap ${
                  ROLE_COLORS[role] || ROLE_COLORS.GUEST
                }`}
              >
                {role || "Consumer"}
              </span>
            )}

            {!account ? (
              <button
                onClick={connectWallet}
                disabled={loading}
                className="text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg shadow-2xs whitespace-nowrap transition-all disabled:opacity-50"
              >
                {loading ? "..." : "Connect"}
              </button>
            ) : (
              <div className="flex items-center space-x-1.5 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-xs font-mono text-gray-700 whitespace-nowrap">
                  {truncateAddress(account)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};