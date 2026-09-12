import React, { useState, useEffect, useCallback } from "react";
import { useWeb3 } from "../context/Web3Context";
import { useTrustPharma } from "../hooks/useTrustPharma";
import { MedicineBoxCard } from "../components/box/MedicineBoxCard";

export const ConsumerView = ({ prefillUnitId = "", prefillPin = "" }) => {
  const { account, role } = useWeb3();
  const { getUnitDetails, getBatchDetails, verifyAndDispense, txLoading } = useTrustPharma();

  // Form State
  const [unitIdInput, setUnitIdInput] = useState(prefillUnitId);
  const [pinInput, setPinInput] = useState(prefillPin);

  // Active Packaging Simulation Object
  const [activeBox, setActiveBox] = useState(null);

  // Diagnostic Ledger Data (Zero-Gas)
  const [unitData, setUnitData] = useState(null);
  const [batchData, setBatchData] = useState(null);
  const [checkingUnit, setCheckingUnit] = useState(false);

  // Verdict Alerts
  const [justDispensedByMe, setJustDispensedByMe] = useState(false);
  const [dispenseSuccess, setDispenseSuccess] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Helper: Find box packaging data in local storage
  const findBoxInStorage = useCallback((targetId) => {
    const raw = localStorage.getItem("trustpharma_boxes");
    if (!raw) return null;
    try {
      const all = JSON.parse(raw);
      return all.find((b) => b.unitId.toLowerCase() === targetId.trim().toLowerCase()) || null;
    } catch {
      return null;
    }
  }, []);

  // Zero-Gas Inspection Query
  const handleInspect = useCallback(async (idToInspect = unitIdInput) => {
    const targetId = idToInspect.trim();
    if (!targetId) return;

    setCheckingUnit(true);
    setErrorMessage(null);

    try {
      const uDetails = await getUnitDetails(targetId);
      if (!uDetails || !uDetails.batchId) {
        setErrorMessage(`Unit "${targetId}" is not registered on the blockchain ledger.`);
        setUnitData(null);
        setBatchData(null);
        setActiveBox(null);
        return;
      }

      setUnitData(uDetails);

      const bDetails = await getBatchDetails(uDetails.batchId);
      setBatchData(bDetails);

      const storedBox = findBoxInStorage(targetId);
      if (storedBox) {
        setActiveBox({
          ...storedBox,
          state: uDetails.state,
          isDispensed: uDetails.isDispensed,
        });
      } else {
        setActiveBox({
          unitId: targetId,
          batchId: uDetails.batchId,
          medicineName: bDetails?.medicineName || "Pharmaceutical Unit",
          plainPin: "",
          state: uDetails.state,
          isDispensed: uDetails.isDispensed,
        });
      }
    } catch (err) {
      setErrorMessage("Failed to read unit details from ledger.");
    } finally {
      setCheckingUnit(false);
    }
  }, [unitIdInput, findBoxInStorage, getUnitDetails, getBatchDetails]);

  // Sync Prefill on Mount / Prop Change
  useEffect(() => {
    if (prefillUnitId) {
      setUnitIdInput(prefillUnitId);
      setJustDispensedByMe(false);
      setDispenseSuccess(null);
      handleInspect(prefillUnitId);
    }
    if (prefillPin) {
      setPinInput(prefillPin);
    }
  }, [prefillUnitId, prefillPin, handleInspect]);

  // Complete Input & State Reset
  const handleReset = () => {
    setUnitIdInput("");
    setPinInput("");
    setActiveBox(null);
    setUnitData(null);
    setBatchData(null);
    setDispenseSuccess(null);
    setJustDispensedByMe(false);
    setErrorMessage(null);
  };

  // Submit Scratch PIN to Authenticate & Dispense
  const handleDispense = async (e) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!account) {
      setErrorMessage("Please connect your MetaMask wallet to complete consumer dispensing.");
      return;
    }

    if (role === "PHARMACY" || role === "MANUFACTURER" || role === "DISTRIBUTOR") {
      setErrorMessage(
        `Supply chain actor wallet detected (${role}). Switch MetaMask to an ordinary consumer account to claim ownership.`
      );
      return;
    }

    if (!unitIdInput.trim() || !pinInput.trim()) {
      setErrorMessage("Both Unit ID and Scratch-Off PIN are strictly required.");
      return;
    }

    if (unitData?.isDispensed) {
      setErrorMessage(
        "🛑 COUNTERFEIT ALERT: This medicine unit was already verified and dispensed! The tamper seal is broken."
      );
      return;
    }

    try {
      await verifyAndDispense(unitIdInput.trim(), pinInput.trim());

      setJustDispensedByMe(true);
      setDispenseSuccess({
        unitId: unitIdInput.trim(),
        owner: account,
      });

      const raw = localStorage.getItem("trustpharma_boxes");
      if (raw) {
        const all = JSON.parse(raw);
        const updated = all.map((b) =>
          b.unitId.toLowerCase() === unitIdInput.trim().toLowerCase()
            ? { ...b, state: 3, isDispensed: true }
            : b
        );
        localStorage.setItem("trustpharma_boxes", JSON.stringify(updated));
      }

      const updatedDetails = await getUnitDetails(unitIdInput.trim());
      if (updatedDetails) {
        setUnitData(updatedDetails);
      }

      if (activeBox) {
        setActiveBox((prev) => ({
          ...prev,
          state: 3,
          isDispensed: true,
        }));
      }
    } catch (err) {
      setErrorMessage(err.reason || err.message || "Verification and dispense failed.");
    }
  };

  // Safe Timestamp Formatter
  const parseSafeDate = (rawTs) => {
    if (!rawTs) return null;
    try {
      const num = typeof rawTs === "bigint" ? Number(rawTs) : Number(rawTs);
      if (!num || isNaN(num) || num === 0) return null;
      return new Date(num * 1000);
    } catch {
      return null;
    }
  };

  const parsedExpiry = parseSafeDate(batchData?.expiryDate);
  const isExpired = parsedExpiry ? parsedExpiry.getTime() < Date.now() : false;
  const isRecalled = batchData?.isRecalled ?? false;
  const showCounterfeitWarning = unitData?.isDispensed && !justDispensedByMe;
  const isPrivilegedRole = role === "PHARMACY" || role === "MANUFACTURER" || role === "DISTRIBUTOR";

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-gray-900">Consumer Anti-Counterfeit Portal</h1>
            <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-amber-300">
              Zero-Trust Verification
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Scratch the tamper-evident foil on your medicine box to reveal the PIN, then authenticate on-chain.
          </p>
        </div>

        {account && (
          <div className="text-xs font-mono bg-gray-100 border border-gray-200 p-2.5 rounded-lg text-gray-700">
            <strong>Connected:</strong> {account.slice(0, 6)}...{account.slice(-4)}
            <span className="block text-[11px] text-gray-500 font-sans mt-0.5">
              Role: {role || "Consumer / Unregistered"}
            </span>
          </div>
        )}
      </div>

      {/* Verification Failure / Warning Alert */}
      {errorMessage && (
        <div className="bg-rose-50 border-l-4 border-rose-500 p-4 rounded-r-xl shadow-xs">
          <h3 className="text-sm font-bold text-rose-800">Verification Failure / Warning</h3>
          <p className="text-xs text-rose-700 mt-0.5">{errorMessage}</p>
        </div>
      )}

      {/* Genuine Medicine Success Verdict */}
      {justDispensedByMe && dispenseSuccess && (
        <div className="bg-emerald-50 border-l-4 border-emerald-500 p-4 rounded-r-xl shadow-xs">
          <h3 className="text-sm font-bold text-emerald-800">🎉 Authentic Medicine Confirmed & Dispensed!</h3>
          <p className="text-xs text-emerald-700 mt-0.5">
            Unit <strong>{dispenseSuccess.unitId}</strong> is 100% genuine. The single-use hash commitment has been safely burned on-chain. 
            Permanent ownership registered to consumer: <code className="font-mono">{dispenseSuccess.owner}</code>.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column (5 Cols): The Physical Box Card */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-1 flex items-center">
              <span className="w-2 h-2 rounded-full bg-indigo-600 mr-2"></span>
              Physical Box in Hand
            </h2>
            <p className="text-xs text-gray-500 mb-4">
              Scratch off the silver foil below. Scratching automatically syncs the revealed PIN to the verification form.
            </p>

            {activeBox ? (
              <div className="flex justify-center">
                <MedicineBoxCard
                  unitId={activeBox.unitId}
                  batchId={activeBox.batchId}
                  medicineName={activeBox.medicineName}
                  plainPin={activeBox.plainPin}
                  state={activeBox.state}
                  isDispensed={activeBox.isDispensed}
                  onScratchRevealed={(revealedPin) => setPinInput(revealedPin)}
                />
              </div>
            ) : (
              <div className="text-center py-12 border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                No physical box loaded yet. Enter any Serial ID on the right and click <strong>"Inspect"</strong> to pull its packaging.
              </div>
            )}
          </div>
        </div>

        {/* Right Column (7 Cols): Authentication Form & Diagnostics */}
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-5">
            {/* Authenticate Unit Header with Reset Button */}
            <div className="flex justify-between items-center border-b pb-3">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Authenticate Unit</h2>
                <p className="text-xs text-gray-500">
                  Confirm serial number, check ledger provenance, and finalize single-use burn.
                </p>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center space-x-1.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-2.5 py-1.5 rounded-lg border border-gray-300 transition-all shadow-2xs"
                title="Clear inputs and inspect a different unit"
              >
                <span>↺</span>
                <span>Reset</span>
              </button>
            </div>

            <form onSubmit={handleDispense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Unit Serial ID (Printed on Box)
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. BOX-AMX-001"
                    value={unitIdInput}
                    onChange={(e) => {
                      setUnitIdInput(e.target.value);
                      setJustDispensedByMe(false);
                      setDispenseSuccess(null);
                    }}
                    required
                    className="flex-1 text-sm font-mono border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => handleInspect()}
                    disabled={checkingUnit || !unitIdInput.trim()}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-lg border border-gray-300 transition-all disabled:opacity-50"
                  >
                    {checkingUnit ? "Checking..." : "Inspect (0 Gas)"}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Scratch-Off Secret PIN
                </label>
                <input
                  type="text"
                  placeholder="e.g. PIN-9X4A7L"
                  value={pinInput}
                  onChange={(e) => setPinInput(e.target.value)}
                  required
                  className="w-full text-sm font-mono border border-gray-300 rounded-lg p-2.5 tracking-wider focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              {/* Role Guard Warning */}
              {isPrivilegedRole && (
                <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3 rounded-lg text-xs">
                  <strong>Supply Chain Wallet Connected ({role}):</strong> Switch MetaMask to an ordinary consumer account so the customer signs and claims permanent on-chain ownership.
                </div>
              )}

              {/* Threat Warnings */}
              {isRecalled && (
                <div className="bg-rose-100 border border-rose-300 text-rose-800 p-2.5 rounded-lg text-xs font-bold">
                  🚨 RECALLED: This batch was recalled by the manufacturer! Do not consume!
                </div>
              )}
              {showCounterfeitWarning && (
                <div className="bg-rose-100 border border-rose-300 text-rose-800 p-2.5 rounded-lg text-xs font-bold">
                  🛑 COUNTERFEIT ALERT: This unit was already dispensed. The single-use hash commitment has already been burned!
                </div>
              )}
              {isExpired && (
                <div className="bg-amber-100 border border-amber-300 text-amber-800 p-2.5 rounded-lg text-xs font-bold">
                  ⚠️ EXPIRED: Medicine expiration date has passed!
                </div>
              )}

              <button
                type="submit"
                disabled={txLoading || isRecalled || isPrivilegedRole}
                className={`w-full text-white text-sm font-semibold py-3 rounded-lg shadow-sm transition-all disabled:opacity-50 ${
                  isRecalled || isPrivilegedRole
                    ? "bg-gray-400 cursor-not-allowed"
                    : showCounterfeitWarning
                    ? "bg-rose-600 hover:bg-rose-700"
                    : "bg-indigo-600 hover:bg-indigo-700"
                }`}
              >
                {txLoading
                  ? "Verifying & Burning Commitment..."
                  : showCounterfeitWarning
                  ? "Attempt Verification (Will Trigger Counterfeit Revert)"
                  : justDispensedByMe
                  ? "Already Dispensed in this Session (Click to Retest)"
                  : "Authenticate & Dispense (Consumer Sign)"}
              </button>
            </form>
          </div>

          {/* Ledger Diagnostic Report */}
          {unitData && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900 mb-3 flex items-center">
                <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
                On-Chain Provenance Report
              </h3>
              <div className="divide-y divide-gray-100 text-xs space-y-1">
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Medicine Name:</span>
                  <span className="font-bold text-gray-900">{batchData?.medicineName || "N/A"}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Batch ID:</span>
                  <span className="font-mono text-gray-900">{unitData.batchId}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Custodial State:</span>
                  <span className="font-semibold text-indigo-700">
                    {unitData.isDispensed
                      ? "Dispensed (Consumer Owned)"
                      : unitData.state === 0
                      ? "Manufactured (At Factory)"
                      : unitData.state === 1
                      ? "In-Transit (Supply Chain)"
                      : "At Pharmacy (Shelf Stocked)"}
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Expiry Date:</span>
                  <span className={`font-medium ${isExpired ? "text-rose-600 font-bold" : "text-gray-700"}`}>
                    {parsedExpiry ? parsedExpiry.toLocaleDateString() : "N/A"}
                  </span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Security Seal Status:</span>
                  <span className={unitData.isDispensed ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                    {unitData.isDispensed ? "BROKEN / BURNED" : "INTACT (Unopened)"}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};