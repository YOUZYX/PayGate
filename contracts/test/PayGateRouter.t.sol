// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {PayGateRouter} from "../src/PayGateRouter.sol";

contract ReentrantAttacker {
    PayGateRouter internal immutable router;
    uint256 public reentryAttempts;

    constructor(PayGateRouter router_) {
        router = router_;
    }

    function pay() external payable {
        router.processPayment{value: msg.value}(address(this));
    }

    function attack() external {
        router.withdrawEarnings();
    }

    receive() external payable {
        if (address(router).balance > 0) {
            reentryAttempts++;
            // Re-enter withdrawEarnings; balance is already zeroed so this must revert.
            try router.withdrawEarnings() {
                revert("reentrancy succeeded");
            } catch {}
        }
    }
}

/// @notice Consumer contract that inspects the escrow record at the exact
///         moment the refund lands (mid-transfer) and attempts to re-enter
///         the settlement functions as a non-owner.
contract EscrowReentrancyProbe {
    PayGateRouter internal immutable router;
    bytes32 internal immutable requestId;

    uint256 public payoutsReceived;
    bool public sawActiveDuringPayout;
    bytes4 public settleReentryError;
    bytes4 public refundReentryError;

    constructor(PayGateRouter router_, bytes32 requestId_) {
        router = router_;
        requestId = requestId_;
    }

    function deposit(address developer) external payable {
        router.depositEscrow{value: msg.value}(developer, requestId);
    }

    receive() external payable {
        payoutsReceived++;

        // Effects must precede interactions: by the time funds arrive here,
        // the escrow record must already be deactivated.
        (, , , bool active) = router.escrows(requestId);
        if (active) sawActiveDuringPayout = true;

        // Reentrant settlement attempts (as a non-owner) must revert.
        try router.settleEscrow(requestId, 0) {
            settleReentryError = bytes4(0);
        } catch (bytes memory err) {
            settleReentryError = bytes4(err);
        }
        try router.refundEscrow(requestId) {
            refundReentryError = bytes4(0);
        } catch (bytes memory err) {
            refundReentryError = bytes4(err);
        }
    }
}

/// @notice Worst case: the attacker IS the router owner (it deploys its own
///         router) and is also the escrow consumer. Even with full settlement
///         privileges, re-entering settle/refund mid-transfer must fail with
///         EscrowNotActive because the record is deactivated before the send.
contract OwnerReentrantSettler {
    PayGateRouter public immutable router;
    bytes32 public constant REQUEST_ID = keccak256("owner-reentry");

    uint256 public payoutsReceived;
    bytes4 public settleReentryError;
    bytes4 public refundReentryError;

    constructor(address treasury) {
        router = new PayGateRouter(treasury); // this contract becomes `owner`
    }

    function depositAndSettleHalf(address developer) external payable {
        router.depositEscrow{value: msg.value}(developer, REQUEST_ID);
        // Half is refunded to this contract, triggering receive() mid-settle.
        router.settleEscrow(REQUEST_ID, msg.value / 2);
    }

    receive() external payable {
        payoutsReceived++;

        try router.settleEscrow(REQUEST_ID, 0) {
            settleReentryError = bytes4(0);
        } catch (bytes memory err) {
            settleReentryError = bytes4(err);
        }
        try router.refundEscrow(REQUEST_ID) {
            refundReentryError = bytes4(0);
        } catch (bytes memory err) {
            refundReentryError = bytes4(err);
        }
    }
}

contract PayGateRouterTest is Test {
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

    PayGateRouter internal router;

    address internal treasury = makeAddr("treasury");
    address internal developer = makeAddr("developer");
    address internal consumer = makeAddr("consumer");
    address internal master = makeAddr("master");
    address internal agent = makeAddr("agent");

    bytes32 internal constant REQUEST_ID = keccak256("request-1");

    function setUp() public {
        router = new PayGateRouter(treasury);
        vm.deal(consumer, 100 ether);
        vm.deal(master, 100 ether);
    }

    function test_Constants() public view {
        assertEq(router.protocolFeeBps(), 200);
        assertEq(router.treasuryAddress(), treasury);
        assertEq(router.owner(), address(this));
    }

    function test_FeeSplit_98_2() public {
        vm.prank(consumer);
        router.processPayment{value: 1 ether}(developer);

        assertEq(router.balances(developer), 0.98 ether, "developer credited 98%");
        assertEq(treasury.balance, 0.02 ether, "treasury received 2%");
        assertEq(address(router).balance, 0.98 ether, "router escrows the rest");
    }

    function test_MultiplePaymentsAccumulate() public {
        vm.startPrank(consumer);
        router.processPayment{value: 1 ether}(developer);
        router.processPayment{value: 2 ether}(developer);
        router.processPayment{value: 0.5 ether}(developer);
        vm.stopPrank();

        // 3.5 ether total, 2% fee => 3.43 credited
        assertEq(router.balances(developer), 3.43 ether);
        assertEq(treasury.balance, 0.07 ether);
    }

    function test_WithdrawPaysOutAndZeroesBalance() public {
        vm.prank(consumer);
        router.processPayment{value: 1 ether}(developer);

        uint256 expected = 0.98 ether;

        vm.expectEmit(true, false, false, true, address(router));
        emit EarningsWithdrawn(developer, expected);

        vm.prank(developer);
        router.withdrawEarnings();

        assertEq(developer.balance, expected, "developer paid out");
        assertEq(router.balances(developer), 0, "balance zeroed");
        assertEq(address(router).balance, 0, "router drained");
    }

    function test_RevertWhen_ZeroPayment() public {
        vm.prank(consumer);
        vm.expectRevert(PayGateRouter.ZeroPayment.selector);
        router.processPayment{value: 0}(developer);
    }

    function test_RevertWhen_WithdrawWithZeroBalance() public {
        vm.prank(developer);
        vm.expectRevert(PayGateRouter.NothingToWithdraw.selector);
        router.withdrawEarnings();
    }

    function test_PaymentProcessedEvent() public {
        vm.expectEmit(true, true, false, true, address(router));
        emit PaymentProcessed(developer, consumer, 1 ether, 0.02 ether);

        vm.prank(consumer);
        router.processPayment{value: 1 ether}(developer);
    }

    function test_ReentrancyOnWithdrawHasNoEffect() public {
        ReentrantAttacker attacker = new ReentrantAttacker(router);
        attacker.pay{value: 1 ether}();

        // Fund router with a second developer's escrow so there is something
        // left to steal during the reentrant call.
        vm.prank(consumer);
        router.processPayment{value: 1 ether}(developer);

        attacker.attack();

        assertEq(address(attacker).balance, 0.98 ether, "attacker got only its own earnings");
        assertEq(router.balances(address(attacker)), 0, "attacker balance zeroed");
        assertEq(address(router).balance, 0.98 ether, "other developer escrow untouched");
        assertGt(attacker.reentryAttempts(), 0, "reentry was attempted");

        // Second withdraw also reverts: balance already zero.
        vm.expectRevert(PayGateRouter.NothingToWithdraw.selector);
        attacker.attack();
    }

    function testFuzz_FeeMath(uint96 amount) public {
        vm.assume(amount > 0);
        vm.deal(consumer, amount);

        uint256 fee = (uint256(amount) * 200) / 10_000;

        vm.prank(consumer);
        router.processPayment{value: amount}(developer);

        assertEq(router.balances(developer), uint256(amount) - fee);
        assertEq(treasury.balance, fee);
    }

    // ------------------------------------------------------------------
    // Delegated Session Allowances (The Corporate Card Pattern)
    // ------------------------------------------------------------------

    function test_ApproveAgent_EscrowsFundsAndSetsAllowance() public {
        vm.expectEmit(true, true, false, true, address(router));
        emit AgentApproved(master, agent, 5 ether);

        vm.prank(master);
        router.approveAgent{value: 5 ether}(agent, 5 ether);

        assertEq(router.agentAllowances(master, agent), 5 ether);
        assertEq(address(router).balance, 5 ether, "funds escrowed in router");
    }

    function test_ApproveAgent_ReapprovalAccumulates() public {
        vm.startPrank(master);
        router.approveAgent{value: 2 ether}(agent, 2 ether);
        router.approveAgent{value: 3 ether}(agent, 3 ether);
        vm.stopPrank();

        assertEq(router.agentAllowances(master, agent), 5 ether);
    }

    function test_RevertWhen_ApproveAgentValueMismatch() public {
        vm.prank(master);
        vm.expectRevert(PayGateRouter.AllowanceMismatch.selector);
        router.approveAgent{value: 1 ether}(agent, 2 ether);
    }

    function test_ChargeAgent_FeeSplitAndAllowanceDecrement() public {
        vm.prank(master);
        router.approveAgent{value: 5 ether}(agent, 5 ether);

        vm.expectEmit(true, true, true, true, address(router));
        emit AgentCharged(master, agent, developer, 1 ether, 0.02 ether);

        router.chargeAgent(master, agent, developer, 1 ether);

        assertEq(router.agentAllowances(master, agent), 4 ether, "allowance decremented");
        assertEq(router.balances(developer), 0.98 ether, "developer credited 98%");
        assertEq(treasury.balance, 0.02 ether, "treasury received 2%");
        assertEq(address(router).balance, 4.98 ether, "remaining escrow + developer credit");
    }

    function test_RevertWhen_ChargeAgentOverAllowance() public {
        vm.prank(master);
        router.approveAgent{value: 1 ether}(agent, 1 ether);

        vm.expectRevert(PayGateRouter.InsufficientAllowance.selector);
        router.chargeAgent(master, agent, developer, 2 ether);
    }

    function test_RevertWhen_ChargeAgentNotOwner() public {
        vm.prank(master);
        router.approveAgent{value: 1 ether}(agent, 1 ether);

        vm.prank(consumer);
        vm.expectRevert(PayGateRouter.NotOwner.selector);
        router.chargeAgent(master, agent, developer, 0.5 ether);
    }

    function test_RevokeAgent_RefundsRemainingAllowance() public {
        vm.prank(master);
        router.approveAgent{value: 5 ether}(agent, 5 ether);

        router.chargeAgent(master, agent, developer, 1 ether);

        uint256 masterBalanceBefore = master.balance;

        vm.expectEmit(true, true, false, true, address(router));
        emit AgentRevoked(master, agent, 4 ether);

        vm.prank(master);
        router.revokeAgent(agent);

        assertEq(router.agentAllowances(master, agent), 0, "allowance zeroed");
        assertEq(master.balance, masterBalanceBefore + 4 ether, "unspent escrow refunded");
    }

    function test_RevertWhen_RevokeAgentWithoutAllowance() public {
        vm.prank(master);
        vm.expectRevert(PayGateRouter.NoAllowance.selector);
        router.revokeAgent(agent);
    }

    // ------------------------------------------------------------------
    // Deterministic SLA Escrows (The Vending Machine Pattern)
    // + Dynamic Payload Metering settlement (The Taxi Meter Pattern)
    // ------------------------------------------------------------------

    function _deposit(uint256 amount) internal {
        vm.prank(consumer);
        router.depositEscrow{value: amount}(developer, REQUEST_ID);
    }

    function test_DepositEscrow_StoresRecord() public {
        vm.expectEmit(true, true, true, true, address(router));
        emit EscrowDeposited(REQUEST_ID, developer, consumer, 1 ether);

        _deposit(1 ether);

        (address dev, address cons, uint256 amount, bool active) = router.escrows(REQUEST_ID);
        assertEq(dev, developer);
        assertEq(cons, consumer);
        assertEq(amount, 1 ether);
        assertTrue(active);
        assertEq(address(router).balance, 1 ether);
    }

    function test_RevertWhen_DepositEscrowZeroValue() public {
        vm.prank(consumer);
        vm.expectRevert(PayGateRouter.ZeroPayment.selector);
        router.depositEscrow{value: 0}(developer, REQUEST_ID);
    }

    function test_RevertWhen_DepositEscrowDuplicateRequestId() public {
        _deposit(1 ether);

        vm.prank(consumer);
        vm.expectRevert(PayGateRouter.EscrowAlreadyActive.selector);
        router.depositEscrow{value: 1 ether}(developer, REQUEST_ID);
    }

    function test_SettleEscrow_FeeMathAndPartialRefund() public {
        _deposit(1 ether);

        uint256 consumerBalanceBefore = consumer.balance;

        vm.expectEmit(true, false, false, true, address(router));
        emit EscrowSettled(REQUEST_ID, 0.6 ether, 0.012 ether, 0.4 ether);

        router.settleEscrow(REQUEST_ID, 0.6 ether);

        assertEq(router.balances(developer), 0.588 ether, "developer credited 98% of cost");
        assertEq(treasury.balance, 0.012 ether, "treasury received 2% of cost");
        assertEq(consumer.balance, consumerBalanceBefore + 0.4 ether, "unspent refunded");

        (, , , bool active) = router.escrows(REQUEST_ID);
        assertFalse(active, "escrow deactivated");
    }

    function test_SettleEscrow_ZeroCostFullRefundNoFee() public {
        _deposit(1 ether);

        uint256 consumerBalanceBefore = consumer.balance;

        vm.expectEmit(true, false, false, true, address(router));
        emit EscrowSettled(REQUEST_ID, 0, 0, 1 ether);

        router.settleEscrow(REQUEST_ID, 0);

        assertEq(router.balances(developer), 0, "no developer credit");
        assertEq(treasury.balance, 0, "no fee");
        assertEq(consumer.balance, consumerBalanceBefore + 1 ether, "full refund");
    }

    function test_RevertWhen_SettleEscrowCostExceedsAmount() public {
        _deposit(1 ether);

        vm.expectRevert(PayGateRouter.CostExceedsEscrow.selector);
        router.settleEscrow(REQUEST_ID, 1.1 ether);
    }

    function test_RevertWhen_SettleEscrowNotOwner() public {
        _deposit(1 ether);

        vm.prank(consumer);
        vm.expectRevert(PayGateRouter.NotOwner.selector);
        router.settleEscrow(REQUEST_ID, 0.5 ether);
    }

    function test_RevertWhen_SettleEscrowTwice() public {
        _deposit(1 ether);

        router.settleEscrow(REQUEST_ID, 0.5 ether);

        vm.expectRevert(PayGateRouter.EscrowNotActive.selector);
        router.settleEscrow(REQUEST_ID, 0.5 ether);
    }

    function test_RefundEscrow_FullRefund() public {
        _deposit(1 ether);

        uint256 consumerBalanceBefore = consumer.balance;

        vm.expectEmit(true, false, false, true, address(router));
        emit EscrowRefunded(REQUEST_ID, 1 ether);

        router.refundEscrow(REQUEST_ID);

        assertEq(consumer.balance, consumerBalanceBefore + 1 ether, "full refund");
        assertEq(address(router).balance, 0);

        (, , , bool active) = router.escrows(REQUEST_ID);
        assertFalse(active, "escrow deactivated");
    }

    function test_RevertWhen_RefundEscrowInactive() public {
        vm.expectRevert(PayGateRouter.EscrowNotActive.selector);
        router.refundEscrow(REQUEST_ID);
    }

    function test_RevertWhen_RefundEscrowNotOwner() public {
        _deposit(1 ether);

        vm.prank(consumer);
        vm.expectRevert(PayGateRouter.NotOwner.selector);
        router.refundEscrow(REQUEST_ID);
    }

    // ------------------------------------------------------------------
    // Escrow: state-before-transfer (checks-effects-interactions)
    // ------------------------------------------------------------------

    function test_SettleEscrow_DeactivatesStateBeforeRefundTransfer() public {
        bytes32 requestId = keccak256("probe-settle");
        EscrowReentrancyProbe probe = new EscrowReentrancyProbe(router, requestId);

        probe.deposit{value: 1 ether}(developer);
        uint256 probeBalanceAfterDeposit = address(probe).balance;

        // Partial settle: 0.4 ether refund flows back to the probe's
        // receive(), which snapshots the escrow state mid-transfer.
        router.settleEscrow(requestId, 0.6 ether);

        assertEq(probe.payoutsReceived(), 1, "refund transfer reached the consumer");
        assertFalse(
            probe.sawActiveDuringPayout(),
            "escrow must already be inactive when the refund transfer executes"
        );
        // The mid-transfer reentry attempts were rejected as non-owner calls.
        assertEq(probe.settleReentryError(), PayGateRouter.NotOwner.selector);
        assertEq(probe.refundReentryError(), PayGateRouter.NotOwner.selector);

        // Accounting is untouched by the reentry attempts.
        assertEq(router.balances(developer), 0.588 ether);
        assertEq(treasury.balance, 0.012 ether);
        assertEq(
            address(probe).balance,
            probeBalanceAfterDeposit + 0.4 ether,
            "exactly one partial refund"
        );
    }

    function test_RefundEscrow_DeactivatesStateBeforeRefundTransfer() public {
        bytes32 requestId = keccak256("probe-refund");
        EscrowReentrancyProbe probe = new EscrowReentrancyProbe(router, requestId);

        probe.deposit{value: 1 ether}(developer);
        uint256 probeBalanceAfterDeposit = address(probe).balance;

        router.refundEscrow(requestId);

        assertEq(probe.payoutsReceived(), 1, "refund transfer reached the consumer");
        assertFalse(
            probe.sawActiveDuringPayout(),
            "escrow must already be inactive when the refund transfer executes"
        );
        assertEq(probe.settleReentryError(), PayGateRouter.NotOwner.selector);
        assertEq(probe.refundReentryError(), PayGateRouter.NotOwner.selector);
        assertEq(
            address(probe).balance,
            probeBalanceAfterDeposit + 1 ether,
            "exactly one full refund, no double payout"
        );
        assertEq(address(router).balance, 0, "router fully drained once");
    }

    function test_SettleEscrow_OwnerCannotReenterEitherSettlementPath() public {
        // The attacker owns its router AND is the consumer, so its reentry
        // attempts pass the onlyOwner gate. They must still fail because the
        // record was deactivated before the refund transfer.
        OwnerReentrantSettler attacker = new OwnerReentrantSettler(treasury);

        uint256 attackerBalanceBefore = address(attacker).balance;
        attacker.depositAndSettleHalf{value: 1 ether}(developer);

        assertEq(attacker.payoutsReceived(), 1, "single refund payout");
        assertEq(
            attacker.settleReentryError(),
            PayGateRouter.EscrowNotActive.selector,
            "owner reentry into settleEscrow blocked by deactivated state"
        );
        assertEq(
            attacker.refundReentryError(),
            PayGateRouter.EscrowNotActive.selector,
            "owner reentry into refundEscrow blocked by deactivated state"
        );

        PayGateRouter attackerRouter = attacker.router();
        // 1 ether deposit, 0.5 settled (2% fee) + 0.5 refunded: nothing extra left.
        assertEq(
            address(attacker).balance,
            attackerBalanceBefore + 0.5 ether,
            "exactly one refund"
        );
        assertEq(attackerRouter.balances(developer), 0.49 ether);
        assertEq(address(attackerRouter).balance, 0.49 ether, "no funds drained beyond the credit");
    }

    // ------------------------------------------------------------------
    // Settlement authorization: only the platform (proxy) wallet
    // ------------------------------------------------------------------

    /// @dev Every party in the flow — consumer, developer, master, agent,
    ///      treasury — is denied on every settlement entrypoint.
    function test_OnlyOwnerCanTriggerSettlements_AllPartiesDenied() public {
        _deposit(1 ether);
        vm.prank(master);
        router.approveAgent{value: 1 ether}(agent, 1 ether);

        address[5] memory intruders = [consumer, developer, master, agent, treasury];

        for (uint256 i = 0; i < intruders.length; i++) {
            vm.startPrank(intruders[i]);

            vm.expectRevert(PayGateRouter.NotOwner.selector);
            router.settleEscrow(REQUEST_ID, 0.1 ether);

            vm.expectRevert(PayGateRouter.NotOwner.selector);
            router.refundEscrow(REQUEST_ID);

            vm.expectRevert(PayGateRouter.NotOwner.selector);
            router.chargeAgent(master, agent, developer, 0.1 ether);

            vm.stopPrank();
        }

        // State is untouched after all denied attempts...
        (, , uint256 amount, bool active) = router.escrows(REQUEST_ID);
        assertTrue(active, "escrow still active");
        assertEq(amount, 1 ether);
        assertEq(router.agentAllowances(master, agent), 1 ether);
        assertEq(router.balances(developer), 0);

        // ...and the owner can still settle normally afterwards.
        router.settleEscrow(REQUEST_ID, 0.5 ether);
        (, , , bool activeAfter) = router.escrows(REQUEST_ID);
        assertFalse(activeAfter, "owner settlement succeeded");
    }

    function testFuzz_OnlyOwnerCanSettle(address caller) public {
        vm.assume(caller != address(this)); // address(this) is the owner

        _deposit(1 ether);

        vm.startPrank(caller);

        vm.expectRevert(PayGateRouter.NotOwner.selector);
        router.settleEscrow(REQUEST_ID, 0.5 ether);

        vm.expectRevert(PayGateRouter.NotOwner.selector);
        router.refundEscrow(REQUEST_ID);

        vm.expectRevert(PayGateRouter.NotOwner.selector);
        router.chargeAgent(master, agent, developer, 1);

        vm.stopPrank();

        (, , , bool active) = router.escrows(REQUEST_ID);
        assertTrue(active, "escrow untouched by unauthorized caller");
    }
}
