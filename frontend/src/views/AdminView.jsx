import React, { useState } from "react";
import { useWeb3 } from "../context/Web3Context";

export const AdminView = () => {
  const { contract, account, role } = useWeb3();

  const [targetAddress, setTargetAddress] = useState("");
  const [selectedRole, setSelectedRole] = useState("MANUFACTURER");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const getRoleHash = async (roleName) => {
    if (!contract) return null;
    switch (roleName) {
      case "MANUFACTURER":
        return await contract.MANUFACTURER_ROLE();
      case "DISTRIBUTOR":
        return await contract.DISTRIBUTOR_ROLE();
      case "PHARMACY":
        return await contract.PHARMACY_ROLE();
      default:
        return null;
    }
  };

  const handleGrantRole = async (e) => {
    e.preventDefault();
    setStatusMsg(null);
    setErrorMsg(null);

    if (!contract) {
      setErrorMsg("Contract not connected.");
      return;
    }

    try {
      setLoading(true);
      const roleHash = await getRoleHash(selectedRole);
      setStatusMsg(`Granting ${selectedRole} to ${targetAddress.slice(0, 8)}... Confirm in MetaMask.`);

      const tx = await contract.grantRole(roleHash, targetAddress.trim());
      await tx.wait();

      setStatusMsg(`Successfully granted ${selectedRole} to ${targetAddress}!`);
      setTargetAddress("");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.reason || err.message || "Failed to grant role.");
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeRole = async () => {
    setStatusMsg(null);
    setErrorMsg(null);

    if (!contract || !targetAddress.trim()) {
      setErrorMsg("Specify target address to revoke role.");
      return;
    }

    try {
      setLoading(true);
      const roleHash = await getRoleHash(selectedRole);
      setStatusMsg(`Revoking ${selectedRole} from ${targetAddress.slice(0, 8)}... Confirm in MetaMask.`);

      const tx = await contract.revokeRole(roleHash, targetAddress.trim());
      await tx.wait();

      setStatusMsg(`Successfully revoked ${selectedRole} from ${targetAddress}!`);
      setTargetAddress("");
    } catch (err) {
      console.error(err);
      setErrorMsg(err.reason || err.message || "Failed to revoke role.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header Banner */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-gray-900">Ecosystem Access Control</h1>
            <span className="bg-rose-100 text-rose-800 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-rose-300">
              Admin Terminal
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Authorize and manage cryptographic permissions across manufacturers, distributors, and retail pharmacies.
          </p>
        </div>

        {account && (
          <div className="text-xs font-mono bg-gray-50 border border-gray-200 p-2.5 rounded-lg text-gray-700">
            <strong>Current Signer:</strong> {account.slice(0, 8)}...{account.slice(-6)}
            <span className="block text-[11px] text-gray-500 font-sans mt-0.5">
              Active Role: {role || "No Privileged Role"}
            </span>
          </div>
        )}
      </div>

      {/* Role Permission Disclaimer */}
      {role !== "ADMIN" && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl">
          <h3 className="text-sm font-bold text-amber-900">Privilege Warning</h3>
          <p className="text-xs text-amber-800 mt-0.5">
            Your connected account does not hold the contract’s <code className="font-mono font-bold">DEFAULT_ADMIN_ROLE</code>. 
            Role grant or revoke transactions will revert unless submitted by the deployer wallet (Account #0).
          </p>
        </div>
      )}

      {/* Status & Error Alerts */}
      {statusMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-xl text-sm font-medium">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 px-4 py-3 rounded-xl text-sm font-medium">
          {errorMsg}
        </div>
      )}

      {/* Role Management Card */}
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm space-y-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Manage Actor Permissions</h2>
          <p className="text-xs text-gray-500">
            Select a target supply chain role and provide the Ethereum address to grant or revoke on-chain authority.
          </p>
        </div>

        <form onSubmit={handleGrantRole} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Select Supply Chain Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            >
              <option value="MANUFACTURER">MANUFACTURER_ROLE (Mint & Dispatch Batches)</option>
              <option value="DISTRIBUTOR">DISTRIBUTOR_ROLE (Warehouse Receipt & Logistics Transit)</option>
              <option value="PHARMACY">PHARMACY_ROLE (Retail Handover & Shelf Stocking)</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Target Wallet Address
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={targetAddress}
              onChange={(e) => setTargetAddress(e.target.value)}
              required
              className="w-full text-sm font-mono border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            />
          </div>

          <div className="flex gap-4 pt-2">
            <button
              type="submit"
              disabled={loading || !targetAddress.trim()}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold py-2.5 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {loading ? "Transacting On-Chain..." : `Grant ${selectedRole}`}
            </button>
            <button
              type="button"
              onClick={handleRevokeRole}
              disabled={loading || !targetAddress.trim()}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-semibold px-6 py-2.5 rounded-lg transition-all disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
        </form>
      </div>

      {/* Role Architecture Reference Guide */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 shadow-2xs space-y-3">
        <h3 className="text-sm font-bold text-gray-900">Ecosystem Role Architecture</h3>
        <ul className="text-xs text-gray-600 space-y-2 list-disc list-inside">
          <li>
            <strong className="text-gray-800">Manufacturer:</strong> Authorized to call <code className="font-mono">createBatch</code> and initialize single-use secret commitments.
          </li>
          <li>
            <strong className="text-gray-800">Distributor:</strong> Authorized to accept custody from manufacturers and forward units to verified pharmacies.
          </li>
          <li>
            <strong className="text-gray-800">Pharmacy:</strong> Authorized to accept wholesale deliveries and stock units for consumer handover.
          </li>
          <li>
            <strong className="text-gray-800">Consumer:</strong> Public & open access. Any Ethereum wallet can burn PIN commitments via <code className="font-mono">verifyAndDispense</code> without prior registration.
          </li>
        </ul>
      </div>
    </div>
  );
};