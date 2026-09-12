import React, { useState } from "react";
import { useWeb3 } from "../../context/Web3Context";

export const AdminModal = ({ isOpen, onClose }) => {
  const { contract, account, role } = useWeb3();

  const [targetAddress, setTargetAddress] = useState("");
  const [selectedRole, setSelectedRole] = useState("MANUFACTURER");
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  if (!isOpen) return null;

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
      setStatusMsg(`Granting ${selectedRole} to ${targetAddress.slice(0, 6)}... Confirm in MetaMask.`);

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
      setStatusMsg(`Revoking ${selectedRole} from ${targetAddress.slice(0, 6)}... Confirm in MetaMask.`);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl space-y-5">
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b pb-3">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-rose-600"></span>
            <h3 className="font-bold text-gray-900 text-lg">Admin Ecosystem Access Control</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 font-bold text-lg"
          >
            ✕
          </button>
        </div>

        <p className="text-xs text-gray-500">
          Provision new participants into the supply chain ecosystem. Only the deployer (<code className="font-mono">{account?.slice(0, 8)}...</code>) holding <code className="font-mono">DEFAULT_ADMIN_ROLE</code> can sign these transactions.
        </p>

        {/* Alerts */}
        {statusMsg && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-lg text-xs font-medium">
            {statusMsg}
          </div>
        )}
        {errorMsg && (
          <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-lg text-xs font-medium">
            {errorMsg}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleGrantRole} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
              Select Supply Chain Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full text-sm border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-rose-500 focus:outline-none"
            >
              <option value="MANUFACTURER">MANUFACTURER_ROLE (Mint & Dispatch)</option>
              <option value="DISTRIBUTOR">DISTRIBUTOR_ROLE (Logistics Transit)</option>
              <option value="PHARMACY">PHARMACY_ROLE (Retail Handover)</option>
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

          <div className="flex gap-3 pt-2">
            <button
              type="submit"
              disabled={loading || !targetAddress.trim()}
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold py-2.5 rounded-lg shadow-sm transition-all disabled:opacity-50"
            >
              {loading ? "Transacting..." : `Grant ${selectedRole}`}
            </button>
            <button
              type="button"
              onClick={handleRevokeRole}
              disabled={loading || !targetAddress.trim()}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold px-4 py-2.5 rounded-lg transition-all disabled:opacity-50"
            >
              Revoke
            </button>
          </div>
        </form>

        <div className="border-t border-gray-100 pt-3 flex justify-end">
          <button
            onClick={onClose}
            className="text-xs text-gray-500 hover:text-gray-800 font-medium"
          >
            Close Window
          </button>
        </div>
      </div>
    </div>
  );
};