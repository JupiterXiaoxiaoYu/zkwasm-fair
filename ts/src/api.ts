import fetch from 'node-fetch';
import { PlayerConvention, ZKWasmAppRpc, createCommand } from "zkwasm-minirollup-rpc";
import { get_server_admin_key } from "zkwasm-ts-server/src/config.js";
import { VoteType } from "./models.js";

export const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";

// Command constants - updated for voting system
const TICK = 0;
const INSTALL_PLAYER = 1;
const WITHDRAW = 2;
const DEPOSIT = 3;
const ADD_MANAGER = 4;
const REMOVE_MANAGER = 5;
const CREATE_TOPIC = 6;
const VOTE = 7;
const UNSTAKE = 8;
const CLOSE_TOPIC = 9;

export class VotingPlayer extends PlayerConvention {
    constructor(key: string, rpc: ZKWasmAppRpc) {
        super(key, rpc, BigInt(DEPOSIT), BigInt(WITHDRAW));
        this.processingKey = key;
        this.rpc = rpc;
    }

    async sendTransactionWithCommand(cmd: BigUint64Array) {
        try {
            let result = await this.rpc.sendTransaction(cmd, this.processingKey);
            return result;
        } catch (e) {
            if (e instanceof Error) {
                console.log(e.message);
            }
            throw e;
        }
    }

    async installPlayer() {
        try {
            let cmd = createCommand(0n, BigInt(INSTALL_PLAYER), []);
            return await this.sendTransactionWithCommand(cmd);
        } catch (e) {
            if (e instanceof Error && e.message === "PlayerAlreadyExists") {
                console.log("Player already exists, skipping installation");
                return null;
            }
            throw e;
        }
    }

    // Create a new voting topic
    async createTopic(duration: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(CREATE_TOPIC), [duration]);
        return await this.sendTransactionWithCommand(cmd);
    }

    // Vote on a topic
    async vote(topicId: bigint, voteType: VoteType, stakeAmount: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(VOTE), [topicId, BigInt(voteType), stakeAmount]);
        return await this.sendTransactionWithCommand(cmd);
    }

    // Unstake from a topic
    async unstake(topicId: bigint, amount: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(UNSTAKE), [topicId, amount]);
        return await this.sendTransactionWithCommand(cmd);
    }

    // Close a topic (manager only)
    async closeTopic(topicId: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(CLOSE_TOPIC), [topicId]);
        return await this.sendTransactionWithCommand(cmd);
    }

    // Add a manager (admin only)
    async addManager(targetPid1: bigint, targetPid2: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(ADD_MANAGER), [targetPid1, targetPid2]);
        return await this.sendTransactionWithCommand(cmd);
    }

    // Remove a manager (admin only)
    async removeManager(targetPid1: bigint, targetPid2: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(REMOVE_MANAGER), [targetPid1, targetPid2]);
        return await this.sendTransactionWithCommand(cmd);
    }

    // Withdraw funds
    async withdrawFunds(amount: bigint, addressHigh: bigint, addressLow: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(WITHDRAW), [0n, amount, addressHigh, addressLow]);
        return await this.sendTransactionWithCommand(cmd);
    }

    // Deposit funds (admin only)
    async depositFunds(amount: bigint, targetPid1: bigint, targetPid2: bigint) {
        let nonce = await this.getNonce();
        let cmd = createCommand(nonce, BigInt(DEPOSIT), [targetPid1, targetPid2, 0n, amount]);
        return await this.sendTransactionWithCommand(cmd);
    }
}

// Updated interfaces for voting system
export interface TopicData {
    topicId: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
    totalFairVotes: string;
    totalUnfairVotes: string;
    totalFairVoters: string;
    totalUnfairVoters: string;
}

export interface VoteEventData {
    pid: string[];
    topicId: string;
    voteType: VoteType;
    stakeAmount: string;
    counter: string;
}

export interface UnstakeEventData {
    pid: string[];
    topicId: string;
    amount: string;
    counter: string;
}

export interface PlayerTopicVoteData {
    pid: string[];
    topicId: string;
    stakedAmount: string;
    fairWeight: string;
    unfairWeight: string;
    firstVoteTime: string;
    lastVoteTime: string;
    lastFairVoteTime: string;
    lastUnfairVoteTime: string;
}

export class VotingAPI {
    private adminKey: any;
    private baseUrl: string;

    constructor(baseUrl: string = API_BASE_URL) {
        this.adminKey = get_server_admin_key();
        this.baseUrl = baseUrl;
    }

    // Get all topics
    async getAllTopics(): Promise<TopicData[]> {
        const response = await fetch(`${this.baseUrl}/data/topics`);
        const result = await response.json() as any;
        if (!result.success) {
            throw new Error(result.message || 'Failed to get topics data');
        }
        return result.data;
    }

    // Get specific topic data
    async getTopic(topicId: string): Promise<TopicData> {
        const response = await fetch(`${this.baseUrl}/data/topic/${topicId}`);
        const result = await response.json() as any;
        if (!result.success) {
            throw new Error(result.message || 'Failed to get topic data');
        }
        return result.data;
    }

    // Get recent vote events for specific topic
    async getTopicRecentVotes(topicId: string): Promise<VoteEventData[]> {
        const response = await fetch(`${this.baseUrl}/data/topic/${topicId}/votes`);
        const result = await response.json() as any;
        if (!result.success) {
            throw new Error(result.message || 'Failed to get topic votes');
        }
        return result.data;
    }

    // Get recent unstake events for specific topic
    async getTopicRecentUnstakes(topicId: string): Promise<UnstakeEventData[]> {
        const response = await fetch(`${this.baseUrl}/data/topic/${topicId}/unstakes`);
        const result = await response.json() as any;
        if (!result.success) {
            throw new Error(result.message || 'Failed to get topic unstakes');
        }
        return result.data;
    }

    // Get player's recent vote events across all topics
    async getPlayerRecentVotes(pid1: string, pid2: string): Promise<VoteEventData[]> {
        const response = await fetch(`${this.baseUrl}/data/player/${pid1}/${pid2}/votes`);
        const result = await response.json() as any;
        if (!result.success) {
            throw new Error(result.message || 'Failed to get player votes');
        }
        return result.data;
    }

    // Get player's topic vote data
    async getPlayerTopicVote(pid1: string, pid2: string, topicId: string): Promise<PlayerTopicVoteData> {
        const response = await fetch(`${this.baseUrl}/data/player/${pid1}/${pid2}/topic/${topicId}`);
        const result = await response.json() as any;
        if (!result.success) {
            throw new Error(result.message || 'Failed to get player topic vote');
        }
        return result.data;
    }

    // Get all player's topic votes
    async getPlayerAllTopicVotes(pid1: string, pid2: string): Promise<PlayerTopicVoteData[]> {
        const response = await fetch(`${this.baseUrl}/data/player/${pid1}/${pid2}/topics`);
        const result = await response.json() as any;
        if (!result.success) {
            throw new Error(result.message || 'Failed to get player topic votes');
        }
        return result.data;
    }

    // Helper: Calculate vote percentages
    calculateVotePercentages(topic: TopicData): { fairPercentage: number, unfairPercentage: number } {
        const totalVotes = BigInt(topic.totalFairVotes) + BigInt(topic.totalUnfairVotes);
        if (totalVotes === 0n) {
            return { fairPercentage: 50, unfairPercentage: 50 };
        }

        const fairPercentage = Number(BigInt(topic.totalFairVotes) * 10000n / totalVotes) / 100;
        const unfairPercentage = 100 - fairPercentage;

        return { fairPercentage, unfairPercentage };
    }

    // Helper: Check if topic is active
    isTopicActive(topic: TopicData, currentCounter: bigint): boolean {
        return topic.isActive &&
               currentCounter >= BigInt(topic.startTime) &&
               currentCounter < BigInt(topic.endTime);
    }

    // Helper: Check if topic has ended
    hasTopicEnded(topic: TopicData, currentCounter: bigint): boolean {
        return currentCounter >= BigInt(topic.endTime);
    }
}

// Transaction builders for voting system
export function buildCreateTopicTransaction(nonce: number, duration: bigint): bigint[] {
    return [BigInt(nonce), BigInt(CREATE_TOPIC), duration];
}

export function buildVoteTransaction(nonce: number, topicId: bigint, voteType: VoteType, stakeAmount: bigint): bigint[] {
    return [BigInt(nonce), BigInt(VOTE), topicId, BigInt(voteType), stakeAmount];
}

export function buildUnstakeTransaction(nonce: number, topicId: bigint, amount: bigint): bigint[] {
    return [BigInt(nonce), BigInt(UNSTAKE), topicId, amount];
}

export function buildCloseTopicTransaction(nonce: number, topicId: bigint): bigint[] {
    return [BigInt(nonce), BigInt(CLOSE_TOPIC), topicId];
}

export function buildAddManagerTransaction(nonce: number, targetPid1: bigint, targetPid2: bigint): bigint[] {
    return [BigInt(nonce), BigInt(ADD_MANAGER), targetPid1, targetPid2];
}

export function buildRemoveManagerTransaction(nonce: number, targetPid1: bigint, targetPid2: bigint): bigint[] {
    return [BigInt(nonce), BigInt(REMOVE_MANAGER), targetPid1, targetPid2];
}

export function buildWithdrawTransaction(
    nonce: number,
    amount: bigint,
    addressHigh: bigint,
    addressLow: bigint
): bigint[] {
    return [BigInt(nonce), BigInt(WITHDRAW), 0n, amount, addressHigh, addressLow];
}

export function buildDepositTransaction(
    nonce: number,
    targetPid1: bigint,
    targetPid2: bigint,
    amount: bigint
): bigint[] {
    return [BigInt(nonce), BigInt(DEPOSIT), targetPid1, targetPid2, 0n, amount];
}

export function buildInstallPlayerTransaction(nonce: number): bigint[] {
    return [BigInt(nonce), BigInt(INSTALL_PLAYER)];
}

export async function exampleUsage() {
    const api = new VotingAPI();

    // Get all topics
    const topics = await api.getAllTopics();
    console.log("All topics:", topics);

    // Get specific topic
    if (topics.length > 0) {
        const topicId = topics[0].topicId;
        const topic = await api.getTopic(topicId);
        console.log("Topic details:", topic);

        // Calculate vote percentages
        const percentages = api.calculateVotePercentages(topic);
        console.log("Vote percentages:", percentages);

        // Get topic votes
        const votes = await api.getTopicRecentVotes(topicId);
        console.log("Topic votes:", votes);
    }
}
