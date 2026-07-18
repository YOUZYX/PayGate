// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title PayGateRouter
/// @notice Routes native MON API payments to developers, skimming a 2% protocol fee.
///         Supports direct payments, Delegated Session Allowances
///         (The Corporate Card Pattern), Dynamic Payload Metering
///         (The Taxi Meter Pattern), and Deterministic SLA Escrows
///         (The Vending Machine Pattern) settled by the platform owner.
///         Gas-optimized for Monad's parallel executor: immutable config, custom
///         errors, unchecked math where safe, minimal storage ops.
contract PayGateRouter {
    /// @notice Protocol fee in basis points (2%).
    uint256 public constant protocolFeeBps = 200;

    /// @notice Address receiving protocol fees.
    address public immutable treasuryAddress;

    /// @notice Platform owner (deployer); settles agent charges and escrows.
    address public immutable owner;

    /// @notice Withdrawable earnings per developer, in wei.
    mapping(address => uint256) public balances;

    /// @notice Escrowed spending allowance: master => agent => remaining wei.
    /// @dev Funds are held by this contract at approval time so the platform
    ///      can settle agent spending without further master signatures.
    mapping(address => mapping(address => uint256)) public agentAllowances;

    struct EscrowRecord {
        address developer;
        address consumer;
        uint256 amount;
        bool active;
    }

    /// @notice Per-request escrow records keyed by requestId.
    mapping(bytes32 => EscrowRecord) public escrows;

    event PaymentProcessed(
        address indexed developer,
        address indexed consumer,
        uint256 amount,
        uint256 fee
    );
    event EarningsWithdrawn(address indexed developer, uint256 amount);
    event AgentApproved(address indexed master, address indexed agent, uint256 allowance);
    event AgentCharged(
        address indexed master,
        address indexed agent,
        address indexed developer,
        uint256 amount,
        uint256 fee
    );
    event AgentRevoked(address indexed master, address indexed agent, uint256 refunded);
    event EscrowDeposited(
        bytes32 indexed requestId,
        address indexed developer,
        address indexed consumer,
        uint256 amount
    );
    event EscrowSettled(
        bytes32 indexed requestId,
        uint256 actualCost,
        uint256 fee,
        uint256 refunded
    );
    event EscrowRefunded(bytes32 indexed requestId, uint256 amount);

    error ZeroPayment();
    error ZeroAddress();
    error NothingToWithdraw();
    error TransferFailed();
    error NotOwner();
    error AllowanceMismatch();
    error InsufficientAllowance();
    error NoAllowance();
    error EscrowAlreadyActive();
    error EscrowNotActive();
    error CostExceedsEscrow();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address treasury) {
        if (treasury == address(0)) revert ZeroAddress();
        treasuryAddress = treasury;
        owner = msg.sender;
    }

    /// @notice Pay a developer for API access. 2% goes to the treasury,
    ///         the rest is credited to the developer's withdrawable balance.
    function processPayment(address developer) external payable {
        if (msg.value == 0) revert ZeroPayment();
        if (developer == address(0)) revert ZeroAddress();

        (uint256 fee, uint256 credit) = _split(msg.value);

        balances[developer] += credit;
        _payTreasury(fee);

        emit PaymentProcessed(developer, msg.sender, msg.value, fee);
    }

    /// @notice Withdraw all accumulated earnings (checks-effects-interactions).
    function withdrawEarnings() external {
        uint256 amount = balances[msg.sender];
        if (amount == 0) revert NothingToWithdraw();

        balances[msg.sender] = 0;

        _send(msg.sender, amount);

        emit EarningsWithdrawn(msg.sender, amount);
    }

    // ------------------------------------------------------------------
    // Delegated Session Allowances (The Corporate Card Pattern)
    // ------------------------------------------------------------------

    /// @notice Grant an agent a spending allowance, escrowing the funds here.
    /// @dev msg.value must equal `allowance` so later charges are backed 1:1.
    ///      Re-approving the same agent adds to its remaining allowance.
    function approveAgent(address agent, uint256 allowance) external payable {
        if (msg.value != allowance) revert AllowanceMismatch();
        if (msg.value == 0) revert ZeroPayment();
        if (agent == address(0)) revert ZeroAddress();

        agentAllowances[msg.sender][agent] += allowance;

        emit AgentApproved(msg.sender, agent, allowance);
    }

    /// @notice Settle an agent's spend against its master's escrowed allowance.
    ///         2% fee to treasury, remainder credited to the developer.
    function chargeAgent(
        address master,
        address agent,
        address developer,
        uint256 amount
    ) external onlyOwner {
        if (amount == 0) revert ZeroPayment();
        if (developer == address(0)) revert ZeroAddress();

        uint256 remaining = agentAllowances[master][agent];
        if (remaining < amount) revert InsufficientAllowance();
        unchecked {
            agentAllowances[master][agent] = remaining - amount;
        }

        (uint256 fee, uint256 credit) = _split(amount);

        balances[developer] += credit;
        _payTreasury(fee);

        emit AgentCharged(master, agent, developer, amount, fee);
    }

    /// @notice Revoke an agent's allowance and refund the unspent escrow.
    function revokeAgent(address agent) external {
        uint256 refunded = agentAllowances[msg.sender][agent];
        if (refunded == 0) revert NoAllowance();

        agentAllowances[msg.sender][agent] = 0;

        _send(msg.sender, refunded);

        emit AgentRevoked(msg.sender, agent, refunded);
    }

    // ------------------------------------------------------------------
    // Deterministic SLA Escrows (The Vending Machine Pattern)
    // + Dynamic Payload Metering settlement (The Taxi Meter Pattern)
    // ------------------------------------------------------------------

    /// @notice Lock funds for a request; the platform settles or refunds later.
    function depositEscrow(address developer, bytes32 requestId) external payable {
        if (msg.value == 0) revert ZeroPayment();
        if (developer == address(0)) revert ZeroAddress();
        if (escrows[requestId].active) revert EscrowAlreadyActive();

        escrows[requestId] = EscrowRecord({
            developer: developer,
            consumer: msg.sender,
            amount: msg.value,
            active: true
        });

        emit EscrowDeposited(requestId, developer, msg.sender, msg.value);
    }

    /// @notice Settle an escrow at the metered cost; unspent funds are refunded
    ///         to the consumer immediately. actualCost == 0 means a full refund
    ///         with no fee (e.g. zero-byte response).
    function settleEscrow(bytes32 requestId, uint256 actualCost) external onlyOwner {
        EscrowRecord storage rec = escrows[requestId];
        if (!rec.active) revert EscrowNotActive();
        uint256 amount = rec.amount;
        if (actualCost > amount) revert CostExceedsEscrow();

        rec.active = false;

        (uint256 fee, uint256 credit) = _split(actualCost);
        uint256 refunded;
        unchecked {
            refunded = amount - actualCost;
        }

        if (credit != 0) balances[rec.developer] += credit;
        _payTreasury(fee);
        if (refunded != 0) _send(rec.consumer, refunded);

        emit EscrowSettled(requestId, actualCost, fee, refunded);
    }

    /// @notice Fully refund an active escrow to the consumer.
    function refundEscrow(bytes32 requestId) external onlyOwner {
        EscrowRecord storage rec = escrows[requestId];
        if (!rec.active) revert EscrowNotActive();

        rec.active = false;

        uint256 amount = rec.amount;
        _send(rec.consumer, amount);

        emit EscrowRefunded(requestId, amount);
    }

    // ------------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------------

    function _split(uint256 amount) internal pure returns (uint256 fee, uint256 credit) {
        unchecked {
            // fee <= amount since protocolFeeBps < 10000, so both are safe.
            fee = (amount * protocolFeeBps) / 10_000;
            credit = amount - fee;
        }
    }

    function _payTreasury(uint256 fee) internal {
        if (fee != 0) _send(treasuryAddress, fee);
    }

    function _send(address to, uint256 amount) internal {
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }
}
