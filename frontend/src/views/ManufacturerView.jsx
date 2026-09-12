import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";
import { useTrustPharma } from "../hooks/useTrustPharma";
import { MedicineBoxCard } from "../components/box/MedicineBoxCard";

export const ManufacturerView = ({ onSelectUnitForVerify }) => {
  const { account, role } = useWeb3();
  const { createBatch, transferCustody, recallBatch, getUnitDetails, txLoading } = useTrustPharma();

  // Mint Form State
  const [medicineName, setMedicineName] = useState("Amoxicillin 500mg");
  const [quantity, setQuantity] = useState(3);
  const [expiryDays, setExpiryDays] = useState(365);

  // Dispatch Form State
  const [distributorAddress, setDistributorAddress] = useState("");
  const [selectedUnitForTransfer, setSelectedUnitForTransfer] = useState("");

  // Recall State
  const [recallBatchId, setRecallBatchId] = useState("");

  // UI Feedback
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Local simulated storage for manufactured boxes (including private plaintext PINs)
  const [boxes, setBoxes] = useState([]);

  // Load persisted units from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("trustpharma_boxes");
    if (saved) {
      try {
        setBoxes(JSON.parse(saved));
      } catch (err) {
        console.error("Failed to parse saved boxes:", err);
      }
    }
  }, []);

  // Save units to localStorage when updated
  const updateSavedBoxes = (newBoxes) => {
    setBoxes(newBoxes);
    localStorage.setItem("trustpharma_boxes", JSON.stringify(newBoxes));
  };

  // Sync state from blockchain for all local boxes
  const syncChainStates = async () => {
    if (boxes.length === 0) return;
    try {
      const updated = await Promise.all(
        boxes.map(async (box) => {
          const onChain = await getUnitDetails(box.unitId);
          if (onChain) {
            return {
              ...box,
              state: onChain.state,
              isDispensed: onChain.isDispensed,
              currentCustodian: onChain.currentCustodian,
            };
          }
          return box;
        })
      );
      updateSavedBoxes(updated);
    } catch (err) {
      console.error("Error syncing on-chain states:", err);
    }
  };

  // Auto-generate IDs, Plain PINs, and Keccak-256 Hashes
  const handleMintBatch = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    const qty = parseInt(quantity, 10);
    if (isNaN(qty) || qty < 1 || qty > 25) {
      setErrorMessage("Quantity must be between 1 and 25 for batch generation.");
      return;
    }

    try {
      const timestamp = Math.floor(Date.now() / 1000);
      const batchId = `BAT-${medicineName.substring(0, 3).toUpperCase()}-${timestamp.toString().slice(-6)}`;
      const expTimestamp = timestamp + parseInt(expiryDays, 10) * 24 * 60 * 60;

      const newUnitIds = [];
      const secretHashes = [];
      const generatedLocalUnits = [];

      for (let i = 1; i <= qty; i++) {
        const paddedIndex = String(i).padStart(3, "0");
        const unitId = `BOX-${batchId.slice(-6)}-${paddedIndex}`;
        
        // Cryptographic 8-character random alphanumeric PIN
        const randomToken = Math.random().toString(36).substring(2, 8).toUpperCase();
        const plainPin = `PIN-${randomToken}`;
        
        // Client-side commitment calculation
        const secretHash = ethers.keccak256(ethers.toUtf8Bytes(plainPin));

        newUnitIds.push(unitId);
        secretHashes.push(secretHash);

        generatedLocalUnits.push({
          unitId,
          batchId,
          medicineName,
          plainPin,
          expiryDate: expTimestamp,
          state: 0,
          isDispensed: false,
          currentCustodian: account,
        });
      }

      setStatusMessage("Minting batch to blockchain... Please confirm transaction in MetaMask.");
      await createBatch(batchId, medicineName, expTimestamp, newUnitIds, secretHashes);

      // Persist to local physical simulation
      const allBoxes = [...generatedLocalUnits, ...boxes];
      updateSavedBoxes(allBoxes);

      setStatusMessage(`Success! Minted batch ${batchId} with ${qty} serialized tamper-evident units.`);
    } catch (err) {
      setErrorMessage(err.message || "Failed to mint batch.");
    }
  };

// Dispatch custody to Distributor
  const handleDispatch = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (!selectedUnitForTransfer || !distributorAddress) {
      setErrorMessage("Select a unit and provide a valid recipient distributor address.");
      return;
    }

    try {
      setStatusMessage(`Dispatching unit ${selectedUnitForTransfer}... Confirm in MetaMask.`);
      await transferCustody(selectedUnitForTransfer, distributorAddress.trim());

      // Update local storage: mark InTransit (1), record target recipient, and reset isAccepted
      const updated = boxes.map((box) =>
        box.unitId === selectedUnitForTransfer
          ? {
              ...box,
              state: 1,
              targetRecipient: distributorAddress.trim().toLowerCase(),
              isAcceptedByDistributor: false,
            }
          : box
      );
      updateSavedBoxes(updated);

      setStatusMessage(`Dispatched ${selectedUnitForTransfer} to ${distributorAddress}. Status: InTransit.`);
      setSelectedUnitForTransfer("");
    } catch (err) {
      setErrorMessage(err.message || "Transfer failed.");
    }
  };

  // Emergency Batch Recall
  const handleRecall = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (!recallBatchId) {
      setErrorMessage("Enter a batch ID to recall.");
      return;
    }

    try {
      setStatusMessage(`Initiating emergency recall on ${recallBatchId}... Confirm in MetaMask.`);
      await recallBatch(recallBatchId);
      setStatusMessage(`Batch ${recallBatchId} has been officially quarantined and recalled on-chain!`);
      setRecallBatchId("");
    } catch (err) {
      setErrorMessage(err.message || "Recall failed.");
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-gray-900">Manufacturer Station</h1>
            <span className="bg-purple-100 text-purple-800 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-purple-300">
              Role: Manufacturer
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Generate serialized inventory, commit cryptographic scratch PINs, and dispatch stock downstream.
          </p>
        </div>

        {role !== "MANUFACTURER" && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 max-w-sm">
            <strong>Simulation Note:</strong> Connected account is not registered as a Manufacturer. Transactions will trigger role rejection tests.
          </div>
        )}
      </div>

      {/* Global Alerts */}
      {statusMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {/* Action Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form 1: Mint Batch */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <span className="w-2 h-2 rounded-full bg-purple-600 mr-2"></span>
            Mint Serialized Batch
          </h2>
          <form onSubmit={handleMintBatch} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Medicine Name</label>
              <input
                type="text"
                value={medicineName}
                onChange={(e) => setMedicineName(e.target.value)}
                required
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Quantity</label>
                <input
                  type="number"
                  min="1"
                  max="25"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Expiry (Days)</label>
                <input
                  type="number"
                  min="1"
                  value={expiryDays}
                  onChange={(e) => setExpiryDays(e.target.value)}
                  required
                  className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={txLoading}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold py-2.5 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {txLoading ? "Submitting..." : "Generate & Mint Batch"}
            </button>
          </form>
        </div>

        {/* Form 2: Dispatch Custody */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <span className="w-2 h-2 rounded-full bg-blue-600 mr-2"></span>
            Dispatch to Distributor
          </h2>
          <form onSubmit={handleDispatch} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Select Unit ID</label>
              <select
                value={selectedUnitForTransfer}
                onChange={(e) => setSelectedUnitForTransfer(e.target.value)}
                required
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              >
                <option value="">-- Choose Manufactured Unit --</option>
                {boxes
                  .filter((b) => b.state === 0 && !b.isDispensed)
                  .map((b) => (
                    <option key={b.unitId} value={b.unitId}>
                      {b.unitId} ({b.medicineName})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Distributor Address</label>
              <input
                type="text"
                placeholder="0x..."
                value={distributorAddress}
                onChange={(e) => setDistributorAddress(e.target.value)}
                required
                className="w-full text-sm font-mono border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={txLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {txLoading ? "Transferring..." : "Dispatch Custody"}
            </button>
          </form>
        </div>

        {/* Form 3: Emergency Recall */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-rose-600 mb-4 flex items-center">
            <span className="w-2 h-2 rounded-full bg-rose-600 mr-2"></span>
            Emergency Recall Circuit
          </h2>
          <form onSubmit={handleRecall} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Batch ID to Quarantine</label>
              <input
                type="text"
                placeholder="BAT-..."
                value={recallBatchId}
                onChange={(e) => setRecallBatchId(e.target.value)}
                required
                className="w-full text-sm font-mono border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
            </div>

            <p className="text-xs text-gray-500">
              Freezes any downstream transfers or consumer dispensing attempts on-chain instantly.
            </p>

            <button
              type="submit"
              disabled={txLoading}
              className="w-full bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold py-2.5 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {txLoading ? "Quarantining..." : "Trigger Batch Recall"}
            </button>
          </form>
        </div>
      </div>

      {/* Manufactured Inventory Feed */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Digital Packaging Inventory</h2>
            <p className="text-xs text-gray-500">
              Interactive medicine box cards simulating physical tamper-evident scratch foil packaging.
            </p>
          </div>
          <button
            onClick={syncChainStates}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold border border-indigo-200 bg-indigo-50 px-3 py-1.5 rounded-lg transition-all"
          >
            Refresh Chain States
          </button>
        </div>

        {boxes.length === 0 ? (
          <div className="text-center py-12 bg-white border border-dashed border-gray-300 rounded-xl text-gray-500 text-sm">
            No boxes generated yet. Use the form above to mint your first batch.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {boxes.map((box) => (
              <MedicineBoxCard
                key={box.unitId}
                unitId={box.unitId}
                batchId={box.batchId}
                medicineName={box.medicineName}
                plainPin={box.plainPin}
                state={box.state}
                isDispensed={box.isDispensed}
                nextCustodian={box.targetRecipient || null}
                isHandshakeAccepted={box.isAcceptedByDistributor || false}
                onVerifyClick={(uid, pin) => onSelectUnitForVerify && onSelectUnitForVerify(uid, pin)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};