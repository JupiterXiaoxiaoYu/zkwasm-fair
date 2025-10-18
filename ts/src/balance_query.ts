import { ethers } from 'ethers';

// ERC20 ABI - only need balanceOf function
const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)"
];

/**
 * Query ERC20 token balance for a given address
 * @param rpcUrl - The EVM chain RPC URL (e.g., Ethereum mainnet, BSC, etc.)
 * @param tokenAddress - The ERC20 token contract address
 * @param holderAddress - The address to query balance for
 * @returns The token balance as bigint (in token's smallest unit, e.g., wei for 18 decimals)
 */
export async function queryERC20Balance(
    rpcUrl: string,
    tokenAddress: string,
    holderAddress: string
): Promise<bigint> {
    try {
        // Create provider (ethers v6)
        const provider = new ethers.JsonRpcProvider(rpcUrl);

        // Create contract instance
        const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

        // Query balance
        const balance = await tokenContract.balanceOf(holderAddress);

        return BigInt(balance.toString());
    } catch (error) {
        throw new Error(`Failed to query ERC20 balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Convert token balance to vote weight (normalized to u64)
 * @param balance - Raw token balance (in smallest unit)
 * @param decimals - Token decimals (e.g., 18 for most ERC20 tokens)
 * @returns Vote weight as u64 (normalized, may need scaling based on your requirements)
 */
export function balanceToVoteWeight(balance: bigint, decimals: number = 18): bigint {
    // Simple approach: convert to whole tokens (divide by 10^decimals)
    // For example: 1.5 tokens with 18 decimals = 1500000000000000000 wei -> 1 vote weight

    const divisor = BigInt(10) ** BigInt(decimals);
    const voteWeight = balance / divisor;

    // Ensure it fits in u64 (max value: 2^64 - 1 = 18446744073709551615)
    const MAX_U64 = BigInt("18446744073709551615");
    if (voteWeight > MAX_U64) {
        throw new Error(`Vote weight ${voteWeight} exceeds u64 max value`);
    }

    return voteWeight;
}

/**
 * Query balance and convert to vote weight in one call
 * @param rpcUrl - The EVM chain RPC URL
 * @param tokenAddress - The ERC20 token contract address
 * @param holderAddress - The address to query balance for
 * @param decimals - Token decimals (default: 18)
 * @returns Vote weight as u64
 */
export async function getVoteWeight(
    rpcUrl: string,
    tokenAddress: string,
    holderAddress: string,
    decimals: number = 18
): Promise<bigint> {
    const balance = await queryERC20Balance(rpcUrl, tokenAddress, holderAddress);
    return balanceToVoteWeight(balance, decimals);
}

// Configuration type for ERC20 settings
export interface ERC20Config {
    rpcUrl: string;
    tokenAddress: string;
    decimals: number;
}

// Default configuration (should be loaded from environment variables)
export const defaultERC20Config: ERC20Config = {
    rpcUrl: process.env.EVM_RPC_URL || "https://bsc-dataseed.binance.org/", // Default to BSC
    tokenAddress: process.env.ERC20_TOKEN_ADDRESS || "0x6952c5408b9822295ba4a7e694d0c5ffdb8fe320", // Replace with actual token
    decimals: parseInt(process.env.ERC20_DECIMALS || "18")
};
