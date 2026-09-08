import { expect } from "chai";
import hre from "hardhat";

describe("TrustPharma Anti-Counterfeit Ecosystem", function () {
  let ethers: any;
  let trustPharma: any;
  let admin: any, manufacturer: any, distributor: any, pharmacy: any, consumer: any, attacker: any;

  let MANUFACTURER_ROLE: string, DISTRIBUTOR_ROLE: string, PHARMACY_ROLE: string;

  const batchId = "BAT-2026-001";
  const medicineName = "Amoxicillin 500mg";
  const unitId = "BOX-SN-0001";
  const plainPin = "SECRET-PIN-789";
  let secretHash: string;
  let validExpDate: number;

  before(async function () {
    // In Hardhat v3, network.connect() initializes the EDR network and provides ethers
    const connection = await (hre as any).network.getOrCreate();
    ethers = connection.ethers;

    [admin, manufacturer, distributor, pharmacy, consumer, attacker] = await ethers.getSigners();
    secretHash = ethers.keccak256(ethers.toUtf8Bytes(plainPin));
    
    const latestBlock = await ethers.provider.getBlock("latest");
    validExpDate = (latestBlock?.timestamp ?? Math.floor(Date.now() / 1000)) + 30 * 24 * 60 * 60;
  });

  beforeEach(async function () {
    const TrustPharmaFactory = await ethers.getContractFactory("TrustPharma");
    trustPharma = await TrustPharmaFactory.connect(admin).deploy();
    await trustPharma.waitForDeployment();

    MANUFACTURER_ROLE = await trustPharma.MANUFACTURER_ROLE();
    DISTRIBUTOR_ROLE  = await trustPharma.DISTRIBUTOR_ROLE();
    PHARMACY_ROLE     = await trustPharma.PHARMACY_ROLE();

    await (await trustPharma.connect(admin).grantRole(MANUFACTURER_ROLE, manufacturer.address)).wait();
    await (await trustPharma.connect(admin).grantRole(DISTRIBUTOR_ROLE, distributor.address)).wait();
    await (await trustPharma.connect(admin).grantRole(PHARMACY_ROLE, pharmacy.address)).wait();
  });

  // =========================================================================
  // SECTION A: HAPPY PATH LIFECYCLE (F1 - F7)
  // =========================================================================
  describe("Happy Path: Complete Supply Chain Lifecycle", function () {
    it("Should execute end-to-end flow: Mint -> Transfer -> Receive -> Verify & Dispense", async function () {
      await expect(
        trustPharma.connect(manufacturer).createBatch(
          batchId,
          medicineName,
          validExpDate,
          [unitId],
          [secretHash]
        )
      ).to.emit(trustPharma, "BatchCreated")
       .withArgs(batchId, medicineName, validExpDate, 1, manufacturer.address);

      let unitData = await trustPharma.getUnitDetails(unitId);
      expect(unitData.state).to.equal(0);
      expect(unitData.currentCustodian).to.equal(manufacturer.address);

      await expect(
        trustPharma.connect(manufacturer).transferCustody(unitId, distributor.address)
      ).to.emit(trustPharma, "CustodyTransferred")
       .withArgs(unitId, manufacturer.address, distributor.address, 1);

      await (await trustPharma.connect(distributor).receiveCustody(unitId)).wait();
      unitData = await trustPharma.getUnitDetails(unitId);
      expect(unitData.state).to.equal(1);
      expect(unitData.currentCustodian).to.equal(distributor.address);

      await (await trustPharma.connect(distributor).transferCustody(unitId, pharmacy.address)).wait();

      await expect(
        trustPharma.connect(pharmacy).receiveCustody(unitId)
      ).to.emit(trustPharma, "CustodyTransferred")
       .withArgs(unitId, pharmacy.address, pharmacy.address, 2);

      unitData = await trustPharma.getUnitDetails(unitId);
      expect(unitData.state).to.equal(2);

      const currentBlock = await ethers.provider.getBlock("latest");
      const currentTimestamp = currentBlock?.timestamp ?? 0;

      await expect(
        trustPharma.connect(consumer).verifyAndDispense(unitId, plainPin)
      ).to.emit(trustPharma, "UnitDispensed")
       .withArgs(unitId, consumer.address, currentTimestamp + 1);

      unitData = await trustPharma.getUnitDetails(unitId);
      expect(unitData.state).to.equal(3);
      expect(unitData.isDispensed).to.be.true;
      expect(unitData.currentCustodian).to.equal(consumer.address);
    });
  });

  // =========================================================================
  // SECTION B: THREAT MODEL & FAILURE MODES (CHAOS TESTING)
  // =========================================================================
  describe("Security, Threat Vectors & Attack Simulation", function () {
    beforeEach(async function () {
      await (await trustPharma.connect(manufacturer).createBatch(
        batchId,
        medicineName,
        validExpDate,
        [unitId],
        [secretHash]
      )).wait();
    });

    it("Attack 1: Unauthorized address attempts to mint inventory", async function () {
      await expect(
        trustPharma.connect(attacker).createBatch(
          "FAKE-BATCH",
          "Fake Drug",
          validExpDate,
          ["FAKE-UNIT"],
          [secretHash]
        )
      ).to.be.revertedWithCustomError(trustPharma, "AccessControlUnauthorizedAccount");
    });

    it("Attack 2: Replay Attack - Attempting to use a burned PIN twice", async function () {
      await (await trustPharma.connect(manufacturer).transferCustody(unitId, distributor.address)).wait();
      await (await trustPharma.connect(distributor).receiveCustody(unitId)).wait();
      await (await trustPharma.connect(distributor).transferCustody(unitId, pharmacy.address)).wait();
      await (await trustPharma.connect(pharmacy).receiveCustody(unitId)).wait();

      await (await trustPharma.connect(consumer).verifyAndDispense(unitId, plainPin)).wait();

      await expect(
        trustPharma.connect(attacker).verifyAndDispense(unitId, plainPin)
      ).to.be.revertedWithCustomError(trustPharma, "UnitAlreadyDispensed");
    });

    it("Attack 3: Dispense attempt with incorrect scratch-off PIN", async function () {
      await (await trustPharma.connect(manufacturer).transferCustody(unitId, distributor.address)).wait();
      await (await trustPharma.connect(distributor).receiveCustody(unitId)).wait();
      await (await trustPharma.connect(distributor).transferCustody(unitId, pharmacy.address)).wait();
      await (await trustPharma.connect(pharmacy).receiveCustody(unitId)).wait();

      await expect(
        trustPharma.connect(consumer).verifyAndDispense(unitId, "WRONG-GUESS-PIN")
      ).to.be.revertedWithCustomError(trustPharma, "InvalidPinOrAlreadyDispensed");
    });

    it("Attack 4: Supply Diversion - Skipping authorized intermediary", async function () {
      await expect(
        trustPharma.connect(manufacturer).transferCustody(unitId, attacker.address)
      ).to.be.revertedWithCustomError(trustPharma, "UnauthorizedRecipientRole")
       .withArgs(attacker.address, DISTRIBUTOR_ROLE);
    });

    it("Attack 5: Emergency Recall Circuit Breaker blocks downstream actions", async function () {
      await expect(trustPharma.connect(manufacturer).recallBatch(batchId))
        .to.emit(trustPharma, "BatchRecalled")
        .withArgs(batchId, manufacturer.address);

      await expect(
        trustPharma.connect(manufacturer).transferCustody(unitId, distributor.address)
      ).to.be.revertedWithCustomError(trustPharma, "BatchRecalledError")
       .withArgs(batchId);
    });
  });
});