import mongoose from 'mongoose';
import { ObjectEvent } from 'zkwasm-ts-server';

(BigInt.prototype as any).toJSON = function () {
    return BigInt.asUintN(64, this).toString();
};

// With above tojson for bigint we can turn document into json with simple transform that exclude delete
export function docToJSON(doc: mongoose.Document) {
    const obj = doc.toObject({
        transform: (_, ret:any) => {
            delete ret._id;
            return ret;
        }
    });
    return obj;
}

// Topic info constants for IndexedObject
export const TOPIC_INFO = 1;

// Event type constants
export const EVENT_INDEXED_OBJECT = 0;
export const EVENT_VOTE = 1;
export const EVENT_TOPIC_CLOSED = 3;
// EVENT_UNSTAKE (2) removed - votes are permanent

// VoteType enum (matching Rust)
export enum VoteType {
    Unfair = 0,
    Fair = 1,
}

// IndexedObject class like other projects
export class IndexedObject {
    // object index
    index: number;
    // data array
    data: bigint[];

    constructor(index: number, data: bigint[]) {
        this.index = index;
        this.data = data;
    }

    toObject() {
        if (this.index === TOPIC_INFO) {
            return TopicData.fromData(this.data);
        } else {
            console.error("Fatal: unexpected object index:", this.index);
            process.exit();
        }
    }

    toJSON() {
        return JSON.stringify(this.toObject());
    }

    static fromEvent(data: BigUint64Array): IndexedObject {
        // Extract index and data, with topicId as second element for TOPIC_INFO
        const index = Number(data[0]);
        if (index === TOPIC_INFO) {
            // For topic info: [index, topicId, ...topic_data]
            const topicId = data[1];
            const topicData = Array.from(data.slice(2));
            return new IndexedObject(index, [topicId, ...topicData]);
        } else {
            // For other types, use normal format
            return new IndexedObject(index, Array.from(data.slice(1)));
        }
    }

    async storeRelatedObject() {
        let obj = this.toObject() as any;
        if (this.index === TOPIC_INFO) {
            // Store in main TopicModel using IndexedObject pattern
            let doc = await TopicModel.findOneAndUpdate({topicId: obj.topicId}, obj, {upsert: true});
            return doc;
        }
    }
}

// Topic data structure matching Rust backend
export class TopicData {
    topicId?: bigint;
    startTime: bigint;
    endTime: bigint;
    isActive: boolean;
    totalFairVotes: bigint;
    totalUnfairVotes: bigint;
    totalFairVoters: bigint;
    totalUnfairVoters: bigint;

    constructor(data: any) {
        this.startTime = data.startTime || 0n;
        this.endTime = data.endTime || 0n;
        this.isActive = data.isActive !== undefined ? data.isActive : true;
        this.totalFairVotes = data.totalFairVotes || 0n;
        this.totalUnfairVotes = data.totalUnfairVotes || 0n;
        this.totalFairVoters = data.totalFairVoters || 0n;
        this.totalUnfairVoters = data.totalUnfairVoters || 0n;
    }

    static fromData(data: bigint[]): TopicData {
        // Parse the data array according to Rust TopicData::to_data format
        // Event format: [TOPIC_INFO, topic_id, id, start_time, end_time, is_active, ...]
        // After IndexedObject.fromEvent: [topic_id, id, start_time, end_time, is_active, ...]
        let index = 0;
        const topicId = data[index++];      // topic_id from event
        const id = data[index++];            // id from to_data (same as topic_id, skip it)

        const startTime = data[index++];
        const endTime = data[index++];
        const isActive = data[index++] !== 0n;
        const totalFairVotes = data[index++];
        const totalUnfairVotes = data[index++];
        const totalFairVoters = data[index++];
        const totalUnfairVoters = data[index++];

        const topicData = new TopicData({
            startTime,
            endTime,
            isActive,
            totalFairVotes,
            totalUnfairVotes,
            totalFairVoters,
            totalUnfairVoters
        });
        topicData.topicId = topicId;
        return topicData;
    }

    // Helper methods for topic status (time-based)
    isPending(currentCounter: bigint): boolean {
        return currentCounter < this.startTime;
    }

    isActiveByTime(currentCounter: bigint): boolean {
        return currentCounter >= this.startTime && currentCounter < this.endTime;
    }

    isEnded(currentCounter: bigint): boolean {
        return currentCounter >= this.endTime;
    }

    canVote(currentCounter: bigint): boolean {
        return this.isActive && this.isActiveByTime(currentCounter);
    }

    canClose(currentCounter: bigint): boolean {
        return this.isActive && this.isEnded(currentCounter);
    }

    // Get status string for API compatibility
    getStatusString(currentCounter: bigint): string {
        if (this.isPending(currentCounter)) return 'PENDING';
        if (this.isActiveByTime(currentCounter) && this.isActive) return 'ACTIVE';
        if (!this.isActive) return 'CLOSED';
        if (this.isEnded(currentCounter)) return 'ENDED';
        return 'UNKNOWN';
    }

    // Calculate vote percentages
    getVotePercentages(): { fairPercentage: number, unfairPercentage: number } {
        const totalVotes = this.totalFairVotes + this.totalUnfairVotes;
        if (totalVotes === 0n) {
            return { fairPercentage: 50, unfairPercentage: 50 };
        }

        const fairPercentage = Number(this.totalFairVotes * 10000n / totalVotes) / 100;
        const unfairPercentage = 100 - fairPercentage;

        return { fairPercentage, unfairPercentage };
    }

    // Get total votes count
    getTotalVotes(): bigint {
        return this.totalFairVotes + this.totalUnfairVotes;
    }

    // Get total voters count
    getTotalVoters(): bigint {
        return this.totalFairVoters + this.totalUnfairVoters;
    }

    // Check if there's a clear winner (>50%)
    hasClearWinner(): boolean {
        const totalVotes = this.getTotalVotes();
        if (totalVotes === 0n) return false;

        // Check if either side has > 50%
        return this.totalFairVotes * 2n > totalVotes || this.totalUnfairVotes * 2n > totalVotes;
    }

    // Get winning side (if clear winner exists)
    getWinner(): 'FAIR' | 'UNFAIR' | 'TIE' {
        const totalVotes = this.getTotalVotes();
        if (totalVotes === 0n) return 'TIE';

        if (this.totalFairVotes > this.totalUnfairVotes) return 'FAIR';
        if (this.totalUnfairVotes > this.totalFairVotes) return 'UNFAIR';
        return 'TIE';
    }
}

// Topic Object Schema for IndexedObject pattern - main storage
const topicObjectSchema = new mongoose.Schema({
    topicId: { type: BigInt, required: true, unique: true },
    startTime: { type: BigInt, required: true },
    endTime: { type: BigInt, required: true },
    isActive: { type: Boolean, default: true },
    totalFairVotes: { type: BigInt, default: 0n },
    totalUnfairVotes: { type: BigInt, default: 0n },
    totalFairVoters: { type: BigInt, default: 0n },
    totalUnfairVoters: { type: BigInt, default: 0n },
});

topicObjectSchema.pre('init', ObjectEvent.uint64FetchPlugin);

// Vote Event Interface
export interface VoteEvent {
    pid: bigint[];
    topicId: bigint;
    voteType: VoteType;
    voteWeight: bigint;  // Changed from stakeAmount - now represents ERC20 balance
    counter: bigint;
    ethAddress?: string;  // Ethereum address that signed the vote (optional, recorded by TypeScript layer)
}

// Vote Event Schema
const voteEventSchema = new mongoose.Schema<VoteEvent>({
    pid: { type: [BigInt], required: true },
    topicId: { type: BigInt, required: true },
    voteType: { type: Number, required: true }, // 0 = Unfair, 1 = Fair
    voteWeight: { type: BigInt, required: true },
    counter: { type: BigInt, required: true },
    ethAddress: { type: String, required: false }  // Ethereum address (0x...)
});

voteEventSchema.pre('init', ObjectEvent.uint64FetchPlugin);
voteEventSchema.index({ pid: 1 });
voteEventSchema.index({ topicId: 1 });
voteEventSchema.index({ counter: -1 });
voteEventSchema.index({ ethAddress: 1 });  // Index for querying votes by Ethereum address
// Unique index to prevent duplicate vote events (same vote recorded multiple times)
voteEventSchema.index({ pid: 1, topicId: 1, counter: 1 }, { unique: true });


// Player Topic Vote Interface (Single vote per topic model)
export interface PlayerTopicVote {
    pid: bigint[];
    topicId: bigint;
    voteWeight: bigint;   // ERC20 balance at vote time
    voteType: number;     // 1 = Fair, 0 = Unfair (same as Rust VoteType enum)
    voteTime: bigint;     // Counter when voted
    ethAddress?: string;  // Ethereum address that signed the vote
}

// Player Topic Vote Schema
const playerTopicVoteSchema = new mongoose.Schema<PlayerTopicVote>({
    pid: { type: [BigInt], required: true },
    topicId: { type: BigInt, required: true },
    voteWeight: { type: BigInt, default: 0n },
    voteType: { type: Number, required: true },  // 1 = Fair, 0 = Unfair (same as Rust VoteType enum)
    voteTime: { type: BigInt, default: 0n },
    ethAddress: { type: String, required: false }  // Ethereum address (0x...)
});

playerTopicVoteSchema.pre('init', ObjectEvent.uint64FetchPlugin);
playerTopicVoteSchema.index({ pid: 1, topicId: 1 }, { unique: true });

// Main topic model using IndexedObject pattern
export const TopicModel = mongoose.model('Topic', topicObjectSchema);
export const VoteEventModel = mongoose.model('VoteEvent', voteEventSchema);
export const PlayerTopicVoteModel = mongoose.model('PlayerTopicVote', playerTopicVoteSchema);

// Event handling classes

export class VoteEventData {
    data: bigint[];
    constructor(data: bigint[]) {
        this.data = data;
    }

    static fromEvent(data: BigUint64Array): VoteEventData {
        // Vote event format: [pid_0, pid_1, topic_id, vote_type, vote_weight, counter]
        return new VoteEventData(Array.from(data));
    }

    toObject(): VoteEvent {
        // Validate data length
        if (this.data.length < 6) {
            console.error("VoteEvent data length insufficient:", this.data.length, "expected 6, data:", this.data);
            throw new Error(`Invalid VoteEvent data length: ${this.data.length}, expected 6`);
        }

        return {
            pid: [this.data[0], this.data[1]],
            topicId: this.data[2],
            voteType: Number(this.data[3]),
            voteWeight: this.data[4],
            counter: this.data[5],
        };
    }
}


// Global State Interface for tracking all topics
interface GlobalState {
    counter: bigint;
    nextTopicId: bigint;
    totalPlayers: bigint;
}

const globalStateSchema = new mongoose.Schema<GlobalState>({
    counter: { type: BigInt, required: true },
    nextTopicId: { type: BigInt, required: true },
    totalPlayers: { type: BigInt, required: true }
});

globalStateSchema.pre('init', ObjectEvent.uint64FetchPlugin);

export const GlobalStateModel = mongoose.model('GlobalState', globalStateSchema);

// Helper function to convert string to u64 array (for compatibility)
export function stringToU64Array(str: string): bigint[] {
    const bytes = new TextEncoder().encode(str);
    const result: bigint[] = [];

    for (let i = 0; i < bytes.length; i += 8) {
        let value = 0n;
        for (let j = 0; j < 8 && i + j < bytes.length; j++) {
            value |= BigInt(bytes[i + j]) << BigInt(j * 8);
        }
        result.push(value);
    }

    return result;
}

// Helper function to convert u64 array to string
export function u64ArrayToString(u64Array: bigint[]): string {
    let bytes: number[] = [];

    for (const value of u64Array) {
        for (let i = 0; i < 8; i++) {
            const byte = Number((value >> BigInt(i * 8)) & 0xFFn);
            if (byte !== 0) {
                bytes.push(byte);
            } else {
                break;
            }
        }
    }

    return new TextDecoder().decode(new Uint8Array(bytes));
}
