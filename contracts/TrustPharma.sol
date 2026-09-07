// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title TrustPharma
 * @notice Decentralized pharmaceutical anti-counterfeit, verification, and custody tracking contract.
 * @dev Implements RBAC, sequential custody verification, cryptographic commit-reveal, and batch recalls.
 */
contract TrustPharma is AccessControl {

    // -------------------------------------------------------------
    // 1. ROLES DEFINITION [F1]
    // -------------------------------------------------------------
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE  = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant PHARMACY_ROLE     = keccak256("PHARMACY_ROLE");

    // -------------------------------------------------------------
    // 2. ENUMS & STRUCTS
    // -------------------------------------------------------------
    enum State {
        Manufactured, // 0: Minted by Manufacturer
        InTransit,    // 1: Shipped to Distributor or Pharmacy
        AtPharmacy,   // 2: Stocked on shelf, ready for retail
        Dispensed     // 3: Verified and sold to consumer (Terminal)
    }

    struct Batch {
        string batchId;
        string medicineName;
        uint256 mfgDate;
        uint256 expDate;
        uint256 totalUnits;
        address manufacturer;
        bool isRecalled;
    }

    struct MedicineUnit {
        string unitId;
        string batchId;
        bytes32 secretHash;       // keccak256(plainPin) commitment
        address currentCustodian; // Current verified holder
        State state;
    }

    // -------------------------------------------------------------
    // 3. STORAGE MAPPINGS
    // -------------------------------------------------------------
    mapping(string => Batch) public batches;
    mapping(string => MedicineUnit) public units;
    mapping(string => bool) public batchExists;
    mapping(string => bool) public unitExists;

    // -------------------------------------------------------------
    // 4. EVENTS [F8]
    // -------------------------------------------------------------
    event BatchCreated(string indexed batchId, string medicineName, uint256 expDate, uint256 totalUnits, address indexed manufacturer);
    event CustodyTransferred(string indexed unitId, address indexed from, address indexed to, State newState);
    event BatchRecalled(string indexed batchId, address indexed initiatedBy);
    event UnitDispensed(string indexed unitId, address indexed consumer, uint256 timestamp);

    // -------------------------------------------------------------
    // 5. CUSTOM ERRORS
    // -------------------------------------------------------------
    error BatchAlreadyExists(string batchId);
    error BatchDoesNotExist(string batchId);
    error BatchAlreadyRecalled(string batchId);
    error BatchRecalledError(string batchId);
    error OnlyManufacturerCanRecall(string batchId, address caller);

    error UnitAlreadyExists(string unitId);
    error UnitDoesNotExist(string unitId);
    error EmptyUnitList();
    error InvalidExpirationDate(uint256 expDate, uint256 currentTimestamp);

    error UnauthorizedCustodian(address caller, address currentCustodian);
    error UnauthorizedSenderRole(address sender, bytes32 expectedRole);
    error UnauthorizedRecipientRole(address recipient, bytes32 expectedRole);
    error InvalidStateTransition(State currentState, State attemptedState);

    error UnitNotAtPharmacy(State currentState);
    error UnitAlreadyDispensed(string unitId);
    error InvalidPinOrAlreadyDispensed();

    // -------------------------------------------------------------
    // 6. CONSTRUCTOR
    // -------------------------------------------------------------
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // -------------------------------------------------------------
    // 7. BATCH CREATION & MINTING [F2 & F3]
    // -------------------------------------------------------------
    /**
     * @notice Registers a new pharmaceutical batch and stores secret commitments for each unit
     * @param _batchId Unique alphanumeric batch identifier
     * @param _medicineName Commercial name of the drug
     * @param _expDate Expiration UNIX timestamp (must be strictly in the future)
     * @param _unitIds Array of public box serial identifiers
     * @param _secretHashes Array of keccak256(plainPin) commitments
     */
    function createBatch(
        string memory _batchId,
        string memory _medicineName,
        uint256 _expDate,
        string[] memory _unitIds,
        bytes32[] memory _secretHashes
    ) external onlyRole(MANUFACTURER_ROLE) {
        if (batchExists[_batchId]) revert BatchAlreadyExists(_batchId);
        if (_expDate <= block.timestamp) revert InvalidExpirationDate(_expDate, block.timestamp);
        if (_unitIds.length == 0 || _unitIds.length != _secretHashes.length) revert EmptyUnitList();

        batches[_batchId] = Batch({
            batchId: _batchId,
            medicineName: _medicineName,
            mfgDate: block.timestamp,
            expDate: _expDate,
            totalUnits: _unitIds.length,
            manufacturer: msg.sender,
            isRecalled: false
        });
        batchExists[_batchId] = true;

        for (uint256 i = 0; i < _unitIds.length; i++) {
            string memory uId = _unitIds[i];
            if (unitExists[uId]) revert UnitAlreadyExists(uId);

            units[uId] = MedicineUnit({
                unitId: uId,
                batchId: _batchId,
                secretHash: _secretHashes[i],
                currentCustodian: msg.sender,
                state: State.Manufactured
            });
            unitExists[uId] = true;
        }

        emit BatchCreated(_batchId, _medicineName, _expDate, _unitIds.length, msg.sender);
    }

    // -------------------------------------------------------------
    // 8. CUSTODY STATE MACHINE [F4 & F5]
    // -------------------------------------------------------------
    /**
     * @notice Initiates shipping of a unit to an authorized supply chain intermediary
     * @param _unitId Unique unit identifier
     * @param _to Address of the next recipient (Distributor or Pharmacy)
     */
    function transferCustody(string memory _unitId, address _to) public {
        if (!unitExists[_unitId]) revert UnitDoesNotExist(_unitId);

        MedicineUnit storage unit = units[_unitId];
        Batch storage batch = batches[unit.batchId];

        if (batch.isRecalled) revert BatchRecalledError(unit.batchId);
        if (block.timestamp > batch.expDate) revert InvalidExpirationDate(batch.expDate, block.timestamp);
        if (msg.sender != unit.currentCustodian) revert UnauthorizedCustodian(msg.sender, unit.currentCustodian);

        if (unit.state == State.Manufactured) {
            if (!hasRole(DISTRIBUTOR_ROLE, _to)) revert UnauthorizedRecipientRole(_to, DISTRIBUTOR_ROLE);
            unit.state = State.InTransit;

        } else if (unit.state == State.InTransit) {
            if (!hasRole(DISTRIBUTOR_ROLE, msg.sender)) revert UnauthorizedSenderRole(msg.sender, DISTRIBUTOR_ROLE);
            if (!hasRole(PHARMACY_ROLE, _to)) revert UnauthorizedRecipientRole(_to, PHARMACY_ROLE);

        } else if (unit.state == State.AtPharmacy || unit.state == State.Dispensed) {
            revert InvalidStateTransition(unit.state, State.InTransit);
        }

        address previousCustodian = unit.currentCustodian;
        unit.currentCustodian = _to;

        emit CustodyTransferred(_unitId, previousCustodian, _to, unit.state);
    }

    /**
     * @notice Acknowledges physical receipt of a unit at its destination
     * @param _unitId Unique unit identifier
     */
    function receiveCustody(string memory _unitId) external {
        if (!unitExists[_unitId]) revert UnitDoesNotExist(_unitId);

        MedicineUnit storage unit = units[_unitId];
        Batch storage batch = batches[unit.batchId];

        if (batch.isRecalled) revert BatchRecalledError(unit.batchId);
        if (block.timestamp > batch.expDate) revert InvalidExpirationDate(batch.expDate, block.timestamp);
        if (msg.sender != unit.currentCustodian) revert UnauthorizedCustodian(msg.sender, unit.currentCustodian);
        if (unit.state != State.InTransit) revert InvalidStateTransition(unit.state, State.AtPharmacy);

        if (hasRole(PHARMACY_ROLE, msg.sender)) {
            unit.state = State.AtPharmacy;
        } else if (hasRole(DISTRIBUTOR_ROLE, msg.sender)) {
            unit.state = State.InTransit;
        } else {
            revert UnauthorizedRecipientRole(msg.sender, PHARMACY_ROLE);
        }

        emit CustodyTransferred(_unitId, msg.sender, msg.sender, unit.state);
    }

    /**
     * @notice Dispatches an array of units in a single transaction
     * @param _unitIds Array of unit serial numbers
     * @param _to Destination address
     */
    function transferBatchCustody(string[] memory _unitIds, address _to) external {
        for (uint256 i = 0; i < _unitIds.length; i++) {
            transferCustody(_unitIds[i], _to);
        }
    }

    /**
     * @notice Freezes all units in a batch across the supply chain
     * @param _batchId Identifier of the batch to recall
     */
    function recallBatch(string memory _batchId) external {
        if (!batchExists[_batchId]) revert BatchDoesNotExist(_batchId);

        Batch storage batch = batches[_batchId];

        if (msg.sender != batch.manufacturer) revert OnlyManufacturerCanRecall(_batchId, msg.sender);
        if (batch.isRecalled) revert BatchAlreadyRecalled(_batchId);

        batch.isRecalled = true;

        emit BatchRecalled(_batchId, msg.sender);
    }

    // -------------------------------------------------------------
    // 9. CONSUMER VERIFICATION & BURN [F6 & F7]
    // -------------------------------------------------------------
    /**
     * @notice Verifies plaintext scratch-off PIN, dispenses box, and burns secretHash
     * @param _unitId Unique unit identifier
     * @param _plainPin Plain unhashed PIN revealed by consumer
     */
    function verifyAndDispense(string memory _unitId, string memory _plainPin) external {
        if (!unitExists[_unitId]) revert UnitDoesNotExist(_unitId);

        MedicineUnit storage unit = units[_unitId];
        Batch storage batch = batches[unit.batchId];

        if (batch.isRecalled) revert BatchRecalledError(unit.batchId);
        if (block.timestamp > batch.expDate) revert InvalidExpirationDate(batch.expDate, block.timestamp);
        if (unit.state == State.Dispensed) revert UnitAlreadyDispensed(_unitId);
        if (unit.state != State.AtPharmacy) revert UnitNotAtPharmacy(unit.state);

        bytes32 computedHash = keccak256(abi.encodePacked(_plainPin));
        if (computedHash != unit.secretHash || unit.secretHash == bytes32(0)) {
            revert InvalidPinOrAlreadyDispensed();
        }

        unit.secretHash = bytes32(0);
        unit.state = State.Dispensed;
        unit.currentCustodian = msg.sender;

        emit UnitDispensed(_unitId, msg.sender, block.timestamp);
    }

    // -------------------------------------------------------------
    // 10. ZERO-GAS VIEW FUNCTIONS [F6 & F8]
    // -------------------------------------------------------------
    /**
     * @notice Fetches public unit details for QR scanning and timeline audits
     * @param _unitId Unique unit identifier
     */
    function getUnitDetails(string memory _unitId)
        external
        view
        returns (
            string memory unitId,
            string memory batchId,
            address currentCustodian,
            State state,
            bool isDispensed,
            bool isExpired,
            bool isRecalled
        )
    {
        if (!unitExists[_unitId]) revert UnitDoesNotExist(_unitId);

        MedicineUnit storage unit = units[_unitId];
        Batch storage batch = batches[unit.batchId];

        return (
            unit.unitId,
            unit.batchId,
            unit.currentCustodian,
            unit.state,
            unit.state == State.Dispensed,
            block.timestamp > batch.expDate,
            batch.isRecalled
        );
    }

    /**
     * @notice Fetches public batch metadata
     * @param _batchId Unique batch identifier
     */
    function getBatchDetails(string memory _batchId)
        external
        view
        returns (
            string memory batchId,
            string memory medicineName,
            uint256 mfgDate,
            uint256 expDate,
            uint256 totalUnits,
            address manufacturer,
            bool isRecalled
        )
    {
        if (!batchExists[_batchId]) revert BatchDoesNotExist(_batchId);

        Batch storage batch = batches[_batchId];
        return (
            batch.batchId,
            batch.medicineName,
            batch.mfgDate,
            batch.expDate,
            batch.totalUnits,
            batch.manufacturer,
            batch.isRecalled
        );
    }
}