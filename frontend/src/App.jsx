import React, { useState } from "react";
import { Web3Provider } from "./context/Web3Context";
import { Navbar } from "./components/common/Navbar";
import { ManufacturerView } from "./views/ManufacturerView";
import { DistributorView } from "./views/DistributorView";
import { PharmacyView } from "./views/PharmacyView";
import { ConsumerView } from "./views/ConsumerView";
import { ExplorerView } from "./views/ExplorerView";
import { AdminView } from "./views/AdminView"; // <-- Import AdminView

const MainContent = () => {
  const [activeTab, setActiveTab] = useState("admin");

  const [prefillUnitId, setPrefillUnitId] = useState("");
  const [prefillPin, setPrefillPin] = useState("");

  const handleSelectUnitForVerify = (unitId, pin = "") => {
    setPrefillUnitId(unitId);
    setPrefillPin(pin);
    setActiveTab("consumer");
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col justify-between">
      <div>
        <Navbar activeTab={activeTab} setActiveTab={setActiveTab} />

        <main className="pb-12">
          {activeTab === "consumer" && (
            <ConsumerView prefillUnitId={prefillUnitId} prefillPin={prefillPin} />
          )}
          {activeTab === "pharmacy" && (
            <PharmacyView onSelectUnitForVerify={handleSelectUnitForVerify} />
          )}
          {activeTab === "distributor" && (
            <DistributorView onSelectUnitForVerify={handleSelectUnitForVerify} />
          )}
          {activeTab === "manufacturer" && (
            <ManufacturerView onSelectUnitForVerify={handleSelectUnitForVerify} />
          )}
          {activeTab === "explorer" && <ExplorerView />}
          {activeTab === "admin" && <AdminView />} {/* <-- Dedicated View */}
        </main>
      </div>

      <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
        TrustPharma Anti-Counterfeit Verification Protocol • Running on Hardhat Localhost (31337)
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <Web3Provider>
      <MainContent />
    </Web3Provider>
  );
}