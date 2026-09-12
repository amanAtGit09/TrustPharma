import React, { useState, useEffect, useCallback } from "react";
import { useWeb3 } from "../context/Web3Context";
import { useTrustPharma } from "../hooks/useTrustPharma";
import { MedicineBoxCard } from "../components/box/MedicineBoxCard";

export const DistributorView = ({ onSelectUnitForVerify }) => {
  const { account, role } = useWeb3();
  const { transferCustody, receiveCustody, getUnitDetails, txLoading } = useTrustPharma();

  // Forwarding Form State
  const [pharmacyAddress, setPharmacyAddress] = useState("");
  const [selectedUnitForForward, setSelectedUnitForForward] = useState("");

  // UI Feedback
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Local units tracked in distributor view
  const [distributorBoxes, setDistributorBoxes] = useState([]);

  // Load and sync inventory from localStorage and on-chain
  const syncDistributorInventory = useCallback(async () => {
    const raw = localStorage.getItem("trustpharma_boxes");
    if (!raw) return;

    try {
      const allBoxes = JSON.parse(raw);

      // Fetch latest on-chain status for each box
      const updated = await Promise.all(
        allBoxes.map(async (box) => {
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

      // Persist latest verified chain states
      localStorage.setItem("trustpharma_boxes", JSON.stringify(updated));
      setDistributorBoxes(updated);
    } catch (err) {
      console.error("Error syncing distributor inventory:", err);
    }
  }, [getUnitDetails]);

  useEffect(() => {
    syncDistributorInventory();
  }, [syncDistributorInventory]);

  // Accept incoming shipment from Manufacturer (receiveCustody)
  const handleAcceptDelivery = async (unitId) => {
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      setStatusMessage(`Signing proof of delivery for ${unitId}... Confirm in MetaMask.`);
      await receiveCustody(unitId);

      // Mark locally that this specific distributor accepted custody
      const raw = localStorage.getItem("trustpharma_boxes");
      if (raw) {
        const all = JSON.parse(raw);
        const updated = all.map((b) =>
          b.unitId === unitId
            ? {
                ...b,
                isAcceptedByDistributor: true,
                acceptedByDistributorAddress: account.toLowerCase(),
                currentCustodian: account,
              }
            : b
        );
        localStorage.setItem("trustpharma_boxes", JSON.stringify(updated));
      }

      setStatusMessage(`Shipment ${unitId} accepted into your distributor warehouse!`);
      await syncDistributorInventory();
    } catch (err) {
      setErrorMessage(err.message || "Failed to accept shipment.");
    }
  };

  // Forward unit to Pharmacy (transferCustody)
  const handleForwardToPharmacy = async (e) => {
    e.preventDefault();
    setStatusMessage(null);
    setErrorMessage(null);

    if (!selectedUnitForForward || !pharmacyAddress) {
      setErrorMessage("Select a warehouse unit and provide an authorized pharmacy address.");
      return;
    }

    try {
      setStatusMessage(`Forwarding unit ${selectedUnitForForward} to pharmacy... Confirm in MetaMask.`);
      await transferCustody(selectedUnitForForward, pharmacyAddress.trim());

      // Update local tracking with downstream pharmacy recipient
      const raw = localStorage.getItem("trustpharma_boxes");
      if (raw) {
        const all = JSON.parse(raw);
        const updated = all.map((b) =>
          b.unitId === selectedUnitForForward
            ? {
                ...b,
                state: 1,
                targetPharmacy: pharmacyAddress.trim().toLowerCase(),
                isAcceptedByPharmacy: false,
              }
            : b
        );
        localStorage.setItem("trustpharma_boxes", JSON.stringify(updated));
      }

      setStatusMessage(`Unit ${selectedUnitForForward} dispatched to ${pharmacyAddress}. State: In-Transit.`);
      setSelectedUnitForForward("");
      await syncDistributorInventory();
    } catch (err) {
      setErrorMessage(err.message || "Forwarding failed.");
    }
  };

  // --- Strict Address-Level Filtering ---
  const currentAcc = account ? account.toLowerCase() : null;

  // 1. Inbound Dock: STRICTLY units sent to THIS connected wallet address that are pending signature
  const incomingShipments = currentAcc
    ? distributorBoxes.filter(
        (b) =>
          b.state === 1 &&
          !b.isAcceptedByDistributor &&
          b.targetRecipient?.toLowerCase() === currentAcc
      )
    : [];

  // 2. Ready to Forward: STRICTLY units accepted by THIS distributor that haven't been forwarded yet
  const inStockWarehouse = currentAcc
    ? distributorBoxes.filter(
        (b) =>
          b.isAcceptedByDistributor &&
          b.acceptedByDistributorAddress?.toLowerCase() === currentAcc &&
          !b.targetPharmacy
      )
    : [];

  // 3. Distributor Warehouse Inventory: STRICTLY units that were accepted by THIS specific distributor address
  const visibleDistributorBoxes = currentAcc
    ? distributorBoxes.filter(
        (b) =>
          b.isAcceptedByDistributor &&
          b.acceptedByDistributorAddress?.toLowerCase() === currentAcc
      )
    : [];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-gray-900">Distributor Logistics Terminal</h1>
            <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-blue-300">
              Role: Distributor
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Accept custody handshakes from manufacturers, manage logistics stock, and forward to authorized pharmacies.
          </p>
        </div>

        {!account ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 max-w-sm">
            <strong>Wallet Disconnected:</strong> Connect your MetaMask wallet to view your pending shipments and warehouse stock.
          </div>
        ) : role !== "DISTRIBUTOR" ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 max-w-sm">
            <strong>Role Mismatch:</strong> Connected account (<code className="font-mono">{account.slice(0, 6)}...</code>) does not hold DISTRIBUTOR_ROLE.
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 max-w-sm font-mono">
            <strong>Connected Distributor:</strong> {account.slice(0, 8)}...{account.slice(-6)}
          </div>
        )}
      </div>

      {/* Global Status Alerts */}
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

      {/* Action Zone: Inbound Dock & Forwarding Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Dock 1: Inbound Shipments */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-900 flex items-center">
                <span className="w-2 h-2 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
                Inbound Shipments Dock
              </h2>
              <span className="text-xs bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 rounded-full border border-amber-200">
                {incomingShipments.length} Awaiting Signature
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-4">
              Units dispatched specifically to your connected address. Click <strong>"Accept Delivery"</strong> to confirm the physical receipt handshake.
            </p>

            {!account ? (
              <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                Please connect your MetaMask wallet to view shipments addressed to you.
              </div>
            ) : incomingShipments.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                No incoming deliveries pending for this wallet address.
              </div>
            ) : (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {incomingShipments.map((shipment) => (
                  <div
                    key={shipment.unitId}
                    className="flex justify-between items-center bg-gray-50 border border-gray-200 rounded-lg p-3"
                  >
                    <div>
                      <div className="font-mono font-bold text-sm text-gray-900">{shipment.unitId}</div>
                      <div className="text-xs text-gray-500">{shipment.medicineName} • {shipment.batchId}</div>
                    </div>
                    <button
                      onClick={() => handleAcceptDelivery(shipment.unitId)}
                      disabled={txLoading}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-2xs transition-all disabled:opacity-50"
                    >
                      {txLoading ? "Signing..." : "Accept Delivery"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dock 2: Forward to Pharmacy */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
            <span className="w-2 h-2 rounded-full bg-blue-600 mr-2"></span>
            Forward to Pharmacy
          </h2>
          <form onSubmit={handleForwardToPharmacy} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Select Accepted Warehouse Unit
              </label>
              <select
                value={selectedUnitForForward}
                onChange={(e) => setSelectedUnitForForward(e.target.value)}
                required
                disabled={!account || inStockWarehouse.length === 0}
                className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">-- Choose Stocked Unit --</option>
                {inStockWarehouse.map((b) => (
                  <option key={b.unitId} value={b.unitId}>
                    {b.unitId} ({b.medicineName})
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-gray-400 mt-1">
                Only units accepted by this connected wallet appear in this dropdown.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                Authorized Pharmacy Address
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={pharmacyAddress}
                onChange={(e) => setPharmacyAddress(e.target.value)}
                required
                disabled={!account}
                className="w-full text-sm font-mono border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-100"
              />
            </div>

            <button
              type="submit"
              disabled={txLoading || !account || inStockWarehouse.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold py-2.5 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {txLoading ? "Forwarding..." : "Forward Custody to Pharmacy"}
            </button>
          </form>
        </div>
      </div>

      {/* Distributor Warehouse Inventory Feed */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Distributor Warehouse Inventory</h2>
            <p className="text-xs text-gray-500">
              Units signed and stored in this distributor's inventory.
            </p>
          </div>
          <button
            onClick={syncDistributorInventory}
            disabled={!account}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold border border-indigo-200 bg-indigo-50 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
          >
            Refresh Warehouse Data
          </button>
        </div>

        {!account ? (
          <div className="text-center py-12 bg-white border border-dashed border-gray-300 rounded-xl text-gray-400 text-sm">
            Connect your distributor wallet to view your warehouse stock.
          </div>
        ) : visibleDistributorBoxes.length === 0 ? (
          <div className="text-center py-12 bg-white border border-dashed border-gray-300 rounded-xl text-gray-500 text-sm">
            No units in warehouse stock for this distributor address. Accept inbound shipments above to add inventory.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {visibleDistributorBoxes.map((box) => (
              <MedicineBoxCard
                key={box.unitId}
                unitId={box.unitId}
                batchId={box.batchId}
                medicineName={box.medicineName}
                plainPin={box.plainPin}
                state={box.state}
                isDispensed={box.isDispensed}
                nextCustodian={box.targetPharmacy || null}
                isHandshakeAccepted={box.isAcceptedByPharmacy || false}
                onVerifyClick={(uid, pin) => onSelectUnitForVerify && onSelectUnitForVerify(uid, pin)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};