import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { useWeb3 } from "../context/Web3Context";

export const useTrustPharma = () => {
  const { contract, readOnlyContract, account } = useWeb3();
  const [txLoading, setTxLoading] = useState(false);
  const [error, setError] = useState(null);

  // Active contract instance (prefers signer contract, falls back to read-only)
  const activeContract = contract || readOnlyContract;

  // Helper to parse custom Solidity revert errors into readable messages
  const parseContractError = (err) => {
    if (err.info?.error?.data) {
      // Decode custom errors if available via interface
      try {
        const decoded = activeContract.interface.parseError(err.info.error.data);
        return `${decoded.name}: ${decoded.args ? decoded.args.join(", ") : "Reverted"}`;
      } catch {
        // Fallback if decode fails
      }
    }
    if (err.reason) return err.reason;
    if (err.message) {
      if (err.message.includes("AccessControlUnauthorizedAccount")) {
        return "Unauthorized Account: You do not have permission for this action.";
      }
      if (err.message.includes("UnitAlreadyDispensed")) {
        return "Counterfeit Alert: This unit was already dispensed!";
      }
      if (err.message.includes("InvalidPinOrAlreadyDispensed")) {
        return "Verification Failed: Invalid scratch-off PIN or unit consumed.";
      }
      if (err.message.includes("UnauthorizedRecipientRole")) {
        return "Diversion Warning: Recipient does not hold authorized downstream role.";
      }
      if (err.message.includes("BatchRecalledError")) {
        return "Quarantine Notice: Batch has been recalled by manufacturer.";
      }
      if (err.message.includes("user rejected action")) {
        return "Transaction cancelled by user in MetaMask.";
      }
    }
    return err.message || "Transaction failed";
  };

  // 1. Manufacturer: Mint a new batch with auto-generated units
  const createBatch = async (batchId, medicineName, expTimestamp, unitIds, secretHashes) => {
    if (!contract) throw new Error("Wallet not connected with signing privileges");
    setTxLoading(true);
    setError(null);
    try {
      const tx = await contract.createBatch(
        batchId,
        medicineName,
        expTimestamp,
        unitIds,
        secretHashes
      );
      const receipt = await tx.wait();
      return receipt;
    } catch (err) {
      const msg = parseContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setTxLoading(false);
    }
  };

  // 2. Transfer Custody (Manufacturer -> Distributor OR Distributor -> Pharmacy)
  const transferCustody = async (unitId, recipientAddress) => {
    if (!contract) throw new Error("Wallet not connected with signing privileges");
    setTxLoading(true);
    setError(null);
    try {
      const tx = await contract.transferCustody(unitId, recipientAddress);
      const receipt = await tx.wait();
      return receipt;
    } catch (err) {
      const msg = parseContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setTxLoading(false);
    }
  };

  // 3. Receive Custody (Distributor accepts delivery OR Pharmacy accepts shelf delivery)
  const receiveCustody = async (unitId) => {
    if (!contract) throw new Error("Wallet not connected with signing privileges");
    setTxLoading(true);
    setError(null);
    try {
      const tx = await contract.receiveCustody(unitId);
      const receipt = await tx.wait();
      return receipt;
    } catch (err) {
      const msg = parseContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setTxLoading(false);
    }
  };

  // 4. Consumer: Reveal scratch-off PIN and finalize dispense
  const verifyAndDispense = async (unitId, plainPin) => {
    if (!contract) throw new Error("Wallet not connected. Connect wallet to claim ownership.");
    setTxLoading(true);
    setError(null);
    try {
      const tx = await contract.verifyAndDispense(unitId, plainPin);
      const receipt = await tx.wait();
      return receipt;
    } catch (err) {
      const msg = parseContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setTxLoading(false);
    }
  };

  // 5. Manufacturer: Trigger emergency recall
  const recallBatch = async (batchId) => {
    if (!contract) throw new Error("Wallet not connected with signing privileges");
    setTxLoading(true);
    setError(null);
    try {
      const tx = await contract.recallBatch(batchId);
      const receipt = await tx.wait();
      return receipt;
    } catch (err) {
      const msg = parseContractError(err);
      setError(msg);
      throw new Error(msg);
    } finally {
      setTxLoading(false);
    }
  };

  // 6. Zero-Gas Read: Get Unit Details
  const getUnitDetails = useCallback(
    async (unitId) => {
      if (!activeContract) return null;
      try {
        const data = await activeContract.getUnitDetails(unitId);
        if (!data) return null;

        // Solidity returns: unitId(0), batchId(1), currentCustodian(2), state(3), isDispensed(4), isExpired(5), isRecalled(6)
        const rawUnitId = data.unitId ?? data[0];
        const rawBatchId = data.batchId ?? data[1];
        const rawCustodian = data.currentCustodian ?? data[2];
        const rawState = data.state ?? data[3];
        const rawIsDispensed = data.isDispensed ?? data[4];
        const rawIsExpired = data.isExpired ?? data[5];
        const rawIsRecalled = data.isRecalled ?? data[6];

        return {
          unitId: rawUnitId,
          batchId: rawBatchId,
          currentCustodian: rawCustodian,
          state: Number(rawState ?? 0),
          isDispensed: Boolean(rawIsDispensed),
          isExpired: Boolean(rawIsExpired),
          isRecalled: Boolean(rawIsRecalled),
        };
      } catch (err) {
        console.error(`Error fetching unit ${unitId}:`, err);
        return null;
      }
    },
    [activeContract]
  );

  // 7. Zero-Gas Read: Get Batch Details
  const getBatchDetails = useCallback(
    async (batchId) => {
      if (!activeContract) return null;
      try {
        const data = await activeContract.getBatchDetails(batchId);
        if (!data) return null;

        // Solidity returns: batchId(0), medicineName(1), mfgDate(2), expDate(3), totalUnits(4), manufacturer(5), isRecalled(6)
        const rawBatchId = data.batchId ?? data[0];
        const rawMedicineName = data.medicineName ?? data[1];
        const rawMfgDate = data.mfgDate ?? data[2];
        const rawExpDate = data.expDate ?? data[3];
        const rawTotalUnits = data.totalUnits ?? data[4];
        const rawManufacturer = data.manufacturer ?? data[5];
        const rawIsRecalled = data.isRecalled ?? data[6];

        return {
          batchId: rawBatchId,
          medicineName: rawMedicineName,
          manufacturingDate: rawMfgDate ? Number(rawMfgDate) : 0,
          expiryDate: rawExpDate ? Number(rawExpDate) : 0,
          totalUnits: rawTotalUnits ? Number(rawTotalUnits) : 0,
          manufacturer: rawManufacturer,
          isRecalled: Boolean(rawIsRecalled),
        };
      } catch (err) {
        console.error(`Error fetching batch ${batchId}:`, err);
        return null;
      }
    },
    [activeContract]
  );

  // 8. Event Audit Query: Fetch all lifecycle logs for a specific unit
  const getUnitLifecycleHistory = useCallback(
    async (unitId) => {
      if (!activeContract) return [];
      try {
        const transferFilter = activeContract.filters.CustodyTransferred(unitId);
        const dispenseFilter = activeContract.filters.UnitDispensed(unitId);

        const [transferLogs, dispenseLogs] = await Promise.all([
          activeContract.queryFilter(transferFilter, 0, "latest"),
          activeContract.queryFilter(dispenseFilter, 0, "latest"),
        ]);

        const history = [];

        for (const log of transferLogs) {
          const block = await log.getBlock();
          history.push({
            type: "TRANSFER",
            from: log.args[1],
            to: log.args[2],
            state: Number(log.args[3]),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp: block.timestamp,
          });
        }

        for (const log of dispenseLogs) {
          const block = await log.getBlock();
          history.push({
            type: "DISPENSED",
            consumer: log.args[1],
            dispensedAt: Number(log.args[2]),
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            timestamp: block.timestamp,
          });
        }

        return history.sort((a, b) => a.timestamp - b.timestamp);
      } catch (err) {
        console.error(`Error querying event logs for unit ${unitId}:`, err);
        return [];
      }
    },
    [activeContract]
  );

  return {
    createBatch,
    transferCustody,
    receiveCustody,
    verifyAndDispense,
    recallBatch,
    getUnitDetails,
    getBatchDetails,
    getUnitLifecycleHistory,
    txLoading,
    error,
  };
};