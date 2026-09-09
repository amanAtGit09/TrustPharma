import hre from "hardhat";

async function main() {
  console.log("----------------------------------------------------");
  console.log("Starting TrustPharma Deployment Pipeline...");
  console.log("----------------------------------------------------");

  // 1. Establish connection to the running Hardhat v3 network node
  const connection = await (hre as any).network.getOrCreate();
  const { ethers } = connection;

  // 2. Fetch standard test accounts provided by the local node
  const signers = await ethers.getSigners();
  const [admin, manufacturer, distributor, pharmacy, consumer] = signers;

  console.log("Deployer / Admin Address:       ", admin.address);
  console.log("Designated Manufacturer Address:", manufacturer.address);
  console.log("Designated Distributor Address: ", distributor.address);
  console.log("Designated Pharmacy Address:    ", pharmacy.address);
  console.log("Designated Consumer Address:    ", consumer.address);
  console.log("----------------------------------------------------");

  // 3. Deploy TrustPharma.sol
  console.log("Deploying TrustPharma contract...");
  const TrustPharmaFactory = await ethers.getContractFactory("TrustPharma");
  const trustPharma = await TrustPharmaFactory.connect(admin).deploy();
  await trustPharma.waitForDeployment();

  const contractAddress = await trustPharma.getAddress();
  console.log(`TrustPharma successfully deployed to: ${contractAddress}`);
  console.log("----------------------------------------------------");

  // 4. Fetch Role Identifiers
  const MANUFACTURER_ROLE = await trustPharma.MANUFACTURER_ROLE();
  const DISTRIBUTOR_ROLE  = await trustPharma.DISTRIBUTOR_ROLE();
  const PHARMACY_ROLE     = await trustPharma.PHARMACY_ROLE();

  // 5. Seed Initial Supply Chain Ecosystem Roles
  console.log("Provisioning ecosystem roles...");
  let tx = await trustPharma.connect(admin).grantRole(MANUFACTURER_ROLE, manufacturer.address);
  await tx.wait();
  console.log(`[Granted] MANUFACTURER_ROLE -> ${manufacturer.address}`);

  tx = await trustPharma.connect(admin).grantRole(DISTRIBUTOR_ROLE, distributor.address);
  await tx.wait();
  console.log(`[Granted] DISTRIBUTOR_ROLE  -> ${distributor.address}`);

  tx = await trustPharma.connect(admin).grantRole(PHARMACY_ROLE, pharmacy.address);
  await tx.wait();
  console.log(`[Granted] PHARMACY_ROLE     -> ${pharmacy.address}`);
  console.log("----------------------------------------------------");

  // 6. Output Config Block for Frontend Integration
  console.log("COPY THESE DETAILS FOR YOUR FRONTEND ENVIRONMENT (.env):");
  console.log(`REACT_APP_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("----------------------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Deployment failed:", error);
    process.exit(1);
  });