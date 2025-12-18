import axios from 'axios';
import fs from 'fs';

// 配置 API 地址
const API_BASE_URL = 'https://rpc.zkfair.zkwasm.ai';

// 用户统计接口
interface UserStats {
    ethAddress: string;
    proposalCount: number;  // 参与的 proposal 数量
    totalVoteWeight: bigint; // 总投票权重
}

// 投票事件接口
interface VoteEvent {
    pid: string[];
    topicId: string;
    voteType: number;
    voteWeight: string;
    counter: string;
    ethAddress?: string;
}

// Topic 接口
interface Topic {
    topicId: string;
    startTime: string;
    endTime: string;
    isActive: boolean;
    totalFairVotes: string;
    totalUnfairVotes: string;
    totalFairVoters: string;
    totalUnfairVoters: string;
}

/**
 * 获取所有 topics
 */
async function getAllTopics(): Promise<Topic[]> {
    try {
        const response = await axios.get(`${API_BASE_URL}/data/topics`);
        if (response.data.success) {
            return response.data.data;
        }
        throw new Error('Failed to fetch topics');
    } catch (error: any) {
        console.error('Error fetching topics:', error.message);
        throw error;
    }
}

/**
 * 获取特定 topic 的所有投票（包含 ethAddress）
 */
async function getTopicVotes(topicId: string): Promise<VoteEvent[]> {
    const allVotes: VoteEvent[] = [];
    let offset = 0;
    const limit = 1000; // 每次获取 1000 条
    
    while (true) {
        try {
            const response = await axios.get(
                `${API_BASE_URL}/data/topic/${topicId}/votes`,
                {
                    params: {
                        offset,
                        limit,
                        ethAddress: 'true' // 重要：包含以太坊地址
                    }
                }
            );
            
            if (!response.data.success) {
                console.error(`Failed to fetch votes for topic ${topicId}`);
                break;
            }
            
            const votes = response.data.data;
            allVotes.push(...votes);
            
            console.log(`  Fetched ${votes.length} votes (offset: ${offset})`);
            
            // 检查是否还有更多数据
            if (votes.length < limit) {
                break;
            }
            
            offset += limit;
            
            // 添加小延迟避免请求过快
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error: any) {
            console.error(`Error fetching votes for topic ${topicId}:`, error.message);
            break;
        }
    }
    
    return allVotes;
}

/**
 * 聚合用户统计数据
 */
function aggregateUserStats(allVotes: VoteEvent[]): Map<string, UserStats> {
    const statsMap = new Map<string, UserStats>();
    
    for (const vote of allVotes) {
        // 跳过没有 ethAddress 的投票（可能是旧数据）
        if (!vote.ethAddress) {
            continue;
        }
        
        const ethAddress = vote.ethAddress.toLowerCase(); // 统一转小写
        
        if (!statsMap.has(ethAddress)) {
            statsMap.set(ethAddress, {
                ethAddress: vote.ethAddress, // 保留原始大小写
                proposalCount: 0,
                totalVoteWeight: 0n
            });
        }
        
        const stats = statsMap.get(ethAddress)!;
        stats.proposalCount += 1;
        stats.totalVoteWeight += BigInt(vote.voteWeight);
    }
    
    return statsMap;
}

/**
 * 格式化输出表格
 */
function printStatsTable(statsMap: Map<string, UserStats>) {
    // 转换为数组并排序（按总投票权重降序）
    const statsList = Array.from(statsMap.values()).sort((a, b) => {
        if (a.totalVoteWeight > b.totalVoteWeight) return -1;
        if (a.totalVoteWeight < b.totalVoteWeight) return 1;
        return 0;
    });
    
    console.log('\n' + '='.repeat(100));
    console.log('用户投票统计表');
    console.log('='.repeat(100));
    console.log(
        '排名'.padEnd(8) +
        '钱包地址'.padEnd(45) +
        '参与提案数'.padEnd(15) +
        '总投票权重'
    );
    console.log('-'.repeat(100));
    
    statsList.forEach((stats, index) => {
        console.log(
            `${(index + 1).toString().padEnd(8)}` +
            `${stats.ethAddress.padEnd(45)}` +
            `${stats.proposalCount.toString().padEnd(15)}` +
            `${stats.totalVoteWeight.toString()}`
        );
    });
    
    console.log('='.repeat(100));
    console.log(`总用户数: ${statsList.length}`);
    console.log(`总提案参与次数: ${statsList.reduce((sum, s) => sum + s.proposalCount, 0)}`);
    console.log(`总投票权重: ${statsList.reduce((sum, s) => sum + s.totalVoteWeight, 0n).toString()}`);
    console.log('='.repeat(100) + '\n');
}

/**
 * 导出为 CSV 文件
 */
function exportToCSV(statsMap: Map<string, UserStats>, filename: string = 'voter_stats.csv') {
    const statsList = Array.from(statsMap.values()).sort((a, b) => {
        if (a.totalVoteWeight > b.totalVoteWeight) return -1;
        if (a.totalVoteWeight < b.totalVoteWeight) return 1;
        return 0;
    });
    
    const lines: string[] = [];
    lines.push('排名,钱包地址,参与提案数,总投票权重');
    
    statsList.forEach((stats, index) => {
        lines.push(`${index + 1},${stats.ethAddress},${stats.proposalCount},${stats.totalVoteWeight}`);
    });
    
    fs.writeFileSync(filename, lines.join('\n'), 'utf-8');
    console.log(`✅ 统计数据已导出到: ${filename}`);
}

/**
 * 导出为 JSON 文件
 */
function exportToJSON(statsMap: Map<string, UserStats>, filename: string = 'voter_stats.json') {
    const statsList = Array.from(statsMap.values()).sort((a, b) => {
        if (a.totalVoteWeight > b.totalVoteWeight) return -1;
        if (a.totalVoteWeight < b.totalVoteWeight) return 1;
        return 0;
    });
    
    // 转换 BigInt 为 string 以便 JSON 序列化
    const jsonData = statsList.map((stats, index) => ({
        rank: index + 1,
        ethAddress: stats.ethAddress,
        proposalCount: stats.proposalCount,
        totalVoteWeight: stats.totalVoteWeight.toString()
    }));
    
    fs.writeFileSync(filename, JSON.stringify(jsonData, null, 2), 'utf-8');
    console.log(`✅ 统计数据已导出到: ${filename}`);
}

/**
 * 主函数
 */
async function main() {
    console.log(`🔍 开始查询投票统计...`);
    console.log(`📡 API 地址: ${API_BASE_URL}\n`);
    
    try {
        // 1. 获取所有 topics
        console.log('📋 正在获取所有 topics...');
        const topics = await getAllTopics();
        console.log(`✅ 找到 ${topics.length} 个 topics\n`);
        
        // 2. 获取每个 topic 的投票
        console.log('📊 正在获取所有投票数据...');
        const allVotes: VoteEvent[] = [];
        
        for (let i = 0; i < topics.length; i++) {
            const topic = topics[i];
            console.log(`[${i + 1}/${topics.length}] 获取 Topic ${topic.topicId} 的投票...`);
            const votes = await getTopicVotes(topic.topicId);
            console.log(`  ✅ Topic ${topic.topicId}: ${votes.length} 票\n`);
            allVotes.push(...votes);
        }
        
        console.log(`✅ 总共获取 ${allVotes.length} 条投票记录\n`);
        
        // 3. 聚合统计数据
        console.log('📈 正在聚合用户统计数据...');
        const statsMap = aggregateUserStats(allVotes);
        console.log(`✅ 统计完成，找到 ${statsMap.size} 个唯一用户\n`);
        
        // 4. 输出表格
        printStatsTable(statsMap);
        
        // 5. 导出文件
        exportToCSV(statsMap);
        exportToJSON(statsMap);
        
    } catch (error: any) {
        console.error('❌ 查询失败:', error.message);
        process.exit(1);
    }
}

// 运行主函数
main().catch(console.error);

