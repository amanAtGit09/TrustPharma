import React, { useState } from "react";
import { useTrustPharma } from "../hooks/useTrustPharma";

const STATE_NAMES = {
  0: "Manufactured",
  1: "In-Transit",
  2: "At Pharmacy",
  3: "Dispensed",
};

export const ExplorerView = () => {
  const { getUnitDetails, getBatchDetails, getUnitLifecycleHistory } = useTrustPharma();

  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchedUnit, setSearchedUnit] = useState(null);
  const [searchedBatch, setSearchedBatch] = useState(null);
  const [eventHistory, setEventHistory] = useState([]);
  const [errorMessage, setErrorMessage] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();
    const query = searchQuery.trim();
    if (!query) return;

    setLoading(true);
    setErrorMessage(null);
    setSearchedUnit(null);
    setSearchedBatch(null);
    setEventHistory([]);

    try {
      // 1. Check if the query is a Unit ID
      const unit = await getUnitDetails(query);
      if (unit && unit.batchId) {
        setSearchedUnit(unit);
        const [batch, history] = await Promise.all([
          getBatchDetails(unit.batchId),
          getUnitLifecycleHistory(query),
        ]);
        setSearchedBatch(batch);
        setEventHistory(history);
        return;
      }

      // 2. Fallback: Check if the query is a Batch ID directly
      const batch = await getBatchDetails(query);
      if (batch && batch.medicineName) {
        setSearchedBatch(batch);
        return;
      }

      setErrorMessage(`No record found on-chain for query: "${query}"`);
    } catch (err) {
      console.error("Search failed:", err);
      setErrorMessage("Failed to read audit records from ledger.");
    } finally {
      setLoading(false);
    }
  };

  // Safe BigInt / Number timestamp parser
  const safeFormatTimestamp = (rawTs) => {
    if (!rawTs) return "N/A";
    try {
      const numericTs = typeof rawTs === "bigint" ? Number(rawTs) : Number(rawTs);
      if (isNaN(numericTs) || numericTs === 0) return "N/A";
      return new Date(numericTs * 1000).toLocaleString();
    } catch {
      return "N/A";
    }
  };

  const truncateAddress = (addr) => {
    if (!addr) return "N/A";
    return `${addr.substring(0, 8)}...${addr.substring(addr.length - 6)}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-gray-900">Ledger Explorer & Audit Trail</h1>
            <span className="bg-indigo-100 text-indigo-800 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-indigo-200">
              Zero-Gas Auditing
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Query complete on-chain custody handshakes and tamper-evident event timelines for any unit or batch.
          </p>
        </div>
      </div>

      {/* Search Input Bar */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="text"
            placeholder="Search by Unit ID (e.g., BOX-...) or Batch ID (e.g., BAT-...)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            required
            className="flex-1 text-sm font-mono border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-6 py-3 rounded-lg shadow-sm transition-all disabled:opacity-50"
          >
            {loading ? "Searching Ledger..." : "Audit Trail"}
          </button>
        </form>
      </div>

      {/* Error / Not Found Alert */}
      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm font-medium">
          {errorMessage}
        </div>
      )}

      {/* Metadata Cards Grid */}
      {(searchedBatch || searchedUnit) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Batch Metadata Card */}
          {searchedBatch && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="text-base font-bold text-gray-900 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-purple-600 mr-2"></span>
                  Batch Provenance Data
                </h3>
                {searchedBatch.isRecalled ? (
                  <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-rose-300">
                    RECALLED / QUARANTINED
                  </span>
                ) : (
                  <span className="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-300">
                    BATCH ACTIVE
                  </span>
                )}
              </div>

              <div className="divide-y divide-gray-100 text-xs space-y-1">
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Batch ID:</span>
                  <span className="font-mono font-bold text-gray-900">{searchedBatch.batchId}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Medicine Name:</span>
                  <span className="font-semibold text-gray-900">{searchedBatch.medicineName}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Authorized Manufacturer:</span>
                  <span className="font-mono text-gray-700">{truncateAddress(searchedBatch.manufacturer)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Production Date:</span>
                  <span className="text-gray-700">{safeFormatTimestamp(searchedBatch.manufacturingDate)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Expiration Date:</span>
                  <span className="text-gray-700 font-medium">{safeFormatTimestamp(searchedBatch.expiryDate)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Total Batch Size:</span>
                  <span className="text-gray-900 font-bold">
                    {searchedBatch.totalUnits ? searchedBatch.totalUnits.toString() : "0"} Units
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Unit Status Card */}
          {searchedUnit && (
            <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-4">
              <div className="flex justify-between items-center border-b pb-3">
                <h3 className="text-base font-bold text-gray-900 flex items-center">
                  <span className="w-2 h-2 rounded-full bg-blue-600 mr-2"></span>
                  Unit Ledger Status
                </h3>
                <span className="bg-blue-100 text-blue-800 text-xs px-2.5 py-0.5 rounded-full font-bold border border-blue-300">
                  {searchedUnit.isDispensed ? "Dispensed / Consumed" : STATE_NAMES[searchedUnit.state] || "Unknown"}
                </span>
              </div>

              <div className="divide-y divide-gray-100 text-xs space-y-1">
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Unit Serial No:</span>
                  <span className="font-mono font-bold text-gray-900">{searchedUnit.unitId}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Parent Batch:</span>
                  <span className="font-mono text-indigo-600 font-semibold">{searchedUnit.batchId}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Current Custodian:</span>
                  <span className="font-mono text-gray-700">{truncateAddress(searchedUnit.currentCustodian)}</span>
                </div>
                <div className="py-2 flex justify-between">
                  <span className="text-gray-500">Tamper Seal Commitment:</span>
                  <span className={searchedUnit.isDispensed ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                    {searchedUnit.isDispensed ? "Burned (bytes32(0))" : "Active On-Chain Hash"}
                  </span>
                </div>
               <div className="py-2 flex justify-between">
                <span className="text-gray-500">Expired Status:</span>
                <span className={searchedUnit.isExpired ? "text-rose-600 font-bold" : "text-emerald-600 font-semibold"}>
                  {searchedUnit.isExpired ? "Expired" : "Valid (Not Expired)"}
                </span>
              </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chronological Event Stepper */}
      {searchedUnit && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-bold text-gray-900 mb-6 flex items-center">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2"></span>
            Custodial Event Timeline (Immutable Logs)
          </h3>

          {eventHistory.length === 0 ? (
            <div className="text-xs text-gray-400 py-4 border-t border-dashed">
              No transition event logs emitted yet for this unit.
            </div>
          ) : (
            <div className="relative border-l-2 border-indigo-200 ml-4 pl-6 space-y-8">
              {eventHistory.map((evt, idx) => (
                <div key={evt.txHash + idx} className="relative group">
                  <div className="absolute -left-8 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white bg-indigo-600 shadow-sm"></div>

                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 shadow-2xs">
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-1 mb-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                        {evt.type === "TRANSFER"
                          ? `Custody Handshake: ${STATE_NAMES[evt.state] || "Transfer"}`
                          : "Final Verification: Unit Dispensed"}
                      </span>
                      <span className="text-[11px] font-mono text-gray-500">
                        {safeFormatTimestamp(evt.timestamp)}
                      </span>
                    </div>

                    {evt.type === "TRANSFER" ? (
                      <div className="text-xs text-gray-600 space-y-1 font-mono">
                        <div>From: <span className="text-gray-800">{truncateAddress(evt.from)}</span></div>
                        <div>To:   <span className="text-gray-800">{truncateAddress(evt.to)}</span></div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-600 space-y-1 font-mono">
                        <div>Consumer Owner: <span className="text-emerald-700 font-bold">{truncateAddress(evt.consumer)}</span></div>
                        <div>Status: <span className="text-rose-600 font-semibold">Single-Use Hash Commitment Burned</span></div>
                      </div>
                    )}

                    <div className="mt-2 pt-2 border-t border-gray-200 flex flex-col sm:flex-row justify-between text-[11px] text-gray-400 font-mono">
                      <span>Tx: {truncateAddress(evt.txHash)}</span>
                      <span>Block #{evt.blockNumber ? evt.blockNumber.toString() : "0"}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};