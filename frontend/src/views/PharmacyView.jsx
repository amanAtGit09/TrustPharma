import React, { useState, useEffect, useCallback } from "react";
import { useWeb3 } from "../context/Web3Context";
import { useTrustPharma } from "../hooks/useTrustPharma";
import { MedicineBoxCard } from "../components/box/MedicineBoxCard";

export const PharmacyView = ({ onSelectUnitForVerify }) => {
  const { account, role } = useWeb3();
  const { receiveCustody, getUnitDetails, txLoading } = useTrustPharma();

  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);
  const [pharmacyBoxes, setPharmacyBoxes] = useState([]);

  // Modal for Handing Over a Box to the Customer
  const [activeHandoverBox, setActiveHandoverBox] = useState(null);

  const syncPharmacyInventory = useCallback(async () => {
    const raw = localStorage.getItem("trustpharma_boxes");
    if (!raw) return;

    try {
      const allBoxes = JSON.parse(raw);
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

      localStorage.setItem("trustpharma_boxes", JSON.stringify(updated));
      setPharmacyBoxes(updated);
    } catch (err) {
      console.error("Error syncing pharmacy inventory:", err);
    }
  }, [getUnitDetails]);

  useEffect(() => {
    syncPharmacyInventory();
  }, [syncPharmacyInventory]);

  const handleAcceptDelivery = async (unitId) => {
    setStatusMessage(null);
    setErrorMessage(null);

    if (!account) {
      setErrorMessage("Please connect your authorized Pharmacy wallet first.");
      return;
    }

    try {
      setStatusMessage(`Accepting shipment for ${unitId}... Confirm in MetaMask.`);
      await receiveCustody(unitId);

      // Bind acceptance strictly to this pharmacy account
      const raw = localStorage.getItem("trustpharma_boxes");
      if (raw) {
        const all = JSON.parse(raw);
        const updated = all.map((b) =>
          b.unitId === unitId
            ? {
                ...b,
                state: 2,
                isAcceptedByPharmacy: true,
                acceptedByPharmacyAddress: account.toLowerCase(),
                currentCustodian: account,
              }
            : b
        );
        localStorage.setItem("trustpharma_boxes", JSON.stringify(updated));
      }

      setStatusMessage(`Unit ${unitId} accepted into retail inventory (State: AtPharmacy)!`);
      await syncPharmacyInventory();
    } catch (err) {
      setErrorMessage(err.reason || err.message || "Failed to accept shipment.");
    }
  };

  // --- Strict Address-Level Filtering ---
  const currentAcc = account ? account.toLowerCase() : null;

  // 1. Inbound Dock: Forwarded to this pharmacy, not yet accepted
  const inboundShipments = currentAcc
    ? pharmacyBoxes.filter(
        (b) =>
          b.state === 1 &&
          !b.isAcceptedByPharmacy &&
          b.targetPharmacy?.toLowerCase() === currentAcc
      )
    : [];

  // 2. All Shelf Inventory for this Pharmacy (Includes both active shelf stock and dispensed units)
  const allShelfBoxes = currentAcc
    ? pharmacyBoxes.filter(
        (b) =>
          b.isAcceptedByPharmacy &&
          b.acceptedByPharmacyAddress?.toLowerCase() === currentAcc
      )
    : [];

  // Sub-filters for KPI Metrics
  const readyOnShelfCount = allShelfBoxes.filter((b) => !b.isDispensed && b.state === 2).length;
  const dispensedCount = allShelfBoxes.filter((b) => b.isDispensed || b.state === 3).length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-gray-900">Pharmacy Retail Dispensing Station</h1>
            <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-emerald-300">
              Role: Pharmacy
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Receive wholesale shipments, manage retail shelf inventory, and track customer handovers.
          </p>
        </div>

        {!account ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 max-w-sm">
            <strong>Wallet Disconnected:</strong> Connect your Pharmacy wallet in MetaMask to manage stock.
          </div>
        ) : role !== "PHARMACY" ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 max-w-sm">
            <strong>Role Mismatch:</strong> Connected account (<code className="font-mono">{account.slice(0, 6)}...</code>) does not hold PHARMACY_ROLE.
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-800 max-w-sm font-mono">
            <strong>Connected Pharmacy:</strong> {account.slice(0, 8)}...{account.slice(-6)}
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

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase">Inbound From Distributor</div>
          <div className="text-2xl font-black text-amber-600 mt-1">{inboundShipments.length}</div>
          <div className="text-xs text-gray-400 mt-1">Awaiting pharmacy receipt handshake</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase">Ready On Shelf</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">{readyOnShelfCount}</div>
          <div className="text-xs text-gray-400 mt-1">Available for customer handover</div>
        </div>
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <div className="text-xs font-semibold text-gray-500 uppercase">Successfully Dispensed</div>
          <div className="text-2xl font-black text-gray-700 mt-1">{dispensedCount}</div>
          <div className="text-xs text-gray-400 mt-1">Verified and claimed by customers</div>
        </div>
      </div>

      {/* Inbound Shipments Feed */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900 flex items-center">
              <span className="w-2 h-2 rounded-full bg-amber-500 mr-2 animate-pulse"></span>
              Inbound Delivery Dock
            </h2>
            <p className="text-xs text-gray-500">
              Units shipped specifically to this pharmacy. Click "Accept into Shelf Stock" to confirm on-chain delivery.
            </p>
          </div>
          <button
            onClick={syncPharmacyInventory}
            disabled={!account}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold border border-indigo-200 bg-indigo-50 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
          >
            Refresh Inbound
          </button>
        </div>

        {!account ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
            Connect your pharmacy wallet to view shipments addressed to you.
          </div>
        ) : inboundShipments.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
            No incoming deliveries pending for this pharmacy address.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {inboundShipments.map((shipment) => (
              <div
                key={shipment.unitId}
                className="bg-gray-50 border border-gray-200 rounded-lg p-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start">
                    <span className="font-mono font-bold text-sm text-gray-900">{shipment.unitId}</span>
                    <span className="text-[10px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full">
                      In-Transit
                    </span>
                  </div>
                  <div className="text-xs font-semibold text-gray-700 mt-1">{shipment.medicineName}</div>
                  <div className="text-[11px] text-gray-500 font-mono">Batch: {shipment.batchId}</div>
                </div>

                <button
                  onClick={() => handleAcceptDelivery(shipment.unitId)}
                  disabled={txLoading}
                  className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold py-2 rounded-lg shadow-2xs transition-all disabled:opacity-50"
                >
                  {txLoading ? "Signing Delivery..." : "Accept into Shelf Stock"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* On-Shelf Retail Inventory */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Active Shelf Inventory</h2>
            <p className="text-xs text-gray-500">
              Units stocked at this pharmacy location. Dispensed units remain recorded with their consumer claim status.
            </p>
          </div>
          <button
            onClick={syncPharmacyInventory}
            disabled={!account}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold border border-indigo-200 bg-indigo-50 px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
          >
            Refresh Shelf
          </button>
        </div>

        {!account ? (
          <div className="text-center py-12 bg-white border border-dashed border-gray-300 rounded-xl text-gray-400 text-sm">
            Connect your pharmacy wallet to view active shelf inventory.
          </div>
        ) : allShelfBoxes.length === 0 ? (
          <div className="text-center py-12 bg-white border border-dashed border-gray-300 rounded-xl text-gray-500 text-sm">
            No medicine units currently stocked on this shelf. Accept an inbound delivery above to stock units.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allShelfBoxes.map((box) => (
              <div key={box.unitId} className="space-y-2">
                <MedicineBoxCard
                  unitId={box.unitId}
                  batchId={box.batchId}
                  medicineName={box.medicineName}
                  plainPin={box.plainPin}
                  state={box.state}
                  isDispensed={box.isDispensed}
                  nextCustodian={box.isDispensed ? box.currentCustodian : null}
                  isHandshakeAccepted={box.isDispensed}
                />

                {box.isDispensed ? (
                  <div className="w-full bg-gray-100 text-gray-600 border border-gray-200 text-xs font-semibold py-2 rounded-lg text-center select-none">
                    ✓ Dispensed & Claimed by Consumer
                  </div>
                ) : (
                  <button
                    onClick={() => setActiveHandoverBox(box)}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2 rounded-lg shadow-xs transition-all"
                  >
                    Hand Over to Customer (Open Box Card)
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Handover Modal */}
      {activeHandoverBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b pb-3">
              <h3 className="font-bold text-gray-900 text-base">Package Handover to Customer</h3>
              <button
                onClick={() => setActiveHandoverBox(null)}
                className="text-gray-400 hover:text-gray-600 font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-500">
              This digital card simulates the physical box given to the customer over the counter.
            </p>

            <div className="flex justify-center py-2">
              <MedicineBoxCard
                unitId={activeHandoverBox.unitId}
                batchId={activeHandoverBox.batchId}
                medicineName={activeHandoverBox.medicineName}
                plainPin={activeHandoverBox.plainPin}
                state={activeHandoverBox.state}
                isDispensed={activeHandoverBox.isDispensed}
              />
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  if (onSelectUnitForVerify) {
                    onSelectUnitForVerify(activeHandoverBox.unitId, "");
                  }
                  setActiveHandoverBox(null);
                }}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold py-2.5 rounded-lg shadow-sm transition-all"
              >
                Go to Consumer Portal with this Box →
              </button>
              <button
                onClick={() => setActiveHandoverBox(null)}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-lg transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};