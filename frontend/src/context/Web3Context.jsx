import React, { createContext, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";
import TrustPharmaArtifact from "../abi/TrustPharma.json";

const Web3Context = createContext();

export const Web3Provider = ({ children }) => {
  const [account, setAccount] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [readOnlyContract, setReadOnlyContract] = useState(null);
  const [role, setRole] = useState("GUEST"); // GUEST, MANUFACTURER, DISTRIBUTOR, PHARMACY, ADMIN
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false);
  const [loading, setLoading] = useState(false);

  const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS;
  const EXPECTED_CHAIN_ID = "0x7a69"; // 31337 in hex for Hardhat node

  // 1. Initialize Read-Only Instance (for zero-gas consumer checks)
  useEffect(() => {
    try {
      const localProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
      const rContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        TrustPharmaArtifact.abi,
        localProvider
      );
      setReadOnlyContract(rContract);
    } catch (err) {
      console.error("Failed to load read-only provider:", err);
    }
  }, [CONTRACT_ADDRESS]);

  // 2. Resolve Role for an Address
  const detectRole = async (targetContract, targetAddress) => {
    try {
      const ADMIN_ROLE = await targetContract.DEFAULT_ADMIN_ROLE();
      const MFG_ROLE = await targetContract.MANUFACTURER_ROLE();
      const DIST_ROLE = await targetContract.DISTRIBUTOR_ROLE();
      const PHARM_ROLE = await targetContract.PHARMACY_ROLE();

      const [isAdmin, isMfg, isDist, isPharm] = await Promise.all([
        targetContract.hasRole(ADMIN_ROLE, targetAddress),
        targetContract.hasRole(MFG_ROLE, targetAddress),
        targetContract.hasRole(DIST_ROLE, targetAddress),
        targetContract.hasRole(PHARM_ROLE, targetAddress),
      ]);

      if (isMfg) return "MANUFACTURER";
      if (isDist) return "DISTRIBUTOR";
      if (isPharm) return "PHARMACY";
      if (isAdmin) return "ADMIN";
      return "CONSUMER";
    } catch (err) {
      console.error("Role detection error:", err);
      return "CONSUMER";
    }
  };

  // 3. Connect Wallet
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("MetaMask not detected! Please install MetaMask.");
      return;
    }

    try {
      setLoading(true);
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      
      // Request accounts
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      const activeAccount = accounts[0];
      setAccount(activeAccount);

      // Verify Network
      const network = await browserProvider.getNetwork();
      const chainIdHex = "0x" + network.chainId.toString(16);
      setIsCorrectNetwork(chainIdHex === EXPECTED_CHAIN_ID || Number(network.chainId) === 31337);

      const activeSigner = await browserProvider.getSigner();
      setSigner(activeSigner);

      const instance = new ethers.Contract(
        CONTRACT_ADDRESS,
        TrustPharmaArtifact.abi,
        activeSigner
      );
      setContract(instance);

      const resolvedRole = await detectRole(instance, activeAccount);
      setRole(resolvedRole);
    } catch (err) {
      console.error("Connection failed:", err);
    } finally {
      setLoading(false);
    }
  };

  // 4. Switch to Hardhat Localhost Network automatically
  const switchNetwork = async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: EXPECTED_CHAIN_ID }],
      });
    } catch (switchError) {
      // If network doesn't exist in MetaMask, prompt to add it
      if (switchError.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: EXPECTED_CHAIN_ID,
              chainName: "Hardhat Localhost",
              rpcUrls: ["http://127.0.0.1:8545"],
              nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            },
          ],
        });
      }
    }
  };

  // 5. Account and Chain Change Listeners
  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts) => {
      if (accounts.length === 0) {
        setAccount(null);
        setSigner(null);
        setContract(null);
        setRole("GUEST");
      } else {
        await connectWallet();
      }
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, []);

  return (
    <Web3Context.Provider
      value={{
        account,
        signer,
        contract,
        readOnlyContract,
        role,
        isCorrectNetwork,
        loading,
        connectWallet,
        switchNetwork,
      }}
    >
      {children}
    </Web3Context.Provider>
  );
};

export const useWeb3 = () => useContext(Web3Context);