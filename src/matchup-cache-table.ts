import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { MatchupSummary } from './types.js';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

export type MatchupCacheEntry = {
    matchupCacheId: string;
    totalGames: number;
    summary: MatchupSummary;
    sourceRunId: string;
    sourceMatchupId: string;
    updatedAt: string;
};

export async function getMatchupCacheEntry(tableName: string, matchupCacheId: string): Promise<MatchupCacheEntry | undefined> {
    const response = await ddb.send(new GetCommand({
        TableName: tableName,
        Key: { matchupCacheId },
    }));
    return response.Item as MatchupCacheEntry | undefined;
}

export async function putMatchupCacheEntry(tableName: string, entry: MatchupCacheEntry): Promise<void> {
    await ddb.send(new PutCommand({
        TableName: tableName,
        Item: entry,
    }));
}
