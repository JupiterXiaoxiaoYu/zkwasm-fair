import { ethers } from 'ethers';

/**
 * Verify Ethereum signature and recover the signer's address
 * @param message - The message that was signed
 * @param signature - The Ethereum signature (hex string starting with 0x)
 * @returns The recovered Ethereum address (checksummed)
 * @throws Error if signature is invalid
 */
export function verifyAndRecoverAddress(message: string, signature: string): string {
    try {
        // Verify signature and recover address (ethers v6)
        const recoveredAddress = ethers.verifyMessage(message, signature);

        // Return checksummed address
        return ethers.getAddress(recoveredAddress);
    } catch (error) {
        throw new Error(`Invalid signature: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Create a standardized message for voting
 * This message format should be used by frontend when signing
 * @param topicId - The topic ID
 * @param voteType - Vote type (1 for Fair, 0 for Unfair)
 * @param timestamp - Unix timestamp in seconds
 * @returns The message to be signed
 */
export function createVoteMessage(topicId: bigint, voteType: number, timestamp: number): string {
    return `Vote on zkFair topic ${topicId} with type ${voteType === 1 ? 'Fair' : 'Unfair'} at ${timestamp}`;
}

/**
 * Verify vote signature and return signer address
 * @param topicId - The topic ID
 * @param voteType - Vote type (1 for Fair, 0 for Unfair)
 * @param timestamp - Unix timestamp in seconds
 * @param signature - The Ethereum signature
 * @returns The recovered Ethereum address
 */
export function verifyVoteSignature(
    topicId: bigint,
    voteType: number,
    timestamp: number,
    signature: string
): string {
    const message = createVoteMessage(topicId, voteType, timestamp);
    return verifyAndRecoverAddress(message, signature);
}
