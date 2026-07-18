export const PAYGATE_ROUTER_ADDRESS = (process.env.NEXT_PUBLIC_PAYGATE_ROUTER ??
  "") as `0x${string}`;

export const paygateRouterAbi = [
  {
    type: "function",
    name: "processPayment",
    stateMutability: "payable",
    inputs: [{ name: "developer", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdrawEarnings",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "balances",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "protocolFeeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "treasuryAddress",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "owner",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function",
    name: "agentAllowances",
    stateMutability: "view",
    inputs: [
      { name: "", type: "address" },
      { name: "", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "escrows",
    stateMutability: "view",
    inputs: [{ name: "", type: "bytes32" }],
    outputs: [
      { name: "developer", type: "address" },
      { name: "consumer", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "active", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "approveAgent",
    stateMutability: "payable",
    inputs: [
      { name: "agent", type: "address" },
      { name: "allowance", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "chargeAgent",
    stateMutability: "nonpayable",
    inputs: [
      { name: "master", type: "address" },
      { name: "agent", type: "address" },
      { name: "developer", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "revokeAgent",
    stateMutability: "nonpayable",
    inputs: [{ name: "agent", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "depositEscrow",
    stateMutability: "payable",
    inputs: [
      { name: "developer", type: "address" },
      { name: "requestId", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settleEscrow",
    stateMutability: "nonpayable",
    inputs: [
      { name: "requestId", type: "bytes32" },
      { name: "actualCost", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "refundEscrow",
    stateMutability: "nonpayable",
    inputs: [{ name: "requestId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "event",
    name: "PaymentProcessed",
    inputs: [
      { name: "developer", type: "address", indexed: true },
      { name: "consumer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EarningsWithdrawn",
    inputs: [
      { name: "developer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentApproved",
    inputs: [
      { name: "master", type: "address", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "allowance", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentCharged",
    inputs: [
      { name: "master", type: "address", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "developer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "AgentRevoked",
    inputs: [
      { name: "master", type: "address", indexed: true },
      { name: "agent", type: "address", indexed: true },
      { name: "refunded", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EscrowDeposited",
    inputs: [
      { name: "requestId", type: "bytes32", indexed: true },
      { name: "developer", type: "address", indexed: true },
      { name: "consumer", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EscrowSettled",
    inputs: [
      { name: "requestId", type: "bytes32", indexed: true },
      { name: "actualCost", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "refunded", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "EscrowRefunded",
    inputs: [
      { name: "requestId", type: "bytes32", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
] as const;
